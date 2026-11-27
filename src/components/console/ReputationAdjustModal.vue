<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Gauge,
  TriangleAlert,
  X,
} from 'lucide-vue-next';
import { FhButton } from '..';
import type { ReputationRow } from '../../api/reputation.api';
import {
  activeBanUntil,
  clampPoints,
  penaltyFor,
  REPUTATION_DELTA_MAX,
  REPUTATION_DELTA_MIN,
  REPUTATION_REASON_MAX,
  REPUTATION_REASON_MIN,
  REPUTATION_SUSPEND_THRESHOLD,
} from '../../utils/reputation-rules';
import { consoleField, consoleLabel, consoleTextarea } from './console-ui';

const props = defineProps<{
  account: ReputationRow | null;
  busy: boolean;
  submitError: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', payload: { delta: number; reason: string }): void;
}>();

const direction = ref<'add' | 'remove'>('add');
const amount = ref('10');
const reason = ref('');
const amountError = ref('');
const reasonError = ref('');

watch(
  () => props.account?.id,
  (id) => {
    if (!id) return;
    direction.value = 'add';
    amount.value = '10';
    reason.value = '';
    amountError.value = '';
    reasonError.value = '';
  },
  { immediate: true },
);

const parsedAmount = computed(() => {
  const n = Number(amount.value);
  return Number.isInteger(n) && n >= REPUTATION_DELTA_MIN && n <= REPUTATION_DELTA_MAX ? n : null;
});

const preview = computed(() => {
  if (!props.account || parsedAmount.value === null) return null;
  const delta = direction.value === 'add' ? parsedAmount.value : -parsedAmount.value;
  return clampPoints(props.account.reputationPoints + delta);
});

const previewOutcome = computed(() => {
  if (!props.account || preview.value === null) return null;
  const current = props.account.reputationPoints;
  const next = preview.value;
  if (next < current) {
    const pen = penaltyFor(next);
    if (pen.kind === 'lock') return { tone: 'danger' as const, text: 'Áp dụng: Khoá tài khoản do hết điểm' };
    if (pen.kind === 'suspend') return { tone: 'warning' as const, text: `Áp dụng: Tạm khoá ${pen.label}` };
    return null;
  }
  if (next >= REPUTATION_SUSPEND_THRESHOLD && activeBanUntil(props.account)) {
    return { tone: 'success' as const, text: 'Sẽ gỡ tạm khoá đang có sau khi lưu' };
  }
  return null;
});

const trimmedReasonLength = computed(() => reason.value.trim().length);

function validateAmount(): number | null {
  const value = Number(amount.value);
  if (!Number.isInteger(value) || value < REPUTATION_DELTA_MIN || value > REPUTATION_DELTA_MAX) {
    amountError.value = `Số điểm là số nguyên từ ${REPUTATION_DELTA_MIN} đến ${REPUTATION_DELTA_MAX}.`;
    return null;
  }
  amountError.value = '';
  return value;
}

function validateReason(): string | null {
  const why = reason.value.trim();
  if (why.length < REPUTATION_REASON_MIN) {
    reasonError.value = `Ghi lý do điều chỉnh, tối thiểu ${REPUTATION_REASON_MIN} ký tự.`;
    return null;
  }
  if (why.length > REPUTATION_REASON_MAX) {
    reasonError.value = `Lý do tối đa ${REPUTATION_REASON_MAX} ký tự.`;
    return null;
  }
  reasonError.value = '';
  return why;
}

function handleSubmit() {
  if (!props.account || props.busy) return;
  const value = validateAmount();
  const why = validateReason();
  if (value === null || why === null) return;
  emit('submit', {
    delta: direction.value === 'add' ? value : -value,
    reason: why,
  });
}

function handleClose() {
  if (props.busy) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div
        v-if="account"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reputation-adjust-title"
        @click.self="handleClose"
        @keydown.esc="handleClose"
      >
        <div class="fh-modal-panel flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-white shadow-(--shadow-e3)">
          <!-- Header -->
          <header class="flex shrink-0 items-start justify-between gap-3 border-b border-ink-200/80 px-6 py-4">
            <div class="flex min-w-0 items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-brand-50 text-brand-600">
                <Gauge :size="20" :stroke-width="1.75" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <h2 id="reputation-adjust-title" class="text-base font-bold text-ink-900">
                  Điều chỉnh điểm uy tín
                </h2>
                <p class="mt-0.5 truncate text-sm text-ink-600">
                  {{ account.fullName }} · Hiện tại <strong class="font-num font-semibold text-ink-900">{{ account.reputationPoints }}</strong>/100
                </p>
              </div>
            </div>
            <button
              type="button"
              :disabled="busy"
              class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Đóng"
              @click="handleClose"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </header>

          <!-- Form Body -->
          <form class="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm" @submit.prevent="handleSubmit">
            <!-- Rule Warning Box -->
            <div class="flex gap-3 rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 px-3.5 py-3 text-xs leading-relaxed text-warning-900">
              <TriangleAlert :size="18" class="mt-0.5 shrink-0 text-warning-600" aria-hidden="true" />
              <p>
                Nâng điểm lên từ <strong class="font-num">70</strong> trở lên sẽ gỡ tạm khoá đang có (tài khoản bị khoá vĩnh viễn ở mức <strong class="font-num">0</strong> điểm cần mở khoá riêng). Hạ xuống dưới <strong class="font-num">70</strong> sẽ áp dụng tạm khoá theo quy tắc hiện tại. Lý do được ghi vào lịch sử và gửi cho người dùng.
              </p>
            </div>

            <!-- Horizontal Direction Selector -->
            <fieldset :disabled="busy" class="space-y-1.5">
              <legend class="text-sm font-medium text-ink-700">Loại điều chỉnh</legend>
              <div class="grid grid-cols-2 gap-3 pt-1">
                <label
                  class="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3.5 py-2.5 transition-colors"
                  :class="direction === 'add' ? 'border-brand-600 bg-brand-50/70 text-ink-900 ring-1 ring-brand-600/20' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-25'"
                >
                  <input v-model="direction" type="radio" name="reputation-direction" value="add" class="sr-only" />
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600">
                    <ArrowUp :size="15" :stroke-width="2.25" aria-hidden="true" />
                  </span>
                  <span class="font-medium">Cộng điểm</span>
                </label>

                <label
                  class="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3.5 py-2.5 transition-colors"
                  :class="direction === 'remove' ? 'border-brand-600 bg-brand-50/70 text-ink-900 ring-1 ring-brand-600/20' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-25'"
                >
                  <input v-model="direction" type="radio" name="reputation-direction" value="remove" class="sr-only" />
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600">
                    <ArrowDown :size="15" :stroke-width="2.25" aria-hidden="true" />
                  </span>
                  <span class="font-medium">Trừ điểm</span>
                </label>
              </div>
            </fieldset>

            <!-- Points & Live Preview -->
            <div class="space-y-1.5">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                <label :class="consoleLabel">
                  <span>Số điểm cần điều chỉnh</span>
                  <input
                    v-model="amount"
                    type="number"
                    :min="REPUTATION_DELTA_MIN"
                    :max="REPUTATION_DELTA_MAX"
                    step="1"
                    inputmode="numeric"
                    :disabled="busy"
                    :class="[consoleField, 'font-num', amountError ? 'border-danger-500 focus:border-danger-600' : '']"
                    data-testid="adjust-amount"
                    @input="amountError = ''"
                  />
                </label>

                <div class="flex h-9 items-center justify-between rounded-[var(--radius-sm)] border border-ink-200/80 bg-ink-25 px-3 text-xs">
                  <span class="text-ink-500">Điểm dự kiến</span>
                  <span v-if="preview !== null" class="font-num text-sm font-bold" data-testid="adjust-preview">
                    <span class="text-ink-600">{{ account.reputationPoints }}</span>
                    <span class="mx-1 text-ink-400">→</span>
                    <span :class="preview > account.reputationPoints ? 'text-success-700' : preview < account.reputationPoints ? 'text-danger-700' : 'text-ink-800'">
                      {{ preview }}
                    </span>
                  </span>
                  <span v-else class="font-num text-ink-400">—</span>
                </div>
              </div>

              <p v-if="amountError" class="text-xs font-medium text-danger-700" role="alert">
                {{ amountError }}
              </p>
              <p
                v-else-if="previewOutcome"
                class="text-xs font-medium"
                :class="previewOutcome.tone === 'success' ? 'text-success-700' : previewOutcome.tone === 'warning' ? 'text-warning-700' : 'text-danger-700'"
              >
                {{ previewOutcome.text }}
              </p>
            </div>

            <!-- Required Reason with Backend Character Limit Counter -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <label for="reputation-adjust-reason" class="text-sm font-medium text-ink-700">
                  Lý do điều chỉnh <span class="text-danger-600">*</span>
                </label>
                <span
                  class="font-num text-xs"
                  :class="trimmedReasonLength > REPUTATION_REASON_MAX ? 'font-semibold text-danger-700' : 'text-ink-400'"
                >
                  {{ trimmedReasonLength }} / {{ REPUTATION_REASON_MAX }}
                </span>
              </div>
              <textarea
                id="reputation-adjust-reason"
                v-model="reason"
                rows="3"
                :maxlength="REPUTATION_REASON_MAX"
                :disabled="busy"
                placeholder="Nhập rõ lý do điều chỉnh (tối thiểu 5 ký tự)..."
                :class="[consoleTextarea, reasonError ? 'border-danger-500 focus:border-danger-600' : '']"
                data-testid="adjust-reason"
                @input="reasonError = ''"
              />
              <p v-if="reasonError" class="text-xs font-medium text-danger-700" role="alert">
                {{ reasonError }}
              </p>
            </div>

            <!-- API Submit Error -->
            <Transition name="fh-fade-slide">
              <p
                v-if="submitError"
                class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs font-medium text-danger-800"
                role="alert"
              >
                {{ submitError }}
              </p>
            </Transition>

            <!-- Footer -->
            <footer class="flex items-center justify-end gap-2.5 border-t border-ink-100 pt-4">
              <FhButton variant="secondary" size="sm" :disabled="busy" @click="handleClose">
                Huỷ
              </FhButton>
              <FhButton type="submit" variant="primary" size="sm" :loading="busy" :disabled="busy">
                <Check v-if="!busy" :size="15" aria-hidden="true" />
                Lưu điều chỉnh
              </FhButton>
            </footer>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
