<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Check, Clock3, TicketPercent } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import {
  formatVoucherAmount,
  formatVoucherCountdown,
  formatVoucherDate,
  getVoucherClaimGate,
  remainingReservationSeconds,
  voucherDiscountLabel,
  voucherStatusLabels,
  type VoucherOffer,
} from './voucher-model';

const props = withDefaults(defineProps<{
  offer: VoucherOffer;
  connected?: boolean;
  customerId?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  actionLabel?: string;
}>(), {
  connected: false,
  customerId: null,
  disabled: undefined,
  disabledReason: '',
  actionLabel: '',
});

const emit = defineEmits<{ activate: [voucherId: string] }>();
const elapsedMs = ref(0);
let startedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function stopReservationTimer() {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

function syncReservationTimer() {
  stopReservationTimer();
  elapsedMs.value = 0;
  const reservation = props.offer.reservation;
  if (!reservation) return;
  const initialSeconds = remainingReservationSeconds(reservation, 0);
  if (initialSeconds === null || initialSeconds === 0) return;

  startedAt = performance.now();
  timer = setInterval(() => {
    elapsedMs.value = performance.now() - startedAt;
    if (remainingReservationSeconds(reservation, elapsedMs.value) === 0) stopReservationTimer();
  }, 1000);
}

watch(() => props.offer.reservation, syncReservationTimer, { deep: true, immediate: true });
onBeforeUnmount(stopReservationTimer);

const claimGate = computed(() => getVoucherClaimGate(props.offer, {
  connected: props.connected,
  customerId: props.customerId,
}));
const actionDisabled = computed(() => props.disabled ?? !claimGate.value.enabled);
const actionReason = computed(() => props.disabledReason || claimGate.value.reason || 'Ưu đãi hiện chưa đủ điều kiện.');
const actionText = computed(() => props.actionLabel || (props.offer.walletStatus ? 'Ưu đãi trong ví' : 'Lưu vào ví'));
const reservationSeconds = computed(() => props.offer.reservation
  ? remainingReservationSeconds(props.offer.reservation, elapsedMs.value)
  : null);
const reservationText = computed(() => reservationSeconds.value === null
  || reservationSeconds.value === 0
  ? ''
  : formatVoucherCountdown(reservationSeconds.value));

function activate() {
  if (actionDisabled.value) return;
  emit('activate', props.offer.id);
}
</script>

<template>
  <article class="voucher-card relative overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white shadow-[var(--shadow-e1)]">
    <div class="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
      <div class="flex shrink-0 items-center gap-3 sm:w-32 sm:flex-col sm:items-start sm:gap-2">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-brand-50 text-brand-700" aria-hidden="true">
          <TicketPercent :size="23" :stroke-width="1.75" />
        </div>
        <div class="min-w-0">
          <p class="text-xl font-semibold leading-7 text-brand-800">{{ voucherDiscountLabel(offer) }}</p>
          <p class="mt-0.5 text-xs text-ink-600">{{ offer.kind === 'PERSONAL' ? 'Ưu đãi cá nhân' : 'Ưu đãi chung' }}</p>
        </div>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="text-base font-semibold leading-6 text-ink-900">{{ offer.title }}</h3>
            <p class="mt-1 text-sm leading-5 text-ink-600">{{ offer.description }}</p>
          </div>
          <span class="shrink-0 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
            {{ voucherStatusLabels[offer.status] ?? 'Trạng thái chưa xác định' }}
          </span>
        </div>

        <dl class="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
          <div class="flex min-w-0 justify-between gap-3 sm:justify-start">
            <dt class="shrink-0 text-ink-600">Đơn tối thiểu</dt>
            <dd class="text-right font-medium text-ink-900">{{ formatVoucherAmount(offer.minSpendVnd) }}</dd>
          </div>
          <div class="flex min-w-0 justify-between gap-3 sm:justify-start">
            <dt class="shrink-0 text-ink-600">Giảm tối đa</dt>
            <dd class="text-right font-medium text-ink-900">{{ formatVoucherAmount(offer.discount.capVnd) }}</dd>
          </div>
          <div class="flex min-w-0 justify-between gap-3 sm:justify-start">
            <dt class="shrink-0 text-ink-600">Phạm vi</dt>
            <dd class="text-right font-medium text-ink-900">{{ offer.scope.includes('LABOR') && offer.scope.includes('PARTS') ? 'Tiền công và linh kiện' : 'Phạm vi chưa đầy đủ' }}</dd>
          </div>
          <div class="flex min-w-0 justify-between gap-3 sm:justify-start">
            <dt class="shrink-0 text-ink-600">Hạn dùng</dt>
            <dd class="text-right font-medium text-ink-900">{{ formatVoucherDate(offer.expiresAt) }}</dd>
          </div>
        </dl>

        <p class="mt-3 text-xs leading-5 text-ink-600">
          Áp dụng cho {{ [...offer.categoryNames, ...offer.serviceNames].filter(Boolean).join(', ') || 'dịch vụ theo điều kiện chương trình' }}
          <span v-if="offer.perCustomerLimit !== null"> · Tối đa {{ offer.perCustomerLimit }} lượt mỗi khách</span>
        </p>
        <p class="mt-1 text-xs font-medium text-ink-700" aria-label="Hạn mức thanh toán thành công">
          <template v-if="offer.remainingSuccessfulRedemptions !== null">
            {{ offer.remainingSuccessfulRedemptions }} / {{ offer.successfulRedemptionLimit ?? '—' }} lượt thanh toán thành công còn lại
          </template>
          <template v-else>Số lượt còn lại chưa được xác nhận</template>
        </p>

        <p v-if="reservationText" class="mt-2 inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-sm)] bg-warning-50 px-2.5 py-1 text-sm font-medium text-warning-800" data-testid="voucher-reservation-countdown" role="timer" aria-live="off" aria-atomic="true">
          <Clock3 :size="16" aria-hidden="true" />
          <span>Giữ chỗ còn {{ reservationText }}</span>
        </p>
        <p v-else-if="reservationSeconds === 0" class="mt-2 text-sm text-ink-600" role="status">Thời gian giữ chỗ đã hết.</p>
        <p v-else-if="offer.reservation" class="mt-2 text-sm text-ink-600">Thời gian giữ chỗ chưa xác định.</p>

        <p v-if="!offer.eligibility.eligible && offer.eligibility.reasons.length" class="mt-3 flex items-start gap-2 text-sm text-warning-800" data-testid="voucher-eligibility-reason">
          <Check class="mt-0.5 shrink-0" :size="16" aria-hidden="true" />
          <span>{{ offer.eligibility.reasons[0] }}</span>
        </p>
        <p v-else-if="actionDisabled" class="mt-3 text-sm text-ink-600" data-testid="voucher-action-reason">{{ actionReason }}</p>
      </div>

      <div class="sm:w-40 sm:shrink-0 sm:self-center">
        <FhButton
          class="w-full"
          variant="primary"
          size="md"
          :disabled="actionDisabled"
          :aria-label="actionText"
          :aria-describedby="actionDisabled ? `voucher-reason-${offer.id}` : undefined"
          @click="activate"
        >{{ actionText }}</FhButton>
        <span v-if="actionDisabled" class="sr-only" :id="`voucher-reason-${offer.id}`">{{ actionReason }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.voucher-card { transition: box-shadow 120ms ease, border-color 120ms ease; }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .voucher-card:hover { border-color: var(--color-ink-300); box-shadow: var(--shadow-e2); }
}
@media (prefers-reduced-motion: reduce) {
  .voucher-card { transition: none; }
}
</style>
