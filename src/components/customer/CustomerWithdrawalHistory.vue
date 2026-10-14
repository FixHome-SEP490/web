<script setup lang="ts">
// The customer's withdrawals, newest first, ten per page (?wdPage= in the address).
import FhButton from '../FhButton.vue';
import FhMoney from '../FhMoney.vue';
import FhPagination from '../FhPagination.vue';
import FhSkeleton from '../FhSkeleton.vue';
import FhStatusPill from '../FhStatusPill.vue';
import { computed } from 'vue';
import { customerWalletApi, type CustomerWithdrawal, type CustomerWithdrawalStatus } from '../../api/customer-wallet.api';
import { usePagedList } from '../../composables/usePagedList';
import { useQueryPage } from '../../composables/useQueryState';
import { queryKeys } from '../../lib/query-keys';
import { userFacingError, withoutCodes } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<CustomerWithdrawalStatus, string> = {
  PROCESSING: 'Đang chuyển',
  SUCCESS: 'Đã chuyển',
  FAILED: 'Không thành công',
};
const statusLabel = (status: string) => STATUS_LABELS[status as CustomerWithdrawalStatus] ?? 'Trạng thái chưa xác định';

const { page, items, total, loading, error, load, changingPage, prefetch } = usePagedList<CustomerWithdrawal>({
  key: () => queryKeys.wallet.customerWithdrawals({}),
  pageSize: PAGE_SIZE,
  page: useQueryPage('wdPage'),
  fetch: (p, size) => customerWalletApi.listWithdrawals(p, size),
});
const loadError = computed(() => (error.value ? userFacingError(error.value, 'Chưa tải được lịch sử rút tiền, vui lòng thử lại.') : ''));
</script>

<template>
  <section class="rounded-2xl border border-ink-200 bg-white p-5 space-y-2" data-testid="withdrawal-history">
    <h2 class="text-base font-semibold text-ink-900">Lịch sử rút tiền</h2>
    <div v-if="loading" class="space-y-3 py-1" aria-busy="true" aria-label="Đang tải lịch sử rút tiền">
      <div v-for="i in 2" :key="i" class="flex items-center justify-between gap-3">
        <FhSkeleton width="45%" height="16px" />
        <span class="w-24"><FhSkeleton height="16px" /></span>
      </div>
    </div>
    <div v-else-if="loadError" class="flex flex-wrap items-center justify-between gap-3 py-1">
      <p class="text-sm text-ink-700">{{ loadError }}</p>
      <FhButton variant="secondary" size="sm" @click="load">Thử lại</FhButton>
    </div>
    <p v-else-if="items.length === 0" class="text-sm text-ink-500">Chưa có lệnh rút tiền nào.</p>
    <ul v-else class="divide-y divide-ink-100 transition-opacity" :class="{ 'opacity-60': changingPage }" :aria-busy="changingPage" data-testid="withdrawal-rows">
      <li v-for="w in items" :key="w.id" class="py-3 text-sm space-y-1">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold text-ink-900 font-num whitespace-nowrap"><FhMoney :amount="w.amount" /></p>
            <p class="text-ink-500 truncate">{{ w.bankName }} · <span class="font-num">{{ w.bankAccountNumber }}</span></p>
          </div>
          <div class="shrink-0 flex flex-col items-end gap-1">
            <FhStatusPill :status="w.status" :label="statusLabel(w.status)" />
            <span class="text-ink-500 font-num whitespace-nowrap">{{ vnDateTimeString(w.requestedAt) }}</span>
          </div>
        </div>
        <p v-if="w.status === 'FAILED'" class="text-danger-700 text-pretty">
          Không chuyển được<template v-if="withoutCodes(w.failureReason)">: {{ withoutCodes(w.failureReason) }}</template>. Tiền đã được hoàn lại vào ví.
        </p>
        <p v-else-if="w.status === 'SUCCESS' && w.payoutBankReference" class="text-ink-500">
          Mã giao dịch ngân hàng: <span class="font-num text-ink-700 break-all">{{ w.payoutBankReference }}</span>
        </p>
      </li>
    </ul>
    <FhPagination v-if="!loadError" v-model:page="page" :page-size="PAGE_SIZE" :total="total" :disabled="loading" @prefetch="prefetch" />
  </section>
</template>
