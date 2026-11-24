<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  X,
  CheckCircle2,
  XCircle,
  User,
  Award,
  FileText,
  Loader2,
  AlertCircle,
  Wrench,
  Maximize2,
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
  <Transition name="fh-drawer">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex justify-end bg-ink-950/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-drawer-title"
      @click.self="close"
      @keydown.esc="close"
    >
      <div
        class="fh-drawer-panel relative flex h-full w-full max-w-[540px] flex-col border-l border-ink-100 bg-white shadow-2xl"
      >
        <!-- Drawer Header -->
        <header class="flex items-start justify-between gap-3 border-b border-ink-100 bg-white px-6 py-5 shrink-0">
          <div class="min-w-0">
            <h2 id="skill-drawer-title" class="text-base font-bold text-ink-900 sm:text-lg">
              Hồ sơ kỹ thuật viên
            </h2>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium">
              <span class="truncate font-semibold text-ink-800">{{ technician?.fullName || 'Kỹ thuật viên' }}</span>
              <span
                class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                :class="{
                  'border-amber-200/80 bg-amber-50 text-amber-700': verification?.status === 'PENDING',
                  'border-emerald-200/80 bg-emerald-50 text-emerald-700': verification?.status === 'VERIFIED',
                  'border-ink-200 bg-ink-50 text-ink-700': verification?.status === 'REJECTED'
                }"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="{
                    'bg-amber-500': verification?.status === 'PENDING',
                    'bg-emerald-500': verification?.status === 'VERIFIED',
                    'bg-ink-400': verification?.status === 'REJECTED'
                  }"
                ></span>
                <span>{{ statusText }}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            class="cursor-pointer rounded-xl p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
            aria-label="Đóng"
            @click="close"
          >
            <X :size="20" />
          </button>
        </header>

        <!-- Drawer Body -->
        <div v-if="verification" class="flex-1 overflow-y-auto overscroll-contain px-6 py-6 space-y-6 text-sm">
          <!-- Rejection alert banner if rejected -->
          <Transition name="fh-fade-slide">
            <div
              v-if="verification.status === 'REJECTED' && verification.rejectionReason"
              class="rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5"
            >
              <AlertCircle :size="18" class="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong class="font-semibold">Lý do từ chối:</strong>
                <p class="mt-0.5 leading-relaxed">{{ verification.rejectionReason }}</p>
              </div>
            </div>
          </Transition>

          <!-- 1. Thông tin kỹ thuật viên -->
          <section class="space-y-3.5">
            <div class="flex items-center gap-2 border-b border-ink-100 pb-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <User :size="15" :stroke-width="2.2" />
              </div>
              <h3 class="text-sm font-bold tracking-tight text-ink-900">Thông tin kỹ thuật viên</h3>
            </div>

            <div class="divide-y divide-ink-100 text-xs sm:text-sm">
              <div class="flex justify-between items-center py-2.5">
                <span class="text-ink-500">Họ và tên</span>
                <span class="font-bold text-ink-900 text-right">{{ technician?.fullName || '—' }}</span>
              </div>
              <div class="flex justify-between items-center py-2.5">
                <span class="text-ink-500">Email</span>
                <span class="font-medium text-ink-800 text-right break-all">{{ technician?.email || '—' }}</span>
              </div>
              <div class="flex justify-between items-center py-2.5">
                <span class="text-ink-500">Dịch vụ / Kỹ năng</span>
                <span class="font-bold text-brand-600 text-right">{{ verification.serviceName || '—' }}</span>
              </div>
              <div class="flex justify-between items-center py-2.5">
                <span class="text-ink-500">Ngày gửi yêu cầu</span>
                <span class="font-num font-medium text-ink-800 text-right">{{ formatDate(verification.submittedAt) }}</span>
              </div>
              <div v-if="verification.reviewedAt" class="flex justify-between items-center py-2.5">
                <span class="text-ink-500">Ngày xét duyệt</span>
                <span class="font-num font-medium text-ink-800 text-right">{{ formatDate(verification.reviewedAt) }}</span>
              </div>
            </div>
          </section>

          <!-- 2. Giấy tờ xác minh -->
          <section class="space-y-3.5">
            <div class="flex items-center gap-2 border-b border-ink-100 pb-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <FileText :size="15" :stroke-width="2.2" />
              </div>
              <h3 class="text-sm font-bold tracking-tight text-ink-900">Giấy tờ xác minh</h3>
            </div>

            <!-- Empty documents state matching Image 1 -->
            <div
              v-if="verification.documents.length === 0"
              class="rounded-2xl border border-dashed border-ink-200 bg-ink-25/50 py-9 px-4 text-center"
            >
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 mb-2.5">
                <FileText :size="24" :stroke-width="1.8" />
              </div>
              <p class="text-xs font-medium text-ink-500">
                Chưa có chứng chỉ hoặc tài liệu nào được gửi kèm.
              </p>
            </div>

            <!-- Has documents grid -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                v-for="doc in verification.documents"
                :key="doc.id"
                class="space-y-1.5"
              >
                <p class="text-xs font-medium text-ink-600 truncate px-0.5" :title="doc.fileName">
                  {{ doc.issuedById ? 'Chứng chỉ FixHome cấp' : (doc.fileName || 'Chứng chỉ chuyên môn') }}
                </p>
                <button
                  type="button"
                  class="group relative flex aspect-[1.5/1] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-ink-25 p-1 transition-all hover:border-brand-300 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
                  :disabled="!doc.id"
                  :title="doc.fileName ? `Nhấn để xem: ${doc.fileName}` : 'Xem chứng chỉ'"
                  @click="handlePreview(doc.fileName, doc.id)"
                >
                  <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                    <Loader2 class="animate-spin text-brand-600" :size="22" />
                  </div>
                  <template v-else-if="documentUrls[doc.id]">
                    <img
                      v-if="isImageDoc(doc)"
                      :src="documentUrls[doc.id]"
                      :alt="doc.fileName"
                      class="h-full w-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <div v-else class="flex flex-col items-center gap-1.5">
                      <FileText class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                      <span class="text-xs font-medium text-brand-700">Xem tài liệu</span>
                    </div>
                  </template>
                  <div v-else class="flex flex-col items-center gap-1.5">
                    <FileText class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                    <span class="text-xs font-medium text-brand-700">Xem tài liệu</span>
                  </div>
                  <div class="absolute inset-0 bg-ink-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 class="text-white drop-shadow-sm" :size="20" />
                  </div>
                </button>
              </div>
            </div>
          </section>

          <!-- 3. Chuyên môn -->
          <section class="space-y-3.5">
            <div class="flex items-center gap-2 border-b border-ink-100 pb-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Award :size="15" :stroke-width="2.2" />
              </div>
              <h3 class="text-sm font-bold tracking-tight text-ink-900">Chuyên môn</h3>
            </div>

            <div>
              <p class="text-xs font-medium text-ink-500 mb-2">Danh sách kỹ năng đề xuất</p>
              <div class="flex flex-wrap gap-2">
                <span class="inline-flex items-center gap-1.5 rounded-lg border border-brand-200/80 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-xs">
                  <Wrench :size="13" class="text-brand-600" />
                  <span>{{ verification.serviceName || 'Dịch vụ' }}</span>
                </span>
              </div>
            </div>
          </section>
        </div>

        <!-- Drawer Sticky Footer matching Image 1 -->
        <footer
          v-if="verification?.status === 'PENDING'"
          class="flex items-center justify-between gap-3 border-t border-ink-100 bg-white px-6 py-4 shrink-0 shadow-xs"
        >
          <button
            type="button"
            class="inline-flex h-9.5 items-center justify-center rounded-xl border border-ink-200 bg-white px-4.5 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
            @click="close"
          >
            Đóng
          </button>
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              class="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 cursor-pointer"
              :disabled="loadingApprove"
              @click="handleReject"
            >
              <XCircle :size="15" />
              <span>Từ chối</span>
            </button>
            <button
              type="button"
              class="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 cursor-pointer"
              :disabled="loadingApprove"
              @click="handleApprove"
            >
              <CheckCircle2 v-if="!loadingApprove" :size="15" />
              <Loader2 v-else class="animate-spin" :size="15" />
              <span>Duyệt hồ sơ</span>
            </button>
          </div>
        </footer>
        <footer v-else class="flex items-center justify-end border-t border-ink-100 bg-white px-6 py-4 shrink-0">
          <button
            type="button"
            class="inline-flex h-9.5 items-center justify-center rounded-xl border border-ink-200 bg-white px-5 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
            @click="close"
          >
            Đóng
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>