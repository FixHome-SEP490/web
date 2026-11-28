<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { consoleField, consoleTextarea } from './console-ui';
import { partRequestsApi, type PartRequest, type PartRequestItem } from '../../api/part-requests.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';

const props = defineProps<{ request: PartRequest | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', request: PartRequest): void }>();

const open = computed(() => !!props.request);
const quantities = reactive<Record<string, number>>({});
const note = ref('');
const submitting = ref(false);
const error = ref('');

/** A line can take more units only before it goes to the manufacturer. */
const missing = (item: PartRequestItem) => item.quantity - (item.faultyReceivedQty ?? 0);
const lines = computed(() => (props.request?.items ?? []).filter((item) => ['awaiting', 'partial'].includes(item.faultyStatus ?? 'awaiting') && missing(item) > 0));
const total = computed(() => lines.value.reduce((sum, item) => sum + (quantities[item.id] || 0), 0));

watch(open, (isOpen) => {
  if (!isOpen) return;
  for (const key of Object.keys(quantities)) delete quantities[key];
  // The usual case is everything arrived: start from the full count and let the manager lower it.
  for (const item of lines.value) quantities[item.id] = missing(item);
  note.value = '';
  error.value = '';
}, { immediate: true });

function close() {
  if (!submitting.value) emit('close');
}

function clamp(item: PartRequestItem, value: number) {
  quantities[item.id] = Math.min(Math.max(Math.trunc(Number(value) || 0), 0), missing(item));
}

async function submit() {
  if (!props.request || submitting.value) return;
  const items = lines.value.filter((item) => quantities[item.id] > 0).map((item) => ({ itemId: item.id, quantity: quantities[item.id] }));
  if (!items.length) {
    error.value = 'Nhập số lượng đã nhận cho ít nhất một linh kiện.';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    emit('done', await partRequestsApi.receiveFaultyParts(props.request.id, { items, ...(note.value.trim() ? { note: note.value.trim() } : {}) }));
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Chưa lưu được xác nhận nhận. Vui lòng thử lại.');
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
        aria-labelledby="faulty-receive-title"
        class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 max-w-lg w-full p-6 space-y-4 shadow-(--shadow-e3) max-h-[90dvh] overflow-y-auto overscroll-contain"
      >
        <div class="flex items-center justify-between border-b border-ink-100 pb-3">
          <h3 id="faulty-receive-title" class="text-base font-bold text-ink-900">Xác nhận đã nhận linh kiện hỏng</h3>
          <button type="button" class="rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="close"><X :size="18" /></button>
        </div>

        <p class="text-xs text-ink-600">Nhập số lượng thực tế đã nhận ở kho cho từng linh kiện. Phần chưa nhận có thể xác nhận bổ sung sau.</p>

        <ul class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-200">
          <li v-for="item in lines" :key="item.id" class="flex items-center justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0">
              <div class="break-words text-sm font-semibold text-ink-900">{{ item.partNameSnapshot }}</div>
              <div class="font-num text-xs text-ink-500">Đã nhận {{ item.faultyReceivedQty ?? 0 }}/{{ item.quantity }}, còn thiếu {{ missing(item) }}</div>
            </div>
            <label class="flex shrink-0 items-center gap-2 text-xs text-ink-600">
              <span class="sr-only">Số lượng nhận thêm của {{ item.partNameSnapshot }}</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                :max="missing(item)"
                :value="quantities[item.id]"
                :class="[consoleField, 'w-20 text-center font-num']"
                @input="clamp(item, Number(($event.target as HTMLInputElement).value))"
              />
              <span class="font-num">/ {{ missing(item) }}</span>
            </label>
          </li>
        </ul>

        <div class="space-y-1">
          <label for="faulty-receive-note" class="text-xs font-medium text-ink-700">Ghi chú (không bắt buộc)</label>
          <textarea id="faulty-receive-note" v-model="note" rows="2" maxlength="500" :class="consoleTextarea"></textarea>
        </div>

        <Transition name="fh-fade-slide">
          <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">{{ error }}</p>
        </Transition>

        <div class="flex gap-2 border-t border-ink-100 pt-3">
          <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting" @click="close">Đóng</FhButton>
          <FhButton variant="primary" size="sm" class="flex-1" :loading="submitting" :disabled="submitting || total < 1" @click="submit">
            Xác nhận đã nhận {{ total }}
          </FhButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
