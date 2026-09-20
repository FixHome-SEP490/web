<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { FhCard, FhTable, FhConfirmDialog, FhSkeleton, type TableColumn } from '../../../components';
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
  { key: 'active', label: 'HOẠT ĐỘNG', sortable: false}
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
  <div class="space-y-4">


    <!-- Error/Success states -->
    <div v-if="error" class="rounded-md bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>
    <div v-if="successMessage" class="rounded-md bg-green-50 p-4 text-sm text-green-700">{{ successMessage }}</div>

    <!-- Table -->
    <FhCard class="border-none shadow-none bg-transparent">
      <FhTable 
        :columns="columns" 
        :rows="displayRows" 
        selectable
        searchable
        v-model:searchQuery="searchQuery"
        search-placeholder="Tìm kiếm người dùng..."
        v-model:selected="selectedUsers"
        :sortBy="sortBy"
        :sortDesc="sortDesc"
        @sort="handleSort"
        empty-text="Không tìm thấy người dùng."
      >
        <template #toolbar>
          <label class="flex items-center gap-2 text-sm text-gray-500">
            Trạng thái:
            <select v-model="statusFilter" class="bg-gray-100 border border-gray-200 rounded-full px-2 py-1 font-medium text-gray-700 outline-none cursor-pointer focus:ring-0  pr-4">
              <option value="ALL">Tất cả</option>
              <option value="active">Online</option>
              <option value="pending_verification">Pending</option>
              <option value="suspended">Locked</option>
            </select>
          </label>
          <button @click="loadUsers" class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors mr-2" title="Làm mới">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          </button>
          <button @click="openCreateTechModal" class="px-3 py-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors">
            + Tạo tài khoản thợ
          </button>
        </template>
        <template #cell-name="{ row }">
          <div v-if="isSkeleton(row)" class="flex items-center gap-3">
            <FhSkeleton class="w-8! h-8! shrink-0" rounded="full" />
            <FhSkeleton width="120px" height="16px" />
          </div>
          <div v-else class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0 overflow-hidden">
              <img v-if="row.avatarUrl" :src="row.avatarUrl" class="w-full h-full object-cover" />
              <span v-else>{{ getInitial(row.fullName, row.email) }}</span>
            </div>
            <div class="font-bold text-sm text-gray-900 flex items-center gap-1">
              {{ row.fullName || row.email.split('@')[0] }}
            </div>
          </div>
        </template>
      
        <template #cell-email="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="160px" height="16px" />
          <div v-else class="text-sm text-gray-600">{{ row.email }}</div>
        </template>
        
        <template #cell-role="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="80px" height="16px" />
          <span v-else class="text-sm font-medium text-gray-600">
            {{ displayRole(String(row.role)) }}
          </span>
        </template>
        
        <template #cell-status="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="70px" height="16px" />
          <div v-else class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full" :class="getStatusColor(String(row.status))"></span>
            <span class="text-sm font-medium text-gray-700">{{ statusLabel(String(row.status)) }}</span>
          </div>
        </template>
        
        <template #cell-createdAt="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="90px" height="16px" />
          <span v-else class="text-sm font-medium text-gray-600">{{ formatDate(String(row.createdAt)) }}</span>
        </template>

        <template #cell-active="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="40px" height="16px" />
          <button v-else-if="canToggleStatus(row.status)" @click="userToToggle = row; showStatusModal = true" class="text-brand-500 hover:text-brand-600 font-bold text-xs uppercase transition-colors">
            Ban
          </button>
        </template>
      </FhTable>
    </FhCard>

    <div class="flex items-center justify-between text-sm text-gray-500 px-2 py-4">
      <div class="flex items-center gap-2">
        <span>Showing:</span>
        <select class="border-0 bg-transparent font-medium text-gray-700 outline-none cursor-pointer focus:ring-0 p-0 pr-4">
          <option>8</option>
          <option>10</option>
          <option>20</option>
        </select>
        <span>of {{ total }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="px-3 py-1 rounded text-gray-500 hover:text-gray-900 disabled:opacity-40" type="button" :disabled="page <= 1 || loading" @click="page--">
          Prev
        </button>
        <div class="flex items-center gap-1">
          <button 
            v-for="p in Math.min(3, totalPages)" 
            :key="p"
            class="w-8 h-8 rounded flex items-center justify-center font-medium"
            :class="p === page ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'"
            @click="page = p"
          >
            {{ p }}
          </button>
        </div>
        <button class="px-3 py-1 rounded text-gray-500 hover:text-gray-900 disabled:opacity-40" type="button" :disabled="page >= totalPages || loading" @click="page++">
          Next
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

    <!-- Create Technician Modal -->
    <div
      v-if="showCreateTechModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-6 space-y-4 shadow-xl">
        <template v-if="!createdTech">
          <h3 class="text-base font-bold text-gray-900">Tạo tài khoản Kỹ thuật viên</h3>
          <p class="text-xs text-gray-500">
            Thợ không tự đăng ký được — tài khoản do Admin khởi tạo. Mật khẩu tạm sẽ chỉ hiện 1 lần, hãy gửi lại cho thợ ngay sau khi tạo.
          </p>
          <div class="space-y-2">
            <input v-model="createTechForm.fullName" type="text" placeholder="Họ và tên" class="w-full h-9 px-3 border border-gray-200 rounded text-sm" />
            <input v-model="createTechForm.email" type="email" placeholder="Email đăng nhập" class="w-full h-9 px-3 border border-gray-200 rounded text-sm" />
            <input v-model="createTechForm.phoneNumber" type="text" placeholder="Số điện thoại (không bắt buộc)" class="w-full h-9 px-3 border border-gray-200 rounded text-sm" />
          </div>
          <p v-if="createTechError" class="text-xs text-red-600 font-semibold">{{ createTechError }}</p>
          <div class="flex gap-2 pt-2">
            <button class="flex-1 h-9 rounded text-sm font-semibold text-gray-600 hover:bg-gray-50" @click="showCreateTechModal = false">Huỷ</button>
            <button class="flex-1 h-9 rounded text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50" :disabled="createTechLoading" @click="handleCreateTechnician">
              Tạo tài khoản
            </button>
          </div>
        </template>
        <template v-else>
          <h3 class="text-base font-bold text-gray-900">Đã tạo tài khoản thành công</h3>
          <p class="text-xs text-gray-500">{{ createdTech.fullName }} ({{ createdTech.email }}). Sao chép mật khẩu tạm bên dưới và gửi cho thợ — không thể xem lại sau khi đóng cửa sổ này.</p>
          <div class="p-3 bg-gray-50 border border-gray-200 rounded font-mono text-sm font-bold text-gray-900 select-all break-all">
            {{ createdTech.tempPassword }}
          </div>
          <button class="w-full h-9 rounded text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700" @click="showCreateTechModal = false">
            Đã sao chép, đóng lại
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
