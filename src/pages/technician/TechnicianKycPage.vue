<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Camera, CheckCircle2, AlertCircle, ShieldCheck, ShieldQuestion, X } from 'lucide-vue-next';
import { FhButton, FhCard, FhConfirmDialog, FhSkeleton } from '../../components';
import { userFacingError } from '../../utils/user-facing-error';
import {
  technicianVerificationApi,
  type KycDocumentType,
  type KycMimeType,
  type MyVerification,
  type SubmitDocumentPayload,
} from '../../api/technician-verification.api';

const ALLOWED_MIME_TYPES: KycMimeType[] = ['image/jpeg', 'image/png', 'image/webp', 'video/webm'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<KycMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'video/webm': 'webm',
};

// Liveness capture: one short video where the technician turns their head
// front -> left -> right, instead of 3 separate still photos — this is what
// FPT.AI's liveness/v3 endpoint (video + face-match) actually accepts.
const RECORDING_PHASES = [
  { label: 'Nhìn thẳng vào camera' },
  { label: 'Quay mặt sang trái' },
  { label: 'Quay mặt sang phải' },
] as const;
const PHASE_SECONDS = 2;
const RECORDING_TOTAL_SECONDS = RECORDING_PHASES.length * PHASE_SECONDS;

function pickSupportedVideoMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return (
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? null
  );
}

interface KycSlot {
  key: 'front' | 'back' | 'face';
  documentType: KycDocumentType;
  label: string;
  hint: string;
  kind: 'image' | 'video';
  file: File | null;
  previewUrl: string | null;
}

const slots = ref<KycSlot[]>([
  {
    key: 'front',
    documentType: 'citizen_id_front',
    label: 'CCCD mặt trước',
    hint: 'Chọn hoặc chụp ảnh',
    kind: 'image',
    file: null,
    previewUrl: null,
  },
  {
    key: 'back',
    documentType: 'citizen_id_back',
    label: 'CCCD mặt sau',
    hint: 'Chọn hoặc chụp ảnh',
    kind: 'image',
    file: null,
    previewUrl: null,
  },
  {
    key: 'face',
    documentType: 'face_video',
    label: 'Video khuôn mặt',
    hint: 'Bấm để quay video',
    kind: 'video',
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
const loadError = ref<string | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const showWithdrawConfirm = ref(false);
const withdrawing = ref(false);

// Live camera capture for the face liveness video (input[capture] silently
// falls back to a plain file picker on desktop browsers, so we drive
// getUserMedia/MediaRecorder ourselves to guarantee the camera actually opens).
const showCamera = ref(false);
const cameraBusy = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
let mediaStream: MediaStream | null = null;

const recording = ref(false);
const recordingSecondsLeft = ref(RECORDING_TOTAL_SECONDS);
const recordingPhaseIndex = computed(() =>
  Math.min(
    RECORDING_PHASES.length - 1,
    Math.floor((RECORDING_TOTAL_SECONDS - recordingSecondsLeft.value) / PHASE_SECONDS),
  ),
);
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingCompleted = false;
let phaseTimer: ReturnType<typeof setInterval> | null = null;

const showUploadForm = computed(
  () => !verification.value || verification.value.status === 'REJECTED',
);
const canSubmit = computed(() => slots.value.every((slot) => slot.file !== null));
const hasAnySelection = computed(() => slots.value.some((slot) => slot.file !== null));

/** What was submitted, in words rather than storage file names. */
const submittedDocuments = computed(() =>
  (verification.value?.documents ?? []).map(
    (doc) => slots.value.find((slot) => slot.documentType === doc.documentType)?.label ?? doc.fileName,
  ),
);

const loadVerification = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    verification.value = await technicianVerificationApi.getMyVerification();
  } catch (err) {
    loadError.value = userFacingError(err, 'Không thể tải trạng thái xác minh. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
};

onMounted(loadVerification);
onUnmounted(() => {
  stopPhaseTimer();
  stopCameraStream();
});

function stopCameraStream() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

function stopPhaseTimer() {
  if (phaseTimer) {
    clearInterval(phaseTimer);
    phaseTimer = null;
  }
  recording.value = false;
}

const applyFileToSlot = (key: KycSlot['key'], file: File) => {
  const slot = slots.value.find((s) => s.key === key);
  if (!slot) return;

  if (!ALLOWED_MIME_TYPES.includes(file.type as KycMimeType)) {
    actionMessage.value = {
      type: 'error',
      text:
        slot.kind === 'video'
          ? 'Không thể tạo video xác minh. Vui lòng thử lại.'
          : 'Chỉ nhận ảnh định dạng JPEG, PNG hoặc WebP.',
    };
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    actionMessage.value = {
      type: 'error',
      text:
        slot.kind === 'video'
          ? 'Video vượt quá 10MB. Vui lòng quay lại video ngắn hơn.'
          : 'Ảnh vượt quá 10MB. Vui lòng chọn ảnh khác.',
    };
    return;
  }

  if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
  actionMessage.value = null;
};

const triggerPick = (key: 'front' | 'back') => pickInputs[key].value?.click();

const resetSlots = () => {
  for (const slot of slots.value) {
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    slot.file = null;
    slot.previewUrl = null;
  }
  actionMessage.value = null;
};

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
      text: 'Không mở được camera. Hãy cho phép trình duyệt dùng camera rồi thử lại.',
    };
    stopCameraStream();
  } finally {
    cameraBusy.value = false;
  }
};

const closeCamera = () => {
  stopPhaseTimer();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  mediaRecorder = null;
  stopCameraStream();
  showCamera.value = false;
};

const startRecording = () => {
  if (!mediaStream || recording.value) return;
  const mimeType = pickSupportedVideoMimeType();
  if (!mimeType) {
    actionMessage.value = {
      type: 'error',
      text: 'Trình duyệt này không quay được video. Vui lòng dùng Chrome hoặc Edge mới nhất.',
    };
    closeCamera();
    return;
  }

  recordedChunks = [];
  recordingCompleted = false;
  recordingSecondsLeft.value = RECORDING_TOTAL_SECONDS;

  const recorder = new MediaRecorder(mediaStream, { mimeType });
  mediaRecorder = recorder;
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = recordingCompleted
      ? new Blob(recordedChunks, { type: 'video/webm' })
      : null;
    recordedChunks = [];
    closeCamera();
    if (blob) {
      applyFileToSlot('face', new File([blob], 'face-liveness.webm', { type: 'video/webm' }));
    }
  };

  recorder.start();
  recording.value = true;
  phaseTimer = setInterval(() => {
    recordingSecondsLeft.value -= 1;
    if (recordingSecondsLeft.value <= 0) {
      stopPhaseTimer();
      recordingCompleted = true;
      recorder.stop();
    }
  }, 1000);
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
      text: userFacingError(err, 'Không thể nộp hồ sơ xác minh. Vui lòng thử lại.'),
    };
  } finally {
    submitting.value = false;
  }
};

const confirmWithdraw = async () => {
  if (withdrawing.value) return;
  withdrawing.value = true;
  try {
    await technicianVerificationApi.withdraw();
    verification.value = null;
    resetSlots();
    actionMessage.value = {
      type: 'success',
      text: 'Đã rút hồ sơ. Vui lòng nộp lại ảnh và video mới.',
    };
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: userFacingError(err, 'Không thể rút hồ sơ. Vui lòng thử lại.'),
    };
  } finally {
    withdrawing.value = false;
    showWithdrawConfirm.value = false;
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

    <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight text-balance">Xác minh danh tính</h1>

    <div
      v-if="actionMessage"
      :role="actionMessage.type === 'error' ? 'alert' : 'status'"
      class="px-4 py-3 rounded-2xl text-sm font-medium flex items-start gap-2"
      :class="actionMessage.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-700 border border-danger-200'"
    >
      <CheckCircle2 v-if="actionMessage.type === 'success'" :size="18" class="text-success-600 shrink-0" />
      <AlertCircle v-else :size="18" class="text-danger-600 shrink-0" />
      <span class="min-w-0 text-pretty">{{ actionMessage.text }}</span>
    </div>

    <!-- Loading: shaped like the status card -->
    <FhCard v-if="loading" aria-busy="true" aria-label="Đang tải trạng thái xác minh">
      <div class="flex items-start gap-3">
        <FhSkeleton width="24px" height="24px" rounded="full" />
        <div class="flex-1 space-y-2">
          <FhSkeleton width="200px" height="20px" />
          <FhSkeleton width="70%" height="14px" />
        </div>
      </div>
    </FhCard>

    <!-- Status failed to load -->
    <div
      v-else-if="loadError"
      class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 flex items-center gap-3"
    >
      <AlertCircle :size="18" class="shrink-0 text-danger-600" />
      <p class="min-w-0 flex-1 text-sm font-medium">{{ loadError }}</p>
      <FhButton variant="secondary" size="sm" @click="loadVerification">Thử lại</FhButton>
    </div>

    <template v-else>
      <!-- Pending: already submitted, waiting for review -->
      <FhCard v-if="verification?.status === 'PENDING'">
        <div class="flex items-start gap-3">
          <ShieldQuestion :size="22" class="text-warning-600 shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1 space-y-1">
            <h2 class="text-lg font-semibold text-ink-900">Hồ sơ đang chờ duyệt</h2>
            <p class="text-sm text-ink-600 text-pretty">Quản trị viên đang xác minh hồ sơ của bạn. Vui lòng quay lại sau.</p>
            <p v-if="verification.fptDecision === 'pass'" class="text-sm text-success-700">
              Kiểm tra tự động không phát hiện bất thường.
            </p>
            <p v-if="submittedDocuments.length" class="text-sm text-ink-500">
              Đã nộp: {{ submittedDocuments.join(', ') }}
            </p>
          </div>
        </div>
        <div class="mt-5 pt-4 border-t border-ink-100 flex justify-end">
          <FhButton variant="secondary" @click="showWithdrawConfirm = true">Nộp lại</FhButton>
        </div>
      </FhCard>

      <!-- Verified -->
      <FhCard v-else-if="verification?.status === 'VERIFIED'">
        <div class="flex items-start gap-3">
          <ShieldCheck :size="22" class="text-success-600 shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1 space-y-1">
            <h2 class="text-lg font-semibold text-ink-900">Đã xác minh danh tính</h2>
            <p class="text-sm text-ink-600">Bạn có thể nhận việc bình thường.</p>
          </div>
        </div>
      </FhCard>

      <!-- Rejected: the reason sits above the form to resubmit -->
      <div
        v-if="verification?.status === 'REJECTED'"
        role="alert"
        class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 flex items-start gap-3"
      >
        <AlertCircle :size="18" class="text-danger-600 shrink-0 mt-0.5" />
        <div class="min-w-0 text-sm space-y-0.5">
          <p class="font-semibold">Hồ sơ bị từ chối</p>
          <p class="text-pretty">{{ verification.rejectionReason || 'Ảnh không hợp lệ. Vui lòng nộp lại.' }}</p>
        </div>
      </div>

      <!-- Upload form: no verification yet, or rejected (resubmit) -->
      <FhCard v-if="showUploadForm" title="Nộp hồ sơ xác minh">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div v-for="slot in slots" :key="slot.key" class="space-y-2 text-center">
            <button
              type="button"
              class="w-full aspect-[4/3] rounded-[var(--radius-sm)] border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              :class="slot.file ? 'border-success-500 bg-success-50/50' : 'border-ink-300 hover:border-brand-500 text-ink-500'"
              :aria-label="slot.file ? `Đổi ${slot.label}` : slot.label"
              @click="slot.key === 'face' ? openCamera() : triggerPick(slot.key)"
            >
              <video
                v-if="slot.previewUrl && slot.kind === 'video'"
                :src="slot.previewUrl"
                class="w-full h-full object-cover"
                muted
                loop
                autoplay
                playsinline
              />
              <img
                v-else-if="slot.previewUrl"
                :src="slot.previewUrl"
                class="w-full h-full object-cover"
                alt=""
              />
              <template v-else>
                <Camera :size="24" />
                <span class="text-sm font-medium px-2">
                  {{ slot.key === 'face' && cameraBusy ? 'Đang mở camera…' : slot.hint }}
                </span>
              </template>
            </button>
            <p class="text-sm font-semibold text-ink-800 whitespace-nowrap">{{ slot.label }}</p>
          </div>
        </div>

        <p class="text-sm text-ink-500 mt-4 text-pretty">
          Ảnh JPEG, PNG hoặc WebP, tối đa 10 MB. Video dài {{ RECORDING_TOTAL_SECONDS }} giây.
        </p>

        <div class="mt-5 pt-4 border-t border-ink-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <FhButton
            v-if="hasAnySelection"
            variant="secondary"
            :disabled="submitting"
            @click="resetSlots"
          >
            Chọn lại
          </FhButton>
          <FhButton :disabled="!canSubmit" :loading="submitting" @click="handleSubmit">
            Nộp hồ sơ xác minh
          </FhButton>
        </div>
      </FhCard>
    </template>

    <!-- Live camera modal: records a short face liveness video -->
    <div
      v-if="showCamera"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4"
      @keydown.esc="!recording && closeCamera()"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kyc-camera-title"
        class="bg-white rounded-[var(--radius-md)] max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 shadow-xl space-y-3"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 id="kyc-camera-title" class="text-base font-bold text-ink-900">Quay video khuôn mặt</h3>
          <button
            type="button"
            class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Đóng"
            @click="closeCamera"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="relative">
          <video
            ref="videoEl"
            class="w-full aspect-[3/4] object-cover rounded-[var(--radius-sm)] bg-ink-950 scale-x-[-1]"
            autoplay
            playsinline
            muted
          />
          <div
            v-if="recording"
            class="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-danger-600/90 px-2.5 py-1 text-xs font-semibold text-white"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-white" />
            {{ recordingSecondsLeft }}s
          </div>
        </div>

        <!-- Always-visible step guide, so the technician sees the sequence
             before recording starts, not only mid-recording. -->
        <ol class="flex items-start justify-center gap-2">
          <li
            v-for="(phase, index) in RECORDING_PHASES"
            :key="phase.label"
            class="flex-1 flex flex-col items-center gap-1 text-center"
          >
            <span
              class="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors"
              :class="
                recording && index < recordingPhaseIndex
                  ? 'border-success-500 bg-success-500 text-white'
                  : recording && index === recordingPhaseIndex
                    ? 'border-brand-500 text-brand-600'
                    : 'border-ink-300 text-ink-400'
              "
            >
              <CheckCircle2 v-if="recording && index < recordingPhaseIndex" :size="14" />
              <span v-else>{{ index + 1 }}</span>
            </span>
            <span
              class="text-xs leading-tight text-balance"
              :class="recording && index === recordingPhaseIndex ? 'text-brand-700 font-bold' : 'text-ink-500 font-medium'"
            >
              {{ phase.label }}
            </span>
          </li>
        </ol>

        <p class="text-sm text-ink-500 text-center">
          {{ recording ? 'Giữ khuôn mặt trong khung hình.' : 'Đứng chỗ đủ sáng rồi bấm Bắt đầu quay.' }}
        </p>

        <FhButton block :disabled="recording" @click="startRecording">
          {{ recording ? 'Đang quay…' : 'Bắt đầu quay' }}
        </FhButton>
      </div>
    </div>

    <FhConfirmDialog
      :open="showWithdrawConfirm"
      :loading="withdrawing"
      title="Rút hồ sơ đang chờ duyệt?"
      consequence="Ảnh CCCD và video xác minh đã nộp sẽ bị xoá. Bạn cần nộp lại từ đầu."
      confirm-text="Rút và nộp lại"
      cancel-text="Quay lại"
      @confirm="confirmWithdraw"
      @cancel="showWithdrawConfirm = false"
    />
  </div>
</template>
