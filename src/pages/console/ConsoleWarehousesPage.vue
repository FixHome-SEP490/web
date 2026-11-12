<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { FhButton, FhConfirmDialog, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR } from '../../components/console/console-ui';
import { useAuthStore } from '../../stores/auth.store';
import { warehousesApi, type StockMovement, type Warehouse, type WarehouseStockRow } from '../../api/warehouses.api';
import { partsCatalogApi } from '../../api/parts-catalog.api';
import { adminUsersApi, type AdminUserRecord } from '../../api/admin-users.api';
import { userFacingError } from '../../utils/user-facing-error';
import { getHttpStatus } from '../../api/client';
import { canAdministerWarehouse } from '../../utils/warehouse-fulfillment';

const auth = useAuthStore();
const isAdmin = computed(() => canAdministerWarehouse(auth.userRole));
const warehouses = ref<Warehouse[]>([]);
const selectedId = ref('');
const stock = ref<WarehouseStockRow[]>([]);
const movements = ref<StockMovement[]>([]);
const activeTab = ref<'stock' | 'movements'>('stock');
const loading = ref(true);
const dataLoading = ref(false);
const saving = ref(false);
const error = ref('');
const loadError = ref('');
const success = ref('');
const stockMeta = ref({ total: 0, limit: 50, offset: 0 });
const movementMeta = ref({ total: 0, limit: 50, offset: 0 });
const pageSize = 50;
const offset = ref(0);
const selectedWarehouse = computed(() => warehouses.value.find((warehouse) => warehouse.id === selectedId.value) ?? null);
const canAdjust = computed(() => Boolean(selectedWarehouse.value?.status === 'active'));
const columns: ConsoleColumn[] = [
  { key: 'partName', label: 'Linh kiện' },
  { key: 'sku', label: 'SKU', hideBelow: 'lg' },
  { key: 'onHand', label: 'Tồn thực tế', align: 'right' },
  { key: 'reserved', label: 'Đã giữ', align: 'right', hideBelow: 'md' },
  { key: 'available', label: 'Khả dụng', align: 'right' },
];
const movementColumns: ConsoleColumn[] = [
  { key: 'partId', label: 'Linh kiện' },
  { key: 'kind', label: 'Loại' },
  { key: 'delta', label: 'Thay đổi', align: 'right' },
  { key: 'onHandAfter', label: 'Tồn sau điều chỉnh', align: 'right', hideBelow: 'md' },
  { key: 'reason', label: 'Lý do' },
];

const createForm = ref({ name: '', address: '', responsibleUserId: '' });
const managers = ref<AdminUserRecord[]>([]);
const managerLoadError = ref('');
const selectedManager = computed(() =>
  managers.value.find((manager) => manager.id === selectedWarehouse.value?.responsibleUserId) ?? null);
const editing = ref<Warehouse | null>(null);
const editForm = ref({ name: '', address: '', responsibleUserId: '', status: 'active' as 'active' | 'inactive' });
const warehouseToDelete = ref<Warehouse | null>(null);
const deleteLoading = ref(false);

const parts = ref<{ id: string; name: string; sku: string | null; isActive: boolean }[]>([]);
const partId = ref('');
const adjustment = ref({ kind: 'stock_in' as 'stock_in' | 'correction', delta: '1', reason: '' });
// BUG DETECTOR 79: a retry reuses the key only for the same command at the same warehouse.
const pendingCommand = ref<{ warehouseId: string; partId: string; delta: number; kind: 'stock_in' | 'correction'; reason: string; idempotencyKey: string } | null>(null);
const quantityError = computed(() => {
  const quantity = Number(adjustment.value.delta);
  if (!Number.isSafeInteger(quantity) || quantity === 0) return 'Nhập số lượng nguyên khác 0.';
  if (adjustment.value.kind === 'stock_in' && quantity < 1) return 'Nhập kho cần số lượng dương.';
  if (!partId.value) return 'Chọn linh kiện đang hoạt động trong danh mục.';
  if (!adjustment.value.reason.trim()) return 'Nhập lý do điều chỉnh.';
  return '';
});

const formatError = (reason: unknown, fallback = CONSOLE_LOAD_ERROR) => userFacingError(reason, fallback);

async function loadManagers() {
  if (!isAdmin.value) return;
  managerLoadError.value = '';
  try {
    const page = await adminUsersApi.getUsers({ role: 'service_manager', status: 'active', page: 1, limit: 100 });
    managers.value = page.data.filter((user) => user.isActive && user.status === 'active');
    for (let current = 2; current <= page.meta.totalPages; current += 1) {
      const next = await adminUsersApi.getUsers({ role: 'service_manager', status: 'active', page: current, limit: 100 });
      managers.value.push(...next.data.filter((user) => user.isActive && user.status === 'active'));
    }
  } catch (reason) {
    managers.value = [];
    managerLoadError.value = formatError(reason, 'Chưa tải được danh sách quản lý đang hoạt động.');
  }
}

async function loadWarehouses(preferredId?: string) {
  loading.value = true;
  loadError.value = '';
  try {
    warehouses.value = await warehousesApi.list();
    selectedId.value = preferredId && warehouses.value.some((item) => item.id === preferredId)
      ? preferredId
      : warehouses.value.some((item) => item.id === selectedId.value) ? selectedId.value : warehouses.value[0]?.id ?? '';
  } catch (reason) {
    warehouses.value = [];
    selectedId.value = '';
    loadError.value = formatError(reason);
  } finally {
    loading.value = false;
  }
}

async function loadCatalog() {
  try {
    const first = await partsCatalogApi.getCatalog({ page: 1, limit: 100 });
    const catalog = [...first.data];
    for (let current = 2; current <= first.meta.totalPages; current += 1) {
      catalog.push(...(await partsCatalogApi.getCatalog({ page: current, limit: 100 })).data);
    }
    parts.value = catalog.filter((part) => part.isActive).map(({ id, name, sku, isActive }) => ({ id, name, sku, isActive }));
  } catch {
    parts.value = [];
    error.value = 'Chưa tải được danh mục linh kiện đang hoạt động.';
  }
}

// BUG DETECTOR 78: switching warehouse or tab quickly could let a slower, older answer
// overwrite the rows of the warehouse now on screen. Only the latest load may write.
let rowsLoad = 0;
async function loadRows() {
  const ticket = ++rowsLoad;
  if (!selectedId.value) { stock.value = []; movements.value = []; dataLoading.value = false; return; }
  const warehouseId = selectedId.value;
  const tab = activeTab.value;
  dataLoading.value = true;
  loadError.value = '';
  try {
    const query = { limit: pageSize, offset: offset.value };
    if (tab === 'stock') {
      const result = await warehousesApi.getStock(warehouseId, query);
      if (ticket !== rowsLoad) return;
      stock.value = result.data;
      stockMeta.value = result.meta;
    } else {
      const result = await warehousesApi.getMovements(warehouseId, query);
      if (ticket !== rowsLoad) return;
      movements.value = result.data;
      movementMeta.value = result.meta;
    }
  } catch (reason) {
    if (ticket !== rowsLoad) return;
    stock.value = [];
    movements.value = [];
    loadError.value = formatError(reason);
  } finally {
    if (ticket === rowsLoad) dataLoading.value = false;
  }
}

onMounted(() => {
  void Promise.all([loadWarehouses(), loadCatalog(), loadManagers()]);
});
watch([selectedId, activeTab], () => { offset.value = 0; void loadRows(); });
watch(offset, () => { void loadRows(); });

async function createWarehouse() {
  if (!isAdmin.value || saving.value || !createForm.value.name.trim() || !createForm.value.responsibleUserId || !managers.value.some((manager) => manager.id === createForm.value.responsibleUserId)) return;
  saving.value = true; error.value = ''; success.value = '';
  try {
    const warehouse = await warehousesApi.create({ name: createForm.value.name.trim(), address: createForm.value.address.trim() || undefined, responsibleUserId: createForm.value.responsibleUserId });
    createForm.value = { name: '', address: '', responsibleUserId: '' };
    success.value = 'Đã tạo kho. Kho mới chưa có tồn kho.';
    await loadWarehouses(warehouse.id);
    await loadRows();
  } catch (reason) { error.value = formatError(reason, 'Chưa tạo được kho.'); }
  finally { saving.value = false; }
}

function startEdit(warehouse: Warehouse) {
  editing.value = warehouse;
  editForm.value = { name: warehouse.name, address: warehouse.address ?? '', responsibleUserId: warehouse.responsibleUserId, status: warehouse.status };
}

async function saveEdit() {
  if (!editing.value || !isAdmin.value || saving.value) return;
  if (!managers.value.some((manager) => manager.id === editForm.value.responsibleUserId)) { error.value = 'Chọn quản lý đang hoạt động.'; return; }
  saving.value = true; error.value = ''; success.value = '';
  try {
    await warehousesApi.update(editing.value.id, { name: editForm.value.name.trim(), address: editForm.value.address.trim() || undefined, responsibleUserId: editForm.value.responsibleUserId, status: editForm.value.status });
    editing.value = null; success.value = 'Đã cập nhật kho.'; await loadWarehouses(); await loadRows();
  } catch (reason) { error.value = formatError(reason, 'Chưa cập nhật được kho.'); }
  finally { saving.value = false; }
}

async function deleteWarehouse() {
  if (!warehouseToDelete.value || !isAdmin.value || deleteLoading.value) return;
  deleteLoading.value = true;
  try {
    await warehousesApi.remove(warehouseToDelete.value.id);
    const deletedId = warehouseToDelete.value.id;
    warehouseToDelete.value = null;
    success.value = 'Đã xóa kho.';
    await loadWarehouses(selectedId.value === deletedId ? undefined : selectedId.value);
  } catch (reason) { error.value = formatError(reason, 'Chưa xóa được kho. Kho đã có tồn hoặc lịch sử không thể xóa.'); }
  finally { deleteLoading.value = false; }
}

async function submitAdjustment() {
  if (!selectedWarehouse.value || !canAdjust.value || saving.value || quantityError.value) return;
  const delta = Number(adjustment.value.delta);
  const warehouseId = selectedWarehouse.value.id;
  const sameCommand = pendingCommand.value
    && pendingCommand.value.warehouseId === warehouseId
    && pendingCommand.value.partId === partId.value
    && pendingCommand.value.delta === delta
    && pendingCommand.value.kind === adjustment.value.kind
    && pendingCommand.value.reason === adjustment.value.reason.trim();
  const command = sameCommand ? pendingCommand.value! : {
    warehouseId,
    partId: partId.value,
    delta,
    kind: adjustment.value.kind,
    reason: adjustment.value.reason.trim(),
    idempotencyKey: crypto.randomUUID(),
  };
  pendingCommand.value = command;
  saving.value = true; error.value = ''; success.value = '';
  try {
    const { warehouseId: target, ...payload } = command;
    await warehousesApi.adjustStock(target, payload);
    pendingCommand.value = null;
    success.value = 'Đã ghi nhận điều chỉnh tồn kho.';
    await loadRows();
    void loadPicked();
    activeTab.value = 'stock';
  } catch (reason) {
    // W-10: a definite refusal (4xx) is not worth retrying: free the form so the manager can fix it.
    // Only a lost answer (network, timeout, 5xx) keeps the same command for a safe retry.
    const status = getHttpStatus(reason);
    const refused = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
    if (refused) {
      pendingCommand.value = null;
      error.value = status === 422
        ? 'Không ghi nhận được: số lượng trừ vượt tồn khả dụng, hoặc thay đổi bằng 0. Kiểm tra lại số lượng.'
        : formatError(reason, 'Không ghi nhận được điều chỉnh. Kiểm tra lại thông tin.');
    } else {
      error.value = formatError(reason, 'Chưa xác nhận được kết quả. Có thể thử lại cùng lệnh.');
    }
  }
  finally { saving.value = false; }
}

// W-11: the chosen SKU may sit on another page of the stock list (20 of 888 rows), so read its row from the server.
const pickedStock = ref<WarehouseStockRow | null>(null);
let pickedLoad = 0;
async function loadPicked() {
  const part = partId.value;
  const warehouseId = selectedId.value;
  const ticket = ++pickedLoad;
  pickedStock.value = null;
  if (!part || !warehouseId || stock.value.some((row) => row.partId === part)) return;
  try {
    const result = await warehousesApi.getStock(warehouseId, { partId: part, limit: 1, offset: 0 });
    if (ticket === pickedLoad) pickedStock.value = result.data.find((row) => row.partId === part) ?? null;
  } catch { /* the hint stays empty; the server still checks the balance */ }
}
watch([partId, selectedId], () => { void loadPicked(); });
const activeStock = computed(() => stock.value.find((row) => row.partId === partId.value) ?? pickedStock.value);
const currentPage = computed(() => Math.floor(offset.value / pageSize) + 1);
const currentTotalPages = computed(() => Math.max(1, Math.ceil((activeTab.value === 'stock' ? stockMeta.value.total : movementMeta.value.total) / pageSize)));
// BUG DETECTOR 80: part request movements now appear in the log beside manual changes.
const MOVEMENT_KINDS: Record<string, string> = {
  stock_in: 'Nhập kho', correction: 'Điều chỉnh', reserve: 'Giữ cho yêu cầu', release: 'Nhả giữ',
  issue: 'Xuất giao thợ', return: 'Nhận trả',
};
function movementKind(kind: string) { return MOVEMENT_KINDS[kind] ?? 'Điều chỉnh'; }
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Kho và tồn linh kiện" :count="loading ? null : warehouses.length" />

    <p v-if="error" role="alert" class="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{{ error }}</p>
    <p v-if="success" role="status" class="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-800">{{ success }}</p>

    <section v-if="isAdmin" class="rounded-lg border border-ink-200 bg-white p-4">
      <h2 class="text-base font-semibold text-ink-900">Thêm kho</h2>
      <p v-if="managerLoadError" class="mt-2 text-sm text-danger-700">{{ managerLoadError }}</p>
      <p v-else-if="!managers.length" class="mt-2 text-sm text-ink-600">Chưa có quản lý dịch vụ đang hoạt động để giao phụ trách.</p>
      <form class="mt-3 grid gap-3 md:grid-cols-2" @submit.prevent="createWarehouse">
        <label class="space-y-1 text-sm font-medium text-ink-700">Tên kho<input v-model="createForm.name" required maxlength="120" class="w-full rounded-md border border-ink-300 px-3 py-2" /></label>
        <label class="space-y-1 text-sm font-medium text-ink-700">Địa chỉ<input v-model="createForm.address" maxlength="500" class="w-full rounded-md border border-ink-300 px-3 py-2" /></label>
        <label class="space-y-1 text-sm font-medium text-ink-700">Quản lý phụ trách<select v-model="createForm.responsibleUserId" required class="w-full rounded-md border border-ink-300 px-3 py-2"><option value="" disabled>Chọn quản lý đang hoạt động</option><option v-for="manager in managers" :key="manager.id" :value="manager.id">{{ manager.fullName }} · {{ manager.email }}</option></select></label>
        <div class="flex items-end"><FhButton type="submit" size="sm" :loading="saving" :disabled="!managers.length">Tạo kho</FhButton></div>
      </form>
    </section>

    <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadWarehouses(); loadRows()" />
    <section v-else-if="!loading && !warehouses.length" class="rounded-lg border border-ink-200 bg-white p-8 text-center text-sm text-ink-600">
      {{ isAdmin ? 'Chưa có kho nào. Tạo kho để bắt đầu quản lý tồn.' : 'Bạn chưa được giao phụ trách kho nào.' }}
    </section>

    <template v-else-if="warehouses.length">
      <section class="flex flex-wrap items-end gap-3 rounded-lg border border-ink-200 bg-white p-4">
        <label class="min-w-64 flex-1 space-y-1 text-sm font-medium text-ink-700">Kho<select v-model="selectedId" class="w-full rounded-md border border-ink-300 px-3 py-2"><option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}<template v-if="warehouse.status !== 'active'"> · Ngừng hoạt động</template></option></select></label>
        <FhStatusPill :status="selectedWarehouse?.status === 'active' ? 'success' : 'warning'" :label="selectedWarehouse?.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'" />
        <span class="text-sm text-ink-600">{{ selectedWarehouse?.address || 'Chưa có địa chỉ' }}</span>
        <span v-if="isAdmin && selectedWarehouse" class="text-sm text-ink-700">
          Quản lý phụ trách: <strong>{{ selectedManager?.fullName || 'Chưa xác định' }}</strong>
          <span v-if="selectedManager?.email"> ({{ selectedManager.email }})</span>
        </span>
        <template v-if="isAdmin && selectedWarehouse">
          <FhButton variant="secondary" size="sm" @click="startEdit(selectedWarehouse)">Sửa kho</FhButton>
          <FhButton variant="danger" size="sm" @click="warehouseToDelete = selectedWarehouse">Xóa kho</FhButton>
        </template>
      </section>

      <section v-if="isAdmin && editing" class="rounded-lg border border-ink-200 bg-white p-4">
        <h2 class="font-semibold text-ink-900">Cập nhật kho</h2>
        <form class="mt-3 grid gap-3 md:grid-cols-2" @submit.prevent="saveEdit">
          <label class="space-y-1 text-sm font-medium text-ink-700">Tên kho<input v-model="editForm.name" required maxlength="120" class="w-full rounded-md border border-ink-300 px-3 py-2" /></label>
          <label class="space-y-1 text-sm font-medium text-ink-700">Địa chỉ<input v-model="editForm.address" maxlength="500" class="w-full rounded-md border border-ink-300 px-3 py-2" /></label>
          <label class="space-y-1 text-sm font-medium text-ink-700">Quản lý phụ trách<select v-model="editForm.responsibleUserId" required class="w-full rounded-md border border-ink-300 px-3 py-2"><option v-for="manager in managers" :key="manager.id" :value="manager.id">{{ manager.fullName }} · {{ manager.email }}</option></select></label>
          <label class="space-y-1 text-sm font-medium text-ink-700">Trạng thái<select v-model="editForm.status" class="w-full rounded-md border border-ink-300 px-3 py-2"><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label>
          <div class="flex gap-2"><FhButton type="submit" size="sm" :loading="saving">Lưu thay đổi</FhButton><FhButton type="button" variant="secondary" size="sm" @click="editing = null">Đóng</FhButton></div>
        </form>
      </section>

      <section class="rounded-lg border border-ink-200 bg-white p-4">
        <h2 class="text-base font-semibold text-ink-900">Điều chỉnh tồn</h2>
        <p v-if="!canAdjust" class="mt-2 text-sm text-warning-800">Kho ngừng hoạt động; không thể điều chỉnh tồn.</p>
        <form class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5" @submit.prevent="submitAdjustment">
          <label class="space-y-1 text-sm font-medium text-ink-700 xl:col-span-2">SKU đang hoạt động<select v-model="partId" required :disabled="Boolean(pendingCommand)" class="w-full rounded-md border border-ink-300 px-3 py-2"><option value="" disabled>Chọn từ danh mục linh kiện</option><option v-for="part in parts" :key="part.id" :value="part.id">{{ part.name }} · {{ part.sku || 'Chưa có SKU' }}</option></select></label>
          <label class="space-y-1 text-sm font-medium text-ink-700">Loại<select v-model="adjustment.kind" :disabled="Boolean(pendingCommand)" class="w-full rounded-md border border-ink-300 px-3 py-2"><option value="stock_in">Nhập kho</option><option value="correction">Điều chỉnh kiểm kê</option></select></label>
          <label class="space-y-1 text-sm font-medium text-ink-700">{{ adjustment.kind === 'stock_in' ? 'Số lượng nhập' : 'Thay đổi (+/-)' }}<input v-model="adjustment.delta" required inputmode="numeric" type="number" step="1" :disabled="Boolean(pendingCommand)" class="w-full rounded-md border border-ink-300 px-3 py-2" /></label>
          <label class="space-y-1 text-sm font-medium text-ink-700">Lý do<input v-model="adjustment.reason" required maxlength="500" :disabled="Boolean(pendingCommand)" class="w-full rounded-md border border-ink-300 px-3 py-2" /></label>
          <p v-if="partId && activeStock" class="text-sm text-ink-600 md:col-span-2 xl:col-span-4">Tồn hiện tại: {{ activeStock.onHand }} · Đã giữ: {{ activeStock.reserved }} · Khả dụng: {{ activeStock.available }}</p>
          <p v-else-if="partId" class="text-sm text-ink-600 md:col-span-2 xl:col-span-4">Chưa có dòng tồn kho được ghi nhận cho SKU này.</p>
          <FhButton type="submit" size="sm" :loading="saving" :disabled="!canAdjust || Boolean(quantityError)" class="md:col-start-2 xl:col-start-5">{{ pendingCommand ? 'Thử lại cùng lệnh' : 'Ghi nhận' }}</FhButton>
          <p v-if="quantityError" class="text-xs text-ink-500 md:col-span-2 xl:col-span-4">{{ quantityError }}</p>
        </form>
      </section>

      <section class="space-y-3">
        <div class="flex gap-2" role="tablist" aria-label="Dữ liệu kho">
          <button type="button" role="tab" :aria-selected="activeTab === 'stock'" class="min-h-10 rounded-md px-3 text-sm font-medium" :class="activeTab === 'stock' ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-50'" @click="activeTab = 'stock'">Tồn kho</button>
          <button type="button" role="tab" :aria-selected="activeTab === 'movements'" class="min-h-10 rounded-md px-3 text-sm font-medium" :class="activeTab === 'movements' ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-50'" @click="activeTab = 'movements'">Lịch sử điều chỉnh</button>
        </div>
        <ConsoleTable v-if="activeTab === 'stock'" :columns="columns" :rows="stock" :loading="dataLoading" empty-text="Kho chưa có dòng tồn được ghi nhận.">
          <template #cell-sku="{ row }">{{ row.sku || '—' }}</template>
          <template #cell-onHand="{ row }">{{ row.onHand }}</template>
          <template #cell-reserved="{ row }">{{ row.reserved }}</template>
          <template #cell-available="{ row }">{{ row.available }}</template>
        </ConsoleTable>
        <ConsoleTable v-else :columns="movementColumns" :rows="movements" :loading="dataLoading" empty-text="Chưa có lịch sử điều chỉnh.">
          <template #cell-partId="{ row }">{{ parts.find((part) => part.id === row.partId)?.name || row.partId }}</template>
          <template #cell-kind="{ row }">{{ movementKind(row.kind) }}</template>
          <template #cell-delta="{ row }">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</template>
        </ConsoleTable>
        <div v-if="currentTotalPages > 1" class="flex items-center justify-end gap-2 text-sm"><FhButton variant="secondary" size="sm" :disabled="currentPage <= 1 || dataLoading" @click="offset = Math.max(0, offset - pageSize)">Trước</FhButton><span>Trang {{ currentPage }} / {{ currentTotalPages }}</span><FhButton variant="secondary" size="sm" :disabled="currentPage >= currentTotalPages || dataLoading" @click="offset += pageSize">Sau</FhButton></div>
      </section>
    </template>

    <FhConfirmDialog :open="Boolean(warehouseToDelete)" title="Xóa kho?" consequence="Kho có tồn kho hoặc lịch sử điều chỉnh sẽ được Backend từ chối xóa." confirm-text="Xóa kho" :loading="deleteLoading" @confirm="deleteWarehouse" @cancel="warehouseToDelete = null" />
  </div>
</template>
