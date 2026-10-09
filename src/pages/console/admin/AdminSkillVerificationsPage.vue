<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { FileText, UploadCloud } from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhConfirmDialog } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../../components/console/ConsoleMenuItem.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleTextarea } from '../../../components/console/console-ui';
import { userFacingError } from '../../../utils/user-facing-error';
import {
  adminSkillVerificationsApi,
  type SkillVerification,
  type SkillVerificationStatus,
} from '../../../api/admin-skill-verifications.api';
import { vnDateString } from '../../../utils/vn-time';

const columns: ConsoleColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'service', label: 'Kỹ năng' },
  { key: 'submittedAt', label: 'Ngày gửi', hideBelow: 'xl' },
  { key: 'documents', label: 'Chứng chỉ', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái', hideBelow: 'lg' },
  { key: 'actions', label: '', align: 'right' },
];

const STATUS_LABELS: Record<string, string> = { PENDING: 'Đang chờ duyệt', VERIFIED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const statusLabel = (status: unknown) => STATUS_LABELS[String(status ?? '').toUpperCase()] ?? 'Trạng thái chưa xác định';

const statusFilter = ref<SkillVerificationStatus | 'ALL'>('PENDING');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const verifications = ref<SkillVerification[]>([]);
const loading = ref(true);
const error = ref('');
const loadError = ref('');
const successMessage = ref('');
const actionLoadingId = ref<string | null>(null);
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

// Plain Vietnamese reasons from the server are kept; codes and English never show.
const getErrorMessage = (reason: unknown, fallback: string) => userFacingError(reason, fallback);

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

onMounted(() => void loadVerifications());
watch(statusFilter, () => {
  successMessage.value = '';
  if (page.value === 1) {
    void loadVerifications();
  } else {
    page.value = 1;
  }
});
watch(page, () => void loadVerifications());

const openDocument = async (verification: SkillVerification, documentId: string) => {
  try {
    const { signedUrl } = await adminSkillVerificationsApi.getDocumentAccess(verification.id, documentId);
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  } catch {
    error.value = 'Chưa mở được tài liệu, vui lòng thử lại.';
  }
};

// ---- Approve (requires uploading the FixHome-issued certificate) ----
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
    await loadVerifications();
  } catch (reason) {
    approveError.value = getErrorMessage(reason, 'Chưa duyệt được kỹ năng, vui lòng thử lại.');
  } finally {
    actionLoadingId.value = null;
  }
};

// ---- Reject ----
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
    await loadVerifications();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Chưa từ chối được yêu cầu, vui lòng thử lại.');
  } finally {
    actionLoadingId.value = null;
  }
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : vnDateString(date);
};
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Duyệt kỹ năng" :count="loading || loadError ? null : total">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem :disabled="loading" @click="loadVerifications">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <div class="flex flex-wrap items-center gap-2">
      <select v-model="statusFilter" :class="consoleField" aria-label="Trạng thái">
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
      :rows="verifications"
      :loading="loading"
      empty-text="Không có yêu cầu phù hợp."
    >
      <template #cell-technician="{ row }">
        <div class="font-medium text-ink-900">{{ row.technician?.fullName || 'Kỹ thuật viên' }}</div>
        <div class="truncate text-xs text-ink-500">{{ row.technician?.email || '—' }}</div>
      </template>
      <template #cell-service="{ row }">
        <span class="text-ink-800">{{ row.serviceName || 'Dịch vụ' }}</span>
      </template>
      <template #cell-submittedAt="{ row }">
        <span class="whitespace-nowrap font-num text-ink-600">{{ formatDate(String(row.submittedAt)) }}</span>
      </template>
      <template #cell-documents="{ row }">
        <ul class="space-y-1">
          <li v-for="document in row.documents" :key="document.id">
            <button
              type="button"
              class="flex max-w-64 items-center gap-1 text-left text-sm text-brand-700 hover:underline"
              :title="document.fileName"
              @click="openDocument(row, document.id)"
            >
              <FileText :size="13" class="shrink-0" aria-hidden="true" />
              <span class="truncate">{{ document.issuedById ? 'FixHome cấp' : 'Của thợ' }}: {{ document.fileName }}</span>
            </button>
          </li>
          <li v-if="row.documents.length === 0" class="text-ink-400">Chưa có tài liệu</li>
        </ul>
      </template>
      <template #cell-status="{ row }">
        <FhStatusPill :status="row.status" :label="statusLabel(row.status)" />
      </template>
      <template #cell-actions="{ row }">
        <div v-if="row.status === 'PENDING'" class="flex items-center justify-end gap-2">
          <FhButton variant="primary" size="sm" :loading="actionLoadingId === row.id" :disabled="Boolean(actionLoadingId)" @click="openApprove(row)">
            Duyệt
          </FhButton>
          <ConsoleMoreMenu label="Thao tác khác với yêu cầu">
            <ConsoleMenuItem danger :disabled="Boolean(actionLoadingId)" @click="openReject(row)">Từ chối</ConsoleMenuItem>
          </ConsoleMoreMenu>
        </div>
      </template>
    </ConsoleTable>

    <ConsolePagination v-model:page="page" :total-pages="totalPages" :disabled="loading" />

    <!-- Approve: upload the certificate FixHome issues -->
    <div
      v-if="showApproveModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-approve-title"
      @keydown.esc="showApproveModal = false"
    >
      <div class="bg-white rounded-md max-w-sm w-full p-6 shadow-xl space-y-4">
        <h3 id="skill-approve-title" class="text-lg font-semibold text-ink-900">Duyệt và cấp chứng chỉ</h3>
        <p class="text-sm text-ink-600 text-pretty">
          {{ verificationToApprove?.serviceName }} của <strong>{{ verificationToApprove?.technician?.fullName }}</strong>.
        </p>
        <div>
          <label class="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-sm border-2 border-dashed border-ink-200 px-3 text-sm text-ink-500 hover:border-brand-400">
            <UploadCloud :size="18" aria-hidden="true" />
            <span class="truncate">{{ certificateFile?.name || 'Chọn tệp chứng chỉ (ảnh hoặc PDF)' }}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="hidden" @change="onCertificateFileChange" />
          </label>
          <p v-if="approveError" class="mt-1.5 text-sm text-danger-600" role="alert">{{ approveError }}</p>
        </div>
        <div class="flex justify-end gap-2">
          <FhButton variant="secondary" size="sm" @click="showApproveModal = false">Huỷ</FhButton>
          <FhButton variant="primary" size="sm" :loading="actionLoadingId === verificationToApprove?.id" @click="confirmApprove">Duyệt</FhButton>
        </div>
      </div>
    </div>

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
        rows="3"
        class="mt-1.5"
        :class="consoleTextarea"
        placeholder="Ví dụ: chưa đạt bài kiểm tra thực hành"
      ></textarea>
      <p v-if="rejectReasonError" class="mt-1 text-sm text-danger-600" role="alert">{{ rejectReasonError }}</p>
    </FhConfirmDialog>
  </div>
</template>
