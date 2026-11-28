<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Search,
  Users,
  X,
  AlertCircle,
} from 'lucide-vue-next';
import VisitOfficeModal from '../../../components/console/VisitOfficeModal.vue';
import VisitOfficeDrawer from '../../../components/console/VisitOfficeDrawer.vue';
import FhConfirmDialog from '../../../components/FhConfirmDialog.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleStatCard from '../../../components/console/ConsoleStatCard.vue';
import ConsoleTitleArtwork from '../../../components/console/ConsoleTitleArtwork.vue';
import { CONSOLE_LOAD_ERROR } from '../../../components/console/console-ui';
import { userFacingError } from '../../../utils/user-facing-error';
import {
  adminOfficeVisitsApi,
  type VisitOffice,
  type VisitOfficeInput,
} from '../../../api/admin-office-visits.api';

const offices = ref<VisitOffice[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');
const actionError = ref('');
const successMessage = ref('');

// Visit statistics
const visitsThisMonth = ref<number | null>(null);

// Search & Filter state
const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');
const dateFilter = ref('');

// Modal & Drawer states
const showAddModal = ref(false);
const savingAdd = ref(false);
const addError = ref('');

const showEditDrawer = ref(false);
const editingOffice = ref<VisitOffice | null>(null);
const savingEdit = ref(false);
const editError = ref('');

// Pause confirmation dialog state
const showPauseConfirm = ref(false);
const pauseTargetOffice = ref<VisitOffice | null>(null);
const pausing = ref(false);

const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : '');

const DAYS_SHORT_LABEL: Record<number, string> = {
  1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN',
};

const formatDays = (days: number[]) => {
  if (!Array.isArray(days) || days.length === 0) return '—';
  return days.map((d) => DAYS_SHORT_LABEL[d] || `T${d}`).join(', ');
};

const formatHours = (row: VisitOffice) => {
  const open = hhmm(row.openTime) || '08:00';
  const close = hhmm(row.closeTime) || '17:00';
  const ls = hhmm(row.lunchStart);
  const le = hhmm(row.lunchEnd);
  if (ls && le) {
    return `${open} – ${close}, nghỉ ${ls} – ${le}`;
  }
  return `${open} – ${close}`;
};

// Load data
const loadOffices = async () => {
  try {
    offices.value = await adminOfficeVisitsApi.listOffices();
  } catch (reason) {
    loadError.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  }
};

const loadMonthlyVisits = async () => {
  try {
    const visits = await adminOfficeVisitsApi.listVisits();
    if (Array.isArray(visits)) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const inMonth = visits.filter((v) => {
        if (!v.scheduledAt) return false;
        const d = new Date(v.scheduledAt);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      });
      visitsThisMonth.value = inMonth.length;
    } else {
      visitsThisMonth.value = 0;
    }
  } catch {
    // If visits cannot be fetched (e.g. role restriction or empty), fallback to 0
    visitsThisMonth.value = 0;
  }
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    await Promise.all([loadOffices(), loadMonthlyVisits()]);
  } finally {
    loading.value = false;
  }
};

const refreshData = async () => {
  refreshing.value = true;
  actionError.value = '';
  successMessage.value = '';
  try {
    await Promise.all([loadOffices(), loadMonthlyVisits()]);
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => void load());

// Statistics
const stats = computed(() => {
  const total = offices.value.length;
  const active = offices.value.filter((o) => o.isActive).length;
  const inactive = total - active;
  return {
    total,
    active,
    inactive,
    monthlyVisits: visitsThisMonth.value,
  };
});

// Filtered list
const filteredOffices = computed(() => {
  let list = offices.value;

  // Search filter
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter(
      (o) =>
        (o.name && o.name.toLowerCase().includes(query)) ||
        (o.address && o.address.toLowerCase().includes(query)) ||
        (o.phone && o.phone.includes(query)),
    );
  }

  // Status filter
  if (statusFilter.value === 'active') {
    list = list.filter((o) => o.isActive);
  } else if (statusFilter.value === 'inactive') {
    list = list.filter((o) => !o.isActive);
  }

  // Date filter (which offices accept visits on that weekday)
  if (dateFilter.value) {
    try {
      const d = new Date(dateFilter.value);
      if (!Number.isNaN(d.getTime())) {
        const jsDay = d.getDay(); // 0 = Sunday, 1 = Monday, ...
        const systemDay = jsDay === 0 ? 7 : jsDay;
        list = list.filter((o) => Array.isArray(o.visitDays) && o.visitDays.includes(systemDay));
      }
    } catch {
      // ignore date parse issues
    }
  }

  return list;
});

// Actions: Create
const openCreateModal = () => {
  addError.value = '';
  showAddModal.value = true;
};

const handleSaveCreate = async (payload: VisitOfficeInput) => {
  savingAdd.value = true;
  addError.value = '';
  try {
    await adminOfficeVisitsApi.createOffice(payload);
    successMessage.value = 'Đã thêm trụ sở thành công.';
    showAddModal.value = false;
    await loadOffices();
  } catch (reason) {
    addError.value = userFacingError(reason, 'Chưa lưu được trụ sở, vui lòng thử lại.');
  } finally {
    savingAdd.value = false;
  }
};

// Actions: Edit
const openEditDrawer = (office: VisitOffice) => {
  editingOffice.value = office;
  editError.value = '';
  showEditDrawer.value = true;
};

const handleSaveEdit = async (payload: VisitOfficeInput) => {
  if (!editingOffice.value) return;
  savingEdit.value = true;
  editError.value = '';
  try {
    await adminOfficeVisitsApi.updateOffice(editingOffice.value.id, payload);
    successMessage.value = 'Đã cập nhật thông tin trụ sở thành công.';
    showEditDrawer.value = false;
    editingOffice.value = null;
    await loadOffices();
  } catch (reason) {
    editError.value = userFacingError(reason, 'Chưa lưu được thông tin trụ sở, vui lòng thử lại.');
  } finally {
    savingEdit.value = false;
  }
};

// Actions: Toggle Active / Pause with confirmation
const handleToggleClick = (office: VisitOffice) => {
  actionError.value = '';
  if (office.isActive) {
    // Confirmation required before pausing
    pauseTargetOffice.value = office;
    showPauseConfirm.value = true;
  } else {
    // Resuming reception directly
    void executeSetActive(office, true);
  }
};

const confirmPauseOffice = async () => {
  if (!pauseTargetOffice.value) return;
  pausing.value = true;
  try {
    await executeSetActive(pauseTargetOffice.value, false);
    showPauseConfirm.value = false;
    pauseTargetOffice.value = null;
  } finally {
    pausing.value = false;
  }
};

const executeSetActive = async (office: VisitOffice, isActive: boolean) => {
  actionError.value = '';
  try {
    await adminOfficeVisitsApi.updateOffice(office.id, { isActive });
    successMessage.value = isActive
      ? `Đã kích hoạt nhận hồ sơ cho "${office.name}".`
      : `Đã tạm ngưng nhận hồ sơ tại "${office.name}".`;
    await loadOffices();
  } catch (reason) {
    actionError.value = userFacingError(reason, 'Chưa thay đổi được trạng thái trụ sở.');
  }
};

// Reset notification banner after 5 seconds
watch(successMessage, (msg) => {
  if (msg) {
    setTimeout(() => {
      if (successMessage.value === msg) successMessage.value = '';
    }, 5000);
  }
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header section matching Image 3 -->
    <header class="animate-slide-up flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3.5">
        <ConsoleTitleArtwork src="/images/ui/console-visit-office.png" />
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              Trụ sở nhận hồ sơ
            </h1>
            <span
              v-if="!loading && !loadError"
              class="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 font-num text-xs font-semibold text-ink-700"
            >
              {{ offices.length }}
            </span>
          </div>
          <p class="mt-1 text-xs text-ink-500 sm:text-sm">
            Theo dõi và quản lý các trụ sở tiếp nhận hồ sơ định danh của kỹ thuật viên, bao gồm thời gian tiếp nhận, giới hạn mỗi lượt và trạng thái hoạt động.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
          @click="openCreateModal"
        >
          <Plus :size="16" :stroke-width="2.5" />
          <span>Thêm trụ sở</span>
        </button>
      </div>
    </header>

    <!-- 4 Stats Cards -->
    <section class="animate-slide-up-delay-1 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ConsoleStatCard
        interactive
        :active="statusFilter === 'all'"
        :loading="loading"
        label="Tổng trụ sở"
        :value="stats.total"
        :icon="Building2"
        tone="brand"
        @click="statusFilter = 'all'; dateFilter = ''; searchQuery = '';"
      />

      <ConsoleStatCard
        interactive
        :active="statusFilter === 'active'"
        :loading="loading"
        label="Đang hoạt động"
        :value="stats.active"
        :icon="Check"
        tone="success"
        @click="statusFilter = statusFilter === 'active' ? 'all' : 'active'"
      />

      <ConsoleStatCard
        interactive
        :active="statusFilter === 'inactive'"
        :loading="loading"
        label="Tạm ngưng"
        :value="stats.inactive"
        :icon="Clock"
        tone="warning"
        @click="statusFilter = statusFilter === 'inactive' ? 'all' : 'inactive'"
      />

      <ConsoleStatCard
        :loading="loading || stats.monthlyVisits === null"
        label="Tổng lượt tiếp nhận (tháng)"
        :value="stats.monthlyVisits ?? 0"
        :icon="Users"
        tone="neutral"
      />
    </section>

    <!-- Notification banners -->
    <Transition name="fh-fade-slide">
      <div
        v-if="actionError"
        class="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs text-rose-800"
        role="alert"
      >
        <div class="flex items-center gap-2">
          <AlertCircle :size="16" class="shrink-0 text-rose-600" />
          <span class="font-medium">{{ actionError }}</span>
        </div>
        <button type="button" class="text-rose-500 hover:text-rose-700" @click="actionError = ''">
          <X :size="14" />
        </button>
      </div>
    </Transition>

    <Transition name="fh-fade-slide">
      <div
        v-if="successMessage"
        class="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs text-emerald-800"
        role="status"
      >
        <div class="flex items-center gap-2">
          <CheckCircle2 :size="16" class="shrink-0 text-emerald-600" />
          <span class="font-medium">{{ successMessage }}</span>
        </div>
        <button type="button" class="text-emerald-500 hover:text-emerald-700" @click="successMessage = ''">
          <X :size="14" />
        </button>
      </div>
    </Transition>

    <!-- Search & Filter bar matching Image 3 -->
    <div class="animate-slide-up-delay-2 relative z-20 flex flex-col gap-3 sm:flex-row sm:items-center">
      <!-- Search input -->
      <div class="relative flex-1">
        <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm theo tên trụ sở, địa chỉ..."
          class="h-10.5 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-9 text-xs sm:text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 cursor-pointer"
          title="Xóa tìm kiếm"
          @click="searchQuery = ''"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- Status dropdown filter -->
      <div class="w-full sm:w-48">
        <select
          v-model="statusFilter"
          class="h-10.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-xs sm:text-sm text-ink-800 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 cursor-pointer"
        >
          <option value="all">Trạng thái: Tất cả</option>
          <option value="active">Đang nhận</option>
          <option value="inactive">Tạm ngưng</option>
        </select>
      </div>

      <!-- Date filter -->
      <div class="relative w-full sm:w-48">
        <Calendar :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          v-model="dateFilter"
          type="date"
          aria-label="Chọn ngày nhận hồ sơ"
          class="h-10.5 w-full rounded-xl border border-ink-200 bg-white pl-9.5 pr-8 font-num text-xs sm:text-sm text-ink-800 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />
        <button
          v-if="dateFilter"
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-600 cursor-pointer"
          title="Xóa ngày"
          @click="dateFilter = ''"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- Refresh button -->
      <button
        type="button"
        class="inline-flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
        title="Làm mới dữ liệu"
        :disabled="refreshing || loading"
        @click="refreshData"
      >
        <RotateCw :size="16" :class="{ 'animate-spin': refreshing }" />
      </button>
    </div>

    <!-- Main List Section -->
    <div class="animate-slide-up-delay-3 relative z-10">
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />

      <div v-else class="overflow-hidden rounded-2xl border border-ink-200/90 bg-white shadow-xs">
        <table class="w-full table-fixed text-left text-sm">
          <colgroup>
            <col class="w-[34%]" />
            <col class="w-[25%]" />
            <col class="w-[13%]" />
            <col class="w-[12%]" />
            <col class="w-[16%]" />
          </colgroup>
          <thead>
            <tr class="border-b border-ink-200/70 bg-ink-25/70">
              <th scope="col" class="pl-4 pr-2 sm:pl-5 sm:pr-3 py-3.5 text-xs font-semibold text-ink-600">Trụ sở</th>
              <th scope="col" class="px-2 sm:px-3 py-3.5 text-xs font-semibold text-ink-600">Giờ nhận hồ sơ</th>
              <th scope="col" class="px-2 sm:px-3 py-3.5 text-xs font-semibold text-ink-600">Mỗi lượt</th>
              <th scope="col" class="px-2 sm:px-3 py-3.5 text-xs font-semibold text-ink-600">Trạng thái</th>
              <th scope="col" class="pl-2 pr-4 sm:pl-3 sm:pr-5 py-3.5 text-right text-xs font-semibold text-ink-600">Hành động</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-ink-100">
            <!-- Loading Skeleton -->
            <template v-if="loading">
              <tr v-for="i in 4" :key="`skeleton-${i}`" class="animate-pulse">
                <td class="pl-4 pr-2 sm:pl-5 sm:pr-3 py-4">
                  <div class="flex items-center gap-3">
                    <div class="h-9 w-9 rounded-xl bg-ink-100 shrink-0"></div>
                    <div class="space-y-1.5 min-w-0 flex-1">
                      <div class="h-4 w-32 rounded bg-ink-100"></div>
                      <div class="h-3 w-48 rounded bg-ink-50"></div>
                    </div>
                  </div>
                </td>
                <td class="px-2 sm:px-3 py-4">
                  <div class="space-y-1.5">
                    <div class="h-4 w-28 rounded bg-ink-100"></div>
                    <div class="h-3 w-20 rounded bg-ink-50"></div>
                  </div>
                </td>
                <td class="px-2 sm:px-3 py-4">
                  <div class="h-4 w-16 rounded bg-ink-100"></div>
                </td>
                <td class="px-2 sm:px-3 py-4">
                  <div class="h-6 w-20 rounded-full bg-ink-100"></div>
                </td>
                <td class="pl-2 pr-4 sm:pl-3 sm:pr-5 py-4 text-right">
                  <div class="flex justify-end gap-1.5">
                    <div class="h-8 w-14 rounded-lg bg-ink-100"></div>
                    <div class="h-8 w-20 rounded-lg bg-ink-100"></div>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty state -->
            <tr v-else-if="filteredOffices.length === 0">
              <td colspan="5" class="px-5 py-14 text-center">
                <div class="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
                    <Building2 :size="24" />
                  </div>
                  <h3 class="mt-3 text-sm font-semibold text-ink-900">Không tìm thấy trụ sở nào</h3>
                  <p class="mt-1 text-xs text-ink-500">
                    {{ searchQuery || statusFilter !== 'all' || dateFilter ? 'Thử thay đổi từ khóa hoặc bộ lọc để xem kết quả khác.' : 'Chưa có trụ sở nào trong hệ thống. Hãy bấm nút bên dưới để tạo trụ sở mới.' }}
                  </p>
                  <button
                    v-if="!searchQuery && statusFilter === 'all' && !dateFilter"
                    type="button"
                    class="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 cursor-pointer"
                    @click="openCreateModal"
                  >
                    <Plus :size="15" />
                    <span>Thêm trụ sở đầu tiên</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- List rows -->
            <tr
              v-for="row in filteredOffices"
              v-else
              :key="row.id"
              class="transition-[background-color] duration-150 hover:bg-brand-50/30"
            >
              <!-- Trụ sở: Icon đại diện, tên và địa chỉ -->
              <td class="pl-4 pr-2 sm:pl-5 sm:pr-3 py-3.5">
                <div class="flex items-start gap-2.5 sm:gap-3 min-w-0">
                  <div class="mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Building2 :size="18" :stroke-width="2" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-ink-900 text-xs sm:text-sm truncate" :title="row.name">
                      {{ row.name }}
                    </div>
                    <div class="mt-0.5 flex items-center gap-1 text-2xs sm:text-xs text-ink-500 min-w-0" :title="row.address">
                      <MapPin :size="12" class="shrink-0 text-ink-400" />
                      <span class="truncate">{{ row.address }}</span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- Giờ nhận hồ sơ -->
              <td class="px-2 sm:px-3 py-3.5 min-w-0">
                <div class="font-semibold text-ink-800 text-xs sm:text-sm font-num truncate" :title="formatHours(row)">
                  {{ formatHours(row) }}
                </div>
                <div class="mt-0.5 text-2xs sm:text-xs text-ink-500 truncate" :title="formatDays(row.visitDays)">
                  {{ formatDays(row.visitDays) }}
                </div>
              </td>

              <!-- Mỗi lượt -->
              <td class="px-2 sm:px-3 py-3.5 min-w-0">
                <span class="font-medium text-xs sm:text-sm text-ink-700 font-num truncate block">
                  {{ row.slotMinutes }} phút, {{ row.slotCapacity }} thợ
                </span>
              </td>

              <!-- Trạng thái -->
              <td class="px-2 sm:px-3 py-3.5 min-w-0">
                <span
                  v-if="row.isActive"
                  class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2 sm:px-2.5 py-0.5 sm:py-1 text-2xs sm:text-xs font-semibold text-emerald-700 whitespace-nowrap"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  <span>Đang nhận</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2 sm:px-2.5 py-0.5 sm:py-1 text-2xs sm:text-xs font-semibold text-amber-700 whitespace-nowrap"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  <span>Tạm ngưng</span>
                </span>
              </td>

              <!-- Hành động: Sửa, Tạm ngưng hoặc Tiếp tục -->
              <td class="pl-2 pr-4 sm:pl-3 sm:pr-5 py-3.5 text-right min-w-0">
                <div class="flex items-center justify-end gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center justify-center gap-1 sm:gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 sm:px-3 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0 cursor-pointer"
                    @click="openEditDrawer(row)"
                  >
                    <Pencil :size="13" />
                    <span>Sửa</span>
                  </button>

                  <button
                    type="button"
                    class="inline-flex h-8 items-center justify-center gap-1 sm:gap-1.5 rounded-lg border px-2.5 sm:px-3 text-xs font-semibold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 shrink-0 cursor-pointer"
                    :class="
                      row.isActive
                        ? 'border-ink-200 bg-white text-ink-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 focus-visible:ring-amber-500'
                        : 'border-ink-200 bg-white text-ink-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-500'
                    "
                    @click="handleToggleClick(row)"
                  >
                    <Pause v-if="row.isActive" :size="13" />
                    <Play v-else :size="13" />
                    <span>{{ row.isActive ? 'Tạm ngưng' : 'Tiếp tục' }}</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Thêm trụ sở (Image 1) -->
    <VisitOfficeModal
      :open="showAddModal"
      :saving="savingAdd"
      :error="addError"
      @close="showAddModal = false"
      @save="handleSaveCreate"
    />

    <!-- Drawer Chỉnh sửa trụ sở (Image 2) -->
    <VisitOfficeDrawer
      :open="showEditDrawer"
      :office="editingOffice"
      :saving="savingEdit"
      :error="editError"
      @close="showEditDrawer = false"
      @save="handleSaveEdit"
    />

    <!-- Confirmation before pausing branch -->
    <FhConfirmDialog
      :open="showPauseConfirm"
      title="Tạm ngưng nhận hồ sơ?"
      :consequence="`Trụ sở '${pauseTargetOffice?.name}' sẽ tạm ngừng tiếp nhận các lịch hẹn mới từ kỹ thuật viên. Các lịch hẹn đã được đặt trước đó vẫn được giữ nguyên.`"
      confirm-text="Tạm ngưng"
      cancel-text="Quay lại"
      :danger="false"
      :loading="pausing"
      @confirm="confirmPauseOffice"
      @cancel="showPauseConfirm = false"
    />
  </div>
</template>
