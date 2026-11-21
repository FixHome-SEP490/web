<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { consoleTextarea } from './console-ui';
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
  // The server takes an optional note only at 10 characters or more, whatever the result.
  const typed = note.value.trim().length;
  if (typed > 0 && typed < MIN_NOTE) {
    error.value = `Ghi chú cần ít nhất ${MIN_NOTE} ký tự, hoặc để trống.`;
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
  <Transition name="fh-modal">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4" @click.self="close" @keydown.esc="close">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="faulty-inspection-title"
        class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 max-w-lg w-full p-6 space-y-4 shadow-(--shadow-e3) max-h-[90dvh] overflow-y-auto overscroll-contain"
      >
        <div class="flex items-center justify-between border-b border-ink-100 pb-3">
          <h3 id="faulty-inspection-title" class="text-base font-bold text-ink-900">Kiểm tra linh kiện hỏng</h3>
          <button type="button" class="rounded-[var(--radius-sm)] p-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="close"><X :size="18" /></button>
        </div>

        <fieldset class="space-y-1.5">
          <label
            v-for="option in options"
            :key="option.value"
            class="flex items-start gap-2.5 p-3 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer"
            :class="result === option.value ? 'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'"
          >
            <input v-model="result" type="radio" name="faulty-result" :value="option.value" class="mt-0.5 accent-brand-600" />
            <span><span class="font-semibold text-ink-900">{{ option.label }}</span><br /><span class="text-ink-600">{{ option.hint }}</span></span>
          </label>
        </fieldset>

        <div class="space-y-1">
          <label for="faulty-note" class="text-xs font-medium text-ink-700">Ghi chú {{ installation ? '(bắt buộc)' : '(không bắt buộc)' }}</label>
          <textarea
            id="faulty-note"
            v-model="note"
            rows="3"
            maxlength="2000"
            :class="consoleTextarea"
          ></textarea>
        </div>

        <div class="space-y-2">
          <span class="text-xs font-medium text-ink-700">Ảnh linh kiện hỏng {{ installation ? '(bắt buộc)' : '' }}</span>
          <div v-if="evidence.photos.value.length" class="flex flex-wrap gap-2">
            <div v-for="(photo, index) in evidence.photos.value" :key="photo.url" class="relative">
              <img :src="photo.url" :alt="photo.name" class="w-16 h-16 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
              <button
                type="button"
                class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-ink-200 shadow-2xs flex items-center justify-center text-ink-600 transition-colors hover:bg-danger-50 hover:text-danger-700 cursor-pointer"
                :aria-label="`Bỏ ảnh ${photo.name}`"
                @click="evidence.remove(index)"
              ><X :size="12" /></button>
            </div>
          </div>
          <label
            class="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-ink-700 rounded-[var(--radius-sm)] border border-ink-200 bg-white transition-colors hover:bg-ink-50 cursor-pointer"
            :class="{ 'opacity-60 pointer-events-none': evidence.uploading.value || evidence.photos.value.length >= evidence.maxPhotos }"
          >
            <Camera :size="14" />
            {{ evidence.uploading.value ? 'Đang tải ảnh…' : 'Thêm ảnh' }}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="evidence.pick" />
          </label>
        </div>

        <Transition name="fh-fade-slide">
          <p v-if="error || evidence.error.value" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">{{ error || evidence.error.value }}</p>
        </Transition>

        <div class="flex gap-2 border-t border-ink-100 pt-3">
          <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting || evidence.uploading.value" @click="close">Đóng</FhButton>
          <FhButton variant="primary" size="sm" class="flex-1" :loading="submitting" :disabled="submitting || evidence.uploading.value" @click="submit">
            Lưu kết quả
          </FhButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
