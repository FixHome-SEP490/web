<script setup lang="ts">
import { foldForSearch } from '../../utils/formatters';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Calendar,
  Mail,
  Phone,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  X,
} from 'lucide-vue-next';
import { FhConfirmDialog, FhSkeleton } from '../../components';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { CONSOLE_LOAD_ERROR, consoleTextarea } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import {
  adminVerificationsApi,
  type TechnicianVerification,
  type VerificationStatus,
} from '../../api/admin-verifications.api';
import { adminCustomerVerificationsApi } from '../../api/admin-customer-verifications.api';
import TechnicianVerificationDrawer from '../../components/console/TechnicianVerificationDrawer.vue';
import CustomerVerificationsTab from '../../components/console/CustomerVerificationsTab.vue';
import { useQueryChoice } from '../../composables/useQueryState';
import { useCanDecideReview } from '../../composables/useCanDecideReview';

const canDecide = useCanDecideReview();

// Admin reviews identity checks of technicians and customers before withdrawal:
// Two tabs: 'technicians' | 'customers' (?tab=customers)
type ReviewTab = 'technicians' | 'customers';
const activeTab = useQueryChoice<ReviewTab>('tab', ['technicians', 'customers'], 'technicians');

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chờ duyệt',
  VERIFIED: 'Đã xác nhận danh tính',
  REJECTED: 'Đã từ chối',
};

const statusLabel = (status: unknown) => STATUS_LABELS[String(status ?? '').toUpperCase()] ?? 'Trạng thái chưa xác định';
const isPending = (status: unknown) => String(status ?? '').toUpperCase() === 'PENDING';
const isVerified = (status: unknown) => String(status ?? '').toUpperCase() === 'VERIFIED';
const isRejected = (status: unknown) => String(status ?? '').toUpperCase() === 'REJECTED';

// Stats for Technicians and Customers
interface VerificationStats {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
}

const techStats = ref<VerificationStats>({ total: 0, pending: 0, verified: 0, rejected: 0 });
const custStats = ref<VerificationStats>({ total: 0, pending: 0, verified: 0, rejected: 0 });

const currentStats = computed<VerificationStats>(() => {
  return activeTab.value === 'technicians' ? techStats.value : custStats.value;
});

const statusFilter = ref<VerificationStatus | 'ALL'>('ALL');
const searchQuery = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const verifications = ref<TechnicianVerification[]>([]);
const loading = ref(true);
const error = ref('');
const loadError = ref('');
const successMessage = ref('');
let latestRequest = 0;

// Date range filter
type DateFilterType = 'ALL' | 'TODAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH';
const dateFilter = ref<DateFilterType>('ALL');
const isDatePickerOpen = ref(false);
const datePickerRef = ref<HTMLElement | null>(null);

const datePresets: { value: DateFilterType; label: string }[] = [
  { value: 'ALL', label: 'Tất cả thời gian' },
  { value: 'TODAY', label: 'Hôm nay' },
  { value: '7_DAYS', label: '7 ngày qua' },
  { value: '30_DAYS', label: '30 ngày qua' },
  { value: 'THIS_MONTH', label: 'Tháng này' },
];

const dateRangeLabel = computed(() => {
  const found = datePresets.find((p) => p.value === dateFilter.value);
  if (!found || found.value === 'ALL') return 'Chọn khoảng thời gian';
  return found.label;
});

function selectDatePreset(preset: DateFilterType) {
  dateFilter.value = preset;
  isDatePickerOpen.value = false;
}

function onDocClick(event: MouseEvent) {
  if (datePickerRef.value && !datePickerRef.value.contains(event.target as Node)) {
    isDatePickerOpen.value = false;
  }
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const visiblePages = computed(() => {
  const totalP = totalPages.value;
  const curr = page.value;
  if (totalP <= 7) {
    return Array.from({ length: totalP }, (_, i) => i + 1);
  }
  if (curr <= 4) {
    return [1, 2, 3, 4, 5, 'gap', totalP];
  }
  if (curr >= totalP - 3) {
    return [1, 'gap', totalP - 4, totalP - 3, totalP - 2, totalP - 1, totalP];
  }
  return [1, 'gap', curr - 1, curr, curr + 1, 'gap', totalP];
});

const paginationSummary = computed(() => {
  if (total.value === 0) return 'Hiển thị 0 trên 0';
  const start = (page.value - 1) * pageSize.value + 1;
  const end = Math.min(page.value * pageSize.value, total.value);
  return `Hiển thị ${start}–${end} trên ${total.value}`;
});

// Plain Vietnamese reasons from the server are kept; codes and English never show.
const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

const loadVerifications = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await adminVerificationsApi.getVerifications({
      page: page.value,
      limit: pageSize.value,
      status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
    });
    if (requestId !== latestRequest) return;
    verifications.value = response.data;
    total.value = response.meta.total;
    // Keep total count synced
    if (statusFilter.value === 'ALL') {
      techStats.value.total = response.meta.total;
    }
  } catch (reason) {
    if (requestId !== latestRequest) return;
    verifications.value = [];
    total.value = 0;
    loadError.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

const loadTechStats = async () => {
  try {
    const [allRes, pendingRes, verifiedRes, rejectedRes] = await Promise.all([
      adminVerificationsApi.getVerifications({ limit: 1 }),
      adminVerificationsApi.getVerifications({ status: 'PENDING', limit: 1 }),
      adminVerificationsApi.getVerifications({ status: 'VERIFIED', limit: 1 }),
      adminVerificationsApi.getVerifications({ status: 'REJECTED', limit: 1 }),
    ]);
    techStats.value = {
      total: allRes.meta.total,
      pending: pendingRes.meta.total,
      verified: verifiedRes.meta.total,
      rejected: rejectedRes.meta.total,
    };
  } catch {
    techStats.value = {
      total: total.value,
      pending: verifications.value.filter((v) => v.status === 'PENDING').length,
      verified: verifications.value.filter((v) => v.status === 'VERIFIED').length,
      rejected: verifications.value.filter((v) => v.status === 'REJECTED').length,
    };
  }
};

const loadCustStats = async () => {
  try {
    const [allRes, pendingRes, verifiedRes, rejectedRes] = await Promise.all([
      adminCustomerVerificationsApi.list({ page: 1, limit: 1 }),
      adminCustomerVerificationsApi.list({ status: 'pending', page: 1, limit: 1 }),
      adminCustomerVerificationsApi.list({ status: 'verified', page: 1, limit: 1 }),
      adminCustomerVerificationsApi.list({ status: 'rejected', page: 1, limit: 1 }),
    ]);
    custStats.value = {
      total: allRes.total,
      pending: pendingRes.total,
      verified: verifiedRes.total,
      rejected: rejectedRes.total,
    };
  } catch {
    // Keep defaults
  }
};

onMounted(() => {
  window.addEventListener('click', onDocClick);
  if (activeTab.value === 'technicians') {
    void loadVerifications();
    void loadTechStats();
  } else {
    void loadCustStats();
  }
});

onUnmounted(() => {
  window.removeEventListener('click', onDocClick);
});

// Switch tabs
watch(activeTab, (tab) => {
  if (tab === 'technicians') {
    void loadVerifications();
    void loadTechStats();
  } else {
    void loadCustStats();
  }
});

watch(statusFilter, () => {
  successMessage.value = '';
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadVerifications();
  }
});

watch(pageSize, () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadVerifications();
  }
});

watch(page, (nextPage, previousPage) => {
  if (nextPage !== previousPage) void loadVerifications();
});

function matchesDateFilter(dateStr?: string | null): boolean {
  if (!dateStr || dateFilter.value === 'ALL') return true;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dateFilter.value === 'TODAY') {
    return d >= startOfToday;
  }
  if (dateFilter.value === '7_DAYS') {
    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= sevenDaysAgo;
  }
  if (dateFilter.value === '30_DAYS') {
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    return d >= thirtyDaysAgo;
  }
  if (dateFilter.value === 'THIS_MONTH') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= startOfMonth;
  }
  return true;
}

const filteredVerifications = computed(() => {
  let list = verifications.value;
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter((verification) => {
      const technician = verification.technician;
      return [
        verification.id,
        verification.technicianId,
        technician?.fullName,
        technician?.email,
        technician?.phoneNumber,
        ...verification.documents.map((document) => document.fileName),
      ]
        .filter(Boolean)
        .some((value) => foldForSearch(value).includes(foldForSearch(query)));
    });
  }
  if (dateFilter.value !== 'ALL') {
    list = list.filter((v) => matchesDateFilter(v.submittedAt));
  }
  return list;
});

const showRejectModal = ref(false);
const verificationToReject = ref<TechnicianVerification | null>(null);
const rejectReason = ref('');
const rejectReasonError = ref('');
const actionLoadingId = ref<string | null>(null);

const showDrawer = ref(false);
const selectedVerification = ref<TechnicianVerification | null>(null);

const openDrawer = async (verification: TechnicianVerification) => {
  selectedVerification.value = verification;
  showDrawer.value = true;

  try {
    const fullVerification = await adminVerificationsApi.getVerification(verification.id);
    if (showDrawer.value && selectedVerification.value?.id === fullVerification.id) {
      selectedVerification.value = fullVerification;
    }
  } catch {
    // Keep summary
  }
};

const approveVerification = async (verification: TechnicianVerification) => {
  if (actionLoadingId.value) return;
  actionLoadingId.value = verification.id;
  error.value = '';
  successMessage.value = '';
  try {
    await adminVerificationsApi.approveVerification(verification.id);
    successMessage.value = `Đã xác nhận danh tính của ${verification.technician?.fullName ?? 'kỹ thuật viên'}. Thợ sẽ nhận thông báo đặt lịch lên trụ sở; hồ sơ được duyệt ở mục "Duyệt hồ sơ" sau buổi gặp.`;
    showDrawer.value = false; // The drawer still holds the PENDING record; close it like the reject does.
    await Promise.all([loadVerifications(), loadTechStats()]);
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa xác nhận được danh tính, vui lòng thử lại.');
  } finally {
    actionLoadingId.value = null;
  }
};

const openReject = (verification: TechnicianVerification) => {
  verificationToReject.value = verification;
  rejectReason.value = '';
  rejectReasonError.value = '';
  showRejectModal.value = true;
};

const confirmReject = async () => {
  if (!verificationToReject.value || actionLoadingId.value) return;
  if (rejectReason.value.trim().length < 5) {
    rejectReasonError.value = 'Vui lòng nhập lý do từ chối (ít nhất 5 ký tự).';
    return;
  }

  actionLoadingId.value = verificationToReject.value.id;
  error.value = '';
  successMessage.value = '';
  try {
    await adminVerificationsApi.rejectVerification(
      verificationToReject.value.id,
      rejectReason.value.trim(),
    );
    successMessage.value = `Đã từ chối hồ sơ của ${verificationToReject.value.technician?.fullName ?? 'kỹ thuật viên'}.`;
    showRejectModal.value = false;
    verificationToReject.value = null;
    showDrawer.value = false;
    await Promise.all([loadVerifications(), loadTechStats()]);
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa từ chối được hồ sơ, vui lòng thử lại.');
  } finally {
    actionLoadingId.value = null;
  }
};

const previewUrl = ref('');
const showPreviewModal = ref(false);
const previewTitle = ref('');
const previewLoading = ref(false);

const openDocumentAccess = async (title: string, documentId: string) => {
  if (!selectedVerification.value) return;
  previewTitle.value = title;
  previewUrl.value = '';
  showPreviewModal.value = true;
  previewLoading.value = true;

  try {
    const url = await adminVerificationsApi.getDocumentAccess(selectedVerification.value.id, documentId);
    previewUrl.value = url;
  } catch (reason) {
    showPreviewModal.value = false;
    error.value = getErrorMessage(reason, 'Chưa mở được tài liệu, vui lòng thử lại.');
  } finally {
    previewLoading.value = false;
  }
};

const hasFilters = computed(() => Boolean(searchQuery.value.trim()) || statusFilter.value !== 'ALL' || dateFilter.value !== 'ALL');
const resetFilters = () => {
  searchQuery.value = '';
  statusFilter.value = 'ALL';
  dateFilter.value = 'ALL';
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getInitials(name?: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0].toUpperCase() === 'QA') return 'QA';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
</script>

<template>
  <div class="space-y-4 sm:space-y-5">
    <!-- Header: Title + count badge -->
    <div class="animate-slide-up flex flex-wrap items-baseline gap-2.5">
      <h1 class="text-2xl font-bold tracking-tight text-ink-900">Duyệt xác minh danh tính</h1>
      <span v-if="currentStats.total > 0 || total > 0" class="font-num text-sm text-ink-400">
        {{ currentStats.total || total }}
      </span>
    </div>

    <!-- Navigation Tabs -->
    <div class="animate-slide-up-delay-1 flex items-center gap-6 border-b border-ink-200/80" role="tablist" aria-label="Phân loại hồ sơ xác minh">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'technicians'"
        class="pb-2.5 text-sm font-semibold transition-colors cursor-pointer"
        :class="activeTab === 'technicians' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-ink-500 hover:text-ink-800 border-b-2 border-transparent'"
        @click="activeTab = 'technicians'"
      >
        Kỹ thuật viên
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'customers'"
        class="pb-2.5 text-sm font-semibold transition-colors cursor-pointer"
        :class="activeTab === 'customers' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-ink-500 hover:text-ink-800 border-b-2 border-transparent'"
        @click="activeTab = 'customers'"
      >
        Khách hàng
      </button>
    </div>

    <!-- Horizontal Statistics Bar -->
    <div class="animate-slide-up-delay-1 inline-flex flex-wrap items-center gap-4 sm:gap-6 rounded-2xl border border-ink-100 bg-white px-5 py-3 shadow-xs">
      <!-- Tổng -->
      <div class="flex items-center gap-2">
        <Users :size="16" class="text-brand-600 shrink-0" aria-hidden="true" />
        <span class="text-xs sm:text-sm text-ink-600">Tổng:</span>
        <span class="font-bold text-ink-900 font-num text-xs sm:text-sm">{{ currentStats.total }}</span>
      </div>

      <div class="h-4 w-px bg-ink-200 hidden sm:block" aria-hidden="true"></div>

      <!-- Chờ duyệt -->
      <div class="flex items-center gap-2">
        <Clock :size="16" class="text-warning-500 shrink-0" aria-hidden="true" />
        <span class="text-xs sm:text-sm text-ink-600">Chờ duyệt:</span>
        <span class="font-bold text-ink-900 font-num text-xs sm:text-sm">{{ currentStats.pending }}</span>
      </div>

      <div class="h-4 w-px bg-ink-200 hidden sm:block" aria-hidden="true"></div>

      <!-- Đã xác nhận -->
      <div class="flex items-center gap-2">
        <CheckCircle2 :size="16" class="text-success-600 shrink-0" aria-hidden="true" />
        <span class="text-xs sm:text-sm text-ink-600">Đã xác nhận:</span>
        <span class="font-bold text-ink-900 font-num text-xs sm:text-sm">{{ currentStats.verified }}</span>
      </div>

      <div class="h-4 w-px bg-ink-200 hidden sm:block" aria-hidden="true"></div>

      <!-- Đã từ chối -->
      <div class="flex items-center gap-2">
        <XCircle :size="16" class="text-danger-600 shrink-0" aria-hidden="true" />
        <span class="text-xs sm:text-sm text-ink-600">Đã từ chối:</span>
        <span class="font-bold text-ink-900 font-num text-xs sm:text-sm">{{ currentStats.rejected }}</span>
      </div>
    </div>

    <!-- Customer tab content -->
    <CustomerVerificationsTab
      v-if="activeTab === 'customers'"
      class="animate-slide-up-delay-2"
      @updated="loadCustStats"
    />

    <!-- Technician tab content -->
    <template v-else>
      <!-- Filter Bar -->
      <div class="animate-slide-up-delay-1 flex flex-wrap items-center gap-3">
        <!-- 1. Search input -->
        <div class="relative flex-1 min-w-[240px] max-w-md">
          <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Tìm tên, email, số điện thoại"
            class="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 text-sm text-ink-800 placeholder:text-ink-400 shadow-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label="Tìm hồ sơ"
          />
        </div>

        <!-- 2. Status dropdown -->
        <div class="relative min-w-[170px]">
          <select
            v-model="statusFilter"
            class="h-10 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-4 pr-9 text-sm text-ink-700 shadow-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
            aria-label="Trạng thái hồ sơ"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Đang chờ duyệt</option>
            <option value="VERIFIED">Đã xác nhận danh tính</option>
            <option value="REJECTED">Đã từ chối</option>
          </select>
          <ChevronDown :size="14" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        </div>

        <!-- 3. Date range picker -->
        <div ref="datePickerRef" class="relative">
          <button
            type="button"
            class="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-700 shadow-xs transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
            :class="{ 'border-brand-500 text-brand-700 bg-brand-50/20': dateFilter !== 'ALL' }"
            aria-label="Chọn khoảng thời gian"
            @click.stop="isDatePickerOpen = !isDatePickerOpen"
          >
            <Calendar :size="15" class="text-ink-400 shrink-0" aria-hidden="true" />
            <span class="max-w-[160px] truncate">{{ dateRangeLabel }}</span>
            <ChevronDown
              :size="14"
              class="text-ink-400 transition-transform duration-200 shrink-0"
              :class="{ 'rotate-180': isDatePickerOpen }"
              aria-hidden="true"
            />
          </button>

          <!-- Date picker popover -->
          <div
            v-if="isDatePickerOpen"
            class="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-ink-200 bg-white p-2 shadow-lg"
            @click.stop
          >
            <div class="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-400">Khoảng thời gian</div>
            <div class="space-y-1">
              <button
                v-for="preset in datePresets"
                :key="preset.value"
                type="button"
                class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
                :class="dateFilter === preset.value ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-700 hover:bg-ink-50'"
                @click="selectDatePreset(preset.value)"
              >
                <span>{{ preset.label }}</span>
                <Check v-if="dateFilter === preset.value" :size="14" class="text-brand-600" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <!-- Reset filters -->
        <button
          v-if="hasFilters"
          type="button"
          class="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
          @click="resetFilters"
        >
          <RotateCcw :size="14" aria-hidden="true" />
          <span>Đặt lại</span>
        </button>
      </div>

      <!-- Alert notifications -->
      <Transition name="fh-fade-slide">
        <p v-if="error" class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
      </Transition>
      <Transition name="fh-fade-slide">
        <p v-if="successMessage" class="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>
      </Transition>

      <!-- Table Section -->
      <div class="animate-slide-up-delay-2 space-y-4">
        <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadVerifications" />

        <div v-else class="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-xs">
          <div class="overflow-x-auto overscroll-x-contain">
            <table class="w-full text-left text-sm border-collapse">
              <thead>
                <tr class="border-b border-ink-200/80 bg-ink-50/70">
                  <th scope="col" class="whitespace-nowrap py-3.5 pl-6 pr-4 text-xs font-semibold text-ink-600">
                    <div class="flex items-center gap-1.5">
                      <Users :size="15" class="text-ink-400" aria-hidden="true" />
                      <span>Kỹ thuật viên</span>
                    </div>
                  </th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                    <div class="flex items-center gap-1.5">
                      <Mail :size="15" class="text-ink-400" aria-hidden="true" />
                      <span>Email</span>
                    </div>
                  </th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                    <div class="flex items-center gap-1.5">
                      <Phone :size="15" class="text-ink-400" aria-hidden="true" />
                      <span>SĐT</span>
                    </div>
                  </th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                    <div class="flex items-center gap-1.5">
                      <Calendar :size="15" class="text-ink-400" aria-hidden="true" />
                      <span>Ngày gửi</span>
                    </div>
                  </th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-600">
                    <div class="flex items-center gap-1.5">
                      <Layers :size="15" class="text-ink-400" aria-hidden="true" />
                      <span>Trạng thái</span>
                    </div>
                  </th>
                  <th scope="col" class="whitespace-nowrap py-3.5 pl-4 pr-6 text-right text-xs font-semibold text-ink-600">
                    <span>Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <!-- Skeleton rows while loading -->
                <template v-if="loading">
                  <tr v-for="i in 5" :key="`skel-${i}`" class="animate-pulse">
                    <td class="py-3.5 pl-6 pr-4">
                      <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-full bg-ink-200 shrink-0"></div>
                        <div class="h-4 w-32 rounded bg-ink-200"></div>
                      </div>
                    </td>
                    <td class="px-4 py-3.5"><div class="h-4 w-40 rounded bg-ink-200"></div></td>
                    <td class="px-4 py-3.5"><div class="h-4 w-24 rounded bg-ink-200"></div></td>
                    <td class="px-4 py-3.5"><div class="h-4 w-20 rounded bg-ink-200"></div></td>
                    <td class="px-4 py-3.5"><div class="h-6 w-32 rounded-full bg-ink-200"></div></td>
                    <td class="py-3.5 pl-4 pr-6 text-right"><div class="ml-auto h-7 w-20 rounded bg-ink-200"></div></td>
                  </tr>
                </template>

                <!-- Empty state -->
                <tr v-else-if="filteredVerifications.length === 0">
                  <td colspan="6" class="py-12 text-center text-sm text-ink-500">
                    <div class="flex flex-col items-center justify-center gap-2">
                      <Users :size="32" class="text-ink-300" aria-hidden="true" />
                      <p class="font-medium text-ink-600">Không có hồ sơ phù hợp.</p>
                      <p class="text-xs text-ink-400">Hãy thử thay đổi điều kiện tìm kiếm hoặc bộ lọc.</p>
                    </div>
                  </td>
                </tr>

                <!-- Data rows -->
                <tr
                  v-for="(row, index) in filteredVerifications"
                  v-else
                  :key="row.id || index"
                  class="cursor-pointer transition-colors duration-150"
                  :class="isPending(row.status) ? 'bg-amber-50/60 hover:bg-amber-100/50' : 'bg-white hover:bg-slate-50/80'"
                  @click="openDrawer(row)"
                >
                  <!-- 1. Kỹ thuật viên (Avatar + Name) -->
                  <td class="py-3.5 pl-6 pr-4">
                    <div class="flex items-center gap-3">
                      <img
                        v-if="row.technician?.avatarUrl"
                        :src="row.technician.avatarUrl"
                        :alt="row.technician.fullName"
                        class="h-8 w-8 rounded-full object-cover shrink-0 border border-ink-100"
                      />
                      <div
                        v-else
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-brand-700 select-none font-num"
                      >
                        {{ getInitials(row.technician?.fullName) }}
                      </div>

                      <button
                        type="button"
                        class="cursor-pointer text-left font-semibold text-brand-700 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 truncate block text-sm"
                        @click.stop="openDrawer(row)"
                      >
                        {{ row.technician?.fullName || 'Kỹ thuật viên' }}
                      </button>
                    </div>
                  </td>

                  <!-- 2. Email -->
                  <td class="px-4 py-3.5 text-xs text-ink-600">
                    <div class="flex items-center gap-1.5">
                      <Mail :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
                      <span class="truncate max-w-[220px]" :title="row.technician?.email || ''">
                        {{ row.technician?.email || 'Chưa có email' }}
                      </span>
                    </div>
                  </td>

                  <!-- 3. SĐT -->
                  <td class="px-4 py-3.5 text-xs">
                    <div v-if="row.technician?.phoneNumber" class="flex items-center gap-1.5 text-ink-700 font-num">
                      <Phone :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
                      <span class="whitespace-nowrap">{{ row.technician.phoneNumber }}</span>
                    </div>
                    <span v-else class="text-ink-400 font-num">—</span>
                  </td>

                  <!-- 4. Ngày gửi -->
                  <td class="px-4 py-3.5 text-xs text-ink-600 font-num">
                    <div class="flex items-center gap-1.5 whitespace-nowrap">
                      <Calendar :size="14" class="text-ink-400 shrink-0" aria-hidden="true" />
                      <span>{{ formatDate(row.submittedAt) }}</span>
                    </div>
                  </td>

                  <!-- 5. Trạng thái -->
                  <td class="px-4 py-3.5 whitespace-nowrap">
                    <span
                      v-if="isVerified(row.status)"
                      class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                    >
                      <CheckCircle2 :size="13" class="text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>{{ statusLabel(row.status) }}</span>
                    </span>

                    <span
                      v-else-if="isRejected(row.status)"
                      class="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"
                    >
                      <XCircle :size="13" class="text-rose-600 shrink-0" aria-hidden="true" />
                      <span>{{ statusLabel(row.status) }}</span>
                    </span>

                    <span
                      v-else
                      class="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                    >
                      <Clock :size="13" class="text-amber-600 shrink-0" aria-hidden="true" />
                      <span>{{ statusLabel(row.status) }}</span>
                    </span>
                  </td>

                  <!-- 6. Thao tác -->
                  <td class="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-2" @click.stop>
                      <template v-if="canDecide && isPending(row.status)">
                        <button
                          type="button"
                          class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 cursor-pointer"
                          :disabled="Boolean(actionLoadingId)"
                          @click="approveVerification(row)"
                        >
                          Xác nhận
                        </button>
                        <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
                          <ConsoleMenuItem danger :disabled="Boolean(actionLoadingId)" @click="openReject(row)">Từ chối</ConsoleMenuItem>
                          <ConsoleMenuItem @click="openDrawer(row)">Xem chi tiết</ConsoleMenuItem>
                        </ConsoleMoreMenu>
                      </template>
                      <template v-else>
                        <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
                          <ConsoleMenuItem @click="openDrawer(row)">Xem chi tiết</ConsoleMenuItem>
                        </ConsoleMoreMenu>
                      </template>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Modern Pagination Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs sm:text-sm text-ink-600">
          <span class="font-num text-ink-500">{{ paginationSummary }}</span>

          <div class="flex items-center gap-1 sm:gap-2">
            <!-- Prev page -->
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              :disabled="page <= 1 || loading"
              aria-label="Trang trước"
              @click="page > 1 && (page--)"
            >
              <ChevronLeft :size="16" aria-hidden="true" />
            </button>

            <!-- Numbered pages -->
            <template v-for="(p, idx) in visiblePages" :key="p === 'gap' ? `gap-${idx}` : p">
              <span v-if="p === 'gap'" class="px-1 text-ink-400">…</span>
              <button
                v-else
                type="button"
                class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-num text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                :class="p === page ? 'bg-blue-600 text-white font-semibold shadow-xs' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'"
                :disabled="loading"
                @click="page = Number(p)"
              >
                {{ p }}
              </button>
            </template>

            <!-- Next page -->
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              :disabled="page >= totalPages || loading"
              aria-label="Trang sau"
              @click="page < totalPages && (page++)"
            >
              <ChevronRight :size="16" aria-hidden="true" />
            </button>

            <!-- Page size selector -->
            <div class="relative ml-2">
              <select
                v-model="pageSize"
                class="h-8 appearance-none rounded-lg border border-ink-200 bg-white pl-2.5 pr-7 text-xs font-medium text-ink-700 shadow-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                aria-label="Số bản ghi mỗi trang"
              >
                <option :value="10">10 / trang</option>
                <option :value="20">20 / trang</option>
                <option :value="50">50 / trang</option>
              </select>
              <ChevronDown :size="13" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Reject modal -->
    <FhConfirmDialog
      :open="showRejectModal"
      :loading="actionLoadingId === verificationToReject?.id"
      title="Từ chối hồ sơ"
      consequence="Lý do được gửi cho kỹ thuật viên để bổ sung hồ sơ."
      confirm-text="Từ chối hồ sơ"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="showRejectModal = false"
    >
      <label class="mt-4 block text-sm font-medium text-ink-700" for="reject-reason">Lý do từ chối</label>
      <textarea
        id="reject-reason"
        v-model="rejectReason"
        rows="3"
        class="mt-1.5 resize-none"
        :class="consoleTextarea"
        placeholder="Tài liệu hoặc thông tin cần bổ sung"
      ></textarea>
      <Transition name="fh-fade-slide">
        <p v-if="rejectReasonError" class="mt-1.5 text-sm text-danger-600" role="alert">{{ rejectReasonError }}</p>
      </Transition>
    </FhConfirmDialog>

    <!-- Document preview modal -->
    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="showPreviewModal"
          class="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/60 p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-preview-title"
          @click.self="showPreviewModal = false"
          @keydown.esc="showPreviewModal = false"
        >
          <div class="fh-modal-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-white shadow-(--shadow-e3)">
            <div class="flex items-center justify-between gap-3 border-b border-ink-200 bg-ink-25/60 px-6 py-4">
              <h3 id="doc-preview-title" class="truncate text-base font-semibold text-ink-900">{{ previewTitle }}</h3>
              <button
                type="button"
                class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                aria-label="Đóng"
                @click="showPreviewModal = false"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </div>
            <div class="relative flex min-h-[360px] flex-1 items-center justify-center overflow-auto overscroll-contain bg-ink-100 p-4 sm:p-6">
              <FhSkeleton v-if="previewLoading" width="320px" height="420px" rounded="md" />
              <template v-else-if="previewUrl">
                <video
                  v-if="previewTitle.toLowerCase().includes('video')"
                  :src="previewUrl"
                  controls
                  autoplay
                  class="max-h-[min(72dvh,680px)] max-w-full rounded-[var(--radius-md)] bg-black shadow-(--shadow-e2)"
                ></video>
                <img
                  v-else-if="previewTitle.toLowerCase().includes('ảnh') || previewTitle.toLowerCase().includes('cccd')"
                  :src="previewUrl"
                  class="max-h-[min(72dvh,680px)] max-w-full rounded-[var(--radius-md)] border border-ink-200 bg-white object-contain shadow-(--shadow-e2)"
                  :alt="previewTitle"
                />
                <iframe
                  v-else
                  :src="previewUrl"
                  :title="previewTitle"
                  class="h-[min(72dvh,680px)] w-full rounded-[var(--radius-md)] border border-ink-200 bg-white shadow-(--shadow-e2)"
                ></iframe>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Detail Drawer -->
    <TechnicianVerificationDrawer
      v-model:open="showDrawer"
      :verification="selectedVerification"
      :loadingApprove="actionLoadingId === selectedVerification?.id"
      @approve="approveVerification"
      @reject="openReject"
      @preview="openDocumentAccess"
    />
  </div>
</template>
