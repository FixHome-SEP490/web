<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import {
  Package,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Truck,
  RotateCcw,
  Check,
  Send,
  Loader2,
  Search,
  ShieldCheck,
  X,
  Wrench,
  Clock,
  Undo2,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton } from './index';
import { userFacingError } from '../utils/user-facing-error';
import {
  partRequestsApi,
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  type PartRequest,
  type PartCustodyReturnRecord,
  type FulfillmentMethod,
} from '../api/part-requests.api';
import { usePartsCatalogPicker } from '../composables/usePartsCatalogPicker';
import { onOrderChange, whileOffline } from '../services/live-updates';
import type { FixHomePart } from '../api/admin-parts.api';
import { vnDateTimeString } from '../utils/vn-time';

const props = defineProps<{
  orderId: string;
  orderStatus: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'parts-updated'): void;
  (e: 'requests', requests: PartRequest[]): void;
  (e: 'requests-loading'): void;
  (e: 'requests-error'): void;
  /** How many requests exist and whether one waits for the technician (QR handover, used/returned). */
  (e: 'summary', value: { count: number; needsAction: boolean }): void;
  (e: 'pending-usage', count: number): void;
  (e: 'pending-returns', count: number): void;
  (e: 'return-summary', value: { needDeclare: number; awaitingManager: number }): void;
}>();

const loading = ref(true);
const actionLoading = ref(false);
const actionError = ref<string | null>(null);
const backgroundSyncError = ref(false);
const actionSuccess = ref<string | null>(null);

const partRequests = ref<PartRequest[]>([]);
const partRequestsLoaded = ref(false);
const requestDetailOverrides = ref<Record<string, boolean>>({});
const isRequestExpanded = (id: string, group: string) => requestDetailOverrides.value[id] ?? group === 'action';
const toggleRequestExpanded = (id: string, group: string) => { requestDetailOverrides.value[id] = !isRequestExpanded(id, group); };
const picker = usePartsCatalogPicker();
const { items: searchResults, total: catalogTotal, loading: isSearchingCatalog, error: catalogError,
  query: searchQuery, category: activeCategory, partsMap, hasMore: catalogHasMore } = picker;
// Form state for creating pre-repair parts request
const showCreateForm = ref(false);
const preRepairFormRequested = ref(false);
const fulfillmentMethod = ref<FulfillmentMethod>('pickup');
const requestReason = ref('');

export interface SelectedPartItem {
  partCatalogId: string;
  partName: string;
  sku: string | null;
  price: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  quantity: number;
  note: string;
}

const selectedItems = ref<SelectedPartItem[]>([]);

// Search & Part Picker state
const showSearchDropdown = ref(false);
const selectedPart = ref<FixHomePart | null>(null);
const selectedQuantity = ref(1);
const itemNote = ref('');
const searchContainerRef = ref<HTMLElement | null>(null);

const CATEGORY_TABS = [
  { label: 'Tất cả linh kiện', value: 'ALL' },
  { label: 'Điều hòa / Máy lạnh', value: 'Điều hòa' },
  { label: 'Máy giặt', value: 'Máy giặt' },
  { label: 'Tủ lạnh', value: 'Tủ lạnh' },
  { label: 'Bình nóng lạnh', value: 'Bình nóng lạnh' },
  { label: 'Quạt / Thiết bị khác', value: 'Quạt' },
];

// QR Handover modal/input state
const showQrInput = ref<string | null>(null); // requestId
const qrTokenInput = ref('');

// P1 parts custody (owner lock 19/10/2026): what this order still owes back to
// FixHome. Data exists only for FixHome parts QR-received after the feature is
// activated; with the flag off the GET fails and the return UI stays hidden.
const returnRecords = ref<PartCustodyReturnRecord[]>([]);
const returnsLoadError = ref(false);
let returnsLoadVersion = 0;
const declareTarget = ref<{
  requestId: string;
  itemId: string;
  itemName: string;
  maxQty: number;
  version: number;
} | null>(null);
const declareQty = ref(1);
const declareSubmitting = ref(false);

const returnByItemId = computed(() => {
  const map = new Map<string, PartCustodyReturnRecord>();
  for (const record of returnRecords.value) map.set(record.partRequestItemId, record);
  return map;
});

const returnFor = (itemId: string) => returnByItemId.value.get(itemId);
const requestHasReturns = (pr: PartRequest) =>
  pr.items.some((item) => returnByItemId.value.has(item.id));

/** Declared but not physically accepted yet: the manager still has to confirm. */
const pendingDeclaredQty = (record: PartCustodyReturnRecord) =>
  Math.max(0, record.declaredQty - record.managerAcceptedQty);

/** What the technician may declare now: the return-due quantity not declared yet. */
const canDeclareMoreQty = (record: PartCustodyReturnRecord) =>
  Math.max(0, record.outstandingQty - pendingDeclaredQty(record));

// Usage RETURNED is a decision during repair; warehouse acceptance is physical.
const canDeclareReturn = (_request: PartRequest, item: PartRequest['items'][number]) =>
  item.partSource === 'fixhome' && (item.usageStatus === 'returned' ||
    ['COMPLETED', 'CANCELLED'].includes(props.orderStatus.toUpperCase()));

const declareValid = computed(() => {
  const target = declareTarget.value;
  const quantity = Number(declareQty.value);
  return !!target && Number.isInteger(quantity) && quantity >= 1 && quantity <= target.maxQty;
});

const isAccepted = computed(() => props.orderStatus?.toUpperCase() === 'ACCEPTED');
const isUnderRepair = computed(() => props.orderStatus?.toUpperCase() === 'UNDER_REPAIR');
const hasActivePreRepair = computed(() =>
  partRequests.value.some(
    (pr) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled',
  ),
);

function openPreRepairFormWhenReady() {
  if (!preRepairFormRequested.value || loading.value) return;
  showCreateForm.value = partRequestsLoaded.value && isAccepted.value && !hasActivePreRepair.value;
  preRepairFormRequested.value = false;
}

function openPreRepairForm() {
  preRepairFormRequested.value = true;
  openPreRepairFormWhenReady();
}

watch([loading, partRequestsLoaded, isAccepted, hasActivePreRepair], openPreRepairFormWhenReady);
defineExpose({ openPreRepairForm });

const requestGroups = computed(() => {
  const groups = [
    { key: 'action', label: 'Cần thao tác', requests: [] as PartRequest[] },
    { key: 'waiting', label: 'Đang chờ', requests: [] as PartRequest[] },
    { key: 'resolved', label: 'Đã xử lý', requests: [] as PartRequest[] },
  ];
  for (const request of partRequests.value) {
    const handoverReady = (request.fulfillmentMethod === 'pickup' && request.status === 'ready') ||
      (request.fulfillmentMethod === 'delivery' && request.status === 'delivering');
    const usagePending = request.items.some(item => item.partSource === 'fixhome' && (!item.usageStatus || item.usageStatus === 'pending'));
    const returnNeedsDeclaration = request.items.some(item => {
      const record = returnFor(item.id);
      return !!record && canDeclareMoreQty(record) > 0 && canDeclareReturn(request, item);
    });
    const waitingForManager = request.items.some(item => {
      const record = returnFor(item.id);
      return !!record && pendingDeclaredQty(record) > 0;
    });
    const resolved = request.status === 'cancelled' || request.status === 'completed' ||
      (request.status === 'received' && !usagePending);
    const group = returnNeedsDeclaration ? groups[0] : waitingForManager ? groups[1]
      : resolved ? groups[2] : handoverReady || (isUnderRepair.value && request.status === 'received' && usagePending)
      ? groups[0] : groups[1];
    group.requests.push(request);
  }
  return groups.filter(group => group.requests.length > 0);
});
const needsAction = computed(() => (requestGroups.value.find(group => group.key === 'action')?.requests.length ?? 0) > 0);
const pendingUsage = computed(() => partRequests.value
  .filter(pr => pr.status === 'received')
  .reduce((count, pr) => count + pr.items.filter(item => item.partSource === 'fixhome' && (!item.usageStatus || item.usageStatus === 'pending')).length, 0));
watch(pendingUsage, count => emit('pending-usage', count), { immediate: true });
const returnSummary = computed(() => returnRecords.value.reduce((totals, record) => {
  const declaredWaiting = Math.max(0, record.declaredQty - record.managerAcceptedQty);
  totals.needDeclare += Math.max(0, record.outstandingQty - declaredWaiting);
  totals.awaitingManager += Math.min(record.outstandingQty, declaredWaiting);
  return totals;
}, { needDeclare: 0, awaitingManager: 0 }));
watch(returnSummary, totals => {
  emit('pending-returns', totals.needDeclare + totals.awaitingManager);
  emit('return-summary', totals);
}, { immediate: true });
watch(
  () => [partRequests.value.length, needsAction.value] as const,
  ([count, action]) => emit('summary', { count, needsAction: action }),
);

const selectedTotalQuantity = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + item.quantity, 0),
);

const selectedTotalPrice = computed(() =>
  selectedItems.value.reduce((sum, item) => sum + item.quantity * item.price, 0),
);

const activePartEstimatedPrice = computed(() => {
  if (!selectedPart.value) return 0;
  return selectedPart.value.sellingPrice * Math.max(1, selectedQuantity.value);
});

// Format warranty helpers
const formatWarrantyDays = (days?: number | null, policy?: string | null): string => {
  if (days && days > 0) {
    if (days >= 360) {
      const years = Math.round(days / 365);
      return `${years > 0 ? years : 1} năm (${days} ngày)`;
    }
    if (days >= 30) {
      const months = Math.round(days / 30);
      return `${months} tháng (${days} ngày)`;
    }
    return `${days} ngày`;
  }
  if (policy) return policy;
  return 'Bảo hành chính hãng FixHome';
};

const getWarrantyBadge = (days?: number | null): string => {
  if (days && days > 0) {
    if (days >= 360) return `BH ${Math.round(days / 365)} năm`;
    if (days >= 30) return `BH ${Math.round(days / 30)} tháng`;
    return `BH ${days} ngày`;
  }
  return 'BH chính hãng';
};

const getPartWarrantyFromHistory = (item: { partCatalogId?: string | null }) => {
  if (item.partCatalogId && partsMap.value.has(item.partCatalogId)) {
    const part = partsMap.value.get(item.partCatalogId);
    return getWarrantyBadge(part?.warrantyDays);
  }
  return null;
};

// Data loading
let requestsLoadVersion = 0;
const loadPartRequests = async (quiet = false) => {
  const version = ++requestsLoadVersion;
  try {
    if (!quiet) {
      loading.value = true;
      emit('requests-loading');
    }
    const records = await partRequestsApi.getByOrderId(props.orderId);
    if (version !== requestsLoadVersion) return;
    partRequests.value = records;
    partRequestsLoaded.value = true;
    backgroundSyncError.value = false;
    emit('requests', records);
  } catch (err: unknown) {
    if (version !== requestsLoadVersion) return;
    if (quiet) backgroundSyncError.value = true;
    else {
      emit('requests-error');
      actionError.value = userFacingError(err, 'Không thể tải danh sách yêu cầu linh kiện.');
    }
  } finally {
    if (version === requestsLoadVersion && !quiet) loading.value = false;
  }
};

const loadReturns = async () => {
  const version = ++returnsLoadVersion;
  try {
    const records = await partRequestsApi.getReturnsByOrderId(props.orderId);
    if (version !== returnsLoadVersion) return;
    returnRecords.value = records;
    returnsLoadError.value = false;
    // An open form must use the same fresh version and quantity limit as the list.
    const target = declareTarget.value;
    if (target) {
      const record = records.find((row) =>
        row.partRequestId === target.requestId && row.partRequestItemId === target.itemId,
      );
      const maxQty = record ? canDeclareMoreQty(record) : 0;
      declareTarget.value = record && maxQty > 0
        ? { ...target, itemName: record.partNameSnapshot, maxQty, version: record.version }
        : null;
    }
  } catch (err: unknown) {
    if (version !== returnsLoadVersion) return;
    declareTarget.value = null;
    // Feature flag off or no access to the route: hide the return UI and keep
    // the existing QR / usage / part-request flow untouched.
    returnsLoadError.value = !isPartReturnsUnavailableError(err);
    if (!returnsLoadError.value) returnRecords.value = [];
  }
};

const onSearchInput = () => { showSearchDropdown.value = true; picker.searchSoon(); };
const selectCategory = (value: string) => { showSearchDropdown.value = true; picker.selectCategory(value); };
const clearSearch = () => { showSearchDropdown.value = true; picker.clear(); };

const selectPartForForm = (part: FixHomePart) => {
  selectedPart.value = part;
  selectedQuantity.value = 1;
  itemNote.value = '';
  showSearchDropdown.value = false;
};

const clearSelectedPart = () => {
  selectedPart.value = null;
  selectedQuantity.value = 1;
  itemNote.value = '';
};

const addItemToForm = () => {
  if (!selectedPart.value) return;
  const part = selectedPart.value;

  const existing = selectedItems.value.find((i) => i.partCatalogId === part.id);
  if (existing) {
    existing.quantity += Math.max(1, selectedQuantity.value);
    if (itemNote.value.trim() && !existing.note) {
      existing.note = itemNote.value.trim();
    }
  } else {
    selectedItems.value.push({
      partCatalogId: part.id,
      partName: part.name,
      sku: part.sku,
      price: part.sellingPrice,
      warrantyDays: part.warrantyDays,
      warrantyPolicy: part.warrantyPolicy,
      quantity: Math.max(1, selectedQuantity.value),
      note: itemNote.value.trim(),
    });
  }

  clearSelectedPart();
};

const removeItemFromForm = (index: number) => {
  selectedItems.value.splice(index, 1);
};

const increaseQuantity = (index: number) => {
  if (selectedItems.value[index]) {
    selectedItems.value[index].quantity += 1;
  }
};

const decreaseQuantity = (index: number) => {
  if (selectedItems.value[index]) {
    if (selectedItems.value[index].quantity > 1) {
      selectedItems.value[index].quantity -= 1;
    } else {
      removeItemFromForm(index);
    }
  }
};

const handleClickOutside = (e: MouseEvent) => {
  // Loading can remove the clicked result/load-more button before bubbling ends.
  // The event path still records that the click originated inside this picker.
  if (searchContainerRef.value && !e.composedPath().includes(searchContainerRef.value)) {
    showSearchDropdown.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  void loadPartRequests();
  void loadReturns();
  void picker.load();
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  stopLiveParts();
  stopOfflineParts();
  ++returnsLoadVersion;
  ++requestsLoadVersion;
});

let refreshRunning = false;
let refreshQueued = false;
async function refreshParts() {
  if (refreshRunning) { refreshQueued = true; return; }
  refreshRunning = true;
  do {
    refreshQueued = false;
    await Promise.all([loadPartRequests(partRequestsLoaded.value), loadReturns()]);
  } while (refreshQueued);
  refreshRunning = false;
}
let stopLiveParts = onOrderChange(props.orderId, event => {
  if (!event.kinds || event.kinds.some(kind => ['part', 'quotation', 'invoice', 'cash', 'status', 'additional_cost'].includes(kind))) void refreshParts();
});
const stopOfflineParts = whileOffline(() => void refreshParts(), 20_000);
watch(() => props.orderId, id => {
  stopLiveParts();
  ++requestsLoadVersion;
  ++returnsLoadVersion;
    partRequests.value = [];
    partRequestsLoaded.value = false;
    returnRecords.value = [];
    requestDetailOverrides.value = {};
  declareTarget.value = null;
  selectedItems.value = [];
  showCreateForm.value = false;
  actionError.value = null;
  actionSuccess.value = null;
  backgroundSyncError.value = false;
  stopLiveParts = onOrderChange(id, event => {
    if (!event.kinds || event.kinds.some(kind => ['part', 'quotation', 'invoice', 'cash', 'status', 'additional_cost'].includes(kind))) void refreshParts();
  });
  void refreshParts();
});

const submitPreRepairRequest = async () => {
  if (selectedItems.value.length === 0) {
    actionError.value = 'Vui lòng chọn ít nhất 1 linh kiện từ danh mục FixHome.';
    return;
  }

  try {
    actionLoading.value = true;
    actionError.value = null;
    actionSuccess.value = null;

    await partRequestsApi.createPreRepair(props.orderId, {
      items: selectedItems.value.map((i) => ({
        partCatalogId: i.partCatalogId,
        quantity: i.quantity,
        note: i.note,
      })),
      fulfillmentMethod: fulfillmentMethod.value,
      reason: requestReason.value || 'Linh kiện dự kiến trước khi đi kiểm tra',
    });

    actionSuccess.value = 'Đã gửi yêu cầu linh kiện dự kiến tới Quản lý dịch vụ!';
    showCreateForm.value = false;
    selectedItems.value = [];
    requestReason.value = '';
    clearSelectedPart();
    await loadPartRequests();
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value =
      userFacingError(err, 'Không thể tạo yêu cầu linh kiện.');
  } finally {
    actionLoading.value = false;
  }
};

const handleReceiveQr = async (requestId: string) => {
  if (!qrTokenInput.value.trim()) {
    actionError.value = 'Vui lòng nhập mã bàn giao.';
    return;
  }

  try {
    actionLoading.value = true;
    actionError.value = null;
    actionSuccess.value = null;

    await partRequestsApi.receiveByQr(requestId, {
      qrToken: qrTokenInput.value.trim(),
    });

    actionSuccess.value = 'Xác nhận nhận linh kiện thành công! Giờ bạn có thể tiến hành sửa chữa.';
    showQrInput.value = null;
    qrTokenInput.value = '';
    await Promise.all([loadPartRequests(), loadReturns()]);
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value =
      userFacingError(err, 'Mã QR không hợp lệ hoặc không khớp.');
  } finally {
    actionLoading.value = false;
  }
};

const handleUpdateUsage = async (
  requestId: string,
  itemId: string,
  status: 'used' | 'returned',
) => {
  const request = partRequests.value.find(row => row.id === requestId);
  if (!isUnderRepair.value || request?.status !== 'received' || props.disabled || actionLoading.value) return;
  try {
    actionLoading.value = true;
    actionError.value = null;

    const saved = await partRequestsApi.updateItemUsage(requestId, itemId, {
      usageStatus: status,
    });
    // Update only the confirmed row; don't replace the list with skeletons,
    // refetch the entire order, or move the technician back to the page top.
    partRequests.value = partRequests.value.map(row => row.id === requestId
      ? { ...row, items: row.items.map(item => item.id === itemId ? { ...item, ...(saved || {}), usageStatus: saved?.usageStatus ?? status } : item) }
      : row);
    emit('requests', partRequests.value);
    actionSuccess.value =
      status === 'used' ? 'Đã ghi nhận linh kiện đã dùng.' : 'Đã ghi nhận linh kiện không sử dụng.';
    // Warehouse return quantities are separate, refreshed without hiding rows.
    void loadReturns();
  } catch (err: unknown) {
    actionError.value =
      userFacingError(err, 'Không thể cập nhật trạng thái linh kiện.');
  } finally {
    actionLoading.value = false;
  }
};

const openDeclareReturn = (
  requestId: string,
  itemId: string,
  itemName: string,
  record: PartCustodyReturnRecord,
) => {
  const request = partRequests.value.find(row => row.id === requestId);
  const item = request?.items.find(row => row.id === itemId);
  if (!request || !item || !canDeclareReturn(request, item) || props.disabled) return;
  const maxQty = canDeclareMoreQty(record);
  if (maxQty < 1 || declareSubmitting.value) return;
  declareTarget.value = { requestId, itemId, itemName, maxQty, version: record.version };
  declareQty.value = 1;
  actionError.value = null;
  actionSuccess.value = null;
};

const submitDeclareReturn = async () => {
  const target = declareTarget.value;
  if (!target || declareSubmitting.value || props.disabled || returnsLoadError.value) return;
  const request = partRequests.value.find(row => row.id === target.requestId);
  const item = request?.items.find(row => row.id === target.itemId);
  if (!request || !item || !canDeclareReturn(request, item)) { declareTarget.value = null; return; }
  const quantity = Number(declareQty.value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > target.maxQty) {
    actionError.value = `Số lượng trả phải là số nguyên từ 1 đến ${target.maxQty}.`;
    return;
  }

  declareSubmitting.value = true;
  actionError.value = null;
  actionSuccess.value = null;
  try {
    await partRequestsApi.declareReturn(target.requestId, target.itemId, {
      quantity,
      expectedVersion: target.version,
      idempotencyKey: createIdempotencyKey('declare'),
    });
    declareTarget.value = null;
    actionSuccess.value =
      'Đã gửi khai trả linh kiện. Quản lý dịch vụ sẽ nhận và xác nhận số lượng thực tế.';
    // A declaration only changes custody records, not the part request or invoice.
    // Avoid a full page refresh and retain the open declaration context.
    await loadReturns();
  } catch (err: unknown) {
    actionError.value = userFacingError(
      err,
      'Không gửi được khai trả linh kiện. Vui lòng thử lại.',
    );
    // Version đã cũ (người khác vừa cập nhật): đọc lại số liệu trước khi gửi lại.
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (status === 409) await loadReturns();
  } finally {
    declareSubmitting.value = false;
  }
};

const formatStatusText = (status: string) => {
  switch (status.toLowerCase()) {
    case 'requested':
      return 'Đã gửi - Chờ kho chuẩn bị';
    case 'ready':
      return 'Sẵn sàng nhận';
    case 'delivering':
      return 'Đang giao hàng';
    case 'received':
      return 'Đã nhận bàn giao qua QR';
    case 'completed':
      return 'Đã hoàn thành';
    case 'cancelled':
      return 'Đã huỷ';
    default:
      return 'Trạng thái chưa xác định';
  }
};

const getStatusBadgeClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'requested':
      return 'bg-warning-100 text-warning-800 border-warning-200';
    case 'ready':
      return 'bg-brand-100 text-brand-800 border-brand-200';
    case 'delivering':
      return 'bg-brand-100 text-brand-800 border-brand-200';
    case 'received':
      return 'bg-success-100 text-success-800 border-success-200';
    case 'completed':
      return 'bg-ink-100 text-ink-800 border-ink-200';
    case 'cancelled':
      return 'bg-danger-100 text-danger-800 border-danger-200';
    default:
      return 'bg-ink-100 text-ink-800 border-ink-200';
  }
};
</script>

<template>
  <div class="space-y-4 text-xs">
      <!-- Alerts -->
      <div
        v-if="actionSuccess"
        class="p-3 rounded-lg bg-success-50 text-success-800 border border-success-200 flex items-center gap-2"
      >
        <CheckCircle2 :size="15" class="text-success-600 shrink-0" />
        <span>{{ actionSuccess }}</span>
      </div>

      <div
        v-if="actionError"
        class="p-3 rounded-lg bg-danger-50 text-danger-800 border border-danger-200 flex items-center gap-2"
      >
        <AlertCircle :size="15" class="text-danger-600 shrink-0" />
        <span>{{ actionError }}</span>
      </div>

      <p v-if="backgroundSyncError" role="status" class="text-xs text-ink-500">Chưa đồng bộ được linh kiện mới nhất. <button type="button" class="font-semibold text-brand-700 underline" @click="refreshParts">Thử lại</button></p>
      <div
        v-if="returnsLoadError"
        class="p-2.5 rounded-lg bg-ink-50 border border-ink-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-600"
      >
        <span>Chưa tải được thông tin hoàn trả linh kiện.</span>
        <button
          type="button"
          class="font-semibold text-brand-700 hover:underline"
          @click="loadReturns"
        >
          Thử lại
        </button>
      </div>

      <!-- Action: Create Pre-Repair Request (Only in ACCEPTED state) -->
      <div
        v-if="isAccepted && !hasActivePreRepair"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-ink-700 min-w-0">Cần mang linh kiện của FixHome theo? Xin trước khi đi.</p>
          <FhButton
            v-if="!showCreateForm"
            variant="primary"
            size="sm"
            @click="showCreateForm = true"
          >
            <Plus :size="14" class="mr-1" /> Tạo yêu cầu linh kiện
          </FhButton>
        </div>

        <!-- Pre-Repair Form -->
        <div v-if="showCreateForm" class="space-y-4 pt-3 border-t border-ink-200">
          <!-- Fulfillment & Reason inputs -->
          <div class="grid sm:grid-cols-2 gap-3 bg-ink-50/60 p-3 rounded-lg border border-ink-200">
            <div>
              <label class="block font-semibold text-ink-800 mb-1 text-xs">Phương thức nhận linh kiện</label>
              <select
                v-model="fulfillmentMethod"
                class="w-full text-xs rounded border border-ink-300 p-2 bg-white text-ink-900 focus:outline-brand-500"
              >
                <option value="pickup">Tự lấy tại kho FixHome</option>
                <option value="delivery">Giao tới địa chỉ</option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-ink-800 mb-1 text-xs">Ghi chú / Lý do yêu cầu linh kiện</label>
              <input
                v-model="requestReason"
                type="text"
                placeholder="VD: Nghi hỏng bo mạch chính hoặc cảm biến nhiệt độ"
                class="w-full text-xs rounded border border-ink-300 p-2 bg-white text-ink-900 focus:outline-brand-500"
              />
            </div>
          </div>

          <!-- SMART PART PICKER COMPONENT -->
          <div class="p-3.5 rounded-xl border border-brand-200 bg-brand-50/20 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h5 class="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                  <Search :size="14" class="text-brand-600" />
                  Chọn linh kiện FixHome
                </h5>
              </div>
              <span class="text-[11px] font-medium text-brand-700 bg-brand-100/70 px-2 py-0.5 rounded-full">
                {{ isSearchingCatalog ? 'Đang tải…' : `${catalogTotal} linh kiện` }}
              </span>
            </div>

            <!-- Category filter tags -->
            <div class="flex flex-wrap gap-1.5 pt-0.5">
              <button
                v-for="cat in CATEGORY_TABS"
                :key="cat.value"
                type="button"
                class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                :class="
                  activeCategory === cat.value
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-ink-700 hover:bg-brand-50 border border-ink-200'
                "
                @click="selectCategory(cat.value)"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Search input bar with Dropdown -->
            <div ref="searchContainerRef" class="relative">
              <div class="relative flex items-center">
                <Search :size="15" class="absolute left-3 text-ink-400 pointer-events-none" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Tên linh kiện, mã hoặc hãng"
                  class="w-full text-xs rounded-lg border border-ink-300 pl-9 pr-16 py-2 bg-white text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-hidden transition-all"
                  @focus="showSearchDropdown = true"
                  @input="onSearchInput"
                />
                <div class="absolute right-2.5 flex items-center gap-1">
                  <Loader2 v-if="isSearchingCatalog" :size="14" class="animate-spin text-brand-600" />
                  <button
                    v-if="searchQuery || activeCategory !== 'ALL'"
                    type="button"
                    class="text-ink-400 hover:text-ink-700 p-0.5 rounded"
                    title="Xóa tìm kiếm"
                    @click="clearSearch"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>

              <!-- Search results popover -->
              <div
                v-if="showSearchDropdown"
                class="mt-1.5 bg-white rounded-xl border border-ink-200 max-h-72 overflow-y-auto overscroll-contain divide-y divide-ink-100"
                @keydown.esc="showSearchDropdown = false"
              >
                <div v-if="isSearchingCatalog" class="p-3 text-center text-ink-400 text-xs">
                  <Loader2 :size="15" class="animate-spin inline mr-1 text-brand-600" /> Đang tìm kiếm trong kho linh kiện...
                </div>

                <div
                  v-else-if="!catalogError && searchResults.length === 0"
                  class="p-4 text-center text-ink-500 text-xs space-y-1"
                >
                  <Package :size="20" class="mx-auto text-ink-300" />
                  <p class="font-medium text-ink-700">Không tìm thấy linh kiện phù hợp</p>
                </div>

                <button
                  v-for="part in (catalogError || isSearchingCatalog ? [] : searchResults)"
                  type="button"
                  data-testid="catalog-result"
                  :key="part.id"
                  class="w-full text-left p-2.5 hover:bg-brand-50/70 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  @click="selectPartForForm(part)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="font-semibold text-ink-900 group-hover:text-brand-700 transition-colors truncate">
                        {{ part.name }}
                      </span>
                      <span
                        v-if="part.sku"
                        class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-ink-100 text-ink-600 shrink-0"
                      >
                        {{ part.sku }}
                      </span>
                    </div>
                    <p
                      v-if="part.description"
                      class="text-[11px] text-ink-500 truncate"
                    >
                      {{ part.description }}
                    </p>
                  </div>

                  <div class="text-right shrink-0 space-y-1">
                    <div class="font-num font-bold text-xs text-brand-700">
                      <FhMoney :amount="part.sellingPrice" />
                    </div>
                    <span
                      class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200"
                    >
                      <ShieldCheck :size="12" />
                      {{ getWarrantyBadge(part.warrantyDays) }}
                    </span>
                  </div>
                </button>
                <div v-if="catalogError" class="p-3 text-xs text-danger-700" role="alert">
                  Chưa tải được danh mục linh kiện.
                  <button type="button" data-testid="catalog-retry" class="ml-2 underline" @click="picker.retry">Thử lại</button>
                </div>
                <div v-else-if="!isSearchingCatalog" class="p-2 text-center text-xs text-ink-600">
                  {{ searchResults.length }} / {{ catalogTotal }} linh kiện
                  <button v-if="catalogHasMore" type="button" data-testid="catalog-load-more" class="ml-2 text-brand-700 underline" @click="picker.loadMore">Tải thêm</button>
                </div>
              </div>
            </div>

            <!-- SPOTLIGHT CARD: Khi thợ đã click chọn 1 linh kiện -->
            <div
              v-if="selectedPart"
              class="border-2 border-brand-500 bg-brand-50/40 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-200"
            >
              <!-- Card Header -->
              <div class="flex items-start justify-between gap-2 border-b border-brand-200/80 pb-2.5">
                <div class="flex items-start gap-2.5">
                  <div class="p-2 rounded-lg bg-brand-600 text-white shrink-0 mt-0.5 shadow-xs">
                    <Wrench :size="16" />
                  </div>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="font-bold text-ink-900 text-sm">
                        {{ selectedPart.name }}
                      </h4>
                      <span
                        v-if="selectedPart.sku"
                        class="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-brand-100 text-brand-800 border border-brand-300"
                      >
                        SKU: {{ selectedPart.sku }}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  class="text-ink-400 hover:text-ink-700 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-ink-200 flex items-center gap-1 transition-all"
                  @click="clearSelectedPart"
                >
                  <X :size="14" /> Đổi linh kiện khác
                </button>
              </div>

              <!-- The technician needs price and quantity now. Warranty remains in details. -->
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-brand-200/60 px-3 py-2">
                <span class="text-xs text-ink-500">Đơn giá</span>
                <strong class="text-base text-brand-700 font-num"><FhMoney :amount="selectedPart.sellingPrice" /></strong>
              </div>
              <details class="rounded-lg bg-white px-3 py-2 text-xs text-ink-600 border border-ink-200">
                <summary class="cursor-pointer font-semibold text-brand-700"><span aria-hidden="true">ⓘ</span> Chi tiết linh kiện</summary>
                <p v-if="selectedPart.description" class="mt-2">{{ selectedPart.description }}</p>
                <p class="mt-1">Bảo hành: {{ formatWarrantyDays(selectedPart.warrantyDays, selectedPart.warrantyPolicy) }}</p>
                <p v-if="selectedPart.warrantyPolicy" class="mt-1">{{ selectedPart.warrantyPolicy }}</p>
              </details>

              <!-- Add to Request Action Controls -->
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <!-- Quantity & Total -->
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1 bg-white p-1 rounded-lg border border-ink-200">
                    <span class="text-[11px] font-semibold text-ink-600 px-1.5">SL:</span>
                    <button
                      type="button"
                      class="h-7 w-7 rounded bg-ink-100 hover:bg-ink-200 text-ink-800 font-bold flex items-center justify-center transition-colors disabled:opacity-50"
                      :disabled="selectedQuantity <= 1"
                      @click="selectedQuantity = Math.max(1, selectedQuantity - 1)"
                    >
                      <Minus :size="13" />
                    </button>
                    <input
                      v-model.number="selectedQuantity"
                      type="number"
                      min="1"
                      max="50"
                      class="w-10 h-7 text-xs font-bold font-num text-center bg-transparent border-0 outline-hidden"
                    />
                    <button
                      type="button"
                      class="h-7 w-7 rounded bg-ink-100 hover:bg-ink-200 text-ink-800 font-bold flex items-center justify-center transition-colors"
                      @click="selectedQuantity += 1"
                    >
                      <Plus :size="13" />
                    </button>
                  </div>

                  <div class="text-xs">
                    <span class="text-ink-500">Tạm tính:</span>
                    <strong class="text-brand-900 font-num ml-1 font-bold">
                      <FhMoney :amount="activePartEstimatedPrice" />
                    </strong>
                  </div>
                </div>

                <!-- Note and Add Button -->
                <div class="flex items-center gap-2 flex-1 sm:max-w-md">
                  <input
                    v-model="itemNote"
                    type="text"
                    placeholder="Ghi chú item (VD: mang sơ cua, thay buồng lạnh)..."
                    class="flex-1 text-xs rounded border border-ink-300 p-1.5 bg-white text-ink-900 placeholder:text-ink-400"
                  />
                  <button
                    type="button"
                    class="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all shrink-0 cursor-pointer"
                    @click="addItemToForm"
                  >
                    <Plus :size="14" /> Thêm vào danh sách
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Compact selected parts: no dense seven-column table on mobile. -->
          <div v-if="selectedItems.length > 0" class="space-y-2">
            <div class="flex items-center justify-between gap-2 text-sm">
              <strong class="text-ink-900">Đã chọn {{ selectedItems.length }} loại · {{ selectedTotalQuantity }} cái</strong>
              <strong class="font-num text-brand-700"><FhMoney :amount="selectedTotalPrice" /></strong>
            </div>
            <div class="space-y-2">
              <div v-for="(item, idx) in selectedItems" :key="item.partCatalogId" class="rounded-xl border border-ink-200 bg-white px-3 py-2.5 space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-ink-900">{{ item.partName }}</p>
                    <p v-if="item.sku" class="text-[11px] text-ink-500 font-mono">{{ item.sku }}</p>
                  </div>
                  <button type="button" class="shrink-0 w-10 h-10 inline-flex items-center justify-center text-danger-600 rounded-lg hover:bg-danger-50" aria-label="Xoá linh kiện" @click="removeItemFromForm(idx)"><Trash2 :size="16" /></button>
                </div>
                <div class="flex flex-wrap justify-between items-center gap-2">
                  <div class="inline-flex items-center rounded-lg border border-ink-200 bg-ink-50">
                    <button type="button" class="w-10 h-10 flex items-center justify-center" :aria-label="`Giảm số lượng ${item.partName}`" @click="decreaseQuantity(idx)"><Minus :size="14" /></button>
                    <span class="w-7 text-center font-num font-semibold">{{ item.quantity }}</span>
                    <button type="button" class="w-10 h-10 flex items-center justify-center" :aria-label="`Tăng số lượng ${item.partName}`" @click="increaseQuantity(idx)"><Plus :size="14" /></button>
                  </div>
                  <div class="text-right text-xs text-ink-600">
                    <p><FhMoney :amount="item.price" />/cái</p>
                    <strong class="font-num text-sm text-brand-700"><FhMoney :amount="item.price * item.quantity" /></strong>
                  </div>
                </div>
                <p v-if="item.note" class="text-xs text-ink-500">{{ item.note }}</p>
              </div>
            </div>
            <p class="text-xs text-ink-500">Giá dự kiến · chưa tính vào hóa đơn khách.</p>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="flex items-center justify-end gap-2 pt-2">
            <FhButton variant="ghost" size="sm" @click="showCreateForm = false">Hủy bỏ</FhButton>
            <FhButton
              variant="primary"
              size="sm"
              :disabled="selectedItems.length === 0 || actionLoading"
              @click="submitPreRepairRequest"
            >
              <Send :size="14" class="mr-1" /> Gửi yêu cầu tới Quản lý
            </FhButton>
          </div>
        </div>
      </div>

      <!-- Part Requests List -->
      <div v-if="loading" class="space-y-2" aria-busy="true" aria-label="Đang tải linh kiện">
        <FhSkeleton height="16px" width="40%" />
        <FhSkeleton height="44px" rounded="md" />
      </div>

      <p v-else-if="partRequests.length === 0 && !showCreateForm" class="text-sm text-ink-500">
        Chưa có yêu cầu linh kiện.
      </p>

      <div v-else class="space-y-4">
        <section v-for="group in requestGroups" :key="group.key" class="space-y-2.5" :data-testid="`parts-group-${group.key}`">
          <h4 class="text-xs font-bold uppercase tracking-wide text-ink-500">{{ group.label }} <span class="font-num">· {{ group.requests.length }}</span></h4>
          <div class="space-y-3">
        <div
          v-for="pr in group.requests"
          :key="pr.id"
          class="border border-ink-200 rounded-xl bg-white overflow-hidden shadow-xs space-y-3 p-3.5"
        >
          <!-- Request Header -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold border"
                :class="getStatusBadgeClass(pr.status)"
              >
                {{ formatStatusText(pr.status) }}
              </span>

              <span
                v-if="pr.requestType === 'pre_repair'"
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning-50 text-warning-700 border border-warning-200"
              >
                Trước sửa chữa
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-200"
              >
                {{ pr.requestType === 'quotation' ? 'Theo báo giá đã duyệt' : 'Phát sinh khi sửa' }}
              </span>

              <span class="text-ink-500 text-[11px] flex items-center gap-1">
                <Truck v-if="pr.fulfillmentMethod === 'delivery'" :size="13" />
                <Package v-else :size="13" />
                {{ pr.fulfillmentMethod === 'delivery' ? 'Giao hàng' : 'Tự lấy tại kho' }}
              </span>
            </div>

            <button type="button" class="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-brand-700" :aria-expanded="isRequestExpanded(pr.id, group.key)" @click="toggleRequestExpanded(pr.id, group.key)">
              {{ isRequestExpanded(pr.id, group.key) ? 'Thu gọn' : 'Chi tiết' }}
              <span aria-hidden="true">{{ isRequestExpanded(pr.id, group.key) ? '⌃' : '⌄' }}</span>
            </button>
          </div>
          <div v-show="isRequestExpanded(pr.id, group.key)" class="space-y-3">
          <!-- Reason & Notes -->
          <p v-if="pr.reason" class="text-xs text-ink-700">
            <strong>Lý do:</strong> {{ pr.reason }}
          </p>

          <!-- Delivery Shipping Fee if any -->
          <div v-if="pr.shippingFee > 0" class="text-xs text-brand-700 font-medium">
            Phí giao hàng: <FhMoney :amount="pr.shippingFee" />
          </div>

          <!-- Pending Preparation State -->
          <div
            v-if="pr.status === 'requested'"
            class="p-2.5 rounded-lg bg-warning-50/80 border border-warning-200 flex flex-wrap items-center justify-between gap-2"
          >
            <div class="flex items-center gap-2 text-xs text-warning-800">
              <Clock :size="14" class="text-warning-600 shrink-0" />
              <span>Đang chờ chuẩn bị linh kiện…</span>
            </div>
          </div>

          <!-- QR Handover Action (When READY or DELIVERING) -->
          <div
            v-if="
              (pr.fulfillmentMethod === 'pickup' && pr.status === 'ready') ||
              (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering')
            "
            class="p-3 rounded-lg bg-brand-50 border border-brand-200 space-y-2"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-brand-900 font-bold">
                <QrCode :size="16" class="text-brand-600 shrink-0" />
                <span>Linh kiện đã sẵn sàng bàn giao!</span>
              </div>
              <div class="flex items-center gap-2">
                <FhButton
                  v-if="showQrInput !== pr.id"
                  variant="primary"
                  size="sm"
                  @click="showQrInput = pr.id"
                >
                  Nhập mã bàn giao
                </FhButton>
              </div>
            </div>


            <!-- Input QR Token form -->
            <div v-if="showQrInput === pr.id" class="flex flex-wrap items-center gap-2 pt-1">
              <input
                v-model="qrTokenInput"
                type="text"
                placeholder="Nhập mã trên phiếu (VD: FH-PR-...)"
                class="flex-1 min-w-[200px] text-xs rounded border border-brand-300 p-2 bg-white"
              />
              <FhButton
                variant="primary"
                size="sm"
                :disabled="!qrTokenInput.trim() || actionLoading"
                @click="handleReceiveQr(pr.id)"
              >
                <Check :size="14" class="mr-1" /> Xác nhận đã nhận
              </FhButton>
              <FhButton variant="ghost" size="sm" @click="showQrInput = null">Hủy</FhButton>
            </div>
          </div>

          <!-- Received Badge -->
          <div
            v-if="pr.receivedAt"
            class="text-[11px] text-success-800 bg-success-50 border border-success-200 p-2 rounded flex items-center gap-1.5"
          >
            <CheckCircle2 :size="14" class="text-success-600" />
            <span>Đã nhận bàn giao lúc: {{ vnDateTimeString(pr.receivedAt) }}</span>
          </div>

          <!-- Items list in this request -->
          <div class="space-y-1">
            <h5 class="font-semibold text-ink-800 text-[11px]">Thực tế đã dùng/không dùng</h5>
            <p v-if="requestHasReturns(pr)" class="text-ink-600">“Hoàn trả” ghi nhận không dùng; “Khai trả kho” gửi số lượng để quản lý dịch vụ nhận thực tế.</p>
            <div class="space-y-2">
              <article v-for="item in pr.items" :key="item.id" class="rounded-xl border border-ink-200 bg-white p-3 space-y-2.5" :data-testid="`part-item-${item.id}`">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h6 class="font-semibold text-sm text-ink-900">{{ item.partNameSnapshot }}</h6>
                    <p v-if="item.note" class="mt-0.5 text-xs text-ink-500">Ghi chú: {{ item.note }}</p>
                    <span class="mt-1 inline-flex rounded-full bg-ink-50 px-2 py-0.5 text-[10px] text-ink-600">
                      {{ item.partSource === 'fixhome' ? 'FixHome' : item.partSource === 'technician' ? 'Kỹ thuật viên tự có' : 'Mua ngoài' }}
                    </span>
                  </div>
                  <span v-if="getPartWarrantyFromHistory(item)" class="inline-flex shrink-0 items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2 py-1 text-[10px] font-semibold text-success-700">
                    <ShieldCheck :size="11" /> {{ getPartWarrantyFromHistory(item) }}
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-2 rounded-lg bg-ink-25 p-2 text-xs">
                  <p class="text-ink-600">Số lượng <span class="font-num font-semibold text-ink-900">{{ item.quantity }}</span></p>
                  <p class="text-right text-ink-600">Đơn giá <span class="font-num text-ink-900"><FhMoney :amount="item.unitPriceSnapshot" /></span></p>
                  <p class="col-span-2 flex justify-between border-t border-ink-100 pt-1.5 text-ink-700"><span>Thành tiền</span><strong class="font-num text-ink-900"><FhMoney :amount="item.unitPriceSnapshot * item.quantity" /></strong></p>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span v-if="item.usageStatus === 'used'" class="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700"><Check :size="13" /> Đã dùng</span>
                  <span v-else-if="item.usageStatus === 'returned'" class="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700"><RotateCcw :size="13" /> Hoàn trả</span>
                  <span v-else class="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">Chưa ghi nhận sử dụng</span>
                  <div v-if="isUnderRepair && pr.status === 'received'" class="flex flex-wrap gap-2">
                    <button type="button" class="min-h-10 rounded-lg border px-3 text-xs font-semibold" :class="item.usageStatus === 'used' ? 'border-success-600 bg-success-600 text-white' : 'border-success-300 bg-success-50 text-success-700 hover:bg-success-100'" :aria-pressed="item.usageStatus === 'used'" :disabled="actionLoading || disabled" @click="handleUpdateUsage(pr.id, item.id, 'used')">Đã dùng</button>
                    <button type="button" class="min-h-10 rounded-lg border px-3 text-xs font-semibold" :class="item.usageStatus === 'returned' ? 'border-warning-600 bg-warning-600 text-white' : 'border-warning-300 bg-warning-50 text-warning-700 hover:bg-warning-100'" :aria-pressed="item.usageStatus === 'returned'" :disabled="actionLoading || disabled" @click="handleUpdateUsage(pr.id, item.id, 'returned')">Hoàn trả</button>
                  </div>
                </div>
                <div v-if="requestHasReturns(pr)" class="space-y-1 border-t border-ink-100 pt-2 text-xs">
                  <template v-for="record in [returnFor(item.id)]" :key="record ? `ret-${record.partRequestItemId}` : `ret-missing-${item.id}`">
                    <div v-if="record" class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-num text-ink-700">Cấp {{ record.issuedQty }} · Dùng {{ record.usedQty }} · Cần trả {{ record.outstandingQty }}</span>
                      <span v-if="pendingDeclaredQty(record) > 0" class="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-2 py-1 text-[10px] font-semibold text-warning-700"><Clock :size="11" /> Đang chờ quản lý xác nhận</span>
                      <span v-else-if="record.outstandingQty === 0" class="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2 py-1 text-[10px] font-semibold text-success-700"><CheckCircle2 :size="11" /> Đã nhận</span>
                      <button v-if="canDeclareMoreQty(record) > 0 && canDeclareReturn(pr, item)" type="button" data-testid="open-declare-return" class="min-h-10 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-100" :disabled="declareSubmitting || returnsLoadError || disabled" @click="openDeclareReturn(pr.id, item.id, item.partNameSnapshot, record)"><Undo2 :size="13" class="mr-1 inline" />Khai trả</button>
                    </div>
                    <span v-else class="text-xs text-ink-400">Chưa có thông tin hoàn trả</span>
                  </template>
                </div>
              </article>
            </div>
          </div>

          <!-- P1: khai trả phần chưa dùng; quản lý dịch vụ vẫn phải nhận và xác nhận thực tế -->
          <div
            v-if="declareTarget && declareTarget.requestId === pr.id"
            class="space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
          >
            <p class="text-xs font-semibold text-ink-900">
              Khai trả kho: {{ declareTarget.itemName }}
              <span class="font-normal text-ink-500">(tối đa {{ declareTarget.maxQty }})</span>
            </p>
            <div class="flex flex-wrap items-end gap-2">
              <div>
                <label
                  :for="`declare-qty-${declareTarget.itemId}`"
                  class="mb-1 block text-[11px] font-semibold text-ink-700"
                >Số lượng trả</label>
                <input
                  :id="`declare-qty-${declareTarget.itemId}`"
                  v-model.number="declareQty"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :max="declareTarget.maxQty"
                  class="w-20 rounded border border-ink-300 bg-white p-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </div>
              <FhButton
                data-testid="submit-declare-return"
                variant="primary"
                size="sm"
                :loading="declareSubmitting"
                :disabled="declareSubmitting || !declareValid"
                @click="submitDeclareReturn"
              >
                <Send :size="13" class="mr-1" /> Gửi khai trả
              </FhButton>
              <FhButton
                variant="ghost"
                size="sm"
                :disabled="declareSubmitting"
                @click="declareTarget = null"
              >
                Huỷ
              </FhButton>
            </div>
            <p class="text-[11px] text-ink-500">
              Quản lý dịch vụ sẽ nhận linh kiện và xác nhận số lượng thực tế. Khai trả chưa phải là đã trả xong.
            </p>
          </div>
          </div>
        </div>
      </div>
        </section>
      </div>
  </div>
</template>
