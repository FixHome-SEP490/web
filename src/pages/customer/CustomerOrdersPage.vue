<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  MapPin,
  ChevronRight,
  ChevronDown,
  Search,
  MessageSquare,
  Receipt,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-vue-next';
import {
  FhButton,
  FhMoney,
  FhSkeleton,
  FhStatusPill,
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
const canRebookOrder = (order: ServiceOrderItem) =>
  ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase());
const searchQuery = ref('');

// ── Collapsible list sections (YouTube-style expandable) ──
const isBookingsExpanded = ref(true);
const isOrdersExpanded = ref(true);

// ── Tab sliding indicator animation ──
const tabListRef = ref<HTMLElement | null>(null);
const tabRefs = ref<Record<string, HTMLElement | null>>({});
const indicatorStyle = ref<Record<string, string>>({
  opacity: '0',
});

function updateTabIndicator() {
  const activeEl = tabRefs.value[activeTab.value];
  const container = tabListRef.value;
  if (!activeEl || !container) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }
  const left = activeEl.offsetLeft;
  const top = activeEl.offsetTop;
  const width = activeEl.offsetWidth;
  const height = activeEl.offsetHeight;

  indicatorStyle.value = {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${width}px`,
    height: `${height}px`,
    opacity: '1',
  };
}

function selectTab(key: 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') {
  activeTab.value = key;
  const el = tabRefs.value[key];
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

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
    ordersError.value = 'Không thể tải danh sách đơn sửa chữa. Vui lòng thử lại.';
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
    bookingsError.value = 'Không thể tải danh sách yêu cầu đặt lịch. Vui lòng thử lại.';
    return false;
  }
}

// ── Infinite scroll sentinel observers ──
const bookingsSentinelRef = ref<HTMLElement | null>(null);
const ordersSentinelRef = ref<HTMLElement | null>(null);

let bookingsObserver: IntersectionObserver | null = null;
let ordersObserver: IntersectionObserver | null = null;

function setupInfiniteScroll() {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

  bookingsObserver?.disconnect();
  ordersObserver?.disconnect();

  bookingsObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (
        entry?.isIntersecting &&
        hasMoreBookings.value &&
        !fetchingMoreBookings.value &&
        !loadingBookings.value &&
        !bookingsError.value &&
        isBookingsExpanded.value
      ) {
        loadMoreBookings();
      }
    },
    { rootMargin: '250px' },
  );

  ordersObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (
        entry?.isIntersecting &&
        hasMoreOrders.value &&
        !fetchingMoreOrders.value &&
        !loadingOrders.value &&
        !ordersError.value &&
        isOrdersExpanded.value
      ) {
        loadMoreOrders();
      }
    },
    { rootMargin: '250px' },
  );

  if (bookingsSentinelRef.value && hasMoreBookings.value && isBookingsExpanded.value) {
    bookingsObserver.observe(bookingsSentinelRef.value);
  }
  if (ordersSentinelRef.value && hasMoreOrders.value && isOrdersExpanded.value) {
    ordersObserver.observe(ordersSentinelRef.value);
  }
}

watch([activeTab, loadedCount], () => {
  nextTick(updateTabIndicator);
});

watch(
  [bookingsSentinelRef, ordersSentinelRef, hasMoreBookings, hasMoreOrders, isBookingsExpanded, isOrdersExpanded],
  () => {
    nextTick(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      if (bookingsSentinelRef.value && bookingsObserver) {
        bookingsObserver.disconnect();
        if (hasMoreBookings.value && isBookingsExpanded.value) {
          bookingsObserver.observe(bookingsSentinelRef.value);
        }
      }
      if (ordersSentinelRef.value && ordersObserver) {
        ordersObserver.disconnect();
        if (hasMoreOrders.value && isOrdersExpanded.value) {
          ordersObserver.observe(ordersSentinelRef.value);
        }
      }
    });
  },
);

onMounted(async () => {
  nextTick(() => {
    updateTabIndicator();
    setupInfiniteScroll();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateTabIndicator);
    }
  });

  loadingOrders.value = true;
  loadingBookings.value = true;
  await Promise.all([
    fetchOrders(1).finally(() => {
      loadingOrders.value = false;
      nextTick(updateTabIndicator);
    }),
    fetchBookings(1).finally(() => {
      loadingBookings.value = false;
      nextTick(updateTabIndicator);
    }),
  ]);
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
  bookingsObserver?.disconnect();
  ordersObserver?.disconnect();
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
      return { label: 'Đang di chuyển', tone: 'bg-warning-50 text-warning-800' };
    case 'UNDER_REPAIR':
      return { label: 'Đang sửa chữa', tone: 'bg-brand-50 text-brand-700' };
    case 'IN_PROGRESS':
      return { label: 'Đang sửa chữa', tone: 'bg-brand-50 text-brand-700' };
    case 'ACCEPTED':
      return { label: 'Đã nhận đơn', tone: 'bg-brand-50 text-brand-700' };
    case 'COMPLETED':
      return { label: 'Hoàn thành', tone: 'bg-success-50 text-success-700' };
    case 'CANCELLED':
      return { label: 'Đã huỷ', tone: 'bg-ink-100 text-ink-600' };
    default:
      return { label: 'Trạng thái chưa xác định', tone: 'bg-ink-100 text-ink-600' };
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
  <div class="mx-auto max-w-4xl space-y-5 pb-12">
    <h1 class="text-2xl font-bold tracking-tight text-ink-900">Đơn của tôi</h1>

    <div class="relative">
      <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Tìm theo mã đơn, dịch vụ, kỹ thuật viên…"
        aria-label="Tìm đơn"
        class="h-11 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-10 text-base text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm"
      />
      <button
        v-if="searchQuery"
        type="button"
        @click="searchQuery = ''"
        class="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        aria-label="Xoá tìm kiếm"
      >
        <X :size="16" />
      </button>
    </div>

    <div
      ref="tabListRef"
      class="relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 select-none scrollbar-none"
      role="tablist"
      aria-label="Lọc đơn sửa chữa"
    >
      <!-- Sliding active background pill -->
      <div
        class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        :style="indicatorStyle"
        aria-hidden="true"
      />

      <button
        v-for="tab in [
          { key: 'ALL' as const, label: 'Tất cả', count: `(${loadedCount})` },
          { key: 'IN_PROGRESS' as const, label: 'Đang xử lý', count: '' },
          { key: 'COMPLETED' as const, label: 'Hoàn thành', count: '' },
          { key: 'CANCELLED' as const, label: 'Đã huỷ', count: '' },
        ]"
        :key="tab.key"
        :ref="(el) => { tabRefs[tab.key] = el as HTMLElement }"
        :data-testid="`history-tab-${tab.key}`"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="relative z-10 flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-medium transition-colors"
        :class="activeTab === tab.key ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
        @click="selectTab(tab.key as 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED')"
      >
        <span>{{ tab.label }}</span>
        <span
          v-if="tab.count"
          class="inline-flex items-center rounded-full px-1.5 py-0.2 font-num text-xs transition-colors"
          :class="activeTab === tab.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'bg-ink-200/60 text-ink-600'"
        >
          {{ tab.count }}
        </span>
      </button>
    </div>

    <div v-if="!loading && hasError" class="space-y-2">
      <div
        v-if="ordersError"
        data-testid="orders-error-banner"
        class="flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
      >
        <span class="flex items-center gap-2 min-w-0">
          <AlertCircle :size="16" class="shrink-0" />
          <span>{{ ordersError }}</span>
        </span>
        <button
          type="button"
          class="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-semibold hover:bg-danger-100 disabled:opacity-50"
          data-testid="retry-orders"
          :disabled="loadingOrders || fetchingMoreOrders"
          @click="retryOrders"
        >
          <RefreshCw :size="14" :class="fetchingMoreOrders ? 'animate-spin' : ''" />
          <span>Thử lại</span>
        </button>
      </div>

      <div
        v-if="bookingsError"
        data-testid="bookings-error-banner"
        class="flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
      >
        <span class="flex items-center gap-2 min-w-0">
          <AlertCircle :size="16" class="shrink-0" />
          <span>{{ bookingsError }}</span>
        </span>
        <button
          type="button"
          class="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-semibold hover:bg-danger-100 disabled:opacity-50"
          data-testid="retry-bookings"
          :disabled="loadingBookings || fetchingMoreBookings"
          @click="retryBookings"
        >
          <RefreshCw :size="14" :class="fetchingMoreBookings ? 'animate-spin' : ''" />
          <span>Thử lại</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white" aria-busy="true" aria-label="Đang tải đơn">
      <div v-for="i in 4" :key="i" class="space-y-2 px-4 py-4 sm:px-5">
        <div class="flex items-center justify-between gap-4">
          <FhSkeleton width="48%" height="18px" />
          <FhSkeleton width="90px" height="24px" class="rounded-lg" />
        </div>
        <FhSkeleton width="68%" height="14px" />
      </div>
    </div>

    <div
      v-else-if="!hasError && !loadingOrders && !loadingBookings && !hasMoreOrders && !hasMoreBookings && filteredOrders.length === 0 && visiblePending.length === 0"
      data-testid="history-empty-state"
      class="space-y-2 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center"
    >
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Receipt :size="24" />
      </div>
      <h2 class="text-base font-semibold text-ink-900">{{ searchQuery ? 'Không có đơn phù hợp' : 'Bạn chưa có đơn sửa chữa' }}</h2>
      <p class="mx-auto max-w-sm text-sm text-ink-500">{{ searchQuery ? 'Thử từ khoá khác.' : 'Các yêu cầu đặt lịch và đơn sửa chữa sẽ xuất hiện tại đây.' }}</p>
    </div>

    <div v-else class="space-y-5">
      <div
        v-if="loadingOrders || loadingBookings"
        role="status"
        aria-label="Đang tải thêm"
        class="space-y-2 rounded-2xl border border-ink-200 bg-white px-5 py-4"
      >
        <FhSkeleton width="50%" height="18px" />
        <FhSkeleton width="30%" height="14px" />
      </div>

      <p
        v-if="!hasError && !loadingOrders && !loadingBookings && filteredOrders.length === 0 && visiblePending.length === 0"
        data-testid="loaded-page-empty"
        class="py-3 text-center text-sm text-ink-500"
      >
        Chưa có kết quả. Bấm Xem thêm để tìm tiếp.
      </p>

      <section v-if="visiblePending.length > 0 || hasMoreBookings" class="space-y-2">
        <button
          type="button"
          class="group flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isBookingsExpanded"
          @click="isBookingsExpanded = !isBookingsExpanded"
        >
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-ink-800 transition-colors group-hover:text-ink-900">Yêu cầu đặt lịch</h2>
            <span class="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs font-semibold text-ink-600">
              {{ visiblePending.length }}
            </span>
          </div>

          <div class="flex items-center gap-1 text-xs font-medium text-ink-500">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-lg text-ink-400 transition-transform duration-300 ease-out group-hover:text-ink-600"
              :class="{ 'rotate-180': isBookingsExpanded }"
            >
              <ChevronDown :size="16" />
            </div>
          </div>
        </button>

        <div
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="isBookingsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="min-h-0 overflow-hidden space-y-2">
            <ul v-if="visiblePending.length > 0" class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <li
                v-for="booking in visiblePending"
                :key="booking.id"
                :data-testid="`booking-card-${booking.id}`"
                role="link"
                tabindex="0"
                class="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-none sm:px-5"
                @click="router.push(`/app/bookings/${booking.id}`)"
                @keydown.enter="router.push(`/app/bookings/${booking.id}`)"
                @keydown.space.prevent="router.push(`/app/bookings/${booking.id}`)"
              >
                <div class="min-w-0 flex-1 space-y-1.5">
                  <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                    <h3 class="font-semibold text-ink-900">{{ booking.serviceName }}</h3>
                    <FhStatusPill
                      :status="booking.status === 'CANCELLED' ? 'CANCELLED' : isOverdue(booking) ? 'PENDING_APPROVAL' : 'PENDING'"
                      :label="pendingLabel(booking)"
                    />
                  </div>
                  <p class="flex min-w-0 items-center gap-1.5 text-sm text-ink-500">
                    <span class="font-num shrink-0">{{ vnDateString(booking.createdAt) }}</span>
                    <span aria-hidden="true">·</span>
                    <MapPin :size="14" class="shrink-0 text-ink-400" />
                    <span class="truncate" :title="booking.addressSummary">{{ booking.addressSummary }}</span>
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <FhButton
                    v-if="booking.status === 'CANCELLED'"
                    variant="secondary"
                    size="sm"
                    :data-testid="`rebook-booking-${booking.id}`"
                    @click.stop="rebookFor = { bookingId: booking.id, serviceName: booking.serviceName }"
                  >
                    Đặt lại
                  </FhButton>
                  <ChevronRight :size="18" class="text-ink-400" />
                </div>
              </li>
            </ul>

            <div v-if="hasMoreBookings" ref="bookingsSentinelRef" class="space-y-2 pt-1">
              <!-- Facebook-style shimmering skeleton placeholder while loading -->
              <div v-if="fetchingMoreBookings" class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
                <div v-for="i in 2" :key="`skeleton-booking-${i}`" class="animate-pulse space-y-2.5 px-4 py-3.5 sm:px-5">
                  <div class="flex items-center justify-between gap-4">
                    <div class="h-4 w-40 rounded bg-ink-200/80" />
                    <div class="h-5 w-24 rounded-lg bg-ink-100" />
                  </div>
                  <div class="h-3 w-52 rounded bg-ink-100" />
                </div>
              </div>

              <div class="flex justify-center pt-1">
                <button
                  type="button"
                  class="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
                  :disabled="fetchingMoreBookings || loadingBookings"
                  data-testid="load-more-bookings"
                  @click="loadMoreBookings"
                >
                  <RefreshCw :size="14" :class="fetchingMoreBookings ? 'animate-spin' : ''" />
                  <span>{{ fetchingMoreBookings ? 'Đang tải…' : 'Xem thêm yêu cầu' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="filteredOrders.length > 0 || hasMoreOrders" class="space-y-2">
        <button
          type="button"
          class="group flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isOrdersExpanded"
          @click="isOrdersExpanded = !isOrdersExpanded"
        >
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-ink-800 transition-colors group-hover:text-ink-900">Đơn sửa chữa</h2>
            <span class="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs font-semibold text-ink-600">
              {{ filteredOrders.length }}
            </span>
          </div>

          <div class="flex items-center gap-1 text-xs font-medium text-ink-500">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-lg text-ink-400 transition-transform duration-300 ease-out group-hover:text-ink-600"
              :class="{ 'rotate-180': isOrdersExpanded }"
            >
              <ChevronDown :size="16" />
            </div>
          </div>
        </button>

        <div
          class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          :class="isOrdersExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="min-h-0 overflow-hidden space-y-2">
            <ul v-if="filteredOrders.length > 0" class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <li
                v-for="order in filteredOrders"
                :key="order.id"
                :data-testid="`order-card-${order.id}`"
                role="link"
                tabindex="0"
                class="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-none sm:px-5"
                @click="router.push(`/app/orders/${order.id}`)"
                @keydown.enter="router.push(`/app/orders/${order.id}`)"
                @keydown.space.prevent="router.push(`/app/orders/${order.id}`)"
              >
                <div class="min-w-0 flex-1 space-y-1.5">
                  <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                    <h3 class="font-semibold text-ink-900">{{ order.serviceName }}</h3>
                    <FhStatusPill
                      :status="order.status"
                      :label="getStatusBadge(order.status).label"
                    />
                  </div>
                  <p class="truncate font-num text-sm text-ink-500">{{ order.code || order.id.slice(0, 8) }} · {{ vnDateString(order.createdAt) }}</p>
                  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p class="min-w-0 truncate text-sm text-ink-600">
                      <template v-if="order.technician">
                        {{ order.technician.fullName }}
                        <span v-if="formatRating(order.technician.averageRating)" class="whitespace-nowrap text-ink-500"> · <span class="text-warning-600">★</span> {{ formatRating(order.technician.averageRating) }}</span>
                      </template>
                      <span v-else class="text-ink-500">Chưa phân công kỹ thuật viên</span>
                    </p>
                    <span v-if="Number(order.grandTotal) > 0" class="shrink-0 whitespace-nowrap font-num text-sm font-semibold text-ink-900">
                      <FhMoney :amount="order.grandTotal" />
                    </span>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <button
                      v-if="order.technician"
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-100"
                      aria-label="Nhắn tin với kỹ thuật viên"
                      title="Nhắn tin với kỹ thuật viên"
                      @click="(e) => handleChat(order, e)"
                    >
                      <MessageSquare :size="16" class="text-ink-500" />
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
                  <ChevronRight :size="18" class="text-ink-400" />
                </div>
              </li>
            </ul>

            <div v-if="hasMoreOrders" ref="ordersSentinelRef" class="space-y-2 pt-1">
              <!-- Facebook-style shimmering skeleton placeholder while loading -->
              <div v-if="fetchingMoreOrders" class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xs">
                <div v-for="i in 2" :key="`skeleton-order-${i}`" class="animate-pulse space-y-2.5 px-4 py-3.5 sm:px-5">
                  <div class="flex items-center justify-between gap-4">
                    <div class="h-4 w-44 rounded-md bg-ink-200/80" />
                    <div class="h-5 w-24 rounded-lg bg-ink-100" />
                  </div>
                  <div class="h-3 w-52 rounded bg-ink-100" />
                  <div class="flex items-center justify-between pt-0.5">
                    <div class="h-3.5 w-36 rounded bg-ink-100" />
                    <div class="h-4 w-20 rounded bg-ink-200/70" />
                  </div>
                </div>
              </div>

              <div class="flex justify-center pt-1">
                <button
                  type="button"
                  class="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
                  :disabled="fetchingMoreOrders || loadingOrders"
                  data-testid="load-more-orders"
                  @click="loadMoreOrders"
                >
                  <RefreshCw :size="14" :class="fetchingMoreOrders ? 'animate-spin' : ''" />
                  <span>{{ fetchingMoreOrders ? 'Đang tải…' : 'Xem thêm đơn' }}</span>
                </button>
              </div>
            </div>
          </div>
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
