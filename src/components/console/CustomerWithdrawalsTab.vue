<script setup lang="ts">
// Service Manager and Admin: customers' withdrawals (PO 16/10/2026), the tab
// "Khách hàng" of the payout section on /console/wallets. Its own list and its
// own totals, never mixed with the technicians'. A withdrawal is paid at once,
// so there is nothing to approve: staff watch the money leave and ask payOS
// again about a payout that has not settled. The page shows the payOS source
// balance (shared by both tabs) once, above the tabs.
import { ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import FhButton from '../FhButton.vue';
import FhSkeleton from '../FhSkeleton.vue';
import FhStatusPill from '../FhStatusPill.vue';
import ConsoleLoadError from './ConsoleLoadError.vue';
import ConsolePagination from './ConsolePagination.vue';
import ConsoleSearch from './ConsoleSearch.vue';
import ConsoleTable, { type ConsoleColumn } from './ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField } from './console-ui';
import {
  consoleCustomerWithdrawalsApi,
  type CustomerStaffWithdrawal,
  type CustomerStaffWithdrawalResult,
} from '../../api/console-customer-withdrawals.api';
import type { CustomerWithdrawalStatus } from '../../api/customer-wallet.api';
import type { PayoutOverview } from '../../api/wallet.api';
import { usePagedList } from '../../composables/usePagedList';
import { useCacheUpdates } from '../../composables/useCachedQuery';
import { useQueryChoice, useQueryPage, useQuerySearch } from '../../composables/useQueryState';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { formatCurrencyVND, formatDateTimeVN, formatWithdrawalStatus } from '../../utils/formatters';
import { userFacingError } from '../../utils/user-facing-error';

defineProps<{
  /** Customer totals; null until read (or when the read failed). */
  overview: PayoutOverview | null;
  overviewLoading?: boolean;
}>();
const emit = defineEmits<{ (e: 'total', value: number): void }>();

type StatusFilter = CustomerWithdrawalStatus | 'ALL';
const STATUS_FILTERS: readonly StatusFilter[] = ['ALL', 'PROCESSING', 'SUCCESS', 'FAILED'];
const PAGE_SIZE = 15;

const columns: ConsoleColumn[] = [
  { key: 'requestedAt', label: 'Thời gian', hideBelow: 'xl' },
  { key: 'customer', label: 'Khách hàng' },
  { key: 'amount', label: 'Số tiền', align: 'right' },
  { key: 'bankInfo', label: 'Tài khoản nhận', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

const status = useQueryChoice<StatusFilter>('cwstatus', STATUS_FILTERS, 'ALL');
const { input: searchInput, search } = useQuerySearch('cwq');

const { page, items, total, result, loading, error, load, changingPage, prefetch } = usePagedList<CustomerStaffWithdrawal>({
  key: () => queryKeys.wallet.consoleCustomerWithdrawals({ status: status.value, search: search.value }),
  pageSize: PAGE_SIZE,
  page: useQueryPage('cwpage'),
  fetch: (p, size) =>
    consoleCustomerWithdrawalsApi.list({
      page: p,
      limit: size,
      status: status.value === 'ALL' ? undefined : status.value,
      search: search.value,
    }),
});

// The count next to the tab: known once the list has been read.
watch(result, (value) => {
  if (value) emit('total', value.total);
}, { immediate: true });

const cache = useCacheUpdates();
/** Id of the withdrawal whose payout is being re-checked with payOS. */
const reconcilingId = ref<string | null>(null);

/** Say exactly where the payout ended up; each outcome needs a different reaction. */
function announcePayout(res: CustomerStaffWithdrawalResult) {
  if (res.status === 'SUCCESS') {
    toast.success(res.message, {
      description: res.payoutBankReference ? `Mã giao dịch ngân hàng: ${res.payoutBankReference}` : undefined,
    });
  } else if (res.status === 'FAILED') {
    toast.error(res.message, { description: res.failureReason ?? undefined });
  } else {
    toast.info(res.message);
  }
}

async function reconcile(row: CustomerStaffWithdrawal) {
  if (reconcilingId.value) return;
  reconcilingId.value = row.id;
  try {
    const res = await consoleCustomerWithdrawalsApi.reconcile(row.id);
    announcePayout(res);
    // The list, the customer totals and any customer wallet on screen.
    await cache.refresh(affectedBy.walletChange);
  } catch (err) {
    toast.error(userFacingError(err, 'Chưa kiểm tra được với payOS, vui lòng thử lại.'));
  } finally {
    reconcilingId.value = null;
  }
}

const contactOf = (row: CustomerStaffWithdrawal) =>
  [row.customer?.email, row.customer?.phoneNumber].filter(Boolean).join(' · ') || '—';
</script>

<template>
  <div class="space-y-4" data-testid="customer-withdrawals">
    <section
      v-if="overview"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
      aria-label="Tổng quan chi tiền cho khách hàng"
      data-testid="cw-overview"
    >
      <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
        <div class="whitespace-nowrap text-sm text-ink-500">Đã chuyển cho khách hàng</div>
        <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-success-600">{{ formatCurrencyVND(overview.paidOut.amount) }}</div>
        <div class="mt-0.5 text-xs text-ink-500">{{ overview.paidOut.count }} lệnh thành công</div>
      </div>
      <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
        <div class="whitespace-nowrap text-sm text-ink-500">Đang chuyển</div>
        <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-info-600">{{ formatCurrencyVND(overview.processing.amount) }}</div>
        <div class="mt-0.5 text-xs text-ink-500">{{ overview.processing.count }} lệnh chờ payOS xác nhận</div>
      </div>
      <div class="col-span-2 rounded-[var(--radius-md)] border border-ink-200 bg-white p-4 sm:col-span-1">
        <div class="whitespace-nowrap text-sm text-ink-500">Chuyển thất bại</div>
        <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-danger-600">{{ formatCurrencyVND(overview.failed.amount) }}</div>
        <div class="mt-0.5 text-xs text-ink-500">{{ overview.failed.count }} lệnh, tiền đã hoàn về ví khách hàng</div>
      </div>
    </section>
    <div v-else-if="overviewLoading" class="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
      <FhSkeleton height="92px" />
      <FhSkeleton height="92px" />
      <FhSkeleton height="92px" class="col-span-2 sm:col-span-1" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ConsoleSearch v-model="searchInput" placeholder="Tìm tên, email, số điện thoại" label="Tìm lệnh rút của khách hàng" :maxlength="100" />
      <select v-model="status" :class="consoleField" aria-label="Trạng thái rút tiền của khách hàng" data-testid="cw-status">
        <option value="ALL">Tất cả trạng thái</option>
        <option value="PROCESSING">Đang chuyển tiền</option>
        <option value="SUCCESS">Đã chi tiền</option>
        <option value="FAILED">Chuyển thất bại</option>
      </select>
    </div>

    <ConsoleLoadError v-if="error" :message="userFacingError(error, CONSOLE_LOAD_ERROR)" @retry="load" />
    <template v-else>
      <ConsoleTable
        :columns="columns"
        :rows="items"
        :loading="loading"
        :row-test-id="(row) => `cw-row-${row.id}`"
        class="transition-opacity"
        :class="{ 'opacity-60': changingPage }"
        empty-text="Chưa có lệnh rút tiền nào của khách hàng."
      >
        <template #cell-requestedAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ formatDateTimeVN(row.requestedAt) }}</span>
        </template>
        <template #cell-customer="{ row }">
          <div class="whitespace-nowrap font-medium text-ink-900">{{ row.customer?.fullName || 'Khách hàng' }}</div>
          <div class="max-w-56 truncate text-xs text-ink-500" :title="contactOf(row)">{{ contactOf(row) }}</div>
        </template>
        <template #cell-amount="{ row }">
          <span class="whitespace-nowrap font-num font-semibold text-ink-900">{{ formatCurrencyVND(row.amount) }}</span>
        </template>
        <template #cell-bankInfo="{ row }">
          <div class="whitespace-nowrap text-ink-900">{{ row.bankName }}</div>
          <div class="whitespace-nowrap text-xs text-ink-500"><span class="font-num">{{ row.bankAccountNumber || '—' }}</span> · {{ row.bankAccountName }}</div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" :label="formatWithdrawalStatus(row.status).label" />
          <div v-if="row.status === 'FAILED'" class="mt-1 max-w-56 text-xs text-danger-600">
            {{ row.failureReason || 'Không chuyển được' }}<template v-if="row.refundTransactionId"> · đã hoàn tiền vào ví</template>
          </div>
          <div v-if="row.status === 'PROCESSING' && row.failureReason" class="mt-1 max-w-56 text-xs text-info-600">{{ row.failureReason }}</div>
          <div v-if="row.status === 'SUCCESS'" class="mt-1 whitespace-nowrap text-xs text-ink-500">
            <template v-if="row.payoutBankReference">Mã giao dịch <span class="font-num font-medium text-ink-700">{{ row.payoutBankReference }}</span></template>
            <span v-else class="font-num">{{ formatDateTimeVN(row.payoutAttemptedAt || row.updatedAt) }}</span>
          </div>
        </template>
        <template #cell-actions="{ row }">
          <FhButton
            v-if="row.status === 'PROCESSING'"
            variant="secondary"
            size="sm"
            :loading="reconcilingId === row.id"
            :disabled="Boolean(reconcilingId) && reconcilingId !== row.id"
            data-testid="cw-reconcile"
            @click="reconcile(row)"
          >Kiểm tra lại</FhButton>
        </template>
      </ConsoleTable>
      <ConsolePagination v-model:page="page" :total="total" :page-size="PAGE_SIZE" :disabled="loading" @prefetch="prefetch" />
    </template>
  </div>
</template>
