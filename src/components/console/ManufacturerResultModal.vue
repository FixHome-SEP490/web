<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { consoleTextarea } from './console-ui';
import { partRequestsApi, type FaultyManufacturerResult, type PartRequest, type PartRequestItem } from '../../api/part-requests.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';
import { formatCurrencyVND } from '../../utils/formatters';

const props = defineProps<{ request: PartRequest | null; items: PartRequestItem[] }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', request: PartRequest): void }>();

const MIN_NOTE = 10;
const evidence = useEvidencePhotos();

const options: { value: FaultyManufacturerResult; label: string; hint: string }[] = [
  { value: 'accepted', label: 'Hãng chấp nhận', hint: 'Lỗi nhà sản xuất nên hãng bảo hành. Kỹ thuật viên không bị trừ ví.' },
  { value: 'rejected', label: 'Hãng từ chối', hint: 'Lỗi do lắp đặt nên hãng không bảo hành. Giá linh kiện đã nhận được trừ vào ví kỹ thuật viên.' },
];

const result = ref<FaultyManufacturerResult>('accepted');
const note = ref('');
const submitting = ref(false);
const error = ref('');

const open = computed(() => !!props.request && props.items.length > 0);
const rejected = computed(() => result.value === 'rejected');
const charge = computed(() => props.items.reduce((sum, item) => sum + Number(item.unitPriceSnapshot) * (item.faultyReceivedQty ?? 0), 0));

watch(open, (isOpen) => {
  if (!isOpen) return;
  result.value = 'accepted';
  note.value = '';
  evidence.reset();
  error.value = '';
}, { immediate: true });

function close() {
  if (!submitting.value && !evidence.uploading.value) emit('close');
}

async function submit() {
  if (!props.request || submitting.value || evidence.uploading.value) return;
  if (rejected.value && (note.value.trim().length < MIN_NOTE || !evidence.photos.value.length)) {
    error.value = `Hãng từ chối cần ghi chú (ít nhất ${MIN_NOTE} ký tự) và ít nhất một ảnh phản hồi của hãng.`;
    return;
  }
  const typed = note.value.trim().length;
  if (typed > 0 && typed < MIN_NOTE) {
    error.value = `Ghi chú cần ít nhất ${MIN_NOTE} ký tự, hoặc để trống.`;
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    emit('done', await partRequestsApi.recordFaultyResult(props.request.id, {
      itemIds: props.items.map((item) => item.id),
      result: result.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
      ...(evidence.photos.value.length ? { evidenceRefs: evidence.urls() } : {}),
    }));
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Chưa lưu được kết quả của hãng. Vui lòng thử lại.');
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
        aria-labelledby="manufacturer-result-title"
        class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 max-w-lg w-full p-6 space-y-4 shadow-(--shadow-e3) max-h-[90dvh] overflow-y-auto overscroll-contain"
      >
        <div class="flex items-center justify-between border-b border-ink-100 pb-3">
          <h3 id="manufacturer-result-title" class="text-base font-bold text-ink-900">Ghi kết quả của hãng</h3>
          <button type="button" class="rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="close"><X :size="18" /></button>
        </div>

        <p class="text-xs text-ink-600">
          Áp dụng cho: <span class="font-medium text-ink-900">{{ items.map((item) => `${item.partNameSnapshot} × ${item.faultyReceivedQty ?? 0}`).join(', ') }}</span>
        </p>

        <fieldset class="space-y-1.5">
          <legend class="sr-only">Kết quả của hãng</legend>
          <label
            v-for="option in options"
            :key="option.value"
            class="flex items-start gap-2.5 p-3 min-h-11 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer"
            :class="result === option.value ? 'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'"
          >
            <input v-model="result" type="radio" name="manufacturer-result" :value="option.value" class="mt-0.5 accent-brand-600" />
            <span><span class="font-semibold text-ink-900">{{ option.label }}</span><br /><span class="text-ink-600">{{ option.hint }}</span></span>
          </label>
        </fieldset>

        <p v-if="rejected" class="rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
          Ví kỹ thuật viên sẽ bị trừ <span class="font-num font-semibold">{{ formatCurrencyVND(charge) }}</span>. Kết quả chỉ ghi một lần.
        </p>

        <div class="space-y-1">
          <label for="manufacturer-note" class="text-xs font-medium text-ink-700">Ghi chú {{ rejected ? '(bắt buộc)' : '(không bắt buộc)' }}</label>
          <textarea id="manufacturer-note" v-model="note" rows="3" maxlength="2000" :class="consoleTextarea"></textarea>
        </div>

        <div class="space-y-2">
          <span class="text-xs font-medium text-ink-700">Ảnh phản hồi của hãng {{ rejected ? '(bắt buộc)' : '' }}</span>
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
            class="inline-flex items-center gap-1.5 min-h-11 px-3 text-sm font-medium text-ink-700 rounded-[var(--radius-sm)] border border-ink-200 bg-white transition-colors hover:bg-ink-50 cursor-pointer"
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
          <FhButton :variant="rejected ? 'danger' : 'primary'" size="sm" class="flex-1" :loading="submitting" :disabled="submitting || evidence.uploading.value" @click="submit">
            Lưu kết quả
          </FhButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
