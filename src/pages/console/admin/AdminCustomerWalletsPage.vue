<script setup lang="ts">
// Admin: every customer's wallet, one customer's history and a correction
// with a reason (PO 09/10/2026). FixHome bears refunds; this is the tool to
// fix a mistake, the customer is notified and the change is audited.
import { computed, onMounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
import { FhButton, FhConfirmDialog, FhMoney, FhSkeleton } from '../../../components';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import ConsolePagination from '../../../components/console/ConsolePagination.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleSearchField, consoleTextarea } from '../../../components/console/console-ui';
import {
  adminCustomerWalletsApi,
  type AdminCustomerWalletDetail,
  type AdminCustomerWalletRow,
} from '../../../api/admin-customer-wallets.api';
import { customerWalletTypeLabels, isIncomingWalletTransaction } from '../../../api/customer-wallet.api';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateTimeString } from '../../../utils/vn-time';

const search = ref('');
const withBalance = ref(false);
const rows = ref<AdminCustomerWalletRow[]>([]);
const total = ref(0);
const totalBalance = ref(0);
const page = ref(1);
const totalPages = ref(0);
const loading = ref(true);
const error = ref('');

const detail = ref<AdminCustomerWalletDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');

const adjustType = ref<'CREDIT' | 'DEBIT'>('CREDIT');
const amountText = ref<string | number>('');
const reason = ref('');
const formError = ref('');
const confirming = ref(false);
const saving = ref(false);
const saved = ref('');

const amount = computed(() => Number(amountText.value));
const confirmText = computed(() =>
  `${adjustType.value === 'CREDIT' ? 'Cộng' : 'Trừ'} ${amount.value.toLocaleString('vi-VN')} ₫ ${adjustType.value === 'CREDIT' ? 'vào' : 'khỏi'} ví của ${detail.value?.customer.fullName ?? ''}. Khách nhận thông báo kèm lý do, thao tác được ghi nhật ký và không sửa lại được.`,
);

async function load(next = 1) {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminCustomerWalletsApi.list({ search: search.value.trim() || undefined, withBalance: withBalance.value || undefined, page: next, pageSize: 20 });
    rows.value = result.data;
    total.value = result.meta.total;
    totalBalance.value = Number(result.meta.totalBalance ?? 0);
    page.value = result.meta.page;
    totalPages.value = result.meta.totalPages;
  } catch (err) {
    error.value = userFacingError(err, CONSOLE_LOAD_ERROR);
  } finally {
    loading.value = false;
  }
}

async function open(userId: string) {
  detailError.value = '';
  detailLoading.value = true;
  saved.value = '';
  try {
    detail.value = await adminCustomerWalletsApi.detail(userId);
  } catch (err) {
    detail.value = null;
    detailError.value = userFacingError(err, CONSOLE_LOAD_ERROR);
  } finally {
    detailLoading.value = false;
  }
}

function askAdjust() {
  formError.value = '';
  saved.value = '';
  if (!Number.isInteger(amount.value) || amount.value < 1 || amount.value > 100_000_000) {
    formError.value = 'Số tiền là số nguyên từ 1 đến 100.000.000 ₫.';
    return;
  }
  if (reason.value.trim().length < 10) {
    formError.value = 'Lý do tối thiểu 10 ký tự.';
    return;
  }
  if (adjustType.value === 'DEBIT' && detail.value && amount.value > detail.value.balance) {
    formError.value = 'Không trừ quá số dư hiện có của khách.';
    return;
  }
  confirming.value = true;
}

async function adjust() {
  if (!detail.value) return;
  saving.value = true;
  try {
    const userId = detail.value.customer.id;
    const { balanceAfter } = await adminCustomerWalletsApi.adjust(userId, { type: adjustType.value, amount: amount.value, reason: reason.value.trim() });
    confirming.value = false;
    amountText.value = '';
    reason.value = '';
    await Promise.all([open(userId), load(page.value)]);
    saved.value = `Đã điều chỉnh, số dư mới ${balanceAfter.toLocaleString('vi-VN')} ₫.`;
  } catch (err) {
    confirming.value = false;
    formError.value = userFacingError(err, 'Chưa điều chỉnh được, thử lại sau.');
  } finally {
    saving.value = false;
  }
}

onMounted(() => load(1));
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Ví khách hàng">
      <template #badges>
        <span class="whitespace-nowrap rounded bg-ink-100 px-2 py-0.5 text-sm text-ink-600" title="Tổng số dư khách đang có trong ví FixHome">
          Đang giữ <strong class="text-ink-900" data-testid="wallets-total"><FhMoney :amount="totalBalance" /></strong>
        </span>
      </template>
    </ConsolePageHeader>

    <form class="flex flex-wrap items-center gap-2" @submit.prevent="load(1)">
      <div class="relative w-full min-w-0 sm:w-72">
        <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          maxlength="100"
          placeholder="Tên, email, số điện thoại"
          aria-label="Tìm khách hàng"
          data-testid="wallet-search"
          :class="consoleSearchField"
        />
      </div>
      <label class="flex items-center gap-2 whitespace-nowrap text-sm text-ink-700">
        <input v-model="withBalance" type="checkbox" class="h-4 w-4" data-testid="wallet-with-balance" @change="load(1)" /> Chỉ ví còn tiền
      </label>
      <FhButton type="submit" variant="secondary" size="sm" :loading="loading">Tìm</FhButton>
    </form>
    <p v-if="error" class="text-sm text-danger-700" role="alert">{{ error }}</p>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section class="overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white" aria-label="Danh sách ví khách">
        <div v-if="loading" class="space-y-3 p-4"><FhSkeleton height="36px" :count="5" /></div>
        <p v-else-if="rows.length === 0" class="px-5 py-10 text-center text-sm text-ink-500">Không có khách nào khớp.</p>
        <template v-else>
          <div class="flex items-center justify-between border-b border-ink-100 bg-ink-25 px-4 py-2.5 text-xs font-medium text-ink-500">
            <span><span class="font-num">{{ total }}</span> khách</span>
            <span>Số dư</span>
          </div>
          <ul class="divide-y divide-ink-100" data-testid="wallet-rows">
            <li v-for="r in rows" :key="r.userId">
              <button
                type="button"
                class="flex w-full justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50 focus:outline-none focus-visible:bg-ink-50"
                :class="detail?.customer.id === r.userId ? 'bg-brand-50' : ''"
                :aria-current="detail?.customer.id === r.userId ? 'true' : undefined"
                :data-testid="`wallet-row-${r.userId}`"
                @click="open(r.userId)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-ink-900">{{ r.fullName }}</span>
                  <span class="block truncate text-xs text-ink-500">{{ r.email }}<template v-if="r.phoneNumber"> · <span class="font-num">{{ r.phoneNumber }}</span></template></span>
                </span>
                <span class="shrink-0"><FhMoney :amount="r.balance" /></span>
              </button>
            </li>
          </ul>
          <div class="border-t border-ink-100 px-4 py-2">
            <ConsolePagination :page="page" :total-pages="totalPages" :disabled="loading" @update:page="load" />
          </div>
        </template>
      </section>

      <section class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-5" aria-label="Chi tiết ví">
        <div v-if="detailLoading && !detail" class="space-y-3"><FhSkeleton height="28px" :count="6" /></div>
        <p v-else-if="detailError" class="text-sm text-danger-700">{{ detailError }}</p>
        <p v-else-if="!detail" class="py-10 text-center text-sm text-ink-500">Chọn một khách để xem số dư, lịch sử và điều chỉnh.</p>
        <div v-else class="space-y-6 text-sm" data-testid="wallet-detail">
          <div>
            <h2 class="text-lg font-semibold text-ink-900">{{ detail.customer.fullName }}</h2>
            <p class="truncate text-sm text-ink-500">{{ detail.customer.email }}<template v-if="detail.customer.phoneNumber"> · <span class="font-num">{{ detail.customer.phoneNumber }}</span></template></p>
            <p class="mt-2" data-testid="wallet-balance"><FhMoney :amount="detail.balance" emphasis /></p>
          </div>

          <div class="border-t border-ink-100 pt-5">
            <h3 class="font-semibold text-ink-900">Điều chỉnh số dư</h3>
            <form class="mt-3 space-y-3" data-testid="adjust-form" @submit.prevent="askAdjust">
              <div class="flex gap-4 text-sm text-ink-700">
                <label class="flex items-center gap-1.5"><input v-model="adjustType" type="radio" value="CREDIT" data-testid="adjust-credit" /> Cộng tiền</label>
                <label class="flex items-center gap-1.5"><input v-model="adjustType" type="radio" value="DEBIT" data-testid="adjust-debit" /> Trừ tiền</label>
              </div>
              <input
                v-model="amountText"
                type="number"
                min="1"
                max="100000000"
                step="1"
                inputmode="numeric"
                placeholder="Số tiền (₫)"
                aria-label="Số tiền điều chỉnh"
                data-testid="adjust-amount"
                :class="consoleField"
                class="w-full font-num"
              />
              <textarea
                v-model="reason"
                rows="2"
                maxlength="500"
                placeholder="Lý do, khách sẽ đọc được (tối thiểu 10 ký tự)"
                aria-label="Lý do điều chỉnh"
                data-testid="adjust-reason"
                :class="consoleTextarea"
              />
              <p v-if="formError" class="text-sm text-danger-700" role="alert">{{ formError }}</p>
              <p v-if="saved" class="text-sm text-success-700" data-testid="adjust-saved">{{ saved }}</p>
              <FhButton type="submit" size="sm" data-testid="adjust-submit">Điều chỉnh</FhButton>
            </form>
          </div>

          <div class="border-t border-ink-100 pt-5">
            <h3 class="font-semibold text-ink-900">Lịch sử</h3>
            <p v-if="!detail.transactions.length" class="mt-1 text-sm text-ink-500">Chưa có giao dịch.</p>
            <ul v-else class="mt-1 divide-y divide-ink-100" data-testid="wallet-history">
              <li v-for="t in detail.transactions" :key="t.id" class="flex justify-between gap-3 py-2.5">
                <span class="min-w-0">
                  <span class="block font-medium text-ink-800">{{ customerWalletTypeLabels[t.type] ?? 'Giao dịch ví' }}</span>
                  <span v-if="t.description" class="block break-words text-xs text-ink-500">{{ t.description }}</span>
                  <span class="block whitespace-nowrap font-num text-xs text-ink-500">{{ vnDateTimeString(t.createdAt) }}</span>
                </span>
                <span class="shrink-0 text-right font-num">
                  <span class="block whitespace-nowrap font-semibold" :class="isIncomingWalletTransaction(t) ? 'text-success-700' : 'text-ink-900'">{{ isIncomingWalletTransaction(t) ? '+' : '−' }}<FhMoney :amount="t.amount" /></span>
                  <span class="block whitespace-nowrap text-xs text-ink-500">Còn <FhMoney :amount="t.balanceAfter" /></span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>

    <FhConfirmDialog
      :open="confirming"
      :loading="saving"
      :danger="adjustType === 'DEBIT'"
      title="Xác nhận điều chỉnh ví khách"
      :consequence="confirmText"
      confirm-text="Điều chỉnh"
      @confirm="adjust"
      @cancel="confirming = false"
    />
  </div>
</template>
