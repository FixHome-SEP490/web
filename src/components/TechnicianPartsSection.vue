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
  Info,
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
import { technicianUsageLimit } from '../utils/technician-workflow';
import { partCustodyQuantities } from '../utils/part-custody-quantities';

const props = defineProps<{
  orderId: string;
  orderStatus: string;
  disabled?: boolean;
  usageFrozen?: boolean;
  /** Approved SKU ceilings from the selected order, never from stock received. null = unknown. */
  approvedPartQuantities?: Record<string, number> | null;
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
  /** Custody per item: what the technician declared used and declared going back. */
  (e: 'custody', byItemId: Map<string, { usedQty: number; declaredQty: number }>): void;
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
const partialUsageDraft = ref<Record<string, number>>({});
const partialUsageEditing = ref<Record<string, boolean>>({});
const partialUsageSaving = ref<string | null>(null);
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
let custodyScope = 0;
const bulkReturnOpen = ref(false);
const bulkReturnSubmitting = ref(false);
const bulkReturnDraft = ref<Record<string, number>>({});
// A retry of the same command must carry exactly the same version, quantity and key.
const custodyCommandKeys = new Map<string, string>();
function custodyCommandKey(kind: string, itemId: string, version: number, quantity: number) {
  const signature = `${props.orderId}:${kind}:${itemId}:${version}:${quantity}`;
  let key = custodyCommandKeys.get(signature);
  if (!key) { key = createIdempotencyKey(kind); custodyCommandKeys.set(signature, key); }
  return key;
}
const allStockItems = computed(() => partRequests.value.filter(row => row.status === 'received' || row.status === 'completed').flatMap(row => row.items));
function usageLimit(item: PartRequest['items'][number]) {
  if (item.partSource !== 'fixhome') return item.quantity;
  if (props.approvedPartQuantities === undefined) {
    const record = returnFor(item.id);
    return record ? Math.max(0, record.issuedQty - Math.max(record.declaredQty, record.managerAcceptedQty)) : item.quantity;
  }
  return technicianUsageLimit(item, props.approvedPartQuantities, allStockItems.value, returnRecords.value);
}
function unapprovedItem(item: PartRequest['items'][number]) {
  return !!props.approvedPartQuantities && !!item.partCatalogId && (props.approvedPartQuantities[item.partCatalogId] ?? 0) === 0;
}
const bulkReturnItems = computed(() => partRequests.value.flatMap(request => request.items.flatMap(item => {
  const record = returnFor(item.id);
  if (item.partSource !== 'fixhome' || !record || canDeclareMoreQty(record) < 1 || !['received', 'completed'].includes(request.status)) return [];
  // Approved but undecided stock must first have its actual use explicitly recorded.
  if (!record.usageRecorded && item.usageStatus !== 'returned' && (props.usageFrozen || !unapprovedItem(item))) return [];
  return [{ request, item, record, quantity: canDeclareMoreQty(record) }];
})));
const bulkReturnValid = computed(() => bulkReturnItems.value.length > 0 && bulkReturnItems.value.every(row => {
  const qty = bulkReturnDraft.value[row.item.id];
  return Number.isInteger(qty) && qty! >= 1 && qty! <= row.quantity;
}));
function openBulkReturn() {
  if (props.disabled || returnsLoadError.value || actionLoading.value || bulkReturnSubmitting.value) return;
  bulkReturnDraft.value = Object.fromEntries(bulkReturnItems.value.map(row => [row.item.id, row.quantity]));
  bulkReturnOpen.value = true;
}
async function submitBulkReturn() {
  if (!bulkReturnValid.value || props.disabled || returnsLoadError.value || bulkReturnSubmitting.value || actionLoading.value) return;
  const orderId = props.orderId;
  const epoch = custodyScope;
  const stillCurrent = () => orderId === props.orderId && epoch === custodyScope;
  const targets = bulkReturnItems.value.map(row => ({ ...row, quantity: bulkReturnDraft.value[row.item.id]! }));
  bulkReturnSubmitting.value = true;
  actionLoading.value = true;
  actionError.value = null;
  actionSuccess.value = null;
  try {
    for (const target of targets) {
      if (!stillCurrent() || props.disabled) return;
      let record = returnFor(target.item.id);
      if (!record) throw new Error('Custody unavailable');
      if (!record.usageRecorded && target.item.usageStatus !== 'returned' && isUnderRepair.value) {
        if (props.usageFrozen || !unapprovedItem(target.item) || record.usedQty !== 0) throw new Error('Usage decision required');
        const saved = await partRequestsApi.updateItemUsage(target.request.id, target.item.id, {
          usageStatus: 'returned', usedQty: 0, expectedVersion: record.version,
          idempotencyKey: custodyCommandKey('parts-used', target.item.id, record.version, 0),
        });
        if (!stillCurrent()) return;
        partRequests.value = partRequests.value.map(row => row.id === target.request.id ? { ...row, items: row.items.map(item => item.id === target.item.id ? { ...item, ...saved, usageStatus: saved.usageStatus } : item) } : row);
        emit('requests', partRequests.value);
        if (!await loadReturns()) throw new Error('Custody refresh required');
        if (!stillCurrent() || props.disabled) return;
        record = returnFor(target.item.id);
        if (!record?.usageRecorded) throw new Error('Usage not confirmed');
      }
      if (!record || target.quantity > canDeclareMoreQty(record)) throw new Error('Return changed');
      const saved = await partRequestsApi.declareReturn(target.request.id, target.item.id, {
        quantity: target.quantity, expectedVersion: record.version,
        idempotencyKey: custodyCommandKey('declare', target.item.id, record.version, target.quantity),
      });
      if (!stillCurrent()) return;
      if (saved && saved.partRequestItemId === target.item.id && saved.partRequestId === target.request.id) {
        returnRecords.value = returnRecords.value.map(row => row.partRequestItemId === saved.partRequestItemId ? saved : row);
      }
      if (!await loadReturns()) throw new Error('Custody refresh required');
    }
    if (!stillCurrent()) return;
    bulkReturnOpen.value = false;
    actionSuccess.value = 'Đã gửi khai trả. Chờ quản lý dịch vụ nhận và xác nhận thực tế.';
  } catch (err) {
    if (!stillCurrent()) return;
    await loadReturns();
    if (!stillCurrent()) return;
    // Confirmed rows disappear; retries cover only the remaining rows and reuse command keys.
    bulkReturnDraft.value = Object.fromEntries(bulkReturnItems.value.map(row => [row.item.id, Math.min(bulkReturnDraft.value[row.item.id] ?? row.quantity, row.quantity)]));
    actionError.value = userFacingError(err, 'Chưa xác nhận đủ khai trả. Kiểm tra số lượng còn lại rồi thử lại.');
  } finally {
    if (stillCurrent()) { bulkReturnSubmitting.value = false; actionLoading.value = false; }
  }
}


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
  partCustodyQuantities(record).awaitingManager;

/** What the technician may declare now: the return-due quantity not declared yet. */
const canDeclareMoreQty = (record: PartCustodyReturnRecord) =>
  partCustodyQuantities(record).remainingToDeclare;

// Usage RETURNED is a decision during repair; warehouse acceptance is physical.
const canDeclareReturn = (_request: PartRequest, item: PartRequest['items'][number]) => {
  const record = returnFor(item.id);
  return item.partSource === 'fixhome' && (item.usageStatus === 'returned' ||
    (!!record && unapprovedItem(item) && record.usedQty === 0 && record.usageRecorded === true) ||
    (item.usageStatus === 'used' && !!record?.usageRecorded && record.usedQty < record.issuedQty) ||
    ['COMPLETED', 'CANCELLED'].includes(props.orderStatus.toUpperCase()));
};

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
watch(returnRecords, records => emit('custody', new Map(records.map(record => [record.partRequestItemId, { usedQty: record.usedQty, declaredQty: record.declaredQty }]))), { immediate: true });
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

// Catalog descriptions arrive as pipe-separated field snapshots, not prose.
// Render only provided fields, with labels, instead of showing raw delimiters.
const selectedPartDetails = computed(() => (selectedPart.value?.description ?? '')
  .split('|').map(part => part.trim()).filter(Boolean)
  .map(part => {
    const separator = part.indexOf(':');
    return separator > 0
      ? { label: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() }
      : { label: 'Mô tả', value: part };
  }).filter(field => field.value && !/^bảo hành$/i.test(field.label)));


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
    // The latest response, including a quiet realtime update, owns the spinner.
    // Otherwise an initial load superseded by realtime remains stuck until F5.
    if (version === requestsLoadVersion) loading.value = false;
  }
};

const loadReturns = async () => {
  const version = ++returnsLoadVersion;
  try {
    const records = await partRequestsApi.getReturnsByOrderId(props.orderId);
    if (version !== returnsLoadVersion) return false;
    returnRecords.value = records;
    returnsLoadError.value = false;
    for (const record of records) {
      if (partialUsageDraft.value[record.partRequestItemId] === undefined) {
        partialUsageDraft.value[record.partRequestItemId] = record.usedQty;
      }
    }
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
    return true;
  } catch (err: unknown) {
    if (version !== returnsLoadVersion) return false;
    declareTarget.value = null;
    // Feature flag off or no access to the route: hide the return UI and keep
    // the existing QR / usage / part-request flow untouched.
    returnsLoadError.value = !isPartReturnsUnavailableError(err);
    if (!returnsLoadError.value) returnRecords.value = [];
    return false;
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
  custodyScope += 1;
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
  custodyScope += 1;
  stopLiveParts();
  ++requestsLoadVersion;
  ++returnsLoadVersion;
    partRequests.value = [];
    partRequestsLoaded.value = false;
    loading.value = true;
    partialUsageDraft.value = {};
    partialUsageEditing.value = {};
    returnRecords.value = [];
    requestDetailOverrides.value = {};
  declareTarget.value = null;
  bulkReturnOpen.value = false;
  bulkReturnSubmitting.value = false;
  bulkReturnDraft.value = {};
  custodyCommandKeys.clear();
  actionLoading.value = false;
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
    await loadPartRequests(partRequestsLoaded.value);
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
    await Promise.all([loadPartRequests(partRequestsLoaded.value), loadReturns()]);
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
  const item = request?.items.find(row => row.id === itemId);
  if (!item || !isUnderRepair.value || props.usageFrozen || request?.status !== 'received' || props.disabled || actionLoading.value || (status === 'used' && usageLimit(item) < item.quantity)) return;
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

/** Record actual used quantity for an enrolled FIXHOME custody line only.
 * Server validates approval, version, assignment and invoice freeze. */
const handlePartialUsage = async (requestId: string, itemId: string) => {
  const row = partRequests.value.find(request => request.id === requestId);
  const item = row?.items.find(record => record.id === itemId);
  const custody = returnFor(itemId);
  if (props.disabled || props.usageFrozen || actionLoading.value || !isUnderRepair.value ||
      row?.status !== 'received' || item?.partSource !== 'fixhome' || !custody || returnsLoadError.value) return;
  const orderId = props.orderId;
  const usedQty = Number(partialUsageDraft.value[itemId]);
  if (!Number.isInteger(partialUsageDraft.value[itemId]) || usedQty < 0 ||
      usedQty > usageLimit(item)) {
    actionError.value = 'Số lượng đã dùng không hợp lệ.';
    return;
  }
  if (usedQty === custody.usedQty && custody.usageRecorded) return;
  try {
    actionLoading.value = true;
    partialUsageSaving.value = itemId;
    actionError.value = null;
    actionSuccess.value = null;
    const status = usedQty > 0 ? 'used' : 'returned';
    const saved = await partRequestsApi.updateItemUsage(requestId, itemId, {
      usageStatus: status,
      usedQty,
      expectedVersion: custody.version,
      idempotencyKey: custodyCommandKey('parts-used', itemId, custody.version, usedQty),
    });
    if (orderId !== props.orderId) return;
    partRequests.value = partRequests.value.map(request => request.id === requestId
      ? { ...request, items: request.items.map(line => line.id === itemId
        ? { ...line, ...saved, usageStatus: saved?.usageStatus ?? status } : line) }
      : request);
    emit('requests', partRequests.value);
    actionSuccess.value = `Đã ghi nhận dùng ${usedQty} linh kiện. Số cần trả kho được cập nhật bên dưới.`;
    partialUsageEditing.value[itemId] = false;
    delete partialUsageDraft.value[itemId];
    await loadReturns();
  } catch (err: unknown) {
    // On 409 or any uncertain write, refresh the authoritative version and
    // reset the input to the newly confirmed quantity.
    if (orderId !== props.orderId) return;
    delete partialUsageDraft.value[itemId];
    await loadReturns();
    actionError.value = userFacingError(err, 'Không thể lưu số lượng. Vui lòng kiểm tra và thử lại.');
  } finally {
    if (orderId === props.orderId) { partialUsageSaving.value = null; actionLoading.value = false; }
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
      idempotencyKey: custodyCommandKey('declare', target.itemId, target.version, quantity),
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

      <div v-if="bulkReturnItems.length" class="space-y-3" data-testid="bulk-return-section">
        <button type="button" class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-ink-300 px-3 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" data-testid="return-all-unused" :disabled="disabled || actionLoading || returnsLoadError" :aria-expanded="bulkReturnOpen" @click="openBulkReturn"><Undo2 :size="16" aria-hidden="true" /><span>Khai trả toàn bộ linh kiện chưa dùng</span></button>
        <div v-if="bulkReturnOpen" class="space-y-3 rounded-xl border border-ink-200 p-3 text-sm" data-testid="bulk-return-confirm" role="group" aria-label="Xác nhận số lượng khai trả từng linh kiện">
          <p class="text-ink-700">Kiểm tra số lượng từng linh kiện. Khai trả chưa phải quản lý đã nhận kho.</p>
          <label v-for="row in bulkReturnItems" :key="row.item.id" class="flex items-center justify-between gap-3 text-ink-900">
            <span class="min-w-0">{{ row.item.partNameSnapshot }}</span>
            <input v-model.number="bulkReturnDraft[row.item.id]" type="number" min="1" :max="row.quantity" step="1" :aria-label="`Số lượng khai trả ${row.item.partNameSnapshot}`" :disabled="bulkReturnSubmitting" class="h-11 w-20 shrink-0 rounded-lg border border-ink-300 px-2 font-num focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" />
          </label>
          <div class="flex flex-wrap gap-2">
            <FhButton data-testid="confirm-return-all" class="min-h-11" :disabled="!bulkReturnValid || bulkReturnSubmitting || disabled || returnsLoadError" :loading="bulkReturnSubmitting" @click="submitBulkReturn">Xác nhận khai trả</FhButton>
            <FhButton variant="secondary" class="min-h-11" :disabled="bulkReturnSubmitting" @click="bulkReturnOpen = false">Đóng</FhButton>
          </div>
        </div>
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
              <details class="rounded-lg bg-white border border-ink-200 text-xs text-ink-700">
                <summary class="min-h-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 px-3 py-2 font-semibold text-brand-700">
                  <Info :size="16" aria-hidden="true" /> Thông tin linh kiện
                </summary>
                <dl class="divide-y divide-ink-100 border-t border-ink-100 px-3">
                  <div v-for="(field, index) in selectedPartDetails" :key="index" class="py-2 grid grid-cols-[minmax(0,100px)_minmax(0,1fr)] gap-x-3 gap-y-1">
                    <dt class="font-medium text-ink-500 break-words">{{ field.label }}</dt>
                    <dd class="min-w-0 break-words text-ink-900">{{ field.value }}</dd>
                  </div>
                  <div class="py-2 grid grid-cols-[minmax(0,100px)_minmax(0,1fr)] gap-x-3 gap-y-1">
                    <dt class="font-medium text-ink-500">Bảo hành</dt>
                    <dd class="min-w-0 break-words text-ink-900">{{ formatWarrantyDays(selectedPart.warrantyDays, selectedPart.warrantyPolicy) }}</dd>
                  </div>
                </dl>
              </details>

              <!-- Add to Request Action Controls -->
              <div class="flex flex-col items-stretch gap-3 pt-1 min-w-0">
                <!-- Quantity & Total -->
                <div class="flex flex-wrap items-center gap-3 min-w-0">
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
                <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 w-full min-w-0">
                  <input
                    v-model="itemNote"
                    type="text"
                    placeholder="Ghi chú item (VD: mang sơ cua, thay buồng lạnh)..."
                    class="min-w-0 w-full h-10 text-xs rounded-lg border border-ink-300 px-3 bg-white text-ink-900 placeholder:text-ink-400"
                  />
                  <button
                    type="button"
                    class="w-full sm:w-auto min-w-0 min-h-11 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
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
            <h5 class="font-semibold text-ink-800 text-sm">Thực tế đã dùng/không dùng</h5>
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
                <template v-for="record in [returnFor(item.id)]" :key="record?.partRequestItemId ?? item.id">
                  <div v-if="record" class="space-y-2 text-xs text-ink-700">
                    <p class="flex flex-wrap gap-x-1 gap-y-1 text-sm font-medium">
                      <span class="whitespace-nowrap">Cấp <span class="font-num">{{ record.issuedQty }}</span></span> ·
                      <span class="whitespace-nowrap">Dùng <span class="font-num">{{ record.usedQty }}</span></span> ·
                      <span class="whitespace-nowrap">Cần trả kho <span class="font-num">{{ record.outstandingQty }}</span></span>
                    </p>
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-ink-50 p-3">
                      <div><dt>Còn phải khai</dt><dd class="font-num font-semibold text-ink-900">{{ canDeclareMoreQty(record) }}</dd></div>
                      <div><dt>Đã khai, chờ nhận</dt><dd class="font-num font-semibold" :class="pendingDeclaredQty(record) > 0 ? 'text-warning-800' : 'text-ink-900'">{{ pendingDeclaredQty(record) }}</dd></div>
                      <div><dt>Khách duyệt tối đa (cả máy)</dt><dd class="font-num font-semibold text-ink-900">{{ approvedPartQuantities && item.partCatalogId ? approvedPartQuantities[item.partCatalogId] ?? 0 : 'Chưa kiểm tra được' }}</dd></div>
                      <div><dt>Quản lý đã nhận</dt><dd class="font-num font-semibold text-ink-900">{{ record.managerAcceptedQty }}</dd></div>
                      <div><dt>Đơn giá</dt><dd><FhMoney :amount="item.unitPriceSnapshot" /></dd></div>
                    </dl>
                    <p v-if="record.usageRecorded !== false" class="flex flex-wrap items-baseline justify-between gap-2">
                      <span>Giá trị linh kiện đã dùng</span>
                      <FhMoney :amount="item.unitPriceSnapshot * record.usedQty" data-testid="part-used-value" class="font-semibold text-ink-900" />
                    </p>
                    <p v-else class="text-ink-600">Chưa chốt số lượng thực dùng.</p>
                    <p v-if="pendingDeclaredQty(record) > 0" class="flex items-start gap-1.5 font-medium text-warning-800"><Clock :size="16" class="shrink-0" aria-hidden="true" />Đang chờ quản lý xác nhận nhận thực tế, chưa hoàn tất trả kho.</p>
                    <p v-else-if="record.outstandingQty === 0 && record.managerAcceptedQty > 0" class="flex items-center gap-1.5 text-success-700"><CheckCircle2 :size="16" aria-hidden="true" />Đã nhận đủ số linh kiện hoàn trả.</p>
                  </div>
                  <div v-else class="space-y-2 text-xs text-ink-700">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                      <p>Số lượng yêu cầu/cấp <strong class="font-num">{{ item.quantity }}</strong></p>
                      <p>Đơn giá <FhMoney :amount="item.unitPriceSnapshot" /></p>
                    </div>
                    <p>Giá trị theo số lượng yêu cầu <FhMoney :amount="item.unitPriceSnapshot * item.quantity" /></p>
                    <p class="text-ink-600">Chưa có số lượng thực dùng chi tiết.</p>
                    <p class="font-medium">{{ item.usageStatus === 'used' ? 'Đã dùng · chưa có số lượng chi tiết' : item.usageStatus === 'returned' ? 'Đã ghi nhận không dùng · chưa xác nhận trả kho' : 'Chưa ghi nhận sử dụng' }}</p>
                  </div>

                  <p v-if="unapprovedItem(item)" class="text-sm text-warning-800">Chưa được khách duyệt linh kiện này. Thực dùng tối đa 0; báo giá bổ sung để xin duyệt hoặc khai trả toàn bộ.</p>
                  <div class="part-item-actions flex flex-wrap gap-2" :data-testid="`part-actions-${item.id}`" role="group" :aria-label="`Sử dụng và khai trả ${item.partNameSnapshot}`">
                    <template v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && !record">
                      <button type="button" class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                        :class="item.usageStatus === 'used' ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-300 text-ink-700 hover:bg-ink-50'"
                        :aria-pressed="item.usageStatus === 'used'" :aria-label="`Ghi nhận đã dùng ${item.partNameSnapshot}`"
                        :disabled="actionLoading || disabled || usageLimit(item) < item.quantity" @click="handleUpdateUsage(pr.id, item.id, 'used')"><Check :size="16" class="shrink-0" aria-hidden="true" />Đã dùng</button>
                      <button type="button" class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                        :class="item.usageStatus === 'returned' ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-300 text-ink-700 hover:bg-ink-50'"
                        :aria-pressed="item.usageStatus === 'returned'" :aria-label="`Ghi nhận không dùng ${item.partNameSnapshot}`"
                        :disabled="actionLoading || disabled" @click="handleUpdateUsage(pr.id, item.id, 'returned')"><RotateCcw :size="16" class="shrink-0" aria-hidden="true" />Hoàn trả</button>
                    </template>
                    <button v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && item.partSource === 'fixhome' && record && usageLimit(item) > 0" type="button"
                      data-testid="edit-part-usage"
                      class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-300 px-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      :disabled="actionLoading || disabled || returnsLoadError"
                      :aria-label="`Ghi số lượng thực dùng ${item.partNameSnapshot}`"
                      :aria-expanded="!!partialUsageEditing[item.id]" :aria-controls="`part-usage-editor-${item.id}`"
                      @click="partialUsageEditing[item.id] = !partialUsageEditing[item.id]">
                      <Check :size="16" class="shrink-0" aria-hidden="true" />{{ partialUsageEditing[item.id] ? 'Đóng nhập' : 'Ghi thực dùng' }}
                    </button>
                    <button v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && record && !record.usageRecorded && record.usedQty === 0 && usageLimit(item) === 0" type="button"
                      data-testid="confirm-zero-usage" class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] items-center justify-center gap-1.5 rounded-lg border border-ink-300 px-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      :disabled="actionLoading || disabled || returnsLoadError" @click="partialUsageDraft[item.id] = 0; handlePartialUsage(pr.id, item.id)"><RotateCcw :size="16" aria-hidden="true" />Xác nhận không dùng</button>
                    <button v-if="record && canDeclareMoreQty(record) > 0 && canDeclareReturn(pr, item)" type="button"
                      data-testid="open-declare-return"
                      class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-300 px-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                      :aria-label="`Khai trả kho ${item.partNameSnapshot}`"
                      :disabled="declareSubmitting || returnsLoadError || disabled" @click="openDeclareReturn(pr.id, item.id, item.partNameSnapshot, record)">
                      <Undo2 :size="16" class="shrink-0" aria-hidden="true" />Khai trả kho
                    </button>
                  </div>
                  <div v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && item.partSource === 'fixhome' && record && usageLimit(item) > 0 && partialUsageEditing[item.id]"
                    :id="`part-usage-editor-${item.id}`" class="space-y-3 rounded-lg bg-ink-50 p-3" data-testid="partial-usage-editor">
                    <p class="text-xs text-ink-700">Dự kiến cần trả: <strong>{{ record.issuedQty - (partialUsageDraft[item.id] ?? record.usedQty) - record.managerAcceptedQty }}</strong> · Đã nhận lại: {{ record.managerAcceptedQty }}</p>
                    <div class="flex flex-wrap items-end gap-2">
                      <label class="min-w-28 flex-1 text-xs font-medium text-ink-700">
                        Số lượng thực dùng
                        <input v-model.number="partialUsageDraft[item.id]" type="number" step="1" min="0"
                          :max="usageLimit(item)" inputmode="numeric" :aria-label="`Số lượng thực dùng ${item.partNameSnapshot}`"
                          class="mt-1 h-11 w-full rounded-lg border border-ink-300 bg-white px-3 font-num text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" />
                      </label>
                      <button type="button" class="min-h-11 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                        :disabled="actionLoading || disabled || partialUsageSaving === item.id || !Number.isInteger(partialUsageDraft[item.id]) || Number(partialUsageDraft[item.id]) < 0 || Number(partialUsageDraft[item.id]) > usageLimit(item) || (record.usageRecorded && Number(partialUsageDraft[item.id]) === record.usedQty)"
                        @click="handlePartialUsage(pr.id, item.id)">
                        {{ partialUsageSaving === item.id ? 'Đang lưu…' : 'Lưu số lượng' }}
                      </button>
                    </div>
                    <p class="text-xs text-ink-600">Số khách duyệt là giới hạn tối đa. Hóa đơn linh kiện FixHome tính theo số thực dùng đã được đối chiếu. Khai trả kho vẫn cần quản lý nhận thực tế.</p>
                  </div>
                </template>
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
