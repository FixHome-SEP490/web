<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  X,
  CheckCircle2,
  XCircle,
  User,
  Briefcase,
  FileBadge,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-vue-next';
import type {
  SkillVerification,
  SkillVerificationDocument,
} from '../../api/admin-skill-verifications.api';
import { adminSkillVerificationsApi } from '../../api/admin-skill-verifications.api';
import { vnDateString } from '../../utils/vn-time';

const props = defineProps<{
  open: boolean;
  verification: SkillVerification | null;
  loadingApprove?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'approve', verification: SkillVerification): void;
  (e: 'reject', verification: SkillVerification): void;
  (e: 'preview', title: string, documentId: string): void;
}>();

const close = () => {
  emit('update:open', false);
};

const technician = computed(() => props.verification?.technician);

const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Đang chờ duyệt',
  VERIFIED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
};
const statusText = computed(
  () => STATUS_TEXT[String(props.verification?.status ?? '').toUpperCase()] ?? 'Trạng thái chưa xác định',
);

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : vnDateString(date);
};

const isImageDoc = (doc: SkillVerificationDocument) => {
  const mime = (doc.mimeType || '').toLowerCase();
  const name = (doc.fileName || '').toLowerCase();
  return (
    mime.startsWith('image/') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  );
};

const documentUrls = ref<Record<string, string>>({});
const isLoadingUrls = ref(false);

watch(
  () => [props.open, props.verification?.id],
  async ([isOpen]) => {
    if (isOpen && props.verification) {
      isLoadingUrls.value = true;
      documentUrls.value = {};
      const promises = props.verification.documents.map(async (doc) => {
        if (doc.id) {
          try {
            const { signedUrl } = await adminSkillVerificationsApi.getDocumentAccess(
              props.verification!.id,
              doc.id,
            );
            documentUrls.value[doc.id] = signedUrl;
          } catch (e) {
            console.error('Failed to load document access URL:', e);
          }
        }
      });
      await Promise.all(promises);
      isLoadingUrls.value = false;
    } else {
      documentUrls.value = {};
    }
  },
  { immediate: true },
);

const handleApprove = () => {
  if (props.verification) {
    emit('approve', props.verification);
  }
};

const handleReject = () => {
  if (props.verification) {
    emit('reject', props.verification);
  }
};

const handlePreview = (title: string, documentId: string) => {
  emit('preview', title, documentId);
};
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="fixed inset-0 z-50 flex justify-end">
      <!-- Backdrop -->
      <div 
        class="absolute inset-0 bg-black/50 backdrop-blur-sm drawer-backdrop" 
        @click="close"
      ></div>
      
      <!-- Panel -->
      <div
        class="relative w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col drawer-panel"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div class="flex flex-col">
            <h2 class="text-xl font-bold text-gray-900 flex items-center gap-2">
              Hồ sơ kỹ thuật viên
            </h2>
            <p class="flex flex-wrap items-center gap-2 text-sm text-gray-500 font-medium">
              {{ technician?.fullName || 'Kỹ thuật viên' }}
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                :class="{
                  'bg-amber-100 text-amber-700': verification?.status === 'PENDING',
                  'bg-green-100 text-green-700': verification?.status === 'VERIFIED',
                  'bg-red-100 text-red-700': verification?.status === 'REJECTED'
                }"
              >
                {{ statusText }}
              </span>
            </p>
          </div>
          <button
            type="button"
            class="p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Đóng"
            @click="close"
          >
            <X :size="24" />
          </button>
        </div>

        <!-- Body -->
        <div v-if="verification" class="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
          
          <!-- 1. Thông tin kỹ thuật viên -->
          <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
              <User class="text-brand-600" :size="20" />
              Thông tin kỹ thuật viên
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <p class="text-xs text-gray-500 font-medium mb-1">Họ và tên</p>
                <p class="text-sm font-semibold text-gray-900">{{ technician?.fullName || '—' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium mb-1">Email</p>
                <p class="text-sm font-semibold text-gray-900">{{ technician?.email || '—' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium mb-1">Dịch vụ / Kỹ năng</p>
                <p class="text-sm font-semibold text-brand-700">{{ verification.serviceName || '—' }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium mb-1">Ngày gửi yêu cầu</p>
                <p class="text-sm font-semibold text-gray-900">{{ formatDate(verification.submittedAt) }}</p>
              </div>
              <div v-if="verification.reviewedAt">
                <p class="text-xs text-gray-500 font-medium mb-1">Ngày xét duyệt</p>
                <p class="text-sm font-semibold text-gray-900">{{ formatDate(verification.reviewedAt) }}</p>
              </div>
            </div>
          </section>

          <!-- 2. Giấy tờ xác minh / Chứng chỉ -->
          <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
              <FileBadge class="text-brand-600" :size="20" />
              Giấy tờ xác minh
            </h3>
            
            <div v-if="verification.documents.length === 0" class="text-center py-6 text-gray-400">
              <FileText :size="36" class="mx-auto mb-2 text-gray-300" />
              <p class="text-sm italic">Chưa có chứng chỉ hoặc tài liệu nào được gửi kèm.</p>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-2">
              <div
                v-for="doc in verification.documents"
                :key="doc.id"
                class="space-y-2"
              >
                <p class="text-xs font-semibold text-gray-600 text-center truncate px-1" :title="doc.fileName">
                  {{ doc.issuedById ? 'Chứng chỉ FixHome cấp' : (doc.fileName || 'Chứng chỉ chuyên môn') }}
                </p>
                <button 
                  type="button"
                  class="w-full aspect-[1.6/1] bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  :disabled="!doc.id"
                  :title="doc.fileName ? `Nhấn để xem lớn: ${doc.fileName}` : 'Xem chứng chỉ'"
                  @click="handlePreview(doc.fileName, doc.id)"
                >
                  <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                    <Loader2 class="animate-spin text-brand-500" :size="24" />
                  </div>
                  <template v-else-if="documentUrls[doc.id]">
                    <img
                      v-if="isImageDoc(doc)"
                      :src="documentUrls[doc.id]"
                      :alt="doc.fileName"
                      class="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform"
                    />
                    <div v-else class="flex flex-col items-center gap-2">
                      <FileText class="text-brand-500 group-hover:scale-110 transition-transform" :size="32" />
                      <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <div v-else class="flex flex-col items-center gap-2">
                    <FileBadge class="text-brand-500 group-hover:scale-110 transition-transform" :size="32" />
                    <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                  </div>
                </button>
              </div>
            </div>
          </section>

          <!-- 3. Chuyên môn -->
          <section class="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
              <Briefcase class="text-brand-600" :size="20" />
              Chuyên môn
            </h3>
            
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-gray-500 mb-2">Dịch vụ đăng ký xét duyệt</p>
                <div class="flex flex-wrap gap-2">
                  <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-800 text-sm font-semibold rounded-lg border border-gray-200">
                    {{ verification.serviceName || 'Dịch vụ' }}
                    <span class="text-xs font-normal text-gray-500 bg-white px-1.5 rounded border border-gray-200">Đăng ký duyệt</span>
                  </span>
                </div>
              </div>

              <!-- Lý do từ chối nếu có -->
              <div
                v-if="verification.status === 'REJECTED' && verification.rejectionReason"
                class="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5"
              >
                <AlertCircle :size="18" class="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong class="font-semibold">Lý do từ chối:</strong>
                  <p class="mt-0.5 leading-relaxed">{{ verification.rejectionReason }}</p>
                </div>
              </div>
            </div>
          </section>
          
        </div>

        <!-- Footer Actions -->
        <div
          v-if="verification?.status === 'PENDING'"
          class="p-6 bg-white border-t border-gray-100 shrink-0 flex items-center justify-between"
        >
          <button 
            type="button"
            class="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors focus:ring-4 focus:ring-gray-100"
            @click="close"
          >
            Đóng
          </button>
          <div class="flex gap-3">
            <button 
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors focus:ring-4 focus:ring-red-50"
              :disabled="loadingApprove"
              @click="handleReject"
            >
              <XCircle :size="18" />
              Từ chối
            </button>
            <button 
              type="button"
              class="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-colors focus:ring-4 focus:ring-green-100 shadow-sm disabled:opacity-70"
              :disabled="loadingApprove"
              @click="handleApprove"
            >
              <Loader2 v-if="loadingApprove" class="animate-spin" :size="18" />
              <CheckCircle2 v-else :size="18" />
              Duyệt hồ sơ
            </button>
          </div>
        </div>
        <div v-else class="p-6 bg-white border-t border-gray-100 shrink-0 flex items-center justify-end">
          <button 
            type="button"
            class="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors focus:ring-4 focus:ring-gray-100"
            @click="close"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(100%);
}
</style>
