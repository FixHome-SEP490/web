<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  MapPin,
  ChevronRight,
  Search,
  MessageSquare,
  Receipt,
  AlertCircle,
  RefreshCw,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhSkeleton,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { useChatStore } from '../../stores/chat.store';
import { vnDateString } from '../../utils/vn-time';
import { formatRating } from '../../utils/formatters';

const PAGE_SIZE = 20;

const router = useRouter();
const chatStore = useChatStore();

// ── Loading / error state ──
const loadingOrders = ref(true);
const loadingBookings = ref(true);
const ordersError = ref<string | null>(null);
const bookingsError = ref<string | null>(null);

// ── Data ──
const orders = ref<ServiceOrderItem[]>([]);
const bookings = ref<BookingItem[]>([]);

// ── Pagination state ──
const ordersPage = ref(1);
const bookingsPage = ref(1);
const ordersTotal = ref(0);
const bookingsTotal = ref(0);
const ordersExhausted = ref(false);
const bookingsExhausted = ref(false);
const ordersFailedPage = ref<number | null>(null);
const bookingsFailedPage = ref<number | null>(null);
const fetchingMoreOrders = ref(false);
const fetchingMoreBookings = ref(false);

// ── UI state ──
const activeTab = ref<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('ALL');
// "Đặt lại thợ" from a completed or cancelled order, or a booking cancelled before any technician accepted.
const rebookFor = ref<{ bookingId: string; serviceName?: string } | null>(null);
const canRebookOrder = (order: ServiceOrderItem) => ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase());
const searchQuery = ref('');

// ── Computed ──
// Show verified records as soon as either source completes.
const loading = computed(() => loadingOrders.value && loadingBookings.value);
// hasError used in template for partial-failure banner
const hasError = computed(() => !!(ordersError.value || bookingsError.value));

/** Booking IDs that are already represented by a loaded ServiceOrder */
const orderedBookingIds = computed(() => new Set(orders.value.map((o) => o.bookingId)));

/**
 * Bookings to display as standalone cards (not yet covered by a loaded SO).
 * Includes CANCELLED and CLOSED (pre-Accept cancels).
 * MATCHED bookings whose SO is not yet loaded (cross-page) remain visible here
 * so the user does not lose sight of them — labelled "Đang chờ liên kết đơn thợ".
 */
const pendingBookings = computed(() =>
  bookings.value.filter(
    (b) =>
      ['SUBMITTED', 'MATCHING', 'MATCHED', 'CLOSED', 'CANCELLED'].includes(b.status) &&
      !orderedBookingIds.value.has(b.id),
  ),
);

// Raw server page progress controls pagination: dedup may remove all overlapping rows,
// but this does not imply that later server pages contain no new records.
const hasMoreOrders = computed(() => !ordersExhausted.value && ordersPage.value * PAGE_SIZE < ordersTotal.value);
const hasMoreBookings = computed(() => !bookingsExhausted.value && bookingsPage.value * PAGE_SIZE < bookingsTotal.value);

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const unique = new Map(current.map((item) => [item.id, item] as const));
  for (const item of incoming) unique.set(item.id, item);
  return [...unique.values()];
}

/**
 * Loaded distinct record count — truthful count of what is actually on screen.
 * We do NOT sum ordersTotal + bookingsTotal as that overcounts when a Booking
 * and its linked SO represent the same request. Cross-page SO matches are unknown
 * until fully loaded, so we only count loaded distinct items.
 */
const loadedCount = computed(() => orders.value.length + pendingBookings.value.length);

const isOverdue = (booking: BookingItem) =>
  !!booking.preferredEndAt && new Date(booking.preferredEndAt) < new Date();

const pendingLabel = (booking: BookingItem) => {
  if (booking.status === 'CANCELLED') return 'Đã huỷ trước khi có thợ';
  if (booking.status === 'MATCHED') return 'Đang chờ liên kết đơn thợ';
  if (isOverdue(booking)) return 'Quá hạn, đang chờ hỗ trợ';
  if (booking.status === 'MATCHING') return 'Đang chờ thợ xác nhận';
  if (booking.status === 'CLOSED') return 'Chưa tìm được thợ, chờ hỗ trợ';
  return 'Đang tìm thợ phù hợp';
};

// ── Fetch functions — return true on success, false on failure ──

async function fetchOrders(page: number): Promise<boolean> {
  try {
    const result = await ordersApi.getCustomerOrdersPaged(page, PAGE_SIZE);
    orders.value = mergeById(page === 1 ? [] : orders.value, result.data);
    ordersTotal.value = result.total;
    ordersExhausted.value = result.data.length === 0;
    ordersFailedPage.value = null;
    ordersError.value = null;
    return true;
  } catch {
    ordersFailedPage.value = page;
    ordersError.value = 'Không thể tải danh sách đơn dịch vụ. Vui lòng thử lại.';
    return false;
  }
}

async function fetchBookings(page: number): Promise<boolean> {
  try {
    const result = await bookingsApi.getMyBookingsPaged(page, PAGE_SIZE);
    bookings.value = mergeById(page === 1 ? [] : bookings.value, result.data);
    bookingsTotal.value = result.total;
    bookingsExhausted.value = result.data.length === 0;
    bookingsFailedPage.value = null;
    bookingsError.value = null;
    return true;
  } catch {
    bookingsFailedPage.value = page;
    bookingsError.value = 'Không thể tải danh sách yêu cầu đặt thợ. Vui lòng thử lại.';
    return false;
  }
}

onMounted(async () => {
  loadingOrders.value = true;
  loadingBookings.value = true;
  await Promise.all([
    fetchOrders(1).finally(() => { loadingOrders.value = false; }),
    fetchBookings(1).finally(() => { loadingBookings.value = false; }),
  ]);
});

async function loadMoreOrders() {
  if (loadingOrders.value || fetchingMoreOrders.value || !hasMoreOrders.value) return;
  fetchingMoreOrders.value = true;
  try {
    const next = ordersPage.value + 1;
    const ok = await fetchOrders(next);
    // Advance page counter ONLY on success; on failure, retry repeats same page safely
    if (ok) ordersPage.value = next;
  } finally {
    fetchingMoreOrders.value = false;
  }
}

async function loadMoreBookings() {
  if (loadingBookings.value || fetchingMoreBookings.value || !hasMoreBookings.value) return;
  fetchingMoreBookings.value = true;
  try {
    const next = bookingsPage.value + 1;
    const ok = await fetchBookings(next);
    if (ok) bookingsPage.value = next;
  } finally {
    fetchingMoreBookings.value = false;
  }
}

async function retryOrders() {
  if (loadingOrders.value || fetchingMoreOrders.value) return;
  const page = ordersFailedPage.value ?? 1;
  if (page === 1) loadingOrders.value = true;
  else fetchingMoreOrders.value = true;
  try {
    const ok = await fetchOrders(page);
    if (ok) ordersPage.value = page;
  } finally {
    if (page === 1) loadingOrders.value = false;
    else fetchingMoreOrders.value = false;
  }
}

async function retryBookings() {
  if (loadingBookings.value || fetchingMoreBookings.value) return;
  const page = bookingsFailedPage.value ?? 1;
  if (page === 1) loadingBookings.value = true;
  else fetchingMoreBookings.value = true;
  try {
    const ok = await fetchBookings(page);
    if (ok) bookingsPage.value = page;
  } finally {
    if (page === 1) loadingBookings.value = false;
    else fetchingMoreBookings.value = false;
  }
}

// ── Filtering ──

const getStatusBadge = (status: string) => {
  const s = String(status).toUpperCase();
  switch (s) {
    case 'EN_ROUTE':
      return { label: 'Đang di chuyển', bg: 'bg-warning-50', text: 'text-warning-800', dot: 'bg-warning-500' };
    case 'UNDER_REPAIR':
    case 'IN_PROGRESS':
      return { label: 'Đang sửa chữa', bg: 'bg-brand-50', text: 'text-brand-700', dot: 'bg-brand-600' };
    case 'ACCEPTED':
      return { label: 'Đã nhận đơn', bg: 'bg-brand-50', text: 'text-brand-700', dot: 'bg-brand-600' };
    case 'COMPLETED':
      return { label: 'Hoàn thành', bg: 'bg-success-50', text: 'text-success-700', dot: 'bg-success-500' };
    case 'CANCELLED':
      return { label: 'Đã hủy', bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400' };
    default:
      return { label: 'Trạng thái chưa xác định', bg: 'bg-ink-100', text: 'text-ink-600', dot: 'bg-ink-400' };
  }
};

const filteredOrders = computed(() => {
  let list = orders.value;

  if (activeTab.value === 'IN_PROGRESS') {
    list = list.filter((o) =>
      ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(o.status).toUpperCase()),
    );
  } else if (activeTab.value === 'COMPLETED') {
    list = list.filter((o) => String(o.status).toUpperCase() === 'COMPLETED');
  } else if (activeTab.value === 'CANCELLED') {
    list = list.filter((o) => String(o.status).toUpperCase() === 'CANCELLED');
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((o) => {
      const codeMatch = o.code?.toLowerCase().includes(q);
      const srvMatch = o.serviceName?.toLowerCase().includes(q);
      const techMatch = o.technician?.fullName?.toLowerCase().includes(q);
      return codeMatch || srvMatch || techMatch;
    });
  }

  return list;
});

const visiblePending = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  let subset: typeof pendingBookings.value;

  if (activeTab.value === 'ALL') {
    // ALL: every booking status is visible
    subset = pendingBookings.value;
  } else if (activeTab.value === 'IN_PROGRESS') {
    // IN_PROGRESS: actionable pending only (not CANCELLED, not CLOSED)
    subset = pendingBookings.value.filter((b) => !['CANCELLED', 'CLOSED'].includes(b.status));
  } else if (activeTab.value === 'CANCELLED') {
    // CANCELLED tab: only pre-SO cancelled bookings
    subset = pendingBookings.value.filter((b) => b.status === 'CANCELLED');
  } else {
    // COMPLETED or any other tab: no pending booking cards
    return [];
  }

  if (!q) return subset;
  return subset.filter((b) => b.serviceName?.toLowerCase().includes(q));
});

async function handleChat(order: ServiceOrderItem, event: Event) {
  event.stopPropagation();
  const bookingId = (order as unknown as { bookingId?: string }).bookingId || order.id;
  const conv = await chatStore.openConversationForBooking(bookingId);
  if (!conv) {
    const found = chatStore.conversations.find((c) => c.counterpart.id === order.technician?.id);
    if (found) {
      await chatStore.selectConversation(found.id);
      chatStore.toggleWidget(true);
    } else {
      chatStore.toggleWidget(true);
    }
  }
}
</script>

<template>
  <div class="space-y-5 max-w-4xl mx-auto pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Đơn của tôi</h1>

    <!-- Search -->
    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Tìm theo mã đơn, dịch vụ, kỹ thuật viên…"
        aria-label="Tìm đơn"
        class="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-ink-200 text-base sm:text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
      />
    </div>

    <!-- Segment tabs -->
    <div class="grid grid-cols-4 gap-1 p-1 bg-white rounded-2xl border border-ink-200 text-sm font-medium" role="tablist">
      <button
        v-for="tab in [
          { key: 'ALL', label: `Tất cả (${loadedCount})` },
          { key: 'IN_PROGRESS', label: 'Đang xử lý' },
          { key: 'COMPLETED', label: 'Hoàn tất' },
          { key: 'CANCELLED', label: 'Đã huỷ' },
        ]"
        :key="tab.key"
        :data-testid="`history-tab-${tab.key}`"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="h-10 px-2 rounded-xl transition-colors text-center whitespace-nowrap"
        :class="activeTab === tab.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-50'"
        @click="activeTab = (tab.key as 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED')"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Partial-failure banners (one per source, with retry) -->
    <div v-if="!loading && hasError" class="space-y-2">
      <div
        v-if="ordersError"
        data-testid="orders-error-banner"
        class="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <AlertCircle :size="16" class="shrink-0" />
          {{ ordersError }}
        </span>
        <button
          type="button"
          class="flex items-center gap-1 font-semibold hover:underline shrink-0 whitespace-nowrap"
          data-testid="retry-orders"
          :disabled="loadingOrders || fetchingMoreOrders"
          @click="retryOrders"
        >
          <RefreshCw :size="14" /> Thử lại
        </button>
      </div>
      <div
        v-if="bookingsError"
        data-testid="bookings-error-banner"
        class="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700"
      >
        <span class="flex items-center gap-1.5 min-w-0">
          <AlertCircle :size="16" class="shrink-0" />
          {{ bookingsError }}
        </span>
        <button
          type="button"
          class="flex items-center gap-1 font-semibold hover:underline shrink-0 whitespace-nowrap"
          data-testid="retry-bookings"
          :disabled="loadingBookings || fetchingMoreBookings"
          @click="retryBookings"
        >
          <RefreshCw :size="14" /> Thử lại
        </button>
      </div>
    </div>

    <!-- Loading: rows like the list -->
    <div v-if="loading" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải đơn">
      <div v-for="i in 4" :key="i" class="px-5 py-4 space-y-2">
        <FhSkeleton width="55%" height="18px" />
        <FhSkeleton width="35%" height="14px" />
      </div>
    </div>

    <!-- Empty (only when no error AND no data) -->
    <div
      v-else-if="!hasError && !loadingOrders && !loadingBookings && !hasMoreOrders && !hasMoreBookings && filteredOrders.length === 0 && visiblePending.length === 0"
      data-testid="history-empty-state"
      class="text-center bg-white rounded-2xl border border-ink-200 px-6 py-12 space-y-2"
    >
      <div class="w-12 h-12 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-3">
        <Receipt :size="24" />
      </div>
      <h2 class="text-base font-semibold text-ink-900">
        {{ searchQuery ? 'Không có đơn phù hợp' : 'Bạn chưa có đơn sửa chữa' }}
      </h2>
      <p class="text-sm text-ink-500 max-w-sm mx-auto text-pretty">
        {{ searchQuery ? 'Thử từ khoá khác.' : 'Đặt thợ để kỹ thuật viên FixHome tới kiểm tra tại nhà bạn.' }}
      </p>
    </div>

    <div v-else class="space-y-5">
      <div v-if="loadingOrders || loadingBookings" role="status" aria-label="Đang tải thêm" class="rounded-2xl bg-white border border-ink-200 px-5 py-4 space-y-2">
        <FhSkeleton width="50%" height="18px" />
        <FhSkeleton width="30%" height="14px" />
      </div>
      <p v-if="!hasError && !loadingOrders && !loadingBookings && filteredOrders.length === 0 && visiblePending.length === 0" data-testid="loaded-page-empty" class="text-center text-sm text-ink-500 py-3">Chưa có kết quả. Bấm Xem thêm để tìm tiếp.</p>

      <!-- Bookings with no technician yet, so no service order -->
      <section v-if="visiblePending.length > 0 || hasMoreBookings" class="space-y-2">
        <h2 class="text-sm font-medium text-ink-500">Yêu cầu đặt lịch</h2>
        <ul v-if="visiblePending.length > 0" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          <li
            v-for="booking in visiblePending"
            :key="booking.id"
            :data-testid="`booking-card-${booking.id}`"
            role="link"
            tabindex="0"
            class="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:bg-ink-50"
            @click="router.push(`/app/bookings/${booking.id}`)"
            @keydown.enter="router.push(`/app/bookings/${booking.id}`)"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                <h3 class="font-semibold text-ink-900 text-pretty">{{ booking.serviceName }}</h3>
                <span
                  class="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                  :class="booking.status === 'CANCELLED' ? 'bg-ink-100 text-ink-600' : isOverdue(booking) ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-800'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="booking.status === 'CANCELLED' ? 'bg-ink-400' : isOverdue(booking) ? 'bg-danger-500' : 'bg-warning-500'"></span>
                  {{ pendingLabel(booking) }}
                </span>
              </div>
              <p class="text-sm text-ink-500 flex items-center gap-1.5 min-w-0">
                <span class="font-num whitespace-nowrap">{{ vnDateString(booking.createdAt) }}</span>
                <span aria-hidden="true">·</span>
                <MapPin :size="14" class="shrink-0 text-ink-400" />
                <span class="truncate" :title="booking.addressSummary">{{ booking.addressSummary }}</span>
              </p>
              <div v-if="booking.status === 'CANCELLED'" class="flex justify-end pt-1">
                <FhButton variant="secondary" size="sm" :data-testid="`rebook-booking-${booking.id}`" @click.stop="rebookFor = { bookingId: booking.id, serviceName: booking.serviceName }">Đặt lại</FhButton>
              </div>
            </div>
            <ChevronRight :size="18" class="text-ink-400 shrink-0" />
          </li>
        </ul>

        <div v-if="hasMoreBookings" class="flex justify-center">
          <button
            type="button"
            class="h-10 px-4 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-medium hover:bg-ink-50 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            :disabled="fetchingMoreBookings || loadingBookings"
            data-testid="load-more-bookings"
            @click="loadMoreBookings"
          >
            <RefreshCw :size="14" :class="fetchingMoreBookings ? 'animate-spin' : ''" />
            {{ fetchingMoreBookings ? 'Đang tải…' : 'Xem thêm yêu cầu' }}
          </button>
        </div>
      </section>

      <!-- Service orders -->
      <section v-if="filteredOrders.length > 0 || hasMoreOrders" class="space-y-2">
        <h2 class="text-sm font-medium text-ink-500">Đơn sửa chữa</h2>
        <ul v-if="filteredOrders.length > 0" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100 overflow-hidden">
          <li
            v-for="order in filteredOrders"
            :key="order.id"
            :data-testid="`order-card-${order.id}`"
            role="link"
            tabindex="0"
            class="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition-colors focus-visible:outline-none focus-visible:bg-ink-50"
            @click="router.push(`/app/orders/${order.id}`)"
            @keydown.enter="router.push(`/app/orders/${order.id}`)"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                <h3 class="font-semibold text-ink-900 text-pretty">{{ order.serviceName }}</h3>
                <span
                  class="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                  :class="[getStatusBadge(order.status).bg, getStatusBadge(order.status).text]"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getStatusBadge(order.status).dot"></span>
                  {{ getStatusBadge(order.status).label }}
                </span>
              </div>
              <p class="text-sm text-ink-500 font-num truncate">{{ order.code }} · {{ vnDateString(order.createdAt) }}</p>
              <p class="text-sm text-ink-600 flex items-center gap-1.5 min-w-0">
                <template v-if="order.technician">
                  <span class="truncate">{{ order.technician.fullName }}</span>
                  <span class="shrink-0 whitespace-nowrap text-ink-500">
                    <template v-if="formatRating(order.technician.averageRating)">· <span class="text-warning-500">★</span>&nbsp;{{ formatRating(order.technician.averageRating) }}</template>
                    <template v-else>· Chưa có đánh giá</template>
                  </span>
                </template>
                <span v-else class="text-ink-500">Đang tìm kỹ thuật viên phù hợp…</span>
              </p>
              <div
                v-if="Number(order.grandTotal) > 0 || order.technician || canRebookOrder(order)"
                class="flex items-center justify-between gap-3 pt-1"
              >
                <span class="text-base font-semibold font-num text-ink-900 whitespace-nowrap">
                  <FhMoney v-if="Number(order.grandTotal) > 0" :amount="order.grandTotal" />
                </span>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    v-if="order.technician"
                    type="button"
                    class="h-9 px-3 rounded-xl bg-white border border-ink-200 text-ink-700 text-sm font-medium hover:bg-ink-100 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    aria-label="Nhắn tin với kỹ thuật viên"
                    @click="(e) => handleChat(order, e)"
                  >
                    <MessageSquare :size="16" class="text-ink-500" />
                    <span>Nhắn tin</span>
                  </button>
                  <FhButton
                    v-if="canRebookOrder(order)"
                    variant="secondary"
                    size="sm"
                    :data-testid="`rebook-order-${order.id}`"
                    @click.stop="rebookFor = { bookingId: order.bookingId, serviceName: order.serviceName }"
                  >
                    Đặt lại thợ
                  </FhButton>
                </div>
              </div>
            </div>
            <ChevronRight :size="18" class="text-ink-400 shrink-0" />
          </li>
        </ul>

        <div v-if="hasMoreOrders" class="flex justify-center">
          <button
            type="button"
            class="h-10 px-4 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-medium hover:bg-ink-50 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            :disabled="fetchingMoreOrders || loadingOrders"
            data-testid="load-more-orders"
            @click="loadMoreOrders"
          >
            <RefreshCw :size="14" :class="fetchingMoreOrders ? 'animate-spin' : ''" />
            {{ fetchingMoreOrders ? 'Đang tải…' : 'Xem thêm đơn' }}
          </button>
        </div>
      </section>
    </div>
    <RebookDialog
      v-if="rebookFor"
      :open="!!rebookFor"
      :booking-id="rebookFor.bookingId"
      :service-name="rebookFor.serviceName"
      @close="rebookFor = null"
    />
  </div>
</template>
