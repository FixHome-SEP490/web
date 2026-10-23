<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
// Two server-paged lists (PO 12/10/2026): booking requests that no technician
// has taken yet, and repair orders. Each has its own numbered pager; the tab
// and both pages stay in the address bar (?tab=COMPLETED&page=2). One list is
// on screen at a time, picked by a two-way switch with both counts (?list=).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  MapPin,
  ChevronRight,
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
  FhPagination,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { visitGroupsApi, type VisitGroupPageDevice, type VisitGroupPageItem } from '../../api/visit-groups.api';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import type { PageResult } from '../../api/paging';
import { usePagedList } from '../../composables/usePagedList';
import { queryKeys } from '../../lib/query-keys';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQueryPage, useQuerySearch, useQueryState } from '../../composables/useQueryState';
import { useChatStore } from '../../stores/chat.store';
import { vnDateString, vnDateTimeString } from '../../utils/vn-time';
import { formatRating } from '../../utils/formatters';

const PAGE_SIZE = 10;

const router = useRouter();
const chatStore = useChatStore();

type Tab = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
const TAB_KEYS: readonly Tab[] = ['ALL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const activeTab = useQueryChoice<Tab>('tab', TAB_KEYS, 'ALL');

// "Đặt lại thợ" from a completed or cancelled order, or a booking cancelled before any technician accepted.
const rebookFor = ref<{ bookingId: string; serviceName?: string } | null>(null);
const canRebookOrder = (order: ServiceOrderItem) => ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase());
// Searches on the server (order code, service; accents ignored), kept as ?q=.
const { input: searchQuery, search } = useQuerySearch();

const emptyPage = <T,>(page: number, pageSize: number): Promise<PageResult<T>> =>
  Promise.resolve({ items: [], total: 0, page, pageSize });

// The current Backend list contract only accepts one `status` per request.
// Composite tabs therefore merge their individual status pages in the client.
// This avoids the strict ValidationPipe rejecting the whole page for sending
// the not-yet-supported `statuses` or `search` query parameters.
const ORDER_STATES: Record<Tab, string[]> = {
  ALL: ['accepted', 'en_route', 'under_repair', 'completed', 'cancelled'],
  IN_PROGRESS: ['accepted', 'en_route', 'under_repair'],
  COMPLETED: ['completed'],
  CANCELLED: ['cancelled'],
};
// A matched booking already shows as its order, so it is never listed twice.
const BOOKING_STATES: Record<Tab, string[]> = {
  ALL: ['submitted', 'matching', 'closed', 'cancelled'],
  IN_PROGRESS: ['submitted', 'matching'],
  COMPLETED: [],
  CANCELLED: ['cancelled'],
};

type DatedItem = { id: string; createdAt: string };

const BACKEND_PAGE_SIZE = 100;

function foldSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function newestFirst(a: DatedItem, b: DatedItem): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

async function readStatusPrefix<T extends DatedItem>(
  status: string,
  wanted: number | null,
  fetchPage: (page: number, pageSize: number, status: string) => Promise<PageResult<T>>,
): Promise<{ items: T[]; total: number }> {
  const chunkSize = wanted === null ? BACKEND_PAGE_SIZE : Math.min(BACKEND_PAGE_SIZE, Math.max(1, wanted));
  const first = await fetchPage(1, chunkSize, status);
  const target = wanted === null ? first.total : Math.min(first.total, wanted);
  const pages = Math.ceil(target / chunkSize);
  const rest: PageResult<T>[] = [];
  // Keep at most one request per status in flight; a long history must not
  // create an unbounded burst of requests while the customer is searching.
  for (let nextPage = 2; nextPage <= pages; nextPage += 1) {
    rest.push(await fetchPage(nextPage, chunkSize, status));
  }
  return { items: [first, ...rest].flatMap((result) => result.items).slice(0, target), total: first.total };
}

/**
 * Produces an exact page across several separately paged statuses. Without a
 * search, only the prefix that can reach the requested page is read. Search is
 * performed locally because these two Backend endpoints do not accept it yet.
 */
async function readMergedPage<T extends DatedItem>(options: {
  page: number;
  pageSize: number;
  statuses: readonly string[];
  search: string;
  fetchPage: (page: number, pageSize: number, status: string) => Promise<PageResult<T>>;
  searchableText: (item: T) => string;
}): Promise<PageResult<T>> {
  const query = foldSearchText(options.search.trim());
  const wanted = query ? null : options.page * options.pageSize;
  const groups = await Promise.all(
    options.statuses.map((status) => readStatusPrefix(status, wanted, options.fetchPage)),
  );
  const unique = new Map<string, T>();
  for (const item of groups.flatMap((group) => group.items).sort(newestFirst)) unique.set(item.id, item);
  const rows = [...unique.values()]
    .sort(newestFirst)
    .filter((item) => !query || foldSearchText(options.searchableText(item)).includes(query));
  const total = query ? rows.length : groups.reduce((sum, group) => sum + group.total, 0);
  const start = (options.page - 1) * options.pageSize;
  return { items: rows.slice(start, start + options.pageSize), total, page: options.page, pageSize: options.pageSize };
}

function fetchOrdersPage(page: number, pageSize: number): Promise<PageResult<ServiceOrderItem>> {
  // The unfiltered endpoint already provides the exact ALL page efficiently.
  if (activeTab.value === 'ALL' && !search.value) return ordersApi.getMyOrdersPage(page, pageSize, { excludeVisitGroups: true });
  const statuses = ORDER_STATES[activeTab.value];
  if (statuses.length === 1 && !search.value) {
    return ordersApi.getMyOrdersPage(page, pageSize, { status: statuses[0], excludeVisitGroups: true });
  }
  return readMergedPage({
    page,
    pageSize,
    statuses,
    search: search.value,
    fetchPage: (statusPage, statusPageSize, status) =>
      ordersApi.getMyOrdersPage(statusPage, statusPageSize, { status, excludeVisitGroups: true }),
    searchableText: (order) => `${order.code} ${order.serviceName}`,
  });
}

function fetchBookingsPage(page: number, pageSize: number): Promise<PageResult<BookingItem>> {
  const statuses = BOOKING_STATES[activeTab.value];
  if (statuses.length === 0) return emptyPage<BookingItem>(page, pageSize);
  if (statuses.length === 1 && !search.value) {
    return bookingsApi.getMyBookingsPage(page, pageSize, { status: statuses[0], excludeVisitGroups: true });
  }
  return readMergedPage({
    page,
    pageSize,
    statuses,
    search: search.value,
    fetchPage: (statusPage, statusPageSize, status) =>
      bookingsApi.getMyBookingsPage(statusPage, statusPageSize, { status, excludeVisitGroups: true }),
    searchableText: (booking) => booking.serviceName ?? '',
  });
}

const ordersList = usePagedList<ServiceOrderItem>({
  key: () => queryKeys.orders.customerList({ tab: activeTab.value, search: search.value }),
  pageSize: PAGE_SIZE,
  fetch: fetchOrdersPage,
});
const bookingsList = usePagedList<BookingItem>({
  key: () => queryKeys.bookings.customerList({ tab: activeTab.value, search: search.value }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('requestsPage'),
  fetch: fetchBookingsPage,
});
const visitGroupsList = usePagedList<VisitGroupPageItem>({
  key: () => queryKeys.visitGroups.customerList({ search: search.value }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('visitsPage'),
  fetch: (p, size) => visitGroupsApi.minePage(p, size, { q: search.value || undefined }),
});

const {
  page: ordersPage,
  items: orders,
  total: ordersTotal,
  loading: loadingOrders,
  error: ordersFailure,
  load: retryOrders,
  changingPage: changingOrdersPage,
  prefetch: prefetchOrders,
} = ordersList;
const {
  page: bookingsPage,
  items: bookings,
  total: bookingsTotal,
  loading: loadingBookings,
  error: bookingsFailure,
  load: retryBookings,
  changingPage: changingBookingsPage,
  prefetch: prefetchBookings,
} = bookingsList;
const {
  page: visitGroupsPage,
  items: visitGroups,
  total: visitGroupsTotal,
  loading: loadingVisitGroups,
  error: visitGroupsFailure,
  load: retryVisitGroups,
  changingPage: changingVisitGroupsPage,
  prefetch: prefetchVisitGroups,
} = visitGroupsList;

// Short lines only; the server's wording never reaches the customer.
const ordersError = computed(() => (ordersFailure.value ? 'Chưa tải được đơn sửa chữa, vui lòng thử lại.' : null));
const bookingsError = computed(() => (bookingsFailure.value ? 'Chưa tải được yêu cầu đặt lịch, vui lòng thử lại.' : null));
const visitGroupsError = computed(() => (visitGroupsFailure.value ? 'Chưa tải được lượt sửa nhiều thiết bị, vui lòng thử lại.' : null));

// ── Which list is on screen ──
type ListView = 'orders' | 'requests' | 'visits';
const chosenList = useQueryState<ListView | null>(
  'list',
  (raw) => (raw === 'orders' || raw === 'requests' || raw === 'visits' ? raw : null),
  (value) => value ?? undefined,
);
// An unselected list opens on parent visits when present; otherwise preserve the legacy default.
const listView = computed<ListView>(() => {
  if (chosenList.value) return chosenList.value;
  if (!loadingVisitGroups.value && visitGroupsTotal.value > 0) return 'visits';
  const ordersEmpty = !loadingOrders.value && ordersTotal.value === 0;
  return ordersEmpty && !loadingBookings.value && bookingsTotal.value > 0 ? 'requests' : 'orders';
});
const listChoices = computed(() => [
  { key: 'orders' as const, label: 'Đơn sửa chữa', shortLabel: 'Đơn sửa', count: ordersTotal.value, loading: loadingOrders.value },
  { key: 'requests' as const, label: 'Yêu cầu đặt lịch', shortLabel: 'Đặt lịch', count: bookingsTotal.value, loading: loadingBookings.value },
  { key: 'visits' as const, label: 'Lượt sửa nhiều thiết bị', shortLabel: 'Nhiều thiết bị', count: visitGroupsTotal.value, loading: loadingVisitGroups.value },
]);

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

function selectTab(key: Tab) {
  activeTab.value = key;
  const el = tabRefs.value[key];
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

// ── Computed & Count ──
const loading = computed(() => loadingOrders.value && loadingBookings.value && loadingVisitGroups.value);
const hasError = computed(() => !!(ordersError.value || bookingsError.value));

// Keep total count persistent once fetched so switching tabs doesn't cause tab width jitter
const totalCount = ref<number | null>(null);

watch(
  [ordersTotal, bookingsTotal, loadingOrders, loadingBookings, hasError, activeTab],
  () => {
    if (activeTab.value === 'ALL' && !loadingOrders.value && !loadingBookings.value && !hasError.value) {
      totalCount.value = ordersTotal.value + bookingsTotal.value;
    }
  },
  { immediate: true },
);

const isOverdue = (booking: BookingItem) =>
  !!booking.preferredEndAt && new Date(booking.preferredEndAt) < new Date();

const pendingLabel = (booking: BookingItem) => {
  if (booking.status === 'CANCELLED') return 'Đã huỷ trước khi có thợ';
  if (isOverdue(booking)) return 'Quá hạn, đang chờ hỗ trợ';
  if (booking.status === 'MATCHING') return 'Đang chờ thợ xác nhận';
  if (booking.status === 'CLOSED') return 'Chưa tìm được thợ, chờ hỗ trợ';
  return 'Đang tìm thợ phù hợp';
};

function visitItemStatus(item: VisitGroupPageDevice) {
  if (item.outcome === 'failed') return { label: 'Không sửa được', tone: 'bg-danger-50 text-danger-700' };
  if (item.outcome === 'quote_declined') return { label: 'Không đồng ý báo giá', tone: 'bg-warning-50 text-warning-800' };
  if (item.outcome === 'succeeded') return { label: 'Hoàn thành', tone: 'bg-success-50 text-success-700' };
  if (item.orderStatus?.toUpperCase() === 'CANCELLED' || item.bookingStatus.toUpperCase() === 'CANCELLED') {
    return { label: 'Đã hủy', tone: 'bg-ink-100 text-ink-600' };
  }
  switch (item.orderStatus?.toUpperCase()) {
    case 'ACCEPTED': return { label: 'Đã nhận đơn', tone: 'bg-brand-50 text-brand-700' };
    case 'EN_ROUTE': return { label: 'Đang di chuyển', tone: 'bg-warning-50 text-warning-800' };
    case 'UNDER_REPAIR': return { label: 'Đang sửa chữa', tone: 'bg-brand-50 text-brand-700' };
    case 'COMPLETED': return { label: 'Hoàn thành', tone: 'bg-success-50 text-success-700' };
    default:
      return item.bookingStatus.toUpperCase() === 'CLOSED'
        ? { label: 'Chưa tìm được thợ', tone: 'bg-warning-50 text-warning-800' }
        : { label: 'Đang tìm thợ', tone: 'bg-ink-100 text-ink-600' };
  }
}

function visitGroupStatus(status: VisitGroupPageItem['status']) {
  switch (status) {
    case 'submitted': return { label: 'Đang chờ xử lý', tone: 'bg-ink-100 text-ink-700' };
    case 'matching': return { label: 'Đang tìm thợ', tone: 'bg-brand-50 text-brand-700' };
    case 'no_technician': return { label: 'Chưa có thợ phù hợp', tone: 'bg-warning-50 text-warning-800' };
    case 'accepted': return { label: 'Đã nhận lịch', tone: 'bg-brand-50 text-brand-700' };
    case 'en_route': return { label: 'Đang di chuyển', tone: 'bg-warning-50 text-warning-800' };
    case 'under_repair': return { label: 'Đang sửa chữa', tone: 'bg-brand-50 text-brand-700' };
    case 'completed': return { label: 'Hoàn thành', tone: 'bg-success-50 text-success-700' };
    case 'cancelled': return { label: 'Đã hủy', tone: 'bg-ink-100 text-ink-600' };
    case 'failed': return { label: 'Có thiết bị chưa sửa', tone: 'bg-danger-50 text-danger-700' };
    case 'quote_declined': return { label: 'Có báo giá chưa được nhận', tone: 'bg-warning-50 text-warning-800' };
    case 'mixed': return { label: 'Kết quả nhiều trạng thái', tone: 'bg-ink-100 text-ink-700' };
  }
}

let tabResizeObserver: ResizeObserver | null = null;

watch([activeTab, totalCount], () => {
  void nextTick(updateTabIndicator);
});

onMounted(() => {
  void nextTick(updateTabIndicator);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateTabIndicator);
    if (tabListRef.value && typeof ResizeObserver !== 'undefined') {
      tabResizeObserver = new ResizeObserver(() => {
        updateTabIndicator();
      });
      tabResizeObserver.observe(tabListRef.value);
    }
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
  tabResizeObserver?.disconnect();
});

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

// An order whose technician stepped off before arriving waits for another one:
// it is not "on the way" when nobody is assigned.
const awaitingReplacement = (order: ServiceOrderItem) =>
  ['ACCEPTED', 'EN_ROUTE'].includes(String(order.status).toUpperCase()) && !order.technician;
const orderPill = (order: ServiceOrderItem) =>
  awaitingReplacement(order)
    ? { status: 'PENDING', label: 'Đang tìm thợ thay thế' }
    : { status: order.status, label: getStatusBadge(order.status).label };

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
        :maxlength="SEARCH_MAX_LENGTH"
        placeholder="Tìm theo mã đơn, dịch vụ…"
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
      v-if="listView !== 'visits'"
      ref="tabListRef"
      class="relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-ink-100 p-1 select-none scrollbar-none"
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
          { key: 'ALL' as const, label: totalCount === null ? 'Tất cả' : `Tất cả (${totalCount})` },
          { key: 'IN_PROGRESS' as const, label: 'Đang xử lý' },
          { key: 'COMPLETED' as const, label: 'Hoàn tất' },
          { key: 'CANCELLED' as const, label: 'Đã huỷ' },
        ]"
        :key="tab.key"
        :ref="(el) => { tabRefs[tab.key] = el as HTMLElement }"
        :data-testid="`history-tab-${tab.key}`"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="relative z-10 flex h-9 shrink-0 min-w-[5.25rem] sm:min-w-[5.75rem] items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs sm:text-sm font-medium transition-colors"
        :class="activeTab === tab.key ? 'font-semibold text-ink-900' : 'text-ink-600 hover:text-ink-900'"
        @click="selectTab(tab.key)"
      >
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- Partial or full error banners -->
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
          :disabled="loadingOrders"
          @click="retryOrders"
        >
          <RefreshCw :size="14" :class="loadingOrders ? 'animate-spin' : ''" />
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
          :disabled="loadingBookings"
          @click="retryBookings"
        >
          <RefreshCw :size="14" :class="loadingBookings ? 'animate-spin' : ''" />
          <span>Thử lại</span>
        </button>
      </div>
    </div>

    <!-- Initial loading skeleton -->
    <div
      v-if="loading"
      role="status"
      aria-label="Đang tải dữ liệu"
      class="space-y-2 rounded-2xl border border-ink-200 bg-white p-5"
    >
      <div v-for="i in 3" :key="i" class="space-y-2 py-2">
        <div class="flex items-center justify-between">
          <FhSkeleton width="45%" height="18px" />
          <FhSkeleton width="90px" height="24px" rounded="full" />
        </div>
        <FhSkeleton width="68%" height="14px" />
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!hasError && !visitGroupsError && !loadingOrders && !loadingBookings && !loadingVisitGroups && ordersTotal === 0 && bookingsTotal === 0 && visitGroupsTotal === 0"
      data-testid="history-empty-state"
      class="space-y-2 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center"
    >
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Receipt :size="24" />
      </div>
      <h2 class="text-base font-semibold text-ink-900">
        {{ search ? 'Không có đơn phù hợp' : activeTab === 'ALL' ? 'Bạn chưa có đơn sửa chữa' : 'Không có đơn ở mục này' }}
      </h2>
      <p class="text-sm text-ink-500 max-w-sm mx-auto text-pretty">
        {{ search ? 'Thử từ khoá khác.' : activeTab === 'ALL' ? 'Đặt thợ để kỹ thuật viên FixHome tới kiểm tra tại nhà bạn.' : 'Chọn mục khác để xem đơn của bạn.' }}
      </p>
    </div>

    <div v-else class="space-y-3">
      <!-- Repair orders or booking requests: one list at a time -->
      <div class="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Chọn danh sách">
        <button
          v-for="choice in listChoices"
          :key="choice.key"
          type="button"
          class="flex h-11 min-w-[6rem] flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-2 sm:px-3 sm:text-sm"
          :class="listView === choice.key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'"
          :aria-pressed="listView === choice.key"
          :aria-label="choice.label"
          :data-testid="`list-switch-${choice.key}`"
          @click="chosenList = choice.key"
        >
          <span class="truncate whitespace-nowrap sm:hidden">{{ choice.shortLabel }}</span>
          <span class="hidden truncate whitespace-nowrap sm:inline">{{ choice.label }}</span>
          <span
            v-if="!choice.loading"
            class="shrink-0 rounded-full px-2 py-0.5 font-num text-xs"
            :class="listView === choice.key ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600'"
          >{{ choice.count }}</span>
        </button>
      </div>

      <!-- One server-paged parent row per multi-device visit. -->
      <section v-if="listView === 'visits'" class="space-y-2" data-testid="visit-groups-section">
        <div
          v-if="visitGroupsError"
          role="alert"
          class="flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
        >
          <span>{{ visitGroupsError }}</span>
          <button type="button" class="h-9 shrink-0 rounded-lg px-2 font-semibold hover:bg-danger-100" :disabled="loadingVisitGroups" @click="retryVisitGroups">Thử lại</button>
        </div>
        <div v-if="loadingVisitGroups" class="space-y-3 rounded-2xl border border-ink-200 bg-white p-5" aria-busy="true" aria-label="Đang tải lượt sửa nhiều thiết bị">
          <FhSkeleton width="55%" height="18px" />
          <FhSkeleton width="75%" height="14px" />
          <FhSkeleton width="45%" height="14px" />
        </div>
        <p v-else-if="!visitGroupsError && visitGroupsTotal === 0" data-testid="visit-groups-empty" class="rounded-2xl border border-ink-200 bg-white px-5 py-8 text-center text-sm text-ink-500">
          Chưa có lượt sửa nhiều thiết bị.
        </p>
        <ul v-else-if="visitGroups.length" class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white transition-opacity" :class="{ 'opacity-60': changingVisitGroupsPage }" :aria-busy="changingVisitGroupsPage">
          <li v-for="group in visitGroups" :key="group.id" :data-testid="`visit-group-card-${group.id}`" class="space-y-3 px-4 py-4 sm:px-5">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h2 class="font-semibold text-ink-900">Lượt sửa · {{ group.items.length }} thiết bị</h2>
                <p class="mt-1 text-xs text-ink-500 font-num">Tạo ngày {{ vnDateString(group.createdAt) }}</p>
              </div>
              <span :class="`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${visitGroupStatus(group.status).tone}`" :aria-label="`Trạng thái lượt sửa: ${visitGroupStatus(group.status).label}`">
                {{ visitGroupStatus(group.status).label }}
              </span>
            </div>
            <p :data-testid="`visit-group-time-${group.id}`" class="text-sm text-ink-600">
              <span class="font-medium text-ink-700">Lịch hẹn:</span>
              <span class="font-num">{{ group.scheduledAt ? vnDateTimeString(group.scheduledAt) : 'Chưa xác định' }}</span>
            </p>
            <ul class="space-y-2" aria-label="Thiết bị trong lượt sửa">
              <li v-for="item in group.items" :key="item.itemId" :data-testid="`visit-group-device-${group.id}-${item.sequence}`" class="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-ink-50 px-3 py-2 text-sm">
                <span class="min-w-0 flex-1 text-ink-800">
                  <span class="font-medium">{{ item.deviceLabel || `Thiết bị ${item.sequence}` }}</span>
                  <span v-if="item.serviceName" class="text-ink-500"> · {{ item.serviceName }}</span>
                </span>
                <span :class="`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${visitItemStatus(item).tone}`" :aria-label="`Trạng thái thiết bị: ${visitItemStatus(item).label}`">
                  {{ visitItemStatus(item).label }}
                </span>
              </li>
            </ul>
            <div class="flex justify-end border-t border-ink-100 pt-3">
              <router-link :to="`/app/visits/${group.id}`" :data-testid="`visit-group-open-${group.id}`" class="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Xem lượt sửa <ChevronRight :size="16" aria-hidden="true" />
              </router-link>
            </div>
          </li>
        </ul>
        <FhPagination v-model:page="visitGroupsPage" :page-size="PAGE_SIZE" :total="visitGroupsTotal" :disabled="loadingVisitGroups" @prefetch="prefetchVisitGroups" />
      </section>

      <!-- Bookings with no technician yet, so no service order -->
      <section v-if="listView === 'requests'" class="space-y-2" data-testid="requests-section">
          <div class="space-y-2">
            <div v-if="loadingBookings" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải yêu cầu">
              <div v-for="i in 2" :key="i" class="px-5 py-4 space-y-2">
                <FhSkeleton width="50%" height="18px" />
                <FhSkeleton width="30%" height="14px" />
              </div>
            </div>

            <p
              v-else-if="bookingsTotal === 0"
              data-testid="requests-empty"
              class="rounded-2xl border border-ink-200 bg-white px-5 py-8 text-center text-sm text-ink-500"
            >
              Không có yêu cầu đặt lịch ở mục này.
            </p>

            <ul
              v-else
              class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white transition-opacity"
              :class="{ 'opacity-60': changingBookingsPage }"
              :aria-busy="changingBookingsPage"
            >
              <li
                v-for="booking in bookings"
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

            <FhPagination
              v-model:page="bookingsPage"
              :page-size="PAGE_SIZE"
              :total="bookingsTotal"
              :disabled="loadingBookings"
              @prefetch="prefetchBookings"
            />
          </div>
      </section>

      <!-- Service orders -->
      <section v-else-if="listView === 'orders'" class="space-y-2" data-testid="orders-section">
          <div class="space-y-2">
            <div v-if="loadingOrders" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải đơn">
              <div v-for="i in 3" :key="i" class="px-5 py-4 space-y-2">
                <FhSkeleton width="55%" height="18px" />
                <FhSkeleton width="35%" height="14px" />
              </div>
            </div>

            <p
              v-else-if="ordersTotal === 0"
              data-testid="orders-empty"
              class="rounded-2xl border border-ink-200 bg-white px-5 py-8 text-center text-sm text-ink-500"
            >
              Không có đơn sửa chữa ở mục này.
            </p>

            <ul
              v-else
              class="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white transition-opacity"
              :class="{ 'opacity-60': changingOrdersPage }"
              :aria-busy="changingOrdersPage"
            >
              <li
                v-for="order in orders"
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
                      :status="orderPill(order).status"
                      :label="orderPill(order).label"
                    />
                  </div>
                  <p class="truncate font-num text-sm text-ink-500">{{ order.code || order.id.slice(0, 8) }} · {{ vnDateString(order.createdAt) }}</p>
                  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p class="min-w-0 truncate text-sm text-ink-600">
                      <template v-if="order.technician">
                        {{ order.technician.fullName }}
                        <span v-if="formatRating(order.technician.averageRating)" class="whitespace-nowrap text-ink-500"> · <span class="text-warning-600">★</span> {{ formatRating(order.technician.averageRating) }}</span>
                      </template>
                      <span v-else-if="awaitingReplacement(order)" class="text-ink-500">Thợ trước đã rút, FixHome đang tìm thợ khác</span>
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

            <FhPagination
              v-model:page="ordersPage"
              :page-size="PAGE_SIZE"
              :total="ordersTotal"
              :disabled="loadingOrders"
              @prefetch="prefetchOrders"
            />
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
