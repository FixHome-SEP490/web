<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { CheckCircle2, XCircle, FileText, Award, RefreshCw, UploadCloud } from 'lucide-vue-next';
import { FhButton, FhCard, FhTable, FhStatusPill, FhConfirmDialog, type TableColumn } from '../../../components';
import {
  adminSkillVerificationsApi,
  type SkillVerification,
  type SkillVerificationStatus,
} from '../../../api/admin-skill-verifications.api';

const columns: TableColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'service', label: 'Kỹ năng' },
  { key: 'submittedAt', label: 'Ngày gửi', width: '120px' },
  { key: 'documents', label: 'Tín chỉ / Chứng chỉ' },
  { key: 'status', label: 'Trạng thái', width: '140px' },
  { key: 'actions', label: 'Thao tác', width: '220px' },
];

const statusFilter = ref<SkillVerificationStatus | 'ALL'>('PENDING');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const verifications = ref<SkillVerification[]>([]);
const loading = ref(true);
const error = ref('');
const successMessage = ref('');
const actionLoadingId = ref<string | null>(null);
let latestRequest = 0;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

function getErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason !== null && 'response' in reason) {
    const response = (reason as { response?: { data?: { message?: unknown; error?: { message?: unknown } } } })
      .response;
    if (typeof response?.data?.message === 'string') return response.data.message;
    if (typeof response?.data?.error?.message === 'string') return response.data.error.message;
  }
  return fallback;
}

const loadVerifications = async () => {
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = '';
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
    error.value = getErrorMessage(reason, 'Không thể tải danh sách kỹ năng chờ duyệt.');
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
};

onMounted(() => void loadVerifications());
watch(statusFilter, () => {
  successMessage.value = '';
  page.value === 1 ? void loadVerifications() : (page.value = 1);
});
watch(page, () => void loadVerifications());

const openDocument = async (verification: SkillVerification, documentId: string) => {
  try {
    const { signedUrl } = await adminSkillVerificationsApi.getDocumentAccess(verification.id, documentId);
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  } catch {
    error.value = 'Không thể mở tài liệu này.';
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
    approveError.value = 'Vui lòng chọn file chứng chỉ FixHome cấp cho thợ.';
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
    approveError.value = getErrorMessage(reason, 'Không thể duyệt kỹ năng này.');
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
    error.value = getErrorMessage(reason, 'Không thể từ chối yêu cầu này.');
  } finally {
    actionLoadingId.value = null;
  }
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Award class="text-brand-600" :size="24" />
          Duyệt kỹ năng thợ
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Thợ khai kỹ năng → hẹn review trực tiếp với FixHome → duyệt và cấp chứng chỉ tại đây.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :loading="loading" @click="loadVerifications">
        <RefreshCw :size="15" /> Làm mới
      </FhButton>
    </div>

    <div v-if="error" class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadVerifications">Thử lại</button>
    </div>
    <div v-if="successMessage" class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
      {{ successMessage }}
    </div>

    <div class="flex items-center justify-between gap-4 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <label class="flex items-center gap-2 text-xs text-ink-500">
        Trạng thái:
        <select v-model="statusFilter" class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700">
          <option value="PENDING">PENDING</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="ALL">Tất cả trạng thái</option>
        </select>
      </label>
    </div>

    <FhCard>
      <FhTable :columns="columns" :rows="verifications" :loading="loading" :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có yêu cầu phù hợp.'">
        <template #cell-technician="{ row }">
          <div class="font-semibold text-xs text-ink-900">{{ row.technician?.fullName || row.technicianId }}</div>
          <div class="text-[11px] text-ink-500">{{ row.technician?.email || '—' }}</div>
        </template>
        <template #cell-service="{ row }">
          <span class="text-xs text-ink-800">{{ row.serviceName || row.serviceId }}</span>
        </template>
        <template #cell-submittedAt="{ row }">
          <span class="text-xs text-ink-500 font-num">{{ formatDate(String(row.submittedAt)) }}</span>
        </template>
        <template #cell-documents="{ row }">
          <div class="space-y-1 text-[11px]">
            <button
              v-for="document in row.documents"
              :key="document.id"
              class="flex items-center gap-1 text-left text-brand-600 hover:underline"
              type="button"
              @click="openDocument(row, document.id)"
            >
              <FileText :size="12" />
              <span>{{ document.issuedById ? 'FixHome cấp' : 'Tín chỉ của thợ' }} · {{ document.fileName }}</span>
            </button>
            <span v-if="row.documents.length === 0" class="text-ink-400">Chưa có tài liệu</span>
          </div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" />
        </template>
        <template #cell-actions="{ row }">
          <div v-if="row.status === 'PENDING'" class="flex items-center gap-2">
            <FhButton variant="primary" size="sm" :loading="actionLoadingId === row.id" :disabled="Boolean(actionLoadingId)" @click="openApprove(row)">
              <CheckCircle2 :size="14" /> Duyệt & cấp chứng chỉ
            </FhButton>
            <FhButton variant="danger" size="sm" :disabled="Boolean(actionLoadingId)" @click="openReject(row)">
              <XCircle :size="14" /> Từ chối
            </FhButton>
          </div>
          <span v-else class="text-xs text-ink-400">Đã xử lý</span>
        </template>
      </FhTable>
    </FhCard>

    <div v-if="totalPages > 1" class="flex items-center justify-between text-xs text-ink-500">
      <span>Trang {{ page }} / {{ totalPages }} · {{ total }} yêu cầu</span>
      <div class="flex items-center gap-2">
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page <= 1 || loading" @click="page--">‹</button>
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page >= totalPages || loading" @click="page++">›</button>
      </div>
    </div>

    <!-- Approve modal: upload the FixHome-issued certificate -->
    <div v-if="showApproveModal" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4">
      <div class="bg-white rounded-md max-w-sm w-full p-6 shadow-xl space-y-4">
        <h3 class="text-lg font-bold text-ink-900">Duyệt & cấp chứng chỉ</h3>
        <p class="text-sm text-ink-600">
          Kỹ năng "<strong>{{ verificationToApprove?.serviceName }}</strong>" của
          <strong>{{ verificationToApprove?.technician?.fullName }}</strong>. Upload file chứng chỉ FixHome cấp cho thợ này.
        </p>
        <div>
          <label class="flex items-center justify-center gap-2 h-24 border-2 border-dashed border-ink-200 rounded-sm cursor-pointer hover:border-brand-400 text-sm text-ink-500">
            <UploadCloud :size="18" />
            <span>{{ certificateFile?.name || 'Chọn file chứng chỉ (ảnh hoặc PDF)' }}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="hidden" @change="onCertificateFileChange" />
          </label>
          <p v-if="approveError" class="mt-1.5 text-xs text-danger-600">{{ approveError }}</p>
        </div>
        <div class="flex justify-end gap-3 pt-3 border-t border-ink-100">
          <FhButton variant="ghost" size="sm" @click="showApproveModal = false">Huỷ bỏ</FhButton>
          <FhButton variant="primary" size="sm" :loading="actionLoadingId === verificationToApprove?.id" @click="confirmApprove">
            Duyệt
          </FhButton>
        </div>
      </div>
    </div>

    <FhConfirmDialog
      :open="showRejectModal"
      :loading="actionLoadingId === verificationToReject?.id"
      title="Từ chối yêu cầu duyệt kỹ năng"
      consequence="Kỹ năng này sẽ không được đưa vào matching. Thợ có thể hẹn review lại sau."
      confirm-text="Xác nhận từ chối"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="showRejectModal = false"
    >
      <div>
        <label class="block text-sm font-semibold text-ink-700 mb-1" for="skill-reject-reason">Lý do từ chối *</label>
        <textarea
          id="skill-reject-reason"
          v-model="rejectReason"
          rows="3"
          class="w-full p-3 text-sm bg-white border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600"
          placeholder="Ví dụ: chưa đạt bài test thực hành..."
        ></textarea>
        <p v-if="rejectReasonError" class="mt-1 text-xs text-danger-600" role="alert">{{ rejectReasonError }}</p>
      </div>
    </FhConfirmDialog>
  </div>
</template>
