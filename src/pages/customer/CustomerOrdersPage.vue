<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ClipboardList,
  MapPin,
  Calendar,
  ChevronRight,
  User,
  Plus,
  Search,
  MessageSquare,
  Star,
  Receipt,
  AlertCircle,
  RefreshCw,
} from 'lucide-vue-next';
import {
  FhButton,
  FhCostBreakdown,
  FhMoney,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
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
  if (isOverdue(booking)) return 'Đã quá hạn, đang chờ điều phối viên hỗ trợ';
  if (booking.status === 'MATCHING') return 'Đang chờ thợ xác nhận';
  if (booking.status === 'CLOSED') return 'Chưa tìm được thợ, đang chờ điều phối viên hỗ trợ';
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
  <div class="space-y-6 max-w-4xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <ClipboardList class="text-brand-600" :size="24" />
          Đơn của tôi
        </h1>
        <p class="text-sm text-ink-500 mt-1 text-pretty">
          Theo dõi tiến độ di chuyển, phê duyệt báo giá và trao đổi trực tiếp với thợ.
        </p>
      </div>

      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
        <Plus :size="16" /> Đặt thợ mới
      </FhButton>
    </div>

    <!-- Search Input (Style Mobile) -->
    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Tìm theo mã đơn, dịch vụ, thợ…"
        aria-label="Tìm đơn"
        class="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-ink-200 text-base sm:text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
      />
    </div>

    <!-- Segment Tabs (Style Mobile) -->
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

    <!-- Partial-failure error banners (one per source, with retry) -->
    <div v-if="!loading && hasError" class="space-y-2">
      <div
        v-if="ordersError"
        data-testid="orders-error-banner"
        class="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700"
      >
        <span class="flex items-center gap-1.5">
          <AlertCircle :size="14" />
          {{ ordersError }}
        </span>
        <button
          type="button"
          class="flex items-center gap-1 font-semibold hover:underline shrink-0"
          data-testid="retry-orders"
          :disabled="loadingOrders || fetchingMoreOrders"
          @click="retryOrders"
        >
          <RefreshCw :size="12" /> Thử lại
        </button>
      </div>
      <div
        v-if="bookingsError"
        data-testid="bookings-error-banner"
        class="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-700"
      >
        <span class="flex items-center gap-1.5">
          <AlertCircle :size="14" />
          {{ bookingsError }}
        </span>
        <button
          type="button"
          class="flex items-center gap-1 font-semibold hover:underline shrink-0"
          data-testid="retry-bookings"
          :disabled="loadingBookings || fetchingMoreBookings"
          @click="retryBookings"
        >
          <RefreshCw :size="12" /> Thử lại
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-16 text-ink-400 space-y-2">
      <div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin mx-auto"></div>
      <p class="text-sm">Đang tải danh sách đơn dịch vụ…</p>
    </div>

    <!-- Empty State (only when no error AND no data) -->
    <div
      v-else-if="!hasError && !loadingOrders && !loadingBookings && !hasMoreOrders && !hasMoreBookings && filteredOrders.length === 0 && visiblePending.length === 0"
      data-testid="history-empty-state"
      class="text-center py-16 bg-white rounded-2xl border border-ink-200 space-y-3 p-8"
    >
      <div class="w-14 h-14 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mx-auto mb-2">
        <Receipt :size="28" />
      </div>
      <h3 class="text-sm font-bold text-ink-800">Chưa có đơn dịch vụ nào</h3>
      <p class="text-xs text-ink-500 max-w-sm mx-auto">
        {{ searchQuery ? 'Không tìm thấy đơn nào phù hợp với từ khóa.' : 'Đặt lịch ngay để thợ FixHome kiểm tra tại nhà bạn sau 15–30 phút.' }}
      </p>
      <FhButton variant="primary" size="sm" @click="router.push('/app/bookings/new')">
        Đặt thợ ngay
      </FhButton>
    </div>

    <!-- Orders Feed -->
    <div v-else class="space-y-4">
      <p v-if="loadingOrders || loadingBookings" role="status" class="text-center text-sm text-ink-500">Đang tải dữ liệu…</p>
      <p v-if="!hasError && !loadingOrders && !loadingBookings && filteredOrders.length === 0 && visiblePending.length === 0" data-testid="loaded-page-empty" class="text-center text-xs text-ink-500 py-3">Chưa có kết quả trong các trang đã tải. Chọn Xem thêm để tìm tiếp.</p>
      <!-- Pending bookings: no technician has accepted yet, so there is no ServiceOrder -->
      <div
        v-for="booking in visiblePending"
        :key="booking.id"
        :data-testid="`booking-card-${booking.id}`"
        class="p-5 rounded-2xl bg-white border space-y-2.5 cursor-pointer transition-colors"
        :class="isOverdue(booking) && booking.status !== 'CANCELLED' ? 'border-danger-200 hover:border-danger-300' : 'border-ink-200 hover:border-ink-300'"
        @click="router.push(`/app/bookings/${booking.id}`)"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm text-ink-500 flex items-center gap-1.5 whitespace-nowrap">
            <Calendar :size="14" />
            <span>{{ vnDateString(booking.createdAt) }}</span>
          </span>
          <div
            class="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-medium whitespace-nowrap"
            :class="booking.status === 'CANCELLED' ? 'bg-ink-100 text-ink-600' : isOverdue(booking) ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-800'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="booking.status === 'CANCELLED' ? 'bg-ink-400' : isOverdue(booking) ? 'bg-danger-500' : 'bg-warning-500'"></span>
            <span>{{ pendingLabel(booking) }}</span>
          </div>
        </div>
        <h3 class="font-semibold text-base text-ink-900">{{ booking.serviceName }}</h3>
        <p class="text-sm text-ink-600 flex items-start gap-1.5 min-w-0">
          <MapPin :size="15" class="shrink-0 text-ink-400 mt-0.5" />
          <span class="truncate">{{ booking.addressSummary }}</span>
        </p>
      </div>

      <!-- Load-more bookings button -->
      <div v-if="hasMoreBookings" class="flex justify-center">
        <button
          type="button"
          class="h-10 px-4 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-medium hover:bg-ink-50 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          :disabled="fetchingMoreBookings || loadingBookings"
          data-testid="load-more-bookings"
          @click="loadMoreBookings"
        >
          <RefreshCw :size="13" :class="fetchingMoreBookings ? 'animate-spin' : ''" />
          {{ fetchingMoreBookings ? 'Đang tải…' : 'Xem thêm yêu cầu' }}
        </button>
      </div>

      <div
        v-for="order in filteredOrders"
        :key="order.id"
        :data-testid="`order-card-${order.id}`"
        class="p-5 rounded-2xl bg-white border border-ink-200 hover:border-ink-300 transition-colors cursor-pointer space-y-4"
        @click="router.push(`/app/orders/${order.id}`)"
      >
        <!-- Card Top: Code, Date & Mobile-like Pastel Status Badge -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
          <div class="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
            <span class="font-num text-ink-600 whitespace-nowrap">{{ order.code }}</span>
            <span class="text-ink-500 flex items-center gap-1.5 whitespace-nowrap">
              <Calendar :size="14" />
              <span>{{ vnDateString(order.createdAt) }}</span>
            </span>
          </div>

          <!-- Pastel Badge matching Mobile getStatusBadge -->
          <div
            class="inline-flex items-center gap-1.5 h-6 px-2 rounded-lg text-xs font-medium whitespace-nowrap"
            :class="[getStatusBadge(order.status).bg, getStatusBadge(order.status).text]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="getStatusBadge(order.status).dot"></span>
            <span>{{ getStatusBadge(order.status).label }}</span>
          </div>
        </div>

        <!-- Card Middle: Service & Tech Info -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div class="space-y-1">
            <h3 class="font-semibold text-base text-ink-900">
              {{ order.serviceName }}
            </h3>
            <p class="text-sm text-ink-600 flex items-start gap-1.5 min-w-0">
              <MapPin :size="15" class="shrink-0 text-ink-400 mt-0.5" />
              <span class="truncate">{{ order.addressSummary }}</span>
            </p>
          </div>

          <!-- Technician Mini Card -->
          <div v-if="order.technician" class="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-ink-50">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                {{ order.technician.fullName.charAt(0) }}
              </div>
              <div class="text-sm min-w-0">
                <div class="font-semibold text-ink-900 truncate">{{ order.technician.fullName }}</div>
                <div class="text-xs text-ink-600 flex items-center gap-1 whitespace-nowrap">
                  <template v-if="formatRating(order.technician.averageRating)">
                    <Star :size="12" class="fill-warning-500 text-warning-500" />
                    <span>{{ formatRating(order.technician.averageRating) }}</span>
                  </template>
                  <span v-else>Chưa có đánh giá</span>
                  <span class="text-ink-500">· Thợ chính</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="h-9 px-3 rounded-lg bg-white border border-ink-200 text-ink-700 text-sm font-medium hover:bg-ink-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              @click="(e) => handleChat(order, e)"
              title="Nhắn tin với thợ"
              aria-label="Nhắn tin với thợ"
            >
              <MessageSquare :size="16" class="text-ink-500" />
              <span>Nhắn tin</span>
            </button>
          </div>

          <div v-else class="text-sm text-warning-800 flex items-center gap-2 bg-warning-50 p-3 rounded-xl border border-warning-200">
            <User :size="16" class="text-warning-600 shrink-0" />
            <span>Đang tự động điều phối thợ phù hợp…</span>
          </div>
        </div>

        <!-- Card Bottom: Cost Breakdown & Action CTA -->
        <div class="pt-3 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex-1 max-w-sm">
            <FhCostBreakdown
              :labor-total="order.laborTotal"
              :parts-total="order.partsTotal"
            />
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <div class="text-right">
              <span class="text-xs text-ink-500 block">Tổng chi phí</span>
              <span class="text-lg font-semibold font-num text-ink-900 whitespace-nowrap">
                <FhMoney :amount="order.grandTotal" />
              </span>
            </div>

            <button
              type="button"
              class="h-10 px-4 rounded-xl bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              <span>Xem chi tiết</span>
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </div>

      <!-- Load-more orders button -->
      <div v-if="hasMoreOrders" class="flex justify-center">
        <button
          type="button"
          class="h-10 px-4 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-medium hover:bg-ink-50 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          :disabled="fetchingMoreOrders || loadingOrders"
          data-testid="load-more-orders"
          @click="loadMoreOrders"
        >
          <RefreshCw :size="13" :class="fetchingMoreOrders ? 'animate-spin' : ''" />
          {{ fetchingMoreOrders ? 'Đang tải…' : 'Xem thêm đơn dịch vụ' }}
        </button>
      </div>
    </div>
  </div>
</template>
