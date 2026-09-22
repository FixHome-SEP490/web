<script setup lang="ts">
// src/pages/customer/BookingDetailPage.vue
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ClipboardList, ArrowLeft, MapPin, Calendar as CalendarIcon, Clock, CheckCircle2 } from 'lucide-vue-next';
import { BookingMediaViewer, FhButton, FhConfirmDialog, FhDatePicker, FhTimeScrollPicker } from '../../components';
import { bookingsApi, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { bookingSchedule } from '../../utils/booking-schedule';

const route = useRoute();
const router = useRouter();
const bookingId = route.params.id as string;

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
// Only owner-authorized Booking details can establish a match or linked ServiceOrder.
// Never poll indefinitely after navigation, race an edit/cancel, or overlap requests.
let matchingTimer: ReturnType<typeof setInterval> | null = null;
let matchingRequestInFlight = false;
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
        checkingOrderLink.value || showCancelModal.value) return;
    matchingRequestInFlight = true;
    try {
      const latest = await bookingsApi.getBooking(bookingId);
      if (detailMounted && !saving.value && !cancelling.value && !showCancelModal.value &&
          !checkingOrderLink.value) {
        booking.value = latest;
        if (!waitingForMatch()) stopMatchingPoll();
      }
    } catch {
      // A failed poll cannot be treated as accepted, expired, or cancelled; retry later.
    } finally {
      matchingRequestInFlight = false;
    }
  }, 5000);
};
onUnmounted(() => { detailMounted = false; stopMatchingPoll(); });
const canCancelBooking = computed(() => !!booking.value && !serviceOrderId.value &&
  ['SUBMITTED', 'MATCHING', 'CLOSED'].includes(booking.value.status));
const showCancelModal = ref(false);
const cancelReason = ref('');
const cancelError = ref('');
const cancelNotice = ref('');
const cancelling = ref(false);

const openBookingCancel = () => {
  if (!canCancelBooking.value || saving.value || cancelling.value || loading.value || checkingOrderLink.value) return;
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
  if (!showCancelModal.value || !canCancelBooking.value || cancelling.value || saving.value || checkingOrderLink.value) return;
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
    booking.value = result;
    stopMatchingPoll();
    finishBookingCancel();
    cancelNotice.value = 'Yêu cầu đã được huỷ.';
  } catch {
    // Network failure or an Accept race: never assume the cancellation succeeded.
    // Re-read the owner-checked Booking before offering any retry or an SO link.
    try {
      const fresh = await bookingsApi.getBooking(bookingId);
      booking.value = fresh;
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
  if (checkingOrderLink.value || loading.value || saving.value || cancelling.value || showCancelModal.value) return;
  checkingOrderLink.value = true;
  orderLinkError.value = '';
  try {
    booking.value = await bookingsApi.getBooking(bookingId);
    if (!waitingForMatch()) stopMatchingPoll();
    else startMatchingPoll();
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

const loadBooking = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const b = await bookingsApi.getBooking(bookingId);
    booking.value = b;
    startMatchingPoll();
    description.value = b.description;
    const start = new Date(b.preferredAt);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    preferredDate.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    preferredTime.value = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  } catch {
    loadError.value = 'Không thể tải thông tin đơn. Vui lòng thử lại.';
  } finally {
    loading.value = false;
  }
};

onMounted(loadBooking);

const handleSave = async () => {
  if (!booking.value || saving.value || cancelling.value || showCancelModal.value) return;
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
      <button class="font-semibold underline" type="button" @click="loadBooking">Thử lại</button>
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
          :disabled="checkingOrderLink || saving || cancelling"
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

        <FhButton variant="primary" size="md" :loading="saving" :disabled="showCancelModal || cancelling" @click="handleSave">
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
          :disabled="saving || checkingOrderLink || cancelling"
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
  </div>
</template>
