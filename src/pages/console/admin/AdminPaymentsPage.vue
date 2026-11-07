<script setup lang="ts">
// Admin: every payment attempt (PO 09/10/2026): invoices paid by VNPay or the
// customer wallet, technician dues, wallet top-ups. Read only, for reconciling.
import { onMounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
import { FhButton, FhMoney } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleSearchField } from '../../../components/console/console-ui';
import {
  adminPaymentsApi,
  type AdminPaymentRow,
  type AdminPaymentSummary,
  type PaymentPurpose,
  type PaymentStatus,
} from '../../../api/admin-payments.api';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateTimeString } from '../../../utils/vn-time';

const STATUS: Record<PaymentStatus, string> = {
  pending: 'Đang chờ',
  verified: 'Đã xác nhận',
  failed: 'Thất bại',
  refunded: 'Đã hoàn',
  cancelled: 'Đã huỷ',
};
const PURPOSE: Record<PaymentPurpose, string> = {
  invoice: 'Thanh toán hoá đơn',
  commission_due: 'Thợ trả công nợ',
  wallet_top_up: 'Nạp ví',
};
const PROVIDER: Record<string, string> = { vnpay: 'VNPay', wallet: 'Ví khách', none: 'Không qua cổng' };
const ROLE: Record<string, string> = { customer: 'Khách', technician: 'Thợ', service_manager: 'Quản lý', admin: 'Quản trị viên' };
// Gateway failure codes in words; any other code stays off the screen (PO 10/10/2026).
const FAILURE: Record<string, string> = {
  '24': 'Khách huỷ giao dịch',
  '11': 'Hết thời gian chờ thanh toán',
  '51': 'Tài khoản không đủ số dư',
  '65': 'Vượt hạn mức giao dịch trong ngày',
  '75': 'Ngân hàng đang bảo trì',
  ORDER_CANCELLED: 'Đơn đã huỷ trước khi thanh toán xong',
};
const failureLabel = (code: string) => FAILURE[code] ?? 'Cổng thanh toán báo lỗi';
const columns: ConsoleColumn[] = [
  { key: 'purpose', label: 'Loại' },
  { key: 'payer', label: 'Người trả', hideBelow: 'lg' },
  { key: 'provider', label: 'Cổng', hideBelow: '2xl' },
  { key: 'time', label: 'Thời gian', hideBelow: 'xl' },
  { key: 'amount', label: 'Số tiền', align: 'right' },
  { key: 'status', label: 'Trạng thái' },
];
const statusClass = (s: PaymentStatus) =>
  s === 'failed' ? 'text-danger-700' : s === 'pending' ? 'text-warning-800' : 'text-ink-700';

const search = ref('');
const status = ref<PaymentStatus | ''>('');
const purpose = ref<PaymentPurpose | ''>('');
const provider = ref('');
const from = ref('');
const to = ref('');
const rows = ref<AdminPaymentRow[]>([]);
const summary = ref<AdminPaymentSummary>({ verifiedAmount: 0, verified: 0, pending: 0, failed: 0 });
const total = ref(0);
const page = ref(1);
const totalPages = ref(0);
const loading = ref(true);
const error = ref('');

async function load(next = 1) {
  if (from.value && to.value && from.value > to.value) {
    error.value = 'Ngày bắt đầu phải trước ngày kết thúc.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await adminPaymentsApi.list({
      search: search.value.trim() || undefined,
      status: status.value,
      purpose: purpose.value,
      provider: provider.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      page: next,
      pageSize: 20,
    });
    rows.value = result.data;
    summary.value = result.meta.summary;
    total.value = result.meta.total;
    page.value = result.meta.page;
    totalPages.value = result.meta.totalPages;
  } catch (err) {
    error.value = userFacingError(err, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

function reset() {
  search.value = '';
  status.value = '';
  purpose.value = '';
  provider.value = '';
  from.value = '';
  to.value = '';
  void load(1);
}

onMounted(() => load(1));
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Thanh toán" />

    <form class="flex flex-wrap items-center gap-2" data-testid="payments-filters" @submit.prevent="load(1)">
      <div class="relative w-full min-w-0 sm:w-72">
        <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="Mã đơn, người trả, mã tham chiếu"
          aria-label="Tìm thanh toán"
          data-testid="payments-search"
          :class="consoleSearchField"
        />
      </div>
      <select v-model="status" aria-label="Trạng thái" data-testid="payments-status" :class="consoleField">
        <option value="">Mọi trạng thái</option>
        <option v-for="(label, key) in STATUS" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="purpose" aria-label="Loại" data-testid="payments-purpose" :class="consoleField">
        <option value="">Mọi loại</option>
        <option v-for="(label, key) in PURPOSE" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="provider" aria-label="Cổng" data-testid="payments-provider" :class="consoleField">
        <option value="">Mọi cổng</option>
        <option v-for="(label, key) in PROVIDER" :key="key" :value="key">{{ label }}</option>
      </select>
      <input v-model="from" type="date" aria-label="Từ ngày" data-testid="payments-from" :class="consoleField" />
      <input v-model="to" type="date" aria-label="Đến ngày" data-testid="payments-to" :class="consoleField" />
      <FhButton type="submit" variant="secondary" size="sm" :loading="loading" data-testid="payments-submit">Lọc</FhButton>
      <button type="button" class="h-9 whitespace-nowrap px-2 text-sm font-medium text-ink-600 hover:text-ink-900" @click="reset">Bỏ lọc</button>
    </form>
    <p v-if="error" class="text-sm text-danger-700" role="alert">{{ error }}</p>

    <dl class="flex flex-wrap divide-x divide-ink-100 rounded-[var(--radius-md)] border border-ink-200 bg-white text-sm" data-testid="payments-summary">
      <div class="px-4 py-3"><dt class="sr-only">Số lần</dt><dd class="whitespace-nowrap"><span class="font-num font-semibold text-ink-900">{{ total }}</span> lần thanh toán</dd></div>
      <div class="px-4 py-3">
        <dt class="inline text-ink-500">Đã xác nhận {{ summary.verified }}, tổng </dt>
        <dd class="inline whitespace-nowrap"><FhMoney :amount="summary.verifiedAmount" /></dd>
      </div>
      <div class="px-4 py-3"><dt class="inline text-ink-500">Đang chờ </dt><dd class="inline font-num font-semibold text-ink-900">{{ summary.pending }}</dd></div>
      <div class="px-4 py-3"><dt class="inline text-ink-500">Thất bại </dt><dd class="inline font-num font-semibold text-ink-900">{{ summary.failed }}</dd></div>
    </dl>

    <ConsoleTable
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :row-test-id="(r) => `payment-${r.id}`"
      empty-text="Không có thanh toán nào khớp bộ lọc."
    >
      <template #empty>Không có thanh toán nào khớp bộ lọc.</template>
      <template #cell-purpose="{ row: r }">
        <div class="whitespace-nowrap font-medium text-ink-900">{{ PURPOSE[r.purpose] ?? 'Khác' }}</div>
        <router-link v-if="r.orderCode" :to="`/console/orders/${r.orderId}`" class="whitespace-nowrap font-num text-xs text-brand-700 hover:underline">{{ r.orderCode }}</router-link>
      </template>
      <template #cell-payer="{ row: r }">
        <div class="whitespace-nowrap text-ink-900">{{ r.payerName }} ({{ ROLE[r.payerRole] ?? 'Khác' }})</div>
        <div class="max-w-56 truncate text-xs text-ink-500" :title="r.payerEmail">{{ r.payerEmail }}</div>
      </template>
      <template #cell-provider="{ row: r }">
        <div class="whitespace-nowrap text-ink-800">{{ PROVIDER[r.provider ?? 'none'] ?? 'Khác' }}</div>
        <div v-if="r.providerReference" class="whitespace-nowrap text-xs text-ink-500">Mã tham chiếu <span class="font-num">{{ r.providerReference }}</span></div>
      </template>
      <template #cell-time="{ row: r }">
        <div class="whitespace-nowrap font-num text-ink-700">{{ vnDateTimeString(r.requestedAt) }}</div>
        <div v-if="r.verifiedAt" class="whitespace-nowrap text-xs text-ink-500">Xác nhận <span class="font-num">{{ vnDateTimeString(r.verifiedAt) }}</span></div>
      </template>
      <template #cell-amount="{ row: r }">
        <FhMoney :amount="r.amount" />
      </template>
      <template #cell-status="{ row: r }">
        <div class="whitespace-nowrap font-medium" :class="statusClass(r.status)">{{ STATUS[r.status] ?? 'Chưa rõ' }}</div>
        <div v-if="r.failureCode" class="max-w-48 text-xs text-danger-700">{{ failureLabel(r.failureCode) }}</div>
      </template>
    </ConsoleTable>

    <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="load" />
  </div>
</template>
