<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { CheckCircle2, XCircle, FileText, ShieldCheck, ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-vue-next';
import { FhTable, FhStatusPill, FhConfirmDialog, type TableColumn } from '../../components';
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
  { key: 'actions', label: 'Thao tác', width: '160px', align: 'right' },
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

const previewUrl = ref('');
const showPreviewModal = ref(false);
const previewTitle = ref('');
const previewLoading = ref(false);

const openDocument = async (
  verification: TechnicianVerification,
  document: TechnicianVerification['documents'][number],
) => {
  if (!document.id) {
    error.value = 'Tài liệu này chưa có mã định danh từ Backend.';
    return;
  }
  
  previewTitle.value = formatDocumentType(document.documentType);
  previewUrl.value = '';
  showPreviewModal.value = true;
  previewLoading.value = true;
  
  try {
    const url = await adminVerificationsApi.getDocumentAccess(verification.id, document.id);
    previewUrl.value = url;
  } catch (reason) {
    showPreviewModal.value = false;
    error.value = getErrorMessage(reason, 'Không thể tải tài liệu KYC.');
  } finally {
    previewLoading.value = false;
  }
};

const formatDocumentType = (value: string) => {
  switch (value.toLowerCase()) {
    case 'citizen_id_front':
      return 'CCCD mặt trước';
    case 'citizen_id_back':
      return 'CCCD mặt sau';
    case 'face_photo':
      return 'Ảnh khuôn mặt';
    case 'face_video':
      return 'Video xác minh khuôn mặt';
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
  <div class="space-y-6 max-w-[1400px] mx-auto">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
      <div class="space-y-1.5">
        <div class="inline-flex items-center gap-2.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold uppercase tracking-wider mb-2">
          <ShieldCheck :size="14" stroke-width="2.5" />
          Admin Console
        </div>
        <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">
          Xác thực Kỹ thuật viên
        </h1>
        <p class="text-sm text-gray-500 font-medium max-w-xl">
          Kiểm tra CCCD, ảnh khuôn mặt và thông tin cá nhân. Đảm bảo KTV đáp ứng đủ điều kiện trước khi đưa vào hệ thống matching dịch vụ.
        </p>
      </div>
    </div>

    <!-- Feedback Messages -->
    <div
      v-if="error"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"
      role="alert"
    >
      <span class="flex-1 font-medium">{{ error }}</span>
      <button class="font-semibold underline hover:text-red-900 transition-colors" type="button" @click="loadVerifications">Thử lại</button>
    </div>
    <div
      v-if="successMessage"
      class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium shadow-sm"
      role="status"
    >
      {{ successMessage }}
    </div>

    <!-- Main Table -->
    <FhTable 
      :columns="columns" 
      :rows="filteredVerifications" 
      :loading="loading" 
      :empty-text="error ? 'Không thể hiển thị dữ liệu.' : 'Không có hồ sơ KYC phù hợp.'"
      searchable
      v-model:searchQuery="searchQuery"
      searchPlaceholder="Tìm theo tên, email, SĐT..."
      refreshable
      @refresh="loadVerifications"
      tableTitle="Danh sách chờ duyệt"
      tableSubtitle="Các kỹ thuật viên vừa nộp hồ sơ KYC"
    >
      <template #toolbar>
        <div class="flex items-center gap-2">
          <label class="hidden md:flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Trạng thái
          </label>
          <select 
            v-model="statusFilter" 
            class="h-10 pl-3 pr-8 text-sm bg-white border border-gray-200/80 rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-gray-700 font-medium appearance-none cursor-pointer shadow-sm transition-all hover:bg-gray-50"
            style="background-image: url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E'); background-size: 20px 20px; background-position: right 0.5rem center; background-repeat: no-repeat;"
          >
            <option value="ALL">Tất cả</option>
            <option value="PENDING">Đang chờ (PENDING)</option>
            <option value="VERIFIED">Đã duyệt (VERIFIED)</option>
            <option value="REJECTED">Từ chối (REJECTED)</option>
          </select>
        </div>
      </template>

      <template #cell-technician="{ row }">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center text-brand-700 font-bold border border-brand-200 shadow-sm shrink-0">
            {{ (row.technician?.fullName || row.technicianId).charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0">
            <div class="font-bold text-sm text-gray-900 truncate">{{ row.technician?.fullName || row.technicianId }}</div>
            <div class="text-xs text-gray-500 flex flex-wrap items-center gap-1.5 mt-0.5">
              <span class="truncate">{{ row.technician?.email || 'Chưa có email' }}</span>
              <span class="w-1 h-1 rounded-full bg-gray-300 shrink-0"></span>
              <span class="font-mono text-gray-600 truncate">{{ row.technician?.phoneNumber || '—' }}</span>
            </div>
          </div>
        </div>
      </template>

      <template #cell-submittedAt="{ row }">
        <div class="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <Calendar :size="14" class="text-gray-400" />
          <span>{{ formatDate(String(row.submittedAt)) }}</span>
        </div>
      </template>

      <template #cell-documents="{ row }">
        <div class="flex flex-col gap-1.5 py-1">
          <button
            v-for="document in row.documents"
            :key="document.id || document.fileName"
            class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-gray-50 text-gray-700 hover:bg-brand-50 hover:text-brand-700 border border-gray-200 hover:border-brand-200 transition-colors w-fit text-left"
            type="button"
            @click="openDocument(row, document)"
          >
            <FileText :size="12" class="opacity-70 shrink-0" />
            <span class="truncate max-w-[200px]">{{ formatDocumentType(document.documentType) }}</span>
          </button>
          <span v-if="row.documents.length === 0" class="text-xs text-gray-400 font-medium italic">Chưa có tài liệu</span>
        </div>
      </template>

      <template #cell-status="{ row }">
        <FhStatusPill :status="String(row.status)" class="shadow-sm" />
      </template>

      <template #cell-actions="{ row }">
        <div v-if="row.status === 'PENDING'" class="flex items-center justify-end gap-2">
          <button 
            class="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 transition-colors disabled:opacity-50"
            :disabled="Boolean(actionLoadingId)"
            @click="approveVerification(row)"
            title="Duyệt hồ sơ"
          >
            <Loader2 v-if="actionLoadingId === row.id" class="animate-spin" :size="16" />
            <CheckCircle2 v-else :size="16" stroke-width="2.5" />
          </button>
          <button 
            class="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
            :disabled="Boolean(actionLoadingId)"
            @click="openReject(row)"
            title="Từ chối"
          >
            <XCircle :size="16" stroke-width="2.5" />
          </button>
        </div>
        <div v-else class="flex justify-end">
          <span class="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
            Đã xử lý
          </span>
        </div>
      </template>
    </FhTable>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between text-xs font-medium text-gray-500 pt-2 px-1">
      <span>Trang {{ page }} / {{ totalPages }} <span class="mx-1.5 text-gray-300">|</span> {{ total }} hồ sơ</span>
      <div class="flex items-center gap-2">
        <button 
          class="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200/80 bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40 shadow-sm" 
          type="button" 
          :disabled="page <= 1 || loading" 
          aria-label="Trang trước" 
          @click="page--"
        >
          <ChevronLeft :size="16" />
        </button>
        <button 
          class="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200/80 bg-white hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-40 shadow-sm" 
          type="button" 
          :disabled="page >= totalPages || loading" 
          aria-label="Trang sau" 
          @click="page++"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>

    <!-- Reject Modal -->
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
      <div class="mt-4">
        <label class="block text-sm font-bold text-gray-700 mb-2" for="reject-reason">Lý do từ chối <span class="text-red-500">*</span></label>
        <textarea
          id="reject-reason"
          v-model="rejectReason"
          rows="3"
          class="w-full p-3.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all resize-none"
          placeholder="Nêu rõ tài liệu hoặc thông tin cần bổ sung..."
        ></textarea>
        <p v-if="rejectReasonError" class="mt-1.5 text-xs font-medium text-red-600" role="alert">{{ rejectReasonError }}</p>
      </div>
    </FhConfirmDialog>

    <!-- Document Preview Modal -->
    <div
      v-if="showPreviewModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      @click.self="showPreviewModal = false"
    >
      <div class="bg-white rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh] overflow-hidden">
        <!-- Modal Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
            <FileText :size="20" class="text-brand-600" />
            {{ previewTitle }}
          </h3>
          <button 
            class="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors focus:outline-none" 
            @click="showPreviewModal = false"
            title="Đóng"
          >
            <XCircle :size="20" />
          </button>
        </div>
        
        <!-- Modal Body (Preview Container) -->
        <div class="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-6 relative min-h-[500px]">
          <div v-if="previewLoading" class="flex flex-col items-center justify-center text-gray-500 gap-3">
            <Loader2 :size="32" class="animate-spin text-brand-600" />
            <span class="text-sm font-medium">Đang tải tài liệu bảo mật...</span>
          </div>
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
              class="max-w-full max-h-[700px] object-contain rounded-lg shadow-lg border border-gray-200 bg-white" 
              alt="KYC Document" 
            />
            
            <iframe 
              v-else 
              :src="previewUrl" 
              class="w-full h-[700px] border-0 rounded-lg shadow-lg bg-white"
            ></iframe>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
