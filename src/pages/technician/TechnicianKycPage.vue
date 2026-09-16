<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Camera, CheckCircle2, AlertCircle, ShieldCheck, X } from 'lucide-vue-next';
import { FhButton, FhCard, FhStatusPill } from '../../components';
import {
  technicianVerificationApi,
  type KycDocumentType,
  type KycMimeType,
  type MyVerification,
  type SubmitDocumentPayload,
} from '../../api/technician-verification.api';

const ALLOWED_MIME_TYPES: KycMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<KycMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface KycSlot {
  key: 'front' | 'back' | 'face';
  documentType: KycDocumentType;
  label: string;
  hint: string;
  file: File | null;
  previewUrl: string | null;
}

const slots = ref<KycSlot[]>([
  {
    key: 'front',
    documentType: 'citizen_id_front',
    label: 'CCCD/CMND – Mặt trước',
    hint: 'Chọn ảnh có sẵn hoặc chụp mới',
    file: null,
    previewUrl: null,
  },
  {
    key: 'back',
    documentType: 'citizen_id_back',
    label: 'CCCD/CMND – Mặt sau',
    hint: 'Chọn ảnh có sẵn hoặc chụp mới',
    file: null,
    previewUrl: null,
  },
  {
    key: 'face',
    documentType: 'face_photo',
    label: 'Ảnh chân dung',
    hint: 'Bấm để mở camera chụp trực tiếp',
    file: null,
    previewUrl: null,
  },
]);

const frontInput = ref<HTMLInputElement | null>(null);
const backInput = ref<HTMLInputElement | null>(null);
const pickInputs = { front: frontInput, back: backInput } as const;

const loading = ref(true);
const submitting = ref(false);
const verification = ref<MyVerification | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Live camera capture for the face photo (input[capture] silently falls back
// to a plain file picker on desktop browsers, so we drive getUserMedia
// ourselves to guarantee the camera actually opens).
const showCamera = ref(false);
const cameraBusy = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
let mediaStream: MediaStream | null = null;

const showUploadForm = computed(
  () => !verification.value || verification.value.status === 'REJECTED',
);
const canSubmit = computed(() => slots.value.every((slot) => slot.file !== null));

const loadVerification = async () => {
  loading.value = true;
  try {
    verification.value = await technicianVerificationApi.getMyVerification();
  } catch {
    actionMessage.value = {
      type: 'error',
      text: 'Không thể tải trạng thái xác minh. Vui lòng tải lại trang.',
    };
  } finally {
    loading.value = false;
  }
};

onMounted(loadVerification);
onUnmounted(() => stopCameraStream());

function stopCameraStream() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

const applyFileToSlot = (key: KycSlot['key'], file: File) => {
  if (!ALLOWED_MIME_TYPES.includes(file.type as KycMimeType)) {
    actionMessage.value = { type: 'error', text: 'Chỉ nhận ảnh định dạng JPEG, PNG hoặc WebP.' };
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    actionMessage.value = { type: 'error', text: 'Ảnh vượt quá 10MB. Vui lòng chọn ảnh khác.' };
    return;
  }

  const slot = slots.value.find((s) => s.key === key);
  if (!slot) return;
  if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
  actionMessage.value = null;
};

const triggerPick = (key: 'front' | 'back') => pickInputs[key].value?.click();

const onFileSelected = (key: 'front' | 'back', event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) applyFileToSlot(key, file);
};

const openCamera = async () => {
  actionMessage.value = null;
  cameraBusy.value = true;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    showCamera.value = true;
    await nextTick();
    if (videoEl.value) {
      videoEl.value.srcObject = mediaStream;
      await videoEl.value.play();
    }
  } catch {
    actionMessage.value = {
      type: 'error',
      text: 'Không thể mở camera. Vui lòng cấp quyền truy cập camera cho trình duyệt và thử lại.',
    };
    stopCameraStream();
  } finally {
    cameraBusy.value = false;
  }
};

const closeCamera = () => {
  stopCameraStream();
  showCamera.value = false;
};

const capturePhoto = () => {
  const video = videoEl.value;
  const canvas = canvasEl.value;
  if (!video || !canvas || video.videoWidth === 0) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        actionMessage.value = { type: 'error', text: 'Không thể chụp ảnh. Vui lòng thử lại.' };
        return;
      }
      applyFileToSlot('face', new File([blob], 'face-capture.jpg', { type: 'image/jpeg' }));
      closeCamera();
    },
    'image/jpeg',
    0.92,
  );
};

const uploadSlot = async (slot: KycSlot): Promise<SubmitDocumentPayload> => {
  const file = slot.file;
  if (!file) throw new Error(`Thiếu ảnh cho ${slot.label}`);
  const mimeType = file.type as KycMimeType;
  const { storageObjectPath, uploadUrl } = await technicianVerificationApi.requestUploadUrl(
    mimeType,
  );
  await technicianVerificationApi.uploadToSignedUrl(uploadUrl, mimeType, file);
  return {
    documentType: slot.documentType,
    storageObjectPath,
    fileName: `${slot.key}.${MIME_EXTENSIONS[mimeType]}`,
    fileSize: file.size,
    mimeType,
  };
};

const handleSubmit = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  actionMessage.value = null;
  try {
    const documents = await Promise.all(slots.value.map(uploadSlot));
    verification.value = await technicianVerificationApi.submit(documents);
    actionMessage.value = {
      type: 'success',
      text: 'Đã nộp hồ sơ xác minh. Vui lòng chờ quản trị viên duyệt.',
    };
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể nộp hồ sơ xác minh. Vui lòng thử lại.',
    };
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <input
      ref="frontInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      @change="onFileSelected('front', $event)"
    />
    <input
      ref="backInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      @change="onFileSelected('back', $event)"
    />

    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Xác minh danh tính (KYC)</h1>
      <p class="text-xs text-ink-500 mt-1">
        Nộp ảnh CCCD/CMND và ảnh chân dung để quản trị viên xác minh danh tính trước khi nhận việc.
      </p>
    </div>

    <div
      v-if="actionMessage"
      class="p-3.5 rounded-lg text-xs font-medium flex items-center gap-2"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <CheckCircle2 v-if="actionMessage.type === 'success'" :size="16" class="text-success-600 shrink-0" />
      <AlertCircle v-else :size="16" class="text-danger-600 shrink-0" />
      <span>{{ actionMessage.text }}</span>
    </div>

    <div v-if="loading" class="text-center py-16 text-ink-400 text-xs">Đang tải trạng thái xác minh...</div>

    <template v-else>
      <!-- Pending: already submitted, waiting for review -->
      <FhCard v-if="verification?.status === 'PENDING'" title="Hồ sơ đang chờ duyệt">
        <div class="flex items-start gap-3">
          <ShieldCheck :size="20" class="text-warning-600 shrink-0 mt-0.5" />
          <div class="space-y-2 text-xs text-ink-600">
            <FhStatusPill status="PENDING" />
            <p>
              Hồ sơ của bạn đã được nộp và đang chờ quản trị viên xác minh. Vui lòng quay lại sau.
            </p>
            <ul class="list-disc list-inside text-ink-500">
              <li v-for="doc in verification.documents" :key="doc.documentType">
                {{ doc.fileName }}
              </li>
            </ul>
          </div>
        </div>
      </FhCard>

      <!-- Verified -->
      <FhCard v-else-if="verification?.status === 'VERIFIED'" title="Đã xác minh danh tính">
        <div class="flex items-start gap-3">
          <ShieldCheck :size="20" class="text-success-600 shrink-0 mt-0.5" />
          <div class="space-y-2 text-xs text-ink-600">
            <FhStatusPill status="VERIFIED" />
            <p>Danh tính của bạn đã được xác minh. Bạn có thể nhận việc bình thường.</p>
          </div>
        </div>
      </FhCard>

      <!-- Rejected: show reason above the (re-openable) form -->
      <FhCard v-if="verification?.status === 'REJECTED'" title="Hồ sơ bị từ chối">
        <div class="flex items-start gap-3">
          <AlertCircle :size="20" class="text-danger-600 shrink-0 mt-0.5" />
          <div class="space-y-1 text-xs text-ink-600">
            <FhStatusPill status="REJECTED" />
            <p>{{ verification.rejectionReason || 'Ảnh không hợp lệ. Vui lòng nộp lại.' }}</p>
          </div>
        </div>
      </FhCard>

      <!-- Upload form: no verification yet, or rejected (resubmit) -->
      <FhCard v-if="showUploadForm" title="Nộp ảnh xác minh">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div v-for="slot in slots" :key="slot.key" class="space-y-2 text-center">
            <button
              type="button"
              class="w-full aspect-[4/3] rounded-[var(--radius-sm)] border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors overflow-hidden"
              :class="slot.file ? 'border-success-500 bg-success-50/50' : 'border-ink-300 hover:border-brand-500 text-ink-500'"
              @click="slot.key === 'face' ? openCamera() : triggerPick(slot.key)"
            >
              <img
                v-if="slot.previewUrl"
                :src="slot.previewUrl"
                class="w-full h-full object-cover"
                alt=""
              />
              <template v-else>
                <Camera :size="24" />
                <span class="text-[10px] font-semibold px-2">
                  {{ slot.key === 'face' && cameraBusy ? 'Đang mở camera...' : slot.hint }}
                </span>
              </template>
            </button>
            <p class="text-xs font-semibold text-ink-800">{{ slot.label }}</p>
          </div>
        </div>

        <p class="text-[11px] text-ink-400 mt-4">
          Ảnh JPEG, PNG hoặc WebP, tối đa 10MB mỗi ảnh.
        </p>

        <div class="mt-5 flex justify-end">
          <FhButton :disabled="!canSubmit" :loading="submitting" @click="handleSubmit">
            Nộp hồ sơ xác minh
          </FhButton>
        </div>
      </FhCard>
    </template>

    <!-- Live camera modal for the face photo -->
    <div
      v-if="showCamera"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4"
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-4 shadow-xl space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-ink-900">Chụp ảnh chân dung</h3>
          <button type="button" class="text-ink-400 hover:text-ink-700" @click="closeCamera">
            <X :size="18" />
          </button>
        </div>

        <video
          ref="videoEl"
          class="w-full aspect-[3/4] object-cover rounded-[var(--radius-sm)] bg-ink-950 scale-x-[-1]"
          autoplay
          playsinline
          muted
        />
        <canvas ref="canvasEl" class="hidden" />

        <p class="text-[11px] text-ink-500 text-center">
          Giữ khuôn mặt trong khung hình, đủ ánh sáng rồi bấm chụp.
        </p>

        <FhButton block @click="capturePhoto">Chụp ảnh</FhButton>
      </div>
    </div>
  </div>
</template>
