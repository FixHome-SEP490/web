<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import CustomerVoucherWorkspace from '../../components/vouchers/CustomerVoucherWorkspace.vue';
import { filterCustomerVoucherOffers, generalOffer, voucherAdapter, type VoucherOffer } from '../../components/vouchers/voucher-model';
import { useAuthStore } from '../../stores/auth.store';
import { vouchersApi } from '../../api/vouchers.api';
import { getHttpStatus } from '../../api/client';
import { userFacingError } from '../../utils/user-facing-error';

type PageState = 'loading' | 'ready' | 'error' | 'denied';
const authStore = useAuthStore();
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
let loadSequence = 0;
let sessionSequence = 0;

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
    await voucherAdapter.claimGeneralVoucher(code);
    if (session !== sessionSequence) return;
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
