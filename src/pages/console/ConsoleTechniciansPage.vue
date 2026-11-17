<script setup lang="ts">
import { foldForSearch } from '../../utils/formatters';
import { computed, onMounted, ref, watch } from 'vue';
import { RotateCcw, X } from 'lucide-vue-next';
import { FhButton, FhConfirmDialog, FhSkeleton, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleTextarea } from '../../components/console/console-ui';
import { userFacingError } from '../../utils/user-facing-error';
import {
  adminVerificationsApi,
  type TechnicianVerification,
  type VerificationStatus,
} from '../../api/admin-verifications.api';
import TechnicianVerificationDrawer from '../../components/console/TechnicianVerificationDrawer.vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import CustomerVerificationsTab from '../../components/console/CustomerVerificationsTab.vue';
import { useQueryChoice } from '../../composables/useQueryState';
import { vnDateString } from '../../utils/vn-time';

// Admin reviews identity checks of technicians and, since PO 14/10/2026, of
// customers before their first withdrawal: one tab each (?tab=customers).
type ReviewTab = 'technicians' | 'customers';
const activeTab = useQueryChoice<ReviewTab>('tab', ['technicians', 'customers'], 'technicians');
const tabs = [
  { key: 'technicians' as const, label: 'Kỹ thuật viên' },
  { key: 'customers' as const, label: 'Khách hàng' },
];

const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'submittedAt', label: 'Ngày gửi', hideBelow: 'lg' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chờ duyệt',
  VERIFIED: 'Đã xác nhận danh tính',
  REJECTED: 'Đã từ chối',
};
const statusLabel = (status: unknown) => STATUS_LABELS[String(status ?? '').toUpperCase()] ?? 'Trạng thái chưa xác định';

const statusFilter = ref<VerificationStatus | 'ALL'>('ALL');
const searchQuery = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const verifications = ref<TechnicianVerification[]>([]);
const loading = ref(true);
const error = ref('');
const loadError = ref('');
const successMessage = ref('');
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

// Plain Vietnamese reasons from the server are kept; codes and English never show.
const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

const loadVerifications = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await adminVerificationsApi.getVerifications({
      page: page.value,
      limit: pageSize,
      status: statusFilter.value === 'ALL' ? undefined : statusFilter.value,
    });
    if (requestId !== latestRequest) return;
    verifications.value = response.data;
    total.value = response.meta.total;
  } catch (reason) {
    if (requestId !== latestRequest) return;
    verifications.value = [];
    total.value = 0;
    loadError.value = getErrorMessage(reason, CONSOLE_LOAD_ERROR);
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => {
  if (activeTab.value === 'technicians') void loadVerifications();
});

// The technician list is read when its tab is shown.
watch(activeTab, (tab) => {
  if (tab === 'technicians') void loadVerifications();
});

watch(statusFilter, () => {
  successMessage.value = '';
  if (page.value !== 1) {
    page.value = 1;
  } else {
    void loadVerifications();
  }
});

watch(page, (nextPage, previousPage) => {
  if (nextPage !== previousPage) void loadVerifications();
});

const filteredVerifications = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return verifications.value;
  return verifications.value.filter((verification) => {
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
    // The drawer keeps the summary from the list when the full record does not load.
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
    await loadVerifications();
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
  // If drawer is open, we can keep it open or close it. Let's keep it open, the reject modal will show on top.
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
    showDrawer.value = false; // Close drawer if it was open
    await loadVerifications();
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



const hasFilters = computed(() => Boolean(searchQuery.value.trim()) || statusFilter.value !== 'ALL');
const resetFilters = () => {
  searchQuery.value = '';
  statusFilter.value = 'ALL';
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : vnDateString(date);
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader class="animate-slide-up" title="Duyệt xác minh danh tính" :count="activeTab !== 'technicians' || loading || loadError ? null : total" />

    <ConsoleTabs v-model="activeTab" class="animate-slide-up-delay-1" :tabs="tabs" />

    <CustomerVerificationsTab v-if="activeTab === 'customers'" class="animate-slide-up-delay-2" />

    <template v-else>
      <div class="animate-slide-up-delay-1 flex flex-wrap items-center gap-2.5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-3 shadow-(--shadow-e1)">
        <ConsoleSearch v-model="searchQuery" placeholder="Tìm tên, email, số điện thoại" label="Tìm hồ sơ" />
        <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái hồ sơ">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">Đang chờ duyệt</option>
          <option value="VERIFIED">Đã xác nhận danh tính</option>
          <option value="REJECTED">Đã từ chối</option>
        </select>
        <button
          v-if="hasFilters"
          type="button"
          class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          @click="resetFilters"
        >
          <RotateCcw :size="14" aria-hidden="true" />
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
        <ConsoleLoadError v-if="loadError" :message="loadError" @retry="loadVerifications" />
        <ConsoleTable
          v-else
          :columns="columns"
          :rows="filteredVerifications"
          :loading="loading"
          empty-text="Không có hồ sơ phù hợp."
        >
          <template #cell-technician="{ row }">
            <button
              type="button"
              class="cursor-pointer text-left font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              @click="openDrawer(row)"
            >{{ row.technician?.fullName || 'Kỹ thuật viên' }}</button>
            <div class="truncate text-xs text-ink-500" :title="row.technician?.email || ''">
              {{ row.technician?.email || 'Chưa có email' }} · <span class="whitespace-nowrap font-num">{{ row.technician?.phoneNumber || '—' }}</span>
            </div>
          </template>

          <template #cell-submittedAt="{ row }">
            <span class="whitespace-nowrap font-num text-ink-600">{{ formatDate(String(row.submittedAt)) }}</span>
          </template>

          <template #cell-status="{ row }">
            <FhStatusPill :status="String(row.status)" :label="statusLabel(row.status)" />
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center justify-end gap-2">
              <template v-if="row.status === 'PENDING'">
                <FhButton
                  variant="primary"
                  size="sm"
                  :loading="actionLoadingId === row.id"
                  :disabled="Boolean(actionLoadingId)"
                  @click="approveVerification(row)"
                >Xác nhận</FhButton>
                <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
                  <ConsoleMenuItem danger :disabled="Boolean(actionLoadingId)" @click="openReject(row)">Từ chối</ConsoleMenuItem>
                </ConsoleMoreMenu>
              </template>
            </div>
          </template>
        </ConsoleTable>

        <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />
      </div>
    </template>

    <!-- Reject -->
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

    <!-- Document preview -->
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
