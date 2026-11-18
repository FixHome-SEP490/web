<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  X,
  CheckCircle2,
  XCircle,
  User,
  FileBadge,
  Loader2,
  Image as ImageIcon,
  Video,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import type { TechnicianVerification } from '../../api/admin-verifications.api';
import { adminVerificationsApi } from '../../api/admin-verifications.api';

const props = defineProps<{
  open: boolean;
  verification: TechnicianVerification | null;
  loadingApprove?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'approve', verification: TechnicianVerification): void;
  (e: 'reject', verification: TechnicianVerification): void;
  (e: 'preview', title: string, url: string): void;
}>();

const close = () => {
  emit('update:open', false);
};

// Map document types to human readable formats and categorize them
const documents = computed(() => {
  if (!props.verification?.documents) return [];
  return props.verification.documents;
});

const frontIdDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'citizen_id_front'));
const backIdDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'citizen_id_back'));
const facePhotoDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'face_photo'));
const faceVideoDoc = computed(() => documents.value.find((d) => d.documentType.toLowerCase() === 'face_video'));

const technician = computed(() => props.verification?.technician);

// Profile fields read from the verification record the backend sends; a field it
// does not send stays null and the drawer shows a dash, never a made-up value.
const profileInfo = computed(() => {
  const v = props.verification;
  if (!v) return null;
  return {
    cccd: v.identityCardNumber || null,
    dob: v.dateOfBirth || null,
    gender: v.gender || null,
    yearsExperience: v.yearsExperience || null,
    skills: v.skills || [],
    bio: v.bio || null,
    address: v.address || null,
    serviceRadiusKm: v.serviceRadiusKm || null,
    serviceAreas: v.serviceAreas || [],
  };
});

const documentUrls = ref<Record<string, string>>({});
const isLoadingUrls = ref(false);

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.verification) {
    isLoadingUrls.value = true;
    documentUrls.value = {};
    const promises = props.verification.documents.map(async (doc) => {
      if (doc.id) {
        try {
          const url = await adminVerificationsApi.getDocumentAccess(props.verification!.id, doc.id);
          documentUrls.value[doc.id] = url;
        } catch (e) {
          console.error(e);
        }
      }
    });
    await Promise.all(promises);
    isLoadingUrls.value = false;
  } else {
    documentUrls.value = {};
  }
});

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
  // We emit the preview event to the parent so it can use its existing preview modal logic 
  // which calls the secure access API
  emit('preview', title, documentId);
};

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
};

const STATUS_TEXT: Record<string, string> = { PENDING: 'Đang chờ duyệt', VERIFIED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
const statusText = computed(() => STATUS_TEXT[String(props.verification?.status ?? '').toUpperCase()] ?? 'Trạng thái chưa xác định');
</script>

<template>
  <Transition name="fh-drawer">
    <div v-if="open" class="fixed inset-0 z-50 flex justify-end bg-ink-950/50" @click.self="close" @keydown.esc="close">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tech-verif-drawer-title"
        class="fh-drawer-panel relative flex h-full w-full max-w-2xl flex-col border-l border-ink-200/80 bg-white shadow-(--shadow-e3)"
      >
        <header class="flex items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/70 px-6 py-4 shrink-0">
          <div class="min-w-0">
            <h2 id="tech-verif-drawer-title" class="text-lg font-bold text-ink-900">
              Xác minh danh tính
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
          <!-- 1. Thông tin cá nhân & Pháp lý -->
          <section class="space-y-2.5">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <User class="text-brand-600" :size="17" />
              Thông tin cá nhân
            </h3>
            <dl class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40">
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Họ và tên đầy đủ</dt>
                <dd class="text-right font-semibold text-ink-900">{{ technician?.fullName || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Số CCCD / Định danh</dt>
                <dd class="font-num font-semibold text-ink-900">{{ profileInfo?.cccd || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Ngày sinh</dt>
                <dd class="font-num font-medium text-ink-900">{{ formatDate(profileInfo?.dob || '') }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Giới tính</dt>
                <dd class="font-medium text-ink-900">{{ profileInfo?.gender || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Số điện thoại</dt>
                <dd class="font-num font-semibold text-ink-900">{{ technician?.phoneNumber || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3 px-4 py-2.5">
                <dt class="text-ink-500">Email</dt>
                <dd class="break-all text-right font-medium text-ink-900">{{ technician?.email || '—' }}</dd>
              </div>
            </dl>
          </section>

          <!-- 2. Hồ sơ định danh eKYC -->
          <section class="space-y-2.5">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <FileBadge class="text-brand-600" :size="17" />
              Giấy tờ xác minh
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <!-- Mặt trước -->
              <div class="space-y-1.5">
                <p class="text-xs font-medium text-ink-600 text-center">CCCD mặt trước</p>
                <button
                  type="button"
                  class="group relative flex aspect-[1.6/1] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:cursor-default"
                  :disabled="!frontIdDoc?.id"
                  title="Nhấn để xem lớn"
                  @click="frontIdDoc?.id ? handlePreview('CCCD mặt trước', frontIdDoc.id) : null"
                >
                  <template v-if="frontIdDoc?.id">
                    <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                      <Loader2 class="animate-spin text-brand-500" :size="22" />
                    </div>
                    <img v-else-if="documentUrls[frontIdDoc.id]" :src="documentUrls[frontIdDoc.id]" alt="CCCD mặt trước" class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105" />
                    <div v-else class="flex flex-col items-center gap-1.5">
                      <ImageIcon class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                      <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <span v-else class="text-xs font-medium text-ink-400">Chưa tải lên</span>
                </button>
              </div>

              <!-- Mặt sau -->
              <div class="space-y-1.5">
                <p class="text-xs font-medium text-ink-600 text-center">CCCD mặt sau</p>
                <button
                  type="button"
                  class="group relative flex aspect-[1.6/1] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:cursor-default"
                  :disabled="!backIdDoc?.id"
                  title="Nhấn để xem lớn"
                  @click="backIdDoc?.id ? handlePreview('CCCD mặt sau', backIdDoc.id) : null"
                >
                  <template v-if="backIdDoc?.id">
                    <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                      <Loader2 class="animate-spin text-brand-500" :size="22" />
                    </div>
                    <img v-else-if="documentUrls[backIdDoc.id]" :src="documentUrls[backIdDoc.id]" alt="CCCD mặt sau" class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105" />
                    <div v-else class="flex flex-col items-center gap-1.5">
                      <ImageIcon class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                      <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <span v-else class="text-xs font-medium text-ink-400">Chưa tải lên</span>
                </button>
              </div>

              <!-- Chân dung / Video -->
              <div class="space-y-1.5">
                <p class="text-xs font-medium text-ink-600 text-center">Khuôn mặt</p>
                <button
                  type="button"
                  class="group relative flex aspect-[1.6/1] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-1 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:cursor-default"
                  :disabled="!facePhotoDoc?.id && !faceVideoDoc?.id"
                  title="Nhấn để xem lớn"
                  @click="(facePhotoDoc?.id || faceVideoDoc?.id) ? handlePreview('Xác minh khuôn mặt', (facePhotoDoc?.id || faceVideoDoc?.id) as string) : null"
                >
                  <template v-if="facePhotoDoc?.id || faceVideoDoc?.id">
                    <div v-if="isLoadingUrls" class="flex flex-col items-center gap-2">
                      <Loader2 class="animate-spin text-brand-500" :size="22" />
                    </div>
                    <template v-else-if="facePhotoDoc?.id && documentUrls[facePhotoDoc.id]">
                      <img :src="documentUrls[facePhotoDoc.id]" alt="Xác minh khuôn mặt" class="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover transition-transform duration-200 group-hover:scale-105" />
                    </template>
                    <template v-else-if="faceVideoDoc?.id && documentUrls[faceVideoDoc.id]">
                      <div class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[calc(var(--radius-sm)-2px)] bg-ink-950 transition-transform duration-200 group-hover:scale-105">
                        <Video class="text-white opacity-80 absolute z-10" :size="28" />
                        <video :src="documentUrls[faceVideoDoc.id]" class="h-full w-full object-cover opacity-50"></video>
                      </div>
                    </template>
                    <div v-else class="flex flex-col items-center gap-1.5">
                      <Video v-if="faceVideoDoc" class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                      <ImageIcon v-else-if="facePhotoDoc" class="text-brand-600 transition-transform duration-150 group-hover:scale-105" :size="28" />
                      <span class="text-xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <span v-else class="text-xs font-medium text-ink-400">Chưa tải lên</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Khớp khuôn mặt -->
          <section class="rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40 p-4 space-y-2">
            <h3 class="text-sm font-semibold text-ink-900">Khớp khuôn mặt</h3>
            <p v-if="verification?.faceMatchScore != null" class="text-sm text-ink-700">
              Độ tương thích giữa ảnh CCCD và ảnh chân dung: <strong class="font-num text-ink-900">{{ verification.faceMatchScore }}%</strong>.
              Điểm chỉ để tham khảo, bạn vẫn đối chiếu bằng mắt.
            </p>
            <p v-else class="text-sm text-ink-600">Chưa có điểm khớp khuôn mặt (hệ thống tắt tính năng hoặc không so sánh được). Hãy đối chiếu bằng mắt.</p>
            <p class="text-xs text-ink-500">
              Xác nhận danh tính chỉ để mời thợ lên trụ sở gặp trực tiếp. Kỹ năng, cấp độ và bằng cấp được duyệt riêng ở mục "Duyệt hồ sơ".
            </p>
          </section>
        </div>

        <footer v-if="verification?.status === 'PENDING'" class="flex items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/50 px-6 py-4 shrink-0">
          <FhButton variant="secondary" size="md" @click="close">Đóng</FhButton>
          <div class="flex items-center gap-2.5">
            <FhButton variant="danger" size="md" :disabled="loadingApprove" @click="handleReject">
              <XCircle :size="16" /> Từ chối
            </FhButton>
            <FhButton variant="primary" size="md" :loading="loadingApprove" :disabled="loadingApprove" @click="handleApprove">
              <CheckCircle2 v-if="!loadingApprove" :size="16" /> Xác nhận danh tính
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
