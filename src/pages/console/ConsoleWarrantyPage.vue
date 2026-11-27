<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  Eye,
  FileCheck,
  Layers,
  ListOrdered,
  Package,
  RotateCcw,
  RotateCw,
  Search,
  User,
  UserPlus,
  Wrench,
} from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleStatCard from '../../components/console/ConsoleStatCard.vue';
import ConsoleTitleArtwork from '../../components/console/ConsoleTitleArtwork.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import WarrantyDecisionModal, { type WarrantyDecisionMode } from '../../components/console/WarrantyDecisionModal.vue';
import {
  warrantyManagerApi,
  type StaffWarrantyClaim,
  type TechnicianWarrantyStat,
} from '../../api/warranty-claims.api';
import { useAuthStore } from '../../stores/auth';
import { formatDateTimeVN } from '../../utils/formatters';
import {
  managerClaimDisplayMeta,
  warrantyClaimStatusMeta,
  warrantyClaimToneClasses,
  type WarrantyClaimStatus,
} from '../../utils/warranty-claim';
import { getSupportErrorMessage } from './support-cases.utils';
import { useLiveOrderRefresh } from '../../composables/useLiveOrderRefresh';
import { pageItems } from '../../utils/pagination';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const authStore = useAuthStore();
const canDecide = computed(() => authStore.userRole === 'SERVICE_MANAGER');

const tab = ref<'queue' | 'rates'>('queue');
const claims = ref<StaffWarrantyClaim[]>([]);
const loading = ref(true);
const error = ref('');
const actionError = ref('');
const notice = ref('');
const page = ref(1);
const limit = 10;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const statusFilter = ref<WarrantyClaimStatus | ''>('');
const timeFilter = ref<'all' | 'today' | '7d' | '30d' | 'this_month'>('all');
const searchQuery = ref('');
const reviewOnly = ref(false);
const technicians = ref<{ id: string; fullName: string }[]>([]);
const artworkErrors = ref<Record<string, boolean>>({});
function onArtworkError(id: string) {
  artworkErrors.value[id] = true;
}

const modalClaim = ref<StaffWarrantyClaim | null>(null);
const modalMode = ref<WarrantyDecisionMode | null>(null);

const stats = ref<TechnicianWarrantyStat[]>([]);
const statsLoading = ref(false);
const statsError = ref('');
const windowDays = ref(90);
const statsSearchQuery = ref('');
const statsPage = ref(1);
const statsLimit = ref(8);

const pad = (n: number) => String(n).padStart(2, '0');
const todayDate = new Date();
const todayIso = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-${pad(todayDate.getDate())}`;

const customDateFrom = ref(
  (() => {
    const d = new Date(Date.now() - 90 * 86_400_000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })(),
);
const customDateTo = ref(todayIso);
const isCustomDateActive = ref(false);
const isDatePickerOpen = ref(false);
const datePickerRef = ref<HTMLElement | null>(null);

function formatIsoToVN(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatTechId(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits) {
    const trimmed = digits.replace(/^0+/, '') || digits;
    return trimmed.slice(-3).padStart(3, '0');
  }
  return id.slice(0, 3).toUpperCase();
}

const windowDateRangeText = computed(() => {
  if (isCustomDateActive.value && customDateFrom.value && customDateTo.value) {
    return `${formatIsoToVN(customDateFrom.value)} – ${formatIsoToVN(customDateTo.value)}`;
  }
  const end = new Date();
  const start = new Date(Date.now() - windowDays.value * 86_400_000);
  const fmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
});

function selectDatePreset(days: number) {
  windowDays.value = days;
  isCustomDateActive.value = false;
  const start = new Date(Date.now() - days * 86_400_000);
  customDateFrom.value = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  customDateTo.value = todayIso;
  isDatePickerOpen.value = false;
  void loadStats();
}

function applyCustomDate() {
  if (!customDateFrom.value || !customDateTo.value) return;
  const start = new Date(customDateFrom.value);
  const end = new Date(customDateTo.value);
  if (start > end) {
    const temp = customDateFrom.value;
    customDateFrom.value = customDateTo.value;
    customDateTo.value = temp;
  }
  const s = new Date(customDateFrom.value);
  const e = new Date(customDateTo.value);
  const diffDays = Math.max(7, Math.min(365, Math.round((e.getTime() - s.getTime()) / 86_400_000))) || 7;
  windowDays.value = diffDays;
  isCustomDateActive.value = true;
  isDatePickerOpen.value = false;
  void loadStats();
}

function resetDateFilter() {
  selectDatePreset(90);
}

function onDocumentClick(e: MouseEvent) {
  if (isDatePickerOpen.value && datePickerRef.value && !datePickerRef.value.contains(e.target as Node)) {
    isDatePickerOpen.value = false;
  }
}

const totalTechCount = computed(() => stats.value.length);
const techWithClaimsCount = computed(() => stats.value.filter((s) => s.claims > 0).length);
const techWithClaimsPct = computed(() =>
  stats.value.length > 0 ? Math.round((techWithClaimsCount.value / stats.value.length) * 100) : 0,
);
const overallClaimRatePct = computed(() => {
  const totalClaims = stats.value.reduce((sum, s) => sum + s.claims, 0);
  const totalOrders = stats.value.reduce((sum, s) => sum + s.ordersWithWarranty, 0);
  if (totalOrders > 0) return Math.round((totalClaims / totalOrders) * 100);
  if (!stats.value.length) return 0;
  const validRates = stats.value.map((s) => s.claimRate).filter((r): r is number => r !== null);
  if (!validRates.length) return 0;
  return Math.round((validRates.reduce((a, b) => a + b, 0) / validRates.length) * 100);
});
const pendingClaimsCount = computed(() => claims.value.filter((c) => !closed(c)).length);

const filteredStats = computed(() => {
  let list = stats.value;
  const q = statsSearchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.technicianId.toLowerCase().includes(q) ||
        formatTechId(s.technicianId).toLowerCase().includes(q),
    );
  }
  return list;
});

const statsTotalPages = computed(() => Math.max(1, Math.ceil(filteredStats.value.length / statsLimit.value)));
const pagedStats = computed(() => {
  const start = (statsPage.value - 1) * statsLimit.value;
  return filteredStats.value.slice(start, start + statsLimit.value);
});
const statsPageFrom = computed(() => (filteredStats.value.length === 0 ? 0 : (statsPage.value - 1) * statsLimit.value + 1));
const statsPageTo = computed(() => Math.min(statsPage.value * statsLimit.value, filteredStats.value.length));
const statsPaginationItems = computed(() => pageItems(statsPage.value, statsTotalPages.value));

function filterQueueByTech(name: string) {
  tab.value = 'queue';
  searchQuery.value = name;
}

watch([statsSearchQuery, windowDays, statsLimit], () => {
  statsPage.value = 1;
});

let latestRequest = 0;

async function loadQueue(quiet = false) {
  const requestId = ++latestRequest;
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    const result = await warrantyManagerApi.listQueue({
      page: page.value,
      limit,
      status: statusFilter.value || undefined,
      declineReview: reviewOnly.value ? 'pending' : undefined,
    });
    if (requestId !== latestRequest) return;
    claims.value = result.data;
    total.value = result.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    claims.value = [];
    total.value = 0;
    error.value = getSupportErrorMessage(reason, 'Không thể tải danh sách yêu cầu bảo hành. Vui lòng thử lại.');
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  statsError.value = '';
  try {
    stats.value = await warrantyManagerApi.technicianStats(windowDays.value);
  } catch (reason) {
    statsError.value = getSupportErrorMessage(reason, 'Không thể tải thống kê tỷ lệ bảo hành. Vui lòng thử lại.');
  } finally {
    statsLoading.value = false;
  }
}

async function openModal(claim: StaffWarrantyClaim, mode: WarrantyDecisionMode) {
  notice.value = '';
  actionError.value = '';
  if (mode === 'assign' && !technicians.value.length) {
    try {
      technicians.value = await warrantyManagerApi.eligibleTechnicians();
    } catch (reason) {
      actionError.value = getSupportErrorMessage(reason, 'Chưa tải được danh sách kỹ thuật viên, vui lòng thử lại.');
      return;
    }
  }
  modalClaim.value = claim;
  modalMode.value = mode;
}

function onDone(updated: StaffWarrantyClaim) {
  const index = claims.value.findIndex((c) => c.id === updated.id);
  if (index >= 0) claims.value[index] = updated;
  modalClaim.value = null;
  modalMode.value = null;
  notice.value = 'Đã ghi nhận quyết định của bạn.';
  void loadQueue();
}

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const meta = (claim: StaffWarrantyClaim) => managerClaimDisplayMeta(claim);
const closed = (claim: StaffWarrantyClaim) => ['resolved', 'rejected'].includes(claim.status);

const statusOptions = Object.entries(warrantyClaimStatusMeta) as [WarrantyClaimStatus, { label: string }][];

const hasQueueFilters = computed(() => Boolean(statusFilter.value || timeFilter.value !== 'all' || searchQuery.value || reviewOnly.value));
const resetQueueFilters = () => {
  statusFilter.value = '';
  timeFilter.value = 'all';
  searchQuery.value = '';
  reviewOnly.value = false;
};

const filteredClaims = computed(() => {
  let list = claims.value;
  if (timeFilter.value !== 'all') {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    list = list.filter((c) => {
      const t = new Date(c.submittedAt).getTime();
      if (timeFilter.value === 'today') return now - t < oneDay;
      if (timeFilter.value === '7d') return now - t < 7 * oneDay;
      if (timeFilter.value === '30d') return now - t < 30 * oneDay;
      if (timeFilter.value === 'this_month') {
        const d = new Date(c.submittedAt);
        const cur = new Date();
        return d.getMonth() === cur.getMonth() && d.getFullYear() === cur.getFullYear();
      }
      return true;
    });
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((c) =>
      c.order.code.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.order.customerName.toLowerCase().includes(q) ||
      c.order.serviceName.toLowerCase().includes(q) ||
      (c.technician?.fullName || '').toLowerCase().includes(q),
    );
  }
  return list;
});

const pageFrom = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const pageTo = computed(() => Math.min(page.value * limit, total.value));
const paginationItems = computed(() => pageItems(page.value, totalPages.value));

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '—';
  const parts = name.trim().split(/\s+/u);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function getServiceIcon(name?: string | null): Component {
  const s = (name || '').toLowerCase();
  if (s.includes('lắp') || s.includes('thay') || s.includes('thiết bị')) return Package;
  if (s.includes('vệ sinh')) return Layers;
  if (s.includes('nước') || s.includes('vòi') || s.includes('ống') || s.includes('bơm')) return Droplets;
  return Wrench;
}

function statusBadgeIcon(claim: StaffWarrantyClaim): Component {
  if (claim.declineReview === 'pending') return Clock;
  if (claim.status === 'resolved') return CheckCircle2;
  if (claim.status === 'rejected') return AlertCircle;
  if (claim.status === 'awaiting_customer') return claim.customerResponse === 'agreed' ? CheckCircle2 : Clock;
  if (claim.status === 'inspected') return FileCheck;
  if (claim.status === 'submitted') return claim.technician ? Clock : UserPlus;
  if (claim.status === 'in_progress') return Wrench;
  return Clock;
}

watch([statusFilter, reviewOnly], () => {
  if (page.value !== 1) page.value = 1;
  else void loadQueue();
});
watch(page, () => void loadQueue());
watch(tab, (next) => {
  if (next === 'rates' && !stats.value.length && !statsLoading.value) void loadStats();
});
watch(windowDays, () => void loadStats());
onMounted(() => {
  void loadQueue();
  if (typeof window !== 'undefined') {
    window.addEventListener('click', onDocumentClick);
  }
});
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', onDocumentClick);
  }
});
useLiveOrderRefresh(['warranty', 'part'], () => { if (tab.value === 'queue') void loadQueue(true); });
</script>

<template>
  <div class="w-full space-y-5 pb-12">
    <!-- Header Section (Matching Demo UI) -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <ConsoleTitleArtwork src="/images/ui/console-warranty.png" />
        <div>
          <!-- Title without count badge as requested -->
          <div class="flex items-center gap-2.5">
            <h1 class="text-2xl font-bold tracking-tight text-ink-900">Yêu cầu bảo hành</h1>
            <span
              v-if="tab === 'rates'"
              class="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200/50"
            >
              Tỷ lệ theo kỹ thuật viên
            </span>
          </div>
          <p class="mt-0.5 text-xs sm:text-sm text-ink-500">
            {{ tab === 'rates' ? 'Thống kê và theo dõi tỷ lệ xử lý yêu cầu bảo hành của từng kỹ thuật viên' : 'Quản lý các yêu cầu bảo hành từ khách hàng và theo dõi quá trình xử lý.' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Read-only badge for Admin -->
        <span
          v-if="!canDecide"
          class="whitespace-nowrap rounded-full border border-ink-200 bg-white px-3.5 py-1 text-xs font-medium text-ink-600 shadow-2xs"
          title="Phân công, duyệt, từ chối và đóng yêu cầu do quản lý dịch vụ thực hiện."
          data-testid="warranty-read-only"
        >
          Chế độ chỉ đọc
        </span>
      </div>
    </div>

    <!-- 2 Tabs Navigation: Hàng đợi & Tỷ lệ theo kỹ thuật viên -->
    <div class="border-b border-ink-200/80">
      <div class="flex gap-8 overflow-x-auto scrollbar-none" role="tablist" aria-label="Phân loại bảo hành">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'queue'"
          class="-mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :class="tab === 'queue' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'"
          @click="tab = 'queue'"
        >
          <ListOrdered :size="16" />
          <span>Hàng đợi</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'rates'"
          class="-mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :class="tab === 'rates' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'"
          @click="tab = 'rates'"
        >
          <BarChart3 :size="16" />
          <span>Tỷ lệ theo kỹ thuật viên</span>
        </button>
      </div>
    </div>

    <!-- Notification alerts -->
    <Transition name="fh-fade-slide">
      <div v-if="notice" role="status" class="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
        <CheckCircle2 :size="16" aria-hidden="true" />
        <span>{{ notice }}</span>
      </div>
    </Transition>
    <Transition name="fh-fade-slide">
      <div v-if="actionError" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
        {{ actionError }}
      </div>
    </Transition>

    <!-- TAB 1: HÀNG ĐỢI -->
    <template v-if="tab === 'queue'">
      <!-- Toolbar: Filters, Search & Refresh Button -->
      <div class="rounded-2xl border border-ink-100 bg-white p-3.5 shadow-xs space-y-2.5">
        <div class="flex flex-wrap items-center gap-3">
          <!-- Filter 1: Status Dropdown -->
          <div class="relative shrink-0 min-w-[170px]">
            <select
              v-model="statusFilter"
              class="w-full appearance-none rounded-xl border border-ink-200 bg-white py-2 pl-3.5 pr-8 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer transition-colors"
              aria-label="Trạng thái"
            >
              <option value="">Tất cả trạng thái</option>
              <option v-for="[value, item] in statusOptions" :key="value" :value="value">{{ item.label }}</option>
            </select>
            <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>

          <!-- Filter 2: Time Dropdown -->
          <div class="relative shrink-0 min-w-[150px]">
            <select
              v-model="timeFilter"
              class="w-full appearance-none rounded-xl border border-ink-200 bg-white py-2 pl-8.5 pr-8 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer transition-colors"
              aria-label="Thời gian gửi"
            >
              <option value="all">Thời gian gửi</option>
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="this_month">Tháng này</option>
            </select>
            <Calendar :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>

          <!-- Filter 3: Search Input -->
          <div class="relative flex-1 min-w-[240px]">
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Tìm theo mã yêu cầu, khách hàng, kỹ thuật viên..."
              class="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            />
            <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>

          <!-- Filter 4: Refresh Button -->
          <button
            type="button"
            class="inline-flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
            title="Làm mới"
            :disabled="loading"
            @click="loadQueue()"
          >
            <RotateCw :size="15" :class="{ 'animate-spin': loading }" />
          </button>
        </div>

        <!-- Special Manager Filter Checkboxes & Reset -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100/70 pt-2 text-xs text-ink-600">
          <div class="flex flex-wrap items-center gap-4">
            <label class="flex cursor-pointer items-center gap-2 whitespace-nowrap text-ink-700 hover:text-ink-900 select-none">
              <input v-model="reviewOnly" type="checkbox" class="h-4 w-4 rounded accent-brand-600" />
              <span>Chờ xét từ chối hoặc không đến</span>
            </label>
          </div>
          <button
            v-if="hasQueueFilters"
            type="button"
            class="inline-flex items-center gap-1 font-medium text-ink-500 hover:text-brand-600 transition-colors"
            @click="resetQueueFilters"
          >
            <RotateCcw :size="12" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>
      </div>

      <!-- Main Table Container -->
      <div class="rounded-2xl border border-ink-100 bg-white shadow-xs overflow-hidden">
        <ConsoleLoadError v-if="error" :message="error" class="p-6" @retry="loadQueue()" />
        <template v-else>
          <div class="overflow-x-auto overscroll-x-contain">
            <table class="w-full min-w-[720px] md:min-w-full table-fixed text-left text-sm">
              <thead>
                <tr class="border-b border-ink-100 bg-slate-50/70 text-xs font-semibold text-ink-600">
                  <th scope="col" class="w-[15%] min-w-[115px] px-2.5 py-3 pl-3 sm:pl-4">Mã yêu cầu</th>
                  <th scope="col" class="w-[18%] min-w-[125px] px-2 py-3">Hạng mục</th>
                  <th scope="col" class="w-[18%] min-w-[130px] px-2 py-3">Trạng thái</th>
                  <th scope="col" class="w-[15%] min-w-[110px] px-2 py-3">Kỹ thuật viên</th>
                  <th scope="col" class="w-[13%] min-w-[100px] px-2 py-3">Khách hàng</th>
                  <th scope="col" class="w-[12%] min-w-[95px] px-2 py-3">Thời gian</th>
                  <th scope="col" class="w-[9%] min-w-[65px] px-2 py-3 pr-3 sm:pr-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <!-- Loading Skeleton -->
                <tr v-if="loading && !claims.length">
                  <td colspan="7" class="px-5 py-12 text-center" aria-busy="true">
                    <div class="space-y-3 max-w-sm mx-auto">
                      <FhSkeleton height="20px" width="100%" />
                      <FhSkeleton height="20px" width="80%" />
                      <FhSkeleton height="20px" width="90%" />
                    </div>
                  </td>
                </tr>

                <!-- Empty state -->
                <tr v-else-if="!filteredClaims.length">
                  <td colspan="7" class="px-5 py-12 text-center text-sm text-ink-500">
                    Không có yêu cầu bảo hành.
                  </td>
                </tr>

                <!-- Data rows -->
                <tr
                  v-for="row in filteredClaims"
                  :key="row.id"
                  class="transition-colors hover:bg-slate-50/70 cursor-pointer"
                  @click="$router.push(`/console/warranty/${row.id}`)"
                >
                  <!-- 1. Mã yêu cầu -->
                  <td class="px-2.5 py-2.5 pl-3 sm:pl-4" @click.stop>
                    <router-link
                      :to="`/console/warranty/${row.id}`"
                      class="font-num text-xs sm:text-[13px] font-semibold text-brand-600 hover:text-brand-700 hover:underline block truncate"
                      :title="'#' + (row.order.code || row.id)"
                    >
                      #{{ row.order.code || row.id.slice(0, 8) }}
                    </router-link>
                  </td>

                  <!-- 2. Hạng mục (Đồng bộ artwork dịch vụ 3D chuẩn FixHome) -->
                  <td class="px-2 py-2.5">
                    <div class="flex items-center gap-2 min-w-0">
                      <div
                        class="flex h-7.5 w-7.5 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-100/80 bg-blue-50/50 p-0.5"
                      >
                        <img
                          v-if="!artworkErrors[row.id]"
                          :src="getServiceArtworkUrl({ name: row.order.serviceName })"
                          :alt="row.order.serviceName || 'Dịch vụ'"
                          class="h-full w-full object-contain select-none pointer-events-none"
                          loading="lazy"
                          @error="onArtworkError(row.id)"
                        />
                        <component
                          v-else
                          :is="getServiceIcon(row.order.serviceName)"
                          :size="15"
                          class="text-brand-600"
                          aria-hidden="true"
                        />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-xs sm:text-[13px] font-medium text-ink-900" :title="row.order.serviceName">
                          {{ row.order.serviceName || 'Bảo hành dịch vụ' }}
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- 3. Trạng thái -->
                  <td class="px-2 py-2.5">
                    <div class="flex flex-col items-start gap-1 min-w-0">
                      <span
                        class="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                        :class="warrantyClaimToneClasses[meta(row).tone]"
                      >
                        <component :is="statusBadgeIcon(row)" :size="11" class="shrink-0" />
                        <span class="truncate">{{ meta(row).label }}</span>
                      </span>
                      <div v-if="row.submittedAfterExpiry || row.autoApproved" class="flex flex-wrap items-center gap-1">
                        <span
                          v-if="row.submittedAfterExpiry"
                          class="inline-flex items-center rounded-full border border-warning-200/60 bg-warning-50 px-1.5 py-0.2 text-[10px] font-medium text-warning-700 whitespace-nowrap"
                        >
                          Gửi sau hạn
                        </span>
                        <span
                          v-if="row.autoApproved"
                          class="inline-flex items-center rounded-full bg-ink-100 px-1.5 py-0.2 text-[10px] font-medium text-ink-600 whitespace-nowrap"
                        >
                          Tự động duyệt
                        </span>
                      </div>
                    </div>
                  </td>

                  <!-- 4. Kỹ thuật viên -->
                  <td class="px-2 py-2.5">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 overflow-hidden ring-1 ring-slate-300/50">
                        <span>{{ getInitials(row.technician?.fullName) }}</span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <span class="block truncate text-xs sm:text-[13px] font-medium text-ink-800" :title="row.technician?.fullName">
                          {{ row.technician?.fullName || '—' }}
                        </span>
                      </div>
                    </div>
                  </td>

                  <!-- 5. Khách hàng -->
                  <td class="px-2 py-2.5">
                    <div class="flex items-center gap-1.5 min-w-0 text-xs sm:text-[13px] text-ink-800">
                      <User :size="12" class="text-ink-400 shrink-0" />
                      <div class="min-w-0 flex-1">
                        <span class="block truncate font-medium text-ink-800" :title="row.order.customerName">
                          {{ row.order.customerName }}
                        </span>
                      </div>
                    </div>
                  </td>

                  <!-- 6. Thời gian -->
                  <td class="px-2 py-2.5">
                    <div class="flex items-center gap-1 text-xs font-num text-ink-600 whitespace-nowrap" :title="formatDateTimeVN(row.submittedAt)">
                      <Clock :size="12" class="text-ink-400 shrink-0 hidden sm:inline" />
                      <span>{{ formatDateTimeVN(row.submittedAt) }}</span>
                    </div>
                  </td>

                  <!-- 7. Thao tác -->
                  <td class="px-2 py-2.5 pr-3 sm:pr-4 text-right whitespace-nowrap" @click.stop>
                    <div class="flex items-center justify-end gap-1">
                      <!-- Decision buttons for Service Manager -->
                      <template v-if="canDecide && !closed(row)">
                        <FhButton
                          v-if="row.declineReview === 'pending'"
                          variant="primary"
                          size="sm"
                          class="!px-2 !py-1 text-xs shrink-0"
                          @click="openModal(row, 'review')"
                        >
                          <span>Xét {{ row.noShowFlaggedAt ? 'không đến' : 'từ chối' }}</span>
                        </FhButton>
                        <FhButton
                          v-else-if="row.status === 'inspected'"
                          variant="primary"
                          size="sm"
                          class="!px-2 !py-1 text-xs shrink-0"
                          @click="openModal(row, 'approve')"
                        >
                          <span>Duyệt kết luận</span>
                        </FhButton>
                        <FhButton
                          v-else-if="['in_progress', 'awaiting_customer', 'disputed'].includes(row.status)"
                          variant="primary"
                          size="sm"
                          class="!px-2 !py-1 text-xs shrink-0"
                          @click="openModal(row, 'close')"
                        >
                          <span>Đóng yêu cầu</span>
                        </FhButton>
                      </template>

                      <!-- Three dots more menu -->
                      <ConsoleMoreMenu>
                        <ConsoleMenuItem @click="$router.push(`/console/warranty/${row.id}`)">
                          <Eye :size="14" />
                          Xem chi tiết
                        </ConsoleMenuItem>
                      </ConsoleMoreMenu>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Footer Matching Demo UI -->
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 p-4">
            <div class="text-xs sm:text-sm text-ink-500 font-num">
              Hiển thị {{ pageFrom }} – {{ pageTo }} trong {{ total }} yêu cầu
            </div>

            <nav
              v-if="totalPages > 1"
              class="flex items-center gap-1.5"
              aria-label="Phân trang"
              data-testid="pagination"
            >
              <!-- Previous page button -->
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Trang trước"
                data-testid="pagination-prev"
                :disabled="loading || page <= 1"
                @click="page = Math.max(1, page - 1)"
              >
                <ChevronLeft :size="15" />
              </button>

              <!-- Numbered page buttons -->
              <template v-for="(item, index) in paginationItems" :key="item === 'gap' ? `gap-${index}` : item">
                <span v-if="item === 'gap'" class="w-6 text-center text-xs text-ink-400">…</span>
                <button
                  v-else
                  type="button"
                  class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold font-num transition-colors"
                  :class="item === page ? 'bg-brand-600 text-white shadow-2xs' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                  :aria-label="`Trang ${item}`"
                  :aria-current="item === page ? 'page' : undefined"
                  :disabled="loading"
                  :data-testid="`pagination-page-${item}`"
                  @click="page = item"
                >
                  {{ item }}
                </button>
              </template>

              <!-- Next page button -->
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Trang sau"
                :disabled="loading || page >= totalPages"
                @click="page = Math.min(totalPages, page + 1)"
              >
                <ChevronRight :size="15" />
              </button>
            </nav>
          </div>
        </template>
      </div>
    </template>

    <!-- TAB 2: TỶ LỆ THEO KỸ THUẬT VIÊN -->
    <template v-else>
      <!-- 4 Metric Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleStatCard
          featured
          :loading="statsLoading && !stats.length"
          label="Tổng kỹ thuật viên"
          :value="totalTechCount"
          :icon="Briefcase"
          tone="neutral"
        />

        <ConsoleStatCard
          :loading="statsLoading && !stats.length"
          label="Có yêu cầu bảo hành"
          :value="techWithClaimsCount"
          :icon="Wrench"
          tone="brand"
        >
          <template #badge>
            <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-700 font-num">
              {{ techWithClaimsPct }}%
            </span>
          </template>
        </ConsoleStatCard>

        <ConsoleStatCard
          :loading="statsLoading && !stats.length"
          label="Tỷ lệ bảo hành chung"
          :value="`${overallClaimRatePct}%`"
          :icon="CheckCircle2"
          tone="success"
        />

        <ConsoleStatCard
          :loading="statsLoading && !stats.length"
          label="Đang xử lý"
          :value="pendingClaimsCount"
          :icon="Clock"
          tone="warning"
        />
      </div>

      <!-- Filter Toolbar -->
      <div class="rounded-2xl border border-ink-100 bg-white p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3 flex-1">
          <!-- Window Days Selector -->
          <div class="relative shrink-0 min-w-[130px]">
            <select
              v-model.number="windowDays"
              class="w-full appearance-none rounded-xl border border-ink-200 bg-white py-2 pl-8.5 pr-8 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer transition-colors"
              aria-label="Khoảng thời gian"
            >
              <option :value="30">30 ngày</option>
              <option :value="90">90 ngày</option>
              <option :value="180">180 ngày</option>
              <option :value="365">365 ngày</option>
              <option v-if="![30, 90, 180, 365].includes(windowDays)" :value="windowDays">
                {{ windowDays }} ngày (Tùy chọn)
              </option>
            </select>
            <Calendar :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <ChevronDown :size="14" class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>

          <!-- Clickable & Searchable Custom Date Range Popover -->
          <div ref="datePickerRef" class="relative shrink-0">
            <button
              type="button"
              class="flex items-center gap-2 rounded-xl border border-ink-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-num text-ink-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer shadow-2xs"
              :class="{ 'border-brand-500 text-brand-700 bg-brand-50/30 ring-1 ring-brand-500/20': isCustomDateActive || isDatePickerOpen }"
              aria-label="Tìm kiếm hoặc chọn khoảng thời gian"
              title="Nhấn để tìm kiếm hoặc tùy chỉnh khoảng ngày"
              @click.stop="isDatePickerOpen = !isDatePickerOpen"
            >
              <Calendar :size="14" class="text-ink-400 shrink-0" />
              <span class="font-medium">{{ windowDateRangeText }}</span>
              <ChevronDown
                :size="13"
                class="text-ink-400 transition-transform duration-200"
                :class="{ 'rotate-180': isDatePickerOpen }"
              />
            </button>

            <!-- Date range popover dropdown -->
            <div
              v-if="isDatePickerOpen"
              class="absolute left-0 top-full z-40 mt-1.5 w-76 rounded-2xl border border-ink-200 bg-white p-4 shadow-xl space-y-3"
              @click.stop
            >
              <div class="flex items-center justify-between border-b border-ink-100 pb-2">
                <span class="text-xs font-semibold text-ink-700">Tùy chọn khoảng ngày</span>
                <span class="text-[11px] text-ink-400 font-num">7 – 365 ngày</span>
              </div>

              <!-- Quick presets -->
              <div>
                <div class="mb-1.5 text-[11px] font-medium text-ink-500">Khoảng thời gian mẫu</div>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    v-for="preset in [
                      { label: '30 ngày qua', days: 30 },
                      { label: '90 ngày qua', days: 90 },
                      { label: '180 ngày qua', days: 180 },
                      { label: '1 năm qua', days: 365 },
                    ]"
                    :key="preset.days"
                    type="button"
                    class="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors"
                    :class="!isCustomDateActive && windowDays === preset.days ? 'bg-brand-50 text-brand-700 font-semibold border border-brand-200/50' : 'text-ink-700 hover:bg-slate-50 border border-transparent'"
                    @click="selectDatePreset(preset.days)"
                  >
                    {{ preset.label }}
                  </button>
                </div>
              </div>

              <!-- Custom date range inputs -->
              <div class="border-t border-ink-100 pt-3 space-y-2.5">
                <div class="text-[11px] font-medium text-ink-500">Tìm kiếm ngày tùy chỉnh</div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="mb-1 block text-[11px] text-ink-600">Từ ngày</label>
                    <input
                      v-model="customDateFrom"
                      type="date"
                      :max="todayIso"
                      class="h-8.5 w-full rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800 transition-colors focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-[11px] text-ink-600">Đến ngày</label>
                    <input
                      v-model="customDateTo"
                      type="date"
                      :max="todayIso"
                      class="h-8.5 w-full rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800 transition-colors focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div class="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    class="rounded-lg px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800"
                    @click="resetDateFilter"
                  >
                    Mặc định
                  </button>
                  <FhButton
                    variant="primary"
                    size="sm"
                    @click="applyCustomDate"
                  >
                    Áp dụng
                  </FhButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Search Technician Input -->
          <div class="relative flex-1 min-w-[200px] max-w-sm">
            <input
              v-model="statsSearchQuery"
              type="search"
              placeholder="Tìm theo kỹ thuật viên..."
              class="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            />
            <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>
        </div>

        <!-- Refresh Button -->
        <button
          type="button"
          class="inline-flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
          title="Làm mới thống kê"
          :disabled="statsLoading"
          @click="loadStats()"
        >
          <RotateCw :size="15" :class="{ 'animate-spin': statsLoading }" />
        </button>
      </div>

      <!-- Main Table -->
      <div class="rounded-2xl border border-ink-100 bg-white shadow-xs overflow-hidden">
        <ConsoleLoadError v-if="statsError" :message="statsError" class="p-6" @retry="loadStats()" />
        <template v-else>
          <div class="w-full overflow-x-auto">
            <table class="w-full text-left text-sm table-auto">
              <thead>
                <tr class="border-b border-ink-100 bg-slate-50/70 text-xs font-semibold text-ink-600">
                  <th scope="col" class="whitespace-nowrap px-3 py-3 pl-4 sm:pl-5 text-center w-10">#</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3">Kỹ thuật viên</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-center">Đơn có bảo hành</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-center">Yêu cầu</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3">Tỷ lệ bảo hành</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-center hidden md:table-cell">Không bảo hành</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-center hidden lg:table-cell">Quản lý bởi kỹ thuật viên</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-center hidden xl:table-cell">Khách phản đối</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 text-center hidden lg:table-cell">Từ chối nhận</th>
                  <th scope="col" class="whitespace-nowrap px-3.5 py-3 pr-4 sm:pr-5 text-right w-10"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <tr v-if="statsLoading && !stats.length">
                  <td colspan="10" class="px-5 py-12 text-center" aria-busy="true">
                    <div class="space-y-3 max-w-sm mx-auto">
                      <FhSkeleton height="20px" width="100%" />
                      <FhSkeleton height="20px" width="80%" />
                    </div>
                  </td>
                </tr>
                <tr v-else-if="!filteredStats.length">
                  <td colspan="10" class="px-5 py-12 text-center text-sm text-ink-500">
                    Chưa có dữ liệu trong khoảng thời gian này.
                  </td>
                </tr>
                <tr
                  v-for="(row, idx) in pagedStats"
                  :key="row.technicianId"
                  class="transition-colors hover:bg-slate-50/70"
                >
                  <!-- 1. STT -->
                  <td class="whitespace-nowrap px-3 py-3 pl-4 sm:pl-5 text-center font-num text-xs text-ink-400">
                    {{ (statsPage - 1) * statsLimit + idx + 1 }}
                  </td>

                  <!-- 2. Kỹ thuật viên -->
                  <td class="whitespace-nowrap px-3.5 py-3">
                    <div class="flex items-center gap-2">
                      <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <User :size="14" />
                      </div>
                      <span class="font-medium text-ink-900">{{ row.fullName }}</span>
                      <span class="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono text-blue-600 bg-blue-50 border border-blue-200/50">
                        Id: {{ formatTechId(row.technicianId) }}
                      </span>
                    </div>
                  </td>

                  <!-- 3. Đơn có bảo hành -->
                  <td class="whitespace-nowrap px-3.5 py-3 text-center font-num text-ink-800">
                    {{ row.ordersWithWarranty }}
                  </td>

                  <!-- 4. Yêu cầu -->
                  <td class="whitespace-nowrap px-3.5 py-3 text-center font-num text-ink-800">
                    {{ row.claims }}
                  </td>

                  <!-- 5. Tỷ lệ bảo hành -->
                  <td class="whitespace-nowrap px-3.5 py-3">
                    <div class="font-num font-semibold text-ink-900 text-sm">
                      {{ pct(row.claimRate) }}
                    </div>
                    <div class="mt-1 h-1.5 w-24 sm:w-28 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all duration-300"
                        :class="(row.claimRate ?? 0) >= 1.0 ? 'bg-emerald-500' : 'bg-blue-600'"
                        :style="{ width: `${Math.min(100, Math.max(0, Math.round((row.claimRate ?? 0) * 100)))}%` }"
                      />
                    </div>
                    <span v-if="row.lowSample" class="mt-1 inline-flex items-center rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                      Ít dữ liệu
                    </span>
                  </td>

                  <!-- 6. Không bảo hành -->
                  <td class="whitespace-nowrap px-3.5 py-3 text-center font-num text-ink-700 hidden md:table-cell">
                    {{ pct(row.notCoveredRate) }}
                  </td>

                  <!-- 7. Quản lý bởi kỹ thuật viên -->
                  <td class="whitespace-nowrap px-3.5 py-3 text-center font-num text-ink-700 hidden lg:table-cell">
                    {{ pct(row.overriddenRate) }}
                  </td>

                  <!-- 8. Khách phản đối -->
                  <td class="whitespace-nowrap px-3.5 py-3 text-center font-num text-ink-700 hidden xl:table-cell">
                    {{ pct(row.disputedRate) }}
                  </td>

                  <!-- 9. Từ chối nhận -->
                  <td class="whitespace-nowrap px-3.5 py-3 text-center font-num text-ink-700 hidden lg:table-cell">
                    {{ row.declineRate === null ? '—' : `${pct(row.declineRate)} (${row.declines})` }}
                  </td>

                  <!-- 10. Actions -->
                  <td class="whitespace-nowrap px-3.5 py-3 pr-4 sm:pr-5 text-right">
                    <ConsoleMoreMenu>
                      <ConsoleMenuItem @click="filterQueueByTech(row.fullName)">
                        <Eye :size="14" />
                        Xem yêu cầu bảo hành
                      </ConsoleMenuItem>
                    </ConsoleMoreMenu>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Footer for Tab 2 -->
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 p-4">
            <div class="text-xs sm:text-sm text-ink-500 font-num">
              Hiển thị {{ statsPageFrom }} – {{ statsPageTo }} trên {{ filteredStats.length }} kỹ thuật viên
            </div>

            <div class="flex items-center gap-3">
              <!-- Page size dropdown -->
              <div class="relative shrink-0">
                <select
                  v-model.number="statsLimit"
                  class="appearance-none rounded-lg border border-ink-200 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-ink-700 focus:border-brand-500 focus:outline-none cursor-pointer"
                  aria-label="Số bản ghi trên trang"
                >
                  <option :value="8">8 / trang</option>
                  <option :value="10">10 / trang</option>
                  <option :value="20">20 / trang</option>
                </select>
                <ChevronDown :size="12" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" />
              </div>

              <!-- Navigation buttons -->
              <nav v-if="statsTotalPages > 1" class="flex items-center gap-1" aria-label="Phân trang kỹ thuật viên">
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Trang trước"
                  :disabled="statsPage <= 1"
                  @click="statsPage = Math.max(1, statsPage - 1)"
                >
                  <ChevronLeft :size="15" />
                </button>

                <template v-for="(item, index) in statsPaginationItems" :key="item === 'gap' ? `gap-${index}` : item">
                  <span v-if="item === 'gap'" class="w-6 text-center text-xs text-ink-400">…</span>
                  <button
                    v-else
                    type="button"
                    class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold font-num transition-colors"
                    :class="item === statsPage ? 'bg-brand-600 text-white shadow-2xs' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                    :aria-label="`Trang ${item}`"
                    :aria-current="item === statsPage ? 'page' : undefined"
                    @click="statsPage = item"
                  >
                    {{ item }}
                  </button>
                </template>

                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Trang sau"
                  :disabled="statsPage >= statsTotalPages"
                  @click="statsPage = Math.min(statsTotalPages, statsPage + 1)"
                >
                  <ChevronRight :size="15" />
                </button>
              </nav>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Modal for manager decisions -->
    <WarrantyDecisionModal
      :claim="modalClaim"
      :mode="modalMode"
      :technicians="technicians"
      @close="modalClaim = null; modalMode = null"
      @done="onDone"
    />
  </div>
</template>
