<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronDown, TicketPercent } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import VoucherSelectionSheet from './VoucherSelectionSheet.vue';
import { vouchersApi } from '../../api/vouchers.api';
import {
  claimOffer,
  formatVoucherDate,
  voucherDiscountLabel,
  type VoucherOffer,
} from './voucher-model';
import { useAuthStore } from '../../stores/auth';
import { userFacingError } from '../../utils/user-facing-error';

type ChooserState = 'loading' | 'ready' | 'error' | 'denied' | 'offline';

const auth = useAuthStore();
const customerId = computed(() => auth.userRole === 'CUSTOMER' ? auth.user?.id : null);
const open = ref(false);
const state = ref<ChooserState>('loading');
const offers = ref<VoucherOffer[]>([]);
const selectedId = ref('');
const error = ref('');
const selectedOffer = computed(() => offers.value.find((offer) => offer.id === selectedId.value) ?? null);
let sequence = 0;

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function load() {
  const request = ++sequence;
  offers.value = [];
  selectedId.value = '';
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
  offers.value = [];
  selectedId.value = '';
  error.value = '';
  state.value = 'offline';
}

function handleOnline() {
  if (open.value && state.value === 'offline') void load();
}

watch(customerId, () => {
  sequence++;
  offers.value = [];
  selectedId.value = '';
  open.value = false;
}, { flush: 'sync' });

onMounted(() => {
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
});

onBeforeUnmount(() => {
  sequence++;
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('online', handleOnline);
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
    <p class="text-xs leading-5 text-ink-600">Áp dụng ưu đãi khi thanh toán chưa khả dụng. Số tiền hóa đơn được giữ nguyên.</p>

    <div class="mt-3 space-y-3">
      <div v-if="selectedOffer" class="rounded-lg border border-brand-200 bg-brand-50 p-3" data-testid="checkout-voucher-selected">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Đang chọn để xem</p>
        <p class="mt-1 font-medium text-ink-900">{{ selectedOffer.title }}</p>
        <p class="mt-1 text-xs leading-5 text-ink-700">{{ voucherDiscountLabel(selectedOffer) }} · Hạn {{ formatVoucherDate(selectedOffer.expiresAt) }}</p>
        <p class="mt-1 text-xs leading-5 text-ink-600">Chưa áp dụng, chưa giữ chỗ. Số tiền hóa đơn được giữ nguyên.</p>
      </div>
      <p v-else-if="state === 'ready' && offers.length" class="text-sm text-ink-600">
        {{ offers.length }} voucher đã lưu trong ví. Mở bảng chọn để xem điều kiện.
      </p>
      <p v-else-if="state === 'ready'" class="text-sm text-ink-600">Chưa có voucher đã lưu để xem.</p>
      <p v-else-if="state === 'offline'" class="text-sm text-ink-600" role="status">Đang ngoại tuyến. Ví ưu đãi cần kết nối máy chủ.</p>

      <FhButton data-testid="checkout-voucher-apply" variant="secondary" size="md" disabled>Áp dụng ưu đãi chưa khả dụng</FhButton>
      <RouterLink to="/app/vouchers" class="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-brand-600">Mở ví ưu đãi</RouterLink>
    </div>

    <VoucherSelectionSheet
      :open="open"
      :offers="offers"
      :state="state"
      :message="error"
      :selected-id="selectedId"
      :customer-id="customerId"
      @close="open = false"
      @retry="load"
      @select="selectedId = $event"
    />
  </section>
</template>
