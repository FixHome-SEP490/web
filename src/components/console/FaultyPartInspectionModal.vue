<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { partRequestsApi, type FaultyInspectionResult, type PartRequest } from '../../api/part-requests.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';

const props = defineProps<{ request: PartRequest | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', request: PartRequest): void }>();

const MIN_NOTE = 10;
const evidence = useEvidencePhotos();

const options: { value: FaultyInspectionResult; label: string; hint: string }[] = [
  { value: 'manufacturer', label: 'Lỗi nhà sản xuất', hint: 'FixHome chịu; giữ linh kiện để đổi trả nhà cung cấp' },
  { value: 'installation', label: 'Do lắp đặt', hint: 'Thợ trả tiền linh kiện mới theo giá bán' },
  { value: 'undetermined', label: 'Không xác định', hint: 'FixHome chịu' },
];

const result = ref<FaultyInspectionResult>('manufacturer');
const note = ref('');
const submitting = ref(false);
const error = ref('');

const open = computed(() => !!props.request);
const installation = computed(() => result.value === 'installation');

watch(open, (isOpen) => {
  if (!isOpen || !props.request) return;
  result.value = props.request.faultyInspectionResult ?? 'manufacturer';
  note.value = props.request.faultyInspectionNote ?? '';
  evidence.reset();
  error.value = '';
}, { immediate: true });

function close() {
  if (!submitting.value && !evidence.uploading.value) emit('close');
}

async function submit() {
  if (!props.request || submitting.value || evidence.uploading.value) return;
  if (installation.value && (note.value.trim().length < MIN_NOTE || !evidence.photos.value.length)) {
    error.value = `Kết luận do lắp đặt cần ghi chú (ít nhất ${MIN_NOTE} ký tự) và ít nhất một ảnh linh kiện hỏng.`;
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    emit('done', await partRequestsApi.recordFaultyInspection(props.request.id, {
      result: result.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
      ...(evidence.photos.value.length ? { evidenceRefs: evidence.urls() } : {}),
    }));
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Chưa lưu được kết quả kiểm tra. Vui lòng thử lại.');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4" @keydown.esc="close">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="faulty-inspection-title"
      class="bg-white rounded-[var(--radius-lg)] max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between">
        <h3 id="faulty-inspection-title" class="text-base font-bold text-ink-900">Kiểm tra linh kiện hỏng</h3>
        <button type="button" class="p-1 rounded-full hover:bg-ink-100" aria-label="Đóng" @click="close"><X :size="18" /></button>
      </div>

      <fieldset class="space-y-1.5">
        <label
          v-for="option in options"
          :key="option.value"
          class="flex items-start gap-2 p-2.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs cursor-pointer"
          :class="result === option.value ? 'border-brand-600 bg-brand-50' : ''"
        >
          <input v-model="result" type="radio" name="faulty-result" :value="option.value" class="mt-0.5" />
          <span><span class="font-medium text-ink-900">{{ option.label }}</span><br /><span class="text-ink-600">{{ option.hint }}</span></span>
        </label>
      </fieldset>

      <div class="space-y-1">
        <label for="faulty-note" class="text-xs font-medium text-ink-700">Ghi chú {{ installation ? '(bắt buộc)' : '(không bắt buộc)' }}</label>
        <textarea
          id="faulty-note"
          v-model="note"
          rows="3"
          maxlength="2000"
          class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
        ></textarea>
      </div>

      <div class="space-y-2">
        <span class="text-xs font-medium text-ink-700">Ảnh linh kiện hỏng {{ installation ? '(bắt buộc)' : '' }}</span>
        <div v-if="evidence.photos.value.length" class="flex flex-wrap gap-2">
          <div v-for="(photo, index) in evidence.photos.value" :key="photo.url" class="relative">
            <img :src="photo.url" :alt="photo.name" class="w-16 h-16 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
            <button
              type="button"
              class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-ink-300 flex items-center justify-center"
              :aria-label="`Bỏ ảnh ${photo.name}`"
              @click="evidence.remove(index)"
            ><X :size="12" /></button>
          </div>
        </div>
        <label
          class="inline-flex items-center gap-1.5 h-[36px] px-3 text-sm rounded-[var(--radius-sm)] border border-ink-300 cursor-pointer hover:bg-ink-50"
          :class="{ 'opacity-60 pointer-events-none': evidence.uploading.value || evidence.photos.value.length >= evidence.maxPhotos }"
        >
          <Camera :size="14" />
          {{ evidence.uploading.value ? 'Đang tải ảnh…' : 'Thêm ảnh' }}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="evidence.pick" />
        </label>
      </div>

      <p v-if="error || evidence.error.value" role="alert" class="text-xs text-danger-700">{{ error || evidence.error.value }}</p>

      <div class="flex gap-2 pt-2">
        <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting || evidence.uploading.value" @click="close">Đóng</FhButton>
        <FhButton variant="primary" size="sm" class="flex-1" :loading="submitting" :disabled="submitting || evidence.uploading.value" @click="submit">
          Lưu kết quả
        </FhButton>
      </div>
    </div>
  </div>
</template>
