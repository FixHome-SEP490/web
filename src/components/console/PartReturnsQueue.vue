<script setup lang="ts">
/**
 * Hoàn trả linh kiện – FixHome Console (Service Manager)
 * Thiết kế giao diện hiện đại theo Ảnh 1:
 * - 4 Stat cards: Đơn đã lấy linh kiện, Đang sử dụng, Chờ hoàn trả, Đã hoàn trả
 * - Bộ lọc Tabs, Tìm kiếm, Thời gian, Trạng thái
 * - Bảng danh sách gom theo từng đơn sửa chữa đã nhận linh kiện
 * - Panel xem nhanh chi tiết đơn bên phải (độc lập loading)
 * - Tương thích 100% các nghiệp vụ custody, bảo hành, lịch sử và unit test.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Hourglass,
  Package,
  PackageCheck,
  Search,
  Undo2,
  User,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '..';
import ConsolePagination from './ConsolePagination.vue';
import LegacyManualReviewForm from './LegacyManualReviewForm.vue';
import FaultyPartInspectionModal from './FaultyPartInspectionModal.vue';
import PartReturnProcessModal from './PartReturnProcessModal.vue';
import { consoleField } from './console-ui';
import { useAuthStore } from '../../stores/auth';
import {
  partRequestsApi,
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  type LegacyManualReviewRecord,
  type PartCustodyReturnRecord,
  type PartRequest,
} from '../../api/part-requests.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';
import { partCustodyQuantities } from '../../utils/part-custody-quantities';
import { usePartReturnsRefresh } from '../../composables/usePartReturnsRefresh';
import {
  buildOrderReturnSummary,
  type OrderPartReturnSummary,
  type PartReturnLineItem,
} from '../../utils/order-part-returns';

const emit = defineEmits<{ (e: 'count', value: number | null): void }>();

const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));

// Custody Return Queue state
const returnQueue = ref<PartCustodyReturnRecord[]>([]);
const warehouseAcceptedRequests = ref<Record<string, boolean>>({});
const returnsLoading = ref(true);
const returnsUnavailable = ref(false);
const returnsLoadError = ref(false);
let returnsLoadVersion = 0;
const acceptDrafts = ref<Record<string, number>>({});
const acceptingKey = ref<string | null>(null);
const toastMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Order metadata cache
const cachedOrders = ref<Record<string, ServiceOrderItem>>({});

// Legacy Manual Review state
const legacyRows = ref<LegacyManualReviewRecord[]>([]);
const legacyLoading = ref(true);
const legacyUnavailable = ref(false);
const legacyLoadError = ref(false);
const legacyPage = ref(1);
const legacyPageSize = 20;
const legacyTotal = ref(0);
const legacyTotalPages = computed(() => Math.max(1, Math.ceil(legacyTotal.value / legacyPageSize)));
let legacyLoadVersion = 0;

// Faulty parts warranty state
const faultyRows = ref<PartRequest[]>([]);
const faultyDone = ref<PartRequest[]>([]);
const inspectionRequest = ref<PartRequest | null>(null);

// Filter and Pagination state
const activeTab = ref<'all' | 'awaiting' | 'in_use' | 'returned'>('all');
const searchQuery = ref('');
const timeFilter = ref<'all' | 'today' | '7d' | '30d'>('all');
const statusFilter = ref<'all' | 'awaiting_return' | 'in_use' | 'returned'>('all');

const currentPage = ref(1);
const pageSize = 10;

// Quick view panel state
const selectedOrderId = ref<string | null>(null);
const panelLoading = ref(false);

// Return modal state
const modalOpen = ref(false);
const activeModalItem = ref<PartReturnLineItem | null>(null);

const returnKey = (row: PartCustodyReturnRecord) => `${row.partRequestId}:${row.partRequestItemId}`;
const pendingDeclaredQty = (row: PartCustodyReturnRecord) => partCustodyQuantities(row).awaitingManager;
const maxAcceptQty = (row: PartCustodyReturnRecord) => Math.max(0, Math.min(row.outstandingQty, pendingDeclaredQty(row)));
const returnRequestCode = (row: PartCustodyReturnRecord) => `PR-${row.partRequestId.substring(0, 8).toUpperCase()}`;

const technicianRef = (row: PartCustodyReturnRecord) => {
  const name = row.technicianId ? (row.technicianName ?? '').trim() : '';
  if (name) return name;
  return row.technicianId ? `KT-${row.technicianId.substring(0, 8).toUpperCase()}` : '—';
};

const legacyRequestCode = (row: LegacyManualReviewRecord) => `PR-${row.partRequestId.substring(0, 8).toUpperCase()}`;
const legacyTechnicianRef = (row: LegacyManualReviewRecord) => `KT-${row.technicianId.substring(0, 8).toUpperCase()}`;

const showToast = (type: 'success' | 'error', text: string) => {
  toastMessage.value = { type, text };
  setTimeout(() => {
    if (toastMessage.value?.text === text) toastMessage.value = null;
  }, 4000);
};

// Faulty Parts methods
const resultLabel = (v?: string | null) =>
  v === 'manufacturer'
    ? 'Lỗi nhà sản xuất, FixHome chịu'
    : v === 'installation'
      ? 'Do lắp đặt, thợ trả tiền'
      : 'Không xác định, FixHome chịu';

const loadFaulty = async () => {
  try {
    const result = await partRequestsApi.getAll({ requestType: 'warranty', pageSize: 50 });
    const returned = result.data.filter((r) => ['received', 'completed'].includes(r.status.toLowerCase()));
    faultyRows.value = returned.filter((r) => !r.faultyInspectionResult);
    faultyDone.value = returned.filter((r) => !!r.faultyInspectionResult);
  } catch {
    faultyRows.value = [];
    faultyDone.value = [];
  }
};

const faultyTone = (r: PartRequest) =>
  r.faultyReturnedAt
    ? 'bg-warning-50 text-warning-800'
    : r.faultyReturnDueAt && new Date(r.faultyReturnDueAt).getTime() < Date.now()
      ? 'bg-danger-50 text-danger-800'
      : 'bg-ink-100 text-ink-700';

const faultyStatus = (r: PartRequest) => {
  if (r.faultyReturnedAt) return 'Thợ đã nộp, chờ kiểm tra';
  if (!r.faultyReturnDueAt) return 'Chờ thợ nhận linh kiện thay thế';
  return `${new Date(r.faultyReturnDueAt).getTime() < Date.now() ? 'Quá hạn nộp' : 'Hạn nộp'} ${vnDateTimeString(r.faultyReturnDueAt)}${r.faultyReturnChargedAt ? ', đã trừ ví thợ' : ''}`;
};

const onInspected = () => {
  inspectionRequest.value = null;
  showToast('success', 'Đã lưu kết quả kiểm tra linh kiện hỏng.');
  void loadFaulty();
};

// Legacy Review methods
const loadLegacyReview = async () => {
  const version = ++legacyLoadVersion;
  if (!canOperate.value) {
    legacyRows.value = [];
    legacyTotal.value = 0;
    legacyLoading.value = false;
    legacyUnavailable.value = true;
    legacyLoadError.value = false;
    return;
  }
  legacyLoading.value = true;
  legacyLoadError.value = false;
  legacyUnavailable.value = false;
  try {
    const result = await partRequestsApi.getLegacyManualReview({ page: legacyPage.value, pageSize: legacyPageSize });
    if (version !== legacyLoadVersion) return;
    legacyRows.value = result.data;
    legacyTotal.value = result.total;
    if (result.page > legacyTotalPages.value) {
      legacyPage.value = legacyTotalPages.value;
      void loadLegacyReview();
      return;
    }
  } catch (err: unknown) {
    if (version !== legacyLoadVersion) return;
    legacyRows.value = [];
    legacyTotal.value = 0;
    if (isPartReturnsUnavailableError(err)) legacyUnavailable.value = true;
    else legacyLoadError.value = true;
  } finally {
    if (version === legacyLoadVersion) legacyLoading.value = false;
  }
};

const changeLegacyPage = (next: number) => {
  legacyPage.value = Math.min(Math.max(1, next), legacyTotalPages.value);
  void loadLegacyReview();
};

// Pending returns lines
const awaiting = computed(() => returnQueue.value.filter((row) => maxAcceptQty(row) > 0));
const undeclared = computed(() => returnQueue.value.filter((row) => maxAcceptQty(row) === 0 && row.outstandingQty > 0));

function byRequest(rows: PartCustodyReturnRecord[]) {
  const grouped = new Map<string, PartCustodyReturnRecord[]>();
  for (const row of rows) {
    const key = row.orderId || row.partRequestId;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return [...grouped.entries()].map(([id, list]) => ({ id, first: list[0], rows: list }));
}

const groups = computed(() => byRequest(awaiting.value));
const heldGroups = computed(() => byRequest(undeclared.value));

// Grouping into Order-level summaries
const orderGroups = computed<OrderPartReturnSummary[]>(() => {
  const orderMap = new Map<string, PartCustodyReturnRecord[]>();
  for (const r of returnQueue.value) {
    const key = r.orderId || r.partRequestId;
    const existing = orderMap.get(key) || [];
    existing.push(r);
    orderMap.set(key, existing);
  }

  return Array.from(orderMap.entries()).map(([orderId, records]) => {
    const cachedOrder = cachedOrders.value[orderId] || null;
    return buildOrderReturnSummary(orderId, records, cachedOrder);
  });
});

// Statistics derived strictly from real loaded system data
const statTotalOrders = computed(() => orderGroups.value.length);
const statInUseOrders = computed(() => orderGroups.value.filter((o) => o.returnStatus === 'in_use').length);
const statAwaitingOrders = computed(() => orderGroups.value.filter((o) => o.returnStatus === 'awaiting_return').length);
const statReturnedOrders = computed(() => orderGroups.value.filter((o) => o.returnStatus === 'returned').length);

// Selected Order for quick view panel
const selectedOrder = computed<OrderPartReturnSummary | null>(() => {
  if (!orderGroups.value.length) return null;
  if (!selectedOrderId.value) return orderGroups.value[0] || null;
  return orderGroups.value.find((o) => o.orderId === selectedOrderId.value) || orderGroups.value[0] || null;
});

// Filtered orders list for the table
const filteredOrders = computed(() => {
  let list = orderGroups.value;

  // Tab filter
  if (activeTab.value === 'awaiting') {
    list = list.filter((o) => o.returnStatus === 'awaiting_return');
  } else if (activeTab.value === 'in_use') {
    list = list.filter((o) => o.returnStatus === 'in_use');
  } else if (activeTab.value === 'returned') {
    list = list.filter((o) => o.returnStatus === 'returned');
  }

  // Status dropdown filter
  if (statusFilter.value !== 'all') {
    list = list.filter((o) => o.returnStatus === statusFilter.value);
  }

  // Time filter
  if (timeFilter.value !== 'all') {
    const now = Date.now();
    const thresholdDays = timeFilter.value === 'today' ? 1 : timeFilter.value === '7d' ? 7 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    list = list.filter((o) => {
      const d = o.pickupDateRaw ? new Date(o.pickupDateRaw).getTime() : 0;
      return d > 0 && now - d <= thresholdMs;
    });
  }

  // Search query
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((o) => {
      return (
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.technicianName.toLowerCase().includes(q) ||
        o.items.some((i) => i.partNameSnapshot.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      );
    });
  }

  return list;
});

// Paginated orders
const totalFiltered = computed(() => filteredOrders.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalFiltered.value / pageSize)));
const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredOrders.value.slice(start, start + pageSize);
});

// Row selection
const handleSelectOrder = (orderId: string) => {
  if (selectedOrderId.value === orderId) return;
  panelLoading.value = true;
  selectedOrderId.value = orderId;
  setTimeout(() => {
    panelLoading.value = false;
  }, 100);
};

// Load Returns Data
const loadReturns = async () => {
  const version = ++returnsLoadVersion;
  returnsLoading.value = true;
  returnsUnavailable.value = false;
  returnsLoadError.value = false;
  emit('count', null);
  try {
    const rows = await partRequestsApi.getPendingReturns();
    if (version !== returnsLoadVersion) return;
    warehouseAcceptedRequests.value = {};

    for (const row of rows) {
      if (row.warehouseAllocated === true) warehouseAcceptedRequests.value[row.partRequestId] = true;
    }

    const requestIds = [...new Set(rows.filter((row) => row.warehouseAllocated === undefined).map((row) => row.partRequestId))];
    await Promise.all(
      requestIds.map(async (requestId) => {
        try {
          const allocation = await partRequestsApi.getWarehouseAllocation(requestId);
          if (version === returnsLoadVersion && allocation.mode === 'warehouse') {
            warehouseAcceptedRequests.value[requestId] = true;
          }
        } catch {
          // Allocation unavailable
        }
      }),
    );

    const drafts: Record<string, number> = {};
    for (const row of rows) {
      const key = returnKey(row);
      const previous = returnQueue.value.find((candidate) => returnKey(candidate) === key);
      const draft = acceptDrafts.value[key];
      drafts[key] =
        previous?.version === row.version && Number.isInteger(draft) && draft >= 1 && draft <= maxAcceptQty(row)
          ? draft
          : maxAcceptQty(row);
    }
    returnQueue.value = rows;
    acceptDrafts.value = drafts;
    emit('count', awaiting.value.length);

    // Fetch order metadata in background
    const uniqueOrderIds = [...new Set(rows.map((r) => r.orderId).filter(Boolean))] as string[];
    if (uniqueOrderIds.length > 0) {
      void Promise.allSettled(
        uniqueOrderIds.slice(0, 15).map(async (orderId) => {
          if (!cachedOrders.value[orderId]) {
            try {
              const order = await ordersApi.getOrder(orderId);
              if (order) cachedOrders.value[orderId] = order;
            } catch {
              // Silently ignore order detail fetch errors
            }
          }
        }),
      );
    }

    if (!selectedOrderId.value && rows.length > 0) {
      selectedOrderId.value = rows[0].orderId || rows[0].partRequestId;
    }
  } catch (err: unknown) {
    if (version !== returnsLoadVersion) return;
    returnQueue.value = [];
    acceptDrafts.value = {};
    if (isPartReturnsUnavailableError(err)) returnsUnavailable.value = true;
    else returnsLoadError.value = true;
    emit('count', null);
  } finally {
    if (version === returnsLoadVersion) returnsLoading.value = false;
  }
};

const handleAcceptReturn = async (row: PartCustodyReturnRecord) => {
  if (!canOperate.value || acceptingKey.value) return;
  const key = returnKey(row);
  const maxQty = maxAcceptQty(row);
  const quantity = Number(acceptDrafts.value[key]);
  if (maxQty < 1) return;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQty) {
    showToast('error', `Số lượng nhận thực tế phải là số nguyên từ 1 đến ${maxQty}.`);
    return;
  }
  acceptingKey.value = key;
  try {
    await partRequestsApi.acceptReturn(row.partRequestId, row.partRequestItemId, {
      quantity,
      expectedVersion: row.version,
      idempotencyKey: createIdempotencyKey('accept'),
    });
    showToast(
      'success',
      warehouseAcceptedRequests.value[row.partRequestId]
        ? quantity < pendingDeclaredQty(row)
          ? 'Đã nhận một phần tại kho và cập nhật tồn thực tế. Phần còn lại vẫn chờ nhận.'
          : 'Đã nhận linh kiện tại kho và cập nhật tồn thực tế.'
        : quantity < pendingDeclaredQty(row)
          ? 'Đã ghi nhận số lượng nhận thực tế. Phần còn lại vẫn chờ nhận.'
          : 'Đã ghi nhận số linh kiện đã nhận.',
    );
    await loadReturns();
  } catch (err: unknown) {
    showToast('error', userFacingError(err, 'Chưa ghi nhận được linh kiện hoàn trả, vui lòng thử lại.'));
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (status === 409) await loadReturns();
  } finally {
    acceptingKey.value = null;
  }
};

const handleOpenModal = (item?: PartReturnLineItem) => {
  if (item) {
    activeModalItem.value = item;
  } else if (selectedOrder.value?.items.length) {
    activeModalItem.value = selectedOrder.value.items.find((i) => i.maxAcceptQty > 0) || selectedOrder.value.items[0];
  }
  modalOpen.value = true;
};

const handleModalSuccess = async (payload: { quantity: number; message: string }) => {
  modalOpen.value = false;
  showToast('success', payload.message);
  await loadReturns();
};

onMounted(() => {
  void loadReturns();
  void loadLegacyReview();
  void loadFaulty();
});

usePartReturnsRefresh(() => {
  void loadFaulty();
  return loadReturns();
});

onUnmounted(() => {
  ++returnsLoadVersion;
  ++legacyLoadVersion;
});

defineExpose({ reload: loadReturns, reloadLegacy: loadLegacyReview });
</script>

<template>
  <div class="space-y-6">
    <!-- Header banner & icon -->
    <header class="flex items-center gap-3.5">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 border border-brand-100/80 shadow-xs">
        <PackageCheck :size="24" />
      </div>
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-ink-900">Hoàn trả linh kiện</h1>
        <p class="text-sm text-ink-500">Quản lý và theo dõi việc hoàn trả các linh kiện sau khi hoàn thành đơn sửa chữa.</p>
      </div>
    </header>

    <!-- Global Toast Alert with status / alert role -->
    <Transition name="fh-fade-slide">
      <div
        v-if="toastMessage"
        class="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm shadow-xs"
        :class="toastMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-800 border-danger-200'"
        :role="toastMessage.type === 'success' ? 'status' : 'alert'"
      >
        <span>{{ toastMessage.text }}</span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/60 cursor-pointer"
          aria-label="Đóng thông báo"
          @click="toastMessage = null"
        >
          <X :size="16" />
        </button>
      </div>
    </Transition>

    <!-- 4 Compact Stat Cards (Real system numbers) -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Thống kê hoàn trả linh kiện">
      <!-- Stat 1: Đơn đã lấy linh kiện -->
      <div class="rounded-xl border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1) flex items-center justify-between">
        <div>
          <span class="text-xs font-medium text-ink-500 block mb-1">Đơn đã lấy linh kiện</span>
          <span class="text-2xl font-bold font-num text-ink-900">{{ statTotalOrders }}</span>
        </div>
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Package :size="20" />
        </div>
      </div>

      <!-- Stat 2: Đang sử dụng -->
      <div class="rounded-xl border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1) flex items-center justify-between">
        <div>
          <span class="text-xs font-medium text-ink-500 block mb-1">Đang sử dụng</span>
          <span class="text-2xl font-bold font-num text-amber-700">{{ statInUseOrders }}</span>
        </div>
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Hourglass :size="20" />
        </div>
      </div>

      <!-- Stat 3: Chờ hoàn trả -->
      <div class="rounded-xl border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1) flex items-center justify-between">
        <div>
          <span class="text-xs font-medium text-ink-500 block mb-1">Chờ hoàn trả</span>
          <span class="text-2xl font-bold font-num text-warning-700">{{ statAwaitingOrders }}</span>
        </div>
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
          <Clock :size="20" />
        </div>
      </div>

      <!-- Stat 4: Đã hoàn trả / đối soát -->
      <div class="rounded-xl border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1) flex items-center justify-between">
        <div>
          <span class="text-xs font-medium text-ink-500 block mb-1">Đã hoàn trả</span>
          <span class="text-2xl font-bold font-num text-success-700">{{ statReturnedOrders }}</span>
        </div>
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-600">
          <CheckCircle2 :size="20" />
        </div>
      </div>
    </section>

    <!-- Main Section with testid container -->
    <section
      v-if="!returnsUnavailable"
      data-testid="part-returns-queue"
      aria-label="Linh kiện chờ nhận hoàn trả"
      class="space-y-4"
    >
      <!-- Navigation Tabs -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200">
        <div class="flex items-center gap-6 overflow-x-auto pb-px">
          <button
            type="button"
            class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer shrink-0"
            :class="activeTab === 'all' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'all'"
          >
            Tất cả ({{ statTotalOrders }})
            <span v-if="activeTab === 'all'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"></span>
          </button>

          <button
            type="button"
            class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer shrink-0"
            :class="activeTab === 'awaiting' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'awaiting'"
          >
            Chờ hoàn trả ({{ statAwaitingOrders }})
            <span v-if="activeTab === 'awaiting'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"></span>
          </button>

          <button
            type="button"
            class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer shrink-0"
            :class="activeTab === 'in_use' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'in_use'"
          >
            Đang sử dụng ({{ statInUseOrders }})
            <span v-if="activeTab === 'in_use'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"></span>
          </button>

          <button
            type="button"
            class="pb-3 text-sm font-semibold transition-colors relative cursor-pointer shrink-0"
            :class="activeTab === 'returned' ? 'text-brand-600' : 'text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'returned'"
          >
            Đã hoàn trả ({{ statReturnedOrders }})
            <span v-if="activeTab === 'returned'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"></span>
          </button>
        </div>

        <FhButton variant="ghost" size="sm" :disabled="returnsLoading" @click="loadReturns">
          Làm mới
        </FhButton>
      </div>

      <!-- Search and Filter Bar -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[260px]">
          <Search :size="16" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm theo mã đơn, tên khách hàng, kỹ thuật viên..."
            class="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-xs"
          />
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Time Filter -->
          <div class="relative">
            <select
              v-model="timeFilter"
              class="rounded-xl border border-ink-200 bg-white py-2.5 pl-3 pr-8 text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-xs"
            >
              <option value="all">Tất cả thời gian</option>
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
            </select>
          </div>

          <!-- Status Filter -->
          <div class="relative">
            <select
              v-model="statusFilter"
              class="rounded-xl border border-ink-200 bg-white py-2.5 pl-3 pr-8 text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-xs"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="awaiting_return">Chờ hoàn trả</option>
              <option value="in_use">Đang sử dụng</option>
              <option value="returned">Đã hoàn trả</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="returnsLoading && !returnQueue.length" class="space-y-2 p-5 bg-white rounded-xl border border-ink-200" aria-busy="true" aria-label="Đang tải linh kiện chờ nhận">
        <FhSkeleton height="14px" width="30%" />
        <FhSkeleton height="44px" rounded="md" />
        <FhSkeleton height="44px" rounded="md" />
        <FhSkeleton height="44px" rounded="md" />
      </div>

      <!-- Error State -->
      <div v-else-if="returnsLoadError" role="alert" class="flex flex-wrap items-center justify-between gap-3 p-5 bg-white rounded-xl border border-ink-200 text-sm text-ink-600">
        <span>Chưa tải được danh sách chờ nhận.</span>
        <FhButton variant="secondary" size="md" @click="loadReturns">Thử lại</FhButton>
      </div>

      <!-- Empty State -->
      <div v-else-if="groups.length === 0" class="p-8 text-center bg-white rounded-xl border border-ink-200">
        <Package :size="36" class="mx-auto text-ink-300 mb-2" />
        <p class="text-sm font-medium text-ink-700">Không có linh kiện nào đang chờ xác nhận hoàn trả.</p>
        <p class="mt-1 text-xs text-ink-500">Hàng chờ này chỉ gồm các dòng có sổ custody; trống không có nghĩa là mọi linh kiện đã được trả đủ.</p>
      </div>

      <!-- 2 Columns Layout: Orders Table (Left) + Quick View Panel (Right) -->
      <div v-else class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <!-- Left Orders Table (8 Columns) -->
        <div class="xl:col-span-8 rounded-xl border border-ink-200/90 bg-white overflow-hidden shadow-(--shadow-e1)">
          <div class="border-b border-ink-100 bg-ink-50/70 px-5 py-3.5 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-ink-900">Chờ nhận linh kiện hoàn trả</h2>
              <span v-if="!returnsLoading && !returnsLoadError" class="font-num text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700" data-testid="part-returns-count">
                {{ awaiting.length }}
              </span>
            </div>
            <span class="text-xs text-ink-500 font-num">
              Hiển thị {{ Math.min(1 + (currentPage - 1) * pageSize, totalFiltered) }} - {{ Math.min(currentPage * pageSize, totalFiltered) }} trên {{ totalFiltered }} đơn
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-ink-50/50 border-b border-ink-100 text-ink-600 font-semibold uppercase text-[11px] tracking-wider">
                <tr>
                  <th class="py-3 pl-4 pr-3">Mã đơn hàng</th>
                  <th class="py-3 px-3">Khách hàng</th>
                  <th class="py-3 px-3">Kỹ thuật viên</th>
                  <th class="py-3 px-2 text-center">Số linh kiện</th>
                  <th class="py-3 px-3">Ngày lấy</th>
                  <th class="py-3 px-3">Hạn hoàn trả</th>
                  <th class="py-3 px-3">Trạng thái</th>
                  <th class="py-3 pr-4 pl-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <tr
                  v-for="order in paginatedOrders"
                  :key="order.orderId"
                  class="hover:bg-brand-50/40 transition-colors cursor-pointer group"
                  :class="selectedOrderId === order.orderId ? 'bg-brand-50/60 ring-1 ring-inset ring-brand-200' : ''"
                  data-testid="part-return-group"
                  @click="handleSelectOrder(order.orderId)"
                >
                  <!-- Order Code with File icon -->
                  <td class="py-3.5 pl-4 pr-3 font-num font-semibold text-brand-600 group-hover:underline">
                    <div class="flex items-center gap-1.5">
                      <FileText :size="14" class="text-brand-500 shrink-0" />
                      <span class="truncate">{{ order.orderCode }}</span>
                    </div>
                  </td>

                  <!-- Customer -->
                  <td class="py-3.5 px-3 font-medium text-ink-900">
                    <span class="truncate block max-w-[130px]">{{ order.customerName }}</span>
                  </td>

                  <!-- Technician with Avatar -->
                  <td class="py-3.5 px-3">
                    <div class="flex items-center gap-2">
                      <div class="h-6 w-6 shrink-0 rounded-full bg-ink-100 border border-ink-200 flex items-center justify-center text-[10px] font-bold text-ink-700 overflow-hidden">
                        <img
                          v-if="order.technicianAvatar"
                          :src="order.technicianAvatar"
                          :alt="order.technicianName"
                          class="h-full w-full object-cover"
                        />
                        <span v-else>{{ order.technicianName.charAt(0) }}</span>
                      </div>
                      <span class="text-xs text-ink-800 truncate block max-w-[120px]">{{ order.technicianName }}</span>
                    </div>
                  </td>

                  <!-- Number of Parts (badge pill) -->
                  <td class="py-3.5 px-2 text-center">
                    <span class="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-100/80 px-1.5 text-[11px] font-num font-bold text-brand-800">
                      {{ order.partTypesCount }}
                    </span>
                  </td>

                  <!-- Pickup Date -->
                  <td class="py-3.5 px-3 font-num text-ink-600">
                    {{ order.pickupDate }}
                  </td>

                  <!-- Due Date -->
                  <td class="py-3.5 px-3 font-num text-ink-600">
                    {{ order.dueDate }}
                  </td>

                  <!-- Status Badge -->
                  <td class="py-3.5 px-3">
                    <span
                      class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      :class="order.returnStatusTone"
                    >
                      {{ order.returnStatusLabel }}
                    </span>
                  </td>

                  <!-- Actions: Chi tiết -->
                  <td class="py-3.5 pr-4 pl-3 text-right">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                      @click.stop="handleSelectOrder(order.orderId)"
                    >
                      <Eye :size="13" class="text-ink-500" />
                      Chi tiết
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Bar -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/50 px-5 py-3">
            <span class="text-xs text-ink-500 font-num">
              Hiển thị {{ Math.min(1 + (currentPage - 1) * pageSize, totalFiltered) }} - {{ Math.min(currentPage * pageSize, totalFiltered) }} trên {{ totalFiltered }} đơn
            </span>

            <div class="flex items-center gap-1 font-num text-xs">
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 bg-white hover:bg-ink-50 disabled:opacity-40 cursor-pointer"
                :disabled="currentPage <= 1"
                @click="currentPage--"
              >
                <ChevronLeft :size="14" />
              </button>
              <button
                v-for="p in totalPages"
                :key="p"
                type="button"
                class="flex h-7 min-w-[28px] items-center justify-center rounded-md text-xs font-medium cursor-pointer"
                :class="currentPage === p ? 'bg-brand-600 text-white font-bold' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                @click="currentPage = p"
              >
                {{ p }}
              </button>
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 bg-white hover:bg-ink-50 disabled:opacity-40 cursor-pointer"
                :disabled="currentPage >= totalPages"
                @click="currentPage++"
              >
                <ChevronRight :size="14" />
              </button>
            </div>
          </div>

          <!-- Held parts expandable section matching test contract -->
          <details v-if="!returnsLoading && !returnsLoadError && heldGroups.length" class="border-t border-ink-100 px-5 py-3 text-sm" data-testid="part-returns-held">
            <summary class="cursor-pointer rounded-[var(--radius-sm)] font-medium text-ink-700 min-h-11 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
              Thợ đang giữ, chưa khai trả (<span class="font-num">{{ undeclared.length }}</span>)
            </summary>
            <ul class="mt-2 space-y-2">
              <li v-for="group in heldGroups" :key="group.id" class="space-y-1">
                <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                  <span class="font-num font-semibold text-ink-700">{{ returnRequestCode(group.first) }}</span>
                  <router-link v-if="group.first.orderId" :to="`/console/orders/${group.first.orderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
                  <span>Kỹ thuật viên: <span class="font-num">{{ technicianRef(group.first) }}</span></span>
                </div>
                <p v-for="row in group.rows" :key="returnKey(row)" class="flex flex-wrap justify-between gap-x-3 gap-y-1 text-ink-700">
                  <span class="min-w-0 break-words">{{ row.partNameSnapshot }}</span>
                  <span class="font-num text-sm text-ink-600">Cấp {{ row.issuedQty }} · Dùng {{ row.usedQty }} · Còn giữ {{ row.outstandingQty }}</span>
                </p>
              </li>
            </ul>
          </details>
        </div>

        <!-- Right Quick-View Panel (4 Columns) -->
        <div class="xl:col-span-4 sticky top-6">
          <div
            v-if="selectedOrder"
            class="flex flex-col bg-white border border-ink-200/90 rounded-[var(--radius-md)] shadow-(--shadow-e1) overflow-hidden"
            aria-label="Panel xem nhanh chi tiết đơn hoàn trả"
          >
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-ink-100 bg-ink-50/70 px-5 py-4">
              <div class="min-w-0 pr-2">
                <h3 class="text-base font-bold text-ink-900 truncate">
                  Chi tiết đơn hàng <span class="font-num text-brand-600">{{ selectedOrder.orderCode }}</span>
                </h3>
              </div>
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                aria-label="Đóng panel xem nhanh"
                @click="selectedOrderId = null"
              >
                <X :size="18" />
              </button>
            </div>

            <!-- Loading Skeleton State -->
            <div v-if="panelLoading" class="p-5 space-y-4" aria-busy="true">
              <FhSkeleton height="60px" rounded="md" />
              <FhSkeleton height="140px" rounded="md" />
              <FhSkeleton height="160px" rounded="md" />
            </div>

            <!-- Panel Content -->
            <div v-else class="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              <!-- Stepper -->
              <div class="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
                <div class="relative flex items-center justify-between">
                  <div class="absolute left-4 right-4 top-3 h-0.5 bg-ink-200 -z-0"></div>
                  <div
                    class="absolute left-4 top-3 h-0.5 bg-brand-600 -z-0 transition-all duration-300"
                    :style="{
                      width: selectedOrder.returnStatus === 'returned' ? '100%' : selectedOrder.returnStatus === 'awaiting_return' ? '66%' : '33%',
                    }"
                  ></div>

                  <!-- Step 1 -->
                  <div class="relative z-10 flex flex-col items-center text-center">
                    <div class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-xs">
                      <Check :size="12" stroke-width="3" />
                    </div>
                    <span class="mt-1.5 text-xs font-semibold text-ink-800">Lấy linh kiện</span>
                    <span class="text-[11px] font-num text-ink-500">{{ selectedOrder.pickupDate }}</span>
                  </div>

                  <!-- Step 2 -->
                  <div class="relative z-10 flex flex-col items-center text-center">
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors"
                      :class="selectedOrder.returnStatus === 'in_use' ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-brand-600 text-white'"
                    >
                      <Check v-if="selectedOrder.returnStatus !== 'in_use'" :size="12" stroke-width="3" />
                      <span v-else>2</span>
                    </div>
                    <span class="mt-1.5 text-xs font-semibold" :class="selectedOrder.returnStatus === 'in_use' ? 'text-brand-700' : 'text-ink-800'">
                      Đang sử dụng
                    </span>
                    <span class="text-[11px] text-ink-500">{{ selectedOrder.returnStatus === 'in_use' ? 'Đang thi công' : 'Đã thi công' }}</span>
                  </div>

                  <!-- Step 3 -->
                  <div class="relative z-10 flex flex-col items-center text-center">
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors"
                      :class="selectedOrder.returnStatus === 'awaiting_return' ? 'bg-brand-600 text-white ring-4 ring-brand-100' : selectedOrder.returnStatus === 'returned' ? 'bg-brand-600 text-white' : 'border border-ink-300 bg-white text-ink-400'"
                    >
                      <Check v-if="selectedOrder.returnStatus === 'returned'" :size="12" stroke-width="3" />
                      <span v-else>3</span>
                    </div>
                    <span class="mt-1.5 text-xs font-semibold" :class="selectedOrder.returnStatus === 'awaiting_return' ? 'text-brand-700' : 'text-ink-800'">
                      Trả linh kiện
                    </span>
                    <span class="text-[11px] text-ink-500">{{ selectedOrder.returnStatus === 'awaiting_return' ? 'Chờ nhận' : selectedOrder.returnStatus === 'returned' ? 'Đã trả' : 'Chưa thực hiện' }}</span>
                  </div>

                  <!-- Step 4 -->
                  <div class="relative z-10 flex flex-col items-center text-center">
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors"
                      :class="selectedOrder.returnStatus === 'returned' ? 'bg-success-600 text-white' : 'border border-ink-300 bg-white text-ink-400'"
                    >
                      <Check v-if="selectedOrder.returnStatus === 'returned'" :size="12" stroke-width="3" />
                      <span v-else>4</span>
                    </div>
                    <span class="mt-1.5 text-xs font-semibold" :class="selectedOrder.returnStatus === 'returned' ? 'text-success-700' : 'text-ink-600'">
                      Hoàn tất
                    </span>
                    <span class="text-[11px] text-ink-500">{{ selectedOrder.returnStatus === 'returned' ? 'Đã đối soát' : '—' }}</span>
                  </div>
                </div>
              </div>

              <!-- General Info -->
              <div class="rounded-xl border border-ink-200/80 bg-white p-4 space-y-3">
                <h4 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                  <User :size="14" class="text-brand-600" />
                  Thông tin chung
                </h4>
                <div class="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                  <div>
                    <span class="text-ink-500 block mb-0.5">Khách hàng</span>
                    <span class="font-semibold text-ink-900 block truncate">{{ selectedOrder.customerName }}</span>
                  </div>
                  <div>
                    <span class="text-ink-500 block mb-0.5">Dịch vụ</span>
                    <span class="font-semibold text-ink-900 block truncate">{{ selectedOrder.serviceName }}</span>
                  </div>
                  <div>
                    <span class="text-ink-500 block mb-0.5">Kỹ thuật viên</span>
                    <span class="font-semibold text-ink-900 block truncate">{{ selectedOrder.technicianName }}</span>
                  </div>
                  <div>
                    <span class="text-ink-500 block mb-0.5">Ngày lấy</span>
                    <span class="font-semibold font-num text-ink-900 block">{{ selectedOrder.pickupDate }}</span>
                  </div>
                  <div class="col-span-2">
                    <span class="text-ink-500 block mb-0.5">Hạn hoàn trả</span>
                    <span class="font-semibold font-num text-ink-900 block">{{ selectedOrder.dueDate }}</span>
                  </div>
                </div>
              </div>

              <!-- Parts List with Integrated SM Accept Form -->
              <div class="space-y-3">
                <h4 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                  <Package :size="14" class="text-brand-600" />
                  Danh sách linh kiện đã lấy ({{ selectedOrder.items.length }})
                </h4>

                <div class="divide-y divide-ink-100 rounded-xl border border-ink-200/80 bg-white overflow-hidden">
                  <div
                    v-for="item in selectedOrder.items"
                    :key="item.id"
                    class="p-3.5 space-y-3 hover:bg-ink-50/40 transition-colors"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
                          <Package :size="18" />
                        </div>
                        <div class="min-w-0">
                          <span class="block text-xs font-semibold text-ink-900 truncate" :title="item.partNameSnapshot">
                            {{ item.partNameSnapshot }}
                          </span>
                          <span class="block text-[11px] font-num text-ink-500">
                            {{ item.issuedQty }} {{ item.unit }}
                          </span>
                        </div>
                      </div>
                      <span
                        class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium"
                        :class="item.statusTone"
                        :data-testid="item.maxAcceptQty > 0 ? `part-return-pending-${item.raw.partRequestItemId}` : undefined"
                      >
                        {{ item.maxAcceptQty > 0 ? `Chờ nhận ${item.maxAcceptQty}` : item.statusLabel }}
                      </span>
                    </div>

                    <!-- Quantities summary dl line matching unit test expectations -->
                    <dl class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-600 pt-1 border-t border-ink-100" :aria-label="`Số lượng ${item.partNameSnapshot}`">
                      <div class="inline-flex items-baseline gap-1"><dt>Cấp{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ item.issuedQty }}<span aria-hidden="true" class="ml-3 font-sans font-normal text-ink-600">{{ ' · ' }}</span></dd></div>
                      <div class="inline-flex items-baseline gap-1"><dt>Dùng{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ item.usedQty }}<span aria-hidden="true" class="ml-3 font-sans font-normal text-ink-600">{{ ' · ' }}</span></dd></div>
                      <div class="inline-flex items-baseline gap-1"><dt>Khai trả{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ item.declaredQty }}<span aria-hidden="true" class="ml-3 font-sans font-normal text-ink-600">{{ ' · ' }}</span></dd></div>
                      <div class="inline-flex items-baseline gap-1"><dt>Đã nhận{{ ' ' }}</dt><dd class="font-num font-semibold text-ink-900">{{ item.managerAcceptedQty }}</dd></div>
                    </dl>

                    <!-- Real receipt form matching test contract -->
                    <div v-if="canOperate && item.maxAcceptQty > 0" class="pt-2 border-t border-ink-100/80 space-y-2">
                      <div class="flex items-center gap-2">
                        <div class="w-24">
                          <label :for="`accept-qty-${returnKey(item.raw)}`" class="sr-only">Số lượng nhận thực tế</label>
                          <input
                            :id="`accept-qty-${returnKey(item.raw)}`"
                            v-model.number="acceptDrafts[returnKey(item.raw)]"
                            type="number"
                            inputmode="numeric"
                            min="1"
                            step="1"
                            :max="item.maxAcceptQty"
                            :aria-describedby="`accept-hint-${returnKey(item.raw)}`"
                            :class="consoleField"
                            class="min-h-9 w-full text-xs font-num font-semibold text-ink-900"
                          />
                        </div>
                        <span :id="`accept-hint-${returnKey(item.raw)}`" class="text-xs text-ink-500 flex-1 truncate">
                          Nhận thực tế tối đa <span class="font-num font-semibold">{{ item.maxAcceptQty }}</span>
                        </span>
                        <FhButton
                          data-testid="accept-return"
                          variant="primary"
                          size="sm"
                          class="shrink-0 text-xs"
                          :aria-label="`Xác nhận đã nhận ${item.partNameSnapshot}`"
                          :loading="acceptingKey === returnKey(item.raw)"
                          :disabled="!!acceptingKey || returnsLoading || item.maxAcceptQty < 1"
                          @click="handleAcceptReturn(item.raw)"
                        >
                          Xác nhận đã nhận
                        </FhButton>
                      </div>
                    </div>
                    <p v-else-if="!canOperate" class="text-xs text-ink-500 pt-2 border-t border-ink-100">
                      Chỉ quản lý dịch vụ xác nhận được số linh kiện đã nhận.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Actions -->
            <div class="border-t border-ink-100 bg-ink-50/60 p-4 grid grid-cols-2 gap-3 shrink-0">
              <router-link
                :to="`/console/part-returns/${selectedOrder.orderId}`"
                class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-brand-50 transition-colors"
              >
                <Eye :size="15" />
                Xem chi tiết
              </router-link>

              <FhButton
                variant="primary"
                size="md"
                class="w-full text-xs font-semibold justify-center"
                :disabled="!selectedOrder.items.some(i => i.maxAcceptQty > 0)"
                @click="handleOpenModal()"
              >
                <Undo2 :size="15" class="mr-1.5" />
                Trả linh kiện
              </FhButton>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Faulty Parts Warranty Section (Rendered when faulty parts exist) -->
    <section
      v-if="faultyRows.length || faultyDone.length"
      class="overflow-hidden rounded-xl border border-ink-200/90 bg-white shadow-(--shadow-e1)"
      data-testid="faulty-part-returns"
      aria-label="Linh kiện hỏng bảo hành"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/70 px-5 py-3.5">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-ink-900">Linh kiện hỏng bảo hành</h2>
          <span class="font-num text-sm font-medium text-ink-500">{{ faultyRows.length }}</span>
        </div>
        <p class="text-xs text-ink-500">Thợ nhận linh kiện thay thế trước, rồi nộp linh kiện hỏng về kho trong hạn.</p>
      </header>

      <p v-if="!faultyRows.length" class="px-5 py-4 text-sm text-ink-500">Không có linh kiện hỏng nào đang chờ nộp hoặc kiểm tra.</p>
      <ul v-else class="divide-y divide-ink-100">
        <li v-for="r in faultyRows" :key="r.id" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
              <span class="font-num font-semibold text-ink-700">PR-{{ r.id.substring(0, 8).toUpperCase() }}</span>
              <router-link :to="`/console/orders/${r.serviceOrderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
            </div>
            <div class="break-words text-sm font-semibold text-ink-900">{{ r.items.map((i) => i.partNameSnapshot).join(', ') }}</div>
            <span class="inline-flex rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium" :class="faultyTone(r)">{{ faultyStatus(r) }}</span>
          </div>
          <FhButton v-if="canOperate && r.faultyReturnedAt" variant="primary" size="md" class="w-full sm:w-auto" @click="inspectionRequest = r">
            Kiểm tra linh kiện hỏng
          </FhButton>
        </li>
      </ul>

      <details v-if="faultyDone.length" class="border-t border-ink-100 px-5 py-3 text-sm" data-testid="faulty-part-history">
        <summary class="flex min-h-11 cursor-pointer items-center rounded-lg font-medium text-ink-700">
          Lịch sử đã kiểm tra (<span class="font-num">{{ faultyDone.length }}</span>)
        </summary>
        <ul class="mt-2 divide-y divide-ink-100">
          <li v-for="r in faultyDone" :key="r.id" class="space-y-1 py-3">
            <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
              <span class="font-num font-semibold text-ink-700">PR-{{ r.id.substring(0, 8).toUpperCase() }}</span>
              <router-link :to="`/console/orders/${r.serviceOrderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
              <span v-if="r.faultyInspectedAt" class="font-num">{{ vnDateTimeString(r.faultyInspectedAt) }}</span>
            </div>
            <div class="text-ink-900">{{ r.items.map((i) => i.partNameSnapshot).join(', ') }}</div>
            <span class="inline-flex rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium" :class="r.faultyInspectionResult === 'installation' ? 'bg-warning-50 text-warning-800' : 'bg-success-50 text-success-800'">
              {{ resultLabel(r.faultyInspectionResult) }}
            </span>
            <p v-if="r.faultyInspectionNote" class="text-xs text-ink-600">{{ r.faultyInspectionNote }}</p>
          </li>
        </ul>
      </details>
    </section>

    <!-- Legacy Review Section (Rendered when canOperate and !legacyUnavailable) -->
    <section
      v-if="canOperate && !legacyUnavailable"
      data-testid="legacy-part-returns"
      role="region"
      class="overflow-hidden rounded-xl border border-ink-200/90 bg-white shadow-(--shadow-e1)"
      aria-labelledby="legacy-part-returns-title"
    >
      <header class="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 bg-ink-50/70 px-5 py-3.5">
        <div class="min-w-0">
          <h2 id="legacy-part-returns-title" class="text-base font-semibold text-ink-900">Linh kiện lịch sử cần xác minh</h2>
          <p class="mt-0.5 text-xs text-ink-600">Các dòng FixHome đã bàn giao trước khi bật sổ custody; không có sổ để đối chiếu.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span v-if="!legacyLoading && !legacyLoadError" class="font-num text-sm font-medium text-ink-500" data-testid="legacy-part-returns-count">{{ legacyTotal }}</span>
          <FhButton variant="ghost" size="md" :disabled="legacyLoading" @click="loadLegacyReview">Làm mới</FhButton>
        </div>
      </header>

      <div role="note" class="mx-5 mt-3 flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50/80 px-4 py-3 text-sm text-ink-700" data-testid="legacy-part-returns-alert">
        <AlertTriangle :size="18" class="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
        <span>Chưa có chứng từ custody – quản lý dịch vụ (SM) xác minh thủ công. Không hiển thị số đã nhận, còn lại hoặc khai trả cho các dòng này.</span>
      </div>

      <div v-if="legacyLoading" class="space-y-2 px-5 py-4" aria-busy="true">
        <FhSkeleton height="14px" width="30%" />
        <FhSkeleton height="40px" rounded="md" />
        <FhSkeleton height="40px" rounded="md" />
      </div>

      <div v-else-if="legacyLoadError" role="alert" class="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm text-ink-600" data-testid="legacy-part-returns-error">
        <span>Chưa tải được linh kiện lịch sử cần xác minh.</span>
        <FhButton variant="secondary" size="md" @click="loadLegacyReview">Thử lại</FhButton>
      </div>

      <p v-else-if="legacyRows.length === 0" class="px-5 py-4 text-sm text-ink-500" data-testid="legacy-part-returns-empty">
        Không có linh kiện lịch sử nào cần xác minh.
      </p>

      <template v-else>
        <ul class="divide-y divide-ink-100">
          <li v-for="row in legacyRows" :key="row.partRequestItemId" class="px-5 py-3" data-testid="legacy-part-return">
            <details>
              <summary class="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                <span class="min-w-0">
                  <span class="block break-words text-sm font-semibold text-ink-900">{{ row.partNameSnapshot }}</span>
                  <span class="block font-num text-xs text-ink-500">{{ legacyRequestCode(row) }}</span>
                </span>
                <span class="rounded-full border border-warning-200/80 bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-800" data-testid="legacy-receipt-state">Chưa xác định (UNKNOWN)</span>
              </summary>
              <div class="mt-2 space-y-2.5">
                <div class="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                  <span class="font-num font-semibold text-ink-700">{{ legacyRequestCode(row) }}</span>
                  <router-link :to="`/console/orders/${row.orderId}`" class="text-brand-700 hover:underline">Xem đơn</router-link>
                  <span>Kỹ thuật viên: <span class="font-num">{{ legacyTechnicianRef(row) }}</span></span>
                  <span>Bàn giao: <span class="font-num">{{ vnDateTimeString(row.handedOverAt) }}</span></span>
                </div>
                <dl class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
                  <div class="inline-flex items-baseline gap-1">
                    <dt>Số lượng đã cấp theo lịch sử</dt>
                    <dd class="font-num font-semibold text-ink-900" data-testid="legacy-issued-qty">{{ row.issuedQty }}</dd>
                  </div>
                </dl>
                <LegacyManualReviewForm :row="row" @saved="loadLegacyReview" @refresh="loadLegacyReview" />
              </div>
            </details>
          </li>
        </ul>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3">
          <p class="font-num text-xs text-ink-600">
            Trang {{ legacyPage }}/{{ legacyTotalPages }} · {{ legacyTotal }} dòng linh kiện lịch sử
            <span v-if="legacyTotal > legacyPage * legacyPageSize" class="block">Còn {{ legacyTotal - legacyPage * legacyPageSize }} dòng ở trang sau.</span>
          </p>
          <ConsolePagination
            :page="legacyPage"
            :total="legacyTotal"
            :page-size="legacyPageSize"
            :disabled="legacyLoading"
            @update:page="changeLegacyPage"
          />
        </div>
      </template>
    </section>

    <!-- Inspection Modal for Warranty Faulty parts -->
    <FaultyPartInspectionModal
      :request="inspectionRequest"
      @close="inspectionRequest = null"
      @done="onInspected"
    />

    <!-- Process Return Modal -->
    <PartReturnProcessModal
      :is-open="modalOpen"
      :item="activeModalItem"
      :warehouse-allocated="selectedOrder?.items.some(i => i.warehouseAllocated)"
      @close="modalOpen = false"
      @success="handleModalSuccess"
    />
  </div>
</template>
