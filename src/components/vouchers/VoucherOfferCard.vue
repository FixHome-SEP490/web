<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { AlertCircle, ChevronDown, Clock3 } from 'lucide-vue-next';
import { FhButton, FhCard, FhStatusPill } from '..';
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

const WALLET_PREVIEW_NOTICE = 'Điều kiện sử dụng sẽ được xác nhận từ máy chủ khi xem trước.';

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

const scopeLabel = computed(() => (
  props.offer.scope.includes('LABOR') && props.offer.scope.includes('PARTS')
    ? 'Tiền công và linh kiện'
    : 'Phạm vi chưa đầy đủ'
));
const extraTargets = computed(() => [...props.offer.categoryNames, ...props.offer.serviceNames].filter(Boolean).join(', '));
const isTerminalWallet = computed(() => ['USED', 'EXPIRED', 'REVOKED'].includes(props.offer.walletStatus ?? ''));

const pillMeta = computed<{ status: string; label: string } | null>(() => {
  if (props.offer.walletStatus === 'USED') return { status: 'INACTIVE', label: 'Đã sử dụng' };
  if (props.offer.walletStatus === 'RESERVED') return { status: 'PENDING', label: 'Đang giữ chỗ' };
  if (props.offer.walletStatus === 'EXPIRED' || props.offer.status === 'EXPIRED') return { status: 'INACTIVE', label: 'Đã hết hạn' };
  if (props.offer.walletStatus === 'REVOKED' || props.offer.status === 'REVOKED') return { status: 'REJECTED', label: 'Đã thu hồi' };
  if (props.offer.status === 'PAUSED' || props.offer.status === 'EXHAUSTED') {
    return { status: 'INACTIVE', label: voucherStatusLabels[props.offer.status] };
  }
  if (props.offer.status === 'SCHEDULED') return { status: 'PENDING', label: voucherStatusLabels.SCHEDULED };
  return null;
});

const rawFirstReason = computed(() => (
  !props.offer.eligibility.eligible && props.offer.eligibility.reasons.length
    ? props.offer.eligibility.reasons[0]
    : ''
));
const isWalletPreviewNotice = computed(() => (
  props.offer.walletStatus === 'AVAILABLE' && rawFirstReason.value === WALLET_PREVIEW_NOTICE
));
const visibleEligibilityReason = computed(() => (isWalletPreviewNotice.value ? '' : rawFirstReason.value));
const walletEligibilityNote = computed(() => (isWalletPreviewNotice.value ? rawFirstReason.value : ''));
const showActionReason = computed(() => (
  !visibleEligibilityReason.value
  && actionDisabled.value
  && !props.offer.walletStatus
  && (Boolean(props.disabledReason) || !props.connected)
));
const hasExtraDetails = computed(() => Boolean(
  props.offer.description
  || extraTargets.value
  || props.offer.perCustomerLimit !== null
  || walletEligibilityNote.value,
));

function activate() {
  if (actionDisabled.value) return;
  emit('activate', props.offer.id);
}
</script>

<template>
  <FhCard
    as="article"
    padding="none"
    class="voucher-card rounded-[var(--radius-md)]! shadow-none!"
    :class="isTerminalWallet ? 'opacity-75' : ''"
  >
    <div class="flex min-w-0 flex-col sm:flex-row">
      <!-- Left Stub: Discount Focal Anchor -->
      <div
        class="flex shrink-0 items-center justify-between gap-3 border-b border-dashed border-ink-200 px-4 py-3.5 sm:w-44 sm:flex-col sm:items-start sm:justify-center sm:gap-1.5 sm:border-b-0 sm:border-r sm:px-5 sm:py-4"
        :class="isTerminalWallet ? 'bg-ink-50' : 'bg-brand-50/55'"
      >
        <div class="min-w-0">
          <p
            class="font-num text-xl sm:text-[22px] font-bold leading-tight tracking-tight tabular-nums"
            :class="isTerminalWallet ? 'text-ink-600' : 'text-brand-700'"
          >
            {{ voucherDiscountLabel(offer) }}
          </p>
          <p v-if="offer.discount.capVnd !== null" class="mt-1 text-xs font-medium text-ink-600 tabular-nums">
            Tối đa {{ formatVoucherAmount(offer.discount.capVnd) }}
          </p>
        </div>

        <span
          class="shrink-0 rounded-[var(--radius-sm)] text-[11px] font-medium"
          :class="offer.kind === 'PERSONAL' ? 'bg-white px-2 py-0.5 text-brand-700' : 'text-ink-500'"
        >
          {{ offer.kind === 'PERSONAL' ? 'Ưu đãi cá nhân' : 'Ưu đãi chung' }}
        </span>
      </div>

      <!-- Right Body: Concise Terms & Action -->
      <div class="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2.5">
            <h3 class="min-w-0 break-words text-base font-semibold leading-snug text-ink-900">
              {{ offer.title }}
            </h3>
            <FhStatusPill v-if="pillMeta" :status="pillMeta.status" :label="pillMeta.label" />
          </div>

          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-[13px] text-ink-600">
            <span v-if="offer.minSpendVnd !== null">
              Đơn từ <strong class="font-semibold text-ink-800 font-num">{{ formatVoucherAmount(offer.minSpendVnd) }}</strong>
            </span>
            <span v-if="offer.minSpendVnd !== null" class="text-ink-300" aria-hidden="true">·</span>
            <span>{{ scopeLabel }}</span>
            <span class="text-ink-300" aria-hidden="true">·</span>
            <span>HSD <span class="font-num font-medium text-ink-700">{{ formatVoucherDate(offer.expiresAt) }}</span></span>
          </p>

          <p v-if="offer.remainingSuccessfulRedemptions !== null" class="text-xs font-medium text-ink-700" aria-label="Hạn mức thanh toán thành công">
            {{ offer.remainingSuccessfulRedemptions }} / {{ offer.successfulRedemptionLimit ?? '—' }} lượt thanh toán thành công còn lại
          </p>

          <p v-if="reservationText" class="inline-flex min-h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-800" data-testid="voucher-reservation-countdown" role="timer" aria-live="off" aria-atomic="true">
            <Clock3 :size="14" aria-hidden="true" />
            <span>Giữ chỗ còn {{ reservationText }}</span>
          </p>
          <p v-else-if="reservationSeconds === 0" class="text-xs text-ink-500" role="status">Thời gian giữ chỗ đã hết.</p>
          <p v-else-if="offer.reservation" class="text-xs text-ink-500">Thời gian giữ chỗ chưa xác định.</p>

          <p v-if="visibleEligibilityReason" class="flex items-start gap-1.5 text-xs sm:text-[13px] text-warning-800" data-testid="voucher-eligibility-reason">
            <AlertCircle class="mt-0.5 shrink-0" :size="15" aria-hidden="true" />
            <span>{{ visibleEligibilityReason }}</span>
          </p>
          <p v-else-if="showActionReason" class="text-xs text-ink-500" data-testid="voucher-action-reason">
            {{ actionReason }}
          </p>
        </div>

        <div class="flex flex-wrap items-end justify-between gap-2.5 pt-1">
          <details v-if="hasExtraDetails" class="group/details min-w-0 text-xs text-ink-600">
            <summary class="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-ink-600 hover:text-brand-700 select-none [&::-webkit-details-marker]:hidden">
              <span>Điều kiện</span>
              <ChevronDown :size="14" class="transition-transform group-open/details:rotate-180" aria-hidden="true" />
            </summary>
            <div class="mt-2 space-y-1 border-t border-ink-100 pt-2 leading-relaxed text-ink-600">
              <p v-if="offer.description">{{ offer.description }}</p>
              <p v-if="extraTargets || offer.perCustomerLimit !== null">
                Áp dụng cho {{ extraTargets || 'dịch vụ theo điều kiện chương trình' }}
                <span v-if="offer.perCustomerLimit !== null"> · Tối đa {{ offer.perCustomerLimit }} lượt mỗi khách</span>
              </p>
              <p v-if="walletEligibilityNote">{{ walletEligibilityNote }}</p>
            </div>
          </details>
          <span v-else />

          <FhButton
            :variant="offer.walletStatus ? 'secondary' : 'primary'"
            size="md"
            class="shrink-0 ml-auto"
            :disabled="actionDisabled"
            :aria-label="actionText"
            :aria-describedby="actionDisabled ? `voucher-reason-${offer.id}` : undefined"
            @click="activate"
          >{{ actionText }}</FhButton>
          <span v-if="actionDisabled" class="sr-only" :id="`voucher-reason-${offer.id}`">{{ actionReason }}</span>
        </div>
      </div>
    </div>
  </FhCard>
</template>

<style scoped>
.voucher-card { transition: box-shadow 120ms ease, border-color 120ms ease; }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .voucher-card:hover { border-color: var(--color-ink-300); box-shadow: var(--shadow-e1); }
}
@media (prefers-reduced-motion: reduce) {
  .voucher-card { transition: none; }
}
</style>
