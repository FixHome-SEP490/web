<script setup lang="ts">
// Admin: every customer's wallet, one customer's history and a correction
// with a reason (PO 09/10/2026). FixHome bears refunds; this is the tool to
// fix a mistake, the customer is notified and the change is audited.
import { computed, onMounted, ref } from 'vue';
import { Search, WalletCards } from 'lucide-vue-next';
import { FhButton, FhCard, FhConfirmDialog, FhEmptyState, FhMoney, FhSkeleton } from '../../../components';
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
    error.value = userFacingError(err, 'Chưa tải được danh sách ví, thử lại sau.');
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
    detailError.value = userFacingError(err, 'Chưa tải được ví của khách.');
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
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2"><WalletCards :size="24" class="text-ink-600" /> Ví khách hàng</h1>
      <p class="text-xs text-ink-500 mt-1">Số dư khách nạp hoặc được hoàn, dùng để trả đơn và không rút ra được. Tổng số dư đang giữ: <strong class="text-ink-900" data-testid="wallets-total"><FhMoney :amount="totalBalance" /></strong></p>
    </div>

    <form class="flex flex-wrap items-center gap-2" @submit.prevent="load(1)">
      <input
        v-model="search"
        type="search"
        maxlength="100"
        placeholder="Tên, email hoặc số điện thoại"
        aria-label="Tìm khách hàng"
        data-testid="wallet-search"
        class="flex-1 min-w-[200px] rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm"
      />
      <label class="flex items-center gap-1.5 text-xs text-ink-700">
        <input v-model="withBalance" type="checkbox" data-testid="wallet-with-balance" @change="load(1)" /> Chỉ ví còn tiền
      </label>
      <FhButton type="submit" :loading="loading"><Search :size="15" class="mr-1" /> Tìm</FhButton>
    </form>
    <p v-if="error" class="text-xs text-danger-700" role="alert">{{ error }}</p>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <FhCard>
        <div v-if="loading" class="p-4"><FhSkeleton height="36px" :count="4" /></div>
        <FhEmptyState v-else-if="rows.length === 0" title="Không có khách nào" description="Không có ví khách nào khớp." />
        <template v-else>
          <p class="px-1 pb-2 text-xs text-ink-500">{{ total }} khách</p>
          <ul class="divide-y divide-ink-100" data-testid="wallet-rows">
            <li v-for="r in rows" :key="r.userId">
              <button
                type="button"
                class="w-full text-left px-2 py-2.5 rounded-lg hover:bg-ink-50 flex justify-between gap-3"
                :class="detail?.customer.id === r.userId ? 'bg-brand-50' : ''"
                :data-testid="`wallet-row-${r.userId}`"
                @click="open(r.userId)"
              >
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-ink-900">{{ r.fullName }}</span>
                  <span class="block text-xs text-ink-500 break-all">{{ r.email }}<template v-if="r.phoneNumber"> · {{ r.phoneNumber }}</template></span>
                </span>
                <span class="shrink-0 text-sm font-bold font-num text-ink-900"><FhMoney :amount="r.balance" /></span>
              </button>
            </li>
          </ul>
          <div v-if="totalPages > 1" class="flex items-center justify-between pt-3 text-xs text-ink-500">
            <FhButton variant="secondary" size="sm" :disabled="page <= 1" @click="load(page - 1)">Trước</FhButton>
            <span>Trang {{ page }}/{{ totalPages }}</span>
            <FhButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="load(page + 1)">Sau</FhButton>
          </div>
        </template>
      </FhCard>

      <FhCard>
        <div v-if="detailLoading && !detail" class="p-4"><FhSkeleton height="28px" :count="6" /></div>
        <p v-else-if="detailError" class="text-xs text-danger-700">{{ detailError }}</p>
        <FhEmptyState v-else-if="!detail" title="Chọn một khách" description="Số dư, lịch sử và điều chỉnh sẽ hiện ở đây." />
        <div v-else class="space-y-5 text-sm" data-testid="wallet-detail">
          <section>
            <h2 class="text-lg font-bold text-ink-900">{{ detail.customer.fullName }}</h2>
            <p class="text-xs text-ink-500 break-all">{{ detail.customer.email }}<template v-if="detail.customer.phoneNumber"> · {{ detail.customer.phoneNumber }}</template></p>
            <p class="mt-2 text-2xl font-bold font-num text-ink-900" data-testid="wallet-balance"><FhMoney :amount="detail.balance" /></p>
          </section>

          <section>
            <h3 class="font-bold text-ink-900">Điều chỉnh số dư</h3>
            <form class="mt-2 space-y-3" data-testid="adjust-form" @submit.prevent="askAdjust">
              <div class="flex gap-4 text-xs text-ink-700">
                <label class="flex items-center gap-1.5"><input v-model="adjustType" type="radio" value="CREDIT" data-testid="adjust-credit" /> Cộng tiền</label>
                <label class="flex items-center gap-1.5"><input v-model="adjustType" type="radio" value="DEBIT" data-testid="adjust-debit" /> Trừ tiền</label>
              </div>
              <input
                v-model="amountText"
                type="number"
                min="1"
                max="100000000"
                step="1"
                placeholder="Số tiền (₫)"
                aria-label="Số tiền điều chỉnh"
                data-testid="adjust-amount"
                class="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm"
              />
              <textarea
                v-model="reason"
                rows="2"
                maxlength="500"
                placeholder="Lý do, khách sẽ đọc được (tối thiểu 10 ký tự)"
                aria-label="Lý do điều chỉnh"
                data-testid="adjust-reason"
                class="w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm"
              />
              <p v-if="formError" class="text-xs text-danger-700" role="alert">{{ formError }}</p>
              <p v-if="saved" class="text-xs text-success-700" data-testid="adjust-saved">{{ saved }}</p>
              <FhButton type="submit" size="sm" data-testid="adjust-submit">Điều chỉnh</FhButton>
            </form>
          </section>

          <section>
            <h3 class="font-bold text-ink-900">Lịch sử</h3>
            <p v-if="!detail.transactions.length" class="text-xs text-ink-500">Chưa có giao dịch.</p>
            <ul v-else class="mt-1 text-xs divide-y divide-ink-100" data-testid="wallet-history">
              <li v-for="t in detail.transactions" :key="t.id" class="flex justify-between gap-3 py-1.5">
                <span class="min-w-0">
                  <span class="block font-semibold text-ink-800">{{ customerWalletTypeLabels[t.type] ?? t.type }}</span>
                  <span v-if="t.description" class="block text-ink-500 break-words">{{ t.description }}</span>
                  <span class="block text-ink-400">{{ vnDateTimeString(t.createdAt) }}</span>
                </span>
                <span class="shrink-0 text-right font-num">
                  <span class="block font-bold" :class="isIncomingWalletTransaction(t) ? 'text-success-700' : 'text-ink-900'">{{ isIncomingWalletTransaction(t) ? '+' : '−' }}<FhMoney :amount="t.amount" /></span>
                  <span class="block text-ink-400">Còn <FhMoney :amount="t.balanceAfter" /></span>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </FhCard>
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
