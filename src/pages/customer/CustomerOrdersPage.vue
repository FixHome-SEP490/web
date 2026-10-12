<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
// Two server-paged lists (PO 12/10/2026): booking requests that no technician
// has taken yet, and repair orders. Each has its own numbered pager; the tab
// and both pages stay in the address bar (?tab=COMPLETED&page=2).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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
  FhPagination,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import RebookDialog from '../../components/customer/RebookDialog.vue';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import type { PageResult } from '../../api/paging';
import { usePagedList } from '../../composables/usePagedList';
import { queryKeys } from '../../lib/query-keys';
import { SEARCH_MAX_LENGTH, useQueryChoice, useQueryPage, useQuerySearch } from '../../composables/useQueryState';
import { useChatStore } from '../../stores/chat.store';
import { vnDateString } from '../../utils/vn-time';
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
  if (activeTab.value === 'ALL' && !search.value) return ordersApi.getMyOrdersPage(page, pageSize);
  const statuses = ORDER_STATES[activeTab.value];
  if (statuses.length === 1 && !search.value) {
    return ordersApi.getMyOrdersPage(page, pageSize, { status: statuses[0] });
  }
  return readMergedPage({
    page,
    pageSize,
    statuses,
    search: search.value,
    fetchPage: (statusPage, statusPageSize, status) =>
      ordersApi.getMyOrdersPage(statusPage, statusPageSize, { status }),
    searchableText: (order) => `${order.code} ${order.serviceName}`,
  });
}

function fetchBookingsPage(page: number, pageSize: number): Promise<PageResult<BookingItem>> {
  const statuses = BOOKING_STATES[activeTab.value];
  if (statuses.length === 0) return emptyPage<BookingItem>(page, pageSize);
  if (statuses.length === 1 && !search.value) {
    return bookingsApi.getMyBookingsPage(page, pageSize, { status: statuses[0] });
  }
  return readMergedPage({
    page,
    pageSize,
    statuses,
    search: search.value,
    fetchPage: (statusPage, statusPageSize, status) =>
      bookingsApi.getMyBookingsPage(statusPage, statusPageSize, { status }),
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

// Short lines only; the server's wording never reaches the customer.
const ordersError = computed(() => (ordersFailure.value ? 'Chưa tải được đơn sửa chữa, vui lòng thử lại.' : null));
const bookingsError = computed(() => (bookingsFailure.value ? 'Chưa tải được yêu cầu đặt lịch, vui lòng thử lại.' : null));

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

function selectTab(key: Tab) {
  activeTab.value = key;
  const el = tabRefs.value[key];
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

// ── Computed ──
const loading = computed(() => loadingOrders.value && loadingBookings.value);
const hasError = computed(() => !!(ordersError.value || bookingsError.value));
const allCount = computed(() =>
  activeTab.value === 'ALL' && !loadingOrders.value && !loadingBookings.value && !hasError.value
    ? ordersTotal.value + bookingsTotal.value
    : null,
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

watch(activeTab, () => {
  void nextTick(updateTabIndicator);
});

onMounted(() => {
  void nextTick(updateTabIndicator);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateTabIndicator);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateTabIndicator);
  }
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
          { key: 'ALL' as const, label: allCount === null ? 'Tất cả' : `Tất cả (${allCount})` },
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
        class="relative z-10 flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-xs sm:text-sm font-medium transition-colors"
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
      v-else-if="!hasError && !loadingOrders && !loadingBookings && ordersTotal === 0 && bookingsTotal === 0"
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

    <div v-else class="space-y-5">
      <!-- Bookings with no technician yet, so no service order -->
      <section v-if="loadingBookings || bookingsTotal > 0" class="space-y-2" data-testid="requests-section">
        <button
          type="button"
          class="group flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isBookingsExpanded"
          @click="isBookingsExpanded = !isBookingsExpanded"
        >
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-ink-800 transition-colors group-hover:text-ink-900">Yêu cầu đặt lịch</h2>
            <span class="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs font-semibold text-ink-600">
              {{ bookingsTotal }}
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
            <div v-if="loadingBookings" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải yêu cầu">
              <div v-for="i in 2" :key="i" class="px-5 py-4 space-y-2">
                <FhSkeleton width="50%" height="18px" />
                <FhSkeleton width="30%" height="14px" />
              </div>
            </div>

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
        </div>
      </section>

      <!-- Service orders -->
      <section v-if="loadingOrders || ordersTotal > 0" class="space-y-2" data-testid="orders-section">
        <button
          type="button"
          class="group flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-expanded="isOrdersExpanded"
          @click="isOrdersExpanded = !isOrdersExpanded"
        >
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-ink-800 transition-colors group-hover:text-ink-900">Đơn sửa chữa</h2>
            <span class="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs font-semibold text-ink-600">
              {{ ordersTotal }}
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
            <div v-if="loadingOrders" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải đơn">
              <div v-for="i in 3" :key="i" class="px-5 py-4 space-y-2">
                <FhSkeleton width="55%" height="18px" />
                <FhSkeleton width="35%" height="14px" />
              </div>
            </div>

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

            <FhPagination
              v-model:page="ordersPage"
              :page-size="PAGE_SIZE"
              :total="ordersTotal"
              :disabled="loadingOrders"
              @prefetch="prefetchOrders"
            />
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
