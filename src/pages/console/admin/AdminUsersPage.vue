<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Plus } from 'lucide-vue-next';
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
  userToToggle.value?.status === 'locked' ? 'active' : 'locked',
);

const canToggleStatus = (status: AdminUserStatus) =>
  status === 'active' || status === 'locked';

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
    case 'ACTIVE': return 'bg-emerald-500';
    case 'LOCKED': return 'bg-red-500';
    case 'SUSPENDED': return 'bg-red-500';
    case 'PENDING_VERIFICATION': return 'bg-amber-400';
    default: return 'bg-gray-400';
  }
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

// Tạo tài khoản Kỹ thuật viên (chỉ Admin/SM mới onboard được, tech không tự đăng ký)
const showCreateTechModal = ref(false);
const createTechForm = ref({ email: '', fullName: '', phoneNumber: '' });
const createTechLoading = ref(false);
const createTechError = ref('');
const createdTech = ref<{ email: string; fullName: string; tempPassword: string } | null>(null);

function openCreateTechModal() {
  createTechForm.value = { email: '', fullName: '', phoneNumber: '' };
  createTechError.value = '';
  createdTech.value = null;
  showCreateTechModal.value = true;
}

async function handleCreateTechnician() {
  if (createTechLoading.value) return;
  if (!createTechForm.value.email.trim() || !createTechForm.value.fullName.trim()) {
    createTechError.value = 'Nhập họ tên và email.';
    return;
  }
  createTechLoading.value = true;
  createTechError.value = '';
  try {
    const { user, tempPassword } = await adminUsersApi.createTechnician({
      email: createTechForm.value.email.trim(),
      fullName: createTechForm.value.fullName.trim(),
      phoneNumber: createTechForm.value.phoneNumber.trim() || undefined,
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
    <ConsolePageHeader title="Người dùng" :count="loading || loadError ? null : total">
      <template #actions>
        <FhButton variant="primary" size="sm" @click="openCreateTechModal">
          <Plus :size="16" aria-hidden="true" /> Tạo tài khoản thợ
        </FhButton>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadUsers">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm theo email hoặc tên" label="Tìm người dùng" />
      <select v-model="roleFilter" :class="consoleField" aria-label="Vai trò">
        <option value="ALL">Tất cả vai trò</option>
        <option value="ADMIN">Quản trị viên</option>
        <option value="SERVICE_MANAGER">Quản lý dịch vụ</option>
        <option value="TECHNICIAN">Kỹ thuật viên</option>
        <option value="CUSTOMER">Khách hàng</option>
      </select>
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
        <option value="ALL">Tất cả trạng thái</option>
        <option value="active">Đang hoạt động</option>
        <option value="pending_verification">Chưa xác minh</option>
        <option value="suspended">Tạm khoá</option>
      </select>
    </div>

    <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>

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
          <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
            <img v-if="row.avatarUrl" :src="row.avatarUrl" alt="" class="h-full w-full object-cover" />
            <span v-else aria-hidden="true">{{ getInitial(row.fullName, row.email) }}</span>
          </div>
          <div class="min-w-0">
            <div class="truncate font-medium text-ink-900">{{ row.fullName || row.email.split('@')[0] }}</div>
            <div class="max-w-48 truncate text-xs text-ink-500 xl:hidden" :title="row.email">{{ row.email }}</div>
          </div>
        </div>
      </template>
      <template #cell-email="{ row }">
        <span class="block max-w-64 truncate text-ink-700" :title="row.email">{{ row.email }}</span>
      </template>
      <template #cell-role="{ row }">
        <span class="whitespace-nowrap text-ink-700">{{ displayRole(String(row.role)) }}</span>
      </template>
      <template #cell-status="{ row }">
        <span class="inline-flex items-center gap-2 whitespace-nowrap">
          <span class="h-2 w-2 shrink-0 rounded-full" :class="getStatusColor(String(row.status))" aria-hidden="true"></span>
          <span class="text-ink-700">{{ statusLabel(String(row.status)) }}</span>
        </span>
      </template>
      <template #cell-createdAt="{ row }">
        <span class="whitespace-nowrap font-num text-ink-600">{{ formatDate(String(row.createdAt)) }}</span>
      </template>
      <template #cell-active="{ row }">
        <ConsoleMoreMenu v-if="canToggleStatus(row.status)" label="Thao tác với tài khoản">
          <ConsoleMenuItem :danger="row.status !== 'locked'" @click="userToToggle = row; showStatusModal = true">
            {{ row.status === 'locked' ? 'Mở khoá tài khoản' : 'Khoá tài khoản' }}
          </ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsoleTable>

    <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />

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

    <!-- Create a technician account -->
    <div
      v-if="showCreateTechModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-tech-title"
      @keydown.esc="showCreateTechModal = false"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl">
        <template v-if="!createdTech">
          <div>
            <h3 id="create-tech-title" class="text-lg font-semibold text-ink-900">Tạo tài khoản kỹ thuật viên</h3>
            <p class="mt-1 text-sm text-ink-500">Mật khẩu tạm chỉ hiện một lần.</p>
          </div>
          <form class="space-y-3" @submit.prevent="handleCreateTechnician">
            <label :class="consoleLabel">
              Họ và tên
              <input v-model="createTechForm.fullName" type="text" autocomplete="name" :class="consoleField" class="h-10" />
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
          <div class="select-all break-all rounded-xl border border-ink-200 bg-ink-50 p-4 text-center font-num text-base font-semibold text-ink-900">
            {{ createdTech.tempPassword }}
          </div>
          <FhButton variant="primary" size="sm" block @click="showCreateTechModal = false">Đã sao chép, đóng lại</FhButton>
        </template>
      </div>
    </div>
  </div>
</template>
