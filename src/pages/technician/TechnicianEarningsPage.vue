<script setup lang="ts">
// Earnings for a day, a week (Monday to Sunday), a month or all time, in
// Vietnam time (PO 12/10/2026). The server totals the whole period and pages
// the completed orders; the wallet balance stays one tap from the wallet.
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-vue-next';

import { FhButton, FhMoney, FhPagination, FhSkeleton, FhStatusPill } from '../../components';
import { technicianEarningsApi, type EarningsPayout, type EarningsSummary } from '../../api/technician-earnings.api';
import { walletApi, type WalletSummary } from '../../api/wallet.api';
import { usePagedList } from '../../composables/usePagedList';
import { useQueryChoice, useQueryState } from '../../composables/useQueryState';
import {
  PERIOD_KINDS,
  periodContaining,
  periodLabel,
  reachesToday,
  shiftPeriod,
  type PeriodKind,
} from '../../utils/earnings-period';
import { userFacingError } from '../../utils/user-facing-error';
import { parseDayKey, vnDateString } from '../../utils/vn-time';

const PAGE_SIZE = 20;
const router = useRouter();

const kinds: { key: PeriodKind; label: string }[] = [
  { key: 'day', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'all', label: 'Tất cả' },
];

// ?period=week&from=2026-10-06&page=2 keeps the view across back and refresh.
const kind = useQueryChoice<PeriodKind>('period', PERIOD_KINDS, 'month');
const anchor = useQueryState<string>(
  'from',
  (raw) => (raw && parseDayKey(raw) ? raw : ''),
  (value) => value || undefined,
);
const period = computed(() => periodContaining(kind.value, anchor.value || undefined));
const label = computed(() => periodLabel(period.value));
const atLatest = computed(() => reachesToday(period.value));
const periodKey = computed(() => `${period.value.from ?? ''}|${period.value.to ?? ''}`);

const summary = ref<EarningsSummary | null>(null);
const summaryKey = ref('');
let request = 0;

const { page, items: payouts, total, loading, error: loadError, load, reset } = usePagedList<EarningsPayout>({
  pageSize: PAGE_SIZE,
  fetch: async (page, pageSize) => {
    const id = ++request;
    const key = periodKey.value;
    const result = await technicianEarningsApi.getMyEarnings({
      from: period.value.from,
      to: period.value.to,
      page,
      pageSize,
    });
    if (id === request) {
      summary.value = result;
      summaryKey.value = key;
    }
    return { items: result.payouts, total: result.total, page: result.page, pageSize: result.pageSize };
  },
});

const wallet = ref<WalletSummary | null>(null);
const walletLoading = ref(true);
async function loadWallet() {
  walletLoading.value = true;
  wallet.value = await walletApi.getMyWallet().catch(() => null);
  walletLoading.value = false;
}

const error = computed(() =>
  loadError.value ? userFacingError(loadError.value, 'Không thể tải thu nhập. Vui lòng thử lại.') : '',
);
// Totals wait for their own period; paging inside a period keeps them on screen.
const totalsLoading = computed(() => loading.value && summaryKey.value !== periodKey.value);

function choose(next: PeriodKind) {
  anchor.value = '';
  kind.value = next;
}
function step(delta: number) {
  if (delta > 0 && atLatest.value) return;
  anchor.value = shiftPeriod(period.value, delta).from ?? '';
}
function reload() {
  void load();
  void loadWallet();
}

watch(periodKey, () => reset());
onMounted(loadWallet);

const emptyText = computed(() => {
  switch (period.value.kind) {
    case 'all':
      return 'Bạn chưa hoàn thành đơn sửa chữa nào.';
    case 'day':
      return 'Không có đơn hoàn thành trong ngày này.';
    case 'week':
      return 'Không có đơn hoàn thành trong tuần này.';
    default:
      return 'Không có đơn hoàn thành trong tháng này.';
  }
});

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
const stepButton = `w-10 h-10 rounded-xl border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`;
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Thu nhập</h1>
      <FhButton variant="secondary" size="sm" class="h-10" :disabled="loading" aria-label="Tải lại" @click="reload">
        <RefreshCw :size="16" :class="{ 'animate-spin': loading }" />
        <span class="hidden sm:inline">Tải lại</span>
      </FhButton>
    </div>

    <!-- Period: what to total, and which one -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div
        class="grid grid-cols-4 gap-1 p-1 bg-white rounded-2xl border border-ink-200 text-sm font-medium sm:w-auto"
        role="tablist"
        aria-label="Khoảng thời gian"
      >
        <button
          v-for="item in kinds"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="kind === item.key"
          :data-testid="`earnings-period-${item.key}`"
          class="h-10 px-3 rounded-xl transition-colors whitespace-nowrap"
          :class="[focusRing, kind === item.key ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-600 hover:bg-ink-50']"
          @click="choose(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <div v-if="kind !== 'all'" class="flex items-center gap-2 justify-between sm:justify-end">
        <button type="button" :class="stepButton" aria-label="Kỳ trước" data-testid="earnings-period-prev" @click="step(-1)">
          <ChevronLeft :size="18" aria-hidden="true" />
        </button>
        <span class="min-w-0 text-center text-sm font-semibold text-ink-900 font-num whitespace-nowrap" data-testid="earnings-period-label" aria-live="polite">
          {{ label }}
        </span>
        <button
          type="button"
          :class="stepButton"
          aria-label="Kỳ sau"
          :disabled="atLatest"
          data-testid="earnings-period-next"
          @click="step(1)"
        >
          <ChevronRight :size="18" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="reload">Thử lại</FhButton>
    </div>

    <template v-else>
      <!-- Totals of the period and the wallet in one surface -->
      <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-px bg-ink-100" data-testid="earnings-totals">
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Đơn hoàn thành</div>
            <FhSkeleton v-if="totalsLoading || !summary" width="48px" height="28px" />
            <div v-else class="text-2xl font-semibold text-ink-900 font-num" data-testid="earnings-count">{{ summary.totalCompletedOrders }}</div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Đã thanh toán</div>
            <FhSkeleton v-if="totalsLoading || !summary" width="64px" height="28px" />
            <div v-else class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap" data-testid="earnings-paid">
              {{ `${summary.paidOrders}/${summary.totalCompletedOrders}` }}
            </div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Tiền công</div>
            <FhSkeleton v-if="totalsLoading || !summary" width="120px" height="28px" />
            <div v-else class="whitespace-nowrap" data-testid="earnings-gross"><FhMoney :amount="summary.totalGross" emphasis /></div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Thực nhận sau phí</div>
            <FhSkeleton v-if="totalsLoading || !summary" width="120px" height="28px" />
            <div v-else class="whitespace-nowrap" data-testid="earnings-net"><FhMoney :amount="summary.totalNet" emphasis /></div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white col-span-2 lg:col-span-1">
            <div class="text-sm text-ink-500">Giá trị đơn</div>
            <FhSkeleton v-if="totalsLoading || !summary" width="120px" height="28px" />
            <div v-else class="whitespace-nowrap" data-testid="earnings-order-value"><FhMoney :amount="summary.totalOrderValue" emphasis /></div>
          </div>
        </div>

        <!-- Platform fees and withdrawals live in the wallet: one way there -->
        <button
          type="button"
          class="w-full px-5 py-4 border-t border-ink-100 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
          :class="focusRing"
          data-testid="earnings-wallet"
          @click="router.push('/tech/wallet')"
        >
          <span class="flex-1 min-w-0">
            <span class="block text-sm text-ink-500">Số dư ví</span>
            <FhSkeleton v-if="walletLoading" width="140px" height="24px" />
            <span v-else class="block whitespace-nowrap">
              <FhMoney v-if="wallet" :amount="wallet.balance" emphasis />
              <span v-else class="text-lg font-semibold text-ink-900">—</span>
            </span>
          </span>
          <span class="shrink-0 text-sm font-medium text-brand-600 inline-flex items-center gap-1 whitespace-nowrap">
            Phí và rút tiền
            <ChevronRight :size="16" aria-hidden="true" />
          </span>
        </button>
      </section>

      <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
        <header class="px-5 sm:px-6 py-4 border-b border-ink-100">
          <h2 class="text-lg font-semibold text-ink-900">Đơn đã hoàn thành</h2>
        </header>

        <div v-if="loading" class="divide-y divide-ink-100" aria-busy="true" aria-label="Đang tải thu nhập">
          <div v-for="i in 3" :key="i" class="px-5 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div class="flex-1 space-y-2">
              <FhSkeleton width="30%" height="14px" />
              <FhSkeleton width="55%" height="18px" />
            </div>
            <FhSkeleton width="96px" height="20px" />
          </div>
        </div>

        <div v-else-if="payouts.length === 0" class="px-6 py-12 text-center" data-testid="earnings-empty">
          <p class="text-base font-semibold text-ink-900">{{ emptyText }}</p>
        </div>

        <ul v-else class="divide-y divide-ink-100">
          <li v-for="payout in payouts" :key="payout.orderId">
            <button
              type="button"
              class="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
              :class="focusRing"
              :data-testid="`earning-row-${payout.orderId}`"
              @click="router.push(`/tech/jobs/${payout.orderId}`)"
            >
              <span class="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2">
                <span class="flex-1 min-w-0 space-y-1">
                  <span class="flex items-center gap-x-2 gap-y-1 flex-wrap text-sm">
                    <span class="font-num text-ink-500 whitespace-nowrap">{{ payout.orderCode }}</span>
                    <FhStatusPill
                      :status="payout.paid ? 'COMPLETED' : 'PENDING'"
                      :label="payout.paid ? 'Đã thanh toán' : 'Chưa thanh toán'"
                    />
                    <span class="text-ink-500 whitespace-nowrap font-num">{{ payout.date || (payout.completedAt ? vnDateString(payout.completedAt) : '—') }}</span>
                  </span>
                  <span class="block text-sm font-semibold text-ink-900 text-pretty">{{ payout.serviceName || 'Dịch vụ sửa chữa' }}</span>
                  <span v-if="payout.customer" class="block text-sm text-ink-500 truncate">{{ payout.customer }}</span>
                </span>
                <span class="shrink-0 sm:text-right text-sm space-y-0.5">
                  <span class="flex sm:justify-end items-baseline gap-2 whitespace-nowrap">
                    <span class="text-ink-500">Tiền công</span>
                    <FhMoney :amount="payout.gross" />
                  </span>
                  <span class="flex sm:justify-end items-baseline gap-2 whitespace-nowrap">
                    <span class="text-ink-500">Thực nhận</span>
                    <FhMoney :amount="payout.net" />
                  </span>
                  <span class="flex sm:justify-end items-baseline gap-2 whitespace-nowrap text-ink-500">
                    <span>Tổng đơn</span>
                    <span class="font-num text-ink-700">{{ payout.orderValue.toLocaleString('vi-VN') }}&nbsp;₫</span>
                  </span>
                </span>
              </span>
              <ChevronRight :size="18" class="text-ink-400 shrink-0" aria-hidden="true" />
            </button>
          </li>
        </ul>

        <div v-if="total > PAGE_SIZE" class="px-5 sm:px-6 py-3 border-t border-ink-100">
          <FhPagination
            v-model:page="page"
            :page-size="PAGE_SIZE"
            :total="total"
            :disabled="loading"
          />
        </div>
      </section>
    </template>
  </div>
</template>
