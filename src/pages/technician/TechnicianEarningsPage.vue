<script setup lang="ts">
// Earnings from real records only: the technician's completed service orders
// and their wallet balance. Platform fees are not estimated here; the wallet
// lists the fees actually deducted, line by line.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Banknote, BadgeCheck, CalendarCheck, ChevronRight, ClipboardList, RefreshCw, Wallet } from 'lucide-vue-next';

import { FhButton, FhMoney, FhStatusPill } from '../../components';
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
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Banknote class="text-brand-600" :size="24" />
          Thu nhập
        </h1>
        <p class="text-sm text-ink-500 mt-1 text-pretty">
          Các đơn sửa chữa bạn đã hoàn thành và tiền công của từng đơn. Phí nền tảng đã trừ và tiền đã rút xem trong Ví của tôi.
        </p>
      </div>
      <FhButton variant="secondary" size="sm" :disabled="loading" @click="load">
        <RefreshCw :size="16" :class="{ 'animate-spin': loading }" />
        Làm mới
      </FhButton>
    </div>

    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-danger-50 border border-danger-200 text-sm text-danger-700 flex flex-wrap items-center justify-between gap-3">
      <span>{{ error }}</span>
      <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
    </div>

    <section class="grid grid-cols-2 xl:grid-cols-4 gap-4" data-testid="earnings-totals">
      <div class="p-5 rounded-2xl bg-white border border-ink-200">
        <ClipboardList :size="18" class="text-ink-400 mb-2" />
        <div class="text-sm text-ink-500">Đơn đã hoàn thành</div>
        <div class="text-2xl font-semibold text-ink-900 font-num">{{ loading ? '—' : totals.count }}</div>
      </div>
      <div class="p-5 rounded-2xl bg-white border border-ink-200">
        <Banknote :size="18" class="text-ink-400 mb-2" />
        <div class="text-sm text-ink-500">Tổng tiền công</div>
        <div class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          <template v-if="loading">—</template>
          <FhMoney v-else :amount="totals.labor" />
        </div>
      </div>
      <div class="p-5 rounded-2xl bg-white border border-ink-200">
        <CalendarCheck :size="18" class="text-ink-400 mb-2" />
        <div class="text-sm text-ink-500">Tổng giá trị đơn</div>
        <div class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          <template v-if="loading">—</template>
          <FhMoney v-else :amount="totals.orderValue" />
        </div>
      </div>
      <div class="p-5 rounded-2xl bg-white border border-ink-200">
        <BadgeCheck :size="18" class="text-ink-400 mb-2" />
        <div class="text-sm text-ink-500">Đơn đã thanh toán</div>
        <div class="text-2xl font-semibold text-ink-900 font-num whitespace-nowrap">
          {{ loading ? '—' : `${totals.paid}/${totals.count}` }}
        </div>
      </div>
    </section>

    <button
      type="button"
      class="w-full p-5 rounded-2xl bg-white border border-ink-200 hover:border-ink-300 transition-colors flex items-center gap-4 text-left"
      @click="router.push('/tech/wallet')"
    >
      <span class="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
        <Wallet :size="22" />
      </span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm text-ink-500">Số dư ví hiện tại</span>
        <span class="block text-xl font-semibold text-ink-900 font-num whitespace-nowrap">
          <template v-if="wallet"><FhMoney :amount="wallet.balance" /></template>
          <template v-else>—</template>
        </span>
        <span class="block text-sm text-ink-500">Nạp tiền, rút tiền và xem phí nền tảng đã trừ</span>
      </span>
      <ChevronRight :size="18" class="text-ink-400 shrink-0" />
    </button>

    <section class="bg-white rounded-2xl border border-ink-200 overflow-hidden">
      <header class="px-5 sm:px-6 py-4 border-b border-ink-100">
        <h2 class="text-lg font-semibold text-ink-900">Đơn đã hoàn thành</h2>
      </header>

      <p v-if="loading" role="status" class="px-6 py-10 text-center text-sm text-ink-500">Đang tải thu nhập…</p>

      <div v-else-if="completed.length === 0" class="px-6 py-12 text-center space-y-2" data-testid="earnings-empty">
        <p class="text-base font-semibold text-ink-900">Bạn chưa hoàn thành đơn sửa chữa nào.</p>
        <p class="text-sm text-ink-500">Đơn hoàn thành sẽ xuất hiện ở đây cùng tiền công của đơn.</p>
      </div>

      <ul v-else class="divide-y divide-ink-100">
        <li v-for="order in completed" :key="order.id">
          <button
            type="button"
            class="w-full px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-ink-25 transition-colors"
            :data-testid="`earning-row-${order.id}`"
            @click="router.push(`/tech/jobs/${order.id}`)"
          >
            <span class="min-w-0 space-y-1">
              <span class="flex items-center gap-2 flex-wrap text-sm">
                <span class="font-num text-ink-500 whitespace-nowrap">{{ order.code }}</span>
                <FhStatusPill
                  :status="isPaid(order) ? 'COMPLETED' : 'PENDING'"
                  :label="isPaid(order) ? 'Đã thanh toán' : 'Chưa thanh toán'"
                />
              </span>
              <span class="block text-sm font-semibold text-ink-900">{{ order.serviceName }}</span>
              <span class="block text-sm text-ink-500">
                Hoàn thành {{ order.completedAt ? vnDateString(order.completedAt) : '—' }}
              </span>
            </span>
            <span class="flex items-center gap-5 shrink-0">
              <span class="text-right">
                <span class="block text-xs text-ink-500">Tiền công</span>
                <span class="block text-base font-semibold text-ink-900 font-num whitespace-nowrap"><FhMoney :amount="order.laborTotal" /></span>
              </span>
              <span class="text-right">
                <span class="block text-xs text-ink-500">Tổng đơn</span>
                <span class="block text-base text-ink-700 font-num whitespace-nowrap"><FhMoney :amount="order.grandTotal" /></span>
              </span>
              <ChevronRight :size="18" class="text-ink-400" />
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
