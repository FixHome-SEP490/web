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
import FhButton from '../FhButton.vue';
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
  <Transition name="fh-drawer">
    <div v-if="open" class="fixed inset-0 z-50 flex justify-end bg-ink-950/50" @click.self="close" @keydown.esc="close">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-drawer-title"
        class="fh-drawer-panel relative flex h-full w-full max-w-2xl flex-col border-l border-ink-200/80 bg-white shadow-(--shadow-e3)"
      >
        <header class="flex items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/70 px-6 py-4 shrink-0">
          <div class="min-w-0">
            <h2 id="skill-drawer-title" class="text-lg font-bold text-ink-900">
              Hồ sơ kỹ thuật viên
            </h2>
            <p class="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-600 font-medium">
              <span class="truncate">{{ technician?.fullName || 'Kỹ thuật viên' }}</span>
              <span
                class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                :class="{
                  'border-warning-200/80 bg-warning-50 text-warning-700': verification?.status === 'PENDING',
                  'border-success-200/80 bg-success-50 text-success-700': verification?.status === 'VERIFIED',
                  'border-danger-200/80 bg-danger-50 text-danger-700': verification?.status === 'REJECTED'
                }"
              >
                {{ statusText }}
              </span>
            </p>
          </div>
          <button
            type="button"
            class="rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
            aria-label="Đóng"
            @click="close"
          >
            <X :size="20" />
          </button>
        </header>

        <div v-if="verification" class="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6 text-sm">
          <Transition name="fh-fade-slide">
            <div
              v-if="verification.status === 'REJECTED' && verification.rejectionReason"
              class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800 flex items-start gap-2.5"
            >
              <AlertCircle :size="18" class="text-danger-600 shrink-0 mt-0.5" />
              <div>
                <strong class="font-semibold">Lý do từ chối:</strong>
                <p class="mt-0.5 leading-relaxed">{{ verification.rejectionReason }}</p>
              </div>
            </div>
          </Transition>

          <section class="space-y-2.5">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <User class="text-brand-600" :size="17" />
              Thông tin kỹ thuật viên
            </h3>
            <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40">
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Họ và tên</dt>
                <dd class="text-right font-semibold text-ink-900">{{ technician?.fullName || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Email</dt>
                <dd class="break-all text-right font-medium text-ink-900">{{ technician?.email || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Dịch vụ / Kỹ năng</dt>
                <dd class="text-right font-semibold text-brand-700">{{ verification.serviceName || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Ngày gửi yêu cầu</dt>
                <dd class="font-num font-medium text-ink-900">{{ formatDate(verification.submittedAt) }}</dd>
              </div>
              <div v-if="verification.reviewedAt" class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Ngày xét duyệt</dt>
                <dd class="font-num font-medium text-ink-900">{{ formatDate(verification.reviewedAt) }}</dd>
              </div>
            </dl>
          </section>

          <section class="space-y-2.5">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <FileBadge class="text-brand-600" :size="17" />
              Giấy tờ xác minh
            </h3>

            <div v-if="verification.documents.length === 0" class="rounded-[var(--radius-sm)] border border-ink-200/80 bg-ink-50/50 py-8 text-center text-ink-400">
              <FileText :size="32" class="mx-auto mb-2 text-ink-300" />
              <p class="text-sm">Chưa có chứng chỉ hoặc tài liệu nào được gửi kèm.</p>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div
                v-for="doc in verification.documents"
                :key="doc.id"
                class="space-y-1.5"
              >
                <p class="text-xs font-medium text-ink-600 text-center truncate px-1" :title="doc.fileName">
                  {{ doc.issuedById ? 'Chứng chỉ FixHome cấp' : (doc.fileName || 'Chứng chỉ chuyên môn') }}
                </p>
                <button
                  type="button"
                  class="group relative flex aspect-[1.6/1] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                  :disabled="!doc.id"
                  :title="doc.fileName ? `Nhấn để xem lớn: ${doc.fileName}` : 'Xem chứng chỉ'"
                  @click="handlePreview(doc.fileName, doc.id)"
                >
                  <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                    <Loader2 class="animate-spin text-brand-500" :size="22" />
                  </div>
                  <template v-else-if="documentUrls[doc.id]">
                    <img
                      v-if="isImageDoc(doc)"
                      :src="documentUrls[doc.id]"
                      :alt="doc.fileName"
                      class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <div v-else class="flex flex-col items-center gap-1.5">
                      <FileText class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                      <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <div v-else class="flex flex-col items-center gap-1.5">
                    <FileBadge class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                    <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                  </div>
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-2.5">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Briefcase class="text-brand-600" :size="17" />
              Chuyên môn
            </h3>
            <div class="rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40 p-4">
              <p class="text-xs font-medium text-ink-500 mb-2">Dịch vụ đăng ký xét duyệt</p>
              <div class="flex flex-wrap gap-2">
                <span class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-900">
                  {{ verification.serviceName || 'Dịch vụ' }}
                  <span class="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">Đăng ký duyệt</span>
                </span>
              </div>
            </div>
          </section>
        </div>

        <footer
          v-if="verification?.status === 'PENDING'"
          class="flex items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/50 px-6 py-4 shrink-0"
        >
          <FhButton variant="secondary" size="md" @click="close">Đóng</FhButton>
          <div class="flex items-center gap-2.5">
            <FhButton variant="danger" size="md" :disabled="loadingApprove" @click="handleReject">
              <XCircle :size="16" /> Từ chối
            </FhButton>
            <FhButton variant="primary" size="md" :loading="loadingApprove" :disabled="loadingApprove" @click="handleApprove">
              <CheckCircle2 v-if="!loadingApprove" :size="16" /> Duyệt hồ sơ
            </FhButton>
          </div>
        </footer>
        <footer v-else class="flex items-center justify-end border-t border-ink-100 bg-ink-50/50 px-6 py-4 shrink-0">
          <FhButton variant="secondary" size="md" @click="close">Đóng</FhButton>
        </footer>
      </div>
    </div>
  </Transition>
</template>
