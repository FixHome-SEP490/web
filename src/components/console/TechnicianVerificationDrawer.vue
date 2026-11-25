<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  IdCard,
  CreditCard,
  ScanFace,
  Loader2,
  Image as ImageIcon,
  Video,
  Calendar,
  Maximize2,
} from 'lucide-vue-next';
import type { TechnicianVerification, VerificationDocument } from '../../api/admin-verifications.api';
import { adminVerificationsApi } from '../../api/admin-verifications.api';
import { useCanDecideReview } from '../../composables/useCanDecideReview';

const canDecide = useCanDecideReview();

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

const getDocUrl = (doc?: VerificationDocument | null) => {
  if (!doc) return '';
  if (doc.id && documentUrls.value[doc.id]) return documentUrls.value[doc.id];
  return doc.fileUrl || '';
};

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
  emit('preview', title, documentId);
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
};

const formatGender = (value?: string | null) => {
  if (!value) return '—';
  const g = value.toLowerCase();
  if (g === 'male' || g === 'nam') return 'Nam';
  if (g === 'female' || g === 'nu' || g === 'nữ') return 'Nữ';
  return value;
};

const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  VERIFIED: 'Đã xác nhận',
  REJECTED: 'Đã từ chối',
};

const statusText = computed(() => STATUS_TEXT[String(props.verification?.status ?? '').toUpperCase()] ?? 'Chưa xác định');
const isPending = (status: unknown) => String(status ?? '').toUpperCase() === 'PENDING';
const isVerified = (status: unknown) => String(status ?? '').toUpperCase() === 'VERIFIED';
const isRejected = (status: unknown) => String(status ?? '').toUpperCase() === 'REJECTED';

const recordCode = computed(() => {
  const v = props.verification;
  if (!v) return '—';
  return v.technician?.fullName || v.id || '—';
});
</script>

<template>
  <Transition name="fh-drawer">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex justify-end bg-ink-950/50 backdrop-blur-[2px]"
      @click.self="close"
      @keydown.esc="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tech-verif-drawer-title"
        class="fh-drawer-panel relative flex h-full w-full max-w-2xl flex-col border-l border-ink-200/80 bg-white shadow-(--shadow-e3)"
      >
        <!-- Header -->
        <header class="flex items-start justify-between gap-3 border-b border-ink-100 bg-white px-6 py-5 shrink-0">
          <div class="min-w-0 space-y-1">
            <h2 id="tech-verif-drawer-title" class="text-xl font-bold tracking-tight text-ink-900">
              Xác minh danh tính
            </h2>

            <!-- Name and Status badge -->
            <div class="flex flex-wrap items-center gap-2 pt-0.5">
              <span class="text-base font-bold text-ink-900 truncate">
                {{ technician?.fullName || 'Kỹ thuật viên' }}
              </span>
              <span
                v-if="isVerified(verification?.status)"
                class="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
              >
                <CheckCircle2 :size="13" class="text-emerald-600" />
                <span>{{ statusText }}</span>
              </span>
              <span
                v-else-if="isRejected(verification?.status)"
                class="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
              >
                <XCircle :size="13" class="text-rose-600" />
                <span>{{ statusText }}</span>
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
              >
                <Clock :size="13" class="text-amber-600" />
                <span>{{ statusText }}</span>
              </span>
            </div>

            <!-- Subtitle: Record Code & Date -->
            <div class="flex flex-wrap items-center gap-3 text-xs text-ink-500 pt-1">
              <div class="flex items-center gap-1.5 font-num">
                <IdCard :size="14" class="text-ink-400" />
                <span>Mã hồ sơ: <strong class="font-semibold text-ink-700">{{ recordCode }}</strong></span>
              </div>
              <span class="text-ink-300" aria-hidden="true">|</span>
              <div class="flex items-center gap-1.5 font-num">
                <Calendar :size="14" class="text-ink-400" />
                <span>Ngày gửi: <span class="text-ink-700">{{ formatDateTime(verification?.submittedAt) }}</span></span>
              </div>
            </div>
          </div>

          <!-- Close button -->
          <button
            type="button"
            class="rounded-xl p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
            aria-label="Đóng"
            @click="close"
          >
            <X :size="20" />
          </button>
        </header>

        <!-- Body content (Scrollable) -->
        <div v-if="verification" class="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6 text-sm">
          <!-- 1. Thông tin cá nhân -->
          <section class="space-y-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <User class="text-brand-600" :size="18" />
              <span>Thông tin cá nhân</span>
            </h3>
            <div class="divide-y divide-ink-100">
              <div class="flex items-center justify-between py-2 text-sm">
                <span class="text-ink-500">Họ và tên đầy đủ</span>
                <span class="font-semibold text-ink-900 text-right">{{ technician?.fullName || '—' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 text-sm">
                <span class="text-ink-500">Số CCCD / Định danh</span>
                <span class="font-num font-medium text-ink-900 text-right">{{ profileInfo?.cccd || '—' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 text-sm">
                <span class="text-ink-500">Ngày sinh</span>
                <span class="font-num font-medium text-ink-900 text-right">{{ formatDate(profileInfo?.dob) }}</span>
              </div>
              <div class="flex items-center justify-between py-2 text-sm">
                <span class="text-ink-500">Giới tính</span>
                <span class="font-medium text-ink-900 text-right">{{ formatGender(profileInfo?.gender) }}</span>
              </div>
              <div class="flex items-center justify-between py-2 text-sm">
                <span class="text-ink-500">Số điện thoại</span>
                <span class="font-num font-medium text-ink-900 text-right">{{ technician?.phoneNumber || '—' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 text-sm">
                <span class="text-ink-500">Email</span>
                <span class="font-medium text-ink-900 break-all text-right">{{ technician?.email || '—' }}</span>
              </div>
            </div>
          </section>

          <!-- 2. Giấy tờ xác minh -->
          <section class="space-y-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <IdCard class="text-brand-600" :size="18" />
              <span>Giấy tờ xác minh</span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <!-- CCCD mặt trước -->
              <div class="space-y-1.5">
                <div class="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                  <CreditCard class="text-brand-600" :size="14" />
                  <span>CCCD mặt trước</span>
                </div>
                <button
                  type="button"
                  class="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-100 transition-all hover:border-brand-400 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:cursor-default"
                  :disabled="!frontIdDoc?.id"
                  title="Nhấn để xem lớn"
                  @click="frontIdDoc?.id && handlePreview('CCCD mặt trước', frontIdDoc.id)"
                >
                  <template v-if="frontIdDoc?.id">
                    <div v-if="isLoadingUrls" class="flex h-full w-full items-center justify-center">
                      <Loader2 class="animate-spin text-brand-500" :size="20" />
                    </div>
                    <template v-else-if="getDocUrl(frontIdDoc)">
                      <img
                        :src="getDocUrl(frontIdDoc)"
                        alt="CCCD mặt trước"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div class="absolute inset-0 bg-ink-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 class="text-white drop-shadow-sm" :size="20" />
                      </div>
                    </template>
                    <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                      <ImageIcon :size="22" class="text-ink-300" />
                      <span class="text-2xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                    <ImageIcon :size="22" class="text-ink-300" />
                    <span class="text-2xs">Chưa tải lên</span>
                  </div>
                </button>
              </div>

              <!-- CCCD mặt sau -->
              <div class="space-y-1.5">
                <div class="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                  <CreditCard class="text-brand-600" :size="14" />
                  <span>CCCD mặt sau</span>
                </div>
                <button
                  type="button"
                  class="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-100 transition-all hover:border-brand-400 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:cursor-default"
                  :disabled="!backIdDoc?.id"
                  title="Nhấn để xem lớn"
                  @click="backIdDoc?.id && handlePreview('CCCD mặt sau', backIdDoc.id)"
                >
                  <template v-if="backIdDoc?.id">
                    <div v-if="isLoadingUrls" class="flex h-full w-full items-center justify-center">
                      <Loader2 class="animate-spin text-brand-500" :size="20" />
                    </div>
                    <template v-else-if="getDocUrl(backIdDoc)">
                      <img
                        :src="getDocUrl(backIdDoc)"
                        alt="CCCD mặt sau"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div class="absolute inset-0 bg-ink-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 class="text-white drop-shadow-sm" :size="20" />
                      </div>
                    </template>
                    <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                      <ImageIcon :size="22" class="text-ink-300" />
                      <span class="text-2xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                    <ImageIcon :size="22" class="text-ink-300" />
                    <span class="text-2xs">Chưa tải lên</span>
                  </div>
                </button>
              </div>

              <!-- Khuôn mặt -->
              <div class="space-y-1.5">
                <div class="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                  <User class="text-brand-600" :size="14" />
                  <span>Khuôn mặt</span>
                </div>
                <button
                  type="button"
                  class="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-100 transition-all hover:border-brand-400 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer disabled:cursor-default"
                  :disabled="!facePhotoDoc?.id && !faceVideoDoc?.id"
                  title="Nhấn để xem lớn"
                  @click="(facePhotoDoc?.id || faceVideoDoc?.id) && handlePreview('Xác minh khuôn mặt', (facePhotoDoc?.id || faceVideoDoc?.id) as string)"
                >
                  <template v-if="facePhotoDoc?.id || faceVideoDoc?.id">
                    <div v-if="isLoadingUrls" class="flex h-full w-full items-center justify-center">
                      <Loader2 class="animate-spin text-brand-500" :size="20" />
                    </div>
                    <template v-else-if="facePhotoDoc?.id && getDocUrl(facePhotoDoc)">
                      <img
                        :src="getDocUrl(facePhotoDoc)"
                        alt="Xác minh khuôn mặt"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div class="absolute inset-0 bg-ink-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 class="text-white drop-shadow-sm" :size="20" />
                      </div>
                    </template>
                    <template v-else-if="faceVideoDoc?.id && getDocUrl(faceVideoDoc)">
                      <div class="relative flex h-full w-full items-center justify-center overflow-hidden bg-ink-950">
                        <Video class="text-white opacity-80 absolute z-10" :size="24" />
                        <video :src="getDocUrl(faceVideoDoc)" class="h-full w-full object-cover opacity-60"></video>
                      </div>
                    </template>
                    <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                      <Video v-if="faceVideoDoc" class="text-brand-600" :size="22" />
                      <ImageIcon v-else class="text-brand-600" :size="22" />
                      <span class="text-2xs font-medium text-brand-700">Xem chi tiết</span>
                    </div>
                  </template>
                  <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
                    <ImageIcon :size="22" class="text-ink-300" />
                    <span class="text-2xs">Chưa tải lên</span>
                  </div>
                </button>
              </div>
            </div>
          </section>

          <!-- 3. Khớp khuôn mặt -->
          <section class="space-y-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <ScanFace class="text-brand-600" :size="18" />
              <span>Khớp khuôn mặt</span>
            </h3>

            <!-- Score available -->
            <div
              v-if="verification?.faceMatchScore != null"
              class="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 space-y-1"
            >
              <div class="flex items-center gap-2">
                <CheckCircle2 class="text-emerald-600 shrink-0" :size="18" />
                <span class="font-bold text-emerald-800 text-sm">
                  Độ tương thích: <span class="font-num">{{ verification.faceMatchScore }}%</span>
                </span>
              </div>
              <p class="text-xs text-ink-600 pl-6.5">
                Điểm chi tiết được tham khảo bằng cách so sánh ảnh CCCD và ảnh chân dung.
              </p>
            </div>

            <!-- Score not available -->
            <div
              v-else
              class="rounded-2xl border border-ink-200/80 bg-ink-50/70 p-4 space-y-1"
            >
              <div class="flex items-center gap-2">
                <Clock class="text-ink-500 shrink-0" :size="18" />
                <span class="font-semibold text-ink-700 text-sm">
                  Chưa có dữ liệu so khớp khuôn mặt
                </span>
              </div>
              <p class="text-xs text-ink-500 pl-6.5">
                Điểm AI chỉ mang tính tham khảo, Admin vui lòng kiểm tra giấy tờ và quyết định thủ công.
              </p>
            </div>
          </section>

          <!-- 4. Lý do từ chối (Chỉ hiện khi trạng thái là REJECTED) -->
          <section v-if="isRejected(verification?.status)" class="space-y-2.5">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-danger-700">
              <XCircle class="text-danger-600" :size="18" />
              <span>Lý do từ chối</span>
            </h3>

            <div class="rounded-2xl border border-danger-200/80 bg-danger-50/70 p-4">
              <p class="text-sm font-medium text-danger-900 leading-relaxed break-words whitespace-pre-wrap">
                {{ verification?.rejectionReason || 'Chưa có thông tin lý do từ chối.' }}
              </p>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <footer class="flex items-center justify-between gap-3 border-t border-ink-100 bg-white px-6 py-4 shrink-0">
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center rounded-xl border border-ink-200 bg-white px-4 text-xs font-semibold text-ink-700 shadow-xs transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer"
            @click="close"
          >
            Đóng
          </button>

          <!-- Action buttons when status is PENDING -->
          <div v-if="canDecide && isPending(verification?.status)" class="flex items-center gap-2.5">
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-danger-200 bg-danger-50 px-3.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-100 hover:border-danger-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 disabled:opacity-50 cursor-pointer"
              :disabled="loadingApprove"
              @click="handleReject"
            >
              <XCircle :size="15" />
              <span>Từ chối</span>
            </button>

            <button
              type="button"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 cursor-pointer"
              :disabled="loadingApprove"
              @click="handleApprove"
            >
              <Loader2 v-if="loadingApprove" class="animate-spin" :size="15" />
              <CheckCircle2 v-else :size="15" />
              <span>Xác nhận danh tính</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>
