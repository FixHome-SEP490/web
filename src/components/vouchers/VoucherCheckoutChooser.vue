<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, TicketPercent } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import VoucherSelectionSheet from './VoucherSelectionSheet.vue';
import { fundedCheckoutApi, VoucherReservationTerminalError } from '../../api/funded-checkout.api';
import type { FundedReservation, FundedTerminalReceipt } from '../../api/funded-checkout.api';
import { vouchersApi } from '../../api/vouchers.api';
import type { VoucherCheckoutPreview } from '../../api/vouchers.api';
import { queryKeys } from '../../lib/query-keys';
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
  terminal: [receipt: FundedTerminalReceipt];
}>();

const auth = useAuthStore();
const cache = useQueryClient();
// Uncertain attempts outlive modal remounts; the auth boundary clears this cache.
cache.setQueryDefaults(queryKeys.voucherAttempts.all, { gcTime: Infinity });
type SavedAttempt = { attemptId: string; offer: VoucherOffer; preview: VoucherCheckoutPreview; reservation: FundedReservation | null; terminal?: FundedTerminalReceipt; requestPending?: boolean };
const attemptKey = queryKeys.voucherAttempts.scope;
let disposed = false;
let switchingContext = false;
const customerId = computed(() => auth.userRole === 'CUSTOMER' ? auth.user?.id : null);
const open = ref(true);
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
const requests = ref(new Set<string>());
const cacheVersion = ref(0);
const stopAttemptUpdates = cache.getQueryCache().subscribe(event => {
  if (event.query.queryKey[0] === queryKeys.voucherAttempts.all[0]) cacheVersion.value++;
});
onBeforeUnmount(stopAttemptUpdates);
const requestKey = (owner: string, scopeId: string, attempt: string) => JSON.stringify([owner, scopeId, attempt]);
const requestPending = computed(() => {
  void cacheVersion.value;
  const owner = customerId.value;
  const scopeId = props.scopeId;
  return !!owner && !!scopeId && (requests.value.has(requestKey(owner, scopeId, attemptId.value))
    || cache.getQueryData<SavedAttempt>(attemptKey(owner, scopeId))?.requestPending === true);
});
function currentAttempt(owner: string, scopeId: string, attempt: string) {
  return !disposed && owner === customerId.value && scopeId === props.scopeId
    && attemptScopeId.value === scopeId && attemptId.value === attempt;
}
const attemptId = ref('');
const reservationAttemptStarted = ref(false);
const attemptScopeId = ref<string | null>(null);
const reservation = ref<FundedReservation | null>(null);
const terminal = ref<FundedTerminalReceipt | null>(null);
const nowMs = ref(Date.now());
const remainingSeconds = computed(() => {
  const held = reservation.value;
  if (!held?.serverTimeAtResponse || held.receivedAtMs === undefined) return null;
  return Math.max(0, Math.ceil((Date.parse(held.expiresAt) - Date.parse(held.serverTimeAtResponse) - Math.max(0, nowMs.value - held.receivedAtMs)) / 1000));
});
function pendingAttempt(): SavedAttempt | null {
  const owner = customerId.value;
  const scopeId = props.scopeId;
  if (!owner || !scopeId || !reservationAttemptStarted.value || reservation.value || terminal.value
    || attemptScopeId.value !== scopeId || !attemptId.value) return null;
  const saved = cache.getQueryData<SavedAttempt>(attemptKey(owner, scopeId));
  return saved && !saved.reservation && !saved.terminal && saved.attemptId === attemptId.value
    && saved.offer.id === selectedId.value && saved.offer.ownerCustomerId === owner
    && saved.preview.claimId === saved.offer.id && saved.preview.scopeId === scopeId ? saved : null;
}
const canApply = computed(() => !reservation.value && !terminal.value && !applying.value && !requestPending.value
  && (reservationAttemptStarted.value ? !!pendingAttempt()
    : previewState.value === 'ready' && preview.value?.paymentAvailable === true
      && !!selectedOffer.value && !!customerId.value && !!props.scopeId));
const walletLocation = computed(() => ({
  name: 'customer-vouchers',
  query: { returnTo: route.fullPath },
}));
const terminalMessage = 'Ưu đãi đã được sử dụng hoặc hoàn lại. Cần đối chiếu hóa đơn/thanh toán từ máy chủ; chưa thể tạo yêu cầu mới hoặc thanh toán lại.';
const sheetPreviewMessage = computed(() => {
  if (terminal.value) return terminalMessage;
  if (pendingAttempt()) return 'Kết quả giữ chỗ chưa rõ. Áp dụng lại để kiểm tra đúng yêu cầu cũ; bản xem trước đã lưu chỉ để tham khảo, chưa xác nhận giữ chỗ hoặc thanh toán.';
  if (previewState.value === 'loading') return 'Đang tải bản xem trước từ máy chủ…';
  if (previewState.value === 'no_scope') return 'Chưa có lượt thanh toán để kiểm tra điều kiện voucher.';
  if (previewState.value === 'offline') return 'Đang ngoại tuyến. Chưa thể kiểm tra voucher hoặc giữ chỗ.';
  if (previewState.value === 'forbidden') return previewError.value || 'Voucher không thuộc tài khoản này hoặc bạn không có quyền xem.';
  if (previewState.value === 'conflict') return previewError.value || 'Voucher đã hết hạn, đã dùng hoặc không đủ điều kiện cho hóa đơn này.';
  if (previewState.value === 'error') return previewError.value || 'Máy chủ chưa xác nhận được bản xem trước.';
  if (previewState.value === 'ready' && preview.value?.paymentAvailable !== true) {
    return preview.value?.reason === 'VOUCHER_FUNDING_NOT_READY'
      ? 'Dịch vụ giữ chỗ voucher chưa sẵn sàng trên máy chủ. Bạn có thể đóng bảng và thanh toán không dùng voucher, hoặc thử kiểm tra lại. Hóa đơn vẫn dùng tổng gốc.'
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
  if (customerId.value && attemptScopeId.value) cache.removeQueries({ queryKey: attemptKey(customerId.value, attemptScopeId.value), exact: true });
  attemptScopeId.value = null;
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

function acceptTerminal(receipt: FundedTerminalReceipt, saved: SavedAttempt | undefined, owner: string, scopeId: string) {
  const key = attemptKey(owner, scopeId);
  if (!saved || saved.attemptId !== receipt.attemptId || saved.offer.id !== receipt.claimId
    || receipt.scopeId !== scopeId || (saved.reservation && saved.reservation.id !== receipt.id)
    || owner !== customerId.value || cache.getQueryData(key) !== saved) return;
  const unused = receipt.state === 'EXPIRED' || receipt.state === 'RELEASED';
  if (unused) cache.removeQueries({ queryKey: key, exact: true });
  else cache.setQueryData<SavedAttempt>(key, { ...saved, reservation: null, terminal: receipt });
  if (!currentAttempt(owner, scopeId, receipt.attemptId)) return;
  reservation.value = null;
  preview.value = null;
  previewState.value = 'idle';
  if (unused) {
    resetAttempt();
    if (receipt.state === 'EXPIRED') emit('expired'); else emit('released');
    applyError.value = 'Giữ chỗ đã kết thúc theo xác nhận từ máy chủ. Hãy kiểm tra lại trước khi chọn voucher mới.';
    void loadPreview();
  } else {
    terminal.value = receipt;
    applyError.value = terminalMessage;
  }
  emit('terminal', receipt);
}

async function applyVoucher() {
  const replay = pendingAttempt();
  const selected = replay?.offer ?? selectedOffer.value;
  const quote = replay?.preview ?? preview.value;
  const scopeId = props.scopeId;
  const owner = customerId.value;
  if (!canApply.value || !selected || !quote || !scopeId || !owner
    || (reservationAttemptStarted.value && !replay)) return;
  if (isOffline()) { applyError.value = 'Đang ngoại tuyến. Chưa thể giữ chỗ voucher.'; return; }
  if (!attemptId.value) {
    try { attemptId.value = createAttemptId(); }
    catch (error) { applyError.value = userFacingError(error, 'Chưa thể giữ chỗ an toàn.'); return; }
  }
  attemptScopeId.value = scopeId;
  reservationAttemptStarted.value = true;
  applying.value = true;
  applyError.value = '';
  const key = attemptKey(owner, scopeId);
  const requestAttemptId = attemptId.value;
  cache.setQueryData<SavedAttempt>(key, { attemptId: requestAttemptId, offer: selected, preview: quote, reservation: null, requestPending: true });
  const saved = cache.getQueryData<SavedAttempt>(key);
  const requestId = requestKey(owner, scopeId, requestAttemptId);
  requests.value.add(requestId);
  try {
    const held = await fundedCheckoutApi.reserve(selected.id, scopeId, requestAttemptId);
    if (cache.getQueryData(key) !== saved || owner !== customerId.value) return;
    cache.setQueryData<SavedAttempt>(key, { attemptId: held.attemptId, offer: selected, preview: quote, reservation: held });
    if (!currentAttempt(owner, scopeId, held.attemptId) || selected.id !== selectedId.value) {
      return;
    }
    reservation.value = held;
    nowMs.value = Date.now();
    emit('applied', { reservation: held, preview: quote });
    open.value = false;
  } catch (error) {
    if (error instanceof VoucherReservationTerminalError) {
      acceptTerminal(error.receipt, saved, owner, scopeId);
      return;
    }
    if (!currentAttempt(owner, scopeId, requestAttemptId)) return;
    if (getHttpStatus(error) === 401) {
      applyError.value = 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại trước khi giữ chỗ voucher.';
    } else if (getHttpStatus(error) === 403) {
      applyError.value = 'Tài khoản này không có quyền giữ voucher cho lượt thanh toán.';
    } else if (getHttpStatus(error) === 409) {
      previewState.value = 'conflict';
      applyError.value = 'Voucher đã hết hạn, đã được dùng hoặc lượt thanh toán đã thay đổi. Hãy tải lại bản xem trước.';
    } else if (getHttpStatus(error) === 503) {
      applyError.value = 'Máy chủ voucher tạm thời chưa sẵn sàng để giữ chỗ. Hãy thử lại; lần thử lại sẽ dùng cùng mã giao dịch.';
    } else {
      applyError.value = userFacingError(error, 'Chưa giữ được voucher. Hãy thử lại; lần thử lại sẽ dùng cùng mã giao dịch.');
    }
  } finally {
    // A remounted chooser observes completion of this exact HTTP request. Never
    // clear another identity, a terminal receipt or a cache cleared by logout.
    if (saved && owner === customerId.value && cache.getQueryData(key) === saved) {
      cache.setQueryData<SavedAttempt>(key, { ...saved, requestPending: false });
    }
    requests.value.delete(requestId);
    if (!disposed && owner === customerId.value && scopeId === props.scopeId
      && (!attemptId.value || attemptId.value === requestAttemptId)) applying.value = false;
  }
}

async function reconcileReservation() {
  const held = reservation.value;
  const owner = customerId.value;
  if (!held || !owner || held.scopeId !== props.scopeId || applying.value || requestPending.value || terminal.value) return;
  const key = attemptKey(owner, held.scopeId);
  const previous = cache.getQueryData<SavedAttempt>(key);
  if (!previous) return;
  cache.setQueryData<SavedAttempt>(key, { ...previous, requestPending: true });
  const saved = cache.getQueryData<SavedAttempt>(key);
  const requestId = requestKey(owner, held.scopeId, held.attemptId);
  requests.value.add(requestId);
  applying.value = true;
  applyError.value = '';
  try {
    const result = await fundedCheckoutApi.reserve(held.claimId, held.scopeId, held.attemptId, held.id);
    if (cache.getQueryData(key) !== saved || owner !== customerId.value) return;
    cache.setQueryData<SavedAttempt>(key, { ...saved!, reservation: result, requestPending: false });
    if (!currentAttempt(owner, held.scopeId, held.attemptId)) return;
    reservation.value = result;
  } catch (reason) {
    if (reason instanceof VoucherReservationTerminalError) {
      acceptTerminal(reason.receipt, saved, owner, held.scopeId);
    } else if (currentAttempt(owner, held.scopeId, held.attemptId)) {
      applyError.value = userFacingError(reason, 'Chưa xác minh được giữ chỗ. Hãy kiểm tra thanh toán trước khi thử lại.');
    }
  } finally {
    if (saved && owner === customerId.value && cache.getQueryData(key) === saved) {
      cache.setQueryData<SavedAttempt>(key, { ...saved, requestPending: false });
    }
    requests.value.delete(requestId);
    if (!disposed && owner === customerId.value && held.scopeId === props.scopeId
      && (!attemptId.value || attemptId.value === held.attemptId)) applying.value = false;
  }
}

// UI belongs to the selected scope; cached mutation identities belong to their original scope.
function clearLocalContext() {
  switchingContext = true;
  sequence++;
  previewSequence++;
  applying.value = false;
  reservation.value = null;
  terminal.value = null;
  reservationAttemptStarted.value = false;
  attemptScopeId.value = null;
  attemptId.value = '';
  selectedId.value = '';
  offers.value = [];
  preview.value = null;
  previewState.value = 'idle';
  applyError.value = '';
  returnSelectionMessage.value = '';
  switchingContext = false;
}
watch(() => props.scopeId, () => {
  clearLocalContext();
  open.value = true;
  void load();
}, { flush: 'sync' });

function checkExpiry() {
  nowMs.value = Date.now();
  // Display-only deadline: retain the receipt and attempt until the server reconciles it.
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
  if (!claimId || terminal.value) { previewState.value = 'idle'; return; }
  if (!scopeId || (reservationAttemptStarted.value && attemptScopeId.value !== scopeId)) { previewState.value = 'no_scope'; return; }
  // A fresh eligibility preview can reject quota consumed by this very reservation.
  // Replay only its saved identity; the server resolves the outcome idempotently.
  const replay = pendingAttempt();
  if (replay) { preview.value = replay.preview; previewState.value = 'ready'; return; }
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
  if (reservationAttemptStarted.value || reservation.value) {
    state.value = 'ready';
    if (!reservation.value) void loadPreview();
    else if (reservation.value.scopeId === props.scopeId && customerId.value) {
      preview.value = cache.getQueryData<SavedAttempt>(attemptKey(customerId.value, reservation.value.scopeId))?.preview ?? null;
      previewState.value = preview.value ? 'ready' : 'idle';
    }
    return;
  }
  const saved = customerId.value && props.scopeId ? cache.getQueryData<SavedAttempt>(attemptKey(customerId.value, props.scopeId)) : undefined;
  if (saved) {
    reservationAttemptStarted.value = true;
    attemptScopeId.value = props.scopeId;
    attemptId.value = saved.attemptId;
    offers.value = [saved.offer];
    terminal.value = saved.terminal ?? null;
    selectedId.value = saved.offer.id;
    reservation.value = saved.terminal ? null : saved.reservation;
    preview.value = saved.terminal ? null : saved.preview;
    previewState.value = 'ready';
    state.value = 'ready';
    if (saved.terminal) emit('terminal', saved.terminal);
    else if (saved.reservation) emit('applied', { reservation: saved.reservation, preview: saved.preview });
    return;
  }
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
  if (!reservationAttemptStarted.value && !reservation.value) {
    offers.value = []; selectedId.value = '';
  }
  returnSelectionMessage.value = '';
  error.value = '';
  state.value = 'offline';
}

function handleOnline() {
  if (open.value && state.value === 'offline') void load();
}

watch(customerId, () => {
  clearLocalContext();
  open.value = false;
}, { flush: 'sync' });

watch(() => route.query.voucherClaimId, (claimId) => {
  if (offers.value.length > 0) selectReturnedClaim(claimId);
}, { flush: 'sync' });

watch(selectedId, () => {
  if (switchingContext) return;
  if (!reservationAttemptStarted.value && !reservation.value) resetAttempt();
  void loadPreview();
}, { flush: 'sync' });

onMounted(() => {
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
  expiryTimer = setInterval(checkExpiry, 1000);
  void load();
});

onBeforeUnmount(() => {
  disposed = true;
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

    <p v-if="terminal" role="alert" class="mt-3 text-sm text-warning-800" data-testid="checkout-voucher-terminal">{{ terminalMessage }}
      <button type="button" class="min-h-11 text-brand-700 underline" @click="emit('terminal', terminal)">Kiểm tra thanh toán</button>
    </p>
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
        <p v-if="reservation && remainingSeconds !== null" class="mt-2 text-xs leading-5 text-warning-800" role="status">Còn {{ Math.floor(remainingSeconds / 60) }} phút {{ String(remainingSeconds % 60).padStart(2, '0') }} giây để hoàn tất thanh toán. {{ preview.customerDueVnd === 0 ? 'Chờ bạn bấm Xác nhận tất toán 0 ₫ ở màn thanh toán.' : 'Chưa ghi nhận thanh toán.' }}</p>
        <p v-else class="mt-2 text-xs leading-5 text-ink-600">Số tiền này chỉ để xem trước. Hóa đơn và thanh toán hiện tại vẫn dùng tổng gốc.</p>
      </div>

      <p v-if="applyError" class="text-sm text-danger-700" role="alert" data-testid="checkout-voucher-apply-error">{{ applyError }}</p>
      <div v-if="reservation" class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-success-700" role="status">Voucher đã giữ chỗ, chưa xác nhận thanh toán.</span>
        <span class="text-xs text-ink-600">Chưa thể đổi voucher khi chưa xác nhận hủy giữ chỗ an toàn.</span>
        <button type="button" data-testid="checkout-voucher-reconcile" class="min-h-11 text-sm font-medium text-brand-700 underline" :disabled="applying || requestPending || reservation.scopeId !== scopeId" @click="reconcileReservation">Kiểm tra giữ chỗ</button>
      </div>
      <FhButton
        v-else
        data-testid="checkout-voucher-apply"
        variant="secondary"
        size="md"
        :disabled="!canApply"
        :loading="applying"
        @click="applyVoucher"
      >{{ applying ? 'Đang giữ chỗ…' : preview?.paymentAvailable === true ? 'Áp dụng voucher' : 'Máy chủ chưa sẵn sàng' }}</FhButton>
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
      :applying="applying || requestPending"
      :selection-disabled="reservationAttemptStarted || !!reservation || !!terminal"
      :apply-error="applyError"
      :server-reservation="reservation ? { voucherId: reservation.claimId, expiresAt: reservation.expiresAt, serverTimeAtResponse: reservation.serverTimeAtResponse ?? '', receivedAtMs: reservation.receivedAtMs } : null"
      @close="open = false"
      @retry="load"
      @select="selectOffer"
      @apply="applyVoucher"
      @retry-preview="loadPreview"
    >
      <template #secondary><RouterLink :to="walletLocation" class="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-brand-600">Mở ví ưu đãi</RouterLink></template>
    </VoucherSelectionSheet>
  </section>
</template>
