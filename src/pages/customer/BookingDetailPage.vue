<script setup lang="ts">
// src/pages/customer/BookingDetailPage.vue
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ClipboardList, ArrowLeft, MapPin, Calendar as CalendarIcon, Clock, CheckCircle2 } from 'lucide-vue-next';
import { FhButton, FhDatePicker, FhTimeScrollPicker } from '../../components';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { bookingSchedule } from '../../utils/booking-schedule';

const route = useRoute();
const router = useRouter();
const bookingId = route.params.id as string;

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const booking = ref<BookingItem | null>(null);
const checkingOrderLink = ref(false);
const orderLinkError = ref('');
const serviceOrderId = computed(() => booking.value?.serviceOrderId?.trim() ?? '');

const openServiceOrder = () => {
  if (!serviceOrderId.value) return;
  router.push({ name: 'customer-order-detail', params: { id: serviceOrderId.value } });
};

// Refresh the authoritative Booking detail; do not search paged order lists or guess an order ID.
const refreshOrderLink = async () => {
  if (checkingOrderLink.value || loading.value || saving.value) return;
  checkingOrderLink.value = true;
  orderLinkError.value = '';
  try {
    booking.value = await bookingsApi.getBooking(bookingId);
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
  if (!booking.value) return;
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
          :disabled="checkingOrderLink || saving"
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

        <FhButton variant="primary" size="md" :loading="saving" @click="handleSave">
          <CheckCircle2 :size="15" class="mr-1.5" /> Lưu thay đổi
        </FhButton>
      </template>

      <p v-else class="text-xs text-ink-500">
        Đơn ở trạng thái này không thể chỉnh sửa.
      </p>
    </div>
  </div>
</template>
