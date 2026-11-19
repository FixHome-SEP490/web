<script setup lang="ts">
// src/pages/customer/CustomerOrdersPage.vue
// Two server-paged lists (PO 12/10/2026): booking requests that no technician
// has taken yet, and repair orders. Each has its own numbered pager; the tab
// and both pages stay in the address bar (?tab=COMPLETED&page=2). One list is
// on screen at a time, picked by a two-way switch with both counts (?list=).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
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
import { getServiceArtworkUrl } from '../../utils/service-presentation';
import { ORDER_STATES, REQUEST_STATES, canCancelVisit, pickInitialList, staleWaiting, type OrdersTab } from './customer-orders-filters';
import { isArrivedWaiting, isVisitArrived, VISIT_DEVICE_ARRIVED_LABEL, VISIT_GROUP_ARRIVED_LABEL } from '../../utils/visit-arrival';

const PAGE_SIZE = 10;

const router = useRouter();
const chatStore = useChatStore();

type Tab = OrdersTab;
const TAB_KEYS: readonly Tab[] = ['ALL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const activeTab = useQueryChoice<Tab>('tab', TAB_KEYS, 'ALL');

// "Đặt lại thợ" from a completed or cancelled order, or a booking cancelled before any technician accepted.
const rebookFor = ref<{ bookingId: string; serviceName?: string } | null>(null);
const canRebookOrder = (order: ServiceOrderItem) => ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase());
// Searches on the server (order code, service, technician; accents ignored), kept as ?q=.
const { input: searchQuery, search } = useQuerySearch();

const emptyPage = <T,>(page: number, pageSize: number): Promise<PageResult<T>> =>
  Promise.resolve({ items: [], total: 0, page, pageSize });

// One request per page: the server filters by state and searches (order code, service,
// technician; accents ignored), so pages, totals and the newest-first order are exact
// (was: every state read separately and merged here, search matching only code and service).
function fetchOrdersPage(page: number, pageSize: number): Promise<PageResult<ServiceOrderItem>> {
  return ordersApi.getMyOrdersPage(page, pageSize, {
    statuses: ORDER_STATES[activeTab.value],
    search: search.value,
    excludeVisitGroups: true,
  });
}

async function fetchBookingsPage(page: number, pageSize: number): Promise<PageResult<BookingItem>> {
  const statuses = REQUEST_STATES[activeTab.value];
  if (statuses.length === 0) return emptyPage<BookingItem>(page, pageSize);
  // A booking whose order was cancelled is that cancelled order, never also a cancelled request.
  return bookingsApi.getMyBookingsPage(page, pageSize, { statuses, search: search.value, excludeVisitGroups: true, withoutOrder: true });
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
// Lock initial auto-picked list once on first unfiltered ALL load so filtering/searching never jumps across lists.
const initialListPicked = ref<ListView | null>(null);
const listView = computed<ListView>(() => {
  if (chosenList.value) return chosenList.value;
  if (initialListPicked.value) return initialListPicked.value;
  if (!loadingOrders.value && ordersTotal.value === 0) {
    if (!loadingBookings.value && bookingsTotal.value > 0) return 'requests';
    if (!loadingVisitGroups.value && visitGroupsTotal.value > 0) return 'visits';
  }
  return 'orders';
});
watch(
  [loadingOrders, loadingBookings, loadingVisitGroups, ordersTotal, bookingsTotal, visitGroupsTotal],
  ([ordLoading, reqLoading, visitLoading, ordTotal, reqTotal, visTotal]) => {
    if (chosenList.value || initialListPicked.value || activeTab.value !== 'ALL' || search.value) return;
    const picked = pickInitialList({
      orders: { loading: ordLoading, total: ordTotal },
      requests: { loading: reqLoading, total: reqTotal, statuses: bookings.value.map((b) => String(b.status)) },
      visits: { loading: visitLoading, total: visTotal, statuses: visitGroups.value.map((g) => String(g.status)) },
    });
    if (picked) initialListPicked.value = picked;
  },
  { immediate: true },
);
const listChoices = computed(() => [
  { key: 'orders' as const, label: 'Đơn sửa chữa', shortLabel: 'Đơn sửa', count: ordersTotal.value, loading: loadingOrders.value },
  { key: 'requests' as const, label: 'Yêu cầu đặt lịch', shortLabel: 'Đặt lịch', count: bookingsTotal.value, loading: loadingBookings.value },
  { key: 'visits' as const, label: 'Lượt sửa nhiều thiết bị', shortLabel: 'Nhiều thiết bị', count: visitGroupsTotal.value, loading: loadingVisitGroups.value },
]);
function switchList(choice: ListView) {
  chosenList.value = choice;
  if (choice === 'requests' && activeTab.value === 'COMPLETED') {
    activeTab.value = 'ALL';
  }
}

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
  if (!chosenList.value) {
    chosenList.value = listView.value;
  }
  activeTab.value = key;
  const el = tabRefs.value[key];
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

watch(search, (next) => {
  if (next && !chosenList.value) {
    chosenList.value = listView.value;
  }
});

// ── Computed & Count ──
const loading = computed(() => loadingOrders.value && loadingBookings.value && loadingVisitGroups.value);
const hasError = computed(() => !!(ordersError.value || bookingsError.value));

// Count only the currently selected list's items on "Tất cả (N)" so orders & requests never mix.
const ordersAllCount = ref<number | null>(null);
const requestsAllCount = ref<number | null>(null);

watch(
  [ordersTotal, bookingsTotal, loadingOrders, loadingBookings, hasError, activeTab],
  () => {
    if (activeTab.value === 'ALL' && !loadingOrders.value && !ordersError.value) {
      ordersAllCount.value = ordersTotal.value;
    }
    if (activeTab.value === 'ALL' && !loadingBookings.value && !bookingsError.value) {
      requestsAllCount.value = bookingsTotal.value;
    }
  },
  { immediate: true },
);

const activeListAllCount = computed(() =>
  listView.value === 'requests' ? requestsAllCount.value : ordersAllCount.value,
);

const statusTabs = computed(() => {
  const allLabel = activeListAllCount.value === null ? 'Tất cả' : `Tất cả (${activeListAllCount.value})`;
  const list: { key: Tab; label: string }[] = [
    { key: 'ALL', label: allLabel },
    { key: 'IN_PROGRESS', label: 'Đang xử lý' },
  ];
  if (listView.value !== 'requests') {
    list.push({ key: 'COMPLETED', label: 'Hoàn tất' });
  }
  list.push({ key: 'CANCELLED', label: 'Đã huỷ' });
  return list;
});

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

watch([activeTab, activeListAllCount, listView], () => {
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
// "Huỷ lượt" on a multi-device visit nobody holds yet (PO 19/11/2026); same dialog and reasons.
const targetVisit = ref<VisitGroupPageItem | null>(null);
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

function openVisitCancel(group: VisitGroupPageItem) {
  targetSingleBooking.value = null;
  targetVisit.value = group;
  cancelReasonSelected.value = 'Thay đổi nhu cầu / kế hoạch';
  customCancelReason.value = '';
  showCancelDialog.value = true;
}

function openSingleCancel(booking: BookingItem) {
  targetVisit.value = null;
  targetSingleBooking.value = booking;
  cancelReasonSelected.value = 'Thay đổi nhu cầu / kế hoạch';
  customCancelReason.value = '';
  showCancelDialog.value = true;
}

function closeCancelDialog() {
  if (bulkCancelling.value) return;
  showCancelDialog.value = false;
  targetSingleBooking.value = null;
  targetVisit.value = null;
}

const cancelDialogTitle = computed(() => {
  if (targetVisit.value) return 'Huỷ lượt sửa';
  if (targetSingleBooking.value) {
    return 'Huỷ yêu cầu đặt lịch';
  }
  return `Huỷ ${selectedBookingIds.value.length} yêu cầu đặt lịch`;
});

const cancelDialogConsequence = computed(() => {
  if (targetVisit.value) {
    return `Bạn có chắc muốn huỷ lượt sửa ${targetVisit.value.items.length} thiết bị? Hệ thống sẽ ngừng tìm thợ cho cả lượt này.`;
  }
  if (targetSingleBooking.value) {
    return `Bạn có chắc muốn huỷ yêu cầu "${targetSingleBooking.value.serviceName}"? Hệ thống sẽ ngừng tìm thợ cho yêu cầu này.`;
  }
  return `Bạn đang chọn huỷ ${selectedBookingIds.value.length} yêu cầu đặt lịch đã chọn. Hệ thống sẽ ngừng tìm thợ cho các yêu cầu này.`;
});

async function confirmVisitCancel(group: VisitGroupPageItem, reason: string) {
  bulkCancelling.value = true;
  try {
    await visitGroupsApi.cancel(group.id, reason);
    toast.success('Đã huỷ lượt sửa.');
    showCancelDialog.value = false;
    targetVisit.value = null;
    await retryVisitGroups();
  } catch {
    toast.error('Chưa huỷ được lượt sửa. Vui lòng thử lại.');
  } finally {
    bulkCancelling.value = false;
  }
}

async function confirmCancel() {
  if (targetVisit.value) {
    if (bulkCancelling.value) return;
    const visitReason = cancelReasonSelected.value === 'Lý do khác'
      ? (customCancelReason.value.trim() || 'Khách hàng huỷ lượt sửa')
      : cancelReasonSelected.value;
    await confirmVisitCancel(targetVisit.value, visitReason);
    return;
  }
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
// ── Waiting too long (PO 19/11/2026) ──
// Requests and visits still waiting for a technician after 24 hours, read from the pages
// on hand (active ones come first from the server), so a waiting state never hides.
const staleItems = computed(() => staleWaiting(bookings.value, visitGroups.value, Date.now()));
const staleReminder = computed(() => {
  const items = staleItems.value;
  if (!items.length) return null;
  const visits = items.filter((i) => i.kind === 'visit').length;
  const requests = items.length - visits;
  const parts = [requests ? `${requests} yêu cầu` : '', visits ? `${visits} lượt sửa` : ''].filter(Boolean).join(' và ');
  return { text: `Bạn có ${parts} chờ thợ hơn 24 giờ.`, oldest: items[0] };
});
function viewStale() {
  const oldest = staleReminder.value?.oldest;
  if (oldest) switchList(oldest.kind === 'visit' ? 'visits' : 'requests');
}
function cancelStale() {
  const oldest = staleReminder.value?.oldest;
  if (!oldest) return;
  if (oldest.kind === 'visit') {
    const group = visitGroups.value.find((g) => g.id === oldest.id);
    if (group) openVisitCancel(group);
  } else {
    const booking = bookings.value.find((b) => b.id === oldest.id);
    if (booking) openSingleCancel(booking);
  }
}
</script>

<template>
  <div class="w-full space-y-5 pb-12">
    <header class="relative overflow-hidden rounded-2xl border border-ink-200/85 bg-white px-5 py-5 sm:px-6 sm:py-6 min-h-[7rem] flex items-center animate-slide-up">
      <div
        class="pointer-events-none select-none absolute inset-y-0 right-0 w-24 sm:w-36 flex items-center justify-center overflow-hidden opacity-35 sm:opacity-95"
        aria-hidden="true"
      >
        <div class="absolute inset-0 bg-gradient-to-l from-brand-50/90 via-brand-50/35 to-transparent" />
        <img
          :src="'/images/ui/customer-orders-board.png'"
          alt=""
          data-testid="orders-header-artwork"
          class="relative h-20 w-20 sm:h-28 sm:w-28 object-contain object-center p-2"
          loading="lazy"
        />
      </div>
      <div class="relative z-10 pr-20 sm:pr-36 space-y-1">
        <h1 class="text-2xl sm:text-[28px] font-bold tracking-tight text-ink-900">Đơn của tôi</h1>
        <p class="text-sm text-ink-600">Theo dõi yêu cầu đặt lịch, đơn sửa chữa đang thực hiện và các lượt nhiều thiết bị.</p>
      </div>
    </header>

    <div
      v-if="staleReminder"
      data-testid="stale-waiting-reminder"
      class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2.5 text-sm text-warning-800"
    >
      <span class="flex min-w-0 items-center gap-2">
        <Clock :size="16" class="shrink-0" aria-hidden="true" />
        <span>{{ staleReminder.text }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <button type="button" data-testid="stale-waiting-view" class="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold hover:bg-warning-100" @click="viewStale">Xem</button>
        <button type="button" data-testid="stale-waiting-cancel" class="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold hover:bg-warning-100" @click="cancelStale">Huỷ</button>
      </span>
    </div>

    <div class="relative animate-slide-up-delay-1">
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

    <!-- Primary view switcher (Level 1): Đơn sửa chữa | Yêu cầu đặt lịch | Nhiều thiết bị -->
    <div
      v-if="!loading"
      class="inline-flex w-full sm:w-auto max-w-full gap-1 overflow-x-auto scrollbar-none rounded-xl bg-ink-100/85 p-1 animate-slide-up-delay-1"
      role="group"
      aria-label="Chọn danh sách"
    >
      <button
        v-for="choice in listChoices"
        :key="choice.key"
        type="button"
        class="flex h-9 min-w-[5.5rem] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-3.5 sm:text-sm cursor-pointer"
        :class="listView === choice.key ? 'bg-white text-brand-700 shadow-2xs' : 'text-ink-600 hover:text-ink-900'"
        :aria-pressed="listView === choice.key"
        :aria-label="choice.label"
        :data-testid="`list-switch-${choice.key}`"
        @click="switchList(choice.key)"
      >
        <span class="truncate whitespace-nowrap sm:hidden">{{ choice.shortLabel }}</span>
        <span class="hidden truncate whitespace-nowrap sm:inline">{{ choice.label }}</span>
        <span
          v-if="!choice.loading"
          class="shrink-0 rounded-full px-1.5 py-0.5 font-num text-[11px] leading-none transition-colors"
          :class="listView === choice.key ? 'bg-brand-50 text-brand-700' : 'bg-white/80 text-ink-600'"
        >{{ choice.count }}</span>
      </button>
    </div>

    <!-- Secondary status filter bar (Level 2): scoped strictly to the active list -->
    <div
      v-if="listView !== 'visits'"
      ref="tabListRef"
      class="relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-ink-100 p-1 select-none scrollbar-none animate-slide-up-delay-1"
      role="tablist"
      :aria-label="listView === 'requests' ? 'Lọc yêu cầu đặt lịch' : 'Lọc đơn sửa chữa'"
    >
      <!-- Sliding active background pill -->
      <div
        class="pointer-events-none absolute top-0 left-0 rounded-lg bg-white shadow-xs transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        :style="indicatorStyle"
        aria-hidden="true"
      />

      <button
        v-for="tab in statusTabs"
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
    <div v-if="!loading && hasError" class="space-y-2 animate-slide-up-delay-2">
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
      class="space-y-2 rounded-2xl border border-ink-200 bg-white p-5 animate-slide-up-delay-2"
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
      class="space-y-3 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center animate-slide-up-delay-2"
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

    <div v-else class="space-y-4 animate-slide-up-delay-2">
      <Transition name="fh-fade-slide" mode="out-in">
      <!-- One server-paged parent row per multi-device visit. -->
      <section v-if="listView === 'visits'" key="visits" class="space-y-3" data-testid="visit-groups-section">
        <div
          v-if="visitGroupsError"
          role="alert"
          class="flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
        >
          <span>{{ visitGroupsError }}</span>
          <button type="button" class="h-9 shrink-0 rounded-lg px-2 font-semibold hover:bg-danger-100" :disabled="loadingVisitGroups" @click="retryVisitGroups">Thử lại</button>
        </div>
        <div v-if="loadingVisitGroups" class="space-y-3 rounded-2xl border border-ink-200/80 bg-white p-5" aria-busy="true" aria-label="Đang tải lượt sửa nhiều thiết bị">
          <FhSkeleton width="55%" height="18px" />
          <FhSkeleton width="75%" height="14px" />
          <FhSkeleton width="45%" height="14px" />
        </div>
        <p v-else-if="!visitGroupsError && visitGroupsTotal === 0" data-testid="visit-groups-empty" class="rounded-2xl border border-ink-200/80 bg-white px-5 py-8 text-center text-sm text-ink-500">
          Chưa có lượt sửa nhiều thiết bị.
        </p>
        <ul v-else-if="visitGroups.length" class="space-y-3 transition-opacity" :class="{ 'opacity-60': changingVisitGroupsPage }" :aria-busy="changingVisitGroupsPage">
          <li
            v-for="(group, idx) in visitGroups"
            :key="group.id"
            :data-testid="`visit-group-card-${group.id}`"
            class="animate-slide-up rounded-2xl border border-ink-200/85 bg-white p-4 sm:p-5 space-y-3.5 shadow-2xs transition-[border-color,box-shadow] duration-200 hover:border-brand-300/80 hover:shadow-sm"
            :style="{ animationDelay: `${Math.min(idx, 6) * 35}ms` }"
          >
            <div class="flex items-start gap-3.5">
              <div
                class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-brand-50/70 border border-brand-100/80 flex items-center justify-center shrink-0 p-1.5 overflow-hidden"
              >
                <img
                  :src="getServiceArtworkUrl({ name: group.items[0]?.serviceName || group.items[0]?.deviceLabel })"
                  :alt="group.items[0]?.serviceName || `Lượt sửa ${group.items.length} thiết bị`"
                  class="w-full h-full object-contain select-none pointer-events-none"
                  loading="lazy"
                />
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span :class="`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${visitGroupStatus(group).tone}`" :aria-label="`Trạng thái lượt sửa: ${visitGroupStatus(group).label}`">
                    {{ visitGroupStatus(group).label }}
                  </span>
                  <span :data-testid="`visit-group-time-${group.id}`" class="text-xs text-ink-500 font-num">
                    Tạo {{ vnDateString(group.createdAt) }} · Hẹn <span class="font-medium text-ink-700">{{ group.scheduledAt ? vnDateTimeString(group.scheduledAt) : 'Chưa xác định' }}</span>
                  </span>
                </div>
                <h2 class="text-base font-bold text-ink-900">Lượt sửa · {{ group.items.length }} thiết bị</h2>
              </div>
            </div>
            <ul class="grid gap-2 sm:grid-cols-2" aria-label="Thiết bị trong lượt sửa">
              <li
                v-for="item in group.items"
                :key="item.itemId"
                :data-testid="`visit-group-device-${group.id}-${item.sequence}`"
                class="flex min-w-0 items-center justify-between gap-2.5 rounded-xl bg-ink-50/80 px-3 py-2 text-sm"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <div class="h-9 w-9 shrink-0 rounded-lg bg-white border border-ink-200/75 p-1 flex items-center justify-center overflow-hidden">
                    <img
                      :src="getServiceArtworkUrl({ name: item.serviceName || item.deviceLabel })"
                      :alt="item.serviceName || item.deviceLabel || `Thiết bị ${item.sequence}`"
                      class="w-full h-full object-contain select-none pointer-events-none"
                      loading="lazy"
                    />
                  </div>
                  <span class="min-w-0 flex-1 truncate text-ink-800">
                    <span class="font-medium">{{ item.deviceLabel || `Thiết bị ${item.sequence}` }}</span>
                    <span v-if="item.serviceName" class="text-ink-500"> · {{ item.serviceName }}</span>
                  </span>
                </div>
                <span :class="`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${visitItemStatus(item).tone}`" :aria-label="`Trạng thái thiết bị: ${visitItemStatus(item).label}`">
                  {{ visitItemStatus(item).label }}
                </span>
              </li>
            </ul>
            <div class="flex justify-end gap-1 border-t border-ink-100 pt-2.5">
              <button
                v-if="canCancelVisit(group.status)"
                type="button"
                class="inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 cursor-pointer"
                :data-testid="`cancel-visit-btn-${group.id}`"
                @click.stop="openVisitCancel(group)"
              >
                Huỷ lượt
              </button>
              <router-link :to="`/app/visits/${group.id}`" :data-testid="`visit-group-open-${group.id}`" class="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs sm:text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Xem lượt sửa <ChevronRight :size="15" aria-hidden="true" />
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
            class="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-ink-200/80 bg-white px-4 py-2.5 transition-colors"
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

          <div class="space-y-3">
            <div v-if="loadingBookings" class="space-y-3" aria-busy="true" aria-label="Đang tải yêu cầu">
              <div v-for="i in 2" :key="i" class="rounded-2xl bg-white border border-ink-200/80 p-4 sm:p-5 space-y-2">
                <FhSkeleton width="50%" height="18px" />
                <FhSkeleton width="30%" height="14px" />
              </div>
            </div>

            <div
              v-else-if="bookingsTotal === 0"
              class="flex flex-col items-center justify-center rounded-2xl border border-ink-200/80 bg-white px-5 py-10 text-center"
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
              class="space-y-3 transition-opacity"
              :class="{ 'opacity-60': changingBookingsPage }"
              :aria-busy="changingBookingsPage"
            >
              <li
                v-for="(booking, idx) in bookings"
                :key="booking.id"
                :data-testid="`booking-card-${booking.id}`"
                role="link"
                tabindex="0"
                class="animate-slide-up group rounded-2xl border bg-white p-4 sm:p-5 shadow-2xs transition-[border-color,box-shadow,background-color] duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                :style="{ animationDelay: `${Math.min(idx, 6) * 35}ms` }"
                :class="selectedBookingIds.includes(booking.id)
                  ? 'border-brand-500/70 bg-brand-50/20'
                  : 'border-ink-200/85 hover:border-brand-300/80 hover:shadow-sm'"
                @click="router.push(`/app/bookings/${booking.id}`)"
                @keydown.enter="router.push(`/app/bookings/${booking.id}`)"
                @keydown.space.prevent="router.push(`/app/bookings/${booking.id}`)"
              >
                <div class="flex items-start gap-3">
                  <!-- Selection checkbox only when cancellable -->
                  <div
                    v-if="canCancel(booking)"
                    class="flex shrink-0 items-center pt-1"
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
                    class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-brand-50/70 border border-brand-100/80 flex items-center justify-center shrink-0 p-1.5 overflow-hidden"
                  >
                    <img
                      :src="getServiceArtworkUrl({ name: booking.serviceName })"
                      :alt="booking.serviceName"
                      class="w-full h-full object-contain select-none pointer-events-none group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform duration-150 ease-out"
                      loading="lazy"
                    />
                  </div>

                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div class="min-w-0 flex-1 space-y-0.5">
                        <div class="flex items-center gap-2 min-w-0">
                          <h3 class="text-base sm:text-[17px] font-semibold text-ink-900 group-hover:text-brand-600 transition-colors truncate">
                            {{ booking.serviceName }}
                          </h3>
                          <span v-if="booking.quantity && booking.quantity > 1" class="shrink-0 rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-700 font-num font-semibold">
                            ×{{ booking.quantity }}
                          </span>
                        </div>
                        <p class="flex items-center gap-1.5 font-num text-xs text-ink-500">
                          <Clock :size="13" class="text-ink-400 shrink-0" />
                          <span>Đặt {{ vnDateString(booking.createdAt) }}</span>
                        </p>
                      </div>
                      <FhStatusPill
                        :status="booking.status === 'CANCELLED' ? 'CANCELLED' : isOverdue(booking) ? 'PENDING_APPROVAL' : 'PENDING'"
                        :label="pendingLabel(booking)"
                        class="shrink-0"
                      />
                    </div>

                    <div v-if="booking.preferredAt || booking.addressSummary" class="rounded-xl bg-ink-50/75 px-3 py-2 space-y-0.5 text-xs sm:text-sm">
                      <p v-if="booking.preferredAt" class="font-num font-medium text-ink-800">
                        <span class="text-ink-400 font-normal">Lịch hẹn:</span> {{ vnDateTimeString(booking.preferredAt) }}
                      </p>
                      <p v-if="booking.addressSummary" class="text-ink-600 truncate" :title="booking.addressSummary">
                        <span class="text-ink-400">Địa chỉ:</span> {{ booking.addressSummary }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Quiet bottom actions row -->
                <div
                  v-if="canCancel(booking) || booking.status === 'CANCELLED'"
                  class="mt-3 pt-2.5 border-t border-ink-100 flex items-center justify-end gap-2.5"
                >
                  <button
                    v-if="canCancel(booking)"
                    type="button"
                    class="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 cursor-pointer"
                    :data-testid="`cancel-booking-btn-${booking.id}`"
                    @click.stop="openSingleCancel(booking)"
                  >
                    Huỷ yêu cầu
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
          <div class="space-y-3">
            <div v-if="loadingOrders" class="space-y-3" aria-busy="true" aria-label="Đang tải đơn">
              <div v-for="i in 3" :key="i" class="rounded-2xl bg-white border border-ink-200/80 p-4 sm:p-5 space-y-2">
                <FhSkeleton width="55%" height="18px" />
                <FhSkeleton width="35%" height="14px" />
              </div>
            </div>

            <div
              v-else-if="ordersTotal === 0"
              class="flex flex-col items-center justify-center rounded-2xl border border-ink-200/80 bg-white px-5 py-10 text-center"
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
              class="space-y-3 transition-opacity"
              :class="{ 'opacity-60': changingOrdersPage }"
              :aria-busy="changingOrdersPage"
            >
              <li
                v-for="(order, idx) in orders"
                :key="order.id"
                :data-testid="`order-card-${order.id}`"
                role="link"
                tabindex="0"
                class="animate-slide-up group rounded-2xl border border-ink-200/85 bg-white p-4 sm:p-5 shadow-2xs transition-[border-color,box-shadow] duration-200 cursor-pointer hover:border-brand-300/80 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                :style="{ animationDelay: `${Math.min(idx, 6) * 35}ms` }"
                @click="router.push(`/app/orders/${order.id}`)"
                @keydown.enter="router.push(`/app/orders/${order.id}`)"
                @keydown.space.prevent="router.push(`/app/orders/${order.id}`)"
              >
                <div class="flex items-start gap-3.5">
                  <div
                    class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-brand-50/70 border border-brand-100/80 flex items-center justify-center shrink-0 p-1.5 overflow-hidden"
                  >
                    <img
                      :src="getServiceArtworkUrl({ name: order.serviceName })"
                      :alt="order.serviceName"
                      class="w-full h-full object-contain select-none pointer-events-none group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform duration-150 ease-out"
                      loading="lazy"
                    />
                  </div>

                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex items-start justify-between gap-2.5">
                      <div class="min-w-0 flex-1 space-y-0.5">
                        <h3 class="text-base sm:text-[17px] font-semibold text-ink-900 group-hover:text-brand-600 transition-colors text-pretty leading-snug">
                          {{ order.serviceName }}
                        </h3>
                        <p class="font-num text-xs font-medium text-ink-500 whitespace-nowrap truncate">
                          #{{ order.code || order.id.slice(0, 8) }}
                        </p>
                        <p class="flex items-center gap-1.5 font-num text-xs text-ink-500 whitespace-nowrap">
                          <Clock :size="13" class="text-ink-400 shrink-0" />
                          <span>{{ vnDateString(order.createdAt) }}</span>
                        </p>
                      </div>

                      <FhStatusPill
                        :status="orderPill(order).status"
                        :label="orderPill(order).label"
                        class="shrink-0"
                      />
                    </div>

                    <div class="flex items-center gap-2.5 rounded-xl bg-ink-50/75 px-3 py-2 text-xs sm:text-sm">
                      <template v-if="order.technician">
                        <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                          {{ order.technician.fullName.charAt(0) }}
                        </span>
                        <span class="min-w-0 truncate font-medium text-ink-800">{{ order.technician.fullName }}</span>
                        <span v-if="formatRating(order.technician.averageRating)" class="text-ink-500 whitespace-nowrap font-num">★ {{ formatRating(order.technician.averageRating) }}</span>
                      </template>
                      <span v-else-if="awaitingReplacement(order)" class="text-ink-600">Thợ trước đã rút, FixHome đang tìm thợ khác</span>
                      <span v-else class="text-ink-500">Chưa phân công kỹ thuật viên</span>
                    </div>
                  </div>
                </div>

                <!-- Price + Actions bar -->
                <div
                  class="mt-3 pt-2.5 border-t border-ink-100 flex flex-wrap items-center justify-between gap-2.5"
                >
                  <div class="shrink-0">
                    <span v-if="Number(order.grandTotal) > 0" class="whitespace-nowrap font-num text-base sm:text-[17px] font-bold text-brand-600">
                      <FhMoney :amount="order.grandTotal" />
                    </span>
                    <span v-else class="text-xs font-medium text-ink-400 whitespace-nowrap">Chờ báo giá</span>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 ml-auto">
                    <button
                      v-if="order.technician"
                      type="button"
                      class="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-600 cursor-pointer"
                      aria-label="Nhắn tin với kỹ thuật viên"
                      title="Nhắn tin với kỹ thuật viên"
                      @click="(e) => handleChat(order, e)"
                    >
                      <MessageSquare :size="14" />
                      <span>Nhắn tin</span>
                    </button>
                    <FhButton
                      v-if="canRebookOrder(order)"
                      variant="secondary"
                      size="sm"
                      :data-testid="`rebook-order-${order.id}`"
                      @click.stop="rebookFor = { bookingId: order.bookingId, serviceName: order.serviceName }"
                    >
                      Đặt lại
                    </FhButton>
                    <span class="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 group-hover:text-brand-700 transition-colors pl-1">
                      <span>Chi tiết</span>
                      <ChevronRight :size="15" />
                    </span>
                  </div>
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
          maxlength="2000"
          placeholder="Nhập lý do huỷ cụ thể..."
          class="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
        />
      </div>
    </FhConfirmDialog>
  </div>
</template>
