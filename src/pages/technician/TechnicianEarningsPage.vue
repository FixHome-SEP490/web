<script setup lang="ts">
// Earnings from real records only: the technician's completed service orders
// and their wallet balance. Platform fees are not estimated here; the wallet
// lists the fees actually deducted, line by line.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, RefreshCw } from 'lucide-vue-next';

import { FhButton, FhMoney, FhSkeleton, FhStatusPill } from '../../components';
import { ordersApi, isHistoricalOrder, type ServiceOrderItem } from '../../api/orders.api';
import { walletApi, type WalletSummary } from '../../api/wallet.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateString } from '../../utils/vn-time';

const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const orders = ref<ServiceOrderItem[]>([]);
const wallet = ref<WalletSummary | null>(null);

const isPaid = (order: ServiceOrderItem) => String(order.paymentStatus).toUpperCase() === 'PAID';

const completed = computed(() =>
  orders.value
    .filter((order) => String(order.status).toUpperCase() === 'COMPLETED')
    .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime()),
);

const totals = computed(() => ({
  count: completed.value.length,
  labor: completed.value.reduce((sum, order) => sum + Number(order.laborTotal || 0), 0),
  orderValue: completed.value.reduce((sum, order) => sum + Number(order.grandTotal || 0), 0),
  paid: completed.value.filter(isPaid).length,
}));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [list, summary] = await Promise.all([
      ordersApi.getTechnicianJobs(),
      walletApi.getMyWallet().catch(() => null),
    ]);
    orders.value = list.filter((item): item is ServiceOrderItem => !isHistoricalOrder(item));
    wallet.value = summary;
  } catch (err) {
    error.value = userFacingError(err, 'Không thể tải thu nhập. Vui lòng thử lại.');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
</script>


<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight">Thu nhập</h1>
      <FhButton variant="secondary" size="sm" class="h-10" :disabled="loading" aria-label="Tải lại" @click="load">
        <RefreshCw :size="16" :class="{ 'animate-spin': loading }" />
        <span class="hidden sm:inline">Tải lại</span>
      </FhButton>
    </div>

    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" class="h-10" @click="load">Thử lại</FhButton>
    </div>

    <template v-else>
      <!-- Totals and the wallet in one surface -->
      <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
        <div
          class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink-100"
          data-testid="earnings-totals"
        >
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Đơn đã hoàn thành</div>
            <FhSkeleton v-if="loading" width="48px" height="28px" />
            <div v-else class="text-2xl font-semibold text-ink-900 font-num">{{ totals.count }}</div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Tổng tiền công</div>
            <FhSkeleton v-if="loading" width="120px" height="28px" />
            <div v-else class="whitespace-nowrap"><FhMoney :amount="totals.labor" emphasis /></div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Tổng giá trị đơn</div>
            <FhSkeleton v-if="loading" width="120px" height="28px" />
            <div v-else class="whitespace-nowrap"><FhMoney :amount="totals.orderValue" emphasis /></div>
          </div>
          <div class="p-5 space-y-1 min-w-0 bg-white">
            <div class="text-sm text-ink-500">Đơn đã thanh toán</div>
            <FhSkeleton v-if="loading" width="64px" height="28px" />
            <div v-else class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">{{ `${totals.paid}/${totals.count}` }}</div>
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
            <FhSkeleton v-if="loading" width="140px" height="24px" />
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

        <div v-else-if="completed.length === 0" class="px-6 py-12 text-center" data-testid="earnings-empty">
          <p class="text-base font-semibold text-ink-900">Bạn chưa hoàn thành đơn sửa chữa nào.</p>
        </div>

        <ul v-else class="divide-y divide-ink-100">
          <li v-for="order in completed" :key="order.id">
            <button
              type="button"
              class="w-full px-5 sm:px-6 py-4 flex items-center gap-3 text-left hover:bg-ink-25 transition-colors"
              :class="focusRing"
              :data-testid="`earning-row-${order.id}`"
              @click="router.push(`/tech/jobs/${order.id}`)"
            >
              <span class="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2">
                <span class="flex-1 min-w-0 space-y-1">
                  <span class="flex items-center gap-x-2 gap-y-1 flex-wrap text-sm">
                    <span class="font-num text-ink-500 whitespace-nowrap">{{ order.code }}</span>
                    <FhStatusPill
                      :status="isPaid(order) ? 'COMPLETED' : 'PENDING'"
                      :label="isPaid(order) ? 'Đã thanh toán' : 'Chưa thanh toán'"
                    />
                    <span class="text-ink-500 whitespace-nowrap">{{ order.completedAt ? vnDateString(order.completedAt) : '—' }}</span>
                  </span>
                  <span class="block text-sm font-semibold text-ink-900 text-pretty">{{ order.serviceName }}</span>
                </span>
                <span class="shrink-0 sm:text-right text-sm space-y-0.5">
                  <span class="flex sm:justify-end items-baseline gap-2 whitespace-nowrap">
                    <span class="text-ink-500">Tiền công</span>
                    <FhMoney :amount="order.laborTotal" />
                  </span>
                  <span class="flex sm:justify-end items-baseline gap-2 whitespace-nowrap text-ink-500">
                    <span>Tổng đơn</span>
                    <span class="font-num text-ink-700">{{ Number(order.grandTotal || 0).toLocaleString('vi-VN') }}&nbsp;₫</span>
                  </span>
                </span>
              </span>
              <ChevronRight :size="18" class="text-ink-400 shrink-0" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
