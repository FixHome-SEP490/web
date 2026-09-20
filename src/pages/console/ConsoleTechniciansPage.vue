<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { CheckCircle2, XCircle, FileText, ShieldCheck, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { FhButton, FhCard, FhTable, FhStatusPill, FhConfirmDialog, type TableColumn } from '../../components';
import {
  adminVerificationsApi,
  type TechnicianVerification,
  type VerificationStatus,
} from '../../api/admin-verifications.api';

const columns: TableColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'submittedAt', label: 'Ngày gửi', width: '120px' },
  { key: 'documents', label: 'Hồ sơ KYC' },
  { key: 'status', label: 'Trạng thái', width: '140px' },
  { key: 'actions', label: 'Thao tác', width: '160px' },
];

const statusFilter = ref<VerificationStatus | 'ALL'>('ALL');
const searchQuery = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const verifications = ref<TechnicianVerification[]>([]);
const loading = ref(true);
const error = ref('');
const successMessage = ref('');
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
    error.value = getErrorMessage(reason, 'Không thể tải hồ sơ KYC từ Backend.');
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

const approveVerification = async (verification: TechnicianVerification) => {
  if (actionLoadingId.value) return;
  actionLoadingId.value = verification.id;
  error.value = '';
  successMessage.value = '';
  try {
    await adminVerificationsApi.approveVerification(verification.id);
    successMessage.value = `Đã xác minh hồ sơ của ${verification.technician?.fullName ?? verification.technicianId}.`;
    await loadVerifications();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Không thể xác minh hồ sơ KYC.');
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
    successMessage.value = `Đã từ chối hồ sơ của ${verificationToReject.value.technician?.fullName ?? verificationToReject.value.technicianId}.`;
    showRejectModal.value = false;
    verificationToReject.value = null;
    await loadVerifications();
  } catch (reason) {
    error.value = getErrorMessage(reason, 'Không thể từ chối hồ sơ KYC.');
  } finally {
    actionLoadingId.value = null;
  }
};

const openDocument = (document: TechnicianVerification['documents'][number]) => {
  if (!document.fileUrl) {
    error.value = 'Tài liệu này chưa có đường dẫn truy cập từ Backend.';
    return;
  }
  window.open(document.fileUrl, '_blank', 'noopener,noreferrer');
};

const formatDocumentType = (value: string) => {
  switch (value.toLowerCase()) {
    case 'citizen_id_front':
      return 'CCCD mặt trước';
    case 'citizen_id_back':
      return 'CCCD mặt sau';
    case 'face_photo':
      return 'Ảnh khuôn mặt';
    default:
      return value;
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
          <ShieldCheck class="text-brand-600" :size="24" />
          Xác thực KYC Kỹ thuật viên
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Admin kiểm tra CCCD và ảnh khuôn mặt trước khi Technician được đưa vào matching.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :loading="loading" @click="loadVerifications">
        <RefreshCw :size="15" /> Làm mới
      </FhButton>
    </div>

    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800"
      role="alert"
    >
      <span class="flex-1">{{ error }}</span>
      <button class="font-semibold underline" type="button" @click="loadVerifications">Thử lại</button>
    </div>
    <div
      v-if="successMessage"
      class="rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800"
      role="status"
    >
      {{ successMessage }}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-[var(--radius-sm)] border border-ink-200 shadow-[var(--shadow-e1)]">
      <div class="relative flex-1 min-w-[240px] max-w-sm">
        <label class="sr-only" for="verification-search">Tìm hồ sơ KYC</label>
        <input
          id="verification-search"
          v-model="searchQuery"
          type="search"
          placeholder="Tìm theo tên, email, SĐT hoặc mã hồ sơ..."
          class="w-full h-9 pl-9 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600 focus:bg-white"
        />
        <Search :size="15" class="absolute left-3 top-2.5 text-ink-400" />
      </div>
      <label class="flex items-center gap-2 text-xs text-ink-500">
        Trạng thái:
        <select v-model="statusFilter" class="h-9 px-3 text-xs bg-white border border-ink-200 rounded-[var(--radius-sm)] text-ink-700">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">PENDING</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </label>
    </div>

    <FhCard>
      <FhTable :columns="columns" :rows="filteredVerifications" :loading="loading" :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có hồ sơ KYC phù hợp.'">
        <template #cell-technician="{ row }">
          <div class="font-semibold text-xs text-ink-900">{{ row.technician?.fullName || row.technicianId }}</div>
          <div class="text-[11px] text-ink-500">{{ row.technician?.email || '—' }}</div>
          <div class="text-[11px] text-ink-400 font-mono">{{ row.technician?.phoneNumber || '—' }}</div>
        </template>
        <template #cell-submittedAt="{ row }">
          <span class="text-xs text-ink-500 font-num">{{ formatDate(String(row.submittedAt)) }}</span>
        </template>
        <template #cell-documents="{ row }">
          <div class="space-y-1 text-[11px]">
            <button
              v-for="document in row.documents"
              :key="document.id || document.fileName"
              class="flex items-center gap-1 text-left text-brand-600 hover:underline"
              type="button"
              @click="openDocument(document)"
            >
              <FileText :size="12" />
              <span>{{ formatDocumentType(document.documentType) }} · {{ document.fileName }}</span>
            </button>
            <span v-if="row.documents.length === 0" class="text-ink-400">Chưa có tài liệu</span>
          </div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="String(row.status)" />
        </template>
        <template #cell-actions="{ row }">
          <div v-if="row.status === 'PENDING'" class="flex items-center gap-2">
            <FhButton variant="primary" size="sm" :loading="actionLoadingId === row.id" :disabled="Boolean(actionLoadingId)" @click="approveVerification(row)">
              <CheckCircle2 :size="14" /> Duyệt
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
      <span>Trang {{ page }} / {{ totalPages }} · {{ total }} hồ sơ</span>
      <div class="flex items-center gap-2">
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page <= 1 || loading" aria-label="Trang trước" @click="page--">
          <ChevronLeft :size="16" />
        </button>
        <button class="p-2 rounded border border-ink-200 hover:bg-ink-100 disabled:opacity-40" type="button" :disabled="page >= totalPages || loading" aria-label="Trang sau" @click="page++">
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <FhConfirmDialog
      :open="showRejectModal"
      :loading="actionLoadingId === verificationToReject?.id"
      title="Từ chối hồ sơ KYC"
      consequence="Hồ sơ sẽ không được chuyển sang VERIFIED. Lý do được gửi lên Backend để lưu cùng quyết định review."
      confirm-text="Xác nhận từ chối"
      cancel-text="Quay lại"
      @confirm="confirmReject"
      @cancel="showRejectModal = false"
    >
      <div>
        <label class="block text-sm font-semibold text-ink-700 mb-1" for="reject-reason">Lý do từ chối *</label>
        <textarea
          id="reject-reason"
          v-model="rejectReason"
          rows="3"
          class="w-full p-3 text-sm bg-white border border-ink-200 rounded-[var(--radius-sm)] focus:outline-none focus:border-brand-600"
          placeholder="Nêu rõ tài liệu hoặc thông tin cần bổ sung..."
        ></textarea>
        <p v-if="rejectReasonError" class="mt-1 text-xs text-danger-600" role="alert">{{ rejectReasonError }}</p>
      </div>
    </FhConfirmDialog>
  </div>
</template>
