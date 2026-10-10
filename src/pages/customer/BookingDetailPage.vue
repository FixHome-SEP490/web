<script setup lang="ts">
// src/pages/customer/BookingDetailPage.vue
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Calendar as CalendarIcon, CheckCircle2, MoreHorizontal } from 'lucide-vue-next';
import { BookingMediaViewer, FhButton, FhConfirmDialog, FhSkeleton } from '../../components';
import BookingSessionPicker from '../../components/customer/BookingSessionPicker.vue';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { bookingsApi, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString, vnDayKey } from '../../utils/vn-time';
import { SLOT_SHORT, sessionDayLabel, sessionLabel, type BookingSlot, type SessionOption } from '../../utils/booking-session';

const route = useRoute();
const showRebook = ref(false);
// Set by "Đặt lại thợ" when the same technician was invited.
const rebookedNotice = computed(() => route.query?.rebooked === 'invited'
  ? 'Đã gửi lời mời cho thợ cũ cho buổi bạn chọn, đang chờ thợ xác nhận.' : '');
const router = useRouter();
let bookingId = String(route.params.id ?? '');
let detailGeneration = 0;

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const booking = ref<BookingItem | null>(null);
const bookingMedia = computed<BookingMedia[]>(() => {
  if (booking.value?.media?.length) return booking.value.media;
  return (booking.value?.mediaUrls ?? []).map((url, index) => ({
    id: `legacy-media-${index}`,
    url,
    isPrivate: false,
    legacyInsecure: true,
    mimeType: 'image/*',
    sizeBytes: null,
  }));
});
const checkingOrderLink = ref(false);
const orderLinkError = ref('');
const serviceOrderId = computed(() => booking.value?.serviceOrderId?.trim() ?? '');
const showExtensionModal = ref(false);
const extending = ref(false);
const extensionError = ref('');
const extensionNotice = ref('');
const extensionCompleted = ref(false);
let extensionRequestToken = 0;
let extendedPendingInvitationIds = new Set<string>();

const isFutureServerTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

const livePendingInvitations = computed(() => {
  const invitations = booking.value?.invitations;
  if (!Array.isArray(invitations)) return [];
  return invitations.filter((invitation) => (
    String(invitation.status).toUpperCase() === 'PENDING'
      && isFutureServerTimestamp(invitation.expiresAt)
  ));
});

const currentInvitationExpiry = computed(() => livePendingInvitations.value
  .map((invitation) => invitation.expiresAt)
  .filter((expiresAt): expiresAt is string => typeof expiresAt === 'string')
  .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null);

const canExtendMatching = computed(() => !!booking.value
  && booking.value.status === 'MATCHING'
  && !serviceOrderId.value
  && isFutureServerTimestamp(booking.value.preferredEndAt)
  && livePendingInvitations.value.length > 0
  && !extensionCompleted.value);

const formatServerDate = (value: string | null | undefined) => value
  ? vnDateTimeString(value)
  : '';

const pendingInvitationIds = (nextBooking: BookingItem | null) => new Set(
  (nextBooking?.invitations ?? [])
    .filter((invitation) => String(invitation.status).toUpperCase() === 'PENDING')
    .map((invitation) => invitation.id),
);

const applyBookingState = (nextBooking: BookingItem) => {
  const seenPendingIds = pendingInvitationIds(nextBooking);
  const hasNewPendingInvitation = extensionCompleted.value
    && extendedPendingInvitationIds.size > 0
    && [...seenPendingIds].some((id) => !extendedPendingInvitationIds.has(id));
  if (hasNewPendingInvitation) {
    // A new invitation ID is the only safe client signal for a new shortlist round.
    // Losing or declining members from the extended group keeps the captured IDs.
    extendedPendingInvitationIds = new Set();
    extensionCompleted.value = false;
    extensionNotice.value = '';
    extensionError.value = '';
  }
  booking.value = nextBooking;
};

// Only owner-authorized Booking details can establish a match or linked ServiceOrder.
// Never poll indefinitely after navigation, race an edit/cancel, or overlap requests.
let matchingTimer: ReturnType<typeof setInterval> | null = null;
let matchingRequestInFlight = false;
let matchingPollGeneration = 0;
const invalidateMatchingPoll = () => { matchingPollGeneration += 1; };
let detailMounted = true;
const waitingForMatch = () => !!booking.value && !serviceOrderId.value &&
  ['MATCHING', 'MATCHED'].includes(booking.value.status);
const stopMatchingPoll = () => {
  if (matchingTimer) clearInterval(matchingTimer);
  matchingTimer = null;
};
const startMatchingPoll = () => {
  if (matchingTimer || !waitingForMatch()) return;
  matchingTimer = setInterval(async () => {
    if (!detailMounted || !waitingForMatch()) { stopMatchingPoll(); return; }
    if (matchingRequestInFlight || loading.value || saving.value || cancelling.value ||
        checkingOrderLink.value || showCancelModal.value || showExtensionModal.value || extending.value) return;
    matchingRequestInFlight = true;
    const polledBookingId = bookingId;
    const pollGeneration = matchingPollGeneration;
    try {
      const latest = await bookingsApi.getBooking(polledBookingId);
      if (detailMounted && polledBookingId === bookingId && pollGeneration === matchingPollGeneration &&
          !saving.value && !cancelling.value && !showCancelModal.value && !checkingOrderLink.value &&
          !showExtensionModal.value && !extending.value) {
        applyBookingState(latest);
        if (!waitingForMatch()) stopMatchingPoll();
      }
    } catch {
      // A failed poll cannot be treated as accepted, expired, or cancelled; retry later.
    } finally {
      matchingRequestInFlight = false;
    }
  }, 5000);
};
onUnmounted(() => {
  detailMounted = false;
  detailGeneration += 1;
  extensionRequestToken += 1;
  invalidateMatchingPoll();
  stopMatchingPoll();
});
const canCancelBooking = computed(() => !!booking.value && !serviceOrderId.value &&
  ['SUBMITTED', 'MATCHING', 'CLOSED'].includes(booking.value.status));
const showCancelModal = ref(false);
const cancelReason = ref('');
const cancelError = ref('');
const cancelNotice = ref('');
const cancelling = ref(false);

const openBookingCancel = () => {
  if (!canCancelBooking.value || saving.value || cancelling.value || loading.value || checkingOrderLink.value || showExtensionModal.value || extending.value) return;
  cancelReason.value = '';
  cancelError.value = '';
  showCancelModal.value = true;
};
const closeBookingCancel = () => {
  if (cancelling.value) return;
  showCancelModal.value = false;
  cancelReason.value = '';
  cancelError.value = '';
};
const finishBookingCancel = () => {
  showCancelModal.value = false;
  cancelReason.value = '';
  cancelError.value = '';
};
const confirmBookingCancel = async () => {
  if (!showCancelModal.value || !canCancelBooking.value || cancelling.value || saving.value || checkingOrderLink.value || showExtensionModal.value || extending.value) return;
  const reason = cancelReason.value.trim();
  if (!reason || reason.length > 2000) {
    cancelError.value = 'Vui lòng nhập lý do huỷ từ 1 đến 2000 ký tự.';
    return;
  }
  cancelling.value = true;
  cancelError.value = '';
  cancelNotice.value = '';
  try {
    const result = await bookingsApi.cancelBooking(bookingId, reason);
    if (result.status !== 'CANCELLED') throw new Error('Unexpected cancellation state');
    applyBookingState(result);
    stopMatchingPoll();
    finishBookingCancel();
    cancelNotice.value = 'Yêu cầu đã được huỷ.';
  } catch {
    // Network failure or an Accept race: never assume the cancellation succeeded.
    // Re-read the owner-checked Booking before offering any retry or an SO link.
    try {
      const fresh = await bookingsApi.getBooking(bookingId);
      applyBookingState(fresh);
      if (fresh.status === 'CANCELLED') {
        finishBookingCancel();
        cancelNotice.value = 'Yêu cầu đã được huỷ theo trạng thái mới nhất.';
        return;
      }
      if (!canCancelBooking.value) {
        finishBookingCancel();
        cancelNotice.value = serviceOrderId.value
          ? 'Kỹ thuật viên đã nhận đơn. Hãy mở đơn dịch vụ để xem hoặc yêu cầu huỷ theo quy trình tương ứng.'
          : 'Trạng thái yêu cầu đã thay đổi. Vui lòng kiểm tra lại trước khi thao tác.';
        return;
      }
    } catch {
      // No verified new state; retain the modal and show a safe retry message.
    }
    cancelError.value = 'Chưa xác nhận được việc huỷ. Vui lòng kiểm tra kết nối và thử lại.';
  } finally {
    cancelling.value = false;
  }
};

const openServiceOrder = () => {
  if (!serviceOrderId.value) return;
  router.push({ name: 'customer-order-detail', params: { id: serviceOrderId.value } });
};

// Refresh the authoritative Booking detail; do not search paged order lists or guess an order ID.
const refreshOrderLink = async () => {
  if (checkingOrderLink.value || loading.value || saving.value || cancelling.value || showCancelModal.value || showExtensionModal.value || extending.value) return;
  checkingOrderLink.value = true;
  orderLinkError.value = '';
  const requestedBookingId = bookingId;
  try {
    const latest = await bookingsApi.getBooking(requestedBookingId);
    if (detailMounted && requestedBookingId === bookingId) {
      applyBookingState(latest);
      if (!waitingForMatch()) stopMatchingPoll();
    }
  } catch {
    orderLinkError.value = 'Không thể kiểm tra liên kết đơn dịch vụ. Vui lòng thử lại.';
  } finally {
    checkingOrderLink.value = false;
  }
};

const description = ref('');

/** Description and the whole booking stay editable until a technician accepts. */
const editable = computed(() => !!booking.value && !serviceOrderId.value &&
  ['SUBMITTED', 'MATCHING'].includes(booking.value.status));

// Rescheduling (PO 08/10/2026): by session, also once a technician holds the
// order and has not set out yet; then only sessions that technician is free for.
const orderStatus = ref('');
const canReschedule = computed(() => !!booking.value && (editable.value ||
  (booking.value.status === 'MATCHED' && !!serviceOrderId.value && orderStatus.value === 'ACCEPTED')));
const sessions = ref<SessionOption[]>([]);
const sessionsLoading = ref(false);
const sessionsError = ref('');
const selectedSession = ref<{ date: string; slot: BookingSlot } | null>(null);
const scheduleNotice = ref('');
// The sessions are checked against the technician only when the customer asks to move.
const showReschedule = ref(false);
const currentSchedule = computed(() => booking.value
  ? sessionLabel({ bookingMode: booking.value.bookingMode, slot: booking.value.slot, start: booking.value.preferredAt })
  : '');

const loadSessions = async () => {
  if (!canReschedule.value) return;
  sessionsLoading.value = true;
  sessionsError.value = '';
  try {
    sessions.value = (await bookingsApi.availableSessions(bookingId)).sessions;
  } catch (err) {
    sessionsError.value = userFacingError(err, 'Chưa tải được các buổi còn trống.');
  } finally {
    sessionsLoading.value = false;
  }
};

// Keeps the last known status while it is read again, so the page does not flicker to "cannot reschedule".
const loadOrderStatus = async () => {
  if (!serviceOrderId.value) {
    orderStatus.value = '';
    return;
  }
  try {
    orderStatus.value = String((await ordersApi.getOrder(serviceOrderId.value)).status).toUpperCase();
  } catch {
    orderStatus.value = '';
  }
};

const openReschedule = () => {
  showReschedule.value = true;
  void loadSessions();
};

const needsShortlist = (item: BookingItem) => !item.serviceOrderId?.trim()
  && ['SUBMITTED', 'CLOSED'].includes(item.status)
  && isFutureServerTimestamp(item.preferredEndAt)
  && Number.isFinite(Date.parse(item.preferredAt))
  && Date.parse(item.preferredAt) < Date.parse(item.preferredEndAt)
  && !(item.invitations ?? []).some(invitation =>
    ['PENDING', 'STANDBY'].includes(String(invitation.status).toUpperCase()));
const canChooseTechnicians = computed(() => !!booking.value && needsShortlist(booking.value));
const chooseTechnicians = () => {
  if (!booking.value || !needsShortlist(booking.value) || loading.value || saving.value ||
      cancelling.value || checkingOrderLink.value || showCancelModal.value || showExtensionModal.value || extending.value) return;
  router.push(`/app/bookings/${bookingId}/candidates`);
};

/** The session to save: the one picked, else the booking's own when only the description changed. */
const sessionForSave = (item: BookingItem): { date: string; slot: BookingSlot } => {
  if (selectedSession.value) return selectedSession.value;
  if (item.slot === 'morning' || item.slot === 'afternoon') return { date: vnDayKey(item.preferredAt), slot: item.slot };
  throw new Error('Vui lòng chọn ngày và buổi (sáng hoặc chiều).');
};

// Rare and destructive actions sit in the "⋯" menu (PO 10/10/2026).
const moreOpen = ref(false);

const statusLabel = (status?: string) => {
  switch (status) {
    case 'SUBMITTED': return 'Đang tìm thợ phù hợp';
    case 'MATCHING': return 'Đang chờ thợ xác nhận';
    case 'MATCHED': return 'Đã có thợ nhận đơn';
    case 'CANCELLED': return 'Đã huỷ';
    case 'CLOSED': return 'Thợ đã từ chối / hết hạn';
    default: return 'Trạng thái chưa xác định';
  }
};

const applyBookingDetail = (nextBooking: BookingItem) => {
  applyBookingState(nextBooking);
  startMatchingPoll();
  description.value = nextBooking.description;
  selectedSession.value = null;
  sessions.value = [];
  showReschedule.value = false;
  void loadOrderStatus();
};

const loadBooking = async (requestedBookingId = bookingId) => {
  const generation = ++detailGeneration;
  loading.value = true;
  loadError.value = '';
  try {
    const nextBooking = await bookingsApi.getBooking(requestedBookingId);
    if (!detailMounted || generation !== detailGeneration || requestedBookingId !== bookingId) return;
    applyBookingDetail(nextBooking);
  } catch {
    if (detailMounted && generation === detailGeneration && requestedBookingId === bookingId) {
      loadError.value = 'Không thể tải thông tin đơn. Vui lòng thử lại.';
    }
  } finally {
    if (detailMounted && generation === detailGeneration && requestedBookingId === bookingId) loading.value = false;
  }
};

onMounted(loadBooking);

watch(() => String(route.params.id ?? ''), (nextBookingId, previousBookingId) => {
  if (!nextBookingId || nextBookingId === previousBookingId) return;
  bookingId = nextBookingId;
  detailGeneration += 1;
  extensionRequestToken += 1;
  invalidateMatchingPoll();
  showExtensionModal.value = false;
  extending.value = false;
  extensionError.value = '';
  extensionNotice.value = '';
  extensionCompleted.value = false;
  extendedPendingInvitationIds = new Set();
  booking.value = null;
  stopMatchingPoll();
  void loadBooking(nextBookingId);
});

const handleSave = async () => {
  if (!booking.value || !canReschedule.value || loading.value || checkingOrderLink.value || saving.value || cancelling.value || showCancelModal.value || showExtensionModal.value || extending.value) return;
  saveError.value = '';
  scheduleNotice.value = '';
  saving.value = true;
  const preAccept = editable.value;
  try {
    const chosen = sessionForSave(booking.value);
    const updated = await bookingsApi.updateBooking(bookingId, {
      ...(preAccept ? { description: description.value } : {}),
      ...chosen,
    });
    if (preAccept && updated.id === bookingId && updated.status === 'SUBMITTED' && needsShortlist(updated)) {
      // The Backend cancelled the old round; the customer must explicitly choose a new shortlist.
      router.push(`/app/bookings/${bookingId}/candidates`);
    } else if (preAccept) {
      router.push('/app/orders');
    } else {
      // The technician keeps the order; only the session moved.
      await loadBooking();
      scheduleNotice.value = `Đã đổi lịch sang ${sessionDayLabel(chosen.date)}, ${SLOT_SHORT[chosen.slot]}. Kỹ thuật viên đã được báo.`;
    }
  } catch (err) {
    saveError.value = userFacingError(err, 'Không thể lưu thay đổi. Vui lòng thử lại.');
    if (!preAccept) void loadSessions();
  } finally {
    saving.value = false;
  }
};

const openMatchingExtension = () => {
  if (!canExtendMatching.value || extending.value || saving.value || cancelling.value || checkingOrderLink.value || showCancelModal.value) return;
  invalidateMatchingPoll();
  extensionError.value = '';
  extensionNotice.value = '';
  showExtensionModal.value = true;
};

const closeMatchingExtension = () => {
  if (extending.value) return;
  showExtensionModal.value = false;
};

const extensionHttpStatus = (reason: unknown): number | null => {
  if (!reason || typeof reason !== 'object') return null;
  const response = (reason as { response?: { status?: unknown } }).response;
  return typeof response?.status === 'number' ? response.status : null;
};

const reconcileAfterExtension = async (requestedBookingId: string, token: number): Promise<boolean> => {
  try {
    const fresh = await bookingsApi.getBooking(requestedBookingId);
    if (!detailMounted || token !== extensionRequestToken || requestedBookingId !== bookingId) return false;
    applyBookingState(fresh);
    if (!waitingForMatch()) stopMatchingPoll();
    else startMatchingPoll();
    return true;
  } catch {
    return false;
  }
};

const confirmMatchingExtension = async () => {
  if (!showExtensionModal.value || !canExtendMatching.value || extending.value || saving.value || cancelling.value || checkingOrderLink.value) return;
  const requestedBookingId = bookingId;
  invalidateMatchingPoll();
  const token = ++extensionRequestToken;
  extending.value = true;
  extensionError.value = '';
  extensionNotice.value = '';
  try {
    const result = await bookingsApi.extendMatching(requestedBookingId);
    if (!detailMounted || token !== extensionRequestToken || requestedBookingId !== bookingId) return;

    extendedPendingInvitationIds = pendingInvitationIds(booking.value);
    extensionCompleted.value = true;
    showExtensionModal.value = false;
    extensionNotice.value = `Đã gia hạn thời gian chờ thợ cho ${result.extendedInvitationCount} lời mời đang chờ đến ${formatServerDate(result.expiresAt)}.`;

    try {
      const fresh = await bookingsApi.getBooking(requestedBookingId);
      if (!detailMounted || token !== extensionRequestToken || requestedBookingId !== bookingId) return;
      applyBookingState(fresh);
      if (!waitingForMatch()) stopMatchingPoll();
      else startMatchingPoll();
    } catch {
      if (detailMounted && token === extensionRequestToken && requestedBookingId === bookingId) {
        extensionError.value = 'Đã xác nhận gia hạn theo phản hồi của hệ thống, nhưng chưa tải lại được trạng thái yêu cầu.';
      }
    }
  } catch (reason) {
    if (!detailMounted || token !== extensionRequestToken || requestedBookingId !== bookingId) return;
    const status = extensionHttpStatus(reason);
    const reconciled = await reconcileAfterExtension(requestedBookingId, token);
    if (!detailMounted || token !== extensionRequestToken || requestedBookingId !== bookingId) return;
    if (reconciled && !canExtendMatching.value) showExtensionModal.value = false;
    extensionCompleted.value = false;
    if (status === 401) {
      extensionError.value = reconciled
        ? 'Phiên đăng nhập không còn hợp lệ. Trạng thái yêu cầu đã được cập nhật; vui lòng đăng nhập lại.'
        : 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại rồi kiểm tra lại yêu cầu.';
    } else if (status === 403) {
      extensionError.value = reconciled
        ? 'Bạn không có quyền gia hạn yêu cầu này. Trạng thái mới nhất đã được tải lại.'
        : 'Bạn không có quyền gia hạn yêu cầu này.';
    } else if ((status === 409 || status === 410) && booking.value?.serviceOrderId) {
      extensionError.value = 'Trạng thái ghép thợ đã thay đổi vì kỹ thuật viên đã nhận đơn. Lượt gia hạn không được thực hiện.';
    } else if (status === 409 || status === 410) {
      extensionError.value = 'Lượt gia hạn không còn khả dụng. Trạng thái yêu cầu đã được tải lại.';
    } else {
      extensionError.value = reconciled
        ? 'Chưa thể xác nhận gia hạn. Trạng thái yêu cầu đã được tải lại; chưa ghi nhận thành công.'
        : 'Chưa thể xác nhận gia hạn do lỗi kết nối. Vui lòng thử lại; chưa ghi nhận thành công.';
    }
  } finally {
    if (detailMounted && token === extensionRequestToken && requestedBookingId === bookingId) extending.value = false;
  }
};
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-5 pb-12">
    <!-- Back, and the destructive action tucked in the "⋯" menu -->
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="whitespace-nowrap inline-flex items-center gap-1.5 h-9 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
        @click="router.push('/app/orders')"
      >
        <ArrowLeft :size="16" /> Đơn của tôi
      </button>

      <div v-if="booking && canCancelBooking" class="relative">
        <button
          type="button"
          class="w-9 h-9 rounded-xl bg-white border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors flex items-center justify-center"
          aria-label="Thao tác khác"
          :aria-expanded="moreOpen"
          data-testid="booking-more"
          @click="moreOpen = !moreOpen"
        >
          <MoreHorizontal :size="18" />
        </button>
        <div v-if="moreOpen" class="fixed inset-0 z-40" @click="moreOpen = false" />
        <div
          v-show="moreOpen"
          role="menu"
          class="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e3) py-1.5 z-50 text-sm"
          @keydown.esc="moreOpen = false"
        >
          <button
            data-testid="booking-start-cancel"
            type="button"
            role="menuitem"
            class="w-full text-left px-4 py-2.5 text-danger-600 hover:bg-danger-50 whitespace-nowrap disabled:opacity-50"
            :disabled="saving || checkingOrderLink || cancelling || showExtensionModal || extending"
            @click="moreOpen = false; openBookingCancel()"
          >Huỷ yêu cầu đặt lịch</button>
        </div>
      </div>
    </div>

    <!-- Loading: the shape of the page -->
    <section v-if="loading" class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 space-y-4" aria-busy="true" aria-label="Đang tải yêu cầu">
      <FhSkeleton width="60%" height="24px" />
      <FhSkeleton width="35%" height="16px" />
      <FhSkeleton height="16px" :count="3" />
    </section>

    <div
      v-else-if="loadError"
      class="bg-white rounded-2xl border border-ink-200 p-6 flex flex-col items-center text-center gap-3"
      role="alert"
    >
      <p class="text-sm text-ink-700">{{ loadError }}</p>
      <FhButton variant="secondary" size="sm" @click="() => loadBooking()">Thử lại</FhButton>
    </div>

    <template v-else-if="booking">
      <!-- What, where, when -->
      <section class="bg-white rounded-2xl border border-ink-200 shadow-(--shadow-e1) p-5 sm:p-6 space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <h1 class="text-xl font-bold text-ink-900 text-balance min-w-0">{{ booking.serviceName }}</h1>
          <span
            class="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium whitespace-nowrap"
            :class="booking.status === 'CANCELLED' ? 'bg-ink-100 text-ink-600' : booking.status === 'MATCHED' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-800'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="booking.status === 'CANCELLED' ? 'bg-ink-400' : booking.status === 'MATCHED' ? 'bg-success-500' : 'bg-warning-500'"></span>
            {{ statusLabel(booking.status) }}
          </span>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-ink-500">Lịch hẹn</dt>
          <dd class="font-medium text-ink-900" data-testid="booking-current-session">{{ currentSchedule }}</dd>
          <dt class="text-ink-500">Địa chỉ</dt>
          <dd class="text-ink-900 text-pretty">{{ booking.addressSummary }}</dd>
        </dl>

        <p v-if="booking.customerNote" class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 text-pretty">Ghi chú cho thợ: {{ booking.customerNote }}</p>

        <p v-if="cancelNotice" data-testid="booking-cancel-notice" role="status" class="rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800">{{ cancelNotice }}</p>
        <p v-if="extensionNotice" data-testid="matching-extension-notice" role="status" class="rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800">
          {{ extensionNotice }}
        </p>
        <p v-if="extensionError" data-testid="matching-extension-error" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
          {{ extensionError }}
        </p>
        <p v-if="scheduleNotice" role="status" data-testid="booking-schedule-notice" class="rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800">{{ scheduleNotice }}</p>
        <p v-if="rebookedNotice" role="status" data-testid="booking-rebooked-notice" class="rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800">{{ rebookedNotice }}</p>

        <!-- The next step for this request: one block, one button -->
        <div v-if="serviceOrderId" class="pt-4 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-ink-700">Kỹ thuật viên đã nhận, đơn sửa chữa đã được tạo.</p>
          <FhButton data-testid="booking-open-service-order" variant="primary" size="sm" @click="openServiceOrder">
            Mở đơn sửa chữa
          </FhButton>
        </div>
        <div v-else-if="canChooseTechnicians" class="pt-4 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-ink-700 text-pretty min-w-0 flex-1">Chọn 2 kỹ thuật viên theo thứ tự ưu tiên để mời lại.</p>
          <FhButton data-testid="booking-choose-technicians" variant="primary" size="sm"
            :disabled="saving || cancelling || checkingOrderLink || showCancelModal || showExtensionModal || extending"
            @click="chooseTechnicians">
            {{ booking.status === 'CLOSED' ? 'Chọn lại kỹ thuật viên' : 'Chọn kỹ thuật viên' }}
          </FhButton>
        </div>
        <div v-else-if="['SUBMITTED', 'MATCHING', 'MATCHED'].includes(booking.status)" class="pt-4 border-t border-ink-100 space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-ink-700">Khi kỹ thuật viên nhận, đơn sửa chữa sẽ hiện ở đây.</p>
            <button
              type="button"
              data-testid="booking-refresh-order-link"
              class="text-sm font-semibold text-brand-700 hover:underline whitespace-nowrap disabled:opacity-50"
              :disabled="checkingOrderLink || saving || cancelling || showExtensionModal || extending"
              @click="refreshOrderLink"
            >{{ checkingOrderLink ? 'Đang kiểm tra…' : 'Kiểm tra lại' }}</button>
          </div>
          <p v-if="orderLinkError" data-testid="booking-link-error" role="alert" class="text-sm text-danger-700">{{ orderLinkError }}</p>
        </div>

        <div v-if="canExtendMatching" data-testid="matching-extension-card" class="pt-4 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-ink-700 text-pretty min-w-0 flex-1">
            Lời mời đang chờ hết hạn lúc <span class="font-num whitespace-nowrap">{{ formatServerDate(currentInvitationExpiry) }}</span>. Bạn được gia hạn một lần.
          </p>
          <FhButton
            data-testid="booking-start-matching-extension"
            variant="secondary"
            size="sm"
            :disabled="saving || cancelling || checkingOrderLink || showExtensionModal || extending"
            @click="openMatchingExtension"
          >
            {{ extending ? 'Đang gửi…' : 'Gia hạn chờ thợ' }}
          </FhButton>
        </div>

        <div v-if="booking.status === 'CANCELLED'" class="pt-4 border-t border-ink-100 flex justify-end">
          <FhButton variant="primary" size="sm" data-testid="booking-rebook" @click="showRebook = true">Đặt lại</FhButton>
        </div>
      </section>

      <BookingMediaViewer :booking-id="booking.id" :media="bookingMedia" />

      <!-- Change the request -->
      <section v-if="canReschedule" class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 space-y-4">
        <div v-if="editable" class="space-y-1.5">
          <label for="booking-description" class="block font-semibold text-ink-800 text-sm">Mô tả yêu cầu</label>
          <textarea
            id="booking-description"
            v-model="description"
            rows="3"
            class="w-full p-3.5 bg-white border border-ink-200 rounded-xl text-base sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600 transition-all leading-relaxed"
          ></textarea>
        </div>

        <FhButton v-if="!showReschedule" variant="secondary" size="sm" data-testid="booking-open-reschedule" @click="openReschedule">
          <CalendarIcon :size="14" /> Đổi buổi hẹn
        </FhButton>
        <div v-else class="space-y-2">
          <p class="font-semibold text-ink-800 text-sm">Đổi sang buổi khác</p>
          <p class="text-sm text-ink-500 text-pretty">
            <template v-if="editable">Đổi buổi trước khi có thợ nhận thì lượt mời cũ bị huỷ, bạn chọn lại thợ cho buổi mới.</template>
            <template v-else>Chỉ chọn được buổi mà kỹ thuật viên của đơn còn trống.</template>
          </p>
          <div v-if="sessionsLoading" aria-busy="true" aria-label="Đang tải các buổi" class="grid grid-cols-4 gap-2">
            <FhSkeleton v-for="i in 4" :key="i" height="56px" rounded="md" />
          </div>
          <div v-else-if="sessionsError" class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-ink-700">{{ sessionsError }}</p>
            <FhButton variant="secondary" size="sm" @click="loadSessions">Thử lại</FhButton>
          </div>
          <BookingSessionPicker v-else v-model="selectedSession" :sessions="sessions" />
        </div>

        <div
          v-if="saveError"
          data-testid="booking-save-error"
          role="alert"
          class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
        >
          {{ saveError }}
        </div>

        <div v-if="editable || showReschedule" class="flex justify-end">
          <FhButton variant="primary" size="md" :loading="saving" :disabled="showCancelModal || showExtensionModal || cancelling || extending || (!editable && !selectedSession)" data-testid="booking-save" @click="handleSave">
            <CheckCircle2 :size="16" /> {{ editable ? 'Lưu thay đổi' : 'Đổi lịch' }}
          </FhButton>
        </div>
      </section>

      <p v-else-if="!['CANCELLED', 'CLOSED'].includes(booking.status)" class="text-sm text-ink-500">
        Đơn ở trạng thái này không thể đổi lịch.
      </p>
    </template>

    <FhConfirmDialog
      :open="showCancelModal"
      :loading="cancelling"
      title="Huỷ yêu cầu đặt lịch?"
      consequence="Lời mời đang chờ sẽ bị huỷ theo. Bạn có thể đặt lại sau."
      confirm-text="Huỷ yêu cầu"
      cancel-text="Giữ yêu cầu"
      @confirm="confirmBookingCancel"
      @cancel="closeBookingCancel"
    >
      <div class="space-y-1.5">
        <label for="booking-cancel-reason" class="block text-sm font-semibold text-ink-700">Lý do huỷ *</label>
        <textarea
          id="booking-cancel-reason"
          v-model="cancelReason"
          data-testid="booking-cancel-reason"
          rows="3"
          maxlength="2000"
          :disabled="cancelling"
          class="w-full rounded-xl border border-ink-200 p-3 text-base sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600"
          placeholder="Cho FixHome biết lý do bạn muốn huỷ"
        ></textarea>
        <p v-if="cancelError" data-testid="booking-cancel-error" role="alert" class="text-sm text-danger-700">{{ cancelError }}</p>
      </div>
    </FhConfirmDialog>
    <FhConfirmDialog
      :open="showExtensionModal"
      :loading="extending"
      :danger="false"
      title="Gia hạn thời gian chờ thợ?"
      consequence="Lời mời đang chờ được thêm thời gian trong khung giờ bạn đã chọn. Không có lời mời mới, và chỉ gia hạn được một lần."
      confirm-text="Gia hạn"
      cancel-text="Giữ nguyên"
      @confirm="confirmMatchingExtension"
      @cancel="closeMatchingExtension"
    />
    <RebookDialog
      v-if="booking && showRebook"
      :open="showRebook"
      :booking-id="booking.id"
      :service-name="booking.serviceName"
      @close="showRebook = false"
    />
  </div>
</template>
