<script setup lang="ts">
// Customer wallet (PO 08/10/2026): the balance, a VNPay top-up, and the
// history of top-ups, invoice payments and refunds. Money in the wallet pays
// FixHome orders; it cannot be withdrawn.
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-vue-next';
import { FhButton, FhMoney, FhSkeleton } from '../../components';
import {
  customerWalletApi,
  customerWalletTypeLabels,
  isIncomingWalletTransaction,
  type CustomerWalletTransaction,
} from '../../api/customer-wallet.api';
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
  <div class="max-w-3xl mx-auto space-y-6 pb-16">
    <!-- Header -->
    <div>
      <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight flex items-center gap-2.5">
        <Wallet :size="28" class="text-brand-600 shrink-0" />
        <span>Ví của tôi</span>
      </h1>
      <p class="text-sm text-ink-500 mt-1">
        Nạp tiền và theo dõi các khoản thanh toán đơn sửa chữa, hoàn tiền linh kiện tiện lợi.
      </p>
    </div>

    <!-- VNPay payment result banner -->
    <div
      v-if="paymentResult?.ok"
      role="status"
      data-testid="topup-result"
      class="rounded-2xl border border-success-200 bg-success-50/90 p-4 text-sm text-success-800 flex items-start gap-3 shadow-xs"
    >
      <CheckCircle2 :size="20" class="text-success-600 shrink-0 mt-0.5" />
      <div class="space-y-0.5">
        <p class="font-bold">Nạp tiền thành công!</p>
        <p class="text-pretty">
          Đã nạp<template v-if="paymentResult.amount"> <span class="font-bold font-num"><FhMoney :amount="paymentResult.amount" /></span></template> vào ví. Số dư cập nhật khi VNPay xác nhận, thường trong vài giây.
        </p>
      </div>
    </div>

    <div
      v-else-if="paymentResult"
      role="alert"
      data-testid="topup-result"
      class="rounded-2xl border border-danger-200 bg-danger-50/90 p-4 text-sm text-danger-800 flex items-start gap-3 shadow-xs"
    >
      <AlertCircle :size="20" class="text-danger-600 shrink-0 mt-0.5" />
      <div class="space-y-0.5">
        <p class="font-bold">Giao dịch nạp ví chưa thành công</p>
        <p class="text-pretty">
          Giao dịch nạp ví chưa thành công, tiền chưa bị trừ. Bạn có thể thử lại.
        </p>
      </div>
    </div>

    <!-- Premium Digital Wallet Card & Top-up -->
    <section class="rounded-3xl border border-ink-200/90 bg-white overflow-hidden shadow-xs">
      <!-- Digital Card Header -->
      <div class="relative bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white p-6 sm:p-8 overflow-hidden">
        <!-- Background decoration circles -->
        <div class="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-xl" />
        <div class="pointer-events-none absolute right-16 -bottom-16 w-40 h-40 rounded-full bg-success-400/10 blur-lg" />

        <div class="relative z-10 space-y-4">
          <div class="space-y-1 pt-1">
            <p class="text-xs font-medium text-white/80 uppercase tracking-wider">Số dư khả dụng</p>
            <div class="text-3xl sm:text-4xl font-extrabold font-num text-white tracking-tight" data-testid="wallet-balance">
              <span v-if="loading" class="block w-48" aria-busy="true" aria-label="Đang tải số dư">
                <FhSkeleton height="40px" class="bg-white/20" />
              </span>
              <FhMoney v-else :amount="balance" class="text-white !text-3xl sm:!text-4xl font-extrabold" />
            </div>
          </div>

          <div class="pt-2 border-t border-white/15 flex items-center justify-between gap-3 text-xs text-white/80">
            <span class="flex items-center gap-1.5">  
              <span>Dùng thanh toán đơn sửa chữa, không rút ra được.</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Top-up Section -->
      <div class="p-6 sm:p-8 space-y-5">
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

      <!-- Load error -->
      <div v-else-if="loadError" class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <AlertCircle :size="16" class="text-danger-600 shrink-0" />
          <p>{{ loadError }}</p>
        </div>
        <FhButton variant="secondary" size="sm" @click="load(1)">Thử lại</FhButton>
      </div>

      <!-- Empty transactions -->
      <div v-else-if="transactions.length === 0" class="py-10 text-center space-y-2">
        <div class="w-12 h-12 rounded-2xl bg-ink-100/80 text-ink-400 flex items-center justify-center mx-auto">
          <Wallet :size="24" />
        </div>
        <p class="text-sm font-semibold text-ink-900">Chưa có giao dịch nào.</p>
        <p class="text-xs text-ink-500">Các lần nạp ví và thanh toán đơn sẽ hiển thị ở đây.</p>
      </div>

      <!-- Transactions list -->
      <ul v-else class="divide-y divide-ink-100" data-testid="wallet-transactions">
        <li
          v-for="t in transactions"
          :key="t.id"
          class="flex items-start justify-between gap-3 py-3.5 hover:bg-ink-50/50 rounded-xl px-2 transition-colors text-sm"
        >
          <div class="flex items-start gap-3 min-w-0">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5"
              :class="isIncoming(t) ? 'bg-success-50 text-success-600 border-success-100' : 'bg-ink-100 text-ink-600 border-ink-200'"
            >
              <component :is="isIncoming(t) ? ArrowDownLeft : ArrowUpRight" :size="18" />
            </div>

            <div class="min-w-0 space-y-0.5">
              <p class="font-bold text-ink-900">{{ LABELS[t.type] ?? 'Giao dịch' }}</p>
              <p v-if="t.description" class="text-xs text-ink-600 text-pretty">{{ t.description }}</p>
              <p class="text-xs text-ink-400 font-num whitespace-nowrap">{{ vnDateTimeString(t.createdAt) }}</p>
            </div>
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

      <!-- Pagination load more -->
      <div v-if="page < totalPages" class="flex justify-center pt-3 border-t border-ink-100">
        <FhButton variant="secondary" size="md" :loading="loadingMore" @click="load(page + 1)">
          <RefreshCw :size="16" />
          Xem thêm
        </FhButton>
      </div>
    </section>
  </div>
</template>
