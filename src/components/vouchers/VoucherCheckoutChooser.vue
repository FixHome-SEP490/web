<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronDown, TicketPercent } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import VoucherStatePanel from './VoucherStatePanel.vue';
import { vouchersApi } from '../../api/vouchers.api';
import { claimOffer, voucherDiscountLabel, formatVoucherDate, type VoucherOffer } from './voucher-model';
import { useAuthStore } from '../../stores/auth';
import { userFacingError } from '../../utils/user-facing-error';
const auth = useAuthStore();
const customerId = computed(() => auth.userRole === 'CUSTOMER' ? auth.user?.id : null);
const open = ref(false);
const state = ref<'loading' | 'ready' | 'error' | 'denied'>('loading');
const offers = ref<VoucherOffer[]>([]);
const selectedId = ref('');
const error = ref('');
let sequence = 0;
async function load() {
  const request = ++sequence;
  offers.value = [];
  selectedId.value = '';
  if (!customerId.value) { state.value = 'denied'; return; }
  const owner = customerId.value;
  state.value = 'loading';
  try {
    const result = await vouchersApi.wallet();
    if (request !== sequence) return;
    offers.value = result.filter(c => c.status === 'CLAIMED').map(c => claimOffer(c, owner));
    state.value = 'ready';
  } catch (e) {
    if (request !== sequence) return;
    state.value = 'error';
    error.value = userFacingError(e, 'Chưa tải được ví ưu đãi. Vui lòng thử lại.');
  }
}
function toggle() { open.value = !open.value; if (open.value) void load(); }
watch(customerId, () => { sequence++; offers.value = []; selectedId.value = ''; open.value = false; }, { flush: 'sync' });
onBeforeUnmount(() => { sequence++; });
</script>

<template>
  <section class="min-w-0 rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm" data-testid="voucher-checkout-chooser">
    <button type="button" data-testid="open-voucher-chooser" :aria-expanded="open" class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-600" @click="toggle"><span class="inline-flex items-center gap-2 font-medium"><TicketPercent :size="18" aria-hidden="true" />Voucher ưu đãi</span><ChevronDown :size="18" aria-hidden="true" /></button>
    <p class="text-xs leading-5 text-ink-600">Áp dụng ưu đãi khi thanh toán chưa khả dụng. Số tiền hóa đơn được giữ nguyên.</p>
    <div v-if="open" class="mt-3 space-y-3">
      <VoucherStatePanel v-if="state !== 'ready'" :state="state" :message="error" @retry="load" />
      <p v-else-if="!offers.length" class="text-sm text-ink-600">Chưa có voucher đã lưu để xem.</p>
      <ul v-else class="space-y-2" aria-label="Voucher trong ví"><li v-for="offer in offers" :key="offer.id"><button type="button" data-testid="checkout-voucher-option" :aria-pressed="selectedId === offer.id" class="min-h-11 w-full rounded-lg border border-ink-200 bg-white p-3 text-left aria-pressed:border-brand-600 aria-pressed:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600" @click="selectedId = offer.id"><span class="block font-medium text-ink-900">{{ offer.title }}</span><span class="mt-1 block text-xs leading-5 text-ink-600">{{ voucherDiscountLabel(offer) }} · Hạn {{ formatVoucherDate(offer.expiresAt) }}</span></button></li></ul>
      <p v-if="selectedId" class="text-xs leading-5 text-ink-600">Chỉ xem voucher trong ví. Chưa kiểm tra điều kiện, giữ chỗ hoặc áp dụng vào hóa đơn.</p>
      <FhButton data-testid="checkout-voucher-apply" variant="secondary" size="md" disabled>Áp dụng ưu đãi chưa khả dụng</FhButton>
      <RouterLink to="/app/vouchers" class="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-brand-600">Mở ví ưu đãi</RouterLink>
    </div>
  </section>
</template>
