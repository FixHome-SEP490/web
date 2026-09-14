<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Users, Lock, Unlock, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { FhButton, FhCard, FhTable, FhStatusPill, FhConfirmDialog, type TableColumn } from '../../../components';
import {
  adminUsersApi,
  type AdminUserRecord,
  type AdminUserRole,
  type AdminUserStatus,
} from '../../../api/admin-users.api';

const columns: TableColumn[] = [
  { key: 'name', label: 'Họ và tên' },
  { key: 'email', label: 'Email & SĐT' },
  { key: 'role', label: 'Vai trò', width: '150px' },
  { key: 'createdAt', label: 'Ngày tạo', width: '120px' },
  { key: 'status', label: 'Trạng thái', width: '150px' },
  { key: 'actions', label: 'Thao tác', width: '100px' },
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
const successMessage = ref('');
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

function getErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason !== null && 'response' in reason) {
    const response = (reason as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return fallback;
}

const loadUsers = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
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
    error.value = getErrorMessage(reason, 'Không thể tải danh sách người dùng từ Backend.');
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
  userToToggle.value?.status === 'locked' ? 'active' : 'locked',
);

const canToggleStatus = (status: AdminUserStatus) =>
  status === 'active' || status === 'locked';

const triggerToggleStatus = (user: AdminUserRecord) => {
  if (!canToggleStatus(user.status)) return;
  userToToggle.value = user;
  showStatusModal.value = true;
  error.value = '';
  successMessage.value = '';
};

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
    successMessage.value = `Đã cập nhật trạng thái tài khoản của ${updated.fullName}.`;
    showStatusModal.value = false;
    userToToggle.value = null;
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Không thể cập nhật trạng thái tài khoản.');
  } finally {
    mutationLoading.value = false;
  }
};

const displayRole = (role: string) => role.toUpperCase();

const roleClass = (role: string) => ({
  'bg-purple-100 text-purple-800': displayRole(role) === 'ADMIN',
  'bg-blue-100 text-blue-800': displayRole(role) === 'SERVICE_MANAGER',
  'bg-brand-100 text-brand-800': displayRole(role) === 'TECHNICIAN',
  'bg-ink-100 text-ink-800': displayRole(role) === 'CUSTOMER',
});

const statusLabel = (status: string) => {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'Hoạt động';
    case 'LOCKED':
      return 'Đã khoá';
    case 'SUSPENDED':
      return 'Tạm đình chỉ';
    case 'PENDING_VERIFICATION':
      return 'Chờ xác minh';
    default:
      return status;
  }
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Users class="text-brand-600" :size="24" />
          Quản trị Danh bạ Người dùng
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Quản lý trạng thái tài khoản của Admin, Service Manager, Kỹ thuật viên và Khách hàng.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :loading="loading" @click="loadUsers">
        <RefreshCw :size="15" /> Làm mới
      </FhButton>
    </div>

    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadUsers">Thử lại</button>
    </div>
    <div
      v-if="successMessage"
      class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800"
      role="status"
    >
      {{ successMessage }}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div class="relative flex-1 min-w-[240px] max-w-sm">
        <label class="sr-only" for="admin-user-search">Tìm người dùng</label>
        <input
          id="admin-user-search"
          v-model="searchQuery"
          type="search"
          placeholder="Tìm theo tên, email hoặc SĐT..."
          class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-xs text-ink-500">
          Vai trò:
          <select v-model="roleFilter" class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700">
            <option value="ALL">Tất cả vai trò</option>
            <option value="admin">ADMIN</option>
            <option value="service_manager">SERVICE_MANAGER</option>
            <option value="technician">TECHNICIAN</option>
            <option value="customer">CUSTOMER</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs text-ink-500">
          Trạng thái:
          <select v-model="statusFilter" class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700">
            <option value="ALL">Tất cả trạng thái</option>
            <option value="active">ACTIVE</option>
            <option value="suspended">SUSPENDED</option>
            <option value="locked">LOCKED</option>
            <option value="pending_verification">PENDING_VERIFICATION</option>
          </select>
        </label>
      </div>
    </div>

    <FhCard>
      <FhTable :columns="columns" :rows="users" :loading="loading" :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có người dùng phù hợp.'">
        <template #cell-name="{ row }">
          <div class="font-bold text-xs text-ink-900">{{ row.fullName }}</div>
        </template>
        <template #cell-email="{ row }">
          <div class="text-xs text-ink-700 font-mono">{{ row.email }}</div>
          <div class="text-[11px] text-ink-400 font-num">{{ row.phoneNumber || '—' }}</div>
        </template>
        <template #cell-role="{ row }">
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold" :class="roleClass(String(row.role))">
            {{ displayRole(String(row.role)) }}
          </span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="text-xs text-ink-500 font-num">{{ formatDate(String(row.createdAt)) }}</span>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="String(row.status)" :label="statusLabel(String(row.status))" />
        </template>
        <template #cell-actions="{ row }">
          <button
            v-if="displayRole(String(row.role)) !== 'ADMIN' && ['active', 'locked'].includes(String(row.status).toLowerCase())"
            class="p-2 rounded transition-colors"
            :class="String(row.status).toUpperCase() === 'ACTIVE' ? 'text-danger-500 hover:bg-danger-50' : 'text-success-600 hover:bg-success-50'"
            :title="String(row.status).toUpperCase() === 'ACTIVE' ? 'Khoá tài khoản' : 'Mở khoá tài khoản'"
            type="button"
            @click="triggerToggleStatus(row)"
          >
            <Lock v-if="String(row.status).toUpperCase() === 'ACTIVE'" :size="15" />
            <Unlock v-else :size="15" />
          </button>
          <span v-else class="text-[11px] text-ink-400 italic">
            {{ displayRole(String(row.role)) === 'ADMIN' ? 'Hệ thống' : 'Theo chính sách' }}
          </span>
        </template>
      </FhTable>
    </FhCard>

    <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-ink-500">
      <span>Trang {{ page }} / {{ totalPages }} · {{ total }} người dùng</span>
      <div class="flex items-center gap-2">
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page <= 1 || loading" aria-label="Trang trước" @click="page--">
          <ChevronLeft :size="16" />
        </button>
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page >= totalPages || loading" aria-label="Trang sau" @click="page++">
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <FhConfirmDialog
      :open="showStatusModal"
      :loading="mutationLoading"
      :title="nextStatus === 'locked' ? 'Khoá tài khoản người dùng' : 'Mở khoá tài khoản'"
      :consequence="nextStatus === 'locked' ? 'Tài khoản sẽ không thể đăng nhập sau khi Backend xác nhận trạng thái mới.' : 'Backend sẽ kích hoạt lại tài khoản sau khi xác nhận thay đổi.'"
      :confirm-text="nextStatus === 'locked' ? 'Khoá tài khoản' : 'Mở khoá'"
      cancel-text="Quay lại"
      @confirm="confirmStatusChange"
      @cancel="showStatusModal = false"
    />
  </div>
</template>
