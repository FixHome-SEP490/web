<script setup lang="ts">
// Customer wallet (PO 08/10/2026): the balance, a VNPay top-up, and the
// history of top-ups, invoice payments and refunds. Money in the wallet pays
// FixHome orders; it cannot be withdrawn.
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { FhButton, FhMoney, FhSkeleton } from '../../components';
import { customerWalletApi, customerWalletTypeLabels, isIncomingWalletTransaction, type CustomerWalletTransaction } from '../../api/customer-wallet.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';

const route = useRoute();
const PRESETS = [100_000, 200_000, 500_000, 1_000_000];
const MIN = 10_000;
const MAX = 50_000_000;

const balance = ref(0);
const transactions = ref<CustomerWalletTransaction[]>([]);
const page = ref(1);
const totalPages = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref('');

const amountText = ref('');
const topUpError = ref('');
const redirecting = ref(false);

// Back from VNPay: ?payment=success|failed&amount=...
const paymentResult = computed(() => {
  const status = route.query?.payment;
  if (status !== 'success' && status !== 'failed') return null;
  const amount = Number(route.query?.amount);
  return { ok: status === 'success', amount: Number.isFinite(amount) ? amount : null };
});

const LABELS = customerWalletTypeLabels;
const isIncoming = isIncomingWalletTransaction;

async function load(next = 1) {
  if (next === 1) loading.value = true;
  else loadingMore.value = true;
  loadError.value = '';
  try {
    const result = await customerWalletApi.summary(next, 20);
    balance.value = result.balance;
    transactions.value = next === 1 ? result.transactions : [...transactions.value, ...result.transactions];
    page.value = result.meta.page;
    totalPages.value = result.meta.totalPages;
  } catch (err) {
    loadError.value = userFacingError(err, 'Chưa tải được ví, vui lòng thử lại.');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

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

onMounted(() => load(1));
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-5 pb-12">
    <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Ví của tôi</h1>

    <p v-if="paymentResult?.ok" role="status" data-testid="topup-result" class="rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800 text-pretty">
      Đã nạp<template v-if="paymentResult.amount"> <FhMoney :amount="paymentResult.amount" /></template> vào ví. Số dư cập nhật khi VNPay xác nhận, thường trong vài giây.
    </p>
    <p v-else-if="paymentResult" role="alert" data-testid="topup-result" class="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800 text-pretty">
      Giao dịch nạp ví chưa thành công, tiền chưa bị trừ. Bạn có thể thử lại.
    </p>

    <!-- Balance and top-up: one surface -->
    <section class="rounded-2xl border border-ink-200 bg-white overflow-hidden">
      <div class="p-5 space-y-1">
        <p class="text-sm text-ink-500">Số dư</p>
        <p class="text-3xl font-bold text-ink-900 font-num whitespace-nowrap" data-testid="wallet-balance">
          <span v-if="loading" class="block w-40" aria-busy="true" aria-label="Đang tải số dư"><FhSkeleton height="36px" /></span>
          <FhMoney v-else :amount="balance" emphasis />
        </p>
        <p class="text-sm text-ink-500">Dùng để trả đơn sửa chữa, không rút ra được.</p>
      </div>

      <div class="p-5 border-t border-ink-100 space-y-3">
        <h2 class="text-base font-semibold text-ink-900">Nạp tiền qua VNPay</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="preset in PRESETS"
            :key="preset"
            type="button"
            class="h-9 rounded-xl border px-3 text-sm font-semibold whitespace-nowrap"
            :class="Number(amountText) === preset ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-700 hover:border-ink-300'"
            :aria-pressed="Number(amountText) === preset"
            @click="amountText = String(preset)"
          >
            <FhMoney :amount="preset" />
          </button>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            v-model="amountText"
            type="number"
            inputmode="numeric"
            min="10000"
            max="50000000"
            step="10000"
            placeholder="Số tiền khác"
            aria-label="Số tiền nạp"
            data-testid="topup-amount"
            class="w-full sm:flex-1 min-w-0 h-11 rounded-xl border border-ink-200 px-3 text-base sm:text-sm"
          />
          <FhButton variant="primary" size="md" :loading="redirecting" data-testid="topup-submit" @click="topUp">Nạp qua VNPay</FhButton>
        </div>
        <p v-if="topUpError" role="alert" class="text-sm text-danger-700">{{ topUpError }}</p>
      </div>
    </section>

    <!-- History -->
    <section class="rounded-2xl border border-ink-200 bg-white p-5 space-y-2">
      <h2 class="text-base font-semibold text-ink-900">Lịch sử giao dịch</h2>
      <div v-if="loading" class="space-y-3 py-1" aria-busy="true" aria-label="Đang tải giao dịch">
        <div v-for="i in 3" :key="i" class="flex items-center justify-between gap-3">
          <FhSkeleton width="45%" height="16px" />
          <span class="w-24"><FhSkeleton height="16px" /></span>
        </div>
      </div>
      <div v-else-if="loadError" class="flex flex-wrap items-center justify-between gap-3 py-1">
        <p class="text-sm text-ink-700">{{ loadError }}</p>
        <FhButton variant="secondary" size="sm" @click="load(1)">Thử lại</FhButton>
      </div>
      <p v-else-if="transactions.length === 0" class="text-sm text-ink-500">Chưa có giao dịch nào.</p>
      <ul v-else class="divide-y divide-ink-100" data-testid="wallet-transactions">
        <li v-for="t in transactions" :key="t.id" class="flex items-start justify-between gap-3 py-3 text-sm">
          <div class="min-w-0">
            <p class="font-semibold text-ink-900">{{ LABELS[t.type] ?? 'Giao dịch' }}</p>
            <p v-if="t.description" class="text-ink-500 text-pretty">{{ t.description }}</p>
            <p class="text-ink-500 font-num whitespace-nowrap">{{ vnDateTimeString(t.createdAt) }}</p>
          </div>
          <div class="shrink-0 text-right">
            <p class="font-semibold font-num whitespace-nowrap" :class="isIncoming(t) ? 'text-success-700' : 'text-ink-900'">
              {{ isIncoming(t) ? '+' : '−' }}<FhMoney :amount="t.amount" />
            </p>
            <p class="text-ink-500 whitespace-nowrap">Số dư <FhMoney :amount="t.balanceAfter" /></p>
          </div>
        </li>
      </ul>
      <div v-if="page < totalPages" class="flex justify-center pt-2">
        <FhButton variant="secondary" size="sm" :loading="loadingMore" @click="load(page + 1)">Xem thêm</FhButton>
      </div>
    </section>
  </div>
</template>
