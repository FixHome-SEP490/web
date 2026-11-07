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
  isValidBankReference,
  isValidManualBankAmount,
  normalizeBankReference,
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
const PROVIDER: Record<string, string> = {
  vnpay: 'VNPay',
  wallet: 'Ví khách',
  manual_bank: 'Chuyển khoản',
  none: 'Không qua cổng',
};
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
  { key: 'actions', label: 'Thao tác' },
];
const statusClass = (s: PaymentStatus) =>
  s === 'failed' ? 'text-danger-700' : s === 'pending' ? 'text-warning-800' : 'text-ink-700';

const confirmRef = ref<Record<string, string>>({});
const confirmAck = ref<Record<string, boolean>>({});
const confirming = ref<Record<string, boolean>>({});
const confirmError = ref<Record<string, string>>({});

function bankReferenceInvalid(r: AdminPaymentRow): boolean {
  const raw = confirmRef.value[r.id] ?? '';
  return raw.trim().length > 0 && !isValidBankReference(raw);
}

function canConfirmManualBank(r: AdminPaymentRow): boolean {
  return !!r.invoiceId
    && isValidManualBankAmount(r.amount)
    && isValidBankReference(confirmRef.value[r.id] ?? '')
    && (confirmAck.value[r.id] ?? false)
    && !confirming.value[r.id]
    && !loading.value;
}

function clearConfirmError(id: string) {
  if (confirmError.value[id]) confirmError.value[id] = '';
}

function normalizeRefField(id: string) {
  confirmRef.value[id] = normalizeBankReference(confirmRef.value[id]);
  clearConfirmError(id);
}

async function handleConfirmManualBank(r: AdminPaymentRow) {
  // A second click while the first request is in flight must not create another confirmation.
  if (confirming.value[r.id] || !canConfirmManualBank(r)) return;
  const amount = Number(r.amount);
  const bankReference = normalizeBankReference(confirmRef.value[r.id]);
  if (!r.invoiceId || !isValidManualBankAmount(amount) || !isValidBankReference(bankReference)) {
    confirmError.value[r.id] = 'Số tiền hoặc mã tham chiếu ngân hàng không hợp lệ.';
    return;
  }
  confirming.value[r.id] = true;
  confirmError.value[r.id] = '';
  try {
    await adminPaymentsApi.confirmManualBank(r.invoiceId, { amount, bankReference });
    delete confirmRef.value[r.id];
    delete confirmAck.value[r.id];
    delete confirmError.value[r.id];
    await load(page.value);
  } catch (err) {
    confirmError.value[r.id] = userFacingError(err, 'Không thể xác nhận thanh toán do xung đột hoặc trạng thái không hợp lệ.');
  } finally {
    confirming.value[r.id] = false;
  }
}

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

let loadGeneration = 0;

async function load(next = 1) {
  // A slower filter request must never overwrite the newest rows on screen.
  const generation = ++loadGeneration;
  if (from.value && to.value && from.value > to.value) {
    error.value = 'Ngày bắt đầu phải trước ngày kết thúc.';
    loading.value = false;
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
    if (generation !== loadGeneration) return;
    rows.value = result.data;
    summary.value = result.meta.summary;
    total.value = result.meta.total;
    page.value = result.meta.page;
    totalPages.value = result.meta.totalPages;
  } catch (err) {
    if (generation !== loadGeneration) return;
    error.value = userFacingError(err, CONSOLE_LOAD_ERROR);
  } finally {
    if (generation === loadGeneration) loading.value = false;
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
      <template #cell-actions="{ row: r }">
        <div
          v-if="r.provider === 'manual_bank' && r.status === 'pending' && r.invoiceId"
          class="min-w-64 space-y-2 py-1 text-left"
          data-testid="manual-bank-confirm-form"
        >
          <div class="text-xs text-ink-600" data-testid="manual-bank-amount">
            Khớp số tiền: <span class="font-num font-semibold text-ink-900"><FhMoney :amount="r.amount" /></span>
          </div>
          <div class="space-y-1">
            <label :for="`mb-ref-${r.id}`" class="block text-xs font-medium text-ink-700">Mã tham chiếu ngân hàng</label>
            <input
              :id="`mb-ref-${r.id}`"
              v-model="confirmRef[r.id]"
              type="text"
              maxlength="128"
              autocomplete="off"
              spellcheck="false"
              placeholder="Mã giao dịch ngân hàng"
              class="h-8 w-full rounded border px-2 text-xs focus:border-brand-500 focus:outline-hidden"
              :class="bankReferenceInvalid(r) ? 'border-danger-400' : 'border-ink-200'"
              data-testid="manual-bank-ref"
              :aria-invalid="bankReferenceInvalid(r) || undefined"
              :aria-describedby="bankReferenceInvalid(r) ? `mb-ref-help-${r.id} mb-ref-invalid-${r.id}` : `mb-ref-help-${r.id}`"
              :disabled="confirming[r.id]"
              @input="clearConfirmError(r.id)"
              @blur="normalizeRefField(r.id)"
            />
            <p :id="`mb-ref-help-${r.id}`" class="text-[11px] text-ink-500">
              6–128 ký tự, bắt đầu bằng chữ hoặc số; cho phép . _ : / -
            </p>
            <p v-if="bankReferenceInvalid(r)" :id="`mb-ref-invalid-${r.id}`" class="text-xs text-danger-700" data-testid="manual-bank-ref-invalid">
              Mã tham chiếu chưa đúng định dạng.
            </p>
          </div>
          <label class="flex items-start gap-2 text-xs text-ink-700 cursor-pointer">
            <input
              v-model="confirmAck[r.id]"
              type="checkbox"
              class="mt-0.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              data-testid="manual-bank-ack"
              :disabled="confirming[r.id]"
              @change="clearConfirmError(r.id)"
            />
            <span>Đã kiểm tra tiền nổi độc lập trong tài khoản ngân hàng</span>
          </label>
          <p
            v-if="confirmError[r.id]"
            class="text-xs text-danger-700"
            role="alert"
            data-testid="manual-bank-error"
          >
            {{ confirmError[r.id] }}
          </p>
          <FhButton
            size="sm"
            variant="primary"
            class="w-full text-xs"
            :disabled="!canConfirmManualBank(r)"
            :loading="confirming[r.id]"
            data-testid="manual-bank-confirm-btn"
            @click="handleConfirmManualBank(r)"
          >
            Xác nhận thanh toán
          </FhButton>
        </div>
        <span v-else class="text-ink-400">—</span>
      </template>
    </ConsoleTable>

    <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="load" />
  </div>
</template>
