<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useAuthStore } from '../../stores/auth';
import { Copy, Check, X } from 'lucide-vue-next';
import { FhMoney, FhButton, FhConfirmDialog } from '../../components';
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
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
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
import { canConfirmWarehouseHandover, warehouseQrAction } from '../../utils/warehouse-fulfillment';

const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));
const isAdmin = computed(() => auth.hasRole('ADMIN'));
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
const detailModalRequest = ref<PartRequest | null>(null);
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
  returnsWaiting.value = null;
  returnsWaitingError.value = false;
  if (!canOperate.value) return;
  try {
    const rows = await partRequestsApi.getPendingReturns();
    if (version !== returnsWaitingVersion || !canOperate.value) return;
    returnsWaiting.value = rows.filter((row) => row.declaredQty - row.managerAcceptedQty > 0 && row.outstandingQty > 0).length;
  } catch (err) {
    if (version !== returnsWaitingVersion || !canOperate.value) return;
    returnsWaitingError.value = !isPartReturnsUnavailableError(err);
  }
};

type CustodyRead = { rows: PartCustodyReturnRecord[]; state: 'loading' | 'ready' | 'error' | 'unavailable' };
const custodyByOrder = ref<Record<string, CustodyRead>>({});
let custodyReadVersion = 0;
let activeCustodyReads = 0;
const custodyReadWaiters: Array<() => void> = [];
/** Only the current server page, one read per order, at most three concurrent reads. */
async function loadVisibleCustody(rows: PartRequest[], pageVersion: number) {
  const version = ++custodyReadVersion;
  // Release obsolete queued reads; the in-flight cap also spans page changes.
  custodyReadWaiters.splice(0).forEach(resolve => resolve());
  custodyByOrder.value = {};
  if (!canOperate.value) return;
  const ids = [...new Set(rows.slice(0, pageSize)
    .filter(row => ['received', 'completed'].includes(row.status.toLowerCase()) && row.items.some(item => item.partSource === 'fixhome'))
    .map(row => row.serviceOrderId).filter(Boolean))];
  custodyByOrder.value = Object.fromEntries(ids.map(id => [id, { rows: [], state: 'loading' as const }]));
  const current = () => version === custodyReadVersion && pageVersion === loadVersion && canOperate.value;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, async () => {
    while (next < ids.length && current()) {
      const id = ids[next++];
      while (activeCustodyReads >= 3) {
        await new Promise<void>(resolve => custodyReadWaiters.push(resolve));
        if (!current()) return;
      }
      if (!current()) return;
      ++activeCustodyReads;
      try {
        const records = await partRequestsApi.getReturnsByOrderId(id);
        if (current()) custodyByOrder.value[id] = { rows: records, state: 'ready' };
      } catch (err) {
        if (current()) custodyByOrder.value[id] = { rows: [], state: isPartReturnsUnavailableError(err) ? 'unavailable' : 'error' };
      } finally {
        --activeCustodyReads;
        custodyReadWaiters.shift()?.();
      }
    }
  }));
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

const columns: ConsoleColumn[] = [
  { key: 'code', label: 'Yêu cầu' },
  { key: 'items', label: 'Linh kiện' },
  { key: 'type', label: 'Loại', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'time', label: 'Tạo lúc', hideBelow: 'xl' },
  { key: 'actions', label: '', align: 'right' },
];

const loadData = async () => {
  const version = ++loadVersion;
  loading.value = true;
  loadError.value = false;
  try {
    const res = await partRequestsApi.getAll({
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
  allocations.value = {};
  allocationErrors.value = {};
  for (const row of pickups) allocationLoading.value[row.id] = true;
  await Promise.all(pickups.map(async (row) => {
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
const canReserve = (request: PartRequest) => (canOperate.value || isAdmin.value) && ['manual_assistance', 'reserved'].includes(allocationFor(request)?.status ?? '') && !allocationLoading.value[request.id];
const canPreparePickupQr = (allocation: WarehouseAllocation | null) => canOperate.value && !!allocation && allocation.mode === 'warehouse' && !!warehouseQrAction(allocation.status) && allocation.responsibleUserId === auth.user?.id;

async function reserveWarehouse(request: PartRequest) {
  if (!canReserve(request) || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const allocation = await partRequestsApi.reserveWarehouse(request.id, { idempotencyKey: crypto.randomUUID() });
    allocations.value[request.id] = allocation;
    allocationErrors.value[request.id] = '';
    showToast('success', allocation.status === 'manual_assistance' ? 'Chưa có kho đủ tồn; đã giữ hướng hỗ trợ thủ công.' : 'Đã giữ tồn tại một kho cho toàn bộ yêu cầu.');
  } catch (error) { allocationErrors.value[request.id] = userFacingError(error, 'Chưa phân bổ được kho.'); }
  finally { actionLoading.value = false; }
}

async function prepareWarehouseQr(request: PartRequest) {
  const allocation = allocationFor(request);
  if (!canPreparePickupQr(allocation) || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const result = await partRequestsApi.prepareWarehouseQr(request.id, { idempotencyKey: crypto.randomUUID() });
    allocations.value[request.id] = result.allocation;
    warehouseTokens.value[request.id] = { pickup: result.qrToken, receipt: null };
    if (result.qrToken) warehouseQrImages.value[request.id] = { pickup: await QRCode.toDataURL(result.qrToken, { width: 220 }), receipt: '' };
    if (!result.qrToken) showToast('error', 'Mã chỉ hiển thị một lần. Nếu không còn, tạo mã mới để xoay mã cũ.');
  } catch (error) { allocationErrors.value[request.id] = userFacingError(error, 'Chưa tạo được mã QR lấy hàng.'); }
  finally { actionLoading.value = false; }
}

async function confirmPhysicalHandover(request: PartRequest) {
  const pickup = warehouseTokens.value[request.id]?.pickup;
  const allocation = allocationFor(request);
  if (!canConfirmWarehouseHandover(auth.userRole, auth.user?.id, allocation) || !pickup || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const result = await partRequestsApi.confirmWarehouseHandover(request.id, { qrToken: pickup, idempotencyKey: crypto.randomUUID() });
    allocations.value[request.id] = result.allocation;
    warehouseTokens.value[request.id] = { pickup: null, receipt: result.qrToken };
    if (result.qrToken) warehouseQrImages.value[request.id] = { pickup: '', receipt: await QRCode.toDataURL(result.qrToken, { width: 220 }) };
    handoverTarget.value = null;
    if (!result.qrToken) showToast('error', 'Kho đã ghi nhận bàn giao; mã nhận hàng chỉ được hiển thị một lần và hiện không còn trong phiên.');
    else showToast('success', 'Đã xác nhận bàn giao thực tế; tồn kho đã được xuất. Đưa mã nhận hàng riêng cho kỹ thuật viên.');
  } catch (error) { allocationErrors.value[request.id] = userFacingError(error, 'Chưa xác nhận được bàn giao thực tế.'); }
  finally { actionLoading.value = false; }
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
  custodyReadWaiters.splice(0).forEach(resolve => resolve());
});

watch([statusFilter, typeFilter, fulfillmentFilter, dateFilter, searchQuery], (_value, _old, onCleanup) => {
  page.value = 1;
  const timer = setTimeout(() => { void loadData(); }, 250);
  onCleanup(() => clearTimeout(timer));
});
const setPage = (next: number) => { page.value = next; void loadData(); };

const stats = computed(() => {
  const reqs = requests.value;
  const count = (status: string) => reqs.filter((r) => r.status.toLowerCase() === status).length;
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

const copyToken = async (token: string) => {
  try {
    await navigator.clipboard.writeText(token);
    copiedToken.value = true;
    setTimeout(() => { copiedToken.value = false; }, 2000);
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
const typeLabel = (type: string) => (type === 'pre_repair' ? 'Trước sửa chữa' : type === 'warranty' ? 'Bảo hành' : 'Phát sinh');
// A warranty part is issued only after the faulty one was inspected; the result decides who pays.
const needsInspection = (req: PartRequest) => req.requestType === 'warranty' && !req.faultyInspectionResult;
const canReinspect = (req: PartRequest) => req.requestType === 'warranty' && ['requested', 'ready', 'delivering'].includes(req.status.toLowerCase());
const inspectionLabel = (result?: string | null) => (result === 'manufacturer' ? 'Lỗi nhà sản xuất, FixHome chịu' : result === 'installation' ? 'Do lắp đặt, thợ trả tiền' : result === 'undetermined' ? 'Không xác định, FixHome chịu' : 'Chưa kiểm tra');
const onInspected = (updated: PartRequest) => {
  replaceRow(updated);
  if (detailModalRequest.value?.id === updated.id) detailModalRequest.value = updated;
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
    case 'requested': return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'ready': return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'delivering': return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'received': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'completed': return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-ink-100 text-ink-700 border-ink-200';
  }
};

const getUsageShortLabel = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending': return 'Đang giữ';
    case 'used': return 'Đã dùng';
    case 'returned': return 'Ghi nhận không dùng';
    default: return 'Chưa rõ';
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

const getUsageBadgeClass = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending': return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'used': return 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold';
    case 'returned': return 'bg-blue-50 text-blue-800 border-blue-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Yêu cầu linh kiện" :count="loading || loadError ? null : totalCount">
      <template #badges>
        <span v-if="!canOperate" class="whitespace-nowrap rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">Chế độ chỉ đọc</span>
      </template>
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="refreshData">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Số yêu cầu theo trạng thái trên trang này" title="Tính trên trang đang xem">
      <div v-for="stat in stats" :key="stat.key" class="rounded-[var(--radius-md)] border border-ink-200 bg-white px-4 py-3">
        <div class="whitespace-nowrap text-sm text-ink-500">{{ stat.label }}</div>
        <div class="mt-0.5 font-num text-xl font-semibold text-ink-900">{{ stat.value }}</div>
      </div>
    </section>

    <div class="flex flex-wrap items-center gap-2">
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

    <div
      v-if="toastMessage"
      class="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-sm"
      :class="toastMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-800 border-danger-200'"
      :role="toastMessage.type === 'success' ? 'status' : 'alert'"
    >
      <span>{{ toastMessage.text }}</span>
      <button type="button" class="shrink-0 rounded p-1 hover:bg-white/60" aria-label="Đóng thông báo" @click="toastMessage = null">
        <X :size="16" aria-hidden="true" />
      </button>
    </div>

    <router-link
      v-if="returnsWaiting !== null && returnsWaiting > 0"
      to="/console/part-returns"
      class="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900 hover:bg-warning-100"
      data-testid="part-returns-link"
    >
      <span>{{ returnsWaiting }} dòng linh kiện đã khai trả đang chờ nhận</span>
      <span class="whitespace-nowrap font-semibold">Mở trang hoàn trả</span>
    </router-link>
    <div v-if="returnsWaitingError" role="alert" class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" data-testid="part-returns-check-error">
      <p>Chưa kiểm tra được linh kiện chờ nhận hoàn trả.</p>
      <div class="flex flex-wrap items-center gap-3">
        <FhButton variant="secondary" size="md" data-testid="part-returns-check-retry" @click="loadReturnsWaiting">Thử lại</FhButton>
        <router-link to="/console/part-returns" class="inline-flex min-h-11 items-center rounded-lg px-2 font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">Mở trang hoàn trả</router-link>
      </div>
    </div>
    <ConsoleLoadError v-if="loadError" @retry="loadData" />
    <ConsoleTable
      v-else
      class="part-requests-table"
      :columns="columns"
      :rows="requests"
      :loading="loading"
      empty-text="Không có yêu cầu linh kiện nào phù hợp."
    >
      <template #cell-code="{ row }">
        <button
          type="button"
          class="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg font-num font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          :data-testid="`part-request-detail-${row.id}`"
          @click="detailModalRequest = row"
        >{{ requestCode(row) }}</button>
        <div>
          <router-link :to="`/console/orders/${row.serviceOrderId}`" class="whitespace-nowrap text-xs text-ink-500 hover:text-brand-700 hover:underline">Xem đơn</router-link>
        </div>
      </template>

      <template #cell-items="{ row }">
        <ul class="part-request-items max-w-72 min-w-40 space-y-0.5">
          <li v-for="item in (row.items || []).slice(0, 3)" :key="item.id" class="space-y-1 py-1" :data-testid="`manager-part-${item.id}`">
            <div class="flex items-center justify-between gap-2">
            <span class="truncate text-ink-800" :title="item.partNameSnapshot">{{ item.partNameSnapshot }}</span>
            <span v-if="!custodyFor(row, item.id)" class="font-num text-xs text-ink-600">Yêu cầu/cấp {{ item.quantity }}</span>
            </div>
            <template v-for="record in [custodyFor(row, item.id)]" :key="record?.partRequestItemId ?? item.id">
              <div v-if="record" class="space-y-1 text-xs text-ink-600">
                <p class="font-num">Cấp {{ record.issuedQty }} · Dùng {{ record.usedQty }}</p>
                <p class="font-num">Khai trả {{ record.declaredQty }} · Đã nhận trả {{ record.managerAcceptedQty }}</p>
                <p v-if="partCustodyQuantities(record).awaitingManager > 0" class="font-medium text-warning-800">Chờ nhận {{ partCustodyQuantities(record).awaitingManager }}</p>
                <p v-else-if="record.outstandingQty > 0">Cần trả kho {{ record.outstandingQty }}</p>
              </div>
              <div v-else class="space-y-1 text-xs text-ink-600">
                <span class="whitespace-nowrap rounded border px-1 text-[11px] font-medium" :class="getUsageBadgeClass(item.usageStatus)">{{ getUsageShortLabel(item.usageStatus) }}</span>
                <p>{{ custodyReadLabel(row) }}</p>
              </div>
            </template>
          </li>
        </ul>
        <button
          v-if="(row.items || []).length > 3"
          type="button"
          class="mt-0.5 inline-flex min-h-11 items-center whitespace-nowrap rounded-lg text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          @click="detailModalRequest = row"
        >Thêm {{ (row.items || []).length - 3 }} linh kiện</button>
      </template>

      <template #cell-type="{ row }">
        <div class="whitespace-nowrap text-ink-800">{{ typeLabel(row.requestType) }}</div>
        <div class="whitespace-nowrap text-xs text-ink-500">
          {{ methodLabel(row.fulfillmentMethod) }}<template v-if="row.fulfillmentMethod === 'delivery' && Number(row.shippingFee) > 0">, phí <span class="font-num">{{ Number(row.shippingFee).toLocaleString('vi-VN') }}&nbsp;₫</span></template>
        </div>
      </template>

      <template #cell-status="{ row }">
        <span class="inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium" :class="getStatusBadgeClass(row.status)">
          {{ getStatusLabel(row.status) }}
        </span>
      </template>

      <template #cell-time="{ row }">
        <div class="whitespace-nowrap font-num text-ink-700">{{ vnDateString(row.createdAt) }}</div>
        <div class="whitespace-nowrap font-num text-xs text-ink-500">{{ vnTimeString(row.createdAt, { hour: '2-digit', minute: '2-digit' }) }}</div>
      </template>

      <template #cell-actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <FhButton
            v-if="canOperate && row.status.toLowerCase() === 'requested' && needsInspection(row)"
            variant="primary"
            size="sm"
            :disabled="actionLoading"
            @click="inspectionRequest = row"
          >Kiểm tra linh kiện hỏng</FhButton>
          <FhButton
            v-else-if="canOperate && row.status.toLowerCase() === 'requested' && (row.fulfillmentMethod === 'delivery' || canMarkLegacyPickupReady(row))"
            variant="primary"
            size="sm"
            :disabled="actionLoading"
            @click="handleMarkReady(row)"
          >Chuẩn bị xong</FhButton>
          <FhButton
            v-else-if="canOperate && canDeliver(row)"
            variant="primary"
            size="sm"
            :disabled="actionLoading"
            @click="handleMarkDelivering(row)"
          >Giao hàng</FhButton>
          <FhButton
            v-else-if="hasQr(row)"
            variant="secondary"
            size="sm"
            @click="qrModalRequest = row"
          >Mã QR</FhButton>
          <ConsoleMoreMenu
            v-if="(hasQr(row) && canOperate && canDeliver(row)) || (canOperate && isOpen(row))"
            label="Thao tác khác với yêu cầu"
          >
            <ConsoleMenuItem v-if="hasQr(row) && canOperate && canDeliver(row)" @click="qrModalRequest = row">Mã QR</ConsoleMenuItem>
            <ConsoleMenuItem
              v-if="canOperate && isOpen(row)"
              danger
              :disabled="actionLoading"
              @click="cancelTarget = row"
            >Huỷ yêu cầu</ConsoleMenuItem>
          </ConsoleMoreMenu>
        </div>
      </template>
    </ConsoleTable>

    <section v-for="row in requests.filter((request) => request.fulfillmentMethod === 'pickup')" :key="`warehouse-${row.id}`" class="space-y-2 rounded-lg border border-ink-200 bg-white p-4" :data-testid="`warehouse-allocation-${row.id}`">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold text-ink-900">Lấy hàng tại kho · {{ requestCode(row) }}</h2>
        <span v-if="allocationLoading[row.id]" class="text-sm text-ink-500">Đang kiểm tra phân bổ…</span>
        <span v-else-if="allocationFor(row)?.mode === 'legacy'" class="text-sm text-ink-600">Yêu cầu lịch sử, chưa tham gia phân bổ kho W2.</span>
        <span v-else-if="allocationFor(row)?.status === 'received'" class="text-sm font-medium text-success-700">Kỹ thuật viên đã xác nhận nhận hàng.</span>
        <span v-else-if="allocationFor(row)?.status === 'handed_over'" class="text-sm font-medium text-brand-700">Quản lý đã bàn giao thực tế; tồn đã xuất.</span>
        <span v-else-if="allocationFor(row)?.status === 'ready'" class="text-sm font-medium text-brand-700">Đã có mã lấy hàng; đang chờ bàn giao thực tế.</span>
        <span v-else-if="allocationFor(row)?.status === 'reserved'" class="text-sm font-medium text-brand-700">Đã giữ toàn bộ linh kiện tại một kho.</span>
        <span v-else-if="allocationFor(row)?.status === 'manual_assistance'" class="text-sm font-medium text-warning-800">Cần quản lý hỗ trợ thủ công; chưa sẵn sàng nhận.</span>
        <span v-else-if="allocationErrors[row.id]" class="text-sm text-danger-700">{{ allocationErrors[row.id] }}</span>
      </div>
      <template v-if="allocationFor(row)?.mode === 'warehouse'">
        <p v-if="allocationFor(row)?.warehouseName" class="text-sm text-ink-700">Kho: {{ allocationFor(row)?.warehouseName }}<template v-if="allocationFor(row)?.warehouseAddress"> · {{ allocationFor(row)?.warehouseAddress }}</template></p>
        <p v-if="allocationFor(row)?.reviewRequired" class="text-sm text-warning-800">Chưa xác minh khoảng cách; quản lý cần kiểm tra. Không có km hoặc thời gian ước tính.</p>
        <p v-if="allocationFor(row)?.manualAssistanceReason" class="text-sm text-warning-800">Chưa có một kho đủ tồn cho toàn bộ yêu cầu. Có thể nhờ quản lý hỗ trợ thủ công; không tự chia qua nhiều kho.</p>
        <p v-if="allocationOwnerMismatch(allocationFor(row)!)" class="text-sm text-warning-800">Kho này do quản lý khác phụ trách. Chuyển cho đúng quản lý để tiếp tục.</p>
        <div v-if="allocationFor(row)?.status === 'manual_assistance'" class="flex flex-wrap gap-2">
          <FhButton v-if="canReserve(row)" variant="secondary" size="sm" :disabled="actionLoading" @click="reserveWarehouse(row)">Thử phân bổ lại</FhButton>
          <router-link to="/console/warehouses" class="inline-flex min-h-10 items-center text-sm font-medium text-brand-700 underline">Mở kho và tồn thực tế</router-link>
        </div>
        <FhButton v-if="canPreparePickupQr(allocationFor(row))" variant="primary" size="sm" :disabled="actionLoading" @click="prepareWarehouseQr(row)">{{ allocationFor(row)?.status === 'handed_over' ? 'Cấp lại mã nhận' : 'Chuẩn bị mã kho' }}</FhButton>
        <div v-if="warehouseTokens[row.id]?.pickup && canOperate && allocationFor(row)?.responsibleUserId === auth.user?.id" class="flex flex-wrap items-center gap-3 rounded-md border border-brand-200 bg-brand-50 p-3">
          <img :src="warehouseQrImages[row.id]?.pickup" alt="QR lấy hàng dùng một lần" class="h-36 w-36 bg-white p-1" />
          <div class="min-w-0 flex-1 space-y-2"><p class="text-sm font-semibold text-ink-900">Mã lấy hàng một lần · hết hạn trong 15 phút</p><p class="break-all font-num text-xs text-ink-700">{{ warehouseTokens[row.id]?.pickup }}</p><FhButton variant="primary" size="sm" :disabled="actionLoading" @click="handoverTarget = row">Xác nhận đã giao trực tiếp</FhButton></div>
        </div>
        <div v-if="warehouseTokens[row.id]?.receipt && canOperate && allocationFor(row)?.responsibleUserId === auth.user?.id" class="flex flex-wrap items-center gap-3 rounded-md border border-success-200 bg-success-50 p-3">
          <img :src="warehouseQrImages[row.id]?.receipt" alt="QR xác nhận nhận hàng riêng cho kỹ thuật viên" class="h-36 w-36 bg-white p-1" />
          <div class="min-w-0 flex-1 space-y-1"><p class="text-sm font-semibold text-success-800">Đưa mã nhận hàng riêng này cho kỹ thuật viên (hiệu lực 48 giờ).</p><p class="break-all font-num text-xs text-ink-700">{{ warehouseTokens[row.id]?.receipt }}</p></div>
        </div>
      </template>
    </section>

    <FhConfirmDialog :open="Boolean(handoverTarget)" title="Xác nhận đã giao linh kiện trực tiếp?" consequence="Chỉ xác nhận sau khi đã giao đủ toàn bộ linh kiện tại kho. Backend sẽ xuất tồn một lần và tạo mã nhận riêng cho kỹ thuật viên." confirm-text="Đã giao thực tế" :loading="actionLoading" @confirm="handoverTarget && confirmPhysicalHandover(handoverTarget)" @cancel="handoverTarget = null" />

    <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="setPage" />

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
    <div
      v-if="qrModalRequest"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-title"
      @click.self="qrModalRequest = null"
      @keydown.esc="qrModalRequest = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 id="qr-title" class="text-base font-semibold text-ink-900">Mã bàn giao linh kiện</h3>
            <p class="font-num text-sm text-ink-500">{{ requestCode(qrModalRequest) }}</p>
          </div>
          <button type="button" class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="qrModalRequest = null">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <div class="flex flex-col items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
          <img
            v-if="qrImage"
            :src="qrImage"
            alt="Mã QR bàn giao"
            class="h-48 w-48 rounded border border-ink-200 bg-white p-2"
          />
          <div class="flex w-full items-center justify-between gap-2 rounded border border-ink-200 bg-white p-2">
            <span class="truncate select-all font-num text-sm font-semibold text-ink-900">{{ qrModalRequest.qrToken }}</span>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-ink-100 px-2 py-1 text-xs font-medium text-ink-800 hover:bg-ink-200"
              @click="qrModalRequest.qrToken && copyToken(qrModalRequest.qrToken)"
            >
              <Check v-if="copiedToken" :size="12" class="text-success-600" aria-hidden="true" />
              <Copy v-else :size="12" aria-hidden="true" />
              {{ copiedToken ? 'Đã chép' : 'Sao chép' }}
            </button>
          </div>
        </div>

        <p class="text-sm text-ink-600 text-pretty">Kỹ thuật viên quét mã hoặc nhập mã này ở đơn sửa chữa để nhận linh kiện.</p>

        <div class="flex justify-end gap-2">
          <FhButton v-if="canOperate" variant="secondary" size="sm" :disabled="actionLoading" @click="regenerateQr">Tạo lại mã</FhButton>
          <FhButton variant="primary" size="sm" @click="qrModalRequest = null">Đóng</FhButton>
        </div>
      </div>
    </div>

    <!-- Request detail -->
    <div
      v-if="detailModalRequest"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pr-detail-title"
      @click.self="detailModalRequest = null"
      @keydown.esc="detailModalRequest = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 id="pr-detail-title" class="text-base font-semibold text-ink-900">{{ requestCode(detailModalRequest) }}</h3>
            <router-link :to="`/console/orders/${detailModalRequest.serviceOrderId}`" class="text-sm text-brand-700 hover:underline">Xem đơn sửa chữa</router-link>
          </div>
          <button type="button" class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="detailModalRequest = null">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Loại</dt><dd class="text-ink-900">{{ typeLabel(detailModalRequest.requestType) }}</dd></div>
          <div v-if="detailModalRequest.requestType === 'warranty'" class="flex justify-between gap-3">
            <dt class="text-ink-500">Linh kiện hỏng</dt>
            <dd class="text-right text-ink-900">
              {{ inspectionLabel(detailModalRequest.faultyInspectionResult) }}
              <button v-if="canOperate && canReinspect(detailModalRequest)" type="button" class="ml-2 text-brand-700 hover:underline" @click="inspectionRequest = detailModalRequest">{{ detailModalRequest.faultyInspectionResult ? 'Sửa' : 'Kiểm tra' }}</button>
            </dd>
          </div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Hình thức</dt><dd class="text-ink-900">{{ methodLabel(detailModalRequest.fulfillmentMethod) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Trạng thái</dt><dd class="text-ink-900">{{ getStatusLabel(detailModalRequest.status) }}</dd></div>
          <div class="list-none"><ShippingShareBreakdown :snapshot="detailModalRequest" role="manager" :fulfillment-method="detailModalRequest.fulfillmentMethod" /></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Đã nhận</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ detailModalRequest.receivedAt ? vnDateTimeString(detailModalRequest.receivedAt) : 'Chưa nhận' }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Hoàn tất</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ detailModalRequest.completedAt ? vnDateTimeString(detailModalRequest.completedAt) : 'Chưa hoàn tất' }}</dd></div>
        </dl>

        <DeliveryOperationsPanel
          v-if="detailModalRequest.fulfillmentMethod === 'delivery' && detailModalRequest.requestType === 'additional' && detailModalRequest.shippingFee === 0 && isDeliveryPhysicalRequestId(detailModalRequest.id)"
          :request-id="detailModalRequest.id"
          :fulfillment-method="detailModalRequest.fulfillmentMethod"
          :request-type="detailModalRequest.requestType"
          :shipping-fee="detailModalRequest.shippingFee"
          audience="manager"
        />
        <DeliveryTermsPanel
          v-if="detailModalRequest.fulfillmentMethod === 'delivery' && detailModalRequest.requestType === 'additional' && detailModalRequest.shippingFee > 0 && isDeliveryPhysicalRequestId(detailModalRequest.id)"
          :key="`terms-${detailModalRequest.id}`"
          :request-id="detailModalRequest.id"
          :request-type="detailModalRequest.requestType"
          :fulfillment-method="detailModalRequest.fulfillmentMethod"
          :shipping-fee="detailModalRequest.shippingFee"
          audience="manager"
          :technician-id="detailModalRequest.technicianId"
        />

        <div>
          <h4 class="mb-2 text-sm font-semibold text-ink-900">Linh kiện</h4>
          <ul class="divide-y divide-ink-100 rounded border border-ink-200">
            <li
              v-for="item in detailModalRequest.items || []"
              :key="item.id"
              class="space-y-2 p-3 text-sm"
              :data-testid="`manager-part-detail-${item.id}`"
            >
              <p class="font-medium text-ink-900">{{ item.partNameSnapshot }}</p>
              <template v-for="record in [custodyFor(detailModalRequest, item.id)]" :key="record?.partRequestItemId ?? item.id">
                <div v-if="record" class="space-y-2 text-xs text-ink-700">
                  <p class="font-num">Cấp {{ record.issuedQty }} · Dùng {{ record.usedQty }} · Cần trả kho {{ record.outstandingQty }}</p>
                  <p class="font-num">Khai trả {{ record.declaredQty }} · Đã nhận {{ record.managerAcceptedQty }}</p>
                  <p v-if="partCustodyQuantities(record).awaitingManager > 0" class="font-medium text-warning-800">Chờ nhận {{ partCustodyQuantities(record).awaitingManager }}</p>
                  <p>Còn phải khai {{ partCustodyQuantities(record).remainingToDeclare }}</p>
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <span>Giá trị linh kiện đã dùng</span>
                    <FhMoney v-if="record.usageRecorded !== false" :amount="item.unitPriceSnapshot * record.usedQty" data-testid="manager-part-used-value" />
                    <span v-else>Chưa chốt sử dụng</span>
                  </div>
                  <p>Đơn giá <FhMoney :amount="item.unitPriceSnapshot" /> · Giá trị sử dụng được đối chiếu khi lập hóa đơn.</p>
                </div>
                <div v-else class="space-y-2 text-xs text-ink-600">
                  <p>Số lượng yêu cầu/cấp {{ item.quantity }} · Đơn giá <FhMoney :amount="item.unitPriceSnapshot" /></p>
                  <p>{{ getUsageStatusLabel(item.usageStatus) }}</p>
                  <p>{{ custodyReadLabel(detailModalRequest) }}</p>
                  <p>Giá trị theo số lượng yêu cầu <FhMoney :amount="item.unitPriceSnapshot * item.quantity" /></p>
                </div>
              </template>
            </li>
          </ul>
        </div>

        <div class="flex justify-end">
          <FhButton variant="secondary" size="sm" @click="detailModalRequest = null">Đóng</FhButton>
        </div>
      </div>
    </div>

    <FaultyPartInspectionModal :request="inspectionRequest" @close="inspectionRequest = null" @done="onInspected" />
  </div>
</template>

<style scoped>
/* Keep the same cells and actions in one row per request, readable without sideways scrolling. */
@media (max-width: 639px) {
  .part-requests-table :deep(thead) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .part-requests-table :deep(tbody > tr) { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .part-requests-table :deep(tbody > tr > td) { padding: 12px 16px; }
  .part-requests-table :deep(tbody > tr > td:nth-child(2)) { grid-column: 1 / -1; grid-row: 2; padding-top: 0; }
  .part-requests-table :deep(tbody > tr > td:nth-child(4)) { grid-column: 2; grid-row: 1; align-self: center; }
  .part-requests-table :deep(tbody > tr > td:nth-child(6)) { grid-column: 1 / -1; padding-top: 0; }
  .part-request-items { min-width: 0; max-width: none; }
}
</style>
