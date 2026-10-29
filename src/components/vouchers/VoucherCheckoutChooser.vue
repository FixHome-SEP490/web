<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, TicketPercent } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import VoucherSelectionSheet from './VoucherSelectionSheet.vue';
import { fundedCheckoutApi, VoucherReservationExpiredError } from '../../api/funded-checkout.api';
import type { FundedReservation } from '../../api/funded-checkout.api';
import { vouchersApi } from '../../api/vouchers.api';
import type { VoucherCheckoutPreview } from '../../api/vouchers.api';
import { getHttpStatus } from '../../api/client';
import {
  claimOffer,
  formatVoucherDate,
  voucherDiscountLabel,
  type VoucherOffer,
} from './voucher-model';
import { useAuthStore } from '../../stores/auth';
import { userFacingError } from '../../utils/user-facing-error';

type ChooserState = 'loading' | 'ready' | 'error' | 'denied' | 'offline';
type PreviewState = 'idle' | 'loading' | 'ready' | 'no_scope' | 'offline' | 'forbidden' | 'conflict' | 'error';

const props = withDefaults(defineProps<{ scopeId?: string | null }>(), { scopeId: null });
const route = useRoute();
const router = useRouter();
const emit = defineEmits<{
  applied: [value: { reservation: FundedReservation; preview: VoucherCheckoutPreview }];
  released: [];
  expired: [];
}>();

const auth = useAuthStore();
const customerId = computed(() => auth.userRole === 'CUSTOMER' ? auth.user?.id : null);
const open = ref(false);
const state = ref<ChooserState>('loading');
const offers = ref<VoucherOffer[]>([]);
const selectedId = ref('');
const error = ref('');
const returnSelectionMessage = ref('');
const selectedOffer = computed(() => offers.value.find((offer) => offer.id === selectedId.value) ?? null);
const previewState = ref<PreviewState>('idle');
const preview = ref<VoucherCheckoutPreview | null>(null);
const previewError = ref('');
const applyError = ref('');
const applying = ref(false);
const attemptId = ref('');
const reservationAttemptStarted = ref(false);
const reservation = ref<FundedReservation | null>(null);
const nowMs = ref(Date.now());
const remainingSeconds = computed(() => reservation.value
  ? Math.max(0, Math.ceil((Date.parse(reservation.value.expiresAt) - nowMs.value) / 1000)) : 0);
const canApply = computed(() => previewState.value === 'ready' && preview.value?.paymentAvailable === true
  && !!selectedOffer.value && !!customerId.value && !!props.scopeId && !reservation.value
  && !applying.value && remainingSeconds.value >= 0);
const walletLocation = computed(() => ({
  name: 'customer-vouchers',
  query: { returnTo: route.fullPath },
}));
const sheetPreviewMessage = computed(() => {
  if (previewState.value === 'loading') return 'Đang tải bản xem trước từ máy chủ…';
  if (previewState.value === 'no_scope') return 'Chưa có lượt thanh toán để kiểm tra điều kiện voucher.';
  if (previewState.value === 'offline') return 'Đang ngoại tuyến. Chưa thể kiểm tra voucher hoặc giữ chỗ.';
  if (previewState.value === 'forbidden') return previewError.value || 'Voucher không thuộc tài khoản này hoặc bạn không có quyền xem.';
  if (previewState.value === 'conflict') return previewError.value || 'Voucher đã hết hạn, đã dùng hoặc không đủ điều kiện cho hóa đơn này.';
  if (previewState.value === 'error') return previewError.value || 'Máy chủ chưa xác nhận được bản xem trước.';
  if (previewState.value === 'ready' && preview.value?.paymentAvailable !== true) {
    return preview.value?.reason === 'VOUCHER_FUNDING_NOT_READY'
      ? 'Dịch vụ giữ chỗ voucher chưa sẵn sàng trên máy chủ. Chưa giữ chỗ; hóa đơn vẫn dùng tổng gốc.'
      : 'Máy chủ chưa cho phép giữ chỗ voucher. Chưa giữ chỗ; hóa đơn vẫn dùng tổng gốc.';
  }
  if (previewState.value === 'ready' && preview.value?.paymentAvailable === true) {
    return 'Máy chủ đã xác nhận có thể yêu cầu giữ chỗ. Hóa đơn chưa thay đổi cho đến khi máy chủ xác nhận thanh toán.';
  }
  return '';
});
const sheetPreviewMessageIsError = computed(() => ['forbidden', 'conflict', 'error'].includes(previewState.value)
  || (previewState.value === 'ready' && preview.value?.paymentAvailable !== true));
const sheetPreviewRetryable = computed(() => ['offline', 'conflict', 'error'].includes(previewState.value)
  || (previewState.value === 'ready' && preview.value?.paymentAvailable !== true));
let sequence = 0;
let previewSequence = 0;
let expiryTimer: ReturnType<typeof setInterval> | null = null;

function createAttemptId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Trình duyệt chưa hỗ trợ giữ chỗ an toàn. Hãy cập nhật trình duyệt rồi thử lại.');
  }
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function resetAttempt() {
  attemptId.value = '';
  reservationAttemptStarted.value = false;
  applyError.value = '';
}

function selectOffer(id: string) {
  if (reservationAttemptStarted.value || reservation.value) return;
  resetAttempt();
  returnSelectionMessage.value = '';
  selectedId.value = id;
}

function selectReturnedClaim(value: unknown) {
  if (typeof value !== 'string' || !value) {
    returnSelectionMessage.value = '';
    return;
  }
  if (reservationAttemptStarted.value || reservation.value) return;
  if (!offers.value.some((offer) => offer.id === value)) {
    selectedId.value = '';
    returnSelectionMessage.value = 'Voucher vừa chọn không còn trong ví. Hãy mở ví để chọn voucher khác.';
    consumeReturnedClaimQuery();
    return;
  }
  returnSelectionMessage.value = '';
  if (selectedId.value !== value) selectOffer(value);
  consumeReturnedClaimQuery();
}

function consumeReturnedClaimQuery() {
  if (!Object.hasOwn(route.query, 'voucherClaimId')) return;
  const query = { ...route.query };
  delete query.voucherClaimId;
  void router.replace({ path: route.path, query, hash: route.hash });
}

async function applyVoucher() {
  const selected = selectedOffer.value;
  const quote = preview.value;
  const scopeId = props.scopeId;
  const owner = customerId.value;
  if (!canApply.value || !selected || !quote || !scopeId || !owner) return;
  if (isOffline()) { applyError.value = 'Đang ngoại tuyến. Chưa thể giữ chỗ voucher.'; return; }
  if (!attemptId.value) {
    try { attemptId.value = createAttemptId(); }
    catch (error) { applyError.value = userFacingError(error, 'Chưa thể giữ chỗ an toàn.'); return; }
  }
  reservationAttemptStarted.value = true;
  applying.value = true;
  applyError.value = '';
  try {
    const held = await fundedCheckoutApi.reserve(selected.id, scopeId, attemptId.value);
    if (selected.id !== selectedId.value || scopeId !== props.scopeId || owner !== customerId.value) {
      await fundedCheckoutApi.release(held.id);
      return;
    }
    reservation.value = held;
    nowMs.value = Date.now();
    emit('applied', { reservation: held, preview: quote });
  } catch (error) {
    if (error instanceof VoucherReservationExpiredError
      || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'VOUCHER_RESERVATION_EXPIRED')) {
      resetAttempt();
      applyError.value = 'Lượt giữ voucher đã hết hạn. Bạn có thể thử giữ chỗ lại.';
    } else if (getHttpStatus(error) === 401) {
      applyError.value = 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại trước khi giữ chỗ voucher.';
    } else if (getHttpStatus(error) === 403) {
      applyError.value = 'Tài khoản này không có quyền giữ voucher cho lượt thanh toán.';
    } else if (getHttpStatus(error) === 409) {
      resetAttempt();
      previewState.value = 'conflict';
      applyError.value = 'Voucher đã hết hạn, đã được dùng hoặc lượt thanh toán đã thay đổi. Hãy tải lại bản xem trước.';
    } else if (getHttpStatus(error) === 503) {
      applyError.value = 'Máy chủ voucher tạm thời chưa sẵn sàng để giữ chỗ. Hãy thử lại; lần thử lại sẽ dùng cùng mã giao dịch.';
    } else {
      applyError.value = userFacingError(error, 'Chưa giữ được voucher. Hãy thử lại; lần thử lại sẽ dùng cùng mã giao dịch.');
    }
  } finally {
    applying.value = false;
  }
}

async function releaseReservation() {
  if (!reservation.value || applying.value) return;
  applying.value = true;
  applyError.value = '';
  try {
    await fundedCheckoutApi.release(reservation.value.id);
    reservation.value = null;
    resetAttempt();
    emit('released');
  } catch (error) {
    applyError.value = userFacingError(error, 'Chưa hủy được giữ chỗ. Hãy thử lại.');
  } finally {
    applying.value = false;
  }
}

watch(() => props.scopeId, (scopeId) => {
  if (reservation.value && reservation.value.scopeId !== scopeId) void releaseReservation();
}, { flush: 'sync' });

function checkExpiry() {
  nowMs.value = Date.now();
  if (reservation.value && remainingSeconds.value === 0) {
    reservation.value = null;
    resetAttempt();
    applyError.value = 'Thời gian giữ voucher đã hết. Bạn có thể thử giữ chỗ lại nếu voucher vẫn còn hiệu lực.';
    emit('expired');
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function loadPreview() {
  const request = ++previewSequence;
  const claimId = selectedId.value;
  const scopeId = props.scopeId;
  const owner = customerId.value;
  preview.value = null;
  previewError.value = '';
  if (!claimId) { previewState.value = 'idle'; return; }
  if (!scopeId) { previewState.value = 'no_scope'; return; }
  if (isOffline()) { previewState.value = 'offline'; return; }
  if (!owner) { previewState.value = 'forbidden'; return; }
  previewState.value = 'loading';
  try {
    const result = await vouchersApi.checkoutPreview(claimId, scopeId);
    if (request !== previewSequence || claimId !== selectedId.value || scopeId !== props.scopeId || owner !== customerId.value) return;
    preview.value = result;
    previewState.value = 'ready';
  } catch (e) {
    if (request !== previewSequence || claimId !== selectedId.value || scopeId !== props.scopeId || owner !== customerId.value) return;
    const status = getHttpStatus(e);
    if (isOffline() || (typeof e === 'object' && e !== null && 'code' in e && e.code === 'ERR_NETWORK')) previewState.value = 'offline';
    else if (status === 401) {
      previewState.value = 'forbidden';
      previewError.value = 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để xem voucher.';
    } else if (status === 403) {
      previewState.value = 'forbidden';
      previewError.value = 'Voucher không thuộc tài khoản này hoặc bạn không có quyền xem.';
    } else if ([400, 404, 409].includes(status ?? 0)) {
      previewState.value = 'conflict';
      previewError.value = 'Voucher không hợp lệ, đã hết hạn, đã được dùng hoặc không đủ điều kiện cho hóa đơn này.';
    } else if (status === 503) {
      previewState.value = 'error';
      previewError.value = 'Máy chủ voucher tạm thời chưa sẵn sàng để xác nhận bản xem trước. Chưa giữ chỗ hoặc thay đổi hóa đơn; hãy thử lại.';
    }
    else {
      previewState.value = 'error';
      previewError.value = userFacingError(e, 'Chưa tải được bản xem trước. Vui lòng thử lại.');
    }
  }
}

async function load() {
  const request = ++sequence;
  offers.value = [];
  selectedId.value = '';
  returnSelectionMessage.value = '';
  if (!customerId.value) {
    state.value = 'denied';
    return;
  }
  if (isOffline()) {
    state.value = 'offline';
    error.value = '';
    return;
  }
  const owner = customerId.value;
  state.value = 'loading';
  error.value = '';
  try {
    const result = await vouchersApi.wallet();
    if (request !== sequence) return;
    offers.value = result.filter((claim) => claim.status === 'CLAIMED').map((claim) => claimOffer(claim, owner));
    state.value = 'ready';
    selectReturnedClaim(route.query.voucherClaimId);
  } catch (e) {
    if (request !== sequence) return;
    state.value = 'error';
    error.value = userFacingError(e, 'Chưa tải được ví ưu đãi. Vui lòng thử lại.');
  }
}

function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  open.value = true;
  void load();
}

function handleOffline() {
  if (!open.value) return;
  sequence++;
  previewSequence++;
  preview.value = null;
  previewState.value = 'offline';
  offers.value = [];
  selectedId.value = '';
  returnSelectionMessage.value = '';
  error.value = '';
  state.value = 'offline';
}

function handleOnline() {
  if (open.value && state.value === 'offline') void load();
}

watch(customerId, () => {
  sequence++;
  previewSequence++;
  preview.value = null;
  previewState.value = 'idle';
  offers.value = [];
  selectedId.value = '';
  returnSelectionMessage.value = '';
  open.value = false;
  reservation.value = null;
  resetAttempt();
}, { flush: 'sync' });

watch(() => route.query.voucherClaimId, (claimId) => {
  if (offers.value.length > 0) selectReturnedClaim(claimId);
}, { flush: 'sync' });

watch(() => [selectedId.value, props.scopeId, customerId.value] as const, () => {
  resetAttempt();
  void loadPreview();
}, { flush: 'sync' });

onMounted(() => {
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
  expiryTimer = setInterval(checkExpiry, 1000);
});

onBeforeUnmount(() => {
  sequence++;
  previewSequence++;
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('online', handleOnline);
  if (expiryTimer) clearInterval(expiryTimer);
});
</script>

<template>
  <section class="min-w-0 rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm" data-testid="voucher-checkout-chooser">
    <button
      type="button"
      data-testid="open-voucher-chooser"
      :aria-expanded="open"
      aria-haspopup="dialog"
      class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-600"
      @click="toggle"
    >
      <span class="inline-flex min-w-0 items-center gap-2 font-medium">
        <TicketPercent :size="18" aria-hidden="true" />
        <span class="min-w-0">Voucher ưu đãi</span>
        <span v-if="state === 'ready' && offers.length" class="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-num text-ink-600">
          {{ offers.length }}
        </span>
      </span>
      <ChevronDown
        :size="18"
        aria-hidden="true"
        class="shrink-0 transition-transform motion-reduce:transition-none"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <p v-if="preview && preview.paymentAvailable !== true" class="text-xs leading-5 text-ink-600">Thanh toán voucher chưa sẵn sàng từ máy chủ. Chưa giữ chỗ và hóa đơn vẫn dùng tổng gốc.</p>
    <p v-else-if="preview?.paymentAvailable === true" class="text-xs leading-5 text-ink-600">Máy chủ cho phép giữ voucher trong thời hạn ghi nhận. Hóa đơn chỉ thay đổi khi máy chủ xác nhận thanh toán.</p>
    <p v-if="returnSelectionMessage" class="mt-2 text-sm text-warning-800" role="status" data-testid="checkout-voucher-return-state">{{ returnSelectionMessage }}</p>

    <div class="mt-3 space-y-3">
      <div v-if="selectedOffer" class="rounded-lg border border-brand-200 bg-brand-50 p-3" data-testid="checkout-voucher-selected">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Đang chọn để xem</p>
        <p class="mt-1 font-medium text-ink-900">{{ selectedOffer.title }}</p>
        <p class="mt-1 text-xs leading-5 text-ink-700">{{ voucherDiscountLabel(selectedOffer) }} · Hạn {{ formatVoucherDate(selectedOffer.expiresAt) }}</p>
        <p class="mt-1 text-xs leading-5 text-ink-600">{{ reservation ? 'Đã giữ chỗ theo máy chủ.' : 'Chưa áp dụng, chưa giữ chỗ. Số tiền hóa đơn được giữ nguyên.' }}</p>
      </div>
      <p v-else-if="state === 'ready' && offers.length" class="text-sm text-ink-600">
        {{ offers.length }} voucher đã lưu trong ví. Mở bảng chọn để xem điều kiện.
      </p>
      <p v-else-if="state === 'ready'" class="text-sm text-ink-600">Chưa có voucher đã lưu để xem.</p>
      <p v-else-if="state === 'offline'" class="text-sm text-ink-600" role="status">Đang ngoại tuyến. Ví ưu đãi cần kết nối máy chủ.</p>

      <div v-if="selectedOffer && previewState === 'loading'" class="text-sm text-ink-600" role="status" data-testid="checkout-voucher-preview-state">Đang tải bản xem trước từ máy chủ…</div>
      <div v-else-if="selectedOffer && previewState === 'no_scope'" class="text-sm text-ink-600" role="status" data-testid="checkout-voucher-preview-state">Chưa sẵn sàng xem trước vì thiếu lượt thanh toán.</div>
      <div v-else-if="selectedOffer && previewState === 'offline'" class="text-sm text-ink-600" role="status" data-testid="checkout-voucher-preview-state">Đang ngoại tuyến. Chưa thể tải bản xem trước.</div>
      <div v-else-if="selectedOffer && previewState === 'forbidden'" class="text-sm text-danger-700" role="alert" data-testid="checkout-voucher-preview-state">{{ previewError || 'Voucher không thuộc lượt thanh toán này hoặc bạn không có quyền xem.' }}</div>
      <div v-else-if="selectedOffer && previewState === 'conflict'" class="space-y-2 text-sm text-danger-700" role="alert" data-testid="checkout-voucher-preview-state">
        <p>{{ previewError || 'Voucher đã hết hạn, đã dùng hoặc không đủ điều kiện cho hóa đơn này.' }}</p>
        <button type="button" class="min-h-11 underline" @click="loadPreview">Tải lại bản xem trước</button>
      </div>
      <div v-else-if="selectedOffer && previewState === 'error'" class="space-y-2 text-sm text-danger-700" role="alert" data-testid="checkout-voucher-preview-state">
        <p>{{ previewError }}</p>
        <button type="button" class="min-h-11 underline" @click="loadPreview">Thử tải lại bản xem trước</button>
      </div>
      <div v-else-if="selectedOffer && previewState === 'ready' && preview" class="rounded-lg border border-ink-200 bg-white p-3" data-testid="checkout-voucher-preview" :data-claim-id="preview.claimId" :data-scope-id="preview.scopeId">
        <p class="font-semibold text-ink-900">{{ reservation ? 'Voucher đã được giữ chỗ' : 'Xem trước, chưa áp dụng' }}</p>
        <dl class="mt-2 space-y-1 text-xs text-ink-700">
          <div class="flex justify-between gap-3"><dt>Tổng hóa đơn gốc</dt><dd><FhMoney :amount="preview.originalGrossVnd" /></dd></div>
          <div class="flex justify-between gap-3"><dt>Cơ sở đủ điều kiện</dt><dd><FhMoney :amount="preview.eligibleBaseVnd" /></dd></div>
          <div class="flex justify-between gap-3"><dt>Trợ giá FixHome dự kiến</dt><dd><FhMoney :amount="preview.fixHomeDiscountSubsidyVnd" /></dd></div>
          <div class="flex justify-between gap-3 font-semibold text-ink-900"><dt>Khách hàng dự kiến thanh toán</dt><dd><FhMoney :amount="preview.customerDueVnd" /></dd></div>
        </dl>
        <p v-if="reservation" class="mt-2 text-xs leading-5 text-warning-800" role="status">Còn {{ Math.floor(remainingSeconds / 60) }} phút {{ String(remainingSeconds % 60).padStart(2, '0') }} giây để hoàn tất thanh toán. {{ preview.customerDueVnd === 0 ? 'Máy chủ đang xác nhận tất toán 0 ₫.' : 'Chưa ghi nhận thanh toán.' }}</p>
        <p v-else class="mt-2 text-xs leading-5 text-ink-600">Số tiền này chỉ để xem trước. Hóa đơn và thanh toán hiện tại vẫn dùng tổng gốc.</p>
      </div>

      <p v-if="applyError" class="text-sm text-danger-700" role="alert" data-testid="checkout-voucher-apply-error">{{ applyError }}</p>
      <div v-if="reservation && remainingSeconds > 0" class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-success-700" role="status">Voucher đã giữ chỗ, chưa xác nhận thanh toán.</span>
        <button type="button" class="min-h-11 px-2 text-sm text-danger-700 underline" :disabled="applying" @click="releaseReservation">Hủy giữ chỗ</button>
      </div>
      <p v-else-if="reservation && remainingSeconds === 0" class="text-sm text-warning-800" role="alert">Thời gian giữ voucher đã hết.</p>
      <FhButton
        v-else
        data-testid="checkout-voucher-apply"
        variant="secondary"
        size="md"
        :disabled="!canApply"
        :loading="applying"
        @click="applyVoucher"
      >{{ applying ? 'Đang giữ chỗ…' : preview?.paymentAvailable === true ? 'Áp dụng voucher' : 'Máy chủ chưa sẵn sàng' }}</FhButton>
      <RouterLink :to="walletLocation" class="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-brand-600">Mở ví ưu đãi</RouterLink>
    </div>

    <VoucherSelectionSheet
      :open="open"
      :offers="offers"
      :state="state"
      :message="error"
      :selected-id="selectedId"
      :customer-id="customerId"
      :server-preview="preview"
      :preview-loading="previewState === 'loading'"
      :preview-message="sheetPreviewMessage"
      :preview-message-is-error="sheetPreviewMessageIsError"
      :preview-retryable="sheetPreviewRetryable"
      :can-apply="canApply"
      :applying="applying"
      :selection-disabled="reservationAttemptStarted || !!reservation"
      :apply-error="applyError"
      :server-reservation="reservation ? { voucherId: reservation.claimId, expiresAt: reservation.expiresAt, serverTimeAtResponse: reservation.reservedAt } : null"
      @close="open = false"
      @retry="load"
      @select="selectOffer"
      @apply="applyVoucher"
      @retry-preview="loadPreview"
    />
  </section>
</template>
