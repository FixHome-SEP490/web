<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useAuthStore } from '../../stores/auth';
import {
  Boxes,
  Search,
  QrCode,
  CheckCircle,
  Truck,
  RefreshCw,
  XCircle,
  Eye,
  Copy,
  Check,
  Package,
  Layers,
} from 'lucide-vue-next';
import {
  FhCard,
  FhTable,
  FhMoney,
  FhButton,
} from '../../components';
import {
  partRequestsApi,
  type PartRequest,
  type PartRequestStatus,
  type PartRequestType,
  type FulfillmentMethod,
} from '../../api/part-requests.api';

const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));
const page = ref(1);
const pageSize = 20;
const loadError = ref('');
let loadVersion = 0;
const qrImage = ref('');
const loading = ref(true);
const actionLoading = ref(false);
const requests = ref<PartRequest[]>([]);
const totalCount = ref(0);
const searchQuery = ref('');
const statusFilter = ref('ALL');
const typeFilter = ref('ALL');
const fulfillmentFilter = ref('ALL');
const dateFilter = ref<'ALL' | 'today' | '7days' | '30days'>('ALL');

const qrModalRequest = ref<PartRequest | null>(null);
const detailModalRequest = ref<PartRequest | null>(null);
const copiedToken = ref(false);
watch(qrModalRequest, async (request) => {
  qrImage.value = '';
  if (!request?.qrToken) return;
  try {
    const data = await QRCode.toDataURL(request.qrToken, { width: 220 });
    if (qrModalRequest.value?.qrToken === request.qrToken) qrImage.value = data;
  } catch { showToast('error', 'Không thể tạo mã QR. Vui lòng dùng mã bàn giao.'); }
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
  loadError.value = '';
  try {
    const res = await partRequestsApi.getAll({
      status: statusFilter.value !== 'ALL' ? statusFilter.value.toLowerCase() as PartRequestStatus : undefined,
      requestType: typeFilter.value !== 'ALL' ? typeFilter.value.toLowerCase() as PartRequestType : undefined,
      fulfillmentMethod: fulfillmentFilter.value !== 'ALL' ? fulfillmentFilter.value.toLowerCase() as FulfillmentMethod : undefined,
      createdFrom: dateFilter.value === 'ALL' ? undefined : new Date(dateFilter.value === 'today' ? new Date().setHours(0, 0, 0, 0) : Date.now() - (dateFilter.value === '7days' ? 7 : 30) * 86400000).toISOString(),
      search: searchQuery.value.trim() || undefined,
      page: page.value,
      pageSize,
    });
    if (version !== loadVersion) return;
    requests.value = res.data;
    totalCount.value = res.total;
  } catch {
    if (version !== loadVersion) return;
    requests.value = [];
    loadError.value = 'Không thể tải danh sách yêu cầu linh kiện. Vui lòng thử lại.';
  } finally {
    if (version === loadVersion) loading.value = false;
  }
};

onMounted(() => {
  void loadData();
});

const filteredRequests = requests;
watch([statusFilter, typeFilter, fulfillmentFilter, dateFilter, searchQuery], (_value, _old, onCleanup) => {
  page.value = 1;
  const timer = setTimeout(() => { void loadData(); }, 250);
  onCleanup(() => clearTimeout(timer));
});
const changePage = (delta: number) => { page.value += delta; void loadData(); };

const stats = computed(() => {
  const reqs = requests.value;
  return {
    requested: reqs.filter((r) => r.status.toLowerCase() === 'requested').length,
    ready: reqs.filter((r) => r.status.toLowerCase() === 'ready').length,
    delivering: reqs.filter((r) => r.status.toLowerCase() === 'delivering').length,
    received: reqs.filter((r) => r.status.toLowerCase() === 'received').length,
    completed: reqs.filter((r) => r.status.toLowerCase() === 'completed').length,
  };
});

const handleMarkReady = async (req: PartRequest) => {
  if (!canOperate.value || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.markReady(req.id);
    const idx = requests.value.findIndex((r) => r.id === req.id);
    if (idx !== -1) requests.value[idx] = updated;
    qrModalRequest.value = updated;
    showToast('success', 'Đã chuyển sang READY và tạo mã QR bàn giao thành công!');
  } catch (err: unknown) {
    showToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể cập nhật trạng thái.');
  } finally {
    actionLoading.value = false;
  }
};

const handleMarkDelivering = async (req: PartRequest) => {
  if (!canOperate.value || actionLoading.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.markDelivering(req.id);
    const idx = requests.value.findIndex((r) => r.id === req.id);
    if (idx !== -1) requests.value[idx] = updated;
    showToast('success', 'Đã chuyển sang DELIVERING (Đang giao hàng).');
  } catch (err: unknown) {
    showToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể cập nhật trạng thái giao hàng.');
  } finally {
    actionLoading.value = false;
  }
};

const handleCancelRequest = async (req: PartRequest) => {
  if (!canOperate.value || actionLoading.value) return;
  if (!confirm(`Bạn có chắc chắn muốn hủy yêu cầu linh kiện ${req.id}?`)) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.cancel(req.id, 'Quản lý dịch vụ hủy');
    const idx = requests.value.findIndex((r) => r.id === req.id);
    if (idx !== -1) requests.value[idx] = updated;
    showToast('success', 'Đã hủy yêu cầu linh kiện.');
  } catch (err: unknown) {
    showToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Không thể hủy yêu cầu.');
  } finally {
    actionLoading.value = false;
  }
};

const copyToken = async (token: string) => {
  try {
    await navigator.clipboard.writeText(token);
    copiedToken.value = true;
    setTimeout(() => { copiedToken.value = false; }, 2000);
  } catch {
    // fallback
  }
};

const regenerateQr = async () => {
  if (!canOperate.value || actionLoading.value || !qrModalRequest.value) return;
  actionLoading.value = true;
  try {
    const updated = await partRequestsApi.regenerateQr(qrModalRequest.value.id);
    qrModalRequest.value = updated;
    const index = requests.value.findIndex(r => r.id === updated.id);
    if (index !== -1) requests.value[index] = updated;
    showToast('success', 'Đã tạo mã bàn giao mới. Mã cũ không còn hiệu lực.');
  } catch { showToast('error', 'Không thể tạo lại mã bàn giao. Vui lòng tải lại yêu cầu.'); }
  finally { actionLoading.value = false; }
};

const getStatusLabel = (status: PartRequestStatus | string) => {
  switch (status?.toLowerCase()) {
    case 'requested': return 'Chờ chuẩn bị';
    case 'ready': return 'Sẵn sàng giao';
    case 'delivering': return 'Đang giao hàng';
    case 'received': return 'Đã nhận / Đang dùng';
    case 'completed': return 'Hoàn tất';
    case 'cancelled': return 'Đã hủy';
    default: return status;
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

const getUsageStatusLabel = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending': return 'Đang giữ (Chưa chốt)';
    case 'used': return 'Đã dùng (chỉ tính phí đã duyệt)';
    case 'returned': return 'Đã trả lại (Miễn phí)';
    default: return status;
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
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Boxes class="text-brand-600" :size="24" />
          {{ canOperate ? 'Quản lý Yêu cầu Linh kiện' : 'Lịch sử Yêu cầu Linh kiện (chỉ đọc)' }}
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          {{ canOperate ? 'Chuẩn bị linh kiện và xác nhận bàn giao cho kỹ thuật viên.' : 'Xem trạng thái bàn giao và lịch sử USED / RETURNED.' }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton variant="secondary" size="sm" :disabled="loading" @click="loadData">
          <RefreshCw :size="14" class="mr-1" :class="{ 'animate-spin': loading }" /> Làm mới
        </FhButton>
      </div>
    </div>

    <!-- Scope disclaimer banner -->
    <div class="p-3 bg-blue-50/60 border border-blue-200 rounded-[var(--radius-sm)] text-xs text-blue-900 flex items-start gap-2">
      <Package :size="16" class="text-blue-600 mt-0.5 shrink-0" />
      <div>
        <span class="font-bold">Phạm vi Quản lý Yêu cầu Linh kiện:</span> Theo dõi và điều phối yêu cầu linh kiện thực tế từ kỹ thuật viên (Parts Request & Handover Tracking). Hệ thống không quản lý kho bãi / tồn kho (không quản lý nhập/xuất kho, supplier, purchase order hay kiểm kê tồn).
      </div>
    </div>

    <!-- Alert toast -->
    <div
      v-if="toastMessage"
      class="p-3 rounded text-xs flex items-center justify-between border"
      :class="toastMessage.type === 'success' ? 'bg-success-50 text-success-800 border-success-200' : 'bg-danger-50 text-danger-800 border-danger-200'"
    >
      <span>{{ toastMessage.text }}</span>
      <button @click="toastMessage = null" class="font-bold ml-2">×</button>
    </div>

    <p class="text-xs text-ink-500">Thống kê trên trang hiện tại</p>
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div class="p-3 bg-white border border-amber-200 rounded-[var(--radius-sm)] shadow-xs">
        <div class="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Chờ chuẩn bị</div>
        <div class="text-2xl font-extrabold text-amber-900 font-num mt-1">{{ stats.requested }}</div>
      </div>
      <div class="p-3 bg-white border border-blue-200 rounded-[var(--radius-sm)] shadow-xs">
        <div class="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Sẵn sàng (READY)</div>
        <div class="text-2xl font-extrabold text-blue-900 font-num mt-1">{{ stats.ready }}</div>
      </div>
      <div class="p-3 bg-white border border-purple-200 rounded-[var(--radius-sm)] shadow-xs">
        <div class="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Đang giao hàng</div>
        <div class="text-2xl font-extrabold text-purple-900 font-num mt-1">{{ stats.delivering }}</div>
      </div>
      <div class="p-3 bg-white border border-emerald-200 rounded-[var(--radius-sm)] shadow-xs">
        <div class="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Đã bàn giao (RECEIVED)</div>
        <div class="text-2xl font-extrabold text-emerald-900 font-num mt-1">{{ stats.received }}</div>
      </div>
      <div class="p-3 bg-white border border-gray-200 rounded-[var(--radius-sm)] shadow-xs">
        <div class="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Hoàn tất (COMPLETED)</div>
        <div class="text-2xl font-extrabold text-gray-800 font-num mt-1">{{ stats.completed }}</div>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-xs">
      <div class="relative flex-1 min-w-[240px] max-w-sm">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm theo mã yêu cầu, mã đơn, tên linh kiện..."
          class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <select
          v-model="statusFilter"
          class="h-9 px-3 bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700 focus:outline-none focus:border-brand-600"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="REQUESTED">Chờ chuẩn bị (REQUESTED)</option>
          <option value="READY">Sẵn sàng nhận (READY)</option>
          <option value="DELIVERING">Đang giao hàng (DELIVERING)</option>
          <option value="RECEIVED">Đã nhận hàng (RECEIVED)</option>
          <option value="COMPLETED">Đã hoàn tất (COMPLETED)</option>
          <option value="CANCELLED">Đã hủy (CANCELLED)</option>
        </select>

        <select
          v-model="typeFilter"
          class="h-9 px-3 bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700 focus:outline-none focus:border-brand-600"
        >
          <option value="ALL">Tất cả loại yêu cầu</option>
          <option value="PRE_REPAIR">Trước sửa chữa (PRE_REPAIR)</option>
          <option value="ADDITIONAL">Phát sinh (ADDITIONAL)</option>
        </select>

        <select
          v-model="fulfillmentFilter"
          class="h-9 px-3 bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700 focus:outline-none focus:border-brand-600"
        >
          <option value="ALL">Tất cả phương thức</option>
          <option value="PICKUP">Lấy tại kho (PICKUP)</option>
          <option value="DELIVERY">Giao tận nơi (DELIVERY)</option>
        </select>

        <select
          v-model="dateFilter"
          class="h-9 px-3 bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700 focus:outline-none focus:border-brand-600"
        >
          <option value="ALL">Mọi thời gian</option>
          <option value="today">Hôm nay</option>
          <option value="7days">7 ngày qua</option>
          <option value="30days">30 ngày qua</option>
        </select>
      </div>
    </div>

    <!-- Table -->
    <FhCard>
      <div v-if="loading" class="p-8 text-center text-xs text-ink-400">
        <RefreshCw :size="20" class="mx-auto animate-spin mb-2" />
        Đang tải dữ liệu yêu cầu linh kiện...
      </div>

      <div v-else-if="loadError" class="p-8 text-center text-danger-700" role="alert">{{ loadError }}</div>

      <div v-else-if="filteredRequests.length === 0" class="p-8 text-center text-xs text-ink-400">
        Không tìm thấy yêu cầu linh kiện nào phù hợp với bộ lọc.
      </div>

      <FhTable
        v-else
        :columns="[
          { key: 'code', label: 'Mã yêu cầu & Đơn hàng' },
          { key: 'type', label: 'Loại & Hình thức' },
          { key: 'items', label: 'Danh sách linh kiện' },
          { key: 'status', label: 'Trạng thái', width: '150px' },
          { key: 'time', label: 'Thời gian', width: '130px' },
          { key: 'actions', label: 'Thao tác', width: '190px' },
        ]"
        :rows="filteredRequests"
      >
        <template #cell-code="{ row }">
          <div class="font-mono text-xs font-bold text-ink-900">
            PR-{{ row.id.substring(0, 8).toUpperCase() }}
          </div>
          <div class="text-[11px] text-ink-500 font-mono mt-0.5">
            Đơn: <router-link :to="`/console/orders/${row.serviceOrderId}`" class="text-brand-600 hover:underline">
              {{ row.serviceOrderId.substring(0, 8).toUpperCase() }}
            </router-link>
          </div>
          <div class="text-[10px] text-ink-400 font-mono">
            Thợ: {{ row.technicianId.substring(0, 8) }}
          </div>
        </template>

        <template #cell-type="{ row }">
          <div class="flex flex-col gap-1 items-start">
            <span
              class="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
              :class="row.requestType === 'pre_repair' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-700 border border-amber-200'"
            >
              {{ row.requestType === 'pre_repair' ? 'Trước sửa chữa' : 'Phát sinh' }}
            </span>
            <span
              class="text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1"
              :class="row.fulfillmentMethod === 'delivery' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'"
            >
              <Truck v-if="row.fulfillmentMethod === 'delivery'" :size="11" />
              <Package v-else :size="11" />
              {{ row.fulfillmentMethod === 'delivery' ? 'Giao tận nơi' : 'Lấy tại kho' }}
            </span>
            <span v-if="row.fulfillmentMethod === 'delivery' && Number(row.shippingFee) > 0" class="text-[10px] text-ink-500 font-num">
              Ship: <FhMoney :amount="row.shippingFee" />
            </span>
          </div>
        </template>

        <template #cell-items="{ row }">
          <div class="space-y-1 max-w-sm">
            <div
              v-for="item in (row.items || []).slice(0, 3)"
              :key="item.id"
              class="text-xs flex items-center justify-between gap-2"
            >
              <span class="font-medium text-ink-800 line-clamp-1">
                • {{ item.partNameSnapshot }}
              </span>
              <div class="flex items-center gap-1 shrink-0">
                <span class="text-ink-500 font-num text-[11px]">x{{ item.quantity }}</span>
                <span
                  class="text-[9px] px-1 py-0.2 rounded border uppercase font-medium"
                  :class="getUsageBadgeClass(item.usageStatus)"
                >
                  {{ item.usageStatus }}
                </span>
              </div>
            </div>
            <div v-if="(row.items || []).length > 3" class="text-[10px] text-brand-600 font-semibold cursor-pointer hover:underline" @click="detailModalRequest = row">
              + Xem thêm {{ (row.items || []).length - 3 }} linh kiện khác...
            </div>
          </div>
        </template>

        <template #cell-status="{ row }">
          <div class="flex flex-col gap-1">
            <span
              class="text-[11px] font-bold px-2 py-0.5 rounded border inline-block text-center"
              :class="getStatusBadgeClass(row.status)"
            >
              {{ getStatusLabel(row.status) }}
            </span>
            <div v-if="row.qrToken && (row.status === 'ready' || row.status === 'delivering')" class="text-[10px] text-blue-700 font-mono flex items-center gap-1 cursor-pointer hover:underline" @click="qrModalRequest = row">
              <QrCode :size="12" /> Mã: {{ row.qrToken.substring(0, 10) }}...
            </div>
          </div>
        </template>

        <template #cell-time="{ row }">
          <div class="text-[11px] text-ink-700 font-num">
            {{ new Date(row.createdAt).toLocaleDateString('vi-VN') }}
          </div>
          <div class="text-[10px] text-ink-400 font-num">
            {{ new Date(row.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }}
          </div>
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center gap-1.5 flex-wrap">
            <!-- Mark Ready (When REQUESTED) -->
            <button
              v-if="canOperate && row.status.toLowerCase() === 'requested'"
              class="px-2 py-1 text-[11px] font-semibold bg-brand-600 text-white hover:bg-brand-700 rounded transition-colors flex items-center gap-1 shadow-xs"
              :disabled="actionLoading"
              @click="handleMarkReady(row)"
            >
              <CheckCircle :size="12" /> Chuẩn bị xong
            </button>

            <!-- View QR Handover (When READY or DELIVERING) -->
            <button
              v-if="['ready', 'delivering'].includes(row.status.toLowerCase()) && row.qrToken"
              class="px-2 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded transition-colors flex items-center gap-1"
              @click="qrModalRequest = row"
            >
              <QrCode :size="12" /> Mã QR
            </button>

            <!-- Mark Delivering (When READY and delivery) -->
            <button
              v-if="canOperate && row.status.toLowerCase() === 'ready' && row.fulfillmentMethod === 'delivery'"
              class="px-2 py-1 text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 rounded transition-colors flex items-center gap-1"
              :disabled="actionLoading"
              @click="handleMarkDelivering(row)"
            >
              <Truck :size="12" /> Giao hàng
            </button>

            <!-- Detail modal button -->
            <button
              class="p-1 text-ink-500 hover:text-brand-600 rounded hover:bg-ink-100 transition-colors"
              title="Xem chi tiết linh kiện & sử dụng"
              @click="detailModalRequest = row"
            >
              <Eye :size="15" />
            </button>

            <!-- Cancel button -->
            <button
              v-if="canOperate && ['requested', 'ready', 'delivering'].includes(row.status.toLowerCase())"
              class="p-1 text-ink-400 hover:text-danger-600 rounded hover:bg-danger-50 transition-colors"
              title="Hủy yêu cầu"
              :disabled="actionLoading"
              @click="handleCancelRequest(row)"
            >
              <XCircle :size="15" />
            </button>
          </div>
        </template>
      </FhTable>
    </FhCard>

    <div class="flex items-center justify-between text-xs">
      <span>Trang {{ page }} • {{ totalCount }} yêu cầu</span>
      <div class="flex gap-2">
        <FhButton size="sm" :disabled="loading || page <= 1" @click="changePage(-1)">Trước</FhButton>
        <FhButton size="sm" :disabled="loading || page * pageSize >= totalCount" @click="changePage(1)">Sau</FhButton>
      </div>
    </div>

    <!-- QR Handover Modal -->
    <div
      v-if="qrModalRequest"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs"
      @click.self="qrModalRequest = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
          <div class="flex items-center gap-2">
            <QrCode class="text-brand-600" :size="20" />
            <h3 class="font-bold text-ink-900 text-base">Mã QR Bàn giao Linh kiện</h3>
          </div>
          <button class="text-ink-400 hover:text-ink-700 text-lg font-bold" @click="qrModalRequest = null">✕</button>
        </div>

        <div class="text-xs text-ink-600">
          Yêu cầu: <strong class="text-ink-900 font-mono">PR-{{ qrModalRequest.id.substring(0, 8).toUpperCase() }}</strong>
          • Đơn: <strong class="text-ink-900 font-mono">{{ qrModalRequest.serviceOrderId.substring(0, 8).toUpperCase() }}</strong>
        </div>

        <!-- QR Code display -->
        <div class="flex flex-col items-center justify-center p-4 bg-ink-50 border border-ink-200 rounded-lg space-y-3">
          <img
            v-if="qrImage"
            :src="qrImage"
            alt="QR Token"
            class="w-48 h-48 bg-white p-2 rounded shadow-sm border border-ink-200"
          />
          <div class="w-full flex items-center justify-between gap-2 p-2 bg-white rounded border border-ink-200">
            <span class="font-mono text-xs font-bold text-blue-700 truncate select-all">
              {{ qrModalRequest.qrToken }}
            </span>
            <button
              class="px-2 py-1 text-[11px] font-semibold bg-ink-100 hover:bg-ink-200 text-ink-800 rounded flex items-center gap-1 shrink-0"
              @click="qrModalRequest.qrToken && copyToken(qrModalRequest.qrToken)"
            >
              <Check v-if="copiedToken" :size="12" class="text-success-600" />
              <Copy v-else :size="12" />
              {{ copiedToken ? 'Đã chép' : 'Sao chép' }}
            </button>
          </div>
        </div>

        <div class="text-[11px] text-ink-500 bg-blue-50 p-2.5 rounded border border-blue-200">
          💡 <strong>Hướng dẫn bàn giao:</strong> Kỹ thuật viên dùng camera điện thoại hoặc nút "Nhận linh kiện (Quét QR)" trên giao diện đơn hàng để quét hoặc nhập mã token trên. Sau khi quét, trạng thái sẽ tự động chuyển thành <strong>RECEIVED</strong>.
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <FhButton v-if="canOperate" variant="secondary" size="sm" :disabled="actionLoading" @click="regenerateQr">Tạo lại QR</FhButton>
          <FhButton variant="primary" size="sm" @click="qrModalRequest = null">
            Đóng
          </FhButton>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div
      v-if="detailModalRequest"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs"
      @click.self="detailModalRequest = null"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b pb-3">
          <div class="flex items-center gap-2">
            <Layers class="text-brand-600" :size="20" />
            <h3 class="font-bold text-ink-900 text-base">Chi tiết Yêu cầu Linh kiện</h3>
          </div>
          <button class="text-ink-400 hover:text-ink-700 text-lg font-bold" @click="detailModalRequest = null">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs text-ink-600 bg-ink-50 p-3 rounded border border-ink-200">
          <div>Mã yêu cầu: <strong class="text-ink-900 font-mono">{{ detailModalRequest.id }}</strong></div>
          <div>Mã đơn hàng: <strong class="text-ink-900 font-mono">{{ detailModalRequest.serviceOrderId }}</strong></div>
          <div>Loại: <strong class="text-ink-900 uppercase">{{ detailModalRequest.requestType }}</strong></div>
          <div>Hình thức: <strong class="text-ink-900 uppercase">{{ detailModalRequest.fulfillmentMethod }}</strong></div>
          <div>Trạng thái: <strong class="text-ink-900 uppercase">{{ detailModalRequest.status }}</strong></div>
          <div>Phí giao hàng: <strong class="text-ink-900 font-num"><FhMoney :amount="detailModalRequest.shippingFee || 0" /></strong></div>
        </div>

        <p class="text-xs text-ink-600">Đã nhận: {{ detailModalRequest.receivedAt ? new Date(detailModalRequest.receivedAt).toLocaleString('vi-VN') : 'Chưa nhận' }} • Hoàn tất: {{ detailModalRequest.completedAt ? new Date(detailModalRequest.completedAt).toLocaleString('vi-VN') : 'Chưa hoàn tất' }}</p>
        <div class="space-y-2">
          <h4 class="text-xs font-bold text-ink-800 uppercase tracking-wider">Danh sách linh kiện & Trạng thái sử dụng:</h4>
          <div class="border border-ink-200 rounded divide-y divide-ink-100">
            <div
              v-for="item in detailModalRequest.items || []"
              :key="item.id"
              class="p-2.5 text-xs flex items-center justify-between gap-2"
            >
              <div>
                <div class="font-semibold text-ink-900">{{ item.partNameSnapshot }}</div>
                <div class="text-[11px] text-ink-400 font-num">
                  Đơn giá: <FhMoney :amount="item.unitPriceSnapshot" /> • SL: {{ item.quantity }}
                </div>
              </div>

              <div class="text-right">
                <span
                  class="text-[10px] px-2 py-0.5 rounded border uppercase"
                  :class="getUsageBadgeClass(item.usageStatus)"
                >
                  {{ getUsageStatusLabel(item.usageStatus) }}
                </span>
                <div class="text-[10px] text-ink-400 mt-0.5">
                  Thành tiền: <strong class="font-num text-ink-800"><FhMoney :amount="item.unitPriceSnapshot * item.quantity" /></strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <FhButton variant="secondary" size="sm" @click="detailModalRequest = null">
            Đóng
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
