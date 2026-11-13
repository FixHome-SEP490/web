<script setup lang="ts">
import { computed, ref } from 'vue';
import { TicketPercent } from 'lucide-vue-next';
import { ConsoleTabs, FhButton, FhCard } from '..';
import VoucherOfferCard from './VoucherOfferCard.vue';
import VoucherStatePanel from './VoucherStatePanel.vue';
import { canShowCustomerWalletVoucher, VOUCHER_UNAVAILABLE_MESSAGE, type VoucherOffer } from './voucher-model';

type WorkspaceState = 'loading' | 'ready' | 'empty' | 'error' | 'unavailable' | 'denied';
type VoucherTab = 'mine' | 'general' | 'history';

const props = withDefaults(defineProps<{
  state: WorkspaceState;
  offers: VoucherOffer[];
  customerId: string | null;
  actionsEnabled: boolean;
  message?: string;
  busy?: boolean;
  feedback?: string;
  feedbackError?: boolean;
  discoveryAvailable?: boolean;
  generalLoading?: boolean;
  generalError?: string;
}>(), { message: '', busy: false, feedback: '', feedbackError: false, discoveryAvailable: true, generalLoading: false, generalError: '' });

const emit = defineEmits<{
  retry: [];
  retryGeneral: [];
  claim: [voucherId: string];
  validateCode: [code: string];
}>();

const activeTab = ref<VoucherTab>('mine');
const manualCode = ref('');

function belongsToCustomer(offer: VoucherOffer): boolean {
  return canShowCustomerWalletVoucher(offer, props.customerId);
}

const mineOffers = computed(() => props.offers.filter((offer) =>
  belongsToCustomer(offer) && ['AVAILABLE', 'RESERVED'].includes(offer.walletStatus ?? '')));
const generalOffers = computed(() => props.offers.filter((offer) =>
  offer.kind === 'GENERAL' && !offer.walletStatus));
const historyOffers = computed(() => props.offers.filter((offer) =>
  belongsToCustomer(offer) && ['USED', 'EXPIRED', 'REVOKED'].includes(offer.walletStatus ?? '')));

const visibleOffers = computed(() => {
  if (activeTab.value === 'general') return generalOffers.value;
  if (activeTab.value === 'history') return historyOffers.value;
  return mineOffers.value;
});

const tabs = computed(() => [
  {
    key: 'mine' as VoucherTab,
    label: 'Ưu đãi của tôi',
    count: props.state === 'ready' ? mineOffers.value.length : null,
    id: 'voucher-tab-mine',
    ariaLabel: 'Ưu đãi của tôi',
    ariaControls: 'voucher-panel-mine',
    attrs: { 'data-voucher-tab': 'mine' },
  },
  {
    key: 'general' as VoucherTab,
    label: 'Ưu đãi chung',
    count: props.state === 'ready' && !props.generalLoading && !props.generalError ? generalOffers.value.length : null,
    id: 'voucher-tab-general',
    ariaLabel: 'Ưu đãi chung',
    ariaControls: 'voucher-panel-general',
    attrs: { 'data-voucher-tab': 'general' },
  },
  {
    key: 'history' as VoucherTab,
    label: 'Đã sử dụng',
    count: props.state === 'ready' && historyOffers.value.length > 0 ? historyOffers.value.length : null,
    id: 'voucher-tab-history',
    ariaLabel: 'Đã sử dụng',
    ariaControls: 'voucher-panel-history',
    attrs: { 'data-voucher-tab': 'history' },
  },
]);

const emptyTitle = computed(() => activeTab.value === 'mine'
  ? 'Ví ưu đãi của bạn đang trống'
  : activeTab.value === 'general' ? 'Chưa có ưu đãi chung' : 'Chưa có ưu đãi đã dùng');
const emptyMessage = computed(() => activeTab.value === 'mine'
  ? 'Ưu đãi được lưu hoặc cấp riêng sẽ xuất hiện tại đây.'
  : activeTab.value === 'general' ? 'Ưu đãi đang hoạt động sẽ hiển thị khi máy chủ xác nhận.' : 'Ưu đãi đã sử dụng được xác nhận sẽ xuất hiện tại đây.');

function submitCode() {
  const code = manualCode.value.trim();
  if (!props.actionsEnabled || props.busy || !code) return;
  emit('validateCode', code);
}
</script>

<template>
  <div class="space-y-5" data-testid="customer-voucher-workspace">
    <!-- Compact Manual Code Redemption Bar -->
    <FhCard
      as="section"
      padding="sm"
      class="rounded-[var(--radius-md)]! shadow-none!"
      aria-labelledby="voucher-code-heading"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-2.5 shrink-0">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700" aria-hidden="true">
            <TicketPercent :size="18" :stroke-width="2" />
          </span>
          <div>
            <label id="voucher-code-heading" for="voucher-manual-code" class="block text-sm font-semibold text-ink-900">
              Bạn có mã ưu đãi?
            </label>
            <p id="voucher-code-help" class="text-xs text-ink-500">
              Mỗi khách chỉ lưu một lần cho mỗi chương trình.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1 sm:justify-end">
          <input
            id="voucher-manual-code"
            v-model="manualCode"
            aria-label="Mã ưu đãi"
            aria-describedby="voucher-code-help"
            autocomplete="off"
            maxlength="40"
            class="h-11 min-w-0 w-full rounded-[var(--radius-sm)] border border-ink-300 bg-ink-25/60 px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 sm:max-w-xs"
            placeholder="Nhập mã ưu đãi"
            :disabled="!actionsEnabled || busy"
            @keydown.enter.prevent="submitCode"
          />
          <FhButton
            variant="secondary"
            size="md"
            class="w-full sm:w-auto shrink-0"
            :disabled="!actionsEnabled || busy || !manualCode.trim()"
            :loading="busy"
            aria-label="Lưu mã vào ví"
            @click="submitCode"
          >Lưu vào ví</FhButton>
        </div>
      </div>

      <p v-if="!actionsEnabled" class="mt-2.5 text-xs sm:text-sm text-ink-600" role="note">
        {{ VOUCHER_UNAVAILABLE_MESSAGE }} Mã sẽ không được gửi đi.
      </p>
    </FhCard>

    <Transition name="fh-fade-slide">
      <p
        v-if="feedback"
        :role="feedbackError ? 'alert' : 'status'"
        class="rounded-[var(--radius-sm)] border p-3 text-sm leading-6"
        :class="feedbackError ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'"
      >{{ feedback }}</p>
    </Transition>

    <ConsoleTabs
      v-model="activeTab"
      variant="pill"
      :tabs="tabs"
      aria-label="Danh sách ưu đãi"
      roving-tabindex
    />

    <Transition name="fh-fade-slide" mode="out-in">
      <section
        :key="activeTab"
        :id="`voucher-panel-${activeTab}`"
        role="tabpanel"
        :aria-labelledby="`voucher-tab-${activeTab}`"
        tabindex="0"
        class="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <VoucherStatePanel v-if="activeTab === 'general' && generalLoading" state="loading" />
        <VoucherStatePanel v-else-if="activeTab === 'general' && generalError" state="error" :message="generalError" @retry="$emit('retryGeneral')" />
        <VoucherStatePanel v-else-if="state !== 'ready'" :state="state" :message="message" @retry="$emit('retry')" />
        <VoucherStatePanel v-else-if="activeTab === 'general' && !discoveryAvailable" state="unavailable" title="Khám phá ưu đãi sắp khả dụng" message="Danh sách ưu đãi chung chưa được cung cấp. Nếu bạn đã có mã, hãy nhập mã ở trên để lưu vào ví." />
        <VoucherStatePanel v-else-if="visibleOffers.length === 0" state="empty" :title="emptyTitle" :message="emptyMessage" />
        <ul v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4" aria-label="Ưu đãi">
          <li v-for="offer in visibleOffers" :key="offer.id">
            <VoucherOfferCard
              :offer="offer"
              :connected="actionsEnabled && !busy"
              :customer-id="customerId"
              :action-label="offer.walletStatus === 'USED' ? 'Đã sử dụng' : offer.walletStatus === 'EXPIRED' ? 'Đã hết hạn' : offer.walletStatus === 'REVOKED' ? 'Đã thu hồi' : offer.walletStatus ? 'Đã lưu trong ví' : 'Lưu vào ví'"
              :disabled-reason="!actionsEnabled ? VOUCHER_UNAVAILABLE_MESSAGE : ''"
              @activate="$emit('claim', offer.code)"
            />
          </li>
        </ul>
      </section>
    </Transition>
  </div>
</template>
