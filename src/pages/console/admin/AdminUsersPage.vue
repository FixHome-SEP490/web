<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Calendar, Users, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { FhTable, FhConfirmDialog, FhSkeleton, type TableColumn } from '../../../components';
import {
  adminUsersApi,
  type AdminUserRecord,
  type AdminUserRole,
  type AdminUserStatus,
} from '../../../api/admin-users.api';

const columns: TableColumn[] = [
  { key: 'name', label: 'HỌ VÀ TÊN', sortable: true },
  { key: 'email', label: 'EMAIL' },
  { key: 'role', label: 'VAI TRÒ', sortable: true },
  { key: 'status', label: 'TRẠNG THÁI', sortable: true },
  { key: 'createdAt', label: 'NGÀY TẠO', sortable: true },
  { key: 'active', label: 'HOẠT ĐỘNG', sortable: false, align: 'right' }
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
const selectedUsers = ref<AdminUserRecord[]>([]);
const sortBy = ref('createdAt');
const sortDesc = ref(true);
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const isSkeleton = (row: unknown): boolean => !!(row as Record<string, unknown>)._isSkeleton;

const displayRows = computed<(AdminUserRecord & { _isSkeleton?: boolean })[]>(() => {
  if (loading.value) {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: `skeleton-${i}`,
      _isSkeleton: true,
      email: '',
      fullName: '',
      role: '',
      status: '',
      createdAt: ''
    } as unknown as AdminUserRecord & { _isSkeleton: boolean }));
  }
  return users.value;
});

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

const handleSort = (key: string) => {
  if (sortBy.value === key) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortBy.value = key;
    sortDesc.value = false;
  }
  // In a real app, this would trigger loadUsers with sort params
};

const displayRole = (role: string) => {
  const r = role.toUpperCase();
  if (r === 'ADMIN') return 'Admin';
  if (r === 'SERVICE_MANAGER') return 'Manager';
  if (r === 'TECHNICIAN') return 'Technician';
  return 'Customer';
};

const statusLabel = (status: string) => {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'Online';
    case 'LOCKED':
      return 'Locked';
    case 'SUSPENDED':
      return 'Suspended';
    case 'PENDING_VERIFICATION':
      return 'Pending';
    default:
      return status;
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

  const date = new Date(value);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

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
  if (!createTechForm.value.email.trim() || !createTechForm.value.fullName.trim()) {
    createTechError.value = 'Vui lòng nhập đầy đủ email và họ tên.';
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
    createTechError.value = getErrorMessage(reason, 'Không thể tạo tài khoản thợ.');
  } finally {
    createTechLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6 max-w-[1400px] mx-auto">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
      <div class="space-y-1.5">
        <div class="inline-flex items-center gap-2.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold uppercase tracking-wider mb-2">
          <Users :size="14" stroke-width="2.5" />
          Admin Console
        </div>
        <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">
          Quản lý Người dùng
        </h1>
        <p class="text-sm text-gray-500 font-medium max-w-xl">
          Quản lý toàn bộ danh sách tài khoản Admin, Manager, Kỹ thuật viên và Khách hàng trên hệ thống. Cấp quyền hoặc khoá tài khoản khi cần thiết.
        </p>
      </div>
    </div>

    <!-- Error/Success states -->
    <div v-if="error" class="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm" role="alert">
      <span class="flex-1 font-medium">{{ error }}</span>
      <button class="font-semibold underline hover:text-red-900 transition-colors" type="button" @click="loadUsers">Thử lại</button>
    </div>
    <div v-if="successMessage" class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium shadow-sm" role="status">
      {{ successMessage }}
    </div>

    <!-- Table -->
    <FhTable 
      :columns="columns" 
      :rows="displayRows" 
      selectable
      searchable
      v-model:searchQuery="searchQuery"
      search-placeholder="Tìm kiếm theo email hoặc tên..."
      v-model:selected="selectedUsers"
      :sortBy="sortBy"
      :sortDesc="sortDesc"
      @sort="handleSort"
      empty-text="Không tìm thấy người dùng."
      refreshable
      @refresh="loadUsers"
      tableTitle="Danh sách tài khoản"
      tableSubtitle="Quản lý và cấp quyền truy cập"
    >
      <template #toolbar>
        <div class="flex flex-wrap items-center gap-2">
          <!-- Role Filter -->
          <div class="flex items-center gap-2">
            <label class="hidden xl:flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Vai trò
            </label>
            <select v-model="roleFilter" class="h-10 pl-3 pr-8 text-sm bg-white border border-gray-200/80 rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-gray-700 font-medium appearance-none cursor-pointer shadow-sm transition-all hover:bg-gray-50" style="background-image: url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E'); background-size: 20px 20px; background-position: right 0.5rem center; background-repeat: no-repeat;">
              <option value="ALL">Tất cả vai trò</option>
              <option value="ADMIN">Admin</option>
              <option value="SERVICE_MANAGER">Manager</option>
              <option value="TECHNICIAN">Technician</option>
              <option value="CUSTOMER">Customer</option>
            </select>
          </div>

          <!-- Status Filter -->
          <div class="flex items-center gap-2">
            <label class="hidden xl:flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Trạng thái
            </label>
            <select v-model="statusFilter" class="h-10 pl-3 pr-8 text-sm bg-white border border-gray-200/80 rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-gray-700 font-medium appearance-none cursor-pointer shadow-sm transition-all hover:bg-gray-50" style="background-image: url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E'); background-size: 20px 20px; background-position: right 0.5rem center; background-repeat: no-repeat;">
              <option value="ALL">Tất cả trạng thái</option>
              <option value="active">Online</option>
              <option value="pending_verification">Pending</option>
              <option value="suspended">Locked</option>
            </select>
          </div>
          
          <button @click="openCreateTechModal" class="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-500/20 active:scale-95 whitespace-nowrap ml-1">
            + Tạo tài khoản thợ
          </button>
        </div>
      </template>

      <template #cell-name="{ row }">
        <div v-if="isSkeleton(row)" class="flex items-center gap-3">
          <FhSkeleton class="w-10! h-10! shrink-0" rounded="full" />
          <FhSkeleton width="120px" height="16px" />
        </div>
        <div v-else class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center text-brand-700 font-bold border border-brand-200 shadow-sm shrink-0 overflow-hidden">
            <img v-if="row.avatarUrl" :src="row.avatarUrl" class="w-full h-full object-cover" />
            <span v-else>{{ getInitial(row.fullName, row.email) }}</span>
          </div>
          <div class="min-w-0">
            <div class="font-bold text-sm text-gray-900 truncate">{{ row.fullName || row.email.split('@')[0] }}</div>
          </div>
        </div>
      </template>
    
      <template #cell-email="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="160px" height="16px" />
        <div v-else class="text-sm font-medium text-gray-600 truncate">{{ row.email }}</div>
      </template>
      
      <template #cell-role="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="80px" height="16px" />
        <span v-else class="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200/80 shadow-sm">
          {{ displayRole(String(row.role)) }}
        </span>
      </template>
      
      <template #cell-status="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="70px" height="16px" />
        <div v-else class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full shadow-sm" :class="getStatusColor(String(row.status))"></span>
          <span class="text-sm font-bold text-gray-700">{{ statusLabel(String(row.status)) }}</span>
        </div>
      </template>
      
      <template #cell-createdAt="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="90px" height="16px" />
        <div v-else class="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <Calendar :size="14" class="text-gray-400" />
          <span>{{ formatDate(String(row.createdAt)) }}</span>
        </div>
      </template>

      <template #cell-active="{ row }">
        <FhSkeleton v-if="isSkeleton(row)" width="40px" height="16px" />
        <button v-else-if="canToggleStatus(row.status)" @click="userToToggle = row; showStatusModal = true" class="text-brand-600 hover:text-brand-800 font-bold text-xs uppercase transition-colors px-2 py-1.5 rounded-md hover:bg-brand-50 border border-transparent hover:border-brand-200/50">
          Ban
        </button>
      </template>
    </FhTable>

    <!-- Pagination -->
    <div class="flex items-center justify-between text-xs font-medium text-gray-500 pt-2 px-1">
      <span>Trang {{ page }} / {{ totalPages }} <span class="mx-1.5 text-gray-300">|</span> {{ total }} người dùng</span>
      <div class="flex items-center gap-2">
        <button 
          class="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200/80 bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40 shadow-sm" 
          type="button" 
          :disabled="page <= 1 || loading" 
          aria-label="Trang trước" 
          @click="page--"
        >
          <ChevronLeft :size="16" />
        </button>
        <div class="hidden sm:flex items-center gap-1">
          <button 
            v-for="p in Math.min(3, totalPages)" 
            :key="p"
            class="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors"
            :class="p === page ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'"
            @click="page = p"
          >
            {{ p }}
          </button>
        </div>
        <button 
          class="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200/80 bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40 shadow-sm" 
          type="button" 
          :disabled="page >= totalPages || loading" 
          aria-label="Trang sau" 
          @click="page++"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <!-- Confirm Dialog -->
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

    <!-- Create Technician Modal -->
    <div
      v-if="showCreateTechModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl">
        <template v-if="!createdTech">
          <div>
            <h3 class="text-lg font-bold text-gray-900">Tạo tài khoản Kỹ thuật viên</h3>
            <p class="text-xs text-gray-500 mt-1 font-medium">
              Thợ không tự đăng ký được — tài khoản do Admin khởi tạo. Mật khẩu tạm sẽ chỉ hiện 1 lần.
            </p>
          </div>
          <div class="space-y-3">
            <div>
               <input v-model="createTechForm.fullName" type="text" placeholder="Họ và tên *" class="w-full h-10 px-3.5 border border-gray-200/80 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 bg-gray-50 focus:bg-white transition-all font-medium text-gray-900" />
            </div>
            <div>
               <input v-model="createTechForm.email" type="email" placeholder="Email đăng nhập *" class="w-full h-10 px-3.5 border border-gray-200/80 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 bg-gray-50 focus:bg-white transition-all font-medium text-gray-900" />
            </div>
            <div>
               <input v-model="createTechForm.phoneNumber" type="text" placeholder="Số điện thoại (không bắt buộc)" class="w-full h-10 px-3.5 border border-gray-200/80 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 bg-gray-50 focus:bg-white transition-all font-medium text-gray-900" />
            </div>
          </div>
          <p v-if="createTechError" class="text-xs text-red-600 font-semibold">{{ createTechError }}</p>
          <div class="flex gap-2 pt-2">
            <button class="flex-1 h-10 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors" @click="showCreateTechModal = false">Huỷ</button>
            <button class="flex-1 h-10 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 transition-all shadow-sm focus:ring-4 focus:ring-brand-500/20 active:scale-95 disabled:opacity-50" :disabled="createTechLoading" @click="handleCreateTechnician">
              Tạo tài khoản
            </button>
          </div>
        </template>
        <template v-else>
          <div>
            <h3 class="text-lg font-bold text-green-700">Tạo tài khoản thành công!</h3>
            <p class="text-xs text-gray-500 mt-1 font-medium">{{ createdTech.fullName }} ({{ createdTech.email }}). Sao chép mật khẩu tạm bên dưới và gửi cho thợ — không thể xem lại sau khi đóng.</p>
          </div>
          <div class="p-4 bg-gray-50 border border-gray-200/80 rounded-xl font-mono text-base text-center font-bold text-gray-900 select-all break-all shadow-inner">
            {{ createdTech.tempPassword }}
          </div>
          <button class="w-full h-10 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 transition-all shadow-sm focus:ring-4 focus:ring-brand-500/20 active:scale-95" @click="showCreateTechModal = false">
            Đã sao chép, đóng lại
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
