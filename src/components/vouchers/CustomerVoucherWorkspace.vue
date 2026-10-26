<script setup lang="ts">
import { computed, ref } from 'vue';
import { BadgePercent, CircleHelp, Search } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
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
const tabs: { key: VoucherTab; label: string; icon: typeof BadgePercent }[] = [
  { key: 'mine', label: 'Ưu đãi của tôi', icon: BadgePercent },
  { key: 'general', label: 'Ưu đãi chung', icon: Search },
  { key: 'history', label: 'Đã sử dụng', icon: CircleHelp },
];

function belongsToCustomer(offer: VoucherOffer): boolean {
  return canShowCustomerWalletVoucher(offer, props.customerId);
}

const visibleOffers = computed(() => {
  if (activeTab.value === 'general') {
    return props.offers.filter((offer) => offer.kind === 'GENERAL' && !offer.walletStatus);
  }
  if (activeTab.value === 'history') {
    return props.offers.filter((offer) => belongsToCustomer(offer)
      && ['USED', 'EXPIRED', 'REVOKED'].includes(offer.walletStatus ?? ''));
  }
  return props.offers.filter((offer) => belongsToCustomer(offer)
    && ['AVAILABLE', 'RESERVED'].includes(offer.walletStatus ?? ''));
});

const emptyTitle = computed(() => activeTab.value === 'mine'
  ? 'Ví ưu đãi của bạn đang trống'
  : activeTab.value === 'general' ? 'Chưa có ưu đãi chung' : 'Chưa có ưu đãi đã dùng');
const emptyMessage = computed(() => activeTab.value === 'mine'
  ? 'Ưu đãi được lưu hoặc cấp riêng sẽ xuất hiện tại đây.'
  : activeTab.value === 'general' ? 'Ưu đãi đang hoạt động sẽ hiển thị khi máy chủ xác nhận.' : 'Ưu đãi đã sử dụng được xác nhận sẽ xuất hiện tại đây.');

function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = tabs.findIndex((tab) => tab.key === activeTab.value);
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? tabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  activeTab.value = tabs[nextIndex].key;
  document.querySelector<HTMLButtonElement>(`[data-voucher-tab="${activeTab.value}"]`)?.focus();
}

function submitCode() {
  const code = manualCode.value.trim();
  if (!props.actionsEnabled || props.busy || !code) return;
  emit('validateCode', code);
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6" data-testid="customer-voucher-workspace">
    <section class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white text-brand-700" aria-hidden="true">
          <BadgePercent :size="21" :stroke-width="1.75" />
        </span>
        <div>
          <h2 class="text-base font-semibold text-ink-900">Dành cho những lần chăm sóc tiếp theo</h2>
          <p class="mt-1 max-w-2xl text-sm leading-5 text-ink-700">Lưu mã được chia sẻ hoặc xem voucher cá nhân đã được cấp. Lưu vào ví chưa có nghĩa là đã áp dụng giảm giá.</p>
        </div>
      </div>
      <div class="flex min-h-10 items-center gap-2 self-start rounded-[var(--radius-sm)] border border-white bg-white px-3 text-sm font-medium text-ink-700 sm:self-auto">
        <span class="h-2 w-2 rounded-full bg-brand-600" aria-hidden="true" />
        Tiền công và linh kiện
      </div>
    </section>

    <section class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4 shadow-[var(--shadow-e1)] sm:p-5" aria-labelledby="voucher-code-heading">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0 flex-1">
          <label id="voucher-code-heading" for="voucher-manual-code" class="block text-sm font-semibold text-ink-900">Bạn có mã ưu đãi?</label>
          <p id="voucher-code-help" class="mt-1 text-sm text-ink-600">Nhập mã ưu đãi chung để lưu vào ví. Mỗi khách chỉ lưu một lần cho mỗi chương trình.</p>
          <input
            id="voucher-manual-code"
            v-model="manualCode"
            aria-label="Mã ưu đãi"
            aria-describedby="voucher-code-help"
            autocomplete="off"
            maxlength="40"
            class="mt-3 min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-600 sm:max-w-xl"
            placeholder="Nhập mã ưu đãi"
            :disabled="!actionsEnabled || busy"
            @keydown.enter.prevent="submitCode"
          />
        </div>
        <FhButton
          variant="secondary"
          size="md"
          :disabled="!actionsEnabled || busy || !manualCode.trim()"
          :loading="busy"
          aria-label="Lưu mã vào ví"
          @click="submitCode"
        >Lưu vào ví</FhButton>
      </div>
      <p v-if="!actionsEnabled" class="mt-3 text-sm text-ink-600" role="note">{{ VOUCHER_UNAVAILABLE_MESSAGE }} Mã sẽ không được gửi đi.</p>
    </section>

    <p v-if="feedback" :role="feedbackError ? 'alert' : 'status'" class="rounded-[var(--radius-sm)] border p-3 text-sm leading-6" :class="feedbackError ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'">{{ feedback }}</p>

    <div class="flex flex-col gap-1">
      <h2 class="text-lg font-semibold text-ink-900">Kho ưu đãi</h2>
      <p class="text-sm text-ink-600">Xem ưu đãi chung, voucher trong ví và lịch sử sử dụng.</p>
    </div>

    <div role="tablist" aria-label="Danh sách ưu đãi" class="flex flex-wrap gap-2 border-b border-ink-200 pb-2" @keydown="onTabKeydown">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :id="`voucher-tab-${tab.key}`"
        :data-voucher-tab="tab.key"
        :aria-label="tab.label"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`voucher-panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 aria-selected:bg-brand-50 aria-selected:text-brand-800"
        @click="activeTab = tab.key"
      >
        <component :is="tab.icon" :size="17" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </div>

    <section :id="`voucher-panel-${activeTab}`" role="tabpanel" :aria-labelledby="`voucher-tab-${activeTab}`" tabindex="0" class="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
      <VoucherStatePanel v-if="activeTab === 'general' && generalLoading" state="loading" />
      <VoucherStatePanel v-else-if="activeTab === 'general' && generalError" state="error" :message="generalError" @retry="$emit('retryGeneral')" />
      <VoucherStatePanel v-else-if="state !== 'ready'" :state="state" :message="message" @retry="$emit('retry')" />
      <VoucherStatePanel v-else-if="activeTab === 'general' && !discoveryAvailable" state="unavailable" title="Khám phá ưu đãi sắp khả dụng" message="Danh sách ưu đãi chung chưa được cung cấp. Nếu bạn đã có mã, hãy nhập mã ở trên để lưu vào ví." />
      <VoucherStatePanel v-else-if="visibleOffers.length === 0" state="empty" :title="emptyTitle" :message="emptyMessage" />
      <ul v-else class="space-y-3" aria-label="Ưu đãi">
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
  </div>
</template>
