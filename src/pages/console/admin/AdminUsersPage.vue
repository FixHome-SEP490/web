<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Check, Copy, Plus, RotateCcw, X } from 'lucide-vue-next';
import { FhButton, FhConfirmDialog } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel } from '../../../components/console/console-ui';
import { userFacingError } from '../../../utils/user-facing-error';
import { validateEmail, validateFullName } from '../../../utils/input-validation';
import { adminControlsApi } from '../../../api/admin-controls.api';
import { warehousesApi, type Warehouse } from '../../../api/warehouses.api';
import {
  adminUsersApi,
  type AdminUserRecord,
  type AdminUserRole,
  type AdminUserStatus,
} from '../../../api/admin-users.api';
import { parseDayKey, vnParts } from '../../../utils/vn-time';

const columns: ConsoleColumn[] = [
  { key: 'name', label: 'Họ và tên' },
  { key: 'email', label: 'Email', hideBelow: 'xl' },
  { key: 'role', label: 'Vai trò' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'createdAt', label: 'Ngày tạo', hideBelow: 'xl' },
  { key: 'active', label: '', align: 'right' },
];

const roleFilter = ref<AdminUserRole | 'ALL'>('ALL');
const statusFilter = ref<AdminUserStatus | 'ALL'>('ALL');
const searchQuery = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const users = ref<AdminUserRecord[]>([]);
const loading = ref(true);
const error = ref('');
const loadError = ref('');
const successMessage = ref('');
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

// Plain Vietnamese reasons from the server are kept; codes and English never show.
const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

const loadUsers = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await adminUsersApi.getUsers({
      page: page.value,
      limit: pageSize,
      search: searchQuery.value.trim() || undefined,
      role: roleFilter.value === 'ALL' ? undefined : roleFilter.value,
      status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
    });
    if (requestId !== latestRequest) return;
    users.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    users.value = [];
    total.value = 0;
    loadError.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => {
  void loadUsers();
});

watch([searchQuery, roleFilter, statusFilter], () => {
  successMessage.value = '';
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadUsers();
  }
});

watch(page, (nextPage, previousPage) => {
  if (nextPage !== previousPage) void loadUsers();
});

const userToToggle = ref<AdminUserRecord | null>(null);
const showStatusModal = ref(false);
const mutationLoading = ref(false);

const nextStatus = computed<AdminUserStatus>(() =>
  userToToggle.value?.status === 'locked' || userToToggle.value?.status === 'suspended' ? 'active' : 'locked',
);

const canToggleStatus = (status: AdminUserStatus) =>
  status === 'active' || status === 'locked' || status === 'suspended';

const confirmStatusChange = async () => {
  if (
    !userToToggle.value ||
    mutationLoading.value ||
    !canToggleStatus(userToToggle.value.status)
  ) return;
  mutationLoading.value = true;
  error.value = '';
  try {
    const updated = await adminUsersApi.updateStatus(userToToggle.value.id, {
      status: nextStatus.value,
    });
    const index = users.value.findIndex((user) => user.id === updated.id);
    if (index >= 0) users.value[index] = updated;
    if (detailUser.value?.id === updated.id) detailUser.value = updated;
    successMessage.value = `Đã cập nhật trạng thái tài khoản của ${updated.fullName}.`;
    showStatusModal.value = false;
    userToToggle.value = null;
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa đổi được trạng thái tài khoản, vui lòng thử lại.');
  } finally {
    mutationLoading.value = false;
  }
};

const displayRole = (role: string) => {
  const r = role.toUpperCase();
  if (r === 'ADMIN') return 'Quản trị viên';
  if (r === 'SERVICE_MANAGER') return 'Quản lý dịch vụ';
  if (r === 'TECHNICIAN') return 'Kỹ thuật viên';
  return 'Khách hàng';
};

const statusLabel = (status: string) => {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'Đang hoạt động';
    case 'LOCKED':
      return 'Đã khoá';
    case 'SUSPENDED':
      return 'Tạm khoá';
    case 'PENDING_VERIFICATION':
      return 'Chưa xác minh';
    default:
      return 'Chưa rõ';
  }
};

const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'ACTIVE': return 'bg-success-500';
    case 'LOCKED':
    case 'SUSPENDED': return 'bg-danger-500';
    case 'PENDING_VERIFICATION': return 'bg-warning-500';
    default: return 'bg-ink-400';
  }
};

const statusPillClass = (status: string) => {
  switch (status.toUpperCase()) {
    case 'ACTIVE': return 'border-success-200/80 bg-success-50 text-success-700';
    case 'LOCKED':
    case 'SUSPENDED': return 'border-danger-200/80 bg-danger-50 text-danger-700';
    case 'PENDING_VERIFICATION': return 'border-warning-200/80 bg-warning-50 text-warning-700';
    default: return 'border-ink-200 bg-ink-100 text-ink-600';
  }
};

const rolePillClass = (role: string) => {
  const r = role.toUpperCase();
  if (r === 'ADMIN') return 'bg-brand-50 text-brand-700 border-brand-200/70';
  if (r === 'SERVICE_MANAGER') return 'bg-info-50 text-info-600 border-brand-200/50';
  if (r === 'TECHNICIAN') return 'bg-ink-100 text-ink-800 border-ink-200';
  return 'bg-ink-50 text-ink-600 border-ink-200/80';
};

const hasActiveFilters = computed(
  () => searchQuery.value.trim() !== '' || roleFilter.value !== 'ALL' || statusFilter.value !== 'ALL',
);

const resetFilters = () => {
  searchQuery.value = '';
  roleFilter.value = 'ALL';
  statusFilter.value = 'ALL';
};

const formatDate = (value: string) => {
  if (!value) return '—';

  // A plain calendar date stays that date; an instant is read in Vietnam time.
  const calendar = parseDayKey(value);
  const p = calendar ?? vnParts(value);

  const day = String(p.day).padStart(2, '0');
  const month = String(p.month).padStart(2, '0');
  const year = p.year;

  return `${day}/${month}/${year}`;
};

const getInitial = (name: string, email: string) => {
  if (name) return name.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return 'A';
};

// ADMIN 3: one account's details, read fresh from the server.
const detailUser = ref<AdminUserRecord | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
let latestDetail = 0;
async function openDetail(row: AdminUserRecord) {
  const requestId = ++latestDetail;
  detailOpen.value = true;
  detailUser.value = row;
  detailError.value = '';
  resetDetailActions();
  if (row.role.toUpperCase() === 'SERVICE_MANAGER') void loadWarehouses();
  detailLoading.value = true;
  try {
    const fresh = await adminUsersApi.getUser(row.id);
    if (requestId === latestDetail) detailUser.value = fresh;
  } catch (reason) {
    if (requestId === latestDetail) detailError.value = getErrorMessage(reason, 'Chưa tải được thông tin mới nhất của tài khoản.');
  } finally {
    if (requestId === latestDetail) detailLoading.value = false;
  }
}
// BUG 175: actions from the user detail. Lock or unlock reuses the confirm dialog above,
// a direct notice goes to this one account.
const notifyTitle = ref('');
const notifyMessage = ref('');
const notifySending = ref(false);
const detailNotice = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
function resetDetailActions() {
  notifyTitle.value = '';
  notifyMessage.value = '';
  detailNotice.value = null;
  assignWarehouseId.value = '';
  warehouses.value = [];
  warehouseError.value = '';
}
function askToggleFromDetail() {
  if (!detailUser.value || !canToggleStatus(detailUser.value.status)) return;
  userToToggle.value = detailUser.value;
  detailOpen.value = false;
  showStatusModal.value = true;
}
async function sendDirectNotice() {
  const user = detailUser.value;
  if (!user || notifySending.value || !notifyTitle.value.trim() || !notifyMessage.value.trim()) return;
  notifySending.value = true;
  detailNotice.value = null;
  try {
    await adminControlsApi.notifyUser({ userId: user.id, title: notifyTitle.value.trim(), message: notifyMessage.value.trim() });
    detailNotice.value = { tone: 'success', text: `Đã gửi thông báo tới ${user.fullName || user.email}.` };
    notifyTitle.value = '';
    notifyMessage.value = '';
  } catch (reason) {
    detailNotice.value = { tone: 'error', text: getErrorMessage(reason, 'Chưa gửi được thông báo, vui lòng thử lại.') };
  } finally {
    notifySending.value = false;
  }
}

// BUG 173: which warehouses a service manager is responsible for, and handing one more over.
const warehouses = ref<Warehouse[]>([]);
const warehouseError = ref('');
const assignWarehouseId = ref('');
const assigning = ref(false);
const managedWarehouses = computed(() => warehouses.value.filter((w) => w.responsibleUserId === detailUser.value?.id));
const otherWarehouses = computed(() => warehouses.value.filter((w) => w.responsibleUserId !== detailUser.value?.id && w.status === 'active'));
async function loadWarehouses() {
  warehouseError.value = '';
  try {
    warehouses.value = await warehousesApi.list();
  } catch (reason) {
    warehouseError.value = getErrorMessage(reason, 'Chưa tải được danh sách kho.');
  }
}
async function assignWarehouse() {
  const user = detailUser.value;
  if (!user || !assignWarehouseId.value || assigning.value) return;
  assigning.value = true;
  detailNotice.value = null;
  try {
    const updated = await warehousesApi.update(assignWarehouseId.value, { responsibleUserId: user.id });
    warehouses.value = warehouses.value.map((w) => (w.id === updated.id ? updated : w));
    detailNotice.value = { tone: 'success', text: `Đã giao ${updated.name} cho ${user.fullName || user.email}.` };
    assignWarehouseId.value = '';
  } catch (reason) {
    detailNotice.value = { tone: 'error', text: getErrorMessage(reason, 'Chưa giao được kho, vui lòng thử lại.') };
  } finally {
    assigning.value = false;
  }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const p = vnParts(value);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} ${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
};

// Tạo tài khoản Kỹ thuật viên (chỉ Admin/SM mới onboard được, tech không tự đăng ký)
const showCreateTechModal = ref(false);
const createTechForm = ref({ email: '', fullName: '', phoneNumber: '' });
const createTechLoading = ref(false);
const createTechError = ref('');
const createdTech = ref<{ email: string; fullName: string; tempPassword: string } | null>(null);
const passwordCopied = ref(false);

async function copyTempPassword() {
  if (!createdTech.value?.tempPassword || typeof navigator === 'undefined' || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(createdTech.value.tempPassword);
    passwordCopied.value = true;
    setTimeout(() => { passwordCopied.value = false; }, 1800);
  } catch {
    passwordCopied.value = false;
  }
}

function openCreateTechModal() {
  createTechForm.value = { email: '', fullName: '', phoneNumber: '' };
  createTechError.value = '';
  createdTech.value = null;
  passwordCopied.value = false;
  showCreateTechModal.value = true;
}

async function handleCreateTechnician() {
  if (createTechLoading.value) return;
  if (!createTechForm.value.email.trim() || !createTechForm.value.fullName.trim()) {
    createTechError.value = 'Nhập họ tên và email.';
    return;
  }
  // Cùng luật họ tên với máy chủ; trước đây emoji hay thẻ HTML chỉ nhận lỗi chung "Chưa tạo được tài khoản".
  const nameError = validateFullName(createTechForm.value.fullName);
  if (nameError) {
    createTechError.value = nameError + '.';
    return;
  }
  const emailError = validateEmail(createTechForm.value.email);
  if (emailError) {
    createTechError.value = emailError + '.';
    return;
  }
  const phone = createTechForm.value.phoneNumber.replace(/\s+/g, '').replace(/^\+84/, '0');
  if (phone && !/^0[35789]\d{8}$/.test(phone)) {
    createTechError.value = 'Số điện thoại phải là số di động Việt Nam 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.';
    return;
  }
  createTechLoading.value = true;
  createTechError.value = '';
  try {
    const { user, tempPassword } = await adminUsersApi.createTechnician({
      email: createTechForm.value.email.trim(),
      fullName: createTechForm.value.fullName.trim(),
      phoneNumber: phone || undefined,
    });
    createdTech.value = { email: user.email, fullName: user.fullName, tempPassword };
    void loadUsers();
  } catch (reason) {
    createTechError.value = getErrorMessage(reason, 'Chưa tạo được tài khoản, vui lòng thử lại.');
  } finally {
    createTechLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader
      class="animate-slide-up"
      title="Người dùng"
      artwork-src="/images/ui/console-users.png"
      :count="loading || loadError ? null : total"
    >
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openCreateTechModal">
          <Plus :size="16" aria-hidden="true" /> Tạo tài khoản thợ
        </FhButton>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadUsers">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="animate-slide-up-delay-1 rounded-[var(--radius-md)] border border-ink-200/90 bg-white p-3 shadow-(--shadow-e1) flex flex-wrap items-center gap-2.5">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm theo email hoặc tên" label="Tìm người dùng" />
      <select v-model="roleFilter" :class="consoleField" aria-label="Vai trò">
        <option value="ALL">Tất cả vai trò</option>
        <option value="admin">Quản trị viên</option>
        <option value="service_manager">Quản lý dịch vụ</option>
        <option value="technician">Kỹ thuật viên</option>
        <option value="customer">Khách hàng</option>
      </select>
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
        <option value="ALL">Tất cả trạng thái</option>
        <option value="active">Đang hoạt động</option>
        <option value="pending_verification">Chưa xác minh</option>
        <option value="suspended">Tạm khoá</option>
        <option value="locked">Đã khoá</option>
      </select>
      <button
        v-if="hasActiveFilters"
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-3 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        @click="resetFilters"
      >
        <RotateCcw :size="13" aria-hidden="true" />
        Đặt lại
      </button>
    </div>

    <Transition name="fh-fade-slide">
      <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    </Transition>
    <Transition name="fh-fade-slide">
      <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>
    </Transition>

    <div class="animate-slide-up-delay-2 space-y-5">
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadUsers" />
      <ConsoleTable
        v-else
        :columns="columns"
        :rows="users"
        :loading="loading"
        empty-text="Không tìm thấy người dùng."
      >
        <template #cell-name="{ row }">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 ring-1 ring-brand-200/70 text-sm font-semibold text-brand-700">
              <img v-if="row.avatarUrl" :src="row.avatarUrl" alt="" class="h-full w-full object-cover" />
              <span v-else aria-hidden="true">{{ getInitial(row.fullName, row.email) }}</span>
            </div>
            <div class="min-w-0">
              <button type="button" class="block max-w-full truncate text-left font-semibold text-ink-900 transition-colors hover:text-brand-700 hover:underline cursor-pointer" @click="openDetail(row)">{{ row.fullName || row.email.split('@')[0] }}</button>
              <div class="max-w-48 truncate text-xs text-ink-500 xl:hidden" :title="row.email">{{ row.email }}</div>
            </div>
          </div>
        </template>
        <template #cell-email="{ row }">
          <span class="block max-w-64 truncate text-ink-600" :title="row.email">{{ row.email }}</span>
        </template>
        <template #cell-role="{ row }">
          <span class="inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="rolePillClass(String(row.role))">{{ displayRole(String(row.role)) }}</span>
        </template>
        <template #cell-status="{ row }">
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="statusPillClass(String(row.status))">
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="getStatusColor(String(row.status))" aria-hidden="true"></span>
            <span>{{ statusLabel(String(row.status)) }}</span>
          </span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ formatDate(String(row.createdAt)) }}</span>
        </template>
        <template #cell-active="{ row }">
          <ConsoleMoreMenu label="Thao tác với tài khoản">
            <ConsoleMenuItem @click="openDetail(row)">Xem chi tiết</ConsoleMenuItem>
            <ConsoleMenuItem v-if="canToggleStatus(row.status)" :danger="row.status === 'active'" @click="userToToggle = row; showStatusModal = true">
              {{ row.status === 'active' ? 'Khoá tài khoản' : 'Mở khoá tài khoản' }}
            </ConsoleMenuItem>
          </ConsoleMoreMenu>
        </template>
      </ConsoleTable>

      <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
    </div>

    <FhConfirmDialog
      :open="showStatusModal"
      :loading="mutationLoading"
      :title="nextStatus === 'locked' ? 'Khoá tài khoản' : 'Mở khoá tài khoản'"
      :consequence="nextStatus === 'locked' ? 'Người dùng sẽ không đăng nhập được nữa.' : 'Người dùng đăng nhập lại được.'"
      :confirm-text="nextStatus === 'locked' ? 'Khoá tài khoản' : 'Mở khoá'"
      cancel-text="Quay lại"
      :danger="nextStatus === 'locked'"
      @confirm="confirmStatusChange"
      @cancel="showStatusModal = false"
    />

    <Transition name="fh-modal">
      <div
        v-if="detailOpen && detailUser"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-title"
        data-testid="user-detail"
        @click.self="detailOpen = false"
        @keydown.esc="detailOpen = false"
      >
        <div class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-(--shadow-e3)">
          <div class="flex items-start justify-between gap-3 border-b border-ink-100 px-6 py-4">
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 ring-1 ring-brand-200/70 text-lg font-semibold text-brand-700">
                <img v-if="detailUser.avatarUrl" :src="detailUser.avatarUrl" alt="" class="h-full w-full object-cover" />
                <span v-else aria-hidden="true">{{ getInitial(detailUser.fullName, detailUser.email) }}</span>
              </div>
              <div class="min-w-0">
                <h3 id="user-detail-title" class="truncate text-lg font-semibold text-ink-900">{{ detailUser.fullName }}</h3>
                <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" :class="rolePillClass(detailUser.role)">{{ displayRole(detailUser.role) }}</span>
                  <span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusPillClass(detailUser.status)">
                    <span class="h-1.5 w-1.5 rounded-full" :class="getStatusColor(detailUser.status)" aria-hidden="true"></span>
                    {{ statusLabel(detailUser.status) }}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" class="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="detailOpen = false">
              <X :size="18" aria-hidden="true" />
            </button>
          </div>
          <div class="space-y-4 overflow-y-auto overscroll-contain p-6">
            <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/80 bg-ink-50/70 px-4 text-sm">
              <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Email</dt><dd class="break-all text-right font-medium text-ink-900">{{ detailUser.email }}</dd></div>
              <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Số điện thoại</dt><dd class="text-right font-num font-medium text-ink-900">{{ detailUser.phoneNumber || '—' }}</dd></div>
              <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Trạng thái</dt><dd class="text-right font-medium text-ink-900">{{ statusLabel(detailUser.status) }}</dd></div>
              <div v-if="detailUser.bookingSuspendedUntil" class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Tạm khoá đặt lịch đến</dt><dd class="text-right font-num text-danger-700">{{ formatDateTime(detailUser.bookingSuspendedUntil) }}</dd></div>
              <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Ngày tạo</dt><dd class="text-right font-num text-ink-900">{{ formatDateTime(detailUser.createdAt) }}</dd></div>
              <div class="flex justify-between gap-3 py-2.5"><dt class="text-ink-500">Cập nhật gần nhất</dt><dd class="text-right font-num text-ink-900">{{ formatDateTime(detailUser.updatedAt) }}</dd></div>
              <div class="flex justify-between gap-3 py-2.5"><dt class="shrink-0 text-ink-500">Mã tài khoản</dt><dd class="break-all text-right font-num text-xs text-ink-600">{{ detailUser.id }}</dd></div>
            </dl>
            <p v-if="detailLoading" class="text-sm text-ink-500" role="status">Đang tải thông tin mới nhất…</p>
            <p v-if="detailError" class="text-sm text-danger-600" role="alert">{{ detailError }}</p>
            <p v-if="detailNotice" :role="detailNotice.tone === 'error' ? 'alert' : 'status'" data-testid="user-detail-notice" class="rounded-[var(--radius-sm)] border px-3 py-2 text-sm" :class="detailNotice.tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'">{{ detailNotice.text }}</p>

            <section v-if="detailUser.role.toUpperCase() === 'SERVICE_MANAGER'" class="space-y-2" aria-label="Kho phụ trách">
              <h4 class="text-sm font-semibold text-ink-900">Kho phụ trách</h4>
              <p v-if="warehouseError" class="text-sm text-danger-600" role="alert">{{ warehouseError }}</p>
              <ul v-else-if="managedWarehouses.length" class="space-y-1 text-sm text-ink-800" data-testid="user-detail-warehouses">
                <li v-for="w in managedWarehouses" :key="w.id">{{ w.name }}</li>
              </ul>
              <p v-else class="text-sm text-ink-500">Chưa phụ trách kho nào.</p>
              <div v-if="otherWarehouses.length" class="flex gap-2">
                <select v-model="assignWarehouseId" :class="[consoleField, 'min-w-0 flex-1']" aria-label="Chọn kho để giao" data-testid="user-detail-assign-select">
                  <option value="" disabled>Chọn kho để giao</option>
                  <option v-for="w in otherWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
                <FhButton size="sm" :disabled="!assignWarehouseId" :loading="assigning" data-testid="user-detail-assign" @click="assignWarehouse">Giao kho</FhButton>
              </div>
            </section>

            <form class="space-y-2" aria-label="Gửi thông báo" @submit.prevent="sendDirectNotice">
              <h4 class="text-sm font-semibold text-ink-900">Gửi thông báo cho tài khoản này</h4>
              <input v-model="notifyTitle" maxlength="200" :class="[consoleField, 'w-full']" placeholder="Tiêu đề" aria-label="Tiêu đề thông báo" data-testid="user-detail-notify-title" />
              <textarea v-model="notifyMessage" maxlength="2000" rows="3" :class="[consoleField, 'w-full h-auto py-2']" placeholder="Nội dung" aria-label="Nội dung thông báo" data-testid="user-detail-notify-message" />
              <div class="flex justify-end">
                <FhButton type="submit" size="sm" :disabled="!notifyTitle.trim() || !notifyMessage.trim()" :loading="notifySending" data-testid="user-detail-notify-send">Gửi</FhButton>
              </div>
            </form>

            <div class="flex flex-wrap justify-end gap-2">
              <FhButton v-if="canToggleStatus(detailUser.status)" :variant="detailUser.status === 'active' ? 'danger' : 'primary'" size="sm" data-testid="user-detail-toggle" @click="askToggleFromDetail">{{ detailUser.status === 'active' ? 'Khoá tài khoản' : 'Mở khoá tài khoản' }}</FhButton>
              <FhButton variant="secondary" size="sm" @click="detailOpen = false">Đóng</FhButton>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Create a technician account -->
    <Transition name="fh-modal">
      <div
        v-if="showCreateTechModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tech-title"
        @click.self="!createTechLoading && (showCreateTechModal = false)"
        @keydown.esc="showCreateTechModal = false"
      >
        <div class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 max-w-sm w-full p-6 space-y-5 shadow-(--shadow-e3)">
          <template v-if="!createdTech">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 id="create-tech-title" class="text-lg font-semibold text-ink-900">Tạo tài khoản kỹ thuật viên</h3>
                <p class="mt-1 text-sm text-ink-500">Mật khẩu tạm chỉ hiện một lần.</p>
              </div>
              <button type="button" class="rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="showCreateTechModal = false">
                <X :size="18" aria-hidden="true" />
              </button>
            </div>
            <form class="space-y-3" @submit.prevent="handleCreateTechnician">
              <label :class="consoleLabel">
                Họ và tên
                <input v-model="createTechForm.fullName" type="text" maxlength="200" autocomplete="name" :class="consoleField" class="h-10" />
              </label>
              <label :class="consoleLabel">
                Email đăng nhập
                <input v-model="createTechForm.email" type="email" autocomplete="email" :class="consoleField" class="h-10" />
              </label>
              <label :class="consoleLabel">
                Số điện thoại (không bắt buộc)
                <input v-model="createTechForm.phoneNumber" type="tel" autocomplete="tel" :class="consoleField" class="h-10 font-num" />
              </label>
              <p v-if="createTechError" class="text-sm text-danger-600" role="alert">{{ createTechError }}</p>
              <div class="flex justify-end gap-2 pt-1">
                <FhButton variant="secondary" size="sm" @click="showCreateTechModal = false">Huỷ</FhButton>
                <FhButton type="submit" variant="primary" size="sm" :loading="createTechLoading">Tạo tài khoản</FhButton>
              </div>
            </form>
          </template>
          <template v-else>
            <div>
              <h3 id="create-tech-title" class="text-lg font-semibold text-success-700">Đã tạo tài khoản</h3>
              <p class="mt-1 text-sm text-ink-600 text-pretty">{{ createdTech.fullName }} ({{ createdTech.email }}). Sao chép mật khẩu tạm và gửi cho thợ, đóng lại là không xem được nữa.</p>
            </div>
            <div class="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3.5">
              <span class="select-all break-all font-num text-base font-semibold text-ink-900">
                {{ createdTech.tempPassword }}
              </span>
              <button
                type="button"
                class="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100 cursor-pointer"
                @click="copyTempPassword"
              >
                <Check v-if="passwordCopied" :size="14" class="text-success-600" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
                <span>{{ passwordCopied ? 'Đã chép' : 'Sao chép' }}</span>
              </button>
            </div>
            <FhButton variant="primary" size="sm" block @click="showCreateTechModal = false">Đã sao chép, đóng lại</FhButton>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>
