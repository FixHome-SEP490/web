<script setup lang="ts">
// src/pages/customer/BookingDetailPage.vue
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ClipboardList, ArrowLeft, MapPin, Calendar as CalendarIcon, Clock, CheckCircle2 } from 'lucide-vue-next';
import { BookingMediaViewer, FhButton, FhConfirmDialog, FhDatePicker, FhTimeScrollPicker } from '../../components';
import { bookingsApi, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { bookingSchedule } from '../../utils/booking-schedule';

const route = useRoute();
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
  ? new Date(value).toLocaleString('vi-VN')
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
const preferredDate = ref('');
const preferredTime = ref('');

const editable = computed(() => booking.value && ['SUBMITTED', 'MATCHING', 'MATCHED'].includes(booking.value.status));

const statusLabel = (status?: string) => {
  switch (status) {
    case 'SUBMITTED': return 'Đang tìm thợ phù hợp';
    case 'MATCHING': return 'Đang chờ thợ xác nhận';
    case 'MATCHED': return 'Đã có thợ nhận đơn';
    case 'CANCELLED': return 'Đã huỷ';
    case 'CLOSED': return 'Thợ đã từ chối / hết hạn';
    default: return status || '';
  }
};

const applyBookingDetail = (nextBooking: BookingItem) => {
  applyBookingState(nextBooking);
  startMatchingPoll();
  description.value = nextBooking.description;
  const start = new Date(nextBooking.preferredAt);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  preferredDate.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  preferredTime.value = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
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
  if (!booking.value || saving.value || cancelling.value || showCancelModal.value || showExtensionModal.value || extending.value) return;
  saveError.value = '';
  saving.value = true;
  const wasMatched = booking.value.status === 'MATCHED';
  try {
    const schedule = bookingSchedule(preferredDate.value, preferredTime.value);
    const updated = await bookingsApi.updateBooking(bookingId, {
      description: description.value,
      ...schedule,
    });
    if (wasMatched && updated.status === 'CLOSED') {
      // Original shortlist exhausted for the new time window — send the customer to pick fresh candidates.
      router.push(`/app/bookings/${bookingId}/candidates`);
    } else {
      // Either unchanged (still eligible), or the system auto-activated the next candidate from the
      // original shortlist (status MATCHING) — nothing more for the customer to do right now.
      router.push('/app/orders');
    }
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Không thể lưu thay đổi. Vui lòng thử lại.';
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
  <div class="max-w-2xl mx-auto space-y-6 pb-12">
    <div class="flex items-center justify-between">
      <button
        class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-900 transition-colors"
        @click="router.push('/app/orders')"
      >
        <ArrowLeft :size="14" /> Quay lại danh sách đơn
      </button>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400">
      Đang tải thông tin đơn...
    </div>

    <div
      v-else-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ loadError }}</span>
      <button class="font-semibold underline" type="button" @click="() => loadBooking()">Thử lại</button>
    </div>

    <div v-else-if="booking" class="bg-white rounded-2xl border border-ink-200 p-5 sm:p-6 space-y-5">
      <div class="flex items-center gap-2">
        <ClipboardList class="text-brand-600" :size="20" />
        <h1 class="text-lg font-bold text-ink-900">{{ booking.serviceName }}</h1>
      </div>

      <div class="text-xs text-ink-500 flex items-center gap-1.5">
        <MapPin :size="13" class="shrink-0 text-brand-600" />
        <span>{{ booking.addressSummary }}</span>
      </div>

      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 w-fit">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        <span>{{ statusLabel(booking.status) }}</span>
      </div>

      <p v-if="cancelNotice" data-testid="booking-cancel-notice" role="status" class="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">{{ cancelNotice }}</p>

      <p v-if="extensionNotice" data-testid="matching-extension-notice" role="status" class="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">
        {{ extensionNotice }}
      </p>
      <p v-if="extensionError" data-testid="matching-extension-error" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-800">
        {{ extensionError }}
      </p>

      <div v-if="canExtendMatching" data-testid="matching-extension-card" class="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-3">
        <div class="space-y-1">
          <p class="text-sm font-semibold text-brand-900">Gia hạn thời gian chờ thợ</p>
          <p class="text-xs text-ink-700">
            Các lời mời đang chờ hiện hết hạn lúc {{ formatServerDate(currentInvitationExpiry) }}. Bạn có thể xác nhận một lần gia hạn trong phạm vi khung giờ đã chọn.
          </p>
        </div>
        <FhButton
          data-testid="booking-start-matching-extension"
          variant="primary"
          size="sm"
          :disabled="saving || cancelling || checkingOrderLink || showExtensionModal || extending"
          @click="openMatchingExtension"
        >
          {{ extending ? 'Đang gửi yêu cầu...' : 'Xin gia hạn lượt mời đang chờ' }}
        </FhButton>
      </div>

      <BookingMediaViewer :booking-id="booking.id" :media="bookingMedia" />

      <!-- Only owner-checked GET /bookings/:id supplies the exact ServiceOrder ID. -->
      <div v-if="serviceOrderId" class="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-2">
        <p class="text-xs text-ink-700">Yêu cầu này đã có đơn dịch vụ liên kết.</p>
        <FhButton data-testid="booking-open-service-order" variant="primary" size="sm" @click="openServiceOrder">
          Mở chi tiết đơn dịch vụ
        </FhButton>
      </div>
      <div v-else-if="['SUBMITTED', 'MATCHING', 'MATCHED'].includes(booking.status)" class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
        <p class="text-xs text-ink-700">Chưa nhận được mã đơn dịch vụ từ hệ thống. Bạn có thể kiểm tra lại khi kỹ thuật viên đã nhận đơn.</p>
        <button
          type="button"
          data-testid="booking-refresh-order-link"
          class="text-xs font-semibold text-brand-700 underline disabled:opacity-50"
          :disabled="checkingOrderLink || saving || cancelling || showExtensionModal || extending"
          @click="refreshOrderLink"
        >{{ checkingOrderLink ? 'Đang kiểm tra...' : 'Kiểm tra lại đơn dịch vụ' }}</button>
        <p v-if="orderLinkError" data-testid="booking-link-error" role="alert" class="text-xs text-danger-700">{{ orderLinkError }}</p>
      </div>

      <template v-if="editable">
        <div class="space-y-1.5">
          <label class="block font-bold text-ink-800 text-xs sm:text-sm">Mô tả yêu cầu</label>
          <textarea
            v-model="description"
            rows="3"
            class="w-full p-3.5 bg-ink-50 border border-ink-200 rounded-xl text-xs sm:text-sm text-ink-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all leading-relaxed"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div class="space-y-1.5">
            <label class="block font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
              <CalendarIcon :size="15" class="text-brand-600" />
              <span>Ngày hẹn dịch vụ</span>
            </label>
            <FhDatePicker v-model="preferredDate" />
          </div>

          <div class="space-y-1.5">
            <label class="block font-bold text-ink-800 text-xs sm:text-sm flex items-center gap-1.5">
              <Clock :size="15" class="text-brand-600" />
              <span>Khung giờ mong muốn</span>
            </label>
            <FhTimeScrollPicker v-model="preferredTime" :selected-date="preferredDate" />
          </div>
        </div>

        <p v-if="booking.status === 'MATCHED'" class="text-xs text-ink-500 leading-relaxed">
          Đơn đã có thợ nhận. Nếu khung giờ mới không còn phù hợp với thợ đó, hệ thống sẽ tự huỷ và đưa đơn về bước
          tìm thợ mới.
        </p>

        <div
          v-if="saveError"
          class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
        >
          {{ saveError }}
        </div>

        <FhButton variant="primary" size="md" :loading="saving" :disabled="showCancelModal || showExtensionModal || cancelling || extending" @click="handleSave">
          <CheckCircle2 :size="15" class="mr-1.5" /> Lưu thay đổi
        </FhButton>
      </template>

      <p v-else class="text-xs text-ink-500">
        Đơn ở trạng thái này không thể chỉnh sửa.
      </p>
      <div v-if="canCancelBooking" class="pt-3 border-t border-ink-100 space-y-2">
        <p class="text-xs text-ink-500">Bạn chỉ có thể huỷ yêu cầu chưa có đơn dịch vụ. Nếu kỹ thuật viên đã nhận, hãy mở đơn dịch vụ để xem quy trình huỷ tương ứng.</p>
        <FhButton
          data-testid="booking-start-cancel"
          variant="danger"
          size="sm"
          :disabled="saving || checkingOrderLink || cancelling || showExtensionModal || extending"
          @click="openBookingCancel"
        >Huỷ yêu cầu đặt lịch</FhButton>
      </div>
    </div>
    <FhConfirmDialog
      :open="showCancelModal"
      :loading="cancelling"
      title="Xác nhận huỷ yêu cầu đặt lịch"
      consequence="Yêu cầu chưa có kỹ thuật viên nhận sẽ bị huỷ; các lời mời còn chờ sẽ được hệ thống xử lý. Nếu đã có đơn dịch vụ, bạn cần dùng quy trình huỷ đơn dịch vụ."
      confirm-text="Xác nhận huỷ yêu cầu"
      cancel-text="Giữ yêu cầu"
      @confirm="confirmBookingCancel"
      @cancel="closeBookingCancel"
    >
      <div class="space-y-1.5">
        <label for="booking-cancel-reason" class="block text-xs font-semibold text-ink-700">Lý do huỷ *</label>
        <textarea
          id="booking-cancel-reason"
          v-model="cancelReason"
          data-testid="booking-cancel-reason"
          rows="3"
          maxlength="2000"
          :disabled="cancelling"
          class="w-full rounded-xl border border-ink-200 p-3 text-sm text-ink-900 focus:outline-none focus:border-brand-600"
          placeholder="Cho FixHome biết lý do bạn muốn huỷ yêu cầu"
        ></textarea>
        <p v-if="cancelError" data-testid="booking-cancel-error" role="alert" class="text-xs text-danger-700">{{ cancelError }}</p>
      </div>
    </FhConfirmDialog>
    <FhConfirmDialog
      :open="showExtensionModal"
      :loading="extending"
      :danger="false"
      title="Xác nhận gia hạn thời gian chờ thợ"
      consequence="Bạn xác nhận gia hạn một lần cho các lời mời đang chờ của yêu cầu này. Thời hạn mới do hệ thống xác định trong khung giờ đến đã chọn; không tạo thêm lời mời mới."
      confirm-text="Xác nhận gia hạn"
      cancel-text="Giữ nguyên"
      @confirm="confirmMatchingExtension"
      @cancel="closeMatchingExtension"
    />
  </div>
</template>
