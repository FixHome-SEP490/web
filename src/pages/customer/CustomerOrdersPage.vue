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
  AlertCircle,
  RefreshCw,
  X,
  Trash2,
  Clock,
} from 'lucide-vue-next';
import {
  FhButton,
  FhConfirmDialog,
  FhMoney,
  FhPagination,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import { toast } from 'vue-sonner';
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
import { isArrivedWaiting, isVisitArrived, VISIT_DEVICE_ARRIVED_LABEL, VISIT_GROUP_ARRIVED_LABEL } from '../../utils/visit-arrival';

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
  onStatusTotals?: (totals: Record<string, number>) => void;
}): Promise<PageResult<T>> {
  const query = foldSearchText(options.search.trim());
  const wanted = query ? null : options.page * options.pageSize;
  const groups = await Promise.all(
    options.statuses.map((status) => readStatusPrefix(status, wanted, options.fetchPage)),
  );
  if (options.onStatusTotals) {
    const totals: Record<string, number> = {};
    for (let i = 0; i < options.statuses.length; i++) {
      totals[options.statuses[i]] = groups[i].total;
    }
    options.onStatusTotals(totals);
  }
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

const bookingStatusTotals = ref<Record<string, number>>({});

async function fetchBookingsPage(page: number, pageSize: number): Promise<PageResult<BookingItem>> {
  const statuses = BOOKING_STATES[activeTab.value];
  if (statuses.length === 0) return emptyPage<BookingItem>(page, pageSize);
  if (statuses.length === 1 && !search.value) {
    const result = await bookingsApi.getMyBookingsPage(page, pageSize, { status: statuses[0], excludeVisitGroups: true });
    bookingStatusTotals.value = { ...bookingStatusTotals.value, [statuses[0]]: result.total };
    return result;
  }
  return readMergedPage({
    page,
    pageSize,
    statuses,
    search: search.value,
    fetchPage: (statusPage, statusPageSize, status) =>
      bookingsApi.getMyBookingsPage(statusPage, statusPageSize, { status, excludeVisitGroups: true }),
    searchableText: (booking) => booking.serviceName ?? '',
    onStatusTotals: (totals) => {
      bookingStatusTotals.value = { ...bookingStatusTotals.value, ...totals };
    },
  });
}

const pendingBookingsCount = computed(() => {
  if (activeTab.value === 'IN_PROGRESS') {
    return bookingsTotal.value;
  }
  if (activeTab.value === 'CANCELLED' || activeTab.value === 'COMPLETED') {
    return 0;
  }
  return (bookingStatusTotals.value['submitted'] ?? 0) + (bookingStatusTotals.value['matching'] ?? 0);
});

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
  if (isArrivedWaiting(item)) return { label: VISIT_DEVICE_ARRIVED_LABEL, tone: 'bg-brand-50 text-brand-700' };
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

function visitGroupStatus(group: VisitGroupPageItem) {
  if (isVisitArrived(group)) return { label: VISIT_GROUP_ARRIVED_LABEL, tone: 'bg-brand-50 text-brand-700' };
  switch (group.status) {
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

// ── Bulk Selection & Cancellation for Booking Requests ──
const selectedBookingIds = ref<string[]>([]);
const targetSingleBooking = ref<BookingItem | null>(null);
const showCancelDialog = ref(false);
const cancelReasonSelected = ref('Thay đổi nhu cầu / kế hoạch');
const customCancelReason = ref('');
const bulkCancelling = ref(false);

const PRESET_CANCEL_REASONS = [
  'Thay đổi nhu cầu / kế hoạch',
  'Đã tìm được thợ sửa chữa khác',
  'Đặt nhầm dịch vụ hoặc thời gian',
  'Lý do khác',
];

const canCancel = (booking: BookingItem) =>
  ['SUBMITTED', 'MATCHING', 'CLOSED'].includes(booking.status) && !booking.visitGroupId;

const cancellableBookings = computed(() =>
  bookings.value.filter((b) => canCancel(b))
);

const isAllSelected = computed(() =>
  cancellableBookings.value.length > 0 &&
  cancellableBookings.value.every((b) => selectedBookingIds.value.includes(b.id))
);

const isPartiallySelected = computed(() =>
  selectedBookingIds.value.length > 0 && !isAllSelected.value
);

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedBookingIds.value = [];
  } else {
    selectedBookingIds.value = cancellableBookings.value.map((b) => b.id);
  }
}

function toggleSelectBooking(id: string) {
  const index = selectedBookingIds.value.indexOf(id);
  if (index > -1) {
    selectedBookingIds.value.splice(index, 1);
  } else {
    selectedBookingIds.value.push(id);
  }
}

function clearSelection() {
  selectedBookingIds.value = [];
}

// Clear selection when changing page, tab, list, or search
watch([bookingsPage, activeTab, chosenList, search], () => {
  clearSelection();
});

function openBulkCancelDialog() {
  if (selectedBookingIds.value.length === 0) return;
  targetSingleBooking.value = null;
  cancelReasonSelected.value = 'Thay đổi nhu cầu / kế hoạch';
  customCancelReason.value = '';
  showCancelDialog.value = true;
}

function openSingleCancel(booking: BookingItem) {
  targetSingleBooking.value = booking;
  cancelReasonSelected.value = 'Thay đổi nhu cầu / kế hoạch';
  customCancelReason.value = '';
  showCancelDialog.value = true;
}

function closeCancelDialog() {
  if (bulkCancelling.value) return;
  showCancelDialog.value = false;
  targetSingleBooking.value = null;
}

const cancelDialogTitle = computed(() => {
  if (targetSingleBooking.value) {
    return 'Huỷ yêu cầu đặt lịch';
  }
  return `Huỷ ${selectedBookingIds.value.length} yêu cầu đặt lịch`;
});

const cancelDialogConsequence = computed(() => {
  if (targetSingleBooking.value) {
    return `Bạn có chắc muốn huỷ yêu cầu "${targetSingleBooking.value.serviceName}"? Hệ thống sẽ ngừng tìm thợ cho yêu cầu này.`;
  }
  return `Bạn đang chọn huỷ ${selectedBookingIds.value.length} yêu cầu đặt lịch đã chọn. Hệ thống sẽ ngừng tìm thợ cho các yêu cầu này.`;
});

async function confirmCancel() {
  const idsToCancel = targetSingleBooking.value
    ? [targetSingleBooking.value.id]
    : [...selectedBookingIds.value];

  if (idsToCancel.length === 0 || bulkCancelling.value) return;

  const reason = cancelReasonSelected.value === 'Lý do khác'
    ? (customCancelReason.value.trim() || 'Khách hàng huỷ yêu cầu')
    : cancelReasonSelected.value;

  bulkCancelling.value = true;
  let successCount = 0;
  let failCount = 0;

  try {
    const results = await Promise.allSettled(
      idsToCancel.map((id) => bookingsApi.cancelBooking(id, reason))
    );

    for (const res of results) {
      if (res.status === 'fulfilled') {
        successCount++;
      } else {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(
        idsToCancel.length === 1
          ? 'Đã huỷ yêu cầu đặt lịch thành công.'
          : `Đã huỷ thành công ${successCount} yêu cầu đặt lịch.`
      );
    }
    if (failCount > 0) {
      toast.error(`Có ${failCount} yêu cầu không thể huỷ. Vui lòng kiểm tra lại.`);
    }

    clearSelection();
    showCancelDialog.value = false;
    targetSingleBooking.value = null;
    await retryBookings();
    if (ordersTotal.value > 0) {
      void retryOrders();
    }
  } catch {
    toast.error('Có lỗi xảy ra khi huỷ yêu cầu. Vui lòng thử lại.');
  } finally {
    bulkCancelling.value = false;
  }
}
</script>

<template>
  <div class="w-full space-y-5 pb-12">
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
      class="space-y-3 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center"
    >
      <div class="mx-auto mb-3 max-w-[150px] sm:max-w-[170px] flex items-center justify-center">
        <img
          :src="'/images/ui/empty-state-search-service.png'"
          alt=""
          class="w-full h-auto max-h-36 object-contain drop-shadow-sm select-none pointer-events-none"
          loading="lazy"
        />
      </div>
      <h2 class="text-base sm:text-lg font-semibold text-ink-900">
        {{ search ? 'Không có đơn phù hợp' : activeTab === 'ALL' ? 'Bạn chưa có đơn sửa chữa' : 'Không có đơn ở mục này' }}
      </h2>
      <p class="text-sm text-ink-500 max-w-sm mx-auto text-pretty">
        {{ search ? 'Thử từ khoá khác.' : activeTab === 'ALL' ? 'Đặt thợ để kỹ thuật viên FixHome tới kiểm tra tại nhà bạn.' : 'Chọn mục khác để xem đơn của bạn.' }}
      </p>
      <div v-if="!search && activeTab === 'ALL'" class="pt-2">
        <FhButton variant="primary" size="md" @click="router.push('/app/bookings/new')">
          Đặt thợ ngay
        </FhButton>
      </div>
    </div>

    <div v-else class="space-y-3">
      <!-- Repair orders or booking requests: one list at a time -->
      <div class="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Chọn danh sách">
        <button
          v-for="choice in listChoices"
          :key="choice.key"
          type="button"
          class="flex h-11 min-w-[6rem] flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-2 sm:px-3 sm:text-sm"
          :class="listView === choice.key ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-2xs' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50/50'"
          :aria-pressed="listView === choice.key"
          :aria-label="choice.label"
          :data-testid="`list-switch-${choice.key}`"
          @click="chosenList = choice.key"
        >
          <span class="truncate whitespace-nowrap sm:hidden">{{ choice.shortLabel }}</span>
          <span class="hidden truncate whitespace-nowrap sm:inline">{{ choice.label }}</span>
          <span
            v-if="!choice.loading"
            class="shrink-0 rounded-full px-2 py-0.5 font-num text-xs transition-colors"
            :class="listView === choice.key ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600'"
          >{{ choice.count }}</span>
        </button>
      </div>

      <Transition name="fh-fade-slide" mode="out-in">
      <!-- One server-paged parent row per multi-device visit. -->
      <section v-if="listView === 'visits'" key="visits" class="space-y-2" data-testid="visit-groups-section">
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
              <span :class="`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${visitGroupStatus(group).tone}`" :aria-label="`Trạng thái lượt sửa: ${visitGroupStatus(group).label}`">
                {{ visitGroupStatus(group).label }}
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
      <section v-else-if="listView === 'requests'" :key="`requests-${activeTab}`" class="space-y-3" data-testid="requests-section">
          <!-- Bulk actions toolbar -->
          <div
            v-if="!loadingBookings && cancellableBookings.length > 0"
            class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-2xs transition-colors"
            data-testid="requests-bulk-bar"
          >
            <div class="flex items-center gap-3">
              <label class="flex cursor-pointer items-center gap-2 select-none text-xs sm:text-sm font-medium text-ink-700">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  :indeterminate.prop="isPartiallySelected"
                  data-testid="select-all-requests"
                  class="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  @change="toggleSelectAll"
                />
                <span>{{ isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}</span>
              </label>
              <span v-if="selectedBookingIds.length > 0" class="text-xs text-ink-500 font-num">
                (Đã chọn {{ selectedBookingIds.length }} / {{ cancellableBookings.length }})
              </span>
            </div>

            <div v-if="selectedBookingIds.length > 0" class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                @click="clearSelection"
              >
                Bỏ chọn
              </button>
              <FhButton
                variant="danger"
                size="sm"
                data-testid="bulk-cancel-button"
                :loading="bulkCancelling"
                @click="openBulkCancelDialog"
              >
                <Trash2 :size="14" class="mr-1.5" />
                Huỷ {{ selectedBookingIds.length }} yêu cầu
              </FhButton>
            </div>
          </div>

          <div class="space-y-2">
            <div v-if="loadingBookings" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải yêu cầu">
              <div v-for="i in 2" :key="i" class="px-5 py-4 space-y-2">
                <FhSkeleton width="50%" height="18px" />
                <FhSkeleton width="30%" height="14px" />
              </div>
            </div>

            <div
              v-else-if="bookingsTotal === 0"
              class="flex flex-col items-center justify-center rounded-2xl border border-ink-200 bg-white px-5 py-8 text-center"
            >
              <img
                :src="'/images/ui/empty-state-search-service.png'"
                alt=""
                class="w-20 h-20 object-contain mb-2 opacity-90 select-none pointer-events-none"
                loading="lazy"
              />
              <p data-testid="requests-empty" class="text-sm font-semibold text-ink-800">Không có yêu cầu đặt lịch ở mục này.</p>
              <p class="text-xs text-ink-500 mt-0.5">Yêu cầu đang tìm thợ hoặc chờ xác nhận sẽ hiển thị tại đây.</p>
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
                :class="{ 'bg-brand-50/25': selectedBookingIds.includes(booking.id) }"
                @click="router.push(`/app/bookings/${booking.id}`)"
                @keydown.enter="router.push(`/app/bookings/${booking.id}`)"
                @keydown.space.prevent="router.push(`/app/bookings/${booking.id}`)"
              >
                <!-- Selection checkbox on the left -->
                <div
                  v-if="canCancel(booking)"
                  class="flex shrink-0 items-center pr-1"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    :checked="selectedBookingIds.includes(booking.id)"
                    :data-testid="`select-booking-${booking.id}`"
                    :aria-label="`Chọn yêu cầu ${booking.serviceName}`"
                    class="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    @change="toggleSelectBooking(booking.id)"
                  />
                </div>
                <div
                  v-else
                  class="flex shrink-0 items-center pr-1 opacity-25 cursor-not-allowed"
                  title="Yêu cầu này đã huỷ, không thể chọn"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    disabled
                    class="h-4 w-4 rounded border-ink-200 cursor-not-allowed"
                  />
                </div>

                <div class="min-w-0 flex-1 space-y-1.5">
                  <div class="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <h3 class="font-semibold text-ink-900 truncate">{{ booking.serviceName }}</h3>
                      <span v-if="booking.quantity && booking.quantity > 1" class="shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700 font-num">
                        x{{ booking.quantity }}
                      </span>
                    </div>
                    <FhStatusPill
                      :status="booking.status === 'CANCELLED' ? 'CANCELLED' : isOverdue(booking) ? 'PENDING_APPROVAL' : 'PENDING'"
                      :label="pendingLabel(booking)"
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                    <span class="font-num shrink-0">{{ vnDateString(booking.createdAt) }}</span>
                    <template v-if="booking.preferredAt">
                      <span aria-hidden="true">·</span>
                      <span class="flex items-center gap-1 font-num text-ink-600">
                        <Clock :size="13" class="shrink-0 text-ink-400" />
                        <span>Hẹn: {{ vnDateTimeString(booking.preferredAt) }}</span>
                      </span>
                    </template>
                    <template v-if="booking.addressSummary">
                      <span aria-hidden="true">·</span>
                      <p class="flex min-w-0 items-center gap-1">
                        <MapPin :size="14" class="shrink-0 text-ink-400" />
                        <span class="truncate" :title="booking.addressSummary">{{ booking.addressSummary }}</span>
                      </p>
                    </template>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <button
                    v-if="canCancel(booking)"
                    type="button"
                    class="rounded-lg px-2.5 py-1 text-xs font-semibold text-danger-700 hover:bg-danger-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
                    :data-testid="`cancel-booking-btn-${booking.id}`"
                    @click.stop="openSingleCancel(booking)"
                  >
                    Huỷ
                  </button>
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
      <section v-else-if="listView === 'orders'" :key="`orders-${activeTab}`" class="space-y-3" data-testid="orders-section">
          <!-- Pending booking requests callout banner when viewing orders -->
          <Transition name="fh-fade-slide">
            <div
              v-if="pendingBookingsCount > 0 && (activeTab === 'ALL' || activeTab === 'IN_PROGRESS')"
              class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3.5 sm:p-4 transition-colors"
              data-testid="pending-requests-callout"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <Clock :size="20" />
                </div>
                <div class="min-w-0">
                  <p class="font-semibold text-brand-900 text-sm">
                    Bạn có {{ pendingBookingsCount }} yêu cầu đặt lịch đang tìm thợ
                  </p>
                  <p class="text-xs text-brand-700 truncate">
                    Hệ thống đang kết nối kỹ thuật viên phù hợp cho bạn
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 active:scale-95 transition-all duration-150"
                @click="chosenList = 'requests'"
              >
                <span>Xem yêu cầu</span>
                <ChevronRight :size="14" />
              </button>
            </div>
          </Transition>

          <div class="space-y-2">
            <div v-if="loadingOrders" class="rounded-2xl bg-white border border-ink-200 divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải đơn">
              <div v-for="i in 3" :key="i" class="px-5 py-4 space-y-2">
                <FhSkeleton width="55%" height="18px" />
                <FhSkeleton width="35%" height="14px" />
              </div>
            </div>

            <div
              v-else-if="ordersTotal === 0"
              class="flex flex-col items-center justify-center rounded-2xl border border-ink-200 bg-white px-5 py-8 text-center"
            >
              <img
                :src="'/images/ui/empty-state-search-service.png'"
                alt=""
                class="w-20 h-20 object-contain mb-2 opacity-90 select-none pointer-events-none"
                loading="lazy"
              />
              <p data-testid="orders-empty" class="text-sm font-semibold text-ink-800">Không có đơn sửa chữa ở mục này.</p>
              <p class="text-xs text-ink-500 mt-0.5">Đơn sửa chữa đang diễn ra sẽ hiển thị tại đây.</p>
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
      </Transition>
    </div>

    <RebookDialog
      :open="!!rebookFor"
      :booking-id="rebookFor?.bookingId ?? ''"
      :service-name="rebookFor?.serviceName"
      @close="rebookFor = null"
    />

    <!-- Floating bulk action bar -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform translate-y-6 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform translate-y-6 opacity-0"
    >
      <div
        v-if="selectedBookingIds.length > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-ink-200 bg-white/95 backdrop-blur-md px-5 py-3 shadow-xl"
        data-testid="floating-bulk-bar"
      >
        <div class="flex items-center gap-2 text-sm font-medium text-ink-900">
          <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white font-num">
            {{ selectedBookingIds.length }}
          </span>
          <span class="hidden sm:inline">yêu cầu đã chọn</span>
        </div>
        <div class="h-4 w-px bg-ink-200" />
        <button
          type="button"
          class="text-xs font-semibold text-ink-600 hover:text-ink-900 px-2 py-1 transition-colors"
          @click="clearSelection"
        >
          Bỏ chọn
        </button>
        <FhButton
          variant="danger"
          size="sm"
          :loading="bulkCancelling"
          @click="openBulkCancelDialog"
        >
          <Trash2 :size="14" class="mr-1.5" />
          Huỷ các yêu cầu
        </FhButton>
      </div>
    </transition>

    <!-- Confirm dialog for cancelling request(s) -->
    <FhConfirmDialog
      :open="showCancelDialog"
      :title="cancelDialogTitle"
      :consequence="cancelDialogConsequence"
      confirm-text="Xác nhận huỷ"
      cancel-text="Quay lại"
      :danger="true"
      :loading="bulkCancelling"
      @confirm="confirmCancel"
      @cancel="closeCancelDialog"
    >
      <div class="space-y-3 pt-2 text-sm text-ink-700">
        <label class="block font-medium text-ink-900">Lý do huỷ:</label>
        <div class="space-y-2">
          <label
            v-for="reasonOption in PRESET_CANCEL_REASONS"
            :key="reasonOption"
            class="flex items-center gap-2.5 cursor-pointer text-xs sm:text-sm text-ink-800"
          >
            <input
              v-model="cancelReasonSelected"
              type="radio"
              :value="reasonOption"
              class="text-brand-600 focus:ring-brand-500"
            />
            <span>{{ reasonOption }}</span>
          </label>
        </div>
        <input
          v-if="cancelReasonSelected === 'Lý do khác'"
          v-model="customCancelReason"
          type="text"
          maxlength="200"
          placeholder="Nhập lý do huỷ cụ thể..."
          class="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
        />
      </div>
    </FhConfirmDialog>
  </div>
</template>
