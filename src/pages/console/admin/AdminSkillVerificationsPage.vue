<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  RotateCw,
  Search,
  UploadCloud,
  User,
  Wrench,
  X,
  AlertCircle,
} from 'lucide-vue-next';
import { FhButton, FhConfirmDialog, FhSkeleton } from '../../../components';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import { CONSOLE_LOAD_ERROR, consoleTextarea } from '../../../components/console/console-ui';
import { userFacingError } from '../../../utils/user-facing-error';
import {
  adminSkillVerificationsApi,
  type SkillVerification,
  type SkillVerificationStatus,
} from '../../../api/admin-skill-verifications.api';
import SkillVerificationDrawer from '../../../components/console/SkillVerificationDrawer.vue';
import { vnDateString } from '../../../utils/vn-time';
import { useCanDecideReview } from '../../../composables/useCanDecideReview';

const canDecide = useCanDecideReview();

// ---- State ----
const statusFilter = ref<SkillVerificationStatus | 'ALL'>('ALL');
const searchQuery = ref('');
const dateFilter = ref('');

const page = ref(1);
const pageSize = 10;
const total = ref(0);
const verifications = ref<SkillVerification[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');
const error = ref('');
const successMessage = ref('');
const actionLoadingId = ref<string | null>(null);
let latestRequest = 0;

// Stats accurate across entire system (not just current page slice)
const stats = ref({
  total: 0,
  pending: 0,
  verified: 0,
  rejected: 0,
});
const loadingStats = ref(true);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : vnDateString(date);
};

// ---- Load Stats from API ----
const loadStats = async () => {
  try {
    loadingStats.value = true;
    const [allRes, pendingRes, verifiedRes, rejectedRes] = await Promise.all([
      adminSkillVerificationsApi.list({ limit: 1 }),
      adminSkillVerificationsApi.list({ limit: 1, status: 'PENDING' }),
      adminSkillVerificationsApi.list({ limit: 1, status: 'VERIFIED' }),
      adminSkillVerificationsApi.list({ limit: 1, status: 'REJECTED' }),
    ]);
    stats.value = {
      total: allRes.meta.total,
      pending: pendingRes.meta.total,
      verified: verifiedRes.meta.total,
      rejected: rejectedRes.meta.total,
    };
  } catch {
    // Keep last known stats if endpoint fails
  } finally {
    loadingStats.value = false;
  }
};

// ---- Load Verifications List ----
const loadVerifications = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await adminSkillVerificationsApi.list({
      page: page.value,
      limit: pageSize,
      status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
    });
    if (requestId !== latestRequest) return;
    verifications.value = res.data;
    total.value = res.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    verifications.value = [];
    total.value = 0;
    loadError.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

const loadAll = async () => {
  await Promise.all([loadVerifications(), loadStats()]);
};

const refreshData = async () => {
  refreshing.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    await loadAll();
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => void loadAll());

// Trigger reload on status filter change
watch(statusFilter, () => {
  successMessage.value = '';
  if (page.value === 1) {
    void loadVerifications();
  } else {
    page.value = 1;
  }
});

watch(page, () => void loadVerifications());

// Client-side filtering for search & date across currently loaded page
const filteredVerifications = computed(() => {
  let list = verifications.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter((v) => {
      const name = (v.technician?.fullName || '').toLowerCase();
      const email = (v.technician?.email || '').toLowerCase();
      const service = (v.serviceName || '').toLowerCase();
      return name.includes(q) || email.includes(q) || service.includes(q);
    });
  }

  if (dateFilter.value) {
    list = list.filter((v) => {
      if (!v.submittedAt) return false;
      const d = new Date(v.submittedAt);
      if (Number.isNaN(d.getTime())) return false;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      return isoDate === dateFilter.value;
    });
  }

  return list;
});

// Auto-clear success message after 5 seconds
watch(successMessage, (msg) => {
  if (msg) {
    setTimeout(() => {
      if (successMessage.value === msg) successMessage.value = '';
    }, 5000);
  }
});

// ---- Drawer State (Hồ sơ kỹ thuật viên) ----
const showDrawer = ref(false);
const selectedVerification = ref<SkillVerification | null>(null);

const openDrawer = async (verification: SkillVerification) => {
  selectedVerification.value = verification;
  showDrawer.value = true;

  try {
    const fullVerification = await adminSkillVerificationsApi.get(verification.id);
    if (showDrawer.value && selectedVerification.value?.id === fullVerification.id) {
      selectedVerification.value = fullVerification;
    }
  } catch {
    // Drawer maintains row summary if full details cannot be loaded
  }
};

// ---- Document Preview Modal ----
const previewUrl = ref('');
const showPreviewModal = ref(false);
const previewTitle = ref('');
const previewDocumentId = ref('');
const previewLoading = ref(false);

const openDocument = async (
  verification: SkillVerification,
  documentId: string,
  title?: string,
) => {
  selectedVerification.value = verification;
  previewDocumentId.value = documentId;
  previewTitle.value = title || verification.serviceName || 'Chứng chỉ';
  previewUrl.value = '';
  showPreviewModal.value = true;
  previewLoading.value = true;

  try {
    const { signedUrl } = await adminSkillVerificationsApi.getDocumentAccess(
      verification.id,
      documentId,
    );
    previewUrl.value = signedUrl;
  } catch (reason) {
    showPreviewModal.value = false;
    error.value = getErrorMessage(reason, 'Chưa mở được tài liệu, vui lòng thử lại.');
  } finally {
    previewLoading.value = false;
  }
};

const openDocumentAccess = (title: string, documentId: string) => {
  if (!selectedVerification.value) return;
  void openDocument(selectedVerification.value, documentId, title);
};

// ---- Approve Modal (FixHome-issued certificate upload) ----
const showApproveModal = ref(false);
const verificationToApprove = ref<SkillVerification | null>(null);
const certificateFile = ref<File | null>(null);
const approveError = ref('');

const openApprove = (verification: SkillVerification) => {
  verificationToApprove.value = verification;
  certificateFile.value = null;
  approveError.value = '';
  showApproveModal.value = true;
};

const onCertificateFileChange = (event: Event) => {
  certificateFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
};

const confirmApprove = async () => {
  const verification = verificationToApprove.value;
  const file = certificateFile.value;
  if (!verification || actionLoadingId.value) return;
  if (!file) {
    approveError.value = 'Chọn tệp chứng chỉ FixHome cấp cho thợ.';
    return;
  }

  actionLoadingId.value = verification.id;
  error.value = '';
  successMessage.value = '';
  try {
    const { storageObjectPath, uploadUrl } = await adminSkillVerificationsApi.requestCertificateUploadUrl(
      verification.id,
      file.type,
    );
    await adminSkillVerificationsApi.uploadCertificateFile(uploadUrl, file.type, file);
    await adminSkillVerificationsApi.approve(verification.id, {
      storageObjectPath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
    successMessage.value = `Đã duyệt kỹ năng "${verification.serviceName}" cho ${verification.technician?.fullName ?? 'thợ'}.`;
    showApproveModal.value = false;
    showDrawer.value = false;
    await loadAll();
  } catch (reason) {
    approveError.value = getErrorMessage(reason, 'Chưa duyệt được kỹ năng, vui lòng thử lại.');
  } finally {
    actionLoadingId.value = null;
  }
};

// ---- Reject Dialog ----
const showRejectModal = ref(false);
const verificationToReject = ref<SkillVerification | null>(null);
const rejectReason = ref('');
const rejectReasonError = ref('');

const openReject = (verification: SkillVerification) => {
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
    await adminSkillVerificationsApi.reject(verificationToReject.value.id, rejectReason.value.trim());
    successMessage.value = `Đã từ chối kỹ năng "${verificationToReject.value.serviceName}".`;
    showRejectModal.value = false;
    showDrawer.value = false;
    await loadAll();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa từ chối được yêu cầu, vui lòng thử lại.');
  } finally {
    actionLoadingId.value = null;
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Header section matching Image 2 -->
    <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3.5">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shadow-xs">
          <Award :size="24" :stroke-width="2" />
        </div>
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              Duyệt kỹ năng
            </h1>
            <span
              v-if="!loading && !loadError"
              class="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 font-num text-xs font-semibold text-ink-700"
            >
              {{ stats.total }}
            </span>
          </div>
          <p class="mt-1 text-xs text-ink-500 sm:text-sm">
            Xem và phê duyệt các yêu cầu bổ sung hoặc cập nhật kỹ năng của kỹ thuật viên.
          </p>
        </div>
      </div>
    </header>

    <!-- 4 Stats Cards matching Image 2 -->
    <section class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <!-- 1. Tổng yêu cầu -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border border-ink-200/80 bg-white p-4.5 text-left shadow-xs transition-all hover:border-brand-200 hover:shadow-sm cursor-pointer"
        :class="statusFilter === 'ALL' && !dateFilter && !searchQuery ? 'ring-2 ring-brand-500/20' : ''"
        @click="statusFilter = 'ALL'; dateFilter = ''; searchQuery = '';"
      >
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <FileText :size="22" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Tổng yêu cầu</div>
          <div class="text-2xl font-bold font-num text-ink-900 tracking-tight">
            <span v-if="loadingStats" class="inline-block h-7 w-8 animate-pulse rounded bg-ink-100"></span>
            <span v-else>{{ stats.total }}</span>
          </div>
        </div>
      </button>

      <!-- 2. Đang chờ duyệt -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border border-ink-200/80 bg-white p-4.5 text-left shadow-xs transition-all hover:border-amber-200 hover:shadow-sm cursor-pointer"
        :class="statusFilter === 'PENDING' ? 'ring-2 ring-amber-500/20' : ''"
        @click="statusFilter = statusFilter === 'PENDING' ? 'ALL' : 'PENDING'"
      >
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Clock :size="22" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Đang chờ duyệt</div>
          <div class="text-2xl font-bold font-num text-ink-900 tracking-tight">
            <span v-if="loadingStats" class="inline-block h-7 w-8 animate-pulse rounded bg-ink-100"></span>
            <span v-else>{{ stats.pending }}</span>
          </div>
        </div>
      </button>

      <!-- 3. Đã duyệt -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border border-ink-200/80 bg-white p-4.5 text-left shadow-xs transition-all hover:border-emerald-200 hover:shadow-sm cursor-pointer"
        :class="statusFilter === 'VERIFIED' ? 'ring-2 ring-emerald-500/20' : ''"
        @click="statusFilter = statusFilter === 'VERIFIED' ? 'ALL' : 'VERIFIED'"
      >
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Check :size="22" :stroke-width="2.5" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Đã duyệt</div>
          <div class="text-2xl font-bold font-num text-ink-900 tracking-tight">
            <span v-if="loadingStats" class="inline-block h-7 w-8 animate-pulse rounded bg-ink-100"></span>
            <span v-else>{{ stats.verified }}</span>
          </div>
        </div>
      </button>

      <!-- 4. Từ chối -->
      <button
        type="button"
        class="flex items-center gap-3.5 rounded-2xl border border-ink-200/80 bg-white p-4.5 text-left shadow-xs transition-all hover:border-ink-300 hover:shadow-sm cursor-pointer"
        :class="statusFilter === 'REJECTED' ? 'ring-2 ring-ink-400/20' : ''"
        @click="statusFilter = statusFilter === 'REJECTED' ? 'ALL' : 'REJECTED'"
      >
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
          <X :size="22" :stroke-width="2.5" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-ink-500">Từ chối</div>
          <div class="text-2xl font-bold font-num text-ink-900 tracking-tight">
            <span v-if="loadingStats" class="inline-block h-7 w-8 animate-pulse rounded bg-ink-100"></span>
            <span v-else>{{ stats.rejected }}</span>
          </div>
        </div>
      </button>
    </section>

    <!-- Notification banners -->
    <Transition name="fh-fade-slide">
      <div
        v-if="error"
        class="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-xs text-rose-800"
        role="alert"
      >
        <div class="flex items-center gap-2">
          <AlertCircle :size="16" class="shrink-0 text-rose-600" />
          <span class="font-medium">{{ error }}</span>
        </div>
        <button type="button" class="text-rose-500 hover:text-rose-700 cursor-pointer" @click="error = ''">
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
        <button type="button" class="text-emerald-500 hover:text-emerald-700 cursor-pointer" @click="successMessage = ''">
          <X :size="14" />
        </button>
      </div>
    </Transition>

    <!-- Search & Filter bar matching Image 2 -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <!-- Search input -->
      <div class="relative flex-1">
        <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm theo tên kỹ thuật viên, email..."
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
          <option value="ALL">Trạng thái: Tất cả</option>
          <option value="PENDING">Đang chờ duyệt</option>
          <option value="VERIFIED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
      </div>

      <!-- Date filter -->
      <div class="relative w-full sm:w-48">
        <Calendar :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          v-model="dateFilter"
          type="date"
          aria-label="Ngày gửi"
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
    <div>
      <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadAll" />

      <div v-else class="overflow-hidden rounded-2xl border border-ink-200/90 bg-white shadow-xs">
        <table class="w-full table-fixed text-left text-sm">
          <colgroup>
            <col class="w-[27%]" />
            <col class="w-[22%]" />
            <col class="w-[12%]" />
            <col class="w-[14%]" />
            <col class="w-[12%]" />
            <col class="w-[13%]" />
          </colgroup>
          <thead>
            <tr class="border-b border-ink-200/70 bg-ink-25/70">
              <th scope="col" class="pl-4 pr-2 sm:pl-5 sm:pr-3 py-3.5 text-xs font-semibold text-ink-600">Kỹ thuật viên</th>
              <th scope="col" class="px-2 sm:px-3 py-3.5 text-xs font-semibold text-ink-600">Kỹ năng đề xuất</th>
              <th scope="col" class="px-2 sm:px-3 py-3.5 text-xs font-semibold text-ink-600">Ngày gửi</th>
              <th scope="col" class="px-2 sm:px-3 py-3.5 text-xs font-semibold text-ink-600">Chứng chỉ đính kèm</th>
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
                  <div class="h-7 w-28 rounded-lg bg-ink-100"></div>
                </td>
                <td class="px-2 sm:px-3 py-4">
                  <div class="h-4 w-20 rounded bg-ink-100"></div>
                </td>
                <td class="px-2 sm:px-3 py-4">
                  <div class="h-4 w-24 rounded bg-ink-100"></div>
                </td>
                <td class="px-2 sm:px-3 py-4">
                  <div class="h-5 w-24 rounded-full bg-ink-100"></div>
                </td>
                <td class="pl-2 pr-4 sm:pl-3 sm:pr-5 py-4 text-right">
                  <div class="flex justify-end gap-1.5">
                    <div class="h-8 w-16 rounded-lg bg-ink-100"></div>
                    <div class="h-8 w-8 rounded-lg bg-ink-100"></div>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty state -->
            <tr v-else-if="filteredVerifications.length === 0">
              <td colspan="6" class="px-4 py-12 text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 mb-2.5">
                  <FileText :size="22" />
                </div>
                <div class="text-sm font-semibold text-ink-900">Không có yêu cầu phù hợp</div>
                <p class="mt-1 text-xs text-ink-500">
                  {{ searchQuery || dateFilter || statusFilter !== 'ALL' ? 'Hãy thử điều chỉnh từ khóa tìm kiếm hoặc bộ lọc.' : 'Chưa có kỹ thuật viên nào gửi yêu cầu xét duyệt kỹ năng.' }}
                </p>
              </td>
            </tr>

            <!-- Data rows -->
            <tr
              v-for="row in filteredVerifications"
              :key="row.id"
              class="group transition-colors"
              :class="selectedVerification?.id === row.id && showDrawer ? 'bg-brand-50/50 ring-1 ring-inset ring-brand-300' : 'hover:bg-ink-50/60'"
            >
              <!-- Kỹ thuật viên -->
              <td class="pl-4 pr-2 sm:pl-5 sm:pr-3 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shadow-xs">
                    <User :size="17" :stroke-width="2.2" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-ink-900 truncate" :title="row.technician?.fullName || 'Kỹ thuật viên'">
                      {{ row.technician?.fullName || 'Kỹ thuật viên' }}
                    </div>
                    <div class="truncate text-xs text-ink-500" :title="row.technician?.email || ''">
                      {{ row.technician?.email || '—' }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Kỹ năng đề xuất -->
              <td class="px-2 sm:px-3 py-3.5">
                <span class="inline-flex items-center gap-1.5 rounded-lg border border-brand-200/80 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-xs max-w-full truncate">
                  <Wrench :size="12" class="shrink-0 text-brand-600" />
                  <span class="truncate">{{ row.serviceName || 'Dịch vụ' }}</span>
                </span>
                <span v-if="row.attemptNumber > 1" class="ml-1.5 inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800" data-testid="skill-resubmitted-tag">Gửi lại lần {{ row.attemptNumber }}</span>
              </td>

              <!-- Ngày gửi -->
              <td class="px-2 sm:px-3 py-3.5">
                <span class="font-num text-xs sm:text-sm text-ink-700 whitespace-nowrap">
                  {{ formatDate(row.submittedAt) }}
                </span>
              </td>

              <!-- Chứng chỉ đính kèm -->
              <td class="px-2 sm:px-3 py-3.5">
                <div v-if="row.documents.length === 0" class="text-xs text-ink-400">
                  Chưa có tài liệu
                </div>
                <div v-else class="space-y-1">
                  <button
                    type="button"
                    class="inline-flex max-w-full items-center gap-1 truncate text-left text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline cursor-pointer"
                    :title="row.documents[0].fileName"
                    @click="openDocument(row, row.documents[0].id, row.documents[0].fileName)"
                  >
                    <FileText :size="13" class="shrink-0" />
                    <span class="truncate">{{ row.documents[0].issuedById ? 'FixHome cấp' : row.documents[0].fileName }}</span>
                  </button>
                  <div v-if="row.documents.length > 1" class="text-[11px] text-ink-400">
                    +{{ row.documents.length - 1 }} tài liệu khác
                  </div>
                </div>
              </td>

              <!-- Trạng thái -->
              <td class="px-2 sm:px-3 py-3.5">
                <span
                  v-if="row.status === 'PENDING'"
                  class="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  Đang chờ duyệt
                </span>
                <span
                  v-else-if="row.status === 'VERIFIED'"
                  class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  Đã duyệt
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-ink-400"></span>
                  Từ chối
                </span>
              </td>

              <!-- Hành động -->
              <td class="pl-2 pr-4 sm:pl-3 sm:pr-5 py-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    v-if="canDecide && row.status === 'PENDING'"
                    type="button"
                    class="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    title="Xem hồ sơ và duyệt"
                    @click="openDrawer(row)"
                  >
                    <Check :size="13" :stroke-width="2.5" />
                    <span>Duyệt</span>
                  </button>
                  <button
                    v-else
                    type="button"
                    class="inline-flex items-center justify-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                    title="Xem hồ sơ kỹ thuật viên"
                    @click="openDrawer(row)"
                  >
                    <span>Chi tiết</span>
                  </button>

                  <ConsoleMoreMenu label="Thao tác khác với yêu cầu">
                    <ConsoleMenuItem @click="openDrawer(row)">
                      Xem hồ sơ kỹ thuật viên
                    </ConsoleMenuItem>
                    <ConsoleMenuItem
                      v-if="row.documents.length > 0"
                      @click="openDocument(row, row.documents[0].id, row.documents[0].fileName)"
                    >
                      Xem chứng chỉ
                    </ConsoleMenuItem>
                    <ConsoleMenuItem
                      v-if="canDecide && row.status === 'PENDING'"
                      @click="openApprove(row)"
                    >
                      Duyệt và cấp chứng chỉ
                    </ConsoleMenuItem>
                    <ConsoleMenuItem
                      v-if="canDecide && row.status === 'PENDING'"
                      danger
                      :disabled="Boolean(actionLoadingId)"
                      @click="openReject(row)"
                    >
                      Từ chối
                    </ConsoleMenuItem>
                  </ConsoleMoreMenu>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4">
        <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
      </div>
    </div>

    <!-- Approve Modal: Upload the certificate FixHome issues -->
    <Teleport to="body">
      <Transition name="fh-modal">
        <div
          v-if="showApproveModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skill-approve-title"
          @click.self="showApproveModal = false"
          @keydown.esc="showApproveModal = false"
        >
          <div class="fh-modal-panel w-full max-w-md space-y-4 rounded-2xl border border-ink-200 bg-white p-6 shadow-xl">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 id="skill-approve-title" class="text-base font-semibold text-ink-900">Duyệt và cấp chứng chỉ</h3>
                <p class="mt-1 text-sm text-ink-600 text-pretty">
                  {{ verificationToApprove?.serviceName }} của <strong>{{ verificationToApprove?.technician?.fullName }}</strong>.
                </p>
              </div>
              <button
                type="button"
                class="cursor-pointer rounded-xl p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                aria-label="Đóng"
                @click="showApproveModal = false"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </div>
            <div>
              <label class="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-25/50 px-3 text-sm text-ink-600 transition-colors hover:border-brand-500 hover:bg-brand-50/30">
                <UploadCloud :size="18" class="shrink-0 text-brand-600" aria-hidden="true" />
                <span class="truncate">{{ certificateFile?.name || 'Chọn tệp chứng chỉ (ảnh hoặc PDF)' }}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="hidden" @change="onCertificateFileChange" />
              </label>
              <Transition name="fh-fade-slide">
                <p v-if="approveError" class="mt-1.5 text-sm text-rose-600" role="alert">{{ approveError }}</p>
              </Transition>
            </div>
            <div class="flex justify-end gap-2 border-t border-ink-100 pt-3">
              <FhButton variant="secondary" size="sm" @click="showApproveModal = false">Huỷ</FhButton>
              <FhButton variant="primary" size="sm" :loading="actionLoadingId === verificationToApprove?.id" @click="confirmApprove">Duyệt</FhButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Reject Dialog -->
    <FhConfirmDialog
      :open="showRejectModal"
      :loading="actionLoadingId === verificationToReject?.id"
      title="Từ chối kỹ năng"
      consequence="Kỹ năng này không được dùng để ghép việc. Thợ có thể hẹn kiểm tra lại sau."
      confirm-text="Từ chối"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="showRejectModal = false"
    >
      <label class="block text-sm font-medium text-ink-700" for="skill-reject-reason">Lý do từ chối</label>
      <textarea
        id="skill-reject-reason"
        v-model="rejectReason"
        maxlength="2000"
        rows="3"
        class="mt-1.5"
        :class="consoleTextarea"
        placeholder="Ví dụ: chưa đạt bài kiểm tra thực hành"
      ></textarea>
      <Transition name="fh-fade-slide">
        <p v-if="rejectReasonError" class="mt-1 text-sm text-rose-600" role="alert">{{ rejectReasonError }}</p>
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
          <div class="fh-modal-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
            <div class="flex items-center justify-between gap-3 border-b border-ink-200 bg-ink-25/60 px-6 py-4">
              <div class="flex flex-wrap items-center gap-3 truncate">
                <h3 id="doc-preview-title" class="truncate text-base font-semibold text-ink-900">{{ previewTitle }}</h3>
                <div v-if="selectedVerification && selectedVerification.documents.length > 1" class="flex shrink-0 items-center gap-1.5">
                  <button
                    v-for="(doc, idx) in selectedVerification.documents"
                    :key="doc.id"
                    type="button"
                    class="cursor-pointer rounded-lg px-2.5 py-1 text-xs transition-colors"
                    :class="previewDocumentId === doc.id ? 'bg-brand-600 text-white font-medium' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'"
                    @click="openDocument(selectedVerification, doc.id, doc.fileName)"
                  >
                    {{ doc.issuedById ? 'FixHome cấp' : `Tài liệu ${idx + 1}` }}
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="cursor-pointer rounded-xl p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
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
                  class="max-h-[min(72dvh,680px)] max-w-full rounded-xl bg-black shadow-md"
                ></video>
                <img
                  v-else-if="previewTitle.toLowerCase().includes('ảnh') || previewUrl.toLowerCase().includes('.jpg') || previewUrl.toLowerCase().includes('.jpeg') || previewUrl.toLowerCase().includes('.png') || previewUrl.toLowerCase().includes('.webp')"
                  :src="previewUrl"
                  class="max-h-[min(72dvh,680px)] max-w-full rounded-xl border border-ink-200 bg-white object-contain shadow-md"
                  :alt="previewTitle"
                />
                <iframe
                  v-else
                  :src="previewUrl"
                  :title="previewTitle"
                  class="h-[min(72dvh,680px)] w-full rounded-xl border border-ink-200 bg-white shadow-md"
                ></iframe>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Skill Verification Drawer ("Hồ sơ kỹ thuật viên" matching Image 1) -->
    <SkillVerificationDrawer
      v-model:open="showDrawer"
      :verification="selectedVerification"
      :loading-approve="actionLoadingId === selectedVerification?.id"
      @approve="openApprove"
      @reject="openReject"
      @preview="openDocumentAccess"
    />
  </div>
</template>
