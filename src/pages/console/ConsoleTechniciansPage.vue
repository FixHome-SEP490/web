<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
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
import { vnDateString } from '../../utils/vn-time';

const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'submittedAt', label: 'Ngày gửi', hideBelow: 'lg' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang chờ duyệt',
  VERIFIED: 'Đã duyệt',
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
  void loadVerifications();
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
      .some((value) => String(value).toLowerCase().includes(query));
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
    successMessage.value = `Đã duyệt hồ sơ của ${verification.technician?.fullName ?? 'kỹ thuật viên'}.`;
    await loadVerifications();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa duyệt được hồ sơ, vui lòng thử lại.');
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



const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : vnDateString(date);
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Duyệt hồ sơ kỹ thuật viên" :count="loading || loadError ? null : total" />

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchQuery" placeholder="Tìm tên, email, số điện thoại" label="Tìm hồ sơ" />
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái hồ sơ">
        <option value="ALL">Tất cả trạng thái</option>
        <option value="PENDING">Đang chờ duyệt</option>
        <option value="VERIFIED">Đã duyệt</option>
        <option value="REJECTED">Đã từ chối</option>
      </select>
    </div>

    <p v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">{{ error }}</p>
    <p v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">{{ successMessage }}</p>

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
          class="text-left font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
            >Duyệt</FhButton>
            <ConsoleMoreMenu label="Thao tác khác với hồ sơ">
              <ConsoleMenuItem danger :disabled="Boolean(actionLoadingId)" @click="openReject(row)">Từ chối</ConsoleMenuItem>
            </ConsoleMoreMenu>
          </template>
        </div>
      </template>
    </ConsoleTable>

    <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />

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
      <p v-if="rejectReasonError" class="mt-1.5 text-sm text-danger-600" role="alert">{{ rejectReasonError }}</p>
    </FhConfirmDialog>

    <!-- Document preview -->
    <div
      v-if="showPreviewModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-preview-title"
      @click.self="showPreviewModal = false"
      @keydown.esc="showPreviewModal = false"
    >
      <div class="bg-white rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh] overflow-hidden">
        <div class="flex items-center justify-between gap-3 border-b border-ink-100 px-6 py-4">
          <h3 id="doc-preview-title" class="font-semibold text-ink-900">{{ previewTitle }}</h3>
          <button
            type="button"
            class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            aria-label="Đóng"
            @click="showPreviewModal = false"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="relative flex min-h-[500px] flex-1 items-center justify-center overflow-auto bg-ink-100 p-6">
          <FhSkeleton v-if="previewLoading" width="320px" height="420px" rounded="md" />
          <template v-else-if="previewUrl">
            <video
              v-if="previewTitle.toLowerCase().includes('video')"
              :src="previewUrl"
              controls
              autoplay
              class="max-w-full max-h-[700px] rounded-lg shadow-lg bg-black"
            ></video>
            <img
              v-else-if="previewTitle.toLowerCase().includes('ảnh') || previewTitle.toLowerCase().includes('cccd')"
              :src="previewUrl"
              class="max-w-full max-h-[700px] object-contain rounded-lg shadow-lg border border-ink-200 bg-white"
              :alt="previewTitle"
            />
            <iframe
              v-else
              :src="previewUrl"
              :title="previewTitle"
              class="w-full h-[700px] border-0 rounded-lg shadow-lg bg-white"
            ></iframe>
          </template>
        </div>
      </div>
    </div>

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
