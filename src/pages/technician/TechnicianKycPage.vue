<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Camera, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-vue-next';
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
  capture?: 'user';
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
    hint: 'Bắt buộc chụp trực tiếp bằng camera',
    capture: 'user',
    file: null,
    previewUrl: null,
  },
]);

const frontInput = ref<HTMLInputElement | null>(null);
const backInput = ref<HTMLInputElement | null>(null);
const faceInput = ref<HTMLInputElement | null>(null);
const slotInputs: Record<KycSlot['key'], typeof frontInput> = {
  front: frontInput,
  back: backInput,
  face: faceInput,
};

const loading = ref(true);
const submitting = ref(false);
const verification = ref<MyVerification | null>(null);
const actionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

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

const triggerPick = (key: KycSlot['key']) => slotInputs[key].value?.click();

const onFileSelected = (key: KycSlot['key'], event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

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
    <input
      ref="faceInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      capture="user"
      class="hidden"
      @change="onFileSelected('face', $event)"
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
              @click="triggerPick(slot.key)"
            >
              <img
                v-if="slot.previewUrl"
                :src="slot.previewUrl"
                class="w-full h-full object-cover"
                alt=""
              />
              <template v-else>
                <Camera :size="24" />
                <span class="text-[10px] font-semibold px-2">{{ slot.hint }}</span>
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
  </div>
</template>
