<script setup lang="ts">
// Service Manager (và Admin): lịch thợ hẹn lên trụ sở. Ghi nhận thợ đã gặp / vắng, và cho thợ bị khóa đặt lịch đặt lại.
// Duyệt hồ sơ cuối vẫn do Admin ở mục "Duyệt hồ sơ".
import { computed, onMounted, ref, watch } from 'vue';
import {
  Calendar,
  CheckCircle2,
  Check,
  Clock,
  User,
  UserX,
  RotateCcw,
  X,
  Phone,
  Building2,
  MapPin,
  Activity,
  FileText,
  Search,
  Eye,
  AlertCircle,
  ChevronDown,
} from 'lucide-vue-next';
import FhButton from '../../components/FhButton.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { CONSOLE_LOAD_ERROR } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString, vnClock } from '../../utils/vn-time';
import {
  adminOfficeVisitsApi,
  type OfficeVisitRow,
  type OfficeVisitStatus,
} from '../../api/admin-office-visits.api';

const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Thợ / SĐT' },
  { key: 'office', label: 'Trụ sở' },
  { key: 'time', label: 'Giờ hẹn', width: '170px' },
  { key: 'status', label: 'Trạng thái', width: '150px' },
  { key: 'note', label: 'Ghi chú ngắn', hideBelow: 'md' },
  { key: 'actions', label: 'Hành động', align: 'right', width: '100px' },
];

const STATUS_CONFIG: Record<OfficeVisitStatus, {
  label: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
  icon: typeof Check;
}> = {
  scheduled: {
    label: 'Chờ xác nhận',
    pillBg: 'bg-blue-50',
    pillText: 'text-blue-700',
    pillBorder: 'border-blue-200/80',
    icon: Clock,
  },
  attended: {
    label: 'Đã gặp',
    pillBg: 'bg-emerald-50',
    pillText: 'text-emerald-700',
    pillBorder: 'border-emerald-200/80',
    icon: Check,
  },
  missed: {
    label: 'Vắng mặt',
    pillBg: 'bg-amber-50',
    pillText: 'text-amber-700',
    pillBorder: 'border-amber-200/80',
    icon: UserX,
  },
  cancelled: {
    label: 'Đã hủy',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-600',
    pillBorder: 'border-slate-200/80',
    icon: X,
  },
};

// Filter state
const statusFilter = ref<OfficeVisitStatus | ''>('');
const dateFilter = ref('');
const officeFilter = ref('');
const searchQuery = ref('');

// Data state
const allVisits = ref<OfficeVisitRow[]>([]);
const offices = ref<{ id: string; name: string; address?: string }[]>([]);
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const successMessage = ref('');
const busyId = ref('');
const selected = ref<OfficeVisitRow | null>(null);

// Modal action prompt
const actionModal = ref<{
  open: boolean;
  type: 'attended' | 'missed' | 'reset';
  row: OfficeVisitRow | null;
  note: string;
}>({
  open: false,
  type: 'attended',
  row: null,
  note: '',
});

const formatScheduledTime = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return `${vnClock(d)} ${vnDateString(d)}`;
  } catch {
    return dateStr;
  }
};

const mergeOfficesFromVisits = (visitRows: OfficeVisitRow[]) => {
  const map = new Map<string, { id: string; name: string; address?: string }>();
  for (const o of offices.value) {
    map.set(o.id, o);
  }
  for (const v of visitRows) {
    if (v.officeId && !map.has(v.officeId)) {
      map.set(v.officeId, { id: v.officeId, name: v.officeName, address: v.officeAddress });
    }
  }
  offices.value = Array.from(map.values());
};

const loadOffices = async () => {
  try {
    const list = await adminOfficeVisitsApi.listOffices();
    if (Array.isArray(list)) {
      offices.value = list.map((o) => ({ id: o.id, name: o.name, address: o.address }));
    }
  } catch {
    // Service Manager might not have access to admin visit-offices; extracted from visits instead
  }
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await adminOfficeVisitsApi.listVisits({
      officeId: officeFilter.value || undefined,
      date: dateFilter.value || undefined,
    });
    allVisits.value = Array.isArray(data) ? data : [];
    mergeOfficesFromVisits(allVisits.value);

    // Keep drawer in sync if currently open
    if (selected.value) {
      const updated = allVisits.value.find((v) => v.id === selected.value?.id);
      selected.value = updated ?? null;
    }
  } catch (reason) {
    loadError.value = userFacingError(reason, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
};

// Filtered rows for the table
const filteredRows = computed(() => {
  let list = allVisits.value;

  if (statusFilter.value) {
    list = list.filter((v) => v.status === statusFilter.value);
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter(
      (v) =>
        (v.technicianName && v.technicianName.toLowerCase().includes(query)) ||
        (v.technicianPhone && v.technicianPhone.includes(query)) ||
        (v.officeName && v.officeName.toLowerCase().includes(query)),
    );
  }

  return list;
});

// Real-time statistics from loaded visits
const stats = computed(() => {
  const total = allVisits.value.length;
  const attended = allVisits.value.filter((v) => v.status === 'attended').length;
  const missed = allVisits.value.filter((v) => v.status === 'missed').length;
  // Số kỹ thuật viên có lịch vắng cần hỗ trợ đặt lại
  const needSupport = new Set(
    allVisits.value.filter((v) => v.status === 'missed').map((v) => v.technicianId),
  ).size;

  return { total, attended, missed, needSupport };
});

const openDrawer = (row: OfficeVisitRow) => {
  selected.value = row;
};

const closeDrawer = () => {
  selected.value = null;
};

const rowHighlightClass = (row: OfficeVisitRow) => {
  const isSelected = selected.value?.id === row.id;
  return isSelected
    ? '!bg-blue-50/75 border-l-4 !border-l-brand-600 transition-colors'
    : 'cursor-pointer hover:bg-slate-50/80 transition-colors';
};

// Actions with modal confirmation
const promptAttended = (row: OfficeVisitRow) => {
  actionModal.value = {
    open: true,
    type: 'attended',
    row,
    note: '',
  };
};

const promptMissed = (row: OfficeVisitRow) => {
  actionModal.value = {
    open: true,
    type: 'missed',
    row,
    note: '',
  };
};

const promptReset = (row: OfficeVisitRow) => {
  actionModal.value = {
    open: true,
    type: 'reset',
    row,
    note: '',
  };
};

const confirmAction = async () => {
  const { type, row, note } = actionModal.value;
  if (!row) return;

  actionModal.value.open = false;
  busyId.value = row.id;
  error.value = '';
  successMessage.value = '';

  try {
    if (type === 'attended') {
      await adminOfficeVisitsApi.markAttended(row.id, note.trim() || undefined);
      successMessage.value = `Đã ghi nhận buổi gặp cho kỹ thuật viên ${row.technicianName}.`;
    } else if (type === 'missed') {
      await adminOfficeVisitsApi.markMissed(row.id, note.trim() || undefined);
      successMessage.value = `Đã ghi nhận vắng mặt cho kỹ thuật viên ${row.technicianName}.`;
    } else if (type === 'reset') {
      await adminOfficeVisitsApi.resetMissed(row.technicianId);
      successMessage.value = `Đã cho phép kỹ thuật viên ${row.technicianName} đặt lại lịch hẹn.`;
    }
    await load();
  } catch (reason) {
    const fallback =
      type === 'attended'
        ? 'Chưa ghi nhận được buổi gặp.'
        : type === 'missed'
          ? 'Chưa ghi nhận vắng mặt được.'
          : 'Chưa cho phép đặt lại được.';
    error.value = userFacingError(reason, fallback);
  } finally {
    busyId.value = '';
  }
};

// Filter shortcuts from stat cards
const setStatusFilter = (st: OfficeVisitStatus | '') => {
  statusFilter.value = statusFilter.value === st ? '' : st;
};

watch([dateFilter, officeFilter], load);

onMounted(async () => {
  await Promise.all([loadOffices(), load()]);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3.5">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100/90 bg-blue-50 text-blue-600 shadow-xs">
          <Calendar :size="22" class="stroke-[2]" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <h1 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Lịch hẹn trụ sở</h1>
          <p class="mt-0.5 text-xs text-ink-500 sm:text-sm text-pretty">
            Theo dõi và quản lý lịch hẹn của kỹ thuật viên tại các trụ sở. Ghi nhận trạng thái đã gặp, vắng, hủy và hỗ trợ cho phép đặt lại khi cần.
          </p>
        </div>
      </div>
    </div>

    <!-- 4 Stat Cards -->
    <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <!-- Tổng lịch -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border bg-white p-4 text-left transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="statusFilter === '' ? 'border-brand-200 bg-brand-50/20 shadow-xs ring-1 ring-brand-200' : 'border-ink-100 hover:border-ink-200 hover:shadow-xs'"
        title="Bấm để lọc tất cả lịch hẹn"
        @click="setStatusFilter('')"
      >
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100/80 bg-blue-50 text-blue-600">
          <Calendar :size="20" class="stroke-[2]" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Tổng lịch</div>
          <div class="mt-0.5 font-num text-2xl font-bold text-ink-900">
            {{ loading && !allVisits.length ? '—' : stats.total }}
          </div>
        </div>
      </button>

      <!-- Đã gặp -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border bg-white p-4 text-left transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="statusFilter === 'attended' ? 'border-emerald-300 bg-emerald-50/30 shadow-xs ring-1 ring-emerald-300' : 'border-ink-100 hover:border-ink-200 hover:shadow-xs'"
        title="Bấm để lọc lịch đã gặp"
        @click="setStatusFilter('attended')"
      >
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100/80 bg-emerald-50 text-emerald-600">
          <CheckCircle2 :size="20" class="stroke-[2]" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Đã gặp</div>
          <div class="mt-0.5 font-num text-2xl font-bold text-ink-900">
            {{ loading && !allVisits.length ? '—' : stats.attended }}
          </div>
        </div>
      </button>

      <!-- Vắng -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border bg-white p-4 text-left transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="statusFilter === 'missed' ? 'border-amber-300 bg-amber-50/30 shadow-xs ring-1 ring-amber-300' : 'border-ink-100 hover:border-ink-200 hover:shadow-xs'"
        title="Bấm để lọc lịch vắng mặt"
        @click="setStatusFilter('missed')"
      >
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-100/80 bg-amber-50 text-amber-600">
          <UserX :size="20" class="stroke-[2]" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Vắng</div>
          <div class="mt-0.5 font-num text-2xl font-bold text-ink-900">
            {{ loading && !allVisits.length ? '—' : stats.missed }}
          </div>
        </div>
      </button>

      <!-- Cần hỗ trợ lại -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border bg-white p-4 text-left transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="statusFilter === 'missed' ? 'border-indigo-300 bg-indigo-50/30 shadow-xs ring-1 ring-indigo-300' : 'border-ink-100 hover:border-ink-200 hover:shadow-xs'"
        title="Kỹ thuật viên vắng lịch cần quản lý hỗ trợ cho phép đặt lại"
        @click="setStatusFilter('missed')"
      >
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100/80 bg-indigo-50 text-indigo-600">
          <RotateCcw :size="20" class="stroke-[2]" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Cần hỗ trợ lại</div>
          <div class="mt-0.5 font-num text-2xl font-bold text-ink-900">
            {{ loading && !allVisits.length ? '—' : stats.needSupport }}
          </div>
        </div>
      </button>
    </div>

    <!-- Filter & Search Bar -->
    <div class="rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <!-- Trạng thái -->
        <div>
          <label for="filter-status" class="mb-1.5 block text-xs font-medium text-ink-500">Trạng thái</label>
          <div class="relative">
            <select
              id="filter-status"
              v-model="statusFilter"
              class="h-10 w-full appearance-none rounded-xl border border-ink-200 bg-white px-3.5 pr-8 text-sm text-ink-800 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="scheduled">Chờ xác nhận</option>
              <option value="attended">Đã gặp</option>
              <option value="missed">Vắng mặt</option>
              <option value="cancelled">Đã hủy</option>
            </select>
            <ChevronDown :size="16" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          </div>
        </div>

        <!-- Ngày hẹn -->
        <div>
          <label for="filter-date" class="mb-1.5 block text-xs font-medium text-ink-500">Ngày hẹn</label>
          <div class="relative">
            <Calendar :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              id="filter-date"
              v-model="dateFilter"
              type="date"
              class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-8 text-sm text-ink-800 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Ngày hẹn"
            />
            <button
              v-if="dateFilter"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-0.5 rounded"
              title="Xóa ngày"
              @click="dateFilter = ''"
            >
              <X :size="14" />
            </button>
          </div>
        </div>

        <!-- Trụ sở -->
        <div>
          <label for="filter-office" class="mb-1.5 block text-xs font-medium text-ink-500">Trụ sở</label>
          <div class="relative">
            <select
              id="filter-office"
              v-model="officeFilter"
              class="h-10 w-full appearance-none rounded-xl border border-ink-200 bg-white px-3.5 pr-8 text-sm text-ink-800 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">Tất cả trụ sở</option>
              <option v-for="office in offices" :key="office.id" :value="office.id">
                {{ office.name }}
              </option>
            </select>
            <ChevronDown :size="16" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          </div>
        </div>

        <!-- Tìm kiếm -->
        <div>
          <label for="filter-search" class="mb-1.5 block text-xs font-medium text-ink-500">Tìm kiếm</label>
          <div class="relative">
            <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              id="filter-search"
              v-model="searchQuery"
              type="search"
              placeholder="Tìm theo tên kỹ thuật viên hoặc SĐT..."
              class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-8 text-sm text-ink-800 transition-colors placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 p-0.5 rounded"
              title="Xóa tìm kiếm"
              @click="searchQuery = ''"
            >
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Feedback Alerts -->
    <Transition name="fh-fade-slide">
      <div
        v-if="error"
        class="flex items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
        role="alert"
      >
        <AlertCircle :size="16" class="shrink-0 text-danger-600" />
        <span class="flex-1">{{ error }}</span>
        <button type="button" class="text-danger-500 hover:text-danger-700" @click="error = ''">
          <X :size="16" />
        </button>
      </div>
    </Transition>

    <Transition name="fh-fade-slide">
      <div
        v-if="successMessage"
        class="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800"
        role="status"
      >
        <CheckCircle2 :size="16" class="shrink-0 text-success-600" />
        <span class="flex-1">{{ successMessage }}</span>
        <button type="button" class="text-success-500 hover:text-success-700" @click="successMessage = ''">
          <X :size="16" />
        </button>
      </div>
    </Transition>

    <!-- Table Section -->
    <div class="animate-slide-up-delay-2">
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="load" />
      <ConsoleTable
        v-else
        :columns="columns"
        :rows="filteredRows"
        :loading="loading"
        :row-class="rowHighlightClass"
        empty-text="Không tìm thấy lịch hẹn nào phù hợp với bộ lọc."
        @row-click="openDrawer"
      >
        <!-- Cell: Thợ / SĐT -->
        <template #cell-technician="{ row }">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
              <User :size="15" aria-hidden="true" />
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-ink-900 text-sm truncate">
                {{ row.technicianName }}
              </div>
              <div class="font-num text-xs text-ink-500">
                {{ row.technicianPhone || '—' }}
              </div>
            </div>
          </div>
        </template>

        <!-- Cell: Trụ sở -->
        <template #cell-office="{ row }">
          <div class="min-w-0 max-w-sm">
            <div class="font-medium text-ink-900 text-sm truncate">
              {{ row.officeName }}
            </div>
            <div class="text-xs text-ink-500 truncate" :title="row.officeAddress">
              {{ row.officeAddress }}
            </div>
          </div>
        </template>

        <!-- Cell: Giờ hẹn -->
        <template #cell-time="{ row }">
          <span class="whitespace-nowrap font-num text-sm text-ink-800">
            {{ formatScheduledTime(row.scheduledAt) }}
          </span>
        </template>

        <!-- Cell: Trạng thái -->
        <template #cell-status="{ row }">
          <span
            class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
            :class="[
              STATUS_CONFIG[row.status]?.pillBg ?? 'bg-slate-100',
              STATUS_CONFIG[row.status]?.pillText ?? 'text-slate-600',
              STATUS_CONFIG[row.status]?.pillBorder ?? 'border-slate-200/80',
            ]"
          >
            <component
              :is="STATUS_CONFIG[row.status]?.icon ?? Clock"
              :size="12"
              class="stroke-[2.5]"
              aria-hidden="true"
            />
            {{ STATUS_CONFIG[row.status]?.label ?? row.status }}
          </span>
        </template>

        <!-- Cell: Ghi chú ngắn -->
        <template #cell-note="{ row }">
          <span class="text-xs text-ink-500 line-clamp-1" :title="row.note || ''">
            {{ row.note || '—' }}
          </span>
        </template>

        <!-- Cell: Hành động -->
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end" @click.stop>
            <ConsoleMoreMenu label="Thao tác khác với lịch hẹn">
              <ConsoleMenuItem @click="openDrawer(row)">
                <Eye :size="15" aria-hidden="true" />
                <span>Xem chi tiết</span>
              </ConsoleMenuItem>

              <template v-if="row.status === 'scheduled'">
                <ConsoleMenuItem @click="promptAttended(row)">
                  <Check :size="15" class="text-emerald-600" aria-hidden="true" />
                  <span>Đã gặp</span>
                </ConsoleMenuItem>
                <ConsoleMenuItem danger @click="promptMissed(row)">
                  <UserX :size="15" aria-hidden="true" />
                  <span>Ghi nhận vắng</span>
                </ConsoleMenuItem>
              </template>

              <ConsoleMenuItem v-else-if="row.status === 'missed'" @click="promptReset(row)">
                <RotateCcw :size="15" class="text-blue-600" aria-hidden="true" />
                <span>Cho phép đặt lại</span>
              </ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </template>
      </ConsoleTable>
    </div>

    <!-- Drawer Chi tiết lịch hẹn (Trượt từ bên phải) -->
    <Teleport to="body">
      <Transition name="fh-drawer">
        <div
          v-if="selected"
          class="fixed inset-0 z-50 flex justify-end bg-ink-950/40 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="office-visit-drawer-title"
          @click.self="closeDrawer"
          @keydown.esc="closeDrawer"
        >
          <section class="fh-drawer-panel relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-ink-200 bg-white shadow-(--shadow-e3)">
            <!-- Drawer Header -->
            <header class="flex shrink-0 items-center justify-between border-b border-ink-100 bg-white px-6 py-4">
              <h2 id="office-visit-drawer-title" class="text-base font-bold text-ink-900">
                Chi tiết lịch hẹn
              </h2>
              <button
                type="button"
                class="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                aria-label="Đóng"
                @click="closeDrawer"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </header>

            <!-- Drawer Body -->
            <div class="flex-1 space-y-6 overflow-y-auto overscroll-contain p-6 text-sm">
              <!-- Technician Card -->
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-200/60 bg-blue-100/70 text-blue-600">
                    <User :size="20" aria-hidden="true" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="truncate text-base font-bold text-ink-900">
                      {{ selected.technicianName }}
                    </h3>
                    <p class="text-xs font-medium text-ink-500">Kỹ thuật viên</p>
                  </div>
                </div>

                <!-- Status pill on top-right of technician card -->
                <span
                  class="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  :class="[
                    STATUS_CONFIG[selected.status]?.pillBg ?? 'bg-slate-100',
                    STATUS_CONFIG[selected.status]?.pillText ?? 'text-slate-600',
                    STATUS_CONFIG[selected.status]?.pillBorder ?? 'border-slate-200/80',
                  ]"
                >
                  <component
                    :is="STATUS_CONFIG[selected.status]?.icon ?? Clock"
                    :size="12"
                    class="stroke-[2.5]"
                    aria-hidden="true"
                  />
                  {{ STATUS_CONFIG[selected.status]?.label ?? selected.status }}
                </span>
              </div>

              <!-- Information Details -->
              <div class="space-y-4 pt-1">
                <!-- Số điện thoại -->
                <div class="flex items-start gap-3.5">
                  <Phone :size="18" class="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-ink-400">Số điện thoại</div>
                    <div v-if="selected.technicianPhone" class="mt-0.5 font-num text-sm font-semibold text-ink-900">
                      <a
                        :href="`tel:${selected.technicianPhone}`"
                        class="hover:text-brand-600 hover:underline"
                      >
                        {{ selected.technicianPhone }}
                      </a>
                    </div>
                    <div v-else class="mt-0.5 text-sm text-ink-400 font-medium">—</div>
                  </div>
                </div>

                <!-- Trụ sở -->
                <div class="flex items-start gap-3.5">
                  <Building2 :size="18" class="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-ink-400">Trụ sở</div>
                    <div class="mt-0.5 text-sm font-semibold text-ink-900">
                      {{ selected.officeName }}
                    </div>
                  </div>
                </div>

                <!-- Địa chỉ -->
                <div class="flex items-start gap-3.5">
                  <MapPin :size="18" class="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-ink-400">Địa chỉ</div>
                    <div class="mt-0.5 text-sm text-ink-800 leading-relaxed font-medium">
                      {{ selected.officeAddress }}
                    </div>
                  </div>
                </div>

                <!-- Giờ hẹn -->
                <div class="flex items-start gap-3.5">
                  <Calendar :size="18" class="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-ink-400">Giờ hẹn</div>
                    <div class="mt-0.5 font-num text-sm font-semibold text-ink-900">
                      {{ formatScheduledTime(selected.scheduledAt) }}
                    </div>
                  </div>
                </div>

                <!-- Trạng thái -->
                <div class="flex items-start gap-3.5">
                  <Activity :size="18" class="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div class="min-w-0">
                    <div class="mb-1 text-xs font-medium text-ink-400">Trạng thái</div>
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      :class="[
                        STATUS_CONFIG[selected.status]?.pillBg ?? 'bg-slate-100',
                        STATUS_CONFIG[selected.status]?.pillText ?? 'text-slate-600',
                        STATUS_CONFIG[selected.status]?.pillBorder ?? 'border-slate-200/80',
                      ]"
                    >
                      <component
                        :is="STATUS_CONFIG[selected.status]?.icon ?? Clock"
                        :size="12"
                        class="stroke-[2.5]"
                        aria-hidden="true"
                      />
                      {{ STATUS_CONFIG[selected.status]?.label ?? selected.status }}
                    </span>
                  </div>
                </div>

                <!-- Ghi chú -->
                <div class="flex items-start gap-3.5">
                  <FileText :size="18" class="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-ink-400">Ghi chú</div>
                    <div class="mt-0.5 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
                      {{ selected.note || '—' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Drawer Footer Actions -->
            <footer class="shrink-0 space-y-2.5 border-t border-ink-100 bg-white p-5">
              <!-- When MISSED: Cho phép đặt lại (Primary Blue) + Liên hệ + Đóng -->
              <template v-if="selected.status === 'missed'">
                <button
                  type="button"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-medium text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:opacity-50"
                  :disabled="busyId === selected.id"
                  @click="promptReset(selected)"
                >
                  <RotateCcw :size="16" aria-hidden="true" />
                  <span>Cho phép đặt lại</span>
                </button>

                <a
                  v-if="selected.technicianPhone"
                  :href="`tel:${selected.technicianPhone}`"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 font-medium text-brand-700 transition-colors hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-sm"
                >
                  <Phone :size="16" aria-hidden="true" />
                  <span>Liên hệ</span>
                </a>

                <button
                  type="button"
                  class="flex h-10 w-full items-center justify-center rounded-xl border border-ink-200 bg-white font-medium text-ink-700 transition-colors hover:bg-ink-50 text-sm cursor-pointer"
                  @click="closeDrawer"
                >
                  Đóng
                </button>
              </template>

              <!-- When SCHEDULED: Xác nhận đã gặp (Primary) + Ghi nhận vắng (Secondary) + Liên hệ + Đóng -->
              <template v-else-if="selected.status === 'scheduled'">
                <button
                  type="button"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-medium text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:opacity-50"
                  :disabled="busyId === selected.id"
                  @click="promptAttended(selected)"
                >
                  <Check :size="16" aria-hidden="true" />
                  <span>Xác nhận đã gặp</span>
                </button>

                <button
                  type="button"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer disabled:opacity-50"
                  :disabled="busyId === selected.id"
                  @click="promptMissed(selected)"
                >
                  <UserX :size="16" aria-hidden="true" />
                  <span>Ghi nhận vắng mặt</span>
                </button>

                <a
                  v-if="selected.technicianPhone"
                  :href="`tel:${selected.technicianPhone}`"
                  class="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white font-medium text-ink-700 transition-colors hover:bg-ink-50 text-sm"
                >
                  <Phone :size="15" aria-hidden="true" />
                  <span>Liên hệ</span>
                </a>

                <button
                  type="button"
                  class="flex h-9 w-full items-center justify-center rounded-xl font-medium text-ink-600 transition-colors hover:bg-ink-100 text-sm cursor-pointer"
                  @click="closeDrawer"
                >
                  Đóng
                </button>
              </template>

              <!-- When ATTENDED or CANCELLED: NO "Cho phép đặt lại", only Liên hệ + Đóng -->
              <template v-else>
                <a
                  v-if="selected.technicianPhone"
                  :href="`tel:${selected.technicianPhone}`"
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 font-medium text-brand-700 transition-colors hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 text-sm"
                >
                  <Phone :size="16" aria-hidden="true" />
                  <span>Liên hệ</span>
                </a>

                <button
                  type="button"
                  class="flex h-10 w-full items-center justify-center rounded-xl border border-ink-200 bg-white font-medium text-ink-700 transition-colors hover:bg-ink-50 text-sm cursor-pointer"
                  @click="closeDrawer"
                >
                  Đóng
                </button>
              </template>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- Confirmation Modal with Note Input -->
    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="actionModal.open"
          class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-action-title"
          @click.self="actionModal.open = false"
          @keydown.esc="actionModal.open = false"
        >
          <div class="fh-modal-panel w-full max-w-md space-y-4 rounded-2xl border border-ink-200 bg-white p-6 shadow-(--shadow-e3)">
            <!-- Header -->
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  :class="{
                    'bg-emerald-50 text-emerald-600': actionModal.type === 'attended',
                    'bg-amber-50 text-amber-600': actionModal.type === 'missed',
                    'bg-blue-50 text-blue-600': actionModal.type === 'reset',
                  }"
                >
                  <Check v-if="actionModal.type === 'attended'" :size="20" />
                  <UserX v-else-if="actionModal.type === 'missed'" :size="20" />
                  <RotateCcw v-else :size="20" />
                </div>
                <div>
                  <h3 id="confirm-action-title" class="text-base font-bold text-ink-900">
                    <template v-if="actionModal.type === 'attended'">Xác nhận buổi gặp</template>
                    <template v-else-if="actionModal.type === 'missed'">Ghi nhận thợ vắng</template>
                    <template v-else>Cho phép đặt lại lịch</template>
                  </h3>
                  <p class="text-xs text-ink-500">
                    Kỹ thuật viên: <span class="font-semibold text-ink-800">{{ actionModal.row?.technicianName }}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                class="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Đóng"
                @click="actionModal.open = false"
              >
                <X :size="18" />
              </button>
            </div>

            <!-- Description -->
            <p class="text-sm text-ink-600 leading-relaxed">
              <template v-if="actionModal.type === 'attended'">
                Xác nhận kỹ thuật viên đã đến trụ sở đúng hẹn để đối chiếu thông tin và kiểm tra hồ sơ.
              </template>
              <template v-else-if="actionModal.type === 'missed'">
                Ghi nhận kỹ thuật viên không đến buổi hẹn. Hệ thống sẽ tính số lần vắng và thông báo cho kỹ thuật viên.
              </template>
              <template v-else>
                Xóa các lượt vắng trước đó, mở khóa để kỹ thuật viên có thể chọn trụ sở và đặt lại lịch hẹn mới.
              </template>
            </p>

            <!-- Optional Note Input -->
            <div v-if="actionModal.type !== 'reset'" class="space-y-1.5">
              <label for="action-modal-note" class="text-xs font-medium text-ink-600">
                Ghi chú ngắn (tùy chọn)
              </label>
              <input
                id="action-modal-note"
                v-model="actionModal.note"
                type="text"
                maxlength="250"
                class="h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                :placeholder="actionModal.type === 'missed' ? 'Ví dụ: Không đến đúng giờ, bận việc đột xuất...' : 'Ghi chú buổi gặp...'"
              />
            </div>

            <!-- Modal Actions -->
            <div class="flex items-center justify-end gap-2.5 pt-2">
              <FhButton
                variant="secondary"
                size="md"
                @click="actionModal.open = false"
              >
                Hủy
              </FhButton>
              <FhButton
                :variant="actionModal.type === 'missed' ? 'danger' : 'primary'"
                size="md"
                @click="confirmAction"
              >
                <template v-if="actionModal.type === 'attended'">Xác nhận đã gặp</template>
                <template v-else-if="actionModal.type === 'missed'">Ghi nhận vắng</template>
                <template v-else>Cho phép đặt lại</template>
              </FhButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
