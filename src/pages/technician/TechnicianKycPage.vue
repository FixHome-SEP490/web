<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Camera, CheckCircle2, AlertCircle, ShieldCheck, X } from 'lucide-vue-next';
import { FhButton, FhCard, FhConfirmDialog, FhStatusPill } from '../../components';
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
    label: 'CCCD/CMND – Mặt trước',
    hint: 'Chọn ảnh có sẵn hoặc chụp mới',
    kind: 'image',
    file: null,
    previewUrl: null,
  },
  {
    key: 'back',
    documentType: 'citizen_id_back',
    label: 'CCCD/CMND – Mặt sau',
    hint: 'Chọn ảnh có sẵn hoặc chụp mới',
    kind: 'image',
    file: null,
    previewUrl: null,
  },
  {
    key: 'face',
    documentType: 'face_video',
    label: 'Video xác minh khuôn mặt',
    hint: 'Bấm để quay video (nhìn thẳng, quay trái, quay phải)',
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
      text: 'Không thể mở camera. Vui lòng cấp quyền truy cập camera cho trình duyệt và thử lại.',
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
      text: 'Trình duyệt này không hỗ trợ quay video. Vui lòng dùng Chrome hoặc Edge bản mới nhất.',
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
      text: (err as Error)?.message || 'Không thể nộp hồ sơ xác minh. Vui lòng thử lại.',
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
      text: 'Đã rút hồ sơ. Vui lòng nộp lại ảnh/video mới.',
    };
  } catch (err) {
    actionMessage.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể rút hồ sơ. Vui lòng thử lại.',
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

    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Xác minh danh tính (KYC)</h1>
      <p class="text-xs text-ink-500 mt-1">
        Nộp ảnh CCCD/CMND và một video ngắn xác minh khuôn mặt để hệ thống và quản trị viên xác minh danh tính trước khi nhận việc.
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
            <p v-if="verification.fptDecision === 'pass'" class="text-success-700">
              Hệ thống đã kiểm tra tự động và không phát hiện bất thường.
            </p>
            <ul class="list-disc list-inside text-ink-500">
              <li v-for="doc in verification.documents" :key="doc.documentType">
                {{ doc.fileName }}
              </li>
            </ul>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <FhButton variant="secondary" @click="showWithdrawConfirm = true">
            Nộp lại
          </FhButton>
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
                <span class="text-[10px] font-semibold px-2">
                  {{ slot.key === 'face' && cameraBusy ? 'Đang mở camera...' : slot.hint }}
                </span>
              </template>
            </button>
            <p class="text-xs font-semibold text-ink-800">{{ slot.label }}</p>
          </div>
        </div>

        <p class="text-[11px] text-ink-400 mt-4">
          Ảnh JPEG, PNG hoặc WebP tối đa 10MB mỗi ảnh; video xác minh khuôn mặt dài {{ RECORDING_TOTAL_SECONDS }} giây, tối đa 10MB.
        </p>

        <div class="mt-5 flex justify-end gap-3">
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
    >
      <div class="bg-white rounded-[var(--radius-md)] max-w-sm w-full p-4 shadow-xl space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-ink-900">Quay video xác minh khuôn mặt</h3>
          <button type="button" class="text-ink-400 hover:text-ink-700" @click="closeCamera">
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
            class="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-danger-600/90 px-2.5 py-1 text-[11px] font-semibold text-white"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {{ recordingSecondsLeft }}s
          </div>
        </div>

        <!-- Always-visible step guide, so the technician sees the sequence
             before recording starts, not only mid-recording. -->
        <div class="flex items-start justify-center gap-2">
          <div
            v-for="(phase, index) in RECORDING_PHASES"
            :key="phase.label"
            class="flex-1 flex flex-col items-center gap-1 text-center"
          >
            <div
              class="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors"
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
            </div>
            <span
              class="text-[10px] font-medium leading-tight"
              :class="recording && index === recordingPhaseIndex ? 'text-brand-700 font-bold' : 'text-ink-500'"
            >
              {{ phase.label }}
            </span>
          </div>
        </div>

        <p class="text-[11px] text-ink-500 text-center">
          <template v-if="recording">Giữ khuôn mặt trong khung hình, làm theo hướng dẫn phía trên.</template>
          <template v-else>
            Video {{ RECORDING_TOTAL_SECONDS }} giây, tự động chuyển hướng theo thứ tự trên. Đủ ánh sáng rồi bấm bắt đầu.
          </template>
        </p>

        <FhButton block :disabled="recording" @click="startRecording">
          {{ recording ? 'Đang quay...' : 'Bắt đầu quay' }}
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
