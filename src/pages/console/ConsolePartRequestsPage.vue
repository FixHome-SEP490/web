<script setup lang="ts">
import { displayPartRequestStatus, isW3Delivery } from '../../utils/w3-delivery-stage';
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useAuthStore } from '../../stores/auth';
import { Copy, Check, X } from 'lucide-vue-next';
import { FhMoney, FhButton, FhConfirmDialog, FhSkeleton } from '../../components';
import ShippingShareBreakdown from '../../components/ShippingShareBreakdown.vue';
import DeliveryOperationsPanel from '../../components/DeliveryOperationsPanel.vue';
import DeliveryTermsPanel from '../../components/DeliveryTermsPanel.vue';
import { isDeliveryPhysicalRequestId } from '../../api/w3-delivery-physical.api';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import FaultyPartInspectionModal from '../../components/console/FaultyPartInspectionModal.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import { consoleField } from '../../components/console/console-ui';
import {
  partRequestsApi,
  type WarehouseAllocation,
  type PartRequest,
  type PartRequestStatus,
  type PartRequestType,
  type FulfillmentMethod,
  type PartCustodyReturnRecord,
  isPartReturnsUnavailableError,
} from '../../api/part-requests.api';
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

const qrModalRequest = ref<PartRequest | null>(null);
const inspectionRequest = ref<PartRequest | null>(null);
// BUG DETECTOR 258: the chosen request opens in the pane beside the list. It follows the row in
// `requests`, so a refreshed row updates the pane in place.
const selectedId = ref<string | null>(null);
const selected = computed(() => requests.value.find((row) => row.id === selectedId.value) ?? requests.value[0] ?? null);
const detailPane = ref<HTMLElement | null>(null);
function selectRequest(row: PartRequest) {
  selectedId.value = row.id;
  // Below the lg breakpoint the pane sits under the list.
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1023px)').matches) {
    requestAnimationFrame(() => detailPane.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }
}
const itemsSummary = (row: PartRequest) => {
  const items = row.items || [];
  if (!items.length) return 'Chưa có linh kiện';
  const first = `${items[0].partNameSnapshot} x ${items[0].quantity}`;
  return items.length > 1 ? `${first} và ${items.length - 1} linh kiện khác` : first;
};
// BUG DETECTOR 258: say which warehouse the parts leave from.
const warehouseLabel = (row: PartRequest) => {
  const allocation = allocationFor(row);
  return allocation?.mode === 'warehouse' && allocation.warehouseName ? allocation.warehouseName : '';
};
const cancelTarget = ref<PartRequest | null>(null);
const copiedToken = ref(false);
const allocations = ref<Record<string, WarehouseAllocation | null>>({});
const allocationLoading = ref<Record<string, boolean>>({});
const allocationErrors = ref<Record<string, string>>({});
const warehouseTokens = ref<Record<string, { pickup: string | null; receipt: string | null }>>({});
const warehouseQrImages = ref<Record<string, { pickup: string; receipt: string }>>({});
const handoverTarget = ref<PartRequest | null>(null);

// Thợ đã khai trả, quản lý nhận ở trang Hoàn trả linh kiện (BUG DETECTOR 10); ở đây chỉ nhắc số dòng đang chờ.
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
/** Only the current server page, all its orders in one read (it was one read per order, 12/11/2026). */
async function loadVisibleCustody(rows: PartRequest[], pageVersion: number) {
  const version = ++custodyReadVersion;
  if (!canOperate.value) { custodyByOrder.value = {}; return; }
  const ids = [...new Set(rows.slice(0, pageSize)
    .filter(row => ['received', 'completed'].includes(row.status.toLowerCase()) && row.items.some(item => item.partSource === 'fixhome'))
    .map(row => row.serviceOrderId).filter(Boolean))];
  // Rows already read stay on screen while the new read runs; only new orders show loading.
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
  // BUG DETECTOR 90: the manager's queue already carries each row's allocation; only rows
  // without one (the admin's global list) are read one by one.
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
const allocationOwnerMismatch = (allocation: WarehouseAllocation) => canOperate.value && !!allocation.responsibleUserId && allocation.responsibleUserId !== auth.user?.id;
// A closed request (cancelled, completed) or a warranty one has no warehouse code to prepare or reissue: the server refuses it.
const canPreparePickupQr = (request: PartRequest) => {
  const allocation = allocationFor(request);
  return canOperate.value && warehouseQrOpen(request.status, request.requestType) && !!allocation && allocation.mode === 'warehouse' && !!warehouseQrAction(allocation.status) && allocation.responsibleUserId === auth.user?.id;
};

/** The warehouse commands answer with the allocation only; read the request back once so its status column follows without a page reload. */
async function refreshRequestRow(requestId: string) {
  const version = loadVersion;
  try {
    const fresh = await partRequestsApi.getById(requestId);
    if (version !== loadVersion) return;
    const current = requests.value.find((row) => row.id === requestId);
    if (!current) return;
    // The summary cards come from the list call; move this row between them so they match the table.
    const from = current.status.toLowerCase();
    const to = String(fresh.status ?? current.status).toLowerCase();
    const counts = serverStatusCounts.value;
    if (counts && from !== to) {
      serverStatusCounts.value = { ...counts, [from]: Math.max(0, (counts[from] ?? 0) - 1), [to]: (counts[to] ?? 0) + 1 };
    }
    replaceRow({ ...current, ...fresh, warehouseAllocation: fresh.warehouseAllocation ?? current.warehouseAllocation });
  } catch {
    // The command itself succeeded; the next list load shows the status.
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
    // SM 46 (F11/F12): a refusal or a lost answer does not say whether the server made a code.
    // Read the warehouse state back once instead of sending the command a second time.
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
  // The code is saved once the server answers. Drawing the QR image is display only and
  // must never turn an issued code into a reported failure.
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
    // The code is shown as text with a copy button under the box either way.
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
    // BUG DETECTOR 84: a refusal or a lost answer does not say what really happened. Read the
    // warehouse state back so the manager is told whether the parts are already handed over.
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
  // BUG DETECTOR 85: the handover is saved once the server answers. Drawing the QR is only
  // display and must never turn a done handover into a reported failure.
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
    // The code is shown as text under the box either way; the technician can type it.
    warehouseQrImages.value[request.id] = { pickup: '', receipt: '' };
  }
}

onMounted(() => {
  void loadData();
  void loadReturnsWaiting();
});
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

// BUG DETECTOR 89: totals over every request matching the filters, from the server, not the 20 rows on screen.
const serverStatusCounts = ref<Record<string, number> | null>(null);
const stats = computed(() => {
  const reqs = requests.value;
  const counts = serverStatusCounts.value;
  const count = (status: string) => counts ? (counts[status] ?? 0) : reqs.filter((r) => r.status.toLowerCase() === status).length;
  return [
    { key: 'requested', label: 'Chờ chuẩn bị', value: count('requested') },
    { key: 'ready', label: 'Sẵn sàng', value: count('ready') },
    { key: 'delivering', label: 'Đang giao', value: count('delivering') },
    { key: 'received', label: 'Đã bàn giao', value: count('received') },
    { key: 'completed', label: 'Hoàn tất', value: count('completed') },
  ];
});

const replaceRow = (updated: PartRequest) => {
  const idx = requests.value.findIndex((r) => r.id === updated.id);
  if (idx !== -1) requests.value[idx] = updated;
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

const copiedInline = ref<string | null>(null);
const copyToken = async (token: string) => {
  try {
    await navigator.clipboard.writeText(token);
    copiedToken.value = true;
    copiedInline.value = token;
    setTimeout(() => { copiedToken.value = false; if (copiedInline.value === token) copiedInline.value = null; }, 2000);
  } catch {
    // The code stays selectable when the clipboard is unavailable.
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

/** Short reference shown to staff and technicians ("PR-1A2B3C4D"). */
const requestCode = (req: PartRequest) => `PR-${req.id.substring(0, 8).toUpperCase()}`;
const isOpen = (req: PartRequest) => ['requested', 'ready', 'delivering'].includes(req.status.toLowerCase());
const hasQr = (req: PartRequest) => ['ready', 'delivering'].includes(req.status.toLowerCase()) && !!req.qrToken && (req.fulfillmentMethod === 'delivery' || allocationFor(req)?.mode === 'legacy');
const canDeliver = (req: PartRequest) => req.status.toLowerCase() === 'ready' && req.fulfillmentMethod === 'delivery';
const canMarkLegacyPickupReady = (req: PartRequest) => req.fulfillmentMethod === 'pickup' && allocationFor(req)?.mode === 'legacy';
const typeLabel = (type: string) => (type === 'pre_repair' ? 'Trước sửa chữa' : type === 'quotation' ? 'Báo giá tại chỗ' : type === 'warranty' ? 'Bảo hành' : 'Phát sinh');
// The technician takes the new part first and brings the faulty one back later; the manager inspects it once it is back, once.
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
    case 'cancelled': return 'Đã hủy';
    default: return 'Trạng thái chưa xác định';
  }
};

const getStatusBadgeClass = (status: PartRequestStatus | string) => {
  switch (status?.toLowerCase()) {
    case 'requested': return 'bg-warning-50 text-warning-800 border-warning-200/80';
    case 'ready': return 'bg-info-50 text-info-600 border-brand-200/50';
    case 'delivering': return 'bg-brand-50 text-brand-700 border-brand-200/70';
    case 'received': return 'bg-success-50 text-success-700 border-success-200/80';
    case 'completed': return 'bg-ink-100 text-ink-700 border-ink-200';
    case 'cancelled': return 'bg-danger-50 text-danger-700 border-danger-200/80';
    default: return 'bg-ink-100 text-ink-700 border-ink-200';
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

</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Yêu cầu linh kiện" :count="loading || loadError ? null : totalCount">
      <template #badges>
        <span v-if="!canOperate" class="whitespace-nowrap rounded-[var(--radius-sm)] bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">Chế độ chỉ đọc</span>
      </template>
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="refreshData">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <section class="animate-slide-up-delay-1 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Số yêu cầu theo trạng thái trên trang này" title="Tính trên trang đang xem">
      <div v-for="stat in stats" :key="stat.key" class="rounded-[var(--radius-md)] border border-ink-200/90 bg-white px-4 py-3 shadow-(--shadow-e1)">
        <div class="whitespace-nowrap text-xs font-medium text-ink-500">{{ stat.label }}</div>
        <div class="mt-1 font-num text-xl font-bold text-ink-900">{{ stat.value }}</div>
      </div>
    </section>

    <div class="animate-slide-up-delay-2 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-3 shadow-(--shadow-e1) flex flex-wrap items-center gap-2.5">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm mã yêu cầu, mã đơn, linh kiện" label="Tìm yêu cầu linh kiện" />
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
        <option value="ALL">Tất cả trạng thái</option>
        <option value="REQUESTED">Chờ chuẩn bị</option>
        <option value="READY">Sẵn sàng giao</option>
        <option value="DELIVERING">Đang giao hàng</option>
        <option value="RECEIVED">Đã nhận</option>
        <option value="COMPLETED">Hoàn tất</option>
        <option value="CANCELLED">Đã huỷ</option>
      </select>
      <select v-model="typeFilter" :class="consoleField" aria-label="Loại yêu cầu">
        <option value="ALL">Tất cả loại</option>
        <option value="PRE_REPAIR">Trước sửa chữa</option>
        <option value="QUOTATION">Báo giá tại chỗ</option>
        <option value="ADDITIONAL">Phát sinh</option>
        <option value="WARRANTY">Bảo hành</option>
      </select>
      <select v-model="fulfillmentFilter" :class="consoleField" aria-label="Hình thức nhận">
        <option value="ALL">Mọi hình thức</option>
        <option value="PICKUP">Lấy tại kho</option>
        <option value="DELIVERY">Giao tận nơi</option>
      </select>
      <select v-model="dateFilter" :class="consoleField" aria-label="Thời gian">
        <option value="ALL">Mọi thời gian</option>
        <option value="today">Hôm nay</option>
        <option value="7days">7 ngày qua</option>
        <option value="30days">30 ngày qua</option>
      </select>
    </div>

    <Transition name="fh-fade-slide">
      <div
        v-if="toastMessage"
        class="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm"
        :class="toastMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-800 border-danger-200'"
        :role="toastMessage.type === 'success' ? 'status' : 'alert'"
      >
        <span>{{ toastMessage.text }}</span>
        <button type="button" class="shrink-0 rounded-[var(--radius-sm)] p-1 transition-colors hover:bg-white/60 cursor-pointer" aria-label="Đóng thông báo" @click="toastMessage = null">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <Transition name="fh-fade-slide">
      <router-link
        v-if="returnsWaiting !== null && returnsWaiting > 0"
        to="/console/part-returns"
        class="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-warning-200/90 bg-warning-50/80 px-4 py-3 text-sm text-warning-900 transition-colors hover:bg-warning-100/80"
        data-testid="part-returns-link"
      >
        <span><strong class="font-num">{{ returnsWaiting }}</strong> dòng linh kiện đã khai trả đang chờ nhận</span>
        <span class="whitespace-nowrap font-semibold">Mở trang hoàn trả</span>
      </router-link>
    </Transition>
    <Transition name="fh-fade-slide">
      <div v-if="returnsWaitingError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" data-testid="part-returns-check-error">
        <p>Chưa kiểm tra được linh kiện chờ nhận hoàn trả.</p>
        <div class="flex flex-wrap items-center gap-3">
          <FhButton variant="secondary" size="md" data-testid="part-returns-check-retry" @click="loadReturnsWaiting">Thử lại</FhButton>
          <router-link to="/console/part-returns" class="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-2 font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">Mở trang hoàn trả</router-link>
        </div>
      </div>
    </Transition>

    <div class="animate-slide-up-delay-3 space-y-5">
      <ConsoleLoadError v-if="loadError" @retry="loadData" />
      <!-- BUG DETECTOR 258/243: a short list on the left, the chosen request in full on the right. -->
      <div v-else class="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section class="overflow-hidden rounded-[var(--radius-md)] border border-ink-200/90 bg-white shadow-(--shadow-e1)" aria-label="Danh sách yêu cầu linh kiện">
          <div v-if="loading && !requests.length" class="space-y-2 p-4" aria-busy="true" aria-label="Đang tải yêu cầu linh kiện">
            <FhSkeleton v-for="n in 5" :key="n" height="64px" rounded="md" />
          </div>
          <p v-else-if="!requests.length" class="px-4 py-6 text-sm text-ink-500">Không có yêu cầu linh kiện nào phù hợp.</p>
          <ul v-else class="divide-y divide-ink-100" :aria-busy="loading">
            <li v-for="row in requests" :key="row.id">
              <button
                type="button"
                class="block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                :class="selected?.id === row.id ? 'bg-brand-50/70 shadow-[inset_3px_0_0_var(--color-brand-600)]' : ''"
                :aria-current="selected?.id === row.id ? 'true' : undefined"
                :data-testid="`part-request-detail-${row.id}`"
                @click="selectRequest(row)"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="font-num font-semibold text-ink-900">{{ requestCode(row) }}</span>
                  <span class="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="getStatusBadgeClass(displayPartRequestStatus(row))">{{ getStatusLabel(displayPartRequestStatus(row)) }}</span>
                </span>
                <span class="mt-1 block truncate text-sm text-ink-700">{{ itemsSummary(row) }}</span>
                <span class="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-500">
                  <span class="truncate">{{ typeLabel(row.requestType) }} · {{ methodLabel(row.fulfillmentMethod) }}<template v-if="warehouseLabel(row)"> · {{ warehouseLabel(row) }}</template></span>
                  <span class="shrink-0 font-num">{{ vnDateString(row.createdAt) }} {{ vnTimeString(row.createdAt, { hour: '2-digit', minute: '2-digit' }) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section
          v-if="selected"
          ref="detailPane"
          class="space-y-4 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-4 shadow-(--shadow-e1) lg:sticky lg:top-4 sm:p-5"
          aria-labelledby="pr-detail-title"
          :data-testid="`part-request-pane-${selected.id}`"
        >
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-3">
            <div class="min-w-0">
              <h2 id="pr-detail-title" class="font-num text-base font-semibold text-ink-900">{{ requestCode(selected) }}</h2>
              <p class="text-sm text-ink-600">{{ typeLabel(selected.requestType) }} · {{ methodLabel(selected.fulfillmentMethod) }}</p>
              <router-link :to="`/console/orders/${selected.serviceOrderId}`" class="text-sm font-medium text-brand-700 hover:underline">Xem đơn sửa chữa</router-link>
            </div>
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

          <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40 px-4 text-sm">
            <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Trạng thái</dt><dd class="font-medium text-ink-900">{{ getStatusLabel(displayPartRequestStatus(selected)) }}</dd></div>
            <div v-if="selected.fulfillmentMethod === 'pickup' || warehouseLabel(selected)" class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Xuất từ kho</dt><dd class="text-right font-medium text-ink-900">{{ warehouseLabel(selected) || 'Chưa phân kho' }}</dd></div>
            <div v-if="selected.requestType === 'warranty'" class="flex justify-between gap-3 py-2.5">
              <dt class="text-ink-500">Linh kiện hỏng</dt>
              <dd class="text-right text-ink-900">
                {{ selected.faultyInspectionResult ? inspectionLabel(selected.faultyInspectionResult) : faultyReturnLabel(selected) }}
                <router-link v-if="canOperate && needsInspection(selected)" to="/console/part-returns" class="ml-2 font-medium text-brand-700 hover:underline">Kiểm tra ở Hoàn trả linh kiện</router-link>
              </dd>
            </div>
            <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Tạo lúc</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ vnDateTimeString(selected.createdAt) }}</dd></div>
            <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Đã nhận</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ selected.receivedAt ? vnDateTimeString(selected.receivedAt) : 'Chưa nhận' }}</dd></div>
            <div v-if="selected.fulfillmentMethod === 'delivery'" class="list-none py-2"><ShippingShareBreakdown :snapshot="selected" role="manager" :fulfillment-method="selected.fulfillmentMethod" /></div>
          </dl>

          <div v-if="selected.fulfillmentMethod === 'pickup'" class="space-y-2.5 rounded-[var(--radius-sm)] border border-ink-200/90 p-3.5" :data-testid="`warehouse-allocation-${selected.id}`">
            <h3 class="text-sm font-semibold text-ink-900">Lấy hàng tại kho</h3>
            <p v-if="allocationLoading[selected.id] && !allocationFor(selected)" class="text-sm text-ink-500">Đang kiểm tra phân bổ…</p>
            <p v-else-if="allocationFor(selected)?.mode === 'legacy'" class="text-sm text-ink-600">Yêu cầu lịch sử, chưa tham gia phân bổ kho W2.</p>
            <p v-else-if="allocationFor(selected)?.status === 'received'" class="text-sm font-medium text-success-700">Kỹ thuật viên đã xác nhận nhận hàng.</p>
            <p v-else-if="allocationFor(selected)?.status === 'handed_over'" class="text-sm font-medium text-brand-700">Quản lý đã bàn giao thực tế; tồn đã xuất.</p>
            <p v-else-if="allocationFor(selected)?.status === 'ready'" class="text-sm font-medium text-brand-700">Đã có mã lấy hàng; đang chờ bàn giao thực tế.</p>
            <p v-else-if="allocationFor(selected)?.status === 'reserved'" class="text-sm font-medium text-brand-700">Đã giữ toàn bộ linh kiện tại một kho.</p>
            <p v-if="allocationErrors[selected.id]" class="text-sm text-danger-700" role="alert">{{ allocationErrors[selected.id] }}</p>
            <template v-if="allocationFor(selected)?.mode === 'warehouse'">
              <p v-if="allocationFor(selected)?.warehouseAddress" class="text-sm text-ink-700">Địa chỉ kho: {{ allocationFor(selected)?.warehouseAddress }}</p>
              <p
                v-if="allocationFor(selected)?.distanceReference === 'booking_snapshot' && typeof allocationFor(selected)?.estimatedStraightLineKm === 'number'"
                class="text-sm text-ink-600"
              >Khoảng cách đường thẳng ước tính từ vị trí đặt lịch: <span class="font-num font-medium text-ink-900">~{{ allocationFor(selected)?.estimatedStraightLineKm?.toFixed(1) }} km</span>; chưa xác minh đường đi/ETA</p>
              <p v-else-if="allocationFor(selected)?.reviewRequired" class="text-sm text-ink-600">Chưa xác minh khoảng cách; quản lý cần kiểm tra. Không có km hoặc thời gian ước tính.</p>
              <p v-if="allocationFor(selected)?.status === 'stock_unavailable'" class="rounded-[var(--radius-sm)] bg-warning-50 px-3 py-2 text-sm text-warning-800">Không có kho FixHome nào đủ toàn bộ linh kiện yêu cầu. Không giữ tồn hoặc tạo QR; thợ tự chuẩn bị theo nguồn linh kiện của mình.</p>
              <p v-if="allocationOwnerMismatch(allocationFor(selected)!)" class="rounded-[var(--radius-sm)] bg-warning-50 px-3 py-2 text-sm text-warning-800">Kho này do quản lý khác phụ trách. Chuyển cho đúng quản lý để tiếp tục.</p>
              <div v-if="warehouseTokens[selected.id]?.pickup && canOperate && allocationFor(selected)?.responsibleUserId === auth.user?.id" class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50/70 p-3">
                <img v-if="warehouseQrImages[selected.id]?.pickup" :src="warehouseQrImages[selected.id]?.pickup" alt="QR lấy hàng dùng một lần" class="h-36 w-36 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-1" />
                <div class="min-w-0 flex-1 space-y-2"><p class="text-sm font-semibold text-ink-900">Mã lấy hàng một lần · hết hạn trong 15 phút</p><p class="break-all font-num text-xs text-ink-700">{{ warehouseTokens[selected.id]?.pickup }}</p><FhButton variant="secondary" size="sm" data-testid="copy-pickup-code" @click="copyToken(warehouseTokens[selected.id]?.pickup ?? '')">{{ copiedInline === warehouseTokens[selected.id]?.pickup ? 'Đã chép mã' : 'Sao chép mã' }}</FhButton></div>
              </div>
              <div v-if="warehouseTokens[selected.id]?.receipt && canOperate && allocationFor(selected)?.responsibleUserId === auth.user?.id" class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-success-200 bg-success-50/70 p-3">
                <img v-if="warehouseQrImages[selected.id]?.receipt" :src="warehouseQrImages[selected.id]?.receipt" alt="QR xác nhận nhận hàng riêng cho kỹ thuật viên" class="h-36 w-36 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-1" />
                <div class="min-w-0 flex-1 space-y-1.5"><p class="text-sm font-semibold text-success-800">Đưa mã nhận hàng riêng này cho kỹ thuật viên (hiệu lực 48 giờ).</p><p class="break-all font-num text-xs text-ink-700">{{ warehouseTokens[selected.id]?.receipt }}</p><FhButton variant="secondary" size="sm" data-testid="copy-receipt-code" @click="copyToken(warehouseTokens[selected.id]?.receipt ?? '')">{{ copiedInline === warehouseTokens[selected.id]?.receipt ? 'Đã chép mã' : 'Sao chép mã' }}</FhButton></div>
              </div>
            </template>
          </div>

          <DeliveryOperationsPanel
            v-if="selected.fulfillmentMethod === 'delivery' && selected.requestType === 'additional' && selected.shippingFee >= 0 && isDeliveryPhysicalRequestId(selected.id)"
            :key="`ops-${selected.id}`"
            :request-id="selected.id"
            :fulfillment-method="selected.fulfillmentMethod"
            :request-type="selected.requestType"
            :shipping-fee="selected.shippingFee"
            audience="manager"
          />
          <DeliveryTermsPanel
            v-if="selected.fulfillmentMethod === 'delivery' && selected.requestType === 'additional' && selected.shippingFee > 0 && isDeliveryPhysicalRequestId(selected.id)"
            :key="`terms-${selected.id}`"
            :request-id="selected.id"
            :request-type="selected.requestType"
            :fulfillment-method="selected.fulfillmentMethod"
            :shipping-fee="selected.shippingFee"
            audience="manager"
            :technician-id="selected.technicianId"
          />

          <div>
            <h3 class="mb-2 text-sm font-semibold text-ink-900">Linh kiện (<span class="font-num">{{ (selected.items || []).length }}</span>)</h3>
            <ul class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/90">
              <li v-for="item in selected.items || []" :key="item.id" class="p-3.5 text-sm" :data-testid="`manager-part-detail-${item.id}`">
                <div class="space-y-1.5" :data-testid="`manager-part-${item.id}`">
                <div class="flex items-start justify-between gap-3">
                  <p class="min-w-0 break-words font-medium text-ink-900">{{ item.partNameSnapshot }}</p>
                  <span class="shrink-0 font-num text-ink-700">x {{ item.quantity }}</span>
                </div>
                <template v-for="record in [custodyFor(selected, item.id)]" :key="record?.partRequestItemId ?? item.id">
                  <div v-if="record" class="space-y-1 text-xs text-ink-700">
                    <p class="font-num">Cấp {{ record.issuedQty }} · Dùng {{ record.usedQty }} · Cần trả kho {{ record.outstandingQty }}</p>
                    <p class="font-num">Khai trả {{ record.declaredQty }} · Đã nhận trả {{ record.managerAcceptedQty }} · Còn phải khai {{ partCustodyQuantities(record).remainingToDeclare }}</p>
                    <p v-if="partCustodyQuantities(record).awaitingManager > 0" class="font-num font-medium text-warning-800">Chờ nhận {{ partCustodyQuantities(record).awaitingManager }}</p>
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                      <span>Giá trị linh kiện đã dùng</span>
                      <FhMoney v-if="record.usageRecorded !== false" :amount="item.unitPriceSnapshot * record.usedQty" data-testid="manager-part-used-value" />
                      <span v-else>Chưa chốt sử dụng</span>
                    </div>
                  </div>
                  <div v-else class="space-y-1 text-xs text-ink-600">
                    <p class="font-num">Số lượng yêu cầu/cấp {{ item.quantity }} · Đơn giá <FhMoney :amount="item.unitPriceSnapshot" /></p>
                    <p>{{ getUsageStatusLabel(item.usageStatus) }} · {{ custodyReadLabel(selected) }}</p>
                  </div>
                </template>
                </div>
              </li>
            </ul>
          </div>
        </section>
        <p v-else-if="requests.length" class="rounded-[var(--radius-md)] border border-dashed border-ink-200 px-4 py-6 text-sm text-ink-500">Chọn một yêu cầu để xem chi tiết.</p>
      </div>

      <!-- BUG DETECTOR 83: a handover is not a deletion; plain colours and what exactly is handed over. -->
      <FhConfirmDialog :open="Boolean(handoverTarget)" :danger="false" title="Xác nhận đã giao linh kiện cho kỹ thuật viên?" consequence="Chỉ bấm khi kỹ thuật viên đã cầm đủ các linh kiện dưới đây. Kho sẽ trừ tồn và tạo mã nhận hàng cho kỹ thuật viên." confirm-text="Đã giao thực tế" :loading="actionLoading" @confirm="handoverTarget && confirmPhysicalHandover(handoverTarget)" @cancel="handoverTarget = null">
        <dl v-if="handoverTarget" class="space-y-1 text-sm text-ink-800" data-testid="handover-summary">
          <div><dt class="inline text-ink-600">Yêu cầu: </dt><dd class="inline font-num font-medium">{{ requestCode(handoverTarget) }}</dd></div>
          <div v-if="allocationFor(handoverTarget)?.warehouseName"><dt class="inline text-ink-600">Kho: </dt><dd class="inline">{{ allocationFor(handoverTarget)?.warehouseName }}</dd></div>
          <div><dt class="text-ink-600">Linh kiện:</dt><dd><ul class="mt-0.5 space-y-0.5"><li v-for="item in handoverTarget.items" :key="item.id" class="flex justify-between gap-3"><span>{{ item.partNameSnapshot }}</span><span class="font-num whitespace-nowrap">x {{ item.quantity }}</span></li></ul></dd></div>
        </dl>
      </FhConfirmDialog>

      <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="setPage" />
    </div>

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

    <!-- Handover QR -->
    <Transition name="fh-modal">
      <div
        v-if="qrModalRequest"
        class="fixed inset-0 z-50 bg-ink-950/50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-title"
        @click.self="qrModalRequest = null"
        @keydown.esc="qrModalRequest = null"
      >
        <div class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 shadow-(--shadow-e3) max-w-md w-full p-6 space-y-4">
          <div class="flex items-start justify-between gap-3 border-b border-ink-100 pb-3">
            <div>
              <h3 id="qr-title" class="text-base font-semibold text-ink-900">Mã bàn giao linh kiện</h3>
              <p class="font-num text-sm text-ink-500">{{ requestCode(qrModalRequest) }}</p>
            </div>
            <button type="button" class="rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="qrModalRequest = null">
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <div class="flex flex-col items-center gap-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50/70 p-4">
            <img
              v-if="qrImage"
              :src="qrImage"
              alt="Mã QR bàn giao"
              class="h-48 w-48 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-2"
            />
            <div class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-2">
              <span class="truncate select-all font-num text-sm font-semibold text-ink-900">{{ qrModalRequest.qrToken }}</span>
              <button
                type="button"
                class="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-sm)] bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-800 transition-colors hover:bg-ink-200 cursor-pointer"
                @click="qrModalRequest.qrToken && copyToken(qrModalRequest.qrToken)"
              >
                <Check v-if="copiedToken" :size="12" class="text-success-600" aria-hidden="true" />
                <Copy v-else :size="12" aria-hidden="true" />
                {{ copiedToken ? 'Đã chép' : 'Sao chép' }}
              </button>
            </div>
          </div>

          <p class="text-sm text-ink-600 text-pretty">Kỹ thuật viên quét mã hoặc nhập mã này ở đơn sửa chữa để nhận linh kiện.</p>

          <div class="flex justify-end gap-2 border-t border-ink-100 pt-3">
            <FhButton v-if="canOperate" variant="secondary" size="sm" :disabled="actionLoading" @click="regenerateQr">Tạo lại mã</FhButton>
            <FhButton variant="primary" size="sm" @click="qrModalRequest = null">Đóng</FhButton>
          </div>
        </div>
      </div>
    </Transition>

    <FaultyPartInspectionModal :request="inspectionRequest" @close="inspectionRequest = null" @done="onInspected" />
  </div>
</template>
