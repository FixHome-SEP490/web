<script setup lang="ts">
// Admin: every payment attempt (PO 09/10/2026): invoices paid by VNPay or the
// customer wallet, technician dues, wallet top-ups. Read only, for reconciling.
import { onMounted, ref } from 'vue';
import { CreditCard, Search } from 'lucide-vue-next';
import { FhButton, FhCard, FhEmptyState, FhMoney, FhSkeleton } from '../../../components';
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
const ROLE: Record<string, string> = { customer: 'Khách', technician: 'Thợ', service_manager: 'Quản lý', admin: 'Admin' };
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
    error.value = userFacingError(err, 'Chưa tải được danh sách thanh toán, thử lại sau.');
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
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2"><CreditCard :size="24" class="text-ink-600" /> Thanh toán</h1>
      <p class="text-xs text-ink-500 mt-1">Mọi lần thanh toán qua VNPay hoặc ví khách: hoá đơn, công nợ của thợ, nạp ví. Chỉ để xem và đối soát.</p>
    </div>

    <form class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="payments-filters" @submit.prevent="load(1)">
      <input
        v-model="search"
        type="search"
        maxlength="100"
        placeholder="Mã đơn, người trả, mã tham chiếu"
        aria-label="Tìm thanh toán"
        data-testid="payments-search"
        class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm lg:col-span-2"
      />
      <select v-model="status" aria-label="Trạng thái" data-testid="payments-status" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm">
        <option value="">Mọi trạng thái</option>
        <option v-for="(label, key) in STATUS" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="purpose" aria-label="Loại" data-testid="payments-purpose" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm">
        <option value="">Mọi loại</option>
        <option v-for="(label, key) in PURPOSE" :key="key" :value="key">{{ label }}</option>
      </select>
      <select v-model="provider" aria-label="Cổng" data-testid="payments-provider" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm">
        <option value="">Mọi cổng</option>
        <option v-for="(label, key) in PROVIDER" :key="key" :value="key">{{ label }}</option>
      </select>
      <label class="flex items-center gap-2 text-xs text-ink-600">Từ <input v-model="from" type="date" data-testid="payments-from" class="flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-2 py-1.5 text-sm" /></label>
      <label class="flex items-center gap-2 text-xs text-ink-600">Đến <input v-model="to" type="date" data-testid="payments-to" class="flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-2 py-1.5 text-sm" /></label>
      <div class="flex gap-2">
        <FhButton type="submit" :loading="loading" data-testid="payments-submit"><Search :size="15" class="mr-1" /> Lọc</FhButton>
        <FhButton type="button" variant="secondary" @click="reset">Bỏ lọc</FhButton>
      </div>
    </form>
    <p v-if="error" class="text-xs text-danger-700" role="alert">{{ error }}</p>

    <p class="text-sm text-ink-700" data-testid="payments-summary">
      {{ total }} lần thanh toán · Đã xác nhận {{ summary.verified }}, tổng <strong class="text-ink-900"><FhMoney :amount="summary.verifiedAmount" /></strong>
      · Đang chờ {{ summary.pending }} · Thất bại {{ summary.failed }}
    </p>

    <FhCard>
      <div v-if="loading" class="p-4"><FhSkeleton height="40px" :count="5" /></div>
      <FhEmptyState v-else-if="rows.length === 0" title="Không có thanh toán nào" description="Không có lần thanh toán nào khớp bộ lọc." />
      <template v-else>
        <ul class="divide-y divide-ink-100" data-testid="payments-rows">
          <li v-for="r in rows" :key="r.id" class="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4" :data-testid="`payment-${r.id}`">
            <div class="min-w-0 text-xs">
              <p class="text-sm font-semibold text-ink-900">
                {{ PURPOSE[r.purpose] ?? r.purpose }}
                <template v-if="r.orderCode"> · <router-link :to="`/console/orders/${r.orderId}`" class="font-mono text-brand-700 hover:underline">{{ r.orderCode }}</router-link></template>
              </p>
              <p class="text-ink-600 break-all">{{ r.payerName }} ({{ ROLE[r.payerRole] ?? r.payerRole }}) · {{ r.payerEmail }}</p>
              <p class="text-ink-500">
                {{ PROVIDER[r.provider ?? 'none'] ?? r.provider }}<template v-if="r.providerReference"> · Mã tham chiếu <span class="font-mono">{{ r.providerReference }}</span></template>
                · Tạo {{ vnDateTimeString(r.requestedAt) }}<template v-if="r.verifiedAt"> · Xác nhận {{ vnDateTimeString(r.verifiedAt) }}</template>
              </p>
              <p v-if="r.failureCode" class="text-danger-700">Lỗi cổng: {{ r.failureCode }}</p>
            </div>
            <div class="shrink-0 sm:text-right">
              <p class="text-sm font-bold font-num text-ink-900"><FhMoney :amount="r.amount" /></p>
              <p class="text-xs font-semibold" :class="statusClass(r.status)">{{ STATUS[r.status] ?? r.status }}</p>
            </div>
          </li>
        </ul>
        <div v-if="totalPages > 1" class="flex items-center justify-between pt-3 text-xs text-ink-500">
          <FhButton variant="secondary" size="sm" :disabled="page <= 1" @click="load(page - 1)">Trước</FhButton>
          <span>Trang {{ page }}/{{ totalPages }}</span>
          <FhButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="load(page + 1)">Sau</FhButton>
        </div>
      </template>
    </FhCard>
  </div>
</template>
