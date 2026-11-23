<script setup lang="ts">
import { displayPartRequestStatus, isW3Delivery } from '../utils/w3-delivery-stage';
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
import ShippingShareBreakdown from './ShippingShareBreakdown.vue';
import DeliveryPhysicalPreview from './DeliveryPhysicalPreview.vue';
import DeliveryOperationsPanel from './DeliveryOperationsPanel.vue';
import DeliveryTermsPanel from './DeliveryTermsPanel.vue';
import { isDeliveryPhysicalRequestId } from '../api/w3-delivery-physical.api';
import { toUserFacingMessage, userFacingError } from '../utils/user-facing-error';
import {
  partRequestsApi,
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  type PartRequest,
  type PartCustodyReturnRecord,
  type DeclareReturnPayload,
  type FulfillmentMethod,
  type WarehouseAllocation,
} from '../api/part-requests.api';
import { usePartsCatalogPicker } from '../composables/usePartsCatalogPicker';
import { onOrderChange, whileOffline } from '../services/live-updates';
import type { FixHomePart } from '../api/admin-parts.api';
import { vnDateTimeString } from '../utils/vn-time';
import { technicianUsageLimit } from '../utils/technician-workflow';
import { partCustodyQuantities } from '../utils/part-custody-quantities';
import { canTechnicianAcknowledgeWarehousePickup } from '../utils/warehouse-fulfillment';

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
  (e: 'returns-known', value: boolean): void;
}>();

const loading = ref(true);
const actionLoading = ref(false);
const actionError = ref<string | null>(null);
const backgroundSyncError = ref(false);
const actionSuccess = ref<string | null>(null);

const partRequests = ref<PartRequest[]>([]);
const warehouseAllocations = ref<Record<string, WarehouseAllocation | null>>({});
const warehouseAllocationErrors = ref<Record<string, boolean>>({});
const warehouseAllocationLoading = ref<Record<string, boolean>>({});
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
const selectedPart = ref<FixHomePart | null>(null);
const selectedQuantity = ref(1);
/** Backend accepts whole quantities from 1 to MAX_PART_REQUEST_QTY per line. */
const MAX_PART_REQUEST_QTY = 100;
const clampPartQty = (value: unknown) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_PART_REQUEST_QTY, Math.max(1, n)) : 1;
};
const itemNote = ref('');
const partialUsageDraft = ref<Record<string, number>>({});
const partialUsageEditing = ref<Record<string, boolean>>({});
const partialUsageSaving = ref<string | null>(null);

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
const returnsKnown = ref(false);
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
type BulkReturnRow = {
  request: PartRequest;
  item: PartRequest['items'][number];
  record: PartCustodyReturnRecord;
  quantity: number;
  completed?: boolean;
  command?: Readonly<DeclareReturnPayload>;
};
const bulkReturnAttempt = ref<BulkReturnRow[]>([]);
// Keep ambiguous commands across an explicit close too: reopening must reconcile
// the original command, never turn an unknown outcome into a fresh declaration.
const pendingBulkDeclarations = ref<Record<string, BulkReturnRow>>({});
const completedBulkReturns = computed(() => bulkReturnAttempt.value.filter(row => row.completed));
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
  if (item.partSource !== 'fixhome' || warrantyItemIds.value.has(item.id)) return item.quantity;
  if (props.approvedPartQuantities === undefined) {
    const record = returnFor(item.id);
    return record ? Math.max(0, record.issuedQty - Math.max(record.declaredQty, record.managerAcceptedQty)) : item.quantity;
  }
  return technicianUsageLimit(item, props.approvedPartQuantities, allStockItems.value, returnRecords.value);
}
function unapprovedItem(item: PartRequest['items'][number]) {
  if (warrantyItemIds.value.has(item.id)) return false;
  return !!props.approvedPartQuantities && !!item.partCatalogId && (props.approvedPartQuantities[item.partCatalogId] ?? 0) === 0;
}
const bulkReturnCandidates = computed(() => partRequests.value.flatMap(request => request.items.flatMap(item => {
  const record = returnFor(item.id);
  if (item.partSource !== 'fixhome' || !record || canDeclareMoreQty(record) < 1 || !['received', 'completed'].includes(request.status)) return [];
  // Approved but undecided stock must first have its actual use explicitly recorded.
  if (!record.usageRecorded && item.usageStatus !== 'returned' && (props.usageFrozen || !unapprovedItem(item))) return [];
  return [{ request, item, record, quantity: canDeclareMoreQty(record) }];
})));
const bulkReturnItems = computed<BulkReturnRow[]>(() => bulkReturnOpen.value
  ? bulkReturnAttempt.value.filter(row => !row.completed)
  : bulkReturnCandidates.value);
const bulkReturnValid = computed(() => bulkReturnItems.value.length > 0 && bulkReturnItems.value.every(row => {
  const record = returnFor(row.item.id);
  if (!record || record.partRequestId !== row.request.id) return false;
  const qty = bulkReturnDraft.value[row.item.id];
  // A retry is a replay of its immutable command, even if the ledger version or
  // remaining quantity changed. Only a server reply can confirm that command.
  return row.command ? qty === row.command.quantity
    : Number.isInteger(qty) && qty! >= 1 && qty! <= Math.min(row.quantity, canDeclareMoreQty(record));
}));
function closeBulkReturn() {
  if (bulkReturnSubmitting.value) return;
  bulkReturnOpen.value = false;
  bulkReturnAttempt.value = [];
  bulkReturnDraft.value = {};
}
function openBulkReturn() {
  if (bulkReturnOpen.value || props.disabled || returnsLoadError.value || actionLoading.value || declareSubmitting.value || bulkReturnSubmitting.value) return;
  const candidates = bulkReturnCandidates.value.map(row => pendingBulkDeclarations.value[row.item.id] ?? { ...row });
  const ids = new Set(candidates.map(row => row.item.id));
  bulkReturnAttempt.value = [...candidates, ...Object.values(pendingBulkDeclarations.value).filter(row => !ids.has(row.item.id))];
  bulkReturnDraft.value = Object.fromEntries(bulkReturnAttempt.value.map(row => [row.item.id, row.command?.quantity ?? row.quantity]));
  declareTarget.value = null;
  bulkReturnOpen.value = true;
}
async function submitBulkReturn() {
  if (!bulkReturnValid.value || props.disabled || returnsLoadError.value || bulkReturnSubmitting.value || actionLoading.value) return;
  const orderId = props.orderId;
  const epoch = custodyScope;
  const stillCurrent = () => orderId === props.orderId && epoch === custodyScope;
  const targets = [...bulkReturnItems.value];
  bulkReturnSubmitting.value = true;
  actionLoading.value = true;
  actionError.value = null;
  actionSuccess.value = null;
  try {
    for (const target of targets) {
      if (!stillCurrent() || props.disabled) return;
      let record = returnFor(target.item.id);
      if (!record || record.partRequestId !== target.request.id) throw new Error('Custody unavailable');
      if (!target.command && !record.usageRecorded && target.item.usageStatus !== 'returned' && isUnderRepair.value) {
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
      if (!target.command) {
        const quantity = bulkReturnDraft.value[target.item.id]!;
        if (!record || quantity > canDeclareMoreQty(record)) throw new Error('Return changed');
        target.command = Object.freeze({
          quantity, expectedVersion: record.version,
          idempotencyKey: custodyCommandKey('declare', target.item.id, record.version, quantity),
        });
      }
      pendingBulkDeclarations.value[target.item.id] = target;
      const saved = await partRequestsApi.declareReturn(target.request.id, target.item.id, target.command);
      if (!stillCurrent()) return;
      if (saved && (saved.partRequestItemId !== target.item.id || saved.partRequestId !== target.request.id)) throw new Error('Return response mismatch');
      // A successful declaration completes this selected quantity, not the
      // item's entire return obligation. Record it before any GET can fail.
      target.completed = true;
      delete pendingBulkDeclarations.value[target.item.id];
      if (saved) {
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
    // Preserve the attempt's completed rows, selected quantities and uncertain
    // commands. Ledger refresh/reordering must never create another declaration.
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
/** Items of a warranty request: their usage is recorded once, after the order completed. */
const warrantyItemIds = computed(() => new Set(partRequests.value
  .filter(request => request.requestType === 'warranty')
  .flatMap(request => request.items.map(item => item.id))));
/** Whether the technician may record Used / Returned for this line now. */
function canRecordUsage(request: PartRequest | undefined, item: PartRequest['items'][number] | undefined) {
  if (!request || !item || request.status !== 'received') return false;
  if (request.requestType === 'warranty') return item.usageStatus === 'pending';
  return isUnderRepair.value && !props.usageFrozen;
}
/** The reason a person wrote; system notes in English stay hidden. */
const requestReasonText = (reason?: string | null) => toUserFacingMessage(reason ?? '', '');
const activePreRepair = computed(() =>
  partRequests.value.find(
    (pr) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled',
  ) ?? null,
);
const hasActivePreRepair = computed(() => !!activePreRepair.value);
const confirmModifyPreRepairId = ref<string | null>(null);
const isW3ParcelMoved = (request: PartRequest) =>
  ['ISSUED_TO_COURIER', 'DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED'].includes(
    String(request.w3DeliveryStage ?? '').toUpperCase(),
  );
const canModifyPreRepair = (request: PartRequest | null): boolean => {
  if (!request || !isAccepted.value || props.disabled) return false;
  if (request.requestType !== 'pre_repair' || request.status !== 'requested') return false;
  if (isW3ParcelMoved(request)) return false;
  if (request.fulfillmentMethod === 'pickup') {
    if (warehouseAllocationLoading.value[request.id]) return false;
    const allocStatus = warehouseAllocationFor(request)?.status;
    if (allocStatus === 'stock_unavailable') return false;
    if (['handed_over', 'received'].includes(String(allocStatus ?? ''))) return false;
  }
  return true;
};

function openPreRepairFormWhenReady() {
  if (!preRepairFormRequested.value || loading.value) return;
  showCreateForm.value = partRequestsLoaded.value && isAccepted.value && !hasActivePreRepair.value;
  if (partRequestsLoaded.value && isAccepted.value && activePreRepair.value && canModifyPreRepair(activePreRepair.value)) {
    confirmModifyPreRepairId.value = activePreRepair.value.id;
  }
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
    const handoverReady = canReceivePickup(request) ||
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
    const outOfWarehouseStock = request.fulfillmentMethod === 'pickup' && warehouseAllocationFor(request)?.status === 'stock_unavailable';
    const group = outOfWarehouseStock ? groups[0] : returnNeedsDeclaration ? groups[0] : waitingForManager ? groups[1]
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
  if (!returnsKnown.value) return;
  emit('pending-returns', totals.needDeclare + totals.awaitingManager);
  emit('return-summary', totals);
}, { immediate: true });
watch(returnsKnown, known => emit('returns-known', known), { immediate: true });
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
  return selectedPart.value.sellingPrice * clampPartQty(selectedQuantity.value);
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
    await loadWarehouseAllocations(records, version);
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

async function loadWarehouseAllocations(records: PartRequest[], version: number) {
  const pickups = records.filter((request) => request.fulfillmentMethod === 'pickup');
  warehouseAllocations.value = {};
  warehouseAllocationErrors.value = {};
  await Promise.all(pickups.map(async (request) => {
    warehouseAllocationLoading.value[request.id] = true;
    try {
      const allocation = await partRequestsApi.getWarehouseAllocation(request.id);
      if (version === requestsLoadVersion) warehouseAllocations.value[request.id] = allocation;
    } catch {
      if (version === requestsLoadVersion) warehouseAllocationErrors.value[request.id] = true;
    } finally {
      if (version === requestsLoadVersion) warehouseAllocationLoading.value[request.id] = false;
    }
  }));
}
const warehouseAllocationFor = (request: PartRequest) => warehouseAllocations.value[request.id] ?? null;
const needsWarehouseReceipt = (request: PartRequest) => request.fulfillmentMethod === 'pickup' && warehouseAllocationFor(request)?.mode === 'warehouse';
const canReceivePickup = (request: PartRequest) => needsWarehouseReceipt(request)
  ? canTechnicianAcknowledgeWarehousePickup(warehouseAllocationFor(request))
  : request.fulfillmentMethod === 'pickup' && warehouseAllocationFor(request)?.mode === 'legacy' && request.status === 'ready';

const loadReturns = async () => {
  const version = ++returnsLoadVersion;
  try {
    const records = await partRequestsApi.getReturnsByOrderId(props.orderId);
    if (version !== returnsLoadVersion) return false;
    returnRecords.value = records;
    returnsLoadError.value = false;
    returnsKnown.value = true;
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
    returnsKnown.value = false;
    declareTarget.value = null;
    // Feature flag off or no access to the route: hide the return UI and keep
    // the existing QR / usage / part-request flow untouched.
    returnsLoadError.value = !isPartReturnsUnavailableError(err);
    if (!returnsLoadError.value) returnRecords.value = [];
    return false;
  }
};

const onSearchInput = () => { picker.searchSoon(); };
const selectCategory = (value: string) => { picker.selectCategory(value); };
const clearSearch = () => { picker.clear(); };

const selectPartForForm = (part: FixHomePart) => {
  selectedPart.value = selectedPart.value?.id === part.id ? null : part;
  selectedQuantity.value = 1;
  itemNote.value = '';
};

const clearSelectedPart = () => {
  selectedPart.value = null;
  selectedQuantity.value = 1;
  itemNote.value = '';
};

const selectedCatalogQuantities = computed(
  () => new Map(selectedItems.value.map((item) => [item.partCatalogId, item.quantity])),
);

const upsertSelectedPart = (part: FixHomePart, quantity: number, note = '') => {
  const clamped = clampPartQty(quantity);
  const existing = selectedItems.value.find((i) => i.partCatalogId === part.id);
  if (existing) {
    existing.quantity = clampPartQty(existing.quantity + clamped);
    if (note.trim() && !existing.note) {
      existing.note = note.trim();
    }
  } else {
    selectedItems.value.push({
      partCatalogId: part.id,
      partName: part.name,
      sku: part.sku,
      price: part.sellingPrice,
      warrantyDays: part.warrantyDays,
      warrantyPolicy: part.warrantyPolicy,
      quantity: clamped,
      note: note.trim(),
    });
  }
};

const addItemToForm = () => {
  if (!selectedPart.value) return;
  upsertSelectedPart(selectedPart.value, selectedQuantity.value, itemNote.value);
  clearSelectedPart();
};

const quickAddPart = (part: FixHomePart) => {
  upsertSelectedPart(part, 1);
};

const decrementCatalogPart = (partId: string) => {
  const index = selectedItems.value.findIndex((i) => i.partCatalogId === partId);
  if (index >= 0) decreaseQuantity(index);
};

/** Closing the form drops the unsent draft so reopening starts clean. */
const cancelCreateForm = () => {
  showCreateForm.value = false;
  selectedItems.value = [];
  requestReason.value = '';
  actionError.value = null;
  clearSelectedPart();
};

const removeItemFromForm = (index: number) => {
  selectedItems.value.splice(index, 1);
};

const increaseQuantity = (index: number) => {
  if (selectedItems.value[index]) {
    selectedItems.value[index].quantity = clampPartQty(selectedItems.value[index].quantity + 1);
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

onMounted(() => {
  void loadPartRequests();
  void loadReturns();
  void picker.load();
});

onUnmounted(() => {
  custodyScope += 1;
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
  bulkReturnAttempt.value = [];
  pendingBulkDeclarations.value = {};
  custodyCommandKeys.clear();
  actionLoading.value = false;
  confirmModifyPreRepairId.value = null;
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

    const createdRequest = await partRequestsApi.createPreRepair(props.orderId, {
      items: selectedItems.value.map((i) => ({
        partCatalogId: i.partCatalogId,
        quantity: i.quantity,
        note: i.note,
      })),
      fulfillmentMethod: fulfillmentMethod.value,
      reason: requestReason.value || 'Linh kiện dự kiến trước khi đi kiểm tra',
    });

    actionSuccess.value = 'Đã tạo yêu cầu linh kiện. Đang kiểm tra kho FixHome phù hợp.';
    showCreateForm.value = false;
    selectedItems.value = [];
    requestReason.value = '';
    clearSelectedPart();
    await loadPartRequests(partRequestsLoaded.value);
    if (warehouseAllocationFor(createdRequest)?.status === 'stock_unavailable') {
      actionSuccess.value = 'Không có kho FixHome nào đủ linh kiện. Bạn cần tự chuẩn bị. Hệ thống không tự động tính phí linh kiện tự mua.';
    } else if (fulfillmentMethod.value === 'pickup') {
      actionSuccess.value = 'Đã yêu cầu kho FixHome; theo dõi kho được phân bổ trước khi đến nhận.';
    }
    emit('parts-updated');
  } catch (err: unknown) {
    actionError.value =
      userFacingError(err, 'Không thể tạo yêu cầu linh kiện.');
  } finally {
    actionLoading.value = false;
  }
};

const cancelUnavailablePreRepair = async (requestId: string) => {
  const request = partRequests.value.find((row) => row.id === requestId);
  if (!request || request.requestType !== 'pre_repair' || request.status !== 'requested'
      || warehouseAllocationFor(request)?.status !== 'stock_unavailable' || actionLoading.value) return;
  actionLoading.value = true;
  actionError.value = null;
  try {
    await partRequestsApi.cancel(requestId, 'Kho FixHome không đủ linh kiện; kỹ thuật viên tự chuẩn bị.');
    await loadPartRequests(partRequestsLoaded.value);
    actionSuccess.value = 'Đã dừng yêu cầu lấy từ kho. Hãy tự chuẩn bị; hệ thống không tự động tính phí linh kiện tự mua.';
    emit('parts-updated');
  } catch (error) {
    actionError.value = userFacingError(error, 'Chưa hủy được yêu cầu kho; vui lòng thử lại.');
  } finally {
    actionLoading.value = false;
  }
};

const promptModifyPreRepair = (requestId: string) => {
  confirmModifyPreRepairId.value = requestId;
  document.querySelector('[data-testid="pre-repair-active-notice"]')?.scrollIntoView?.({
    block: 'nearest',
    behavior: 'smooth',
  });
};

const reorderPreRepair = async (request: PartRequest) => {
  if (!canModifyPreRepair(request) || actionLoading.value) return;
  const prefillItems: SelectedPartItem[] = request.items
    .filter((item): item is PartRequest['items'][number] & { partCatalogId: string } => !!item.partCatalogId)
    .map((item) => {
      const catalog = partsMap.value.get(item.partCatalogId);
      return {
        partCatalogId: item.partCatalogId,
        partName: catalog?.name || item.partNameSnapshot,
        sku: catalog?.sku ?? null,
        price: catalog?.sellingPrice ?? item.unitPriceSnapshot,
        warrantyDays: catalog?.warrantyDays ?? null,
        warrantyPolicy: catalog?.warrantyPolicy ?? null,
        quantity: clampPartQty(item.quantity),
        note: item.note ?? '',
      };
    });
  const savedFulfillment = request.fulfillmentMethod;
  const savedReason = requestReasonText(request.reason);

  try {
    actionLoading.value = true;
    actionError.value = null;
    actionSuccess.value = null;
    await partRequestsApi.cancel(
      request.id,
      'Kỹ thuật viên hủy phiếu để bổ sung linh kiện trước khi xuất phát.',
    );
    confirmModifyPreRepairId.value = null;
    await loadPartRequests(partRequestsLoaded.value);
    fulfillmentMethod.value = savedFulfillment;
    requestReason.value = savedReason;
    selectedItems.value = prefillItems;
    showCreateForm.value = true;
    clearSelectedPart();
    actionSuccess.value = prefillItems.length > 0
      ? 'Đã hủy phiếu cũ và giữ lại các linh kiện đã chọn. Hãy chọn thêm món còn thiếu rồi gửi lại.'
      : 'Đã hủy phiếu cũ. Hãy chọn lại danh sách linh kiện rồi gửi yêu cầu mới.';
    emit('parts-updated');
  } catch (err: unknown) {
    confirmModifyPreRepairId.value = null;
    actionError.value = userFacingError(
      err,
      'Không thể hủy phiếu linh kiện hiện tại. Có thể kho vừa xác nhận bàn giao.',
    );
    void refreshParts();
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
  if (!item || !canRecordUsage(request, item) || props.disabled || actionLoading.value || (status === 'used' && usageLimit(item) < item.quantity)) return;
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
  if (!request || !item || !canDeclareReturn(request, item) || props.disabled || bulkReturnOpen.value || pendingBulkDeclarations.value[itemId]) return;
  const maxQty = canDeclareMoreQty(record);
  if (maxQty < 1 || declareSubmitting.value) return;
  declareTarget.value = { requestId, itemId, itemName, maxQty, version: record.version };
  declareQty.value = 1;
  actionError.value = null;
  actionSuccess.value = null;
};

const submitDeclareReturn = async () => {
  const target = declareTarget.value;
  if (!target || declareSubmitting.value || props.disabled || returnsLoadError.value || bulkReturnOpen.value || pendingBulkDeclarations.value[target.itemId]) return;
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
  <div class="space-y-4 text-sm">
      <!-- Alerts -->
      <div
        v-if="actionSuccess"
        role="status"
        class="p-3 rounded-lg bg-success-50 text-success-800 border border-success-200 flex items-center gap-2"
      >
        <CheckCircle2 :size="15" class="text-success-600 shrink-0" />
        <span>{{ actionSuccess }}</span>
      </div>

      <div
        v-if="actionError"
        role="alert"
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

      <div v-if="bulkReturnItems.length || bulkReturnOpen || Object.keys(pendingBulkDeclarations).length" class="space-y-3" data-testid="bulk-return-section">
        <button type="button" class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-ink-300 px-3 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" data-testid="return-all-unused" :disabled="disabled || actionLoading || returnsLoadError" :aria-expanded="bulkReturnOpen" @click="openBulkReturn"><Undo2 :size="16" aria-hidden="true" /><span>Khai trả toàn bộ linh kiện chưa dùng</span></button>
        <div v-if="bulkReturnOpen" class="space-y-3 rounded-xl border border-ink-200 p-3 text-sm" data-testid="bulk-return-confirm" role="group" aria-label="Xác nhận số lượng khai trả từng linh kiện">
          <p class="text-ink-700">Kiểm tra số lượng từng linh kiện. Khai trả chưa phải quản lý đã nhận kho.</p>
          <ul v-if="completedBulkReturns.length" class="space-y-1 text-success-800" data-testid="bulk-return-processed" aria-live="polite">
            <li v-for="row in completedBulkReturns" :key="row.item.id">Đã khai trả {{ row.item.partNameSnapshot }}: {{ row.command?.quantity }} · Chờ quản lý nhận thực tế</li>
          </ul>
          <p v-if="completedBulkReturns.length && bulkReturnItems.length" class="text-ink-700">Còn {{ bulkReturnItems.length }} dòng trong lượt này cần xác nhận. Các dòng đã khai thành công sẽ không gửi lại.</p>
          <p v-if="bulkReturnItems.some(row => row.command)" class="text-warning-800" role="status">Có khai trả chưa xác định kết quả. Thử lại giữ nguyên số lượng để đối chiếu; không tạo khai trả mới.</p>
          <label v-for="row in bulkReturnItems" :key="row.item.id" class="flex items-center justify-between gap-3 text-ink-900">
            <span class="min-w-0 break-words">{{ row.item.partNameSnapshot }}<span class="mt-1 block text-xs text-ink-600">Số lượng khai trả · tối đa {{ row.command?.quantity ?? Math.min(row.quantity, returnFor(row.item.id) ? canDeclareMoreQty(returnFor(row.item.id)!) : 0) }}</span></span>
            <input v-model.number="bulkReturnDraft[row.item.id]" type="number" min="1" :max="row.command?.quantity ?? Math.min(row.quantity, returnFor(row.item.id) ? canDeclareMoreQty(returnFor(row.item.id)!) : 0)" step="1" :aria-label="`Số lượng khai trả ${row.item.partNameSnapshot}`" :disabled="bulkReturnSubmitting || !!row.command" class="h-11 w-20 shrink-0 rounded-lg border border-ink-300 px-2 font-num focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" />
          </label>
          <div class="flex flex-wrap gap-2">
            <FhButton data-testid="confirm-return-all" class="min-h-11" :disabled="!bulkReturnValid || bulkReturnSubmitting || disabled || returnsLoadError" :loading="bulkReturnSubmitting" @click="submitBulkReturn">Xác nhận khai trả</FhButton>
            <FhButton variant="secondary" class="min-h-11" :disabled="bulkReturnSubmitting" @click="closeBulkReturn">Đóng</FhButton>
          </div>
        </div>
      </div>

      <!-- Action: Create Pre-Repair Request (Only in ACCEPTED state) -->
      <div
        v-if="isAccepted"
        class="space-y-4"
      >
        <div v-if="!hasActivePreRepair" class="flex flex-wrap items-center justify-between gap-3">
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

        <div
          v-else-if="activePreRepair && !showCreateForm"
          data-testid="pre-repair-active-notice"
          class="rounded-xl border border-ink-200/80 bg-ink-50/70 p-3.5 text-xs space-y-2.5"
        >
          <template v-if="canModifyPreRepair(activePreRepair)">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-ink-700 min-w-0 flex-1 text-pretty">
                Mỗi đơn trước khi xuất phát chỉ giữ tối đa <strong class="text-ink-900">1 phiếu linh kiện</strong>. Nếu thấy thiếu, hãy hủy phiếu đang chờ để chọn lại và thêm linh kiện mới.
              </p>
              <FhButton
                v-if="confirmModifyPreRepairId !== activePreRepair.id"
                data-testid="modify-pre-repair-parts"
                variant="secondary"
                size="sm"
                :disabled="actionLoading"
                @click="confirmModifyPreRepairId = activePreRepair.id"
              >
                <RotateCcw :size="14" class="mr-1" /> Đặt lại &amp; thêm linh kiện
              </FhButton>
            </div>
            <div
              v-if="confirmModifyPreRepairId === activePreRepair.id"
              data-testid="confirm-modify-pre-repair-box"
              class="rounded-lg border border-warning-200 bg-warning-50/80 p-3 space-y-2.5"
            >
              <p class="text-warning-900 font-medium">
                Xác nhận hủy phiếu đang chờ để chọn bổ sung linh kiện? Các món bạn đã chọn sẽ được giữ lại trong form mới.
              </p>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <FhButton
                  variant="ghost"
                  size="sm"
                  :disabled="actionLoading"
                  @click="confirmModifyPreRepairId = null"
                >
                  Giữ phiếu cũ
                </FhButton>
                <FhButton
                  data-testid="confirm-modify-pre-repair"
                  variant="primary"
                  size="sm"
                  :loading="actionLoading"
                  :disabled="actionLoading"
                  @click="reorderPreRepair(activePreRepair)"
                >
                  Xác nhận hủy &amp; chọn lại
                </FhButton>
              </div>
            </div>
          </template>
          <p
            v-else-if="activePreRepair.fulfillmentMethod === 'pickup' && warehouseAllocationFor(activePreRepair)?.status === 'stock_unavailable'"
            class="text-ink-700 text-pretty"
          >
            Phiếu hiện tại chưa có kho FixHome nào đủ hàng. Bạn có thể bấm <strong class="text-ink-900">“Dừng yêu cầu kho, tự chuẩn bị”</strong> ở phiếu bên dưới để hủy và chọn linh kiện khác.
          </p>
          <p v-else class="text-ink-700 text-pretty">
            Đơn đã có yêu cầu linh kiện trước sửa đang bàn giao hoặc đã nhận, nên không thể tạo thêm phiếu mới trước khi xuất phát. Khi tới sửa, bạn có thể bổ sung linh kiện trong <strong class="text-ink-900">Báo giá</strong> hoặc <strong class="text-ink-900">Chi phí phát sinh</strong>.
          </p>
        </div>

        <!-- Pre-Repair Form -->
        <div v-if="showCreateForm && !hasActivePreRepair" class="space-y-4 pt-4 border-t border-ink-100">
          <!-- Catalog Browser (Inline always-visible list with 1-tap quick add & spec inspection) -->
          <div class="rounded-[var(--radius-md)] border border-ink-200 bg-ink-25/80 p-3.5 sm:p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h5 class="font-semibold text-ink-900 text-sm flex items-center gap-1.5">
                <Search :size="15" class="text-brand-600 shrink-0" aria-hidden="true" />
                Chọn linh kiện FixHome
              </h5>
              <span class="font-num text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200/80 px-2.5 py-0.5 rounded-full">
                {{ isSearchingCatalog ? 'Đang tải…' : `${catalogTotal} linh kiện` }}
              </span>
            </div>

            <!-- Category filter pills -->
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Lọc theo thiết bị">
              <button
                v-for="cat in CATEGORY_TABS"
                :key="cat.value"
                type="button"
                class="h-9 px-3 rounded-full text-xs font-medium shrink-0 whitespace-nowrap border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                :class="
                  activeCategory === cat.value
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
                "
                @click="selectCategory(cat.value)"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Search input -->
            <div class="relative flex items-center">
              <Search :size="16" class="absolute left-3 text-ink-400 pointer-events-none" aria-hidden="true" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Tên linh kiện, mã hoặc hãng"
                aria-label="Tìm linh kiện FixHome"
                class="w-full h-11 rounded-[var(--radius-sm)] border border-ink-200 pl-9 pr-14 bg-white text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden transition-[border-color,box-shadow] duration-150"
                @input="onSearchInput"
              />
              <div class="absolute right-2 flex items-center gap-1">
                <Loader2 v-if="isSearchingCatalog" :size="15" class="animate-spin text-brand-600" aria-hidden="true" />
                <button
                  v-if="searchQuery || activeCategory !== 'ALL'"
                  type="button"
                  class="w-9 h-9 rounded-[var(--radius-sm)] text-ink-400 hover:text-ink-700 hover:bg-ink-50 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Xóa tìm kiếm"
                  @click="clearSearch"
                >
                  <X :size="15" />
                </button>
              </div>
            </div>

            <!-- Always-visible inline catalog list -->
            <div
              data-testid="catalog-results-list"
              class="bg-white rounded-[var(--radius-sm)] border border-ink-200 overflow-hidden"
            >
              <div class="max-h-72 overflow-y-auto overscroll-contain divide-y divide-ink-100">
                <div v-if="isSearchingCatalog" class="p-3 space-y-2.5" aria-busy="true" aria-label="Đang tải danh mục linh kiện">
                  <FhSkeleton height="54px" rounded="sm" :count="3" />
                </div>

                <div v-else-if="catalogError" class="p-4 text-xs sm:text-sm text-danger-700 flex flex-wrap items-center justify-between gap-2" role="alert">
                  <span>Chưa tải được danh mục linh kiện.</span>
                  <button type="button" data-testid="catalog-retry" class="font-semibold underline cursor-pointer" @click="picker.retry">Thử lại</button>
                </div>

                <div
                  v-else-if="searchResults.length === 0"
                  class="p-6 text-center text-ink-500 text-xs sm:text-sm space-y-2"
                >
                  <Package :size="22" class="mx-auto text-ink-300" aria-hidden="true" />
                  <p class="font-medium text-ink-700">Không tìm thấy linh kiện phù hợp</p>
                  <button
                    v-if="searchQuery || activeCategory !== 'ALL'"
                    type="button"
                    class="text-xs font-semibold text-brand-700 hover:underline cursor-pointer"
                    @click="clearSearch"
                  >
                    Xem tất cả linh kiện
                  </button>
                </div>

                <div
                  v-for="part in (catalogError || isSearchingCatalog ? [] : searchResults)"
                  :key="part.id"
                  class="px-3 sm:px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors duration-150"
                  :class="
                    selectedPart?.id === part.id
                      ? 'bg-brand-50/70'
                      : selectedCatalogQuantities.get(part.id)
                        ? 'bg-brand-50/35'
                        : 'hover:bg-ink-25'
                  "
                >
                  <button
                    type="button"
                    data-testid="catalog-result"
                    class="min-w-0 flex-1 text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-[var(--radius-sm)]"
                    @click="selectPartForForm(part)"
                  >
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="font-semibold text-sm text-ink-900 group-hover:text-brand-700 transition-colors truncate">
                        {{ part.name }}
                      </span>
                      <span
                        v-if="part.sku"
                        class="px-1.5 py-0.5 rounded text-[11px] font-mono bg-ink-100 text-ink-600 shrink-0"
                      >
                        {{ part.sku }}
                      </span>
                      <span
                        v-if="selectedCatalogQuantities.get(part.id)"
                        class="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold font-num text-brand-700 border border-brand-200"
                      >
                        Đã chọn · SL {{ selectedCatalogQuantities.get(part.id) }}
                      </span>
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-500">
                      <span class="font-num font-semibold text-brand-700">
                        <FhMoney :amount="part.sellingPrice" />
                      </span>
                      <span class="inline-flex items-center gap-1 text-success-700 whitespace-nowrap">
                        <ShieldCheck :size="12" aria-hidden="true" />
                        {{ getWarrantyBadge(part.warrantyDays) }}
                      </span>
                      <span v-if="part.description" class="truncate max-w-full sm:max-w-xs text-ink-400">
                        · {{ part.description }}
                      </span>
                    </div>
                  </button>

                  <!-- 1-tap add or inline quantity adjustment -->
                  <div class="shrink-0 flex items-center gap-1.5">
                    <div
                      v-if="selectedCatalogQuantities.get(part.id)"
                      class="inline-flex items-center rounded-[var(--radius-sm)] border border-brand-200 bg-white"
                    >
                      <button
                        type="button"
                        class="w-9 h-9 flex items-center justify-center text-ink-700 hover:bg-ink-50 rounded-l-[var(--radius-sm)] transition-colors cursor-pointer"
                        :aria-label="`Giảm số lượng ${part.name}`"
                        @click="decrementCatalogPart(part.id)"
                      >
                        <Minus :size="14" />
                      </button>
                      <span class="w-7 text-center font-num text-xs font-bold text-ink-900">
                        {{ selectedCatalogQuantities.get(part.id) }}
                      </span>
                      <button
                        type="button"
                        class="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-50 rounded-r-[var(--radius-sm)] transition-colors cursor-pointer disabled:opacity-50"
                        :disabled="(selectedCatalogQuantities.get(part.id) ?? 0) >= MAX_PART_REQUEST_QTY"
                        :aria-label="`Tăng số lượng ${part.name}`"
                        @click="quickAddPart(part)"
                      >
                        <Plus :size="14" />
                      </button>
                    </div>
                    <button
                      v-else
                      type="button"
                      data-testid="catalog-quick-add"
                      class="h-9 px-3 rounded-[var(--radius-sm)] border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-600 hover:text-white hover:border-brand-600 text-xs font-semibold inline-flex items-center gap-1 transition-colors duration-150 cursor-pointer whitespace-nowrap"
                      :aria-label="`Thêm nhanh ${part.name}`"
                      @click="quickAddPart(part)"
                    >
                      <Plus :size="14" /> Thêm
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-if="!isSearchingCatalog && !catalogError && searchResults.length > 0"
                class="border-t border-ink-100 bg-ink-25 px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-ink-600"
              >
                <span class="font-num">{{ searchResults.length }} / {{ catalogTotal }} linh kiện</span>
                <button
                  v-if="catalogHasMore"
                  type="button"
                  data-testid="catalog-load-more"
                  class="font-semibold text-brand-700 hover:underline cursor-pointer"
                  @click="picker.loadMore"
                >
                  Tải thêm
                </button>
              </div>
            </div>

            <!-- Compact inline detail & custom quantity bar when inspecting an item -->
            <div
              v-if="selectedPart"
              data-testid="selected-part-inspector"
              class="rounded-[var(--radius-sm)] border border-brand-300 bg-white p-3.5 space-y-3"
            >
              <div class="flex items-start justify-between gap-2 border-b border-ink-100 pb-2.5">
                <div class="flex items-start gap-2.5 min-w-0">
                  <div class="w-9 h-9 rounded-[var(--radius-sm)] bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center shrink-0">
                    <Wrench :size="16" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <h4 class="font-semibold text-ink-900 text-sm">{{ selectedPart.name }}</h4>
                      <span
                        v-if="selectedPart.sku"
                        class="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold bg-ink-100 text-ink-700"
                      >
                        {{ selectedPart.sku }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-xs text-ink-600">
                      Đơn giá: <strong class="font-num text-brand-700"><FhMoney :amount="selectedPart.sellingPrice" /></strong>
                      · Bảo hành: <span class="text-ink-800">{{ formatWarrantyDays(selectedPart.warrantyDays, selectedPart.warrantyPolicy) }}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  class="shrink-0 h-8 w-8 rounded-[var(--radius-sm)] text-ink-400 hover:text-ink-700 hover:bg-ink-50 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Đóng chi tiết linh kiện"
                  @click="clearSelectedPart"
                >
                  <X :size="16" />
                </button>
              </div>

              <details v-if="selectedPartDetails.length > 0" class="rounded-[var(--radius-sm)] bg-ink-25 border border-ink-200/80 text-xs text-ink-700">
                <summary class="min-h-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 px-3 py-2 font-semibold text-brand-700">
                  <Info :size="15" aria-hidden="true" /> Thông tin linh kiện
                </summary>
                <dl class="divide-y divide-ink-100 border-t border-ink-100 px-3">
                  <div v-for="(field, index) in selectedPartDetails" :key="index" class="py-2 grid grid-cols-[minmax(0,100px)_minmax(0,1fr)] gap-x-3 gap-y-1">
                    <dt class="font-medium text-ink-500 break-words">{{ field.label }}</dt>
                    <dd class="min-w-0 break-words text-ink-900">{{ field.value }}</dd>
                  </div>
                </dl>
              </details>

              <div class="flex flex-wrap items-center justify-between gap-2.5">
                <div class="flex items-center gap-1.5 bg-ink-50 p-1 rounded-[var(--radius-sm)] border border-ink-200">
                  <span class="text-xs font-semibold text-ink-600 px-1.5">SL:</span>
                  <button
                    type="button"
                    class="h-8 w-8 rounded bg-white border border-ink-200 hover:bg-ink-100 text-ink-800 font-bold flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
                    :disabled="selectedQuantity <= 1"
                    @click="selectedQuantity = Math.max(1, selectedQuantity - 1)"
                  >
                    <Minus :size="13" />
                  </button>
                  <input
                    v-model.number="selectedQuantity"
                    type="number"
                    min="1"
                    :max="MAX_PART_REQUEST_QTY"
                    step="1"
                    data-testid="part-request-qty"
                    @change="selectedQuantity = clampPartQty(selectedQuantity)"
                    class="w-11 h-8 text-sm font-bold font-num text-center bg-transparent border-0 outline-hidden"
                  />
                  <button
                    type="button"
                    class="h-8 w-8 rounded bg-white border border-ink-200 hover:bg-ink-100 text-ink-800 font-bold flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
                    :disabled="selectedQuantity >= MAX_PART_REQUEST_QTY"
                    @click="selectedQuantity = clampPartQty(selectedQuantity + 1)"
                  >
                    <Plus :size="13" />
                  </button>
                </div>

                <div class="text-xs sm:text-sm">
                  <span class="text-ink-500">Tạm tính:</span>
                  <strong class="text-brand-700 font-num ml-1 font-bold">
                    <FhMoney :amount="activePartEstimatedPrice" />
                  </strong>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 w-full min-w-0">
                <input
                  v-model="itemNote"
                  type="text"
                  placeholder="Ghi chú món này (VD: mang sơ cua, thay buồng lạnh)..."
                  class="min-w-0 w-full h-11 text-sm rounded-[var(--radius-sm)] border border-ink-200 px-3 bg-white text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden"
                />
                <button
                  type="button"
                  class="w-full sm:w-auto min-w-0 min-h-11 px-4 py-2 rounded-[var(--radius-sm)] bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer whitespace-nowrap"
                  @click="addItemToForm"
                >
                  <Plus :size="15" /> Thêm vào danh sách
                </button>
              </div>
            </div>
          </div>

          <!-- Selected Parts Summary List -->
          <div v-if="selectedItems.length > 0" class="space-y-2.5" data-testid="selected-parts-summary">
            <div class="flex items-center justify-between gap-2 text-sm">
              <strong class="text-ink-900">Đã chọn {{ selectedItems.length }} loại · {{ selectedTotalQuantity }} cái</strong>
              <strong class="font-num text-brand-700"><FhMoney :amount="selectedTotalPrice" /></strong>
            </div>
            <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white divide-y divide-ink-100">
              <div v-for="(item, idx) in selectedItems" :key="item.partCatalogId" class="p-3 sm:p-3.5 space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-ink-900">{{ item.partName }}</p>
                    <p v-if="item.sku" class="text-[11px] text-ink-500 font-mono">{{ item.sku }}</p>
                  </div>
                  <button
                    type="button"
                    class="shrink-0 w-10 h-10 -my-1 -mr-1 inline-flex items-center justify-center text-danger-600 rounded-[var(--radius-sm)] hover:bg-danger-50 transition-colors cursor-pointer"
                    aria-label="Xoá linh kiện"
                    @click="removeItemFromForm(idx)"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
                <div class="flex flex-wrap justify-between items-center gap-2">
                  <div class="inline-flex items-center rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50">
                    <button type="button" class="w-10 h-10 flex items-center justify-center hover:bg-ink-100 rounded-l-[var(--radius-sm)] transition-colors cursor-pointer" :aria-label="`Giảm số lượng ${item.partName}`" @click="decreaseQuantity(idx)"><Minus :size="14" /></button>
                    <span class="w-8 text-center font-num text-sm font-semibold text-ink-900">{{ item.quantity }}</span>
                    <button type="button" class="w-10 h-10 flex items-center justify-center hover:bg-ink-100 rounded-r-[var(--radius-sm)] transition-colors cursor-pointer" :aria-label="`Tăng số lượng ${item.partName}`" @click="increaseQuantity(idx)"><Plus :size="14" /></button>
                  </div>
                  <div class="text-right text-xs text-ink-600">
                    <p><FhMoney :amount="item.price" />/cái</p>
                    <strong class="font-num text-sm text-brand-700"><FhMoney :amount="item.price * item.quantity" /></strong>
                  </div>
                </div>
                <p v-if="item.note" class="text-xs text-ink-500">{{ item.note }}</p>
              </div>
            </div>
          </div>

          <!-- Fulfillment & Reason inputs -->
          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-ink-700 mb-1.5 text-xs">Phương thức nhận linh kiện</label>
              <select
                v-model="fulfillmentMethod"
                class="w-full h-11 text-sm rounded-[var(--radius-sm)] border border-ink-200 px-3 bg-white text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden"
              >
                <option value="pickup">Tự lấy tại kho FixHome</option>
                <option value="delivery">Giao tới địa chỉ</option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-ink-700 mb-1.5 text-xs">Ghi chú / Lý do yêu cầu linh kiện</label>
              <input
                v-model="requestReason"
                type="text"
                placeholder="VD: Nghi hỏng bo mạch chính hoặc cảm biến nhiệt độ"
                class="w-full h-11 text-sm rounded-[var(--radius-sm)] border border-ink-200 px-3 bg-white text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden"
              />
            </div>
          </div>

          <!-- Bottom Action Footer -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
            <p class="text-xs text-ink-500">
              {{ selectedItems.length > 0 ? 'Giá dự kiến · chưa tính vào hóa đơn khách.' : 'Chọn ít nhất 1 linh kiện ở trên để gửi yêu cầu.' }}
            </p>
            <div class="flex items-center gap-2 ml-auto">
              <FhButton variant="ghost" size="md" data-testid="cancel-part-request-form" @click="cancelCreateForm">Hủy bỏ</FhButton>
              <FhButton
                variant="primary"
                size="md"
                :disabled="selectedItems.length === 0 || actionLoading"
                @click="submitPreRepairRequest"
              >
                <Send :size="14" class="mr-1.5" /> Gửi yêu cầu tới Quản lý
              </FhButton>
            </div>
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
          class="rounded-2xl border border-ink-200/90 bg-white overflow-hidden space-y-3.5 p-4 sm:p-5"
        >
          <!-- Request Header -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span
                class="px-2.5 py-1 rounded-lg text-xs font-semibold border"
                :class="getStatusBadgeClass(displayPartRequestStatus(pr))"
              >
                {{ formatStatusText(displayPartRequestStatus(pr)) }}
              </span>

              <span
                v-if="pr.requestType === 'pre_repair'"
                class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-warning-50 text-warning-700 border border-warning-200"
              >
                Trước sửa chữa
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-200"
              >
                {{ pr.requestType === 'quotation' ? 'Theo báo giá đã duyệt' : pr.requestType === 'warranty' ? 'Bảo hành' : 'Phát sinh khi sửa' }}
              </span>

              <span class="text-ink-500 text-xs inline-flex items-center gap-1">
                <Truck v-if="pr.fulfillmentMethod === 'delivery'" :size="13" />
                <Package v-else :size="13" />
                {{ pr.fulfillmentMethod === 'delivery' ? 'Giao hàng' : 'Tự lấy tại kho' }}
              </span>

              <span v-if="pr.receivedAt" class="inline-flex items-center gap-1 text-xs font-medium text-success-700">
                <CheckCircle2 :size="13" class="shrink-0" aria-hidden="true" />
                Nhận {{ vnDateTimeString(pr.receivedAt) }}
              </span>
            </div>

            <button type="button" class="inline-flex min-h-10 items-center gap-1 text-xs sm:text-sm font-semibold text-brand-700 hover:text-brand-800 cursor-pointer" :aria-expanded="isRequestExpanded(pr.id, group.key)" @click="toggleRequestExpanded(pr.id, group.key)">
              {{ isRequestExpanded(pr.id, group.key) ? 'Thu gọn' : 'Chi tiết' }}
              <span aria-hidden="true">{{ isRequestExpanded(pr.id, group.key) ? '⌃' : '⌄' }}</span>
            </button>
          </div>
          <div v-show="isRequestExpanded(pr.id, group.key)" class="space-y-3.5">
          <!-- Reason & Notes -->
          <p v-if="requestReasonText(pr.reason)" class="text-xs text-ink-700" data-testid="part-request-reason">
            <span class="font-semibold text-ink-800">Lý do:</span> {{ requestReasonText(pr.reason) }}
          </p>

          <section v-if="pr.fulfillmentMethod === 'pickup' && (warehouseAllocationFor(pr)?.mode === 'warehouse' || warehouseAllocationLoading[pr.id] || warehouseAllocationErrors[pr.id])" class="space-y-1 rounded-xl bg-ink-50/80 border border-ink-200/70 px-3.5 py-3 text-xs" :data-testid="`tech-warehouse-allocation-${pr.id}`">
            <p v-if="warehouseAllocationLoading[pr.id]" class="text-ink-600">Đang kiểm tra kho được phân bổ…</p>
            <p v-else-if="warehouseAllocationErrors[pr.id]" class="text-warning-800">Chưa kiểm tra được trạng thái kho. Không xác nhận nhận hàng cho tới khi được đối chiếu.</p>
            <template v-else-if="warehouseAllocationFor(pr)?.mode === 'warehouse'">
              <p class="font-semibold text-ink-900">{{ warehouseAllocationFor(pr)?.warehouseName || (warehouseAllocationFor(pr)?.status === 'stock_unavailable' ? 'Chưa có kho phân bổ' : 'Kho linh kiện') }}</p>
              <p v-if="warehouseAllocationFor(pr)?.warehouseAddress" class="text-ink-600">{{ warehouseAllocationFor(pr)?.warehouseAddress }}</p>
              <p
                v-if="warehouseAllocationFor(pr)?.distanceReference === 'booking_snapshot' && typeof warehouseAllocationFor(pr)?.estimatedStraightLineKm === 'number'"
                class="text-warning-800"
              >Khoảng cách đường thẳng ước tính từ vị trí đặt lịch: ~{{ warehouseAllocationFor(pr)?.estimatedStraightLineKm?.toFixed(1) }} km; chưa xác minh đường đi/ETA</p>
              <p v-else-if="warehouseAllocationFor(pr)?.reviewRequired" class="text-warning-800">Chưa xác minh khoảng cách; quản lý cần kiểm tra. Không có km hoặc thời gian ước tính.</p>
              <p v-if="warehouseAllocationFor(pr)?.status === 'stock_unavailable'" class="text-warning-800">Không có kho FixHome nào đủ toàn bộ linh kiện yêu cầu. Thợ tự chuẩn bị; hệ thống không tự động tính phí linh kiện tự mua. Yêu cầu này không phát QR.</p>
              <FhButton v-if="pr.requestType === 'pre_repair' && pr.status === 'requested' && warehouseAllocationFor(pr)?.status === 'stock_unavailable'"
                variant="secondary" size="sm" :disabled="actionLoading"
                @click="cancelUnavailablePreRepair(pr.id)">Dừng yêu cầu kho, tự chuẩn bị</FhButton>
              <p v-else-if="warehouseAllocationFor(pr)?.status === 'reserved' || warehouseAllocationFor(pr)?.status === 'ready'" class="text-ink-700">Đang chờ quản lý bàn giao trực tiếp. Chưa có xác nhận đã cấp linh kiện.</p>
              <p v-else-if="warehouseAllocationFor(pr)?.status === 'handed_over'" class="font-medium text-brand-800">Quản lý đã bàn giao thực tế. Nhập mã QR nhận hàng riêng do quản lý đưa cho bạn.</p>
              <p v-else-if="warehouseAllocationFor(pr)?.status === 'received'" class="font-medium text-success-700">Đã xác nhận nhận linh kiện.</p>
            </template>
          </section>

          <!-- Delivery Shipping & Terms Panels if applicable -->
          <div v-if="pr.fulfillmentMethod === 'delivery'" class="space-y-3">
            <DeliveryPhysicalPreview
              v-if="pr.serviceOrderId === orderId && isDeliveryPhysicalRequestId(pr.id)"
              :request-id="pr.id"
              :fulfillment-method="pr.fulfillmentMethod"
              audience="technician"
            />
            <DeliveryOperationsPanel
              v-if="pr.serviceOrderId === orderId && isDeliveryPhysicalRequestId(pr.id)"
              :request-id="pr.id"
              :fulfillment-method="pr.fulfillmentMethod"
              :request-type="pr.requestType"
              :shipping-fee="pr.shippingFee"
              audience="technician"
              :source-owner-id="pr.technicianId"
            />
            <DeliveryTermsPanel
              v-if="pr.serviceOrderId === orderId && pr.requestType === 'additional' && pr.shippingFee > 0 && isDeliveryPhysicalRequestId(pr.id)"
              :request-id="pr.id"
              :request-type="pr.requestType"
              :fulfillment-method="pr.fulfillmentMethod"
              :shipping-fee="pr.shippingFee"
              audience="technician"
              :technician-id="pr.technicianId"
            />
            <div v-if="pr.shippingFee > 0 || pr.shippingPolicyVersion" class="text-xs text-brand-700 font-medium">
              <ShippingShareBreakdown :snapshot="pr" role="technician" :fulfillment-method="pr.fulfillmentMethod" />
            </div>
          </div>

          <!-- Pending Preparation State -->
          <div
            v-if="displayPartRequestStatus(pr) === 'requested' && !isW3Delivery(pr) && warehouseAllocationFor(pr)?.status !== 'stock_unavailable'"
            class="p-2.5 rounded-xl bg-warning-50/80 border border-warning-200 flex flex-wrap items-center justify-between gap-2"
          >
            <div class="flex items-center gap-2 text-xs text-warning-800">
              <Clock :size="14" class="text-warning-600 shrink-0" />
              <span>Đang chờ chuẩn bị linh kiện…</span>
            </div>
            <button
              v-if="canModifyPreRepair(pr) && confirmModifyPreRepairId !== pr.id"
              type="button"
              class="text-xs font-semibold text-brand-700 hover:text-brand-800 underline cursor-pointer disabled:opacity-50"
              :disabled="actionLoading"
              @click="promptModifyPreRepair(pr.id)"
            >
              Đặt lại &amp; thêm linh kiện
            </button>
          </div>

          <!-- QR Handover Action (When READY or DELIVERING) -->
          <div
            v-if="
              canReceivePickup(pr) ||
              (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering')
            "
            class="p-3 rounded-xl bg-brand-50 border border-brand-200 space-y-2"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-brand-900 font-bold">
                <QrCode :size="16" class="text-brand-600 shrink-0" />
                <span>{{ needsWarehouseReceipt(pr) ? 'Nhập mã nhận riêng sau khi quản lý bàn giao' : 'Linh kiện đã sẵn sàng bàn giao!' }}</span>
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
                maxlength="128"
                data-testid="handover-code-input"
                :placeholder="needsWarehouseReceipt(pr) ? 'Nhập mã nhận hàng riêng do quản lý cung cấp' : 'Nhập mã bàn giao'"
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

          <!-- Items list in this request -->
          <div class="space-y-2.5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h5 class="font-semibold text-ink-800 text-sm">Thực tế đã dùng/không dùng</h5>
              <p v-if="requestHasReturns(pr)" class="text-xs text-ink-500">“Hoàn trả” ghi nhận không dùng; “Khai trả kho” gửi số lượng để quản lý nhận thực tế.</p>
            </div>
            <div class="space-y-2.5">
              <article v-for="item in pr.items" :key="item.id" class="rounded-xl border border-ink-200/85 bg-ink-25/50 p-3.5 sm:p-4 space-y-3" :data-testid="`part-item-${item.id}`">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h6 class="font-bold text-sm sm:text-[15px] text-ink-900">{{ item.partNameSnapshot }}</h6>
                      <span class="inline-flex rounded-md bg-white border border-ink-200/80 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                        {{ item.partSource === 'fixhome' ? 'FixHome' : item.partSource === 'technician' ? 'Kỹ thuật viên tự có' : 'Mua ngoài' }}
                      </span>
                    </div>
                    <p v-if="item.note" class="text-xs text-ink-500">Ghi chú: {{ item.note }}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 shrink-0">
                    <span v-if="getPartWarrantyFromHistory(item)" class="inline-flex items-center gap-1 rounded-full border border-success-200 bg-success-50 px-2.5 py-0.5 text-[11px] font-semibold text-success-700">
                      <ShieldCheck :size="12" /> {{ getPartWarrantyFromHistory(item) }}
                    </span>
                    <span class="inline-flex items-baseline gap-1 rounded-lg bg-white border border-ink-200/70 px-2.5 py-1 text-xs text-ink-500">
                      <span>Đơn giá</span>
                      <strong class="font-num text-sm font-bold text-ink-900"><FhMoney :amount="item.unitPriceSnapshot" /></strong>
                    </span>
                  </div>
                </div>
                <template v-for="record in [returnFor(item.id)]" :key="record?.partRequestItemId ?? item.id">
                  <div v-if="record" class="space-y-2.5 text-xs text-ink-700">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="flex flex-wrap gap-x-1 gap-y-1 text-xs sm:text-sm font-medium text-ink-700">
                        <span class="whitespace-nowrap">Cấp <span class="font-num font-semibold text-ink-900">{{ record.issuedQty }}</span></span> ·
                        <span class="whitespace-nowrap">Dùng <span class="font-num font-semibold text-ink-900">{{ record.usedQty }}</span></span> ·
                        <span class="whitespace-nowrap">Cần trả kho <span class="font-num font-semibold text-ink-900">{{ record.outstandingQty }}</span></span>
                      </p>
                      <p v-if="record.usageRecorded !== false" class="flex items-baseline gap-1.5 text-xs">
                        <span class="text-ink-500">Giá trị linh kiện đã dùng</span>
                        <FhMoney :amount="item.unitPriceSnapshot * record.usedQty" data-testid="part-used-value" class="font-bold text-sm text-ink-900" />
                      </p>
                    </div>
                    <dl class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div class="rounded-lg bg-white border border-ink-200/70 px-3 py-2.5"><dt class="text-[11px] font-medium text-ink-500">Còn phải khai</dt><dd class="mt-1 font-num text-base font-bold text-ink-900">{{ canDeclareMoreQty(record) }}</dd></div>
                      <div class="rounded-lg bg-white border border-ink-200/70 px-3 py-2.5"><dt class="text-[11px] font-medium text-ink-500">Đã khai, chờ nhận</dt><dd class="mt-1 font-num text-base font-bold" :class="pendingDeclaredQty(record) > 0 ? 'text-warning-700' : 'text-ink-900'">{{ pendingDeclaredQty(record) }}</dd></div>
                      <div class="rounded-lg bg-white border border-ink-200/70 px-3 py-2.5"><dt class="text-[11px] font-medium text-ink-500">Khách duyệt tối đa (cả máy)</dt><dd class="mt-1 font-num text-base font-bold text-ink-900">{{ approvedPartQuantities && item.partCatalogId ? approvedPartQuantities[item.partCatalogId] ?? 0 : 'Chưa kiểm tra được' }}</dd></div>
                      <div class="rounded-lg bg-white border border-ink-200/70 px-3 py-2.5"><dt class="text-[11px] font-medium text-ink-500">Quản lý đã nhận</dt><dd class="mt-1 font-num text-base font-bold text-ink-900">{{ record.managerAcceptedQty }}</dd></div>
                    </dl>
                  </div>
                  <div v-else class="space-y-1.5 text-xs text-ink-700 rounded-lg bg-white border border-ink-200/70 px-3 py-2.5">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                      <p>Số lượng yêu cầu/cấp <strong class="font-num text-ink-900">{{ item.quantity }}</strong></p>
                      <p>Giá trị theo số lượng yêu cầu <FhMoney :amount="item.unitPriceSnapshot * item.quantity" class="font-semibold text-ink-900" /></p>
                    </div>
                    <p class="text-ink-600">Chưa có số lượng thực dùng chi tiết.</p>
                    <p class="font-medium text-ink-800">{{ item.usageStatus === 'used' ? 'Đã dùng · chưa có số lượng chi tiết' : item.usageStatus === 'returned' ? 'Đã ghi nhận không dùng · chưa xác nhận trả kho' : 'Chưa ghi nhận sử dụng' }}</p>
                  </div>

                  <p v-if="unapprovedItem(item)" class="text-xs sm:text-sm text-warning-800">Chưa được khách duyệt linh kiện này. Thực dùng tối đa 0; báo giá bổ sung để xin duyệt hoặc khai trả toàn bộ.</p>
                  <div class="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-ink-200/60">
                    <div class="min-w-0 flex-1 text-xs">
                      <p v-if="record && record.usageRecorded === false" class="inline-flex items-center gap-1.5 text-ink-600 font-medium">
                        <span class="h-1.5 w-1.5 rounded-full bg-warning-500 shrink-0" aria-hidden="true"></span>
                        Chưa chốt số lượng thực dùng.
                      </p>
                      <p v-else-if="record && pendingDeclaredQty(record) > 0" class="inline-flex items-center gap-1.5 font-medium text-warning-800"><Clock :size="14" class="shrink-0" aria-hidden="true" />Đang chờ quản lý xác nhận nhận thực tế, chưa hoàn tất trả kho.</p>
                      <p v-else-if="record && record.outstandingQty === 0 && record.managerAcceptedQty > 0" class="inline-flex items-center gap-1.5 font-medium text-success-700"><CheckCircle2 :size="14" class="shrink-0" aria-hidden="true" />Đã nhận đủ số linh kiện hoàn trả.</p>
                    </div>
                    <div class="part-item-actions flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end" :data-testid="`part-actions-${item.id}`" role="group" :aria-label="`Sử dụng và khai trả ${item.partNameSnapshot}`">
                      <template v-if="canRecordUsage(pr, item) && !record">
                        <button type="button" class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] sm:flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border bg-white px-4 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                          :class="item.usageStatus === 'used' ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-300 text-ink-700 hover:bg-ink-50'"
                          :aria-pressed="item.usageStatus === 'used'" :aria-label="`Ghi nhận đã dùng ${item.partNameSnapshot}`"
                          :disabled="actionLoading || disabled || usageLimit(item) < item.quantity" @click="handleUpdateUsage(pr.id, item.id, 'used')"><Check :size="16" class="shrink-0" aria-hidden="true" />Đã dùng</button>
                        <button type="button" class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] sm:flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border bg-white px-4 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                          :class="item.usageStatus === 'returned' ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-300 text-ink-700 hover:bg-ink-50'"
                          :aria-pressed="item.usageStatus === 'returned'" :aria-label="`Ghi nhận không dùng ${item.partNameSnapshot}`"
                          :disabled="actionLoading || disabled" @click="handleUpdateUsage(pr.id, item.id, 'returned')"><RotateCcw :size="16" class="shrink-0" aria-hidden="true" />Hoàn trả</button>
                      </template>
                      <button v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && item.partSource === 'fixhome' && record && usageLimit(item) > 0" type="button"
                        data-testid="edit-part-usage"
                        class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] sm:flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                        :disabled="actionLoading || disabled || returnsLoadError"
                        :aria-label="`Ghi số lượng thực dùng ${item.partNameSnapshot}`"
                        :aria-expanded="!!partialUsageEditing[item.id]" :aria-controls="`part-usage-editor-${item.id}`"
                        @click="partialUsageEditing[item.id] = !partialUsageEditing[item.id]">
                        <Check :size="16" class="shrink-0" aria-hidden="true" />{{ partialUsageEditing[item.id] ? 'Đóng nhập' : 'Ghi thực dùng' }}
                      </button>
                      <button v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && record && !record.usageRecorded && record.usedQty === 0 && usageLimit(item) === 0" type="button"
                        data-testid="confirm-zero-usage" class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] sm:flex-none items-center justify-center gap-1.5 rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                        :disabled="actionLoading || disabled || returnsLoadError" @click="partialUsageDraft[item.id] = 0; handlePartialUsage(pr.id, item.id)"><RotateCcw :size="16" aria-hidden="true" />Xác nhận không dùng</button>
                      <button v-if="record && canDeclareMoreQty(record) > 0 && canDeclareReturn(pr, item)" type="button"
                        data-testid="open-declare-return"
                        class="inline-flex min-h-11 min-w-0 flex-[1_1_9rem] sm:flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
                        :aria-label="`Khai trả kho ${item.partNameSnapshot}`"
                        :aria-expanded="declareTarget?.itemId === item.id" :aria-controls="`part-return-editor-${item.id}`"
                        :disabled="declareSubmitting || returnsLoadError || disabled || bulkReturnOpen || !!pendingBulkDeclarations[item.id]" @click="openDeclareReturn(pr.id, item.id, item.partNameSnapshot, record)">
                        <Undo2 :size="16" class="shrink-0" aria-hidden="true" />Khai trả kho
                      </button>
                    </div>
                  </div>
                  <div v-if="isUnderRepair && !usageFrozen && pr.status === 'received' && item.partSource === 'fixhome' && record && usageLimit(item) > 0 && partialUsageEditing[item.id]"
                    :id="`part-usage-editor-${item.id}`" class="space-y-3 rounded-xl bg-white border border-ink-200/80 p-3.5" data-testid="partial-usage-editor">
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
            :id="`part-return-editor-${declareTarget.itemId}`"
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
                  :aria-describedby="`part-return-hint-${declareTarget.itemId}`"
                  class="h-11 w-24 rounded-lg border border-ink-300 bg-white px-3 text-base text-ink-900 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                />
              </div>
              <FhButton
                data-testid="submit-declare-return"
                variant="primary"
                size="md"
                :loading="declareSubmitting"
                :disabled="declareSubmitting || !declareValid"
                @click="submitDeclareReturn"
              >
                <Send :size="13" class="mr-1" /> Gửi khai trả
              </FhButton>
              <FhButton
                variant="ghost"
                size="md"
                :disabled="declareSubmitting"
                @click="declareTarget = null"
              >
                Huỷ
              </FhButton>
            </div>
            <p :id="`part-return-hint-${declareTarget.itemId}`" class="text-sm text-ink-600">
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
