<script setup lang="ts">
import { displayPartRequestStatus, isW3Delivery } from '../../utils/w3-delivery-stage';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useAuthStore } from '../../stores/auth';
import {
  Boxes,
  Package,
  Truck,
  ArrowLeftRight,
  CheckCircle2,
  Check,
  Flag,
  Search,
  Calendar,
  Layers,
  SlidersHorizontal,
  Warehouse as WarehouseIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Info,
  MapPin,
  Route,
  Copy,
  X,
} from 'lucide-vue-next';
import { FhMoney, FhButton, FhConfirmDialog, FhSkeleton } from '../../components';
import ShippingShareBreakdown from '../../components/ShippingShareBreakdown.vue';
import DeliveryOperationsPanel from '../../components/DeliveryOperationsPanel.vue';
import DeliveryTermsPanel from '../../components/DeliveryTermsPanel.vue';
import { isDeliveryPhysicalRequestId } from '../../api/w3-delivery-physical.api';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import FaultyPartInspectionModal from '../../components/console/FaultyPartInspectionModal.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import {
  partRequestsApi,
  type WarehouseAllocation,
  type PartRequest,
  type PartRequestItem,
  type PartRequestStatus,
  type PartRequestType,
  type FulfillmentMethod,
  type PartCustodyReturnRecord,
  isPartReturnsUnavailableError,
} from '../../api/part-requests.api';
import { warehousesApi, type Warehouse } from '../../api/warehouses.api';
import { vnDateString, vnDateTimeString, vnDayKey, vnKeyAndClockToDate, vnTimeString } from '../../utils/vn-time';
import { userFacingError } from '../../utils/user-facing-error';
import { partCustodyQuantities } from '../../utils/part-custody-quantities';
import { usePartReturnsRefresh } from '../../composables/usePartReturnsRefresh';
import { canConfirmWarehouseHandover, warehouseIssuedTokenSlot, warehouseQrAction, warehouseQrOpen } from '../../utils/warehouse-fulfillment';

const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));

const page = ref(1);
const pageSize = 20;
const loadError = ref(false);
let loadVersion = 0;
const qrImage = ref('');
const loading = ref(true);
const actionLoading = ref(false);
const requests = ref<PartRequest[]>([]);
const totalCount = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)));
const searchQuery = ref('');
const statusFilter = ref('ALL');
const typeFilter = ref('ALL');
const fulfillmentFilter = ref('ALL');
const dateFilter = ref<'ALL' | 'today' | '7days' | '30days'>('ALL');
const warehouseFilter = ref('ALL');
const warehousesList = ref<Warehouse[]>([]);
const sortOrder = ref<'newest' | 'oldest'>('newest');

const qrModalRequest = ref<PartRequest | null>(null);
const inspectionRequest = ref<PartRequest | null>(null);

const selectedId = ref<string | null>(null);
const selected = computed(() => requests.value.find((row) => row.id === selectedId.value) ?? requests.value[0] ?? null);
const detailPane = ref<HTMLElement | null>(null);

watch(
  () => selected.value?.id,
  () => {
    if (typeof window !== 'undefined' && detailPane.value) {
      detailPane.value.scrollTop = 0;
    }
  },
);

function selectRequest(row: PartRequest) {
  selectedId.value = row.id;
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      detailPane.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    } else if (detailPane.value) {
      detailPane.value.scrollTop = 0;
      const rect = detailPane.value.getBoundingClientRect();
      if (rect.top < 80) {
        window.scrollBy({ top: rect.top - 80, behavior: 'smooth' });
      }
    }
  });
}

const itemsSummary = (row: PartRequest) => {
  const items = row.items || [];
  if (!items.length) return 'Chưa có linh kiện';
  const first = `${items[0].partNameSnapshot} x ${items[0].quantity}`;
  return items.length > 1 ? `${first} và ${items.length - 1} linh kiện khác` : first;
};

const warehouseLabel = (row: PartRequest) => {
  const allocation = allocationFor(row);
  return allocation?.mode === 'warehouse' && allocation.warehouseName ? allocation.warehouseName : '';
};

const cancelTarget = ref<PartRequest | null>(null);
const copiedToken = ref(false);
const copiedInline = ref<string | null>(null);
const allocations = ref<Record<string, WarehouseAllocation | null>>({});
const allocationLoading = ref<Record<string, boolean>>({});
const allocationErrors = ref<Record<string, string>>({});
const warehouseTokens = ref<Record<string, { pickup: string | null; receipt: string | null }>>({});
const warehouseQrImages = ref<Record<string, { pickup: string; receipt: string }>>({});
const handoverTarget = ref<PartRequest | null>(null);

const returnsWaiting = ref<number | null>(null);
const returnsWaitingError = ref(false);
let returnsWaitingVersion = 0;
const loadReturnsWaiting = async () => {
  const version = ++returnsWaitingVersion;
  if (!canOperate.value) { returnsWaiting.value = null; returnsWaitingError.value = false; return; }
  try {
    const rows = await partRequestsApi.getPendingReturns();
    if (version !== returnsWaitingVersion || !canOperate.value) return;
    returnsWaitingError.value = false;
    returnsWaiting.value = rows.filter((row) => row.declaredQty - row.managerAcceptedQty > 0 && row.outstandingQty > 0).length;
  } catch (err) {
    if (version !== returnsWaitingVersion || !canOperate.value) return;
    returnsWaitingError.value = !isPartReturnsUnavailableError(err);
  }
};

type CustodyRead = { rows: PartCustodyReturnRecord[]; state: 'loading' | 'ready' | 'error' | 'unavailable' };
const custodyByOrder = ref<Record<string, CustodyRead>>({});
let custodyReadVersion = 0;

async function loadVisibleCustody(rows: PartRequest[], pageVersion: number) {
  const version = ++custodyReadVersion;
  if (!canOperate.value) { custodyByOrder.value = {}; return; }
  const ids = [...new Set(rows.slice(0, pageSize)
    .filter(row => ['received', 'completed'].includes(row.status.toLowerCase()) && row.items.some(item => item.partSource === 'fixhome'))
    .map(row => row.serviceOrderId).filter(Boolean))];
  custodyByOrder.value = Object.fromEntries(ids.map(id => [id, custodyByOrder.value[id] ?? { rows: [], state: 'loading' as const }]));
  const current = () => version === custodyReadVersion && pageVersion === loadVersion && canOperate.value;
  if (!ids.length) return;
  try {
    const byOrder = await partRequestsApi.getReturnsByOrderIds(ids);
    if (current()) for (const id of ids) custodyByOrder.value[id] = { rows: byOrder[id] ?? [], state: 'ready' };
  } catch (err) {
    const state = isPartReturnsUnavailableError(err) ? 'unavailable' as const : 'error' as const;
    if (current()) for (const id of ids) custodyByOrder.value[id] = { rows: [], state };
  }
}

function custodyFor(request: PartRequest, itemId: string) {
  return custodyByOrder.value[request.serviceOrderId]?.rows.find(row => row.partRequestId === request.id && row.partRequestItemId === itemId);
}

function custodyReadLabel(request: PartRequest) {
  const state = custodyByOrder.value[request.serviceOrderId]?.state;
  return state === 'loading' ? 'Đang đọc số thực dùng…' : state === 'error' ? 'Chưa tải được số thực dùng' : 'Chưa có số lượng thực dùng chi tiết';
}

watch(qrModalRequest, async (request) => {
  qrImage.value = '';
  if (!request?.qrToken) return;
  try {
    const data = await QRCode.toDataURL(request.qrToken, { width: 220 });
    if (qrModalRequest.value?.qrToken === request.qrToken) qrImage.value = data;
  } catch { showToast('error', 'Chưa tạo được mã QR. Hãy dùng mã bàn giao bên dưới.'); }
});

const toastMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const showToast = (type: 'success' | 'error', text: string) => {
  toastMessage.value = { type, text };
  setTimeout(() => {
    if (toastMessage.value?.text === text) {
      toastMessage.value = null;
    }
  }, 4000);
};

const serverStatusCounts = ref<Record<string, number> | null>(null);

const stats = computed(() => {
  const reqs = requests.value;
  const counts = serverStatusCounts.value;
  const count = (status: string) => counts ? (counts[status] ?? 0) : reqs.filter((r) => r.status.toLowerCase() === status).length;
  return [
    { key: 'requested', label: 'Chờ chuẩn bị', value: count('requested'), statusValue: 'REQUESTED' },
    { key: 'ready', label: 'Sẵn sàng', value: count('ready'), statusValue: 'READY' },
    { key: 'delivering', label: 'Đang giao', value: count('delivering'), statusValue: 'DELIVERING' },
    { key: 'received', label: 'Đã bàn giao', value: count('received'), statusValue: 'RECEIVED' },
    { key: 'completed', label: 'Hoàn tất', value: count('completed'), statusValue: 'COMPLETED' },
  ];
});

function statIcon(key: string) {
  switch (key) {
    case 'requested': return Package;
    case 'ready': return Truck;
    case 'delivering': return ArrowLeftRight;
    case 'received': return CheckCircle2;
    case 'completed': return Flag;
    default: return Package;
  }
}

function statIconBg(key: string) {
  switch (key) {
    case 'requested': return 'bg-amber-50 text-amber-500 border border-amber-100/60';
    case 'ready': return 'bg-sky-50 text-sky-500 border border-sky-100/60';
    case 'delivering': return 'bg-purple-50 text-purple-500 border border-purple-100/60';
    case 'received': return 'bg-emerald-50 text-emerald-500 border border-emerald-100/60';
    case 'completed': return 'bg-blue-50 text-blue-600 border border-blue-100/60';
    default: return 'bg-slate-50 text-slate-500 border border-slate-100/60';
  }
}

const countFor = (status: string) => {
  const counts = serverStatusCounts.value;
  return counts ? (counts[status] ?? 0) : requests.value.filter((r) => r.status.toLowerCase() === status).length;
};

const setStatusFilter = (val: string) => {
  statusFilter.value = val;
};

const loadData = async () => {
  const version = ++loadVersion;
  loading.value = true;
  loadError.value = false;
  try {
    const getRequests = canOperate.value ? partRequestsApi.getWarehouseTasks : partRequestsApi.getAll;
    const res = await getRequests({
      status: statusFilter.value !== 'ALL' ? statusFilter.value.toLowerCase() as PartRequestStatus : undefined,
      requestType: typeFilter.value !== 'ALL' ? typeFilter.value.toLowerCase() as PartRequestType : undefined,
      fulfillmentMethod: fulfillmentFilter.value !== 'ALL' ? fulfillmentFilter.value.toLowerCase() as FulfillmentMethod : undefined,
      createdFrom: dateFilter.value === 'ALL' ? undefined : (dateFilter.value === 'today' ? vnKeyAndClockToDate(vnDayKey(), 0, 0) : new Date(Date.now() - (dateFilter.value === '7days' ? 7 : 30) * 86400000)).toISOString(),
      search: searchQuery.value.trim() || undefined,
      page: page.value,
      pageSize,
    });
    if (version !== loadVersion) return;
    requests.value = res.data;
    totalCount.value = res.total;
    serverStatusCounts.value = res.statusCounts;
    await loadWarehouseAllocations(res.data, version);
    void loadVisibleCustody(res.data, version);
  } catch {
    if (version !== loadVersion) return;
    requests.value = [];
    loadError.value = true;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
};

async function loadWarehouseAllocations(rows: PartRequest[], version: number) {
  const pickups = rows.filter((row) => row.fulfillmentMethod === 'pickup');
  const next: Record<string, WarehouseAllocation | null> = {};
  for (const row of pickups) if (row.id in allocations.value) next[row.id] = allocations.value[row.id];
  allocations.value = next;
  allocationErrors.value = {};
  for (const row of pickups) if (row.warehouseAllocation) allocations.value[row.id] = row.warehouseAllocation;
  const missing = pickups.filter((row) => row.warehouseAllocation === undefined);
  for (const row of missing) allocationLoading.value[row.id] = true;
  await Promise.all(missing.map(async (row) => {
    try {
      const allocation = await partRequestsApi.getWarehouseAllocation(row.id);
      if (version === loadVersion) allocations.value[row.id] = allocation;
    } catch (error) {
      if (version === loadVersion) allocationErrors.value[row.id] = userFacingError(error, 'Chưa đọc được tình trạng cấp phát kho.');
    } finally {
      if (version === loadVersion) allocationLoading.value[row.id] = false;
    }
  }));
}

const allocationFor = (request: PartRequest) => allocations.value[request.id] ?? null;
const canPreparePickupQr = (request: PartRequest) => {
  const allocation = allocationFor(request);
  return canOperate.value && warehouseQrOpen(request.status, request.requestType) && !!allocation && allocation.mode === 'warehouse' && !!warehouseQrAction(allocation.status) && allocation.responsibleUserId === auth.user?.id;
};

async function refreshRequestRow(requestId: string) {
  const version = loadVersion;
  try {
    const fresh = await partRequestsApi.getById(requestId);
    if (version !== loadVersion) return;
    const current = requests.value.find((row) => row.id === requestId);
    if (!current) return;
    replaceRow({ ...current, ...fresh, warehouseAllocation: fresh.warehouseAllocation ?? current.warehouseAllocation });
  } catch {
    // refresh non-fatal
  }
}

async function prepareWarehouseQr(request: PartRequest) {
  if (!canPreparePickupQr(request) || actionLoading.value) return;
  actionLoading.value = true;
  const before = allocationFor(request);
  let result: Awaited<ReturnType<typeof partRequestsApi.prepareWarehouseQr>>;
  try {
    result = await partRequestsApi.prepareWarehouseQr(request.id, { idempotencyKey: crypto.randomUUID() });
  } catch (error) {
    const actual = await partRequestsApi.getWarehouseAllocation(request.id).catch(() => null);
    if (actual) allocations.value[request.id] = actual;
    const rotated = !!actual && (actual.status !== before?.status || (actual.tokenVersion ?? 0) !== (before?.tokenVersion ?? 0));
    if (rotated) {
      warehouseTokens.value[request.id] = { pickup: null, receipt: null };
      allocationErrors.value[request.id] = '';
      showToast('error', 'Kho đã tạo mã mới nhưng câu trả lời không về tới trình duyệt. Mã chỉ hiển thị một lần; khi cần thì bấm tạo mã lần nữa, mã vừa tạo sẽ hết hiệu lực.');
    } else {
      const message = userFacingError(error, 'Chưa tạo được mã QR lấy hàng.');
      allocationErrors.value[request.id] = message;
      showToast('error', message);
    }
    actionLoading.value = false;
    return;
  }
  allocations.value[request.id] = result.allocation;
  allocationErrors.value[request.id] = '';
  const receipt = warehouseIssuedTokenSlot(result.allocation?.status) === 'receipt';
  warehouseTokens.value[request.id] = receipt ? { pickup: null, receipt: result.qrToken } : { pickup: result.qrToken, receipt: null };
  warehouseQrImages.value[request.id] = { pickup: '', receipt: '' };
  actionLoading.value = false;
  void refreshRequestRow(request.id);
  if (!result.qrToken) {
    showToast('error', 'Mã chỉ hiển thị một lần. Nếu không còn, tạo mã mới để xoay mã cũ.');
    return;
  }
  try {
    const image = await QRCode.toDataURL(result.qrToken, { width: 220 });
    warehouseQrImages.value[request.id] = receipt ? { pickup: '', receipt: image } : { pickup: image, receipt: '' };
  } catch {
    // text fallback
  }
}

async function confirmPhysicalHandover(request: PartRequest) {
  const pickup = warehouseTokens.value[request.id]?.pickup;
  const allocation = allocationFor(request);
  if (actionLoading.value) return;
  if (!canConfirmWarehouseHandover(auth.userRole, auth.user?.id, allocation) || !pickup) {
    handoverTarget.value = null;
    showToast('error', allocation?.status === 'handed_over'
      ? 'Phiếu này đã bàn giao rồi. Đưa mã nhận hàng cho kỹ thuật viên hoặc cấp lại mã nhận.'
      : 'Mã lấy hàng không còn trong phiên. Tạo lại mã kho rồi xác nhận giao.');
    return;
  }
  actionLoading.value = true;
  let result: Awaited<ReturnType<typeof partRequestsApi.confirmWarehouseHandover>>;
  try {
    result = await partRequestsApi.confirmWarehouseHandover(request.id, { qrToken: pickup, idempotencyKey: crypto.randomUUID() });
  } catch (error) {
    handoverTarget.value = null;
    const actual = await partRequestsApi.getWarehouseAllocation(request.id).catch(() => null);
    if (actual) allocations.value[request.id] = actual;
    if (actual?.status === 'handed_over' || actual?.status === 'received') {
      warehouseTokens.value[request.id] = { pickup: null, receipt: null };
      allocationErrors.value[request.id] = '';
      showToast('success', 'Kho đã ghi nhận bàn giao trước đó. Bấm "Cấp lại mã nhận" để lấy mã nhận hàng cho kỹ thuật viên; không bấm giao lại.');
    } else {
      const message = userFacingError(error, 'Chưa xác nhận được bàn giao thực tế.');
      allocationErrors.value[request.id] = message;
      showToast('error', `${message} Linh kiện chưa được xuất kho; kiểm tra mã lấy hàng rồi thử lại.`);
    }
    actionLoading.value = false;
    return;
  }
  allocations.value[request.id] = result.allocation;
  warehouseTokens.value[request.id] = { pickup: null, receipt: result.qrToken };
  handoverTarget.value = null;
  actionLoading.value = false;
  void refreshRequestRow(request.id);
  if (!result.qrToken) {
    showToast('error', 'Kho đã ghi nhận bàn giao; mã nhận hàng chỉ được hiển thị một lần và hiện không còn trong phiên. Bấm "Cấp lại mã nhận" để lấy mã mới.');
    return;
  }
  showToast('success', 'Đã xác nhận bàn giao thực tế; tồn kho đã được xuất. Đưa mã nhận hàng riêng cho kỹ thuật viên.');
  try {
    warehouseQrImages.value[request.id] = { pickup: '', receipt: await QRCode.toDataURL(result.qrToken, { width: 220 }) };
  } catch {
    warehouseQrImages.value[request.id] = { pickup: '', receipt: '' };
  }
}

onMounted(() => {
  void loadData();
  void loadReturnsWaiting();
  void loadWarehouses();
});

async function loadWarehouses() {
  try {
    warehousesList.value = await warehousesApi.list();
  } catch {
    warehousesList.value = [];
  }
}

usePartReturnsRefresh(async () => {
  await Promise.all([loadReturnsWaiting(), loadVisibleCustody(requests.value, loadVersion)]);
});

const refreshData = async () => { await Promise.all([loadData(), loadReturnsWaiting()]); };
watch(canOperate, () => { custodyByOrder.value = {}; void refreshData(); });
onUnmounted(() => {
  ++loadVersion; ++custodyReadVersion; ++returnsWaitingVersion;
});

watch([statusFilter, typeFilter, fulfillmentFilter, dateFilter, searchQuery], (_value, _old, onCleanup) => {
  page.value = 1;
  const timer = setTimeout(() => { void loadData(); }, 250);
  onCleanup(() => clearTimeout(timer));
});

const setPage = (next: number) => { page.value = next; void loadData(); };

const replaceRow = (updated: PartRequest) => {
  const idx = requests.value.findIndex((r) => r.id === updated.id);
  if (idx === -1) return;
  const from = requests.value[idx].status.toLowerCase();
  const to = String(updated.status ?? requests.value[idx].status).toLowerCase();
  const counts = serverStatusCounts.value;
  if (counts && from !== to) {
    serverStatusCounts.value = { ...counts, [from]: Math.max(0, (counts[from] ?? 0) - 1), [to]: (counts[to] ?? 0) + 1 };
  }
  requests.value[idx] = updated;
};

const handleMarkReady = async (req: PartRequest) => {
  if (!canOperate.value || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.markReady(req.id);
    replaceRow(updated);
    qrModalRequest.value = updated;
    showToast('success', 'Đã chuẩn bị xong, mã bàn giao đã sẵn sàng.');
  } catch (err: unknown) {
    showToast('error', userFacingError(err, 'Chưa cập nhật được trạng thái, vui lòng thử lại.'));
  } finally {
    actionLoading.value = false;
  }
};

const handleMarkDelivering = async (req: PartRequest) => {
  if (!canOperate.value || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.markDelivering(req.id);
    replaceRow(updated);
    showToast('success', 'Đã chuyển sang đang giao.');
  } catch (err: unknown) {
    showToast('error', userFacingError(err, 'Chưa cập nhật được trạng thái giao hàng, vui lòng thử lại.'));
  } finally {
    actionLoading.value = false;
  }
};

const handleCancelRequest = async () => {
  const req = cancelTarget.value;
  if (!req || !canOperate.value || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.cancel(req.id, 'Quản lý dịch vụ hủy');
    replaceRow(updated);
    showToast('success', 'Đã huỷ yêu cầu linh kiện.');
  } catch (err: unknown) {
    showToast('error', userFacingError(err, 'Chưa huỷ được yêu cầu, vui lòng thử lại.'));
  } finally {
    actionLoading.value = false;
    cancelTarget.value = null;
  }
};

const copyToken = async (token: string) => {
  try {
    await navigator.clipboard.writeText(token);
    copiedToken.value = true;
    copiedInline.value = token;
    setTimeout(() => { copiedToken.value = false; if (copiedInline.value === token) copiedInline.value = null; }, 2000);
  } catch {
    // clipboard fallback
  }
};

const regenerateQr = async () => {
  if (!canOperate.value || actionLoading.value || !qrModalRequest.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.regenerateQr(qrModalRequest.value.id);
    qrModalRequest.value = updated;
    replaceRow(updated);
    showToast('success', 'Đã tạo mã bàn giao mới. Mã cũ không còn hiệu lực.');
  } catch { showToast('error', 'Chưa tạo lại được mã bàn giao. Vui lòng tải lại trang.'); }
  finally { actionLoading.value = false; }
};

const requestCode = (req: PartRequest) => `PR-${req.id.substring(0, 8).toUpperCase()}`;
const isOpen = (req: PartRequest) => ['requested', 'ready', 'delivering'].includes(req.status.toLowerCase());
const hasQr = (req: PartRequest) => ['ready', 'delivering'].includes(req.status.toLowerCase()) && !!req.qrToken && (req.fulfillmentMethod === 'delivery' || allocationFor(req)?.mode === 'legacy');
const canDeliver = (req: PartRequest) => req.status.toLowerCase() === 'ready' && req.fulfillmentMethod === 'delivery';
const canMarkLegacyPickupReady = (req: PartRequest) => req.fulfillmentMethod === 'pickup' && allocationFor(req)?.mode === 'legacy';
const typeLabel = (type: string) => (type === 'pre_repair' ? 'Trước sửa chữa' : type === 'quotation' ? 'Báo giá tại chỗ' : type === 'warranty' ? 'Bảo hành' : 'Phát sinh');
const needsInspection = (req: PartRequest) => req.requestType === 'warranty' && !!req.faultyReturnedAt && !req.faultyInspectionResult;
const faultyReturnLabel = (req: PartRequest) => {
  if (req.faultyReturnedAt) return 'Thợ đã nộp';
  if (!req.faultyReturnDueAt) return 'Chờ thợ nhận linh kiện thay thế';
  return `${new Date(req.faultyReturnDueAt).getTime() < Date.now() ? 'Quá hạn nộp' : 'Hạn nộp'} ${vnDateTimeString(req.faultyReturnDueAt)}${req.faultyReturnChargedAt ? ', đã trừ ví thợ' : ''}`;
};
const inspectionLabel = (result?: string | null) => (result === 'manufacturer' ? 'Lỗi nhà sản xuất, FixHome chịu' : result === 'installation' ? 'Do lắp đặt, thợ trả tiền' : result === 'undetermined' ? 'Không xác định, FixHome chịu' : 'Chưa kiểm tra');
const onInspected = (updated: PartRequest) => {
  replaceRow(updated);
  inspectionRequest.value = null;
  showToast('success', 'Đã lưu kết quả kiểm tra linh kiện hỏng.');
};
const methodLabel = (method: string) => (method === 'delivery' ? 'Giao tận nơi' : 'Lấy tại kho');

const getStatusLabel = (status: PartRequestStatus | string) => {
  switch (status?.toLowerCase()) {
    case 'requested': return 'Chờ chuẩn bị';
    case 'ready': return 'Sẵn sàng giao';
    case 'delivering': return 'Đang giao hàng';
    case 'received': return 'Đã nhận / Đang dùng';
    case 'completed': return 'Hoàn tất';
    case 'cancelled': return 'Đã huỷ';
    default: return 'Trạng thái chưa xác định';
  }
};

const getStatusBadgeClass = (status: PartRequestStatus | string) => {
  switch (status?.toLowerCase()) {
    case 'requested': return 'bg-amber-100/80 text-amber-700 border-amber-200/50';
    case 'ready': return 'bg-sky-100/80 text-sky-700 border-sky-200/50';
    case 'delivering': return 'bg-purple-100/80 text-purple-700 border-purple-200/50';
    case 'received': return 'bg-emerald-100/80 text-emerald-700 border-emerald-200/50';
    case 'completed': return 'bg-blue-100/80 text-blue-700 border-blue-200/50';
    case 'cancelled': return 'bg-rose-100/80 text-rose-700 border-rose-200/50';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const getUsageStatusLabel = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending': return 'Đang giữ (chưa chốt)';
    case 'used': return 'Đã dùng (chỉ tính phí đã duyệt)';
    case 'returned': return 'Ghi nhận không dùng (chưa xác nhận trả kho)';
    default: return 'Chưa rõ';
  }
};

const displayedRequests = computed(() => {
  let list = [...requests.value];
  if (warehouseFilter.value !== 'ALL') {
    list = list.filter((r) => {
      const alloc = allocationFor(r);
      return alloc?.warehouseId === warehouseFilter.value;
    });
  }
  if (sortOrder.value === 'oldest') {
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

const paginationPages = computed(() => {
  const total = totalPages.value;
  const current = page.value;
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
});

function formatTimelineDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

function formatInfoDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${day}/${month}/${year}`;
}

function timelineState(req: PartRequest, step: 2 | 3 | 4): { completed: boolean; active: boolean; time: string } {
  const status = req.status.toLowerCase();
  if (step === 2) {
    const completed = status !== 'requested';
    const active = status === 'requested';
    const time = completed ? formatTimelineDate(req.qrGeneratedAt || req.updatedAt) : '';
    return { completed, active, time };
  }
  if (step === 3) {
    const completed = ['received', 'completed'].includes(status);
    const active = ['ready', 'delivering'].includes(status);
    const time = completed
      ? formatTimelineDate(allocationFor(req)?.handedOverAt || req.receivedAt || req.updatedAt)
      : (status === 'delivering' ? formatTimelineDate(req.updatedAt) : '');
    return { completed, active, time };
  }
  if (step === 4) {
    const completed = status === 'completed';
    const active = status === 'received';
    const time = completed ? formatTimelineDate(req.completedAt || req.updatedAt) : '';
    return { completed, active, time };
  }
  return { completed: false, active: false, time: '' };
}

function isConfirmedReceived(req: PartRequest) {
  const status = req.status.toLowerCase();
  const allocation = allocationFor(req);
  return status === 'received' || status === 'completed' || allocation?.status === 'received';
}

function getPartCode(item: PartRequestItem) {
  if (item.partCatalogId) {
    const raw = item.partCatalogId.replace(/-/g, '').slice(0, 6).toUpperCase();
    return raw || '000245';
  }
  return '000245';
}

function getIssuedQty(req: PartRequest, item: PartRequestItem) {
  const record = custodyFor(req, item.id);
  if (record && typeof record.issuedQty === 'number') {
    return record.issuedQty;
  }
  const status = req.status.toLowerCase();
  if (status === 'received' || status === 'completed' || status === 'ready' || status === 'delivering') {
    return item.quantity;
  }
  return 0;
}
</script>

<template>
  <div class="space-y-4 sm:space-y-5">
    <!-- Header -->
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div class="flex items-center gap-3.5 min-w-0">
        <div class="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
          <Boxes :size="22" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2.5 flex-wrap">
            <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Yêu cầu linh kiện</h1>
            <span
              v-if="!loading && !loadError && totalCount != null"
              class="hidden whitespace-nowrap font-num text-sm font-medium text-slate-400"
              data-testid="page-count"
            >{{ totalCount }}</span>
            <span v-if="!canOperate" class="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Chế độ chỉ đọc</span>
          </div>
          <p class="text-xs sm:text-sm text-slate-500 font-normal mt-0.5">Quản lý yêu cầu mượn, cấp linh kiện cho đơn sửa chữa</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="refreshData">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </div>
    </header>

    <!-- 5 Summary Status Cards -->
    <section class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3" aria-label="Số yêu cầu theo trạng thái trên trang này" title="Tính trên trang đang xem">
      <div
        v-for="stat in stats"
        :key="stat.key"
        class="rounded-2xl border border-slate-100 bg-white p-3.5 sm:p-4 shadow-(--shadow-e1) flex items-center gap-3 transition-all hover:shadow-md cursor-pointer"
        :class="statusFilter === stat.statusValue ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''"
        @click="setStatusFilter(statusFilter === stat.statusValue ? 'ALL' : stat.statusValue)"
      >
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="statIconBg(stat.key)">
          <component :is="statIcon(stat.key)" :size="20" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="whitespace-nowrap text-xs text-slate-500 font-medium leading-tight">{{ stat.label }}</div>
          <div class="mt-0.5 font-num text-xl sm:text-2xl font-bold text-slate-900">{{ stat.value }}</div>
        </div>
      </div>
    </section>

    <!-- Quick filter pills -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs sm:text-sm">
      <button
        type="button"
        class="rounded-xl px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap"
        :class="statusFilter === 'ALL' ? 'bg-blue-100 text-blue-800 font-semibold ring-1 ring-blue-300' : 'bg-blue-50/70 text-blue-700 hover:bg-blue-100/70'"
        @click="setStatusFilter('ALL')"
      >
        Tất cả ({{ totalCount }})
      </button>
      <button
        type="button"
        class="rounded-xl px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap"
        :class="statusFilter === 'REQUESTED' ? 'bg-amber-100 text-amber-800 font-semibold ring-1 ring-amber-300' : 'bg-amber-50/70 text-amber-700 hover:bg-amber-100/70'"
        @click="setStatusFilter('REQUESTED')"
      >
        Chờ chuẩn bị ({{ countFor('requested') }})
      </button>
      <button
        type="button"
        class="rounded-xl px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap"
        :class="statusFilter === 'READY' ? 'bg-sky-100 text-sky-800 font-semibold ring-1 ring-sky-300' : 'bg-sky-50/70 text-sky-700 hover:bg-sky-100/70'"
        @click="setStatusFilter('READY')"
      >
        Sẵn sàng ({{ countFor('ready') }})
      </button>
      <button
        type="button"
        class="rounded-xl px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap"
        :class="statusFilter === 'DELIVERING' ? 'bg-purple-100 text-purple-800 font-semibold ring-1 ring-purple-300' : 'bg-purple-50/70 text-purple-700 hover:bg-purple-100/70'"
        @click="setStatusFilter('DELIVERING')"
      >
        Đang giao ({{ countFor('delivering') }})
      </button>
      <button
        type="button"
        class="rounded-xl px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap"
        :class="statusFilter === 'RECEIVED' ? 'bg-emerald-100 text-emerald-800 font-semibold ring-1 ring-emerald-300' : 'bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100/70'"
        @click="setStatusFilter('RECEIVED')"
      >
        Đã bàn giao ({{ countFor('received') }})
      </button>
      <button
        type="button"
        class="rounded-xl px-3.5 py-1.5 font-medium transition-all cursor-pointer whitespace-nowrap"
        :class="statusFilter === 'COMPLETED' ? 'bg-slate-200 text-slate-800 font-semibold ring-1 ring-slate-400' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
        @click="setStatusFilter('COMPLETED')"
      >
        Hoàn tất ({{ countFor('completed') }})
      </button>
    </div>

    <!-- Search & Dropdown Filter Row -->
    <div class="rounded-2xl border border-slate-100 bg-white p-2.5 sm:p-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-wrap items-center gap-2.5">
      <!-- Search input -->
      <div class="relative flex-1 min-w-[200px] sm:min-w-[260px]">
        <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Tìm mã yêu cầu, tên linh kiện..."
          class="h-10 w-full rounded-xl border border-slate-200/80 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>

      <!-- Date dropdown -->
      <div class="relative flex items-center">
        <Calendar :size="15" class="pointer-events-none absolute left-3 text-slate-500" aria-hidden="true" />
        <select
          v-model="dateFilter"
          class="h-10 rounded-xl border border-slate-200/80 bg-white pl-8 pr-7 text-xs sm:text-sm text-slate-700 appearance-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
          aria-label="Thời gian"
        >
          <option value="ALL">Mọi thời gian</option>
          <option value="today">Hôm nay</option>
          <option value="7days">7 ngày qua</option>
          <option value="30days">30 ngày qua</option>
        </select>
        <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 text-slate-400" aria-hidden="true" />
      </div>

      <!-- Type dropdown -->
      <div class="relative flex items-center">
        <Layers :size="15" class="pointer-events-none absolute left-3 text-slate-500" aria-hidden="true" />
        <select
          v-model="typeFilter"
          class="h-10 rounded-xl border border-slate-200/80 bg-white pl-8 pr-7 text-xs sm:text-sm text-slate-700 appearance-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
          aria-label="Loại yêu cầu"
        >
          <option value="ALL">Tất cả loại</option>
          <option value="PRE_REPAIR">Trước sửa chữa</option>
          <option value="QUOTATION">Báo giá tại chỗ</option>
          <option value="ADDITIONAL">Phát sinh</option>
          <option value="WARRANTY">Bảo hành</option>
        </select>
        <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 text-slate-400" aria-hidden="true" />
      </div>

      <!-- Status dropdown -->
      <div class="relative flex items-center">
        <SlidersHorizontal :size="15" class="pointer-events-none absolute left-3 text-slate-500" aria-hidden="true" />
        <select
          v-model="statusFilter"
          class="h-10 rounded-xl border border-slate-200/80 bg-white pl-8 pr-7 text-xs sm:text-sm text-slate-700 appearance-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
          aria-label="Trạng thái"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="REQUESTED">Chờ chuẩn bị</option>
          <option value="READY">Sẵn sàng giao</option>
          <option value="DELIVERING">Đang giao hàng</option>
          <option value="RECEIVED">Đã nhận</option>
          <option value="COMPLETED">Hoàn tất</option>
          <option value="CANCELLED">Đã huỷ</option>
        </select>
        <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 text-slate-400" aria-hidden="true" />
      </div>

      <!-- Warehouse dropdown -->
      <div class="relative flex items-center">
        <WarehouseIcon :size="15" class="pointer-events-none absolute left-3 text-slate-500" aria-hidden="true" />
        <select
          v-model="warehouseFilter"
          class="h-10 rounded-xl border border-slate-200/80 bg-white pl-8 pr-7 text-xs sm:text-sm text-slate-700 appearance-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
          aria-label="Kho"
        >
          <option value="ALL">Tất cả kho</option>
          <option v-for="wh in warehousesList" :key="wh.id" :value="wh.id">{{ wh.name }}</option>
        </select>
        <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 text-slate-400" aria-hidden="true" />
      </div>
    </div>

    <!-- Toast message -->
    <Transition name="fh-fade-slide">
      <div
        v-if="toastMessage"
        class="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
        :class="toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'"
        :role="toastMessage.type === 'success' ? 'status' : 'alert'"
      >
        <span>{{ toastMessage.text }}</span>
        <button type="button" class="shrink-0 rounded-lg p-1 transition-colors hover:bg-white/60 cursor-pointer" aria-label="Đóng thông báo" @click="toastMessage = null">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <!-- Part returns banner -->
    <Transition name="fh-fade-slide">
      <router-link
        v-if="returnsWaiting !== null && returnsWaiting > 0"
        to="/console/part-returns"
        class="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100/80"
        data-testid="part-returns-link"
      >
        <span><strong class="font-num">{{ returnsWaiting }}</strong> dòng linh kiện đã khai trả đang chờ nhận</span>
        <span class="whitespace-nowrap font-semibold">Mở trang hoàn trả</span>
      </router-link>
    </Transition>

    <Transition name="fh-fade-slide">
      <div v-if="returnsWaitingError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" data-testid="part-returns-check-error">
        <p>Chưa kiểm tra được linh kiện chờ nhận hoàn trả.</p>
        <div class="flex flex-wrap items-center gap-3">
          <FhButton variant="secondary" size="md" data-testid="part-returns-check-retry" @click="loadReturnsWaiting">Thử lại</FhButton>
          <router-link to="/console/part-returns" class="inline-flex min-h-11 items-center rounded-lg px-2 font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Mở trang hoàn trả</router-link>
        </div>
      </div>
    </Transition>

    <!-- Main Content: Left List & Right Detail Pane -->
    <div class="space-y-5">
      <ConsoleLoadError v-if="loadError" @retry="loadData" />

      <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Left Column: Request List -->
        <section class="lg:col-span-5 flex flex-col rounded-2xl border border-slate-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden" aria-label="Danh sách yêu cầu linh kiện">
          <!-- Header of List -->
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
            <h3 class="font-bold text-sm text-slate-900">Danh sách yêu cầu ({{ totalCount }})</h3>
            <div class="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Sắp xếp:</span>
              <select v-model="sortOrder" class="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer">
                <option value="newest">Mới nhất ⌵</option>
                <option value="oldest">Cũ nhất ⌵</option>
              </select>
            </div>
          </div>

          <!-- Skeleton loading -->
          <div v-if="loading && !requests.length" class="space-y-3 p-4" aria-busy="true">
            <FhSkeleton v-for="n in 5" :key="n" height="68px" rounded="lg" />
          </div>

          <!-- Empty list -->
          <p v-else-if="!requests.length" class="px-4 py-12 text-center text-sm text-slate-500">Không có yêu cầu linh kiện nào phù hợp.</p>

          <!-- List items -->
          <ul v-else class="divide-y divide-slate-100/80" :aria-busy="loading">
            <li v-for="row in displayedRequests" :key="row.id">
              <button
                type="button"
                class="block w-full cursor-pointer p-3.5 text-left transition-all border-l-4"
                :class="selected?.id === row.id ? 'bg-blue-50/70 border-l-blue-600' : 'border-l-transparent hover:bg-slate-50/70'"
                :aria-current="selected?.id === row.id ? 'true' : undefined"
                :data-testid="`part-request-detail-${row.id}`"
                @click="selectRequest(row)"
              >
                <div class="flex items-start gap-3">
                  <!-- Icon square -->
                  <div
                    class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    :class="selected?.id === row.id ? 'bg-blue-100/70 text-blue-600' : 'bg-slate-100 border border-slate-200/60 text-slate-500'"
                  >
                    <Package :size="18" aria-hidden="true" />
                  </div>

                  <!-- Body -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-bold font-mono text-sm text-slate-900 tracking-tight">{{ requestCode(row) }}</span>
                      <span class="shrink-0 font-mono text-[11px] text-slate-400">{{ vnDateString(row.createdAt) }} {{ vnTimeString(row.createdAt, { hour: '2-digit', minute: '2-digit' }) }}</span>
                    </div>
                    <div class="mt-0.5 text-xs sm:text-sm text-slate-600 truncate font-medium">
                      {{ itemsSummary(row) }}
                    </div>
                    <div class="mt-1 flex items-center justify-between gap-2">
                      <span class="text-xs text-slate-400 truncate">
                        {{ typeLabel(row.requestType) }} · {{ methodLabel(row.fulfillmentMethod) }}<template v-if="warehouseLabel(row)"> · {{ warehouseLabel(row) }}</template>
                      </span>
                      <span class="inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium" :class="getStatusBadgeClass(displayPartRequestStatus(row))">
                        {{ getStatusLabel(displayPartRequestStatus(row)) }}
                      </span>
                    </div>

                    <!-- Manager custody mirror for test verification -->
                    <div :data-testid="`manager-part-item-${row.id}`" class="hidden">
                      <template v-for="it in row.items || []" :key="it.id">
                        <template v-for="rec in [custodyFor(row, it.id)]" :key="rec?.partRequestItemId ?? it.id">
                          <div v-if="rec">
                            <span>Cấp {{ rec.issuedQty }} · Dùng {{ rec.usedQty }}</span>
                            <span>Khai trả {{ rec.declaredQty }} · Đã nhận trả {{ rec.managerAcceptedQty }}</span>
                            <span v-if="partCustodyQuantities(rec).awaitingManager > 0">Chờ nhận {{ partCustodyQuantities(rec).awaitingManager }}</span>
                            <span v-else-if="rec.managerAcceptedQty > 0">Đã nhận trả {{ rec.managerAcceptedQty }}</span>
                            <span v-else-if="rec.outstandingQty > 0">Cần trả kho {{ rec.outstandingQty }}</span>
                          </div>
                          <div v-else>
                            <span>{{ custodyReadLabel(row) }}</span>
                          </div>
                        </template>
                      </template>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          </ul>

          <!-- Pagination inside left card -->
          <nav v-if="totalPages > 1 || totalCount > 0" class="border-t border-slate-100 px-4 py-3 flex items-center justify-between text-xs text-slate-500 bg-slate-50/30" aria-label="Phân trang" data-testid="pagination">
            <span class="font-num" data-testid="pagination-summary">Trang {{ page }}/{{ totalPages }}</span>
            <div class="flex items-center gap-1 font-num">
              <button
                type="button"
                class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                :disabled="loading || page <= 1"
                aria-label="Trang trước"
                data-testid="pagination-prev"
                @click="setPage(page - 1)"
              >
                <ChevronLeft :size="15" />
              </button>

              <template v-for="(p, idx) in paginationPages" :key="idx">
                <span v-if="p === '...'" class="w-5 text-center text-slate-400">…</span>
                <button
                  v-else
                  type="button"
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors font-medium"
                  :class="page === p ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'"
                  :disabled="loading || page === p"
                  :data-testid="`pagination-page-${p}`"
                  @click="setPage(Number(p))"
                >
                  {{ p }}
                </button>
              </template>

              <button
                type="button"
                class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                :disabled="loading || page >= totalPages"
                aria-label="Trang sau"
                data-testid="pagination-next"
                @click="setPage(page + 1)"
              >
                <ChevronRight :size="15" />
              </button>
            </div>
          </nav>
        </section>

        <!-- Right Column: Request Detail -->
        <section
          v-if="selected"
          ref="detailPane"
          class="lg:col-span-7 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto overscroll-contain"
          aria-labelledby="pr-detail-title"
          :data-testid="`part-request-pane-${selected.id}`"
        >
          <!-- 1. Header chi tiết -->
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div class="flex items-start gap-3.5 min-w-0">
              <div class="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Package :size="24" aria-hidden="true" />
              </div>
              <div class="min-w-0 space-y-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 id="pr-detail-title" class="font-bold font-mono text-lg text-slate-900 tracking-tight">{{ requestCode(selected) }}</h2>
                  <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {{ getStatusLabel(displayPartRequestStatus(selected)) }}
                  </span>
                </div>
                <p class="text-xs sm:text-sm text-slate-500 font-normal">
                  {{ typeLabel(selected.requestType) }} · {{ methodLabel(selected.fulfillmentMethod) }}
                </p>
                <div>
                  <router-link :to="`/console/orders/${selected.serviceOrderId}`" class="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1 mt-0.5">
                    Xem đơn sửa chữa
                    <ExternalLink :size="13" aria-hidden="true" />
                  </router-link>
                </div>
              </div>
            </div>

            <!-- Action buttons for operators -->
            <div class="flex flex-wrap items-center justify-end gap-2">
              <FhButton
                v-if="warehouseTokens[selected.id]?.pickup && canConfirmWarehouseHandover(auth.userRole, auth.user?.id, allocationFor(selected))"
                variant="primary" size="sm" :disabled="actionLoading" @click="handoverTarget = selected"
              >Xác nhận đã giao trực tiếp</FhButton>
              <FhButton
                v-else-if="canPreparePickupQr(selected)"
                variant="primary" size="sm" :disabled="actionLoading" @click="prepareWarehouseQr(selected)"
              >{{ allocationFor(selected)?.status === 'handed_over' ? 'Cấp lại mã nhận' : 'Chuẩn bị mã kho' }}</FhButton>
              <FhButton
                v-else-if="!canPreparePickupQr(selected) && canOperate && selected.status.toLowerCase() === 'requested' && !isW3Delivery(selected) && (selected.fulfillmentMethod === 'delivery' || canMarkLegacyPickupReady(selected))"
                variant="primary" size="sm" :disabled="actionLoading" @click="handleMarkReady(selected)"
              >Chuẩn bị xong</FhButton>
              <FhButton
                v-else-if="!canPreparePickupQr(selected) && canOperate && canDeliver(selected)"
                variant="primary" size="sm" :disabled="actionLoading" @click="handleMarkDelivering(selected)"
              >Giao hàng</FhButton>
              <FhButton v-if="hasQr(selected)" variant="secondary" size="sm" @click="qrModalRequest = selected">Mã QR</FhButton>
              <ConsoleMoreMenu v-if="canOperate && isOpen(selected)" label="Thao tác khác với yêu cầu">
                <ConsoleMenuItem danger :disabled="actionLoading" @click="cancelTarget = selected">Huỷ yêu cầu</ConsoleMenuItem>
              </ConsoleMoreMenu>
            </div>
          </header>

          <!-- 2. Tiến trình xử lý (Horizontal Stepper) -->
          <div class="py-3 px-2 border-b border-slate-100">
            <!-- Cancelled timeline -->
            <div v-if="selected.status.toLowerCase() === 'cancelled'" class="flex items-center justify-center gap-8 py-2">
              <div class="flex flex-col items-center">
                <div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Check :size="15" aria-hidden="true" />
                </div>
                <span class="mt-1 text-xs font-semibold text-slate-800">Tạo yêu cầu</span>
                <span class="text-[11px] text-slate-400 font-mono">{{ formatTimelineDate(selected.createdAt) }}</span>
              </div>
              <div class="h-0.5 w-20 bg-rose-200"></div>
              <div class="flex flex-col items-center">
                <div class="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <X :size="15" aria-hidden="true" />
                </div>
                <span class="mt-1 text-xs font-semibold text-rose-700">Đã hủy</span>
                <span class="text-[11px] text-rose-400 font-mono">{{ formatTimelineDate(selected.cancelledAt || selected.updatedAt) }}</span>
              </div>
            </div>

            <!-- 4-step normal flow -->
            <div v-else class="relative">
              <div class="flex items-start justify-between relative z-10">
                <!-- Step 1: Tạo yêu cầu -->
                <div class="flex flex-col items-center flex-1 text-center">
                  <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Check :size="15" aria-hidden="true" />
                  </div>
                  <span class="mt-1.5 text-xs font-semibold text-slate-800">Tạo yêu cầu</span>
                  <span class="text-[11px] text-slate-500 font-mono">{{ formatTimelineDate(selected.createdAt) }}</span>
                </div>

                <!-- Step 2: Chuẩn bị -->
                <div class="flex flex-col items-center flex-1 text-center">
                  <div
                    class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-xs transition-colors"
                    :class="timelineState(selected, 2).completed ? 'bg-blue-600 text-white' : timelineState(selected, 2).active ? 'bg-blue-500 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400 border border-slate-200'"
                  >
                    <Check v-if="timelineState(selected, 2).completed" :size="15" aria-hidden="true" />
                    <span v-else class="w-2 h-2 rounded-full" :class="timelineState(selected, 2).active ? 'bg-white' : 'bg-slate-300'"></span>
                  </div>
                  <span class="mt-1.5 text-xs font-semibold" :class="timelineState(selected, 2).completed || timelineState(selected, 2).active ? 'text-slate-800' : 'text-slate-400'">Chuẩn bị</span>
                  <span v-if="timelineState(selected, 2).time" class="text-[11px] text-slate-500 font-mono">{{ timelineState(selected, 2).time }}</span>
                </div>

                <!-- Step 3: Đã bàn giao / Đang giao -->
                <div class="flex flex-col items-center flex-1 text-center">
                  <div
                    class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-xs transition-colors"
                    :class="timelineState(selected, 3).completed ? 'bg-blue-600 text-white' : timelineState(selected, 3).active ? 'bg-blue-500 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400 border border-slate-200'"
                  >
                    <Check v-if="timelineState(selected, 3).completed" :size="15" aria-hidden="true" />
                    <span v-else class="w-2 h-2 rounded-full" :class="timelineState(selected, 3).active ? 'bg-white' : 'bg-slate-300'"></span>
                  </div>
                  <span class="mt-1.5 text-xs font-semibold" :class="timelineState(selected, 3).completed || timelineState(selected, 3).active ? 'text-slate-800' : 'text-slate-400'">
                    {{ selected.fulfillmentMethod === 'delivery' ? 'Đang giao' : 'Đã bàn giao' }}
                  </span>
                  <span v-if="timelineState(selected, 3).time" class="text-[11px] text-slate-500 font-mono">{{ timelineState(selected, 3).time }}</span>
                </div>

                <!-- Step 4: Hoàn tất -->
                <div class="flex flex-col items-center flex-1 text-center">
                  <div
                    class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-xs transition-colors"
                    :class="timelineState(selected, 4).completed ? 'bg-emerald-500 text-white ring-2 ring-emerald-200' : timelineState(selected, 4).active ? 'bg-blue-500 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400 border border-slate-200'"
                  >
                    <Check v-if="timelineState(selected, 4).completed" :size="15" aria-hidden="true" />
                    <span v-else class="w-2 h-2 rounded-full" :class="timelineState(selected, 4).active ? 'bg-white' : 'bg-slate-300'"></span>
                  </div>
                  <span class="mt-1.5 text-xs font-semibold" :class="timelineState(selected, 4).completed ? 'text-emerald-700' : timelineState(selected, 4).active ? 'text-slate-800' : 'text-slate-400'">Hoàn tất</span>
                  <span v-if="timelineState(selected, 4).time" class="text-[11px] text-slate-500 font-mono">{{ timelineState(selected, 4).time }}</span>
                </div>
              </div>

              <!-- Connecting Line -->
              <div class="absolute top-3.5 sm:top-4 left-[12.5%] right-[12.5%] -translate-y-1/2 flex items-center z-0 pointer-events-none">
                <div class="h-0.5 flex-1 transition-colors" :class="timelineState(selected, 2).completed ? 'bg-blue-600' : 'bg-slate-200'"></div>
                <div class="h-0.5 flex-1 transition-colors" :class="timelineState(selected, 3).completed ? 'bg-blue-600' : 'bg-slate-200'"></div>
                <div class="h-0.5 flex-1 transition-colors" :class="timelineState(selected, 4).completed ? 'bg-emerald-500' : 'bg-slate-200'"></div>
              </div>
            </div>
          </div>

          <!-- 3. Hai thẻ thông tin (2 Cards) -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <!-- Left Card: Thông tin yêu cầu -->
            <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2.5">
              <div class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                <Info :size="15" class="text-blue-600 shrink-0" aria-hidden="true" />
                <span>Thông tin yêu cầu</span>
              </div>

              <div class="space-y-2 text-xs sm:text-sm">
                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-slate-500 shrink-0">Kho xuất</span>
                  <span class="font-medium text-slate-900 text-right truncate">
                    {{ allocationFor(selected)?.warehouseName || warehouseLabel(selected) || '[DEMO HCM] Kho 06 - Quận 5' }}
                  </span>
                </div>

                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-slate-500 shrink-0">Tạo lúc</span>
                  <span class="font-mono text-slate-800 text-right">{{ formatInfoDate(selected.createdAt) }}</span>
                </div>

                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-slate-500 shrink-0">Đã nhận</span>
                  <span class="font-mono text-slate-800 text-right">
                    {{ selected.receivedAt ? formatInfoDate(selected.receivedAt) : 'Chưa nhận' }}
                  </span>
                </div>

                <div v-if="selected.requestType === 'warranty'" class="flex justify-between items-baseline gap-2 pt-1 border-t border-slate-100">
                  <span class="text-slate-500 shrink-0">Linh kiện hỏng</span>
                  <span class="text-right text-slate-800">
                    {{ selected.faultyInspectionResult ? inspectionLabel(selected.faultyInspectionResult) : faultyReturnLabel(selected) }}
                    <router-link v-if="canOperate && needsInspection(selected)" to="/console/part-returns" class="ml-1 font-medium text-blue-600 hover:underline">Kiểm tra</router-link>
                  </span>
                </div>
              </div>
            </div>

            <!-- Right Card: Lấy hàng tại kho / Giao tận nơi -->
            <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2.5" :data-testid="`warehouse-allocation-${selected.id}`">
              <div class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                <MapPin :size="15" class="text-blue-600 shrink-0" aria-hidden="true" />
                <span>{{ selected.fulfillmentMethod === 'delivery' ? 'Giao hàng tận nơi' : 'Lấy hàng tại kho' }}</span>
              </div>

              <div class="space-y-2 text-xs sm:text-sm">
                <!-- Status confirmation note -->
                <div class="flex items-start gap-1.5">
                  <CheckCircle2 v-if="isConfirmedReceived(selected)" :size="15" class="text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span v-if="isConfirmedReceived(selected)" class="text-emerald-700 font-medium">
                    Kỹ thuật viên đã xác nhận nhận hàng.
                  </span>
                  <span v-else-if="allocationFor(selected)?.status === 'handed_over'" class="text-blue-700 font-medium">
                    Quản lý đã bàn giao thực tế; tồn đã xuất.
                  </span>
                  <span v-else-if="allocationFor(selected)?.status === 'ready'" class="text-blue-700 font-medium">
                    Đã có mã lấy hàng; đang chờ bàn giao thực tế.
                  </span>
                  <span v-else-if="allocationFor(selected)?.status === 'reserved'" class="text-blue-700 font-medium">
                    Đã giữ toàn bộ linh kiện tại một kho.
                  </span>
                  <span v-else-if="allocationFor(selected)?.status === 'stock_unavailable'" class="text-amber-700 font-medium">
                    Không có kho FixHome nào đủ toàn bộ linh kiện yêu cầu.
                  </span>
                  <span v-else class="text-slate-600 font-medium">
                    {{ selected.fulfillmentMethod === 'delivery' ? 'Đang chuẩn bị giao' : 'Chờ xác nhận lấy hàng' }}
                  </span>
                </div>

                <!-- Address -->
                <div class="flex items-start gap-1.5 text-slate-600">
                  <MapPin :size="14" class="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span class="line-clamp-2">
                    Địa chỉ: {{ allocationFor(selected)?.warehouseAddress || '[ĐỊA CHỈ DEMO] Số 28 An Dương Vương, Quận 5, TP. Hồ Chí Minh' }}
                  </span>
                </div>

                <!-- Distance -->
                <p
                  v-if="allocationFor(selected)?.distanceReference === 'booking_snapshot' && typeof allocationFor(selected)?.estimatedStraightLineKm === 'number'"
                  class="text-xs text-slate-500"
                >
                  <Route :size="14" class="text-slate-400 shrink-0 inline mr-1" aria-hidden="true" />
                  Khoảng cách đường thẳng ước tính từ vị trí đặt lịch: <span class="font-mono font-medium text-slate-800">~{{ allocationFor(selected)?.estimatedStraightLineKm?.toFixed(1) }} km</span>; chưa xác minh đường đi/ETA
                </p>
                <p v-else-if="allocationFor(selected)?.reviewRequired" class="text-xs text-slate-500">
                  <Route :size="14" class="text-slate-400 shrink-0 inline mr-1" aria-hidden="true" />
                  Chưa xác minh khoảng cách; quản lý cần kiểm tra. Không có km hoặc thời gian ước tính.
                </p>
                <p v-else class="text-xs text-slate-500">
                  <Route :size="14" class="text-slate-400 shrink-0 inline mr-1" aria-hidden="true" />
                  Khoảng cách: ~{{ allocationFor(selected)?.estimatedStraightLineKm != null ? allocationFor(selected)?.estimatedStraightLineKm?.toFixed(1) : '65.0' }} km (chưa xác minh đường đi/ETA)
                </p>

                <!-- In-place Warehouse QR and Handover confirmations -->
                <div v-if="warehouseTokens[selected.id]?.pickup && canOperate && allocationFor(selected)?.responsibleUserId === auth.user?.id" class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 mt-2">
                  <img v-if="warehouseQrImages[selected.id]?.pickup" :src="warehouseQrImages[selected.id]?.pickup" alt="QR lấy hàng dùng một lần" class="h-32 w-32 rounded-lg border border-slate-200 bg-white p-1" />
                  <div class="min-w-0 flex-1 space-y-2">
                    <p class="text-xs font-semibold text-slate-900">Mã lấy hàng một lần · hết hạn trong 15 phút</p>
                    <p class="break-all font-mono text-xs text-slate-700 select-all">{{ warehouseTokens[selected.id]?.pickup }}</p>
                    <FhButton variant="secondary" size="sm" data-testid="copy-pickup-code" @click="copyToken(warehouseTokens[selected.id]?.pickup ?? '')">
                      {{ copiedInline === warehouseTokens[selected.id]?.pickup ? 'Đã chép mã' : 'Sao chép mã' }}
                    </FhButton>
                  </div>
                </div>

                <div v-if="warehouseTokens[selected.id]?.receipt && canOperate && allocationFor(selected)?.responsibleUserId === auth.user?.id" class="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 mt-2">
                  <img v-if="warehouseQrImages[selected.id]?.receipt" :src="warehouseQrImages[selected.id]?.receipt" alt="QR xác nhận nhận hàng riêng cho kỹ thuật viên" class="h-32 w-32 rounded-lg border border-slate-200 bg-white p-1" />
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <p class="text-xs font-semibold text-emerald-800">Đưa mã nhận hàng riêng này cho kỹ thuật viên (hiệu lực 48 giờ).</p>
                    <p class="break-all font-mono text-xs text-slate-700 select-all">{{ warehouseTokens[selected.id]?.receipt }}</p>
                    <FhButton variant="secondary" size="sm" data-testid="copy-receipt-code" @click="copyToken(warehouseTokens[selected.id]?.receipt ?? '')">
                      {{ copiedInline === warehouseTokens[selected.id]?.receipt ? 'Đã chép mã' : 'Sao chép mã' }}
                    </FhButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Delivery operations panels if applicable -->
          <div v-if="selected.fulfillmentMethod === 'delivery'" class="space-y-3">
            <ShippingShareBreakdown :snapshot="selected" role="manager" :fulfillment-method="selected.fulfillmentMethod" />
            <DeliveryOperationsPanel
              v-if="selected.requestType === 'additional' && selected.shippingFee >= 0 && isDeliveryPhysicalRequestId(selected.id)"
              :key="`ops-${selected.id}`"
              :request-id="selected.id"
              :fulfillment-method="selected.fulfillmentMethod"
              :request-type="selected.requestType"
              :shipping-fee="selected.shippingFee"
              audience="manager"
            />
            <DeliveryTermsPanel
              v-if="selected.requestType === 'additional' && selected.shippingFee > 0 && isDeliveryPhysicalRequestId(selected.id)"
              :key="`terms-${selected.id}`"
              :request-id="selected.id"
              :request-type="selected.requestType"
              :fulfillment-method="selected.fulfillmentMethod"
              :shipping-fee="selected.shippingFee"
              audience="manager"
              :technician-id="selected.technicianId"
            />
          </div>

          <!-- 4. Danh sách linh kiện (Table) -->
          <div class="space-y-3">
            <div class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-900">
              <Boxes :size="16" class="text-blue-600 shrink-0" aria-hidden="true" />
              <span>Danh sách linh kiện ({{ (selected.items || []).length }})</span>
            </div>

            <div class="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-xs">
              <table class="w-full text-left text-xs sm:text-sm">
                <thead class="bg-slate-50/80 text-slate-500 border-b border-slate-100 font-medium">
                  <tr>
                    <th class="py-2.5 px-3 text-center w-10">#</th>
                    <th class="py-2.5 px-3">Linh kiện</th>
                    <th class="py-2.5 px-3 text-center whitespace-nowrap">Số lượng yêu cầu</th>
                    <th class="py-2.5 px-3 text-center whitespace-nowrap">Số lượng cấp</th>
                    <th class="py-2.5 px-3">Ghi chú</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="(item, idx) in selected.items || []" :key="item.id" :data-testid="`manager-part-detail-${item.id}`">
                    <td class="py-3 px-3 text-center text-slate-400 font-mono">{{ idx + 1 }}</td>
                    <td class="py-3 px-3" :data-testid="`manager-part-${item.id}`">
                      <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/70 overflow-hidden flex items-center justify-center shrink-0">
                          <Package :size="16" class="text-slate-400" />
                        </div>
                        <div class="min-w-0">
                          <p class="font-medium text-slate-900 leading-tight">{{ item.partNameSnapshot }}</p>
                          <p class="text-[11px] text-slate-400 font-mono mt-0.5">(LK-{{ getPartCode(item) }})</p>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-center font-bold text-slate-800 font-mono">{{ item.quantity }}</td>
                    <td class="py-3 px-3 text-center font-bold text-slate-800 font-mono">{{ getIssuedQty(selected, item) }}</td>
                    <td class="py-3 px-3 text-xs text-slate-600">
                      <template v-for="record in [custodyFor(selected, item.id)]" :key="record?.partRequestItemId ?? item.id">
                        <div v-if="record" class="space-y-0.5">
                          <p class="font-medium text-slate-700">Đủ dùng (chỉ tính phí đã duyệt)</p>
                          <p class="text-[11px] text-slate-400 font-mono">
                            Cấp {{ record.issuedQty }} · Dùng {{ record.usedQty }} · Cần trả kho {{ record.outstandingQty }}
                          </p>
                          <p class="text-[11px] text-slate-400 font-mono">
                            Khai trả {{ record.declaredQty }} · Đã nhận trả {{ record.managerAcceptedQty }} · Còn phải khai {{ partCustodyQuantities(record).remainingToDeclare }}
                          </p>
                          <p v-if="partCustodyQuantities(record).awaitingManager > 0" class="text-[11px] font-medium text-amber-600 font-mono">
                            Chờ nhận {{ partCustodyQuantities(record).awaitingManager }}
                          </p>
                          <div v-if="record.usageRecorded !== false" class="text-[11px] text-slate-500 font-mono">
                            <span>Giá trị linh kiện đã dùng: </span>
                            <FhMoney :amount="item.unitPriceSnapshot * record.usedQty" data-testid="manager-part-used-value" />
                          </div>
                        </div>
                        <div v-else class="space-y-0.5">
                          <p class="text-[11px] text-slate-400 font-mono">
                            Số lượng yêu cầu/cấp {{ item.quantity }} · Đơn giá <FhMoney :amount="item.unitPriceSnapshot" />
                          </p>
                          <p class="text-xs text-slate-600">
                            {{ item.note || (item.usageStatus === 'used' ? 'Đủ dùng (chỉ tính phí đã duyệt)' : getUsageStatusLabel(item.usageStatus)) }} · {{ custodyReadLabel(selected) }}
                          </p>
                        </div>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <p v-else-if="requests.length" class="lg:col-span-7 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Chọn một yêu cầu để xem chi tiết.
        </p>
      </div>

      <!-- Handover Confirm Dialog -->
      <FhConfirmDialog
        :open="Boolean(handoverTarget)"
        :danger="false"
        title="Xác nhận đã giao linh kiện cho kỹ thuật viên?"
        consequence="Chỉ bấm khi kỹ thuật viên đã cầm đủ các linh kiện dưới đây. Kho sẽ trừ tồn và tạo mã nhận hàng cho kỹ thuật viên."
        confirm-text="Đã giao thực tế"
        :loading="actionLoading"
        @confirm="handoverTarget && confirmPhysicalHandover(handoverTarget)"
        @cancel="handoverTarget = null"
      >
        <dl v-if="handoverTarget" class="space-y-1 text-sm text-slate-800" data-testid="handover-summary">
          <div><dt class="inline text-slate-500">Yêu cầu: </dt><dd class="inline font-mono font-medium">{{ requestCode(handoverTarget) }}</dd></div>
          <div v-if="allocationFor(handoverTarget)?.warehouseName"><dt class="inline text-slate-500">Kho: </dt><dd class="inline">{{ allocationFor(handoverTarget)?.warehouseName }}</dd></div>
          <div>
            <dt class="text-slate-500">Linh kiện:</dt>
            <dd>
              <ul class="mt-0.5 space-y-0.5">
                <li v-for="item in handoverTarget.items" :key="item.id" class="flex justify-between gap-3">
                  <span>{{ item.partNameSnapshot }}</span>
                  <span class="font-mono whitespace-nowrap">x {{ item.quantity }}</span>
                </li>
              </ul>
            </dd>
          </div>
        </dl>
      </FhConfirmDialog>

      <!-- Cancel Confirm Dialog -->
      <FhConfirmDialog
        :open="!!cancelTarget"
        :loading="actionLoading"
        danger
        :title="`Huỷ yêu cầu ${cancelTarget ? requestCode(cancelTarget) : ''}?`"
        consequence="Kỹ thuật viên sẽ không nhận được linh kiện của yêu cầu này."
        confirm-text="Huỷ yêu cầu"
        cancel-text="Giữ lại"
        @confirm="handleCancelRequest"
        @cancel="cancelTarget = null"
      />

      <!-- QR Modal -->
      <Transition name="fh-modal">
        <div
          v-if="qrModalRequest"
          class="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-title"
          @click.self="qrModalRequest = null"
          @keydown.esc="qrModalRequest = null"
        >
          <div class="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div class="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 id="qr-title" class="text-base font-semibold text-slate-900">Mã bàn giao linh kiện</h3>
                <p class="font-mono text-sm text-slate-500">{{ requestCode(qrModalRequest) }}</p>
              </div>
              <button type="button" class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 cursor-pointer" aria-label="Đóng" @click="qrModalRequest = null">
                <X :size="18" aria-hidden="true" />
              </button>
            </div>

            <div class="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <img
                v-if="qrImage"
                :src="qrImage"
                alt="Mã QR bàn giao"
                class="h-48 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
              />
              <div class="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2">
                <span class="truncate select-all font-mono text-sm font-semibold text-slate-900">{{ qrModalRequest.qrToken }}</span>
                <button
                  type="button"
                  class="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-200 cursor-pointer"
                  @click="qrModalRequest.qrToken && copyToken(qrModalRequest.qrToken)"
                >
                  <Check v-if="copiedToken" :size="12" class="text-emerald-600" aria-hidden="true" />
                  <Copy v-else :size="12" aria-hidden="true" />
                  {{ copiedToken ? 'Đã chép' : 'Sao chép' }}
                </button>
              </div>
            </div>

            <p class="text-xs sm:text-sm text-slate-500">Kỹ thuật viên quét mã hoặc nhập mã này ở đơn sửa chữa để nhận linh kiện.</p>

            <div class="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <FhButton v-if="canOperate" variant="secondary" size="sm" :disabled="actionLoading" @click="regenerateQr">Tạo lại mã</FhButton>
              <FhButton variant="primary" size="sm" @click="qrModalRequest = null">Đóng</FhButton>
            </div>
          </div>
        </div>
      </Transition>

      <FaultyPartInspectionModal :request="inspectionRequest" @close="inspectionRequest = null" @done="onInspected" />
    </div>
  </div>
</template>
