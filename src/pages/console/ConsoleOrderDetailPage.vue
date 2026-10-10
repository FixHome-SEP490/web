<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  FhCard,
  FhSkeleton,
  FhStatusPill,
  FhMoney,
  FhTimeline,
  BookingMediaViewer,
  type TimelineStep,
} from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { orderStatusLabel, paymentStatusLabel, roleLabel } from '../../components/console/console-labels';
import { consoleOrderContextApi, type ConsoleOrderContext } from '../../api/console-order-context.api';
import { bookingsApi, isFullBookingWithMedia, type BookingItem, type BookingMedia } from '../../api/bookings.api';
import { useAuthStore } from '../../stores/auth';
import { vnDateTimeString } from '../../utils/vn-time';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isServiceManager = computed(() => authStore.userRole === 'SERVICE_MANAGER');
const isStaffMediaViewerAllowed = computed(() => ['ADMIN', 'SERVICE_MANAGER'].includes(String(authStore.userRole ?? '').toUpperCase()));
let orderId = String(route.params.id ?? '');
let loadGeneration = 0;
let disposed = false;

const loading = ref(true);
const loadError = ref(false);
const order = ref<ConsoleOrderContext | null>(null);
const bookingForMedia = ref<(BookingItem & { media: BookingMedia[] }) | null>(null);
const bookingMedia = computed(() => bookingForMedia.value?.media ?? []);
const bookingMediaBookingId = computed(() => bookingForMedia.value?.id ?? '');

const loadOrder = async (requestedOrderId = orderId) => {
  const generation = ++loadGeneration;
  const requestedRole = String(authStore.userRole ?? '').toUpperCase();
  const isCurrent = () => !disposed
    && generation === loadGeneration
    && requestedOrderId === orderId
    && requestedRole === String(authStore.userRole ?? '').toUpperCase();
  loading.value = true;
  loadError.value = false;
  bookingForMedia.value = null;
  try {
    // Real API only: validation/network failures surface as an error state.
    // This page never falls back to local or mock order data.
    const nextOrder = await consoleOrderContextApi.getConsoleOrderContext(requestedOrderId);
    if (!isCurrent()) return;
    order.value = nextOrder;

    const bookingId = typeof nextOrder.bookingId === 'string' ? nextOrder.bookingId.trim() : '';
    if (isStaffMediaViewerAllowed.value && bookingId) {
      try {
        const booking = await bookingsApi.getBooking(bookingId);
        if (isCurrent() && isFullBookingWithMedia(booking, bookingId)) {
          bookingForMedia.value = booking;
        }
      } catch {
        if (isCurrent()) bookingForMedia.value = null;
      }
    }
  } catch {
    if (!isCurrent()) return;
    order.value = null;
    // A failed load shows one plain sentence, never the server's message.
    loadError.value = true;
  } finally {
    if (isCurrent()) loading.value = false;
  }
};

onMounted(() => {
  disposed = false;
  void loadOrder();
});

watch(() => String(route.params.id ?? ''), (nextId, previousId) => {
  if (!nextId || nextId === previousId) return;
  orderId = nextId;
  bookingForMedia.value = null;
  void loadOrder(nextId);
});

watch(() => String(authStore.userRole ?? '').toUpperCase(), (nextRole, previousRole) => {
  if (nextRole === previousRole) return;
  bookingForMedia.value = null;
  void loadOrder(orderId);
});

onUnmounted(() => {
  disposed = true;
  loadGeneration += 1;
  bookingForMedia.value = null;
});

// Render only the timeline entries actually returned by the Backend API.
// No locally invented states or progression — an empty timeline is shown honestly.
const paymentTone = computed(() => {
  const status = String(order.value?.paymentStatus ?? '').toUpperCase();
  return status === 'PAID' ? 'COMPLETED' : status === 'REFUNDED' ? 'CANCELLED' : 'PENDING';
});

const timelineSteps = computed<TimelineStep[]>(() => {
  const entries = order.value?.timeline ?? [];
  return entries.map((entry, index) => ({
    key: `${entry.status}-${index}`,
    label: entry.title || orderStatusLabel(entry.status),
    timestamp: entry.timestamp ? vnDateTimeString(entry.timestamp) : undefined,
    actor: entry.actor ? roleLabel(entry.actor) : undefined,
    completed: index < entries.length - 1,
    current: index === entries.length - 1,
  }));
});
</script>

<template>
  <!-- Trang chỉ đọc: chuyển trạng thái, đổi thợ hay huỷ đơn đi qua Yêu cầu hỗ trợ hoặc Huỷ đơn. -->
  <div class="mx-auto max-w-5xl space-y-6 pb-12">
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <FhSkeleton height="14px" width="120px" />
      <FhSkeleton height="28px" width="260px" />
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="space-y-3 rounded-[var(--radius-md)] border border-ink-200 bg-white p-5 lg:col-span-2">
          <FhSkeleton height="16px" :count="5" />
        </div>
        <div class="space-y-3 rounded-[var(--radius-md)] border border-ink-200 bg-white p-5">
          <FhSkeleton height="16px" :count="4" />
        </div>
      </div>
    </div>

    <template v-else-if="loadError">
      <ConsolePageHeader title="Chi tiết đơn sửa chữa" back-to="/console/orders" back-label="Đơn sửa chữa" />
      <ConsoleLoadError @retry="() => loadOrder()" />
    </template>

    <template v-else-if="order">
      <ConsolePageHeader :title="order.code" back-to="/console/orders" back-label="Đơn sửa chữa">
        <template #badges>
          <FhStatusPill :status="order.status" class="whitespace-nowrap" />
          <FhStatusPill :status="paymentTone" :label="paymentStatusLabel(order.paymentStatus)" class="whitespace-nowrap" />
        </template>
        <template v-if="isServiceManager" #actions>
          <ConsoleMoreMenu>
            <ConsoleMenuItem @click="router.push('/console/support')">Mở yêu cầu hỗ trợ</ConsoleMenuItem>
            <ConsoleMenuItem @click="router.push('/console/cancellations')">Xem huỷ đơn</ConsoleMenuItem>
          </ConsoleMoreMenu>
        </template>
      </ConsolePageHeader>

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
          <FhCard title="Lịch sử trạng thái">
            <FhTimeline v-if="timelineSteps.length > 0" :steps="timelineSteps" />
            <p v-else class="text-sm text-ink-500">Chưa có lịch sử trạng thái.</p>
          </FhCard>

          <BookingMediaViewer
            v-if="bookingForMedia && bookingMedia.length > 0"
            :booking-id="bookingMediaBookingId"
            :media="bookingMedia"
          />
        </div>

        <div class="space-y-6">
          <FhCard title="Lịch hẹn">
            <dl class="space-y-3 text-sm">
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-ink-500">Hẹn</dt>
                <dd class="whitespace-nowrap font-num text-ink-900">{{ order.scheduledAt ? vnDateTimeString(order.scheduledAt) : '—' }}</dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-ink-500">Tạo lúc</dt>
                <dd class="whitespace-nowrap font-num text-ink-900">{{ order.createdAt ? vnDateTimeString(order.createdAt) : '—' }}</dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-ink-500">Cập nhật</dt>
                <dd class="whitespace-nowrap font-num text-ink-900">{{ order.updatedAt ? vnDateTimeString(order.updatedAt) : '—' }}</dd>
              </div>
            </dl>
          </FhCard>

          <FhCard title="Chi phí">
            <dl class="space-y-3 text-sm">
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-ink-500">Tiền công</dt>
                <dd><FhMoney :amount="order.laborTotal" /></dd>
              </div>
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-ink-500">Linh kiện</dt>
                <dd><FhMoney :amount="order.partsTotal" /></dd>
              </div>
              <div class="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-3">
                <dt class="font-medium text-ink-900">Tổng</dt>
                <dd><FhMoney :amount="order.grandTotal" emphasis /></dd>
              </div>
            </dl>
          </FhCard>
        </div>
      </div>
    </template>
  </div>
</template>
