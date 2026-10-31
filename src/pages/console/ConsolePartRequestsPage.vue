<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useAuthStore } from '../../stores/auth';
import { Copy, Check, X } from 'lucide-vue-next';
import { FhMoney, FhButton, FhConfirmDialog, FhSkeleton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { consoleField } from '../../components/console/console-ui';
import {
  partRequestsApi,
  createIdempotencyKey,
  isPartReturnsUnavailableError,
  type PartRequest,
  type PartRequestStatus,
  type PartRequestType,
  type FulfillmentMethod,
  type PartCustodyReturnRecord,
} from '../../api/part-requests.api';
import { vnDateString, vnDateTimeString, vnDayKey, vnKeyAndClockToDate, vnTimeString } from '../../utils/vn-time';
import { userFacingError } from '../../utils/user-facing-error';

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
const detailModalRequest = ref<PartRequest | null>(null);
const cancelTarget = ref<PartRequest | null>(null);
const copiedToken = ref(false);

// P1 hoàn trả linh kiện (owner lock 19/10/2026): kỹ thuật viên khai trả, quản lý
// dịch vụ kiểm tra thực tế và bấm "Đã nhận". Nhận thiếu thì phần còn lại vẫn chờ.
const returnQueue = ref<PartCustodyReturnRecord[]>([]);
const returnsLoading = ref(true);
const returnsUnavailable = ref(false);
const returnsLoadError = ref(false);
let returnsLoadVersion = 0;
const acceptDrafts = ref<Record<string, number>>({});
const acceptingKey = ref<string | null>(null);

const returnKey = (row: PartCustodyReturnRecord) =>
  `${row.partRequestId}:${row.partRequestItemId}`;

/** Khai trả nhưng chưa được nhận thực tế: đây là phần quản lý còn phải xác nhận. */
const pendingDeclaredQty = (row: PartCustodyReturnRecord) =>
  Math.max(0, row.declaredQty - row.managerAcceptedQty);

/** Số nhận thực tế tối đa: không quá phần đang chờ nhận của dòng này. */
const maxAcceptQty = (row: PartCustodyReturnRecord) =>
  Math.max(0, Math.min(row.outstandingQty, pendingDeclaredQty(row)));

const returnRequestCode = (row: PartCustodyReturnRecord) =>
  `PR-${row.partRequestId.substring(0, 8).toUpperCase()}`;

/** Reference for the counter: name when the Backend has it, otherwise a short code. */
const technicianRef = (row: PartCustodyReturnRecord) => {
  const name = row.technicianId ? (row.technicianName ?? '').trim() : '';
  if (name) return name;
  return row.technicianId ? `KT-${row.technicianId.substring(0, 8).toUpperCase()}` : '—';
};

const loadReturns = async () => {
  const version = ++returnsLoadVersion;
  returnsLoading.value = true;
  returnsUnavailable.value = false;
  returnsLoadError.value = false;
  try {
    const rows = await partRequestsApi.getPendingReturns();
    if (version !== returnsLoadVersion) return;
    returnQueue.value = rows;
    const drafts: Record<string, number> = {};
    for (const row of rows) drafts[returnKey(row)] = maxAcceptQty(row);
    acceptDrafts.value = drafts;
  } catch (err: unknown) {
    if (version !== returnsLoadVersion) return;
    returnQueue.value = [];
    acceptDrafts.value = {};
    // Cờ tính năng đang tắt hoặc không có quyền: ẩn mục hoàn trả, không chặn trang.
    if (isPartReturnsUnavailableError(err)) returnsUnavailable.value = true;
    else returnsLoadError.value = true;
  } finally {
    if (version === returnsLoadVersion) returnsLoading.value = false;
  }
};

const handleAcceptReturn = async (row: PartCustodyReturnRecord) => {
  if (!canOperate.value || acceptingKey.value) return;
  const key = returnKey(row);
  const maxQty = maxAcceptQty(row);
  const quantity = Number(acceptDrafts.value[key]);
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
      quantity < pendingDeclaredQty(row)
        ? 'Đã ghi nhận số lượng nhận thực tế. Phần còn lại vẫn chờ nhận.'
        : 'Đã ghi nhận số linh kiện đã nhận.',
    );
    await loadReturns();
  } catch (err: unknown) {
    showToast('error', userFacingError(err, 'Chưa ghi nhận được linh kiện hoàn trả, vui lòng thử lại.'));
    // Dòng đã bị người khác cập nhật: đọc lại để lấy đúng số và phiên bản.
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (status === 409) await loadReturns();
  } finally {
    acceptingKey.value = null;
  }
};
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
  } catch {
    if (version !== loadVersion) return;
    requests.value = [];
    loadError.value = true;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
};

onMounted(() => {
  void loadData();
  void loadReturns();
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
const hasQr = (req: PartRequest) => ['ready', 'delivering'].includes(req.status.toLowerCase()) && !!req.qrToken;
const canDeliver = (req: PartRequest) => req.status.toLowerCase() === 'ready' && req.fulfillmentMethod === 'delivery';
const typeLabel = (type: string) => (type === 'pre_repair' ? 'Trước sửa chữa' : 'Phát sinh');
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
    case 'returned': return 'Đã trả lại';
    default: return 'Chưa rõ';
  }
};

const getUsageStatusLabel = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending': return 'Đang giữ (chưa chốt)';
    case 'used': return 'Đã dùng (chỉ tính phí đã duyệt)';
    case 'returned': return 'Đã trả lại (miễn phí)';
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
          <ConsoleMenuItem :disabled="loading" @click="loadData">Làm mới</ConsoleMenuItem>
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

    <!-- P1: chờ nhận linh kiện hoàn trả (ẩn khi Backend chưa bật tính năng) -->
    <section
      v-if="!returnsUnavailable"
      data-testid="part-returns-queue"
      class="rounded-[var(--radius-md)] border border-ink-200 bg-white"
      aria-label="Linh kiện chờ nhận hoàn trả"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-ink-900">Chờ nhận linh kiện hoàn trả</h2>
          <span v-if="!returnsLoading && !returnsLoadError" class="font-num text-sm text-ink-500">{{ returnQueue.length }}</span>
        </div>
        <FhButton variant="ghost" size="sm" :disabled="returnsLoading" @click="loadReturns">Làm mới</FhButton>
      </header>

      <div v-if="returnsLoading" class="space-y-2 px-5 py-4" aria-busy="true" aria-label="Đang tải linh kiện chờ nhận">
        <FhSkeleton height="14px" width="30%" />
        <FhSkeleton height="40px" rounded="md" />
        <FhSkeleton height="40px" rounded="md" />
      </div>

      <div v-else-if="returnsLoadError" class="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm text-ink-600">
        <span>Chưa tải được danh sách chờ nhận.</span>
        <FhButton variant="secondary" size="sm" @click="loadReturns">Thử lại</FhButton>
      </div>

      <p v-else-if="returnQueue.length === 0" class="px-5 py-4 text-sm text-ink-500">
        Không có linh kiện nào đang chờ xác nhận hoàn trả.
      </p>

      <ul v-else class="divide-y divide-ink-100">
        <li v-for="row in returnQueue" :key="returnKey(row)" class="space-y-2 px-5 py-4">
          <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div class="min-w-0">
              <div class="font-medium text-ink-900">{{ row.partNameSnapshot }}</div>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                <span class="font-num">{{ returnRequestCode(row) }}</span>
                <router-link
                  v-if="row.orderId"
                  :to="`/console/orders/${row.orderId}`"
                  class="text-brand-700 hover:underline"
                >Xem đơn</router-link>
                <span>Kỹ thuật viên: <span class="font-num">{{ technicianRef(row) }}</span></span>
              </div>
            </div>
            <div class="whitespace-nowrap font-num text-xs text-ink-600">
              Cấp {{ row.issuedQty }} · Dùng {{ row.usedQty }} · Khai trả {{ row.declaredQty }} · Đã nhận {{ row.managerAcceptedQty }}
            </div>
          </div>

          <div v-if="canOperate" class="flex flex-wrap items-end gap-2">
            <div>
              <label
                :for="`accept-qty-${returnKey(row)}`"
                class="mb-1 block text-xs font-medium text-ink-700"
              >Số lượng nhận thực tế</label>
              <input
                :id="`accept-qty-${returnKey(row)}`"
                v-model.number="acceptDrafts[returnKey(row)]"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                :max="maxAcceptQty(row)"
                :class="consoleField"
                class="w-24"
              />
            </div>
            <span class="pb-2 text-xs text-ink-500">tối đa {{ maxAcceptQty(row) }}</span>
            <FhButton
              data-testid="accept-return"
              variant="primary"
              size="sm"
              class="mb-1.5"
              :loading="acceptingKey === returnKey(row)"
              :disabled="!!acceptingKey || returnsLoading"
              @click="handleAcceptReturn(row)"
            >Đã nhận</FhButton>
          </div>
          <p v-else class="text-xs text-ink-500">Chỉ quản lý dịch vụ xác nhận được số linh kiện đã nhận.</p>
        </li>
      </ul>
    </section>

    <ConsoleLoadError v-if="loadError" @retry="loadData" />
    <ConsoleTable
      v-else
      :columns="columns"
      :rows="requests"
      :loading="loading"
      empty-text="Không có yêu cầu linh kiện nào phù hợp."
    >
      <template #cell-code="{ row }">
        <button
          type="button"
          class="whitespace-nowrap font-num font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          @click="detailModalRequest = row"
        >{{ requestCode(row) }}</button>
        <div>
          <router-link :to="`/console/orders/${row.serviceOrderId}`" class="whitespace-nowrap text-xs text-ink-500 hover:text-brand-700 hover:underline">Xem đơn</router-link>
        </div>
      </template>

      <template #cell-items="{ row }">
        <ul class="max-w-72 min-w-40 space-y-0.5">
          <li v-for="item in (row.items || []).slice(0, 3)" :key="item.id" class="flex items-center justify-between gap-2">
            <span class="truncate text-ink-800" :title="item.partNameSnapshot">{{ item.partNameSnapshot }}</span>
            <span class="flex shrink-0 items-center gap-1.5">
              <span class="font-num text-xs text-ink-500">×{{ item.quantity }}</span>
              <span class="whitespace-nowrap rounded border px-1 text-[11px] font-medium" :class="getUsageBadgeClass(item.usageStatus)">{{ getUsageShortLabel(item.usageStatus) }}</span>
            </span>
          </li>
        </ul>
        <button
          v-if="(row.items || []).length > 3"
          type="button"
          class="mt-0.5 whitespace-nowrap text-xs font-medium text-brand-700 hover:underline"
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
            v-if="canOperate && row.status.toLowerCase() === 'requested'"
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
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Hình thức</dt><dd class="text-ink-900">{{ methodLabel(detailModalRequest.fulfillmentMethod) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Trạng thái</dt><dd class="text-ink-900">{{ getStatusLabel(detailModalRequest.status) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Phí giao hàng</dt><dd><FhMoney :amount="detailModalRequest.shippingFee || 0" /></dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Đã nhận</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ detailModalRequest.receivedAt ? vnDateTimeString(detailModalRequest.receivedAt) : 'Chưa nhận' }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Hoàn tất</dt><dd class="whitespace-nowrap font-num text-ink-900">{{ detailModalRequest.completedAt ? vnDateTimeString(detailModalRequest.completedAt) : 'Chưa hoàn tất' }}</dd></div>
        </dl>

        <div>
          <h4 class="mb-2 text-sm font-semibold text-ink-900">Linh kiện</h4>
          <ul class="divide-y divide-ink-100 rounded border border-ink-200">
            <li
              v-for="item in detailModalRequest.items || []"
              :key="item.id"
              class="flex items-center justify-between gap-3 p-2.5 text-sm"
            >
              <div class="min-w-0">
                <div class="font-medium text-ink-900">{{ item.partNameSnapshot }}</div>
                <div class="text-xs text-ink-500">
                  <span class="font-num">{{ Number(item.unitPriceSnapshot).toLocaleString('vi-VN') }}&nbsp;₫</span> × <span class="font-num">{{ item.quantity }}</span>
                </div>
              </div>
              <div class="shrink-0 text-right">
                <span class="whitespace-nowrap rounded border px-2 py-0.5 text-xs" :class="getUsageBadgeClass(item.usageStatus)">
                  {{ getUsageStatusLabel(item.usageStatus) }}
                </span>
                <div class="mt-0.5"><FhMoney :amount="item.unitPriceSnapshot * item.quantity" /></div>
              </div>
            </li>
          </ul>
        </div>

        <div class="flex justify-end">
          <FhButton variant="secondary" size="sm" @click="detailModalRequest = null">Đóng</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
