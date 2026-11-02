<script setup lang="ts">
// Customer wallet (PO 08/10/2026): the balance, a VNPay top-up, and the
// history of top-ups, invoice payments, refunds and withdrawals. Since PO
// 14/10/2026 the balance can also be withdrawn to the customer's bank account
// after a one-time identity check (CustomerWithdrawPanel).
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CreditCard, RefreshCw, Wallet } from 'lucide-vue-next';
import { FhButton, FhMoney, FhPagination, FhSkeleton } from '../../components';
import CustomerWithdrawPanel from '../../components/customer/CustomerWithdrawPanel.vue';
import CustomerWithdrawalHistory from '../../components/customer/CustomerWithdrawalHistory.vue';
import { useQueryChoice } from '../../composables/useQueryState';
import { customerWalletApi, customerWalletTypeLabels, isIncomingWalletTransaction, type CustomerWalletTransaction } from '../../api/customer-wallet.api';
import { usePagedList } from '../../composables/usePagedList';
import { pageCount, type PageResult } from '../../api/paging';
import { queryKeys } from '../../lib/query-keys';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';

const route = useRoute();
// Top up or withdraw; ?action=withdraw opens the withdrawal (the identity page links back to it).
const action = useQueryChoice<'topup' | 'withdraw'>('action', ['topup', 'withdraw'], 'topup');
const PRESETS = [100_000, 200_000, 500_000, 1_000_000];
const MIN = 10_000;
const MAX = 50_000_000;

const PAGE_SIZE = 20;
// One request reads the balance and a page of the history (?page=2 in the address).
const {
  page,
  items: transactions,
  total,
  loading,
  error,
  load,
  refreshing,
  result,
  changingPage,
  prefetch,
} = usePagedList<CustomerWalletTransaction, PageResult<CustomerWalletTransaction> & { balance: number }>({
  key: () => queryKeys.wallet.customer({}),
  pageSize: PAGE_SIZE,
  fetch: async (p, size) => {
    const result = await customerWalletApi.summary(p, size);
    return {
      items: result.transactions,
      total: result.meta.total,
      page: result.meta.page || p,
      pageSize: size,
      balance: result.balance,
    };
  },
});
const balance = computed(() => result.value?.balance ?? 0);
const balanceLoaded = computed(() => result.value !== null);
const totalPages = computed(() => pageCount(total.value, PAGE_SIZE));
const loadError = computed(() => (error.value ? userFacingError(error.value, 'Chưa tải được ví, vui lòng thử lại.') : ''));
const paymentStatusMessage = computed(() => {
  if (loadError.value) {
    return {
      title: 'Chưa tải được số dư và lịch sử ví',
      description: 'Trạng thái giao dịch nạp tiền này chưa được xác minh.',
    };
  }
  if (loading.value || refreshing.value) {
    return {
      title: 'Đang tải số dư và lịch sử ví',
      description: 'Trạng thái giao dịch nạp tiền này chưa được xác minh.',
    };
  }
  return {
    title: 'Giao dịch nạp tiền chưa được xác minh',
    description: 'Số dư và lịch sử ví bên dưới là dữ liệu tài khoản, không xác nhận khoản nạp cụ thể.',
  };
});

const amountText = ref('');
const topUpError = ref('');
const redirecting = ref(false);

// A VNPay return query is editable and does not prove this payment's outcome.
const hasPaymentReturn = computed(() => {
  const status = route.query?.payment;
  return status === 'success' || status === 'failed';
});

const ACTIONS = [
  { key: 'topup' as const, label: 'Nạp tiền', icon: ArrowDownLeft },
  { key: 'withdraw' as const, label: 'Rút tiền', icon: ArrowUpRight },
];

const LABELS = customerWalletTypeLabels;
const isIncoming = isIncomingWalletTransaction;

async function topUp() {
  if (redirecting.value) return;
  topUpError.value = '';
  const amount = Number(String(amountText.value).replace(/[.,\s]/g, ''));
  if (!Number.isInteger(amount) || amount < MIN || amount > MAX) {
    topUpError.value = 'Số tiền nạp từ 10.000 ₫ đến 50.000.000 ₫.';
    return;
  }
  redirecting.value = true;
  try {
    window.location.href = await customerWalletApi.topUp(amount);
  } catch (err) {
    topUpError.value = userFacingError(err, 'Chưa mở được cổng VNPay, thử lại sau.');
    redirecting.value = false;
  }
}

</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6 pb-16">
    <!-- Header -->
    <div>
      <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight flex items-center gap-2.5">
        <Wallet :size="28" class="text-brand-600 shrink-0" />
        <span>Ví của tôi</span>
      </h1>
      <p class="text-sm text-ink-500 mt-1">
        Nạp, rút và theo dõi các khoản thanh toán đơn sửa chữa, hoàn tiền linh kiện.
      </p>
    </div>

    <!-- A return query is not a payment confirmation. -->
    <div
      v-if="hasPaymentReturn"
      role="status"
      data-testid="topup-result"
      :aria-busy="loading || refreshing"
      class="rounded-2xl border border-brand-200 bg-brand-50/90 p-4 text-sm text-brand-800 flex flex-col sm:flex-row sm:items-start gap-3 shadow-xs"
    >
      <div class="flex items-start gap-3 min-w-0 flex-1">
        <RefreshCw :size="20" class="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div class="space-y-0.5">
          <p class="font-bold">{{ paymentStatusMessage.title }}</p>
          <p class="text-pretty">{{ paymentStatusMessage.description }}</p>
        </div>
      </div>
      <FhButton
        variant="secondary"
        size="sm"
        data-testid="wallet-payment-refresh"
        aria-label="Làm mới số dư và lịch sử ví"
        :disabled="loading || refreshing"
        @click="load"
      >
        Làm mới
      </FhButton>
    </div>

    <!-- Balance and top-up: one surface -->
    <section class="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div class="p-5 space-y-1">
        <p class="text-sm text-ink-500">Số dư</p>
        <p class="text-3xl font-bold text-ink-900 font-num whitespace-nowrap" data-testid="wallet-balance">
          <span v-if="!balanceLoaded && loading" class="block w-40" aria-busy="true" aria-label="Đang tải số dư"><FhSkeleton height="36px" /></span>
          <FhMoney v-else-if="balanceLoaded" :amount="balance" emphasis />
          <span v-else>—</span>
        </p>
        <p class="text-sm text-ink-500 text-pretty">Dùng để trả đơn sửa chữa hoặc rút về tài khoản ngân hàng của bạn.</p>
        <div class="grid grid-cols-2 gap-2 pt-3" role="group" aria-label="Chọn thao tác với ví">
          <button
            v-for="choice in ACTIONS"
            :key="choice.key"
            type="button"
            class="h-11 rounded-xl border text-sm font-semibold whitespace-nowrap inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            :class="action === choice.key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-700 hover:border-ink-300'"
            :aria-pressed="action === choice.key"
            :data-testid="`wallet-action-${choice.key}`"
            @click="action = choice.key"
          >
            <component :is="choice.icon" :size="16" aria-hidden="true" />
            {{ choice.label }}
          </button>
        </div>
      </div>

      <div v-if="action === 'withdraw'" class="p-5 border-t border-ink-100">
        <CustomerWithdrawPanel />
      </div>

      <!-- Top-up Section -->
      <div v-else class="p-6 sm:p-8 space-y-5 border-t border-ink-100">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-bold text-ink-900 flex items-center gap-2">
            <CreditCard :size="18" class="text-brand-600" />
            <span>Nạp tiền qua VNPay</span>
          </h2>
          <span class="text-xs text-ink-500 font-medium hidden sm:inline">Hỗ trợ mọi ngân hàng & thẻ ATM / QR</span>
        </div>

        <!-- Presets Buttons -->
        <div class="space-y-2">
          <p class="text-xs font-medium text-ink-600">Chọn nhanh số tiền nạp:</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              v-for="preset in PRESETS"
              :key="preset"
              type="button"
              class="h-11 rounded-xl border text-sm font-bold font-num whitespace-nowrap transition-all flex items-center justify-center cursor-pointer select-none"
              :class="Number(amountText) === preset
                ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-2xs scale-[1.02]'
                : 'border-ink-200 text-ink-700 bg-white hover:border-brand-300 hover:bg-brand-50/30'"
              :aria-pressed="Number(amountText) === preset"
              @click="amountText = String(preset)"
            >
              <FhMoney :amount="preset" />
            </button>
          </div>
        </div>

        <!-- Custom Input & Submit Button -->
        <div class="space-y-2 pt-1">
          <p class="text-xs font-medium text-ink-600">Hoặc nhập số tiền khác:</p>
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="relative flex-1 min-w-0">
              <input
                v-model="amountText"
                type="number"
                inputmode="numeric"
                min="10000"
                max="50000000"
                step="10000"
                placeholder="Số tiền khác (từ 10.000 ₫)"
                aria-label="Số tiền nạp"
                data-testid="topup-amount"
                class="w-full h-11.5 rounded-xl border border-ink-200 px-3.5 text-base sm:text-sm font-semibold font-num text-ink-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/15 transition-all placeholder:font-normal placeholder:text-ink-400"
              />
            </div>
            <FhButton
              variant="primary"
              size="md"
              :loading="redirecting"
              data-testid="topup-submit"
              class="h-11.5 px-6 font-semibold shrink-0"
              @click="topUp"
            >
              Nạp qua VNPay
            </FhButton>
          </div>
          <p v-if="topUpError" role="alert" class="text-xs font-semibold text-danger-700 flex items-center gap-1.5 pt-1">
            <AlertCircle :size="14" class="shrink-0" />
            <span>{{ topUpError }}</span>
          </p>
        </div>
      </div>
    </section>

    <CustomerWithdrawalHistory v-if="action === 'withdraw'" />

    <!-- History Section -->
    <section class="rounded-3xl border border-ink-200/90 bg-white p-6 sm:p-8 space-y-4 shadow-xs">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-bold text-ink-900 flex items-center gap-2">
          <RefreshCw :size="18" class="text-brand-600" />
          <span>Lịch sử giao dịch</span>
        </h2>
        <span v-if="transactions.length > 0" class="text-xs text-ink-500 font-num">
          Trang {{ page }} / {{ totalPages || 1 }}
        </span>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-4 py-2" aria-busy="true" aria-label="Đang tải giao dịch">
        <div v-for="i in 3" :key="i" class="flex items-center justify-between gap-3 py-2 border-b border-ink-50">
          <div class="flex items-center gap-3 w-1/2">
            <FhSkeleton width="36px" height="36px" rounded="lg" />
            <div class="space-y-1 flex-1">
              <FhSkeleton width="60%" height="16px" />
              <FhSkeleton width="40%" height="12px" />
            </div>
          </div>
          <FhSkeleton width="90px" height="20px" />
        </div>
      </div>
      <div v-else-if="loadError" class="flex flex-wrap items-center justify-between gap-3 py-1">
        <p class="text-sm text-ink-700">{{ loadError }}</p>
        <FhButton v-if="!hasPaymentReturn" variant="secondary" size="sm" @click="load">Thử lại</FhButton>
      </div>
      <p v-else-if="transactions.length === 0" class="text-sm text-ink-500">Chưa có giao dịch nào.</p>
      <ul
        v-else
        class="divide-y divide-ink-100 transition-opacity"
        :class="{ 'opacity-60': changingPage }"
        :aria-busy="changingPage"
        data-testid="wallet-transactions"
      >
        <li v-for="t in transactions" :key="t.id" class="flex items-start justify-between gap-3 py-3 text-sm">
          <div class="min-w-0">
            <p class="font-semibold text-ink-900">{{ LABELS[t.type] ?? 'Giao dịch' }}</p>
            <p v-if="t.description" class="text-ink-500 text-pretty">{{ t.description }}</p>
            <p class="text-ink-500 font-num whitespace-nowrap">{{ vnDateTimeString(t.createdAt) }}</p>
          </div>

          <div class="shrink-0 text-right space-y-0.5">
            <p
              class="font-bold font-num text-sm whitespace-nowrap"
              :class="isIncoming(t) ? 'text-success-700' : 'text-ink-900'"
            >
              {{ isIncoming(t) ? '+' : '−' }}<FhMoney :amount="t.amount" />
            </p>
            <p class="text-xs text-ink-500 whitespace-nowrap font-num">
              Số dư <span class="font-medium text-ink-700"><FhMoney :amount="t.balanceAfter" /></span>
            </p>
          </div>
        </li>
      </ul>
      <FhPagination
        v-if="!loadError"
        v-model:page="page"
        :page-size="PAGE_SIZE"
        :total="total"
        :disabled="loading"
        @prefetch="prefetch"
      />
    </section>
  </div>
</template>
