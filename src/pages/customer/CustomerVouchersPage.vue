<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FhButton from '../../components/FhButton.vue';
import CustomerVoucherWorkspace from '../../components/vouchers/CustomerVoucherWorkspace.vue';
import { filterCustomerVoucherOffers, generalOffer, voucherAdapter, type VoucherOffer } from '../../components/vouchers/voucher-model';
import { useAuthStore } from '../../stores/auth.store';
import { vouchersApi } from '../../api/vouchers.api';
import { getHttpStatus } from '../../api/client';
import { userFacingError } from '../../utils/user-facing-error';

type PageState = 'loading' | 'ready' | 'error' | 'denied';
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const customerId = computed(() => authStore.userRole === 'CUSTOMER' ? authStore.user?.id ?? null : null);
const state = ref<PageState>('loading');
const offers = ref<VoucherOffer[]>([]);
const message = ref('');
const feedback = ref('');
const generalOffers = ref<VoucherOffer[]>([]);
const generalError = ref('');
const generalLoading = ref(false);
let generalSequence = 0;
const feedbackError = ref(false);
const busy = ref(false);
const returnTarget = computed(() => {
  const value = route.query.returnTo;
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/app/')
    || value.startsWith('//') || value.includes('\\')) return null;
  const resolved = router.resolve(value);
  return ['customer-order-detail', 'customer-visit'].includes(String(resolved.name)) ? resolved : null;
});
const returnableOffers = computed(() => offers.value.filter((offer) => offer.walletStatus === 'AVAILABLE'));
let loadSequence = 0;
let sessionSequence = 0;

function returnToCheckout(claimId: string, newlyClaimed = false) {
  const target = returnTarget.value;
  if (!target || !customerId.value || (!newlyClaimed && !returnableOffers.value.some((offer) => offer.id === claimId))) return;
  return router.push({
    path: target.path,
    query: { ...target.query, voucherClaimId: claimId },
    hash: target.hash,
  });
}

async function load() {
  const sequence = ++loadSequence;
  const id = customerId.value;
  offers.value = [];
  message.value = '';
  if (!id) {
    state.value = 'denied';
    message.value = 'Đăng nhập bằng tài khoản khách hàng để xem ví ưu đãi.';
    return;
  }
  state.value = 'loading';
  try {
    const snapshot = await voucherAdapter.loadCustomerSnapshot(id);
    if (sequence !== loadSequence || snapshot.customerId !== id || customerId.value !== id) return;
    offers.value = filterCustomerVoucherOffers(snapshot.vouchers, id);
    state.value = 'ready';
  } catch (error) {
    if (sequence !== loadSequence) return;
    state.value = [401, 403].includes(getHttpStatus(error) ?? 0) ? 'denied' : 'error';
    message.value = userFacingError(error, 'Chưa tải được ưu đãi. Vui lòng thử lại.');
  }
}

async function loadGeneral() {
  const sequence = ++generalSequence;
  generalOffers.value = [];
  generalError.value = '';
  if (!customerId.value) return;
  generalLoading.value = true;
  try {
    const result = await vouchersApi.general();
    if (sequence === generalSequence) generalOffers.value = result.map(generalOffer);
  } catch (error) {
    if (sequence === generalSequence) generalError.value = userFacingError(error, 'Chưa tải được ưu đãi chung. Vui lòng thử lại.');
  } finally {
    if (sequence === generalSequence) generalLoading.value = false;
  }
}
watch(customerId, () => {
  sessionSequence++;
  busy.value = false;
  feedback.value = '';
  void load();
  void loadGeneral();
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { loadSequence++; generalSequence++; sessionSequence++; });

async function claimCode(code: string) {
  if (busy.value || state.value !== 'ready' || !customerId.value) return;
  const session = sessionSequence;
  busy.value = true;
  feedback.value = '';
  try {
    const claim = await voucherAdapter.claimGeneralVoucher(code);
    if (session !== sessionSequence) return;
    if (returnTarget.value) {
      await returnToCheckout(claim.id, true);
      return;
    }
    feedbackError.value = false;
    feedback.value = 'Đã lưu mã ưu đãi vào ví.';
    await Promise.all([load(), loadGeneral()]);
  } catch (error) {
    if (session !== sessionSequence) return;
    feedbackError.value = true;
    feedback.value = getHttpStatus(error) === 429
      ? 'Bạn đã thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.'
      : userFacingError(error, 'Chưa xác nhận được kết quả. Hãy tải lại ví để kiểm tra trước khi thử lại.');
  } finally {
    if (session === sessionSequence) busy.value = false;
  }
}
</script>

<template>
  <main :key="customerId ?? 'guest'" lang="vi" class="mx-auto w-full max-w-[1120px] space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-7" data-testid="customer-vouchers-page">
    <header>
      <p class="text-sm font-medium text-brand-700">FixHome · Khách hàng</p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">Ví ưu đãi</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-600">Ưu đãi chung đã lưu và voucher dành riêng cho bạn, trong cùng một ví.</p>
    </header>

    <section
      v-if="returnTarget"
      class="rounded-[var(--radius-md)] border border-brand-200 bg-brand-50 p-4 sm:p-5"
      data-testid="voucher-return-to-checkout"
      aria-labelledby="voucher-return-heading"
    >
      <h2 id="voucher-return-heading" class="text-base font-semibold text-ink-900">Chọn voucher cho lượt thanh toán</h2>
      <p class="mt-1 text-sm leading-5 text-ink-700">Chọn voucher đã lưu để quay lại đơn hàng. Máy chủ sẽ kiểm tra điều kiện và hiển thị số tiền trước khi bạn xác nhận giữ chỗ.</p>
      <ul v-if="returnableOffers.length" class="mt-3 space-y-2">
        <li v-for="offer in returnableOffers" :key="offer.id" class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-brand-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-ink-900">{{ offer.title }}</span>
            <span class="block text-xs leading-5 text-ink-600">{{ offer.code }} · {{ offer.kind === 'GENERAL' ? 'Ưu đãi chung' : 'Ưu đãi cá nhân' }}</span>
          </span>
          <FhButton variant="secondary" size="md" class="w-full sm:w-auto" @click="returnToCheckout(offer.id)">Chọn cho thanh toán</FhButton>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-ink-700" role="status">Ví chưa có voucher đang dùng được. Bạn có thể lưu một ưu đãi chung bên dưới rồi quay lại lượt thanh toán.</p>
    </section>

    <CustomerVoucherWorkspace
      :state="state"
      :offers="[...offers, ...generalOffers]"
      :customer-id="customerId"
      :actions-enabled="state === 'ready'"
      :busy="busy"
      :feedback="feedback"
      :feedback-error="feedbackError"
      :general-loading="generalLoading"
      :general-error="generalError"
      :message="message"
      @retry="load"
      @retry-general="loadGeneral"
      @claim="claimCode"
      @validate-code="claimCode"
    />
  </main>
</template>
