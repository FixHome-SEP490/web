<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  PlusCircle,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  RefreshCw,
  Info,
  Filter,
} from 'lucide-vue-next';
import {
  walletApi,
  type WalletSummary,
  type WalletTransaction,
  type WithdrawalRequest,
} from '../../api/wallet.api';
import {
  FhButton,
  FhStatusPill,
} from '../../components';
import {
  formatCurrencyVND,
  formatDateTimeVN,
  formatWalletTxType,
} from '../../utils/formatters';

const loading = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);

const wallet = ref<WalletSummary | null>(null);
const activeTab = ref<'transactions' | 'withdrawals'>('transactions');

// Transactions State
const transactions = ref<WalletTransaction[]>([]);
const txLoading = ref(false);
const txFilterType = ref<string>('ALL');
const txPage = ref(1);
const txTotalPages = ref(1);
const txTotal = ref(0);

// Withdrawals State
const withdrawals = ref<WithdrawalRequest[]>([]);
const wdLoading = ref(false);
const wdPage = ref(1);
const wdTotalPages = ref(1);
const wdTotal = ref(0);

// Modals
const showTopUpModal = ref(false);
const topUpAmount = ref<number>(200000);
const topUpSubmitting = ref(false);
const topUpSuccessMsg = ref<string | null>(null);

const showWithdrawModal = ref(false);
const withdrawAmount = ref<number>(100000);
const bankName = ref('Vietcombank');
const bankAccountNumber = ref('');
const bankAccountName = ref('');
const withdrawSubmitting = ref(false);
const withdrawError = ref<string | null>(null);

const topUpPresets = [100000, 200000, 500000, 1000000];

const popularBanks = [
  'Vietcombank',
  'Techcombank',
  'MB Bank',
  'BIDV',
  'VietinBank',
  'ACB',
  'VPBank',
  'TPBank',
];

const loadWallet = async () => {
  try {
    error.value = null;
    wallet.value = await walletApi.getMyWallet();
  } catch (err: unknown) {
    error.value =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Không thể tải thông tin ví. Vui lòng thử lại.';
  }
};

const loadTransactions = async () => {
  if (!wallet.value) return;
  txLoading.value = true;
  try {
    const res = await walletApi.getMyTransactions({
      page: txPage.value,
      limit: 15,
      type: txFilterType.value === 'ALL' ? undefined : txFilterType.value,
    });
    transactions.value = res.data;
    txTotal.value = res.meta.total;
    txTotalPages.value = res.meta.totalPages || 1;
  } catch (err) {
    console.error('Failed to load transactions:', err);
  } finally {
    txLoading.value = false;
  }
};

const loadWithdrawals = async () => {
  wdLoading.value = true;
  try {
    const res = await walletApi.getMyWithdrawals({
      page: wdPage.value,
      limit: 15,
    });
    withdrawals.value = res.data;
    wdTotal.value = res.meta.total;
    wdTotalPages.value = res.meta.totalPages || 1;
  } catch (err) {
    console.error('Failed to load withdrawals:', err);
  } finally {
    wdLoading.value = false;
  }
};

const refreshAll = async () => {
  refreshing.value = true;
  await loadWallet();
  if (activeTab.value === 'transactions') {
    await loadTransactions();
  } else {
    await loadWithdrawals();
  }
  refreshing.value = false;
};

watch(txFilterType, () => {
  txPage.value = 1;
  loadTransactions();
});

watch(activeTab, (newTab) => {
  if (newTab === 'transactions' && transactions.value.length === 0) {
    loadTransactions();
  } else if (newTab === 'withdrawals' && withdrawals.value.length === 0) {
    loadWithdrawals();
  }
});

onMounted(async () => {
  loading.value = true;
  await loadWallet();
  await loadTransactions();
  loading.value = false;
});

// Top-up Handler
const handleTopUp = async () => {
  if (!topUpAmount.value || topUpAmount.value < 10000) {
    alert('Số tiền nạp tối thiểu là 10.000 ₫');
    return;
  }
  topUpSubmitting.value = true;
  topUpSuccessMsg.value = null;
  try {
    const res = await walletApi.topUp(topUpAmount.value);
    topUpSuccessMsg.value = res.message || 'Nạp tiền vào ví thành công';
    await loadWallet();
    await loadTransactions();
    setTimeout(() => {
      showTopUpModal.value = false;
      topUpSuccessMsg.value = null;
    }, 1500);
  } catch (err: unknown) {
    alert(
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Nạp tiền thất bại, vui lòng thử lại',
    );
  } finally {
    topUpSubmitting.value = false;
  }
};

// Withdrawal Handler
const handleWithdraw = async () => {
  withdrawError.value = null;
  const max = wallet.value?.withdrawableBalance ?? 0;
  if (!withdrawAmount.value || withdrawAmount.value < 50000) {
    withdrawError.value = 'Số tiền rút tối thiểu là 50.000 ₫';
    return;
  }
  if (withdrawAmount.value > max) {
    withdrawError.value = `Số tiền rút không được vượt quá số dư khả dụng (${formatCurrencyVND(max)})`;
    return;
  }
  if (!bankName.value.trim() || !bankAccountNumber.value.trim() || !bankAccountName.value.trim()) {
    withdrawError.value = 'Vui lòng điền đầy đủ thông tin tài khoản ngân hàng';
    return;
  }

  withdrawSubmitting.value = true;
  try {
    await walletApi.requestWithdrawal({
      amount: withdrawAmount.value,
      bankName: bankName.value.trim(),
      bankAccountNumber: bankAccountNumber.value.trim(),
      bankAccountName: bankAccountName.value.trim().toUpperCase(),
    });
    showWithdrawModal.value = false;
    await loadWallet();
    activeTab.value = 'withdrawals';
    await loadWithdrawals();
  } catch (err: unknown) {
    withdrawError.value =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      'Tạo yêu cầu rút tiền thất bại';
  } finally {
    withdrawSubmitting.value = false;
  }
};
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
          <Wallet class="text-brand-600" :size="24" />
          <span>Ví Kỹ thuật viên</span>
        </h1>
        <p class="text-xs sm:text-sm text-ink-500 mt-1">
          Quản lý số dư ký quỹ, nhận thu nhập đơn thanh toán online, khấu trừ phí nền tảng và rút tiền về ngân hàng
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton variant="secondary" size="sm" :loading="refreshing" @click="refreshAll">
          <RefreshCw :size="14" class="mr-1.5" />
          Làm mới
        </FhButton>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="p-8 text-center text-ink-500">
      <RefreshCw class="animate-spin inline-block mr-2" :size="20" />
      Đang tải thông tin ví...
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-6 rounded-2xl bg-danger-50 border border-danger-200 text-danger-800">
      <p class="font-bold flex items-center gap-2">
        <AlertCircle :size="18" /> {{ error }}
      </p>
      <FhButton variant="secondary" size="sm" class="mt-3" @click="refreshAll">
        Thử lại
      </FhButton>
    </div>

    <template v-else-if="wallet">
      <!-- Ineligible / Low Balance Banner -->
      <div
        v-if="!wallet.eligibleForJobs"
        class="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
      >
        <div class="flex items-start gap-3">
          <AlertCircle :size="22" class="text-amber-600 shrink-0 mt-0.5" />
          <div class="text-xs sm:text-sm space-y-0.5">
            <div class="font-extrabold text-amber-900">
              Số dư ví dưới mức tối thiểu quy định ({{ formatCurrencyVND(wallet.minimumBalance) }})
            </div>
            <p class="text-amber-800">
              Tài khoản của bạn tạm dừng nhận các lời mời sửa chữa mới. Vui lòng nạp thêm tiền để kích hoạt lại điều kiện nhận việc.
            </p>
          </div>
        </div>
        <FhButton size="sm" class="shrink-0" @click="showTopUpModal = true">
          <PlusCircle :size="15" class="mr-1.5" />
          Nạp tiền ngay
        </FhButton>
      </div>

      <!-- Negative Balance Critical Banner -->
      <div
        v-if="wallet.balance < 0"
        class="p-4 sm:p-5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
      >
        <div class="flex items-start gap-3">
          <AlertCircle :size="22" class="text-rose-600 shrink-0 mt-0.5" />
          <div class="text-xs sm:text-sm space-y-0.5">
            <div class="font-extrabold text-rose-900">
              Ví của bạn đang có số dư âm do khấu trừ phí đơn tiền mặt
            </div>
            <p class="text-rose-800">
              Số dư hiện tại là <span class="font-bold text-rose-900">{{ formatCurrencyVND(wallet.balance) }}</span>. Vui lòng nạp tiền để hoàn tất công nợ với nền tảng.
            </p>
          </div>
        </div>
        <FhButton size="sm" variant="danger" class="shrink-0" @click="showTopUpModal = true">
          <PlusCircle :size="15" class="mr-1.5" />
          Thanh toán công nợ
        </FhButton>
      </div>

      <!-- Hero Wallet Balance Card -->
      <div class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-blue-700 via-brand-600 to-indigo-700 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2.5">
            <span class="text-xs font-bold uppercase tracking-wider text-blue-200 bg-white/10 px-2.5 py-0.5 rounded-full">
              Ví FixHome Kỹ thuật viên
            </span>
            <span
              v-if="wallet.eligibleForJobs"
              class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-300/30"
            >
              <CheckCircle2 :size="12" /> Đủ điều kiện nhận việc
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-400/20 text-rose-200 border border-rose-300/30"
            >
              <XCircle :size="12" /> Dưới mức ký quỹ
            </span>
          </div>

          <div class="text-xs text-blue-100 font-medium">Tổng số dư thực tế</div>
          <div class="text-3xl sm:text-5xl font-extrabold font-num tracking-tight">
            {{ formatCurrencyVND(wallet.balance) }}
          </div>

          <div class="text-xs text-blue-100/90 flex flex-wrap items-center gap-3 pt-1">
            <span>Ký quỹ tối thiểu: <strong class="text-white">{{ formatCurrencyVND(wallet.minimumBalance) }}</strong></span>
            <span>•</span>
            <span>Khả dụng để rút: <strong class="text-white">{{ formatCurrencyVND(wallet.withdrawableBalance) }}</strong></span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
          <button
            type="button"
            class="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white text-brand-700 hover:bg-blue-50 active:scale-95 text-xs sm:text-sm font-extrabold transition-all shadow-sm flex items-center justify-center gap-2"
            @click="showTopUpModal = true"
          >
            <ArrowDownLeft :size="16" />
            <span>Nạp tiền vào ví</span>
          </button>

          <button
            type="button"
            class="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white active:scale-95 text-xs sm:text-sm font-extrabold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="wallet.withdrawableBalance <= 0 || wallet.pendingWithdrawal > 0"
            :title="wallet.pendingWithdrawal > 0 ? 'Bạn đang có lệnh rút chờ xử lý' : 'Rút tiền về tài khoản ngân hàng'"
            @click="showWithdrawModal = true"
          >
            <ArrowUpRight :size="16" />
            <span>Rút tiền về ngân hàng</span>
          </button>
        </div>
      </div>

      <!-- Stat Cards Breakdown -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Card 1: Withdrawable Balance -->
        <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1.5">
          <div class="flex items-center justify-between text-xs font-bold text-ink-500">
            <span>Số dư có thể rút</span>
            <CreditCard :size="16" class="text-brand-600" />
          </div>
          <div class="text-2xl font-extrabold font-num text-ink-900">
            {{ formatCurrencyVND(wallet.withdrawableBalance) }}
          </div>
          <p class="text-[11px] text-ink-500">
            Đã trừ ký quỹ tối thiểu và các lệnh rút đang xử lý
          </p>
        </div>

        <!-- Card 2: Minimum Required -->
        <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1.5">
          <div class="flex items-center justify-between text-xs font-bold text-ink-500">
            <span>Mức ký quỹ duy trì</span>
            <Info :size="16" class="text-amber-500" />
          </div>
          <div class="text-2xl font-extrabold font-num text-ink-900">
            {{ formatCurrencyVND(wallet.minimumBalance) }}
          </div>
          <p class="text-[11px] text-ink-500">
            Duy trì để đảm bảo quyền nhận lời mời việc mới
          </p>
        </div>

        <!-- Card 3: Pending Withdrawal -->
        <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1.5">
          <div class="flex items-center justify-between text-xs font-bold text-ink-500">
            <span>Đang chờ duyệt rút</span>
            <Clock :size="16" class="text-violet-600" />
          </div>
          <div class="text-2xl font-extrabold font-num text-ink-900">
            {{ formatCurrencyVND(wallet.pendingWithdrawal) }}
          </div>
          <p class="text-[11px] text-ink-500">
            Đang được Service Manager thẩm định chuyển khoản
          </p>
        </div>
      </div>

      <!-- Main Navigation Tabs -->
      <div class="bg-white rounded-3xl border border-ink-200/80 shadow-xs overflow-hidden">
        <!-- Tab Headers -->
        <div class="flex items-center border-b border-ink-200 px-6 pt-4 gap-6">
          <button
            type="button"
            class="pb-3 text-sm font-extrabold border-b-2 transition-all flex items-center gap-2"
            :class="[
              activeTab === 'transactions'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            ]"
            @click="activeTab = 'transactions'"
          >
            <span>Biến động số dư</span>
            <span class="px-2 py-0.5 rounded-full text-xs font-num font-bold bg-ink-100 text-ink-700">
              {{ txTotal }}
            </span>
          </button>

          <button
            type="button"
            class="pb-3 text-sm font-extrabold border-b-2 transition-all flex items-center gap-2"
            :class="[
              activeTab === 'withdrawals'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            ]"
            @click="activeTab = 'withdrawals'"
          >
            <span>Lịch sử rút tiền</span>
            <span
              v-if="wallet.pendingWithdrawal > 0"
              class="w-2 h-2 rounded-full bg-amber-500"
            />
          </button>
        </div>

        <!-- TAB 1: TRANSACTIONS LEDGER -->
        <div v-if="activeTab === 'transactions'" class="p-6 space-y-4">
          <!-- Filter Bar -->
          <div class="flex flex-wrap items-center justify-between gap-3 pb-2">
            <div class="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              <span class="text-ink-400 mr-1 flex items-center gap-1">
                <Filter :size="13" /> Lọc:
              </span>
              <button
                v-for="f in [
                  { id: 'ALL', label: 'Tất cả' },
                  { id: 'ONLINE_EARNING', label: 'Thu nhập online' },
                  { id: 'PLATFORM_FEE', label: 'Phí nền tảng' },
                  { id: 'TOP_UP', label: 'Nạp tiền' },
                  { id: 'WITHDRAW', label: 'Rút tiền' },
                  { id: 'ADJUSTMENT', label: 'Điều chỉnh' },
                ]"
                :key="f.id"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs transition-all"
                :class="[
                  txFilterType === f.id
                    ? 'bg-brand-50 text-brand-700 font-extrabold border border-brand-200'
                    : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                ]"
                @click="txFilterType = f.id"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="txLoading" class="py-12 text-center text-ink-400 text-xs">
            <RefreshCw class="animate-spin inline-block mr-2" :size="16" />
            Đang tải dữ liệu giao dịch...
          </div>

          <!-- Empty state -->
          <div
            v-else-if="transactions.length === 0"
            class="py-12 text-center text-ink-400 text-xs space-y-2"
          >
            <Wallet :size="32" class="mx-auto text-ink-300 stroke-1" />
            <p>Chưa có giao dịch biến động số dư nào</p>
          </div>

          <!-- Transaction List -->
          <div v-else class="divide-y divide-ink-100">
            <div
              v-for="tx in transactions"
              :key="tx.id"
              class="py-3.5 flex items-center justify-between gap-4 hover:bg-ink-50/50 px-2 rounded-xl transition-colors"
            >
              <div class="flex items-center gap-3 min-w-0">
                <!-- Icon badge -->
                <div
                  class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  :class="[
                    formatWalletTxType(tx.type).isCredit
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-rose-50 text-rose-600'
                  ]"
                >
                  <ArrowDownLeft v-if="formatWalletTxType(tx.type).isCredit" :size="18" />
                  <ArrowUpRight v-else :size="18" />
                </div>

                <!-- Info -->
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs sm:text-sm font-extrabold text-ink-900 truncate">
                      {{ formatWalletTxType(tx.type).label }}
                    </span>
                    <span
                      v-if="tx.referenceType === 'SERVICE_ORDER' && tx.referenceId"
                      class="text-[11px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700"
                    >
                      Đơn hàng
                    </span>
                  </div>
                  <p class="text-xs text-ink-500 truncate">
                    {{ tx.description || 'Giao dịch ví FixHome' }}
                  </p>
                  <div class="text-[11px] text-ink-400 flex items-center gap-2">
                    <span>{{ formatDateTimeVN(tx.createdAt) }}</span>
                    <span>•</span>
                    <span>Số dư sau: <strong class="font-num text-ink-600">{{ formatCurrencyVND(tx.balanceAfter) }}</strong></span>
                  </div>
                </div>
              </div>

              <!-- Amount -->
              <div class="text-right shrink-0">
                <div
                  class="text-sm sm:text-base font-extrabold font-num"
                  :class="[
                    formatWalletTxType(tx.type).isCredit ? 'text-emerald-600' : 'text-rose-600'
                  ]"
                >
                  {{ formatWalletTxType(tx.type).isCredit ? '+' : '-' }}{{ formatCurrencyVND(tx.amount) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div
            v-if="txTotalPages > 1"
            class="flex items-center justify-between pt-4 border-t border-ink-100 text-xs text-ink-500"
          >
            <span>Trang {{ txPage }} / {{ txTotalPages }} (Tổng {{ txTotal }} giao dịch)</span>
            <div class="flex items-center gap-2">
              <FhButton
                variant="secondary"
                size="sm"
                :disabled="txPage <= 1"
                @click="txPage--; loadTransactions()"
              >
                Trước
              </FhButton>
              <FhButton
                variant="secondary"
                size="sm"
                :disabled="txPage >= txTotalPages"
                @click="txPage++; loadTransactions()"
              >
                Sau
              </FhButton>
            </div>
          </div>
        </div>

        <!-- TAB 2: WITHDRAWALS HISTORY -->
        <div v-else-if="activeTab === 'withdrawals'" class="p-6 space-y-4">
          <!-- Loading -->
          <div v-if="wdLoading" class="py-12 text-center text-ink-400 text-xs">
            <RefreshCw class="animate-spin inline-block mr-2" :size="16" />
            Đang tải lịch sử rút tiền...
          </div>

          <!-- Empty -->
          <div
            v-else-if="withdrawals.length === 0"
            class="py-12 text-center text-ink-400 text-xs space-y-2"
          >
            <CreditCard :size="32" class="mx-auto text-ink-300 stroke-1" />
            <p>Chưa có yêu cầu rút tiền nào</p>
          </div>

          <!-- Table -->
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-ink-50 text-ink-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-ink-100">
                <tr>
                  <th class="py-3 px-3">Thời gian</th>
                  <th class="py-3 px-3">Số tiền</th>
                  <th class="py-3 px-3">Tài khoản ngân hàng</th>
                  <th class="py-3 px-3">Trạng thái</th>
                  <th class="py-3 px-3">Ghi chú / Lý do</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                <tr v-for="w in withdrawals" :key="w.id" class="hover:bg-ink-50/50">
                  <td class="py-3.5 px-3 text-ink-600 whitespace-nowrap">
                    {{ formatDateTimeVN(w.requestedAt) }}
                  </td>
                  <td class="py-3.5 px-3 font-extrabold font-num text-ink-900 whitespace-nowrap">
                    {{ formatCurrencyVND(w.amount) }}
                  </td>
                  <td class="py-3.5 px-3">
                    <div class="font-bold text-ink-900">{{ w.bankName }}</div>
                    <div class="text-[11px] text-ink-500 font-num">{{ w.bankAccountNumber }} — {{ w.bankAccountName }}</div>
                  </td>
                  <td class="py-3.5 px-3 whitespace-nowrap">
                    <FhStatusPill :status="w.status" />
                  </td>
                  <td class="py-3.5 px-3 text-ink-500 max-w-xs">
                    <span v-if="w.status === 'REJECTED' && w.rejectReason" class="text-rose-600 font-medium">
                      Lý do: {{ w.rejectReason }}
                    </span>
                    <span v-else-if="w.status === 'SUCCESS' && w.processedAt">
                      Đã xử lý lúc {{ formatDateTimeVN(w.processedAt) }}
                    </span>
                    <span v-else-if="w.status === 'PENDING'">
                      Đang đợi Service Manager phê duyệt
                    </span>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- MODAL 1: NẠP TIỀN VÀO VÍ -->
    <div
      v-if="showTopUpModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-extrabold text-ink-900 flex items-center gap-2">
            <ArrowDownLeft class="text-brand-600" :size="20" />
            <span>Nạp tiền vào ví KTV</span>
          </h3>
          <button
            type="button"
            class="text-ink-400 hover:text-ink-700 text-lg font-bold"
            @click="showTopUpModal = false"
          >
            ✕
          </button>
        </div>

        <div v-if="topUpSuccessMsg" class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 :size="18" /> {{ topUpSuccessMsg }}
        </div>

        <div v-else class="space-y-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Chọn nhanh mức nạp:</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="amt in topUpPresets"
                :key="amt"
                type="button"
                class="py-2.5 px-3 rounded-xl border text-xs font-extrabold font-num transition-all"
                :class="[
                  topUpAmount === amt
                    ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-600/20'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300'
                ]"
                @click="topUpAmount = amt"
              >
                {{ formatCurrencyVND(amt) }}
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Hoặc nhập số tiền khác (₫):</label>
            <div class="relative">
              <input
                v-model.number="topUpAmount"
                type="number"
                min="10000"
                step="10000"
                placeholder="200000"
                class="w-full px-4 py-3 rounded-xl border border-ink-200 font-num font-extrabold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
              />
              <span class="absolute right-4 top-3.5 text-xs font-bold text-ink-400">VNĐ</span>
            </div>
            <p class="text-[11px] text-ink-500">Mức nạp tối thiểu là 10.000 ₫</p>
          </div>

          <div class="p-3.5 rounded-xl bg-ink-50 text-xs space-y-1 border border-ink-100">
            <div class="flex items-center justify-between text-ink-600">
              <span>Số dư hiện tại:</span>
              <span class="font-extrabold font-num">{{ formatCurrencyVND(wallet?.balance) }}</span>
            </div>
            <div class="flex items-center justify-between text-ink-900 font-bold">
              <span>Số dư dự kiến sau nạp:</span>
              <span class="font-extrabold font-num text-emerald-600">
                {{ formatCurrencyVND((wallet?.balance ?? 0) + (topUpAmount || 0)) }}
              </span>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <FhButton variant="secondary" size="md" @click="showTopUpModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton
              variant="primary"
              size="md"
              :loading="topUpSubmitting"
              @click="handleTopUp"
            >
              Xác nhận nạp tiền
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 2: YÊU CẦU RÚT TIỀN -->
    <div
      v-if="showWithdrawModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-extrabold text-ink-900 flex items-center gap-2">
            <ArrowUpRight class="text-brand-600" :size="20" />
            <span>Yêu cầu rút tiền về ngân hàng</span>
          </h3>
          <button
            type="button"
            class="text-ink-400 hover:text-ink-700 text-lg font-bold"
            @click="showWithdrawModal = false"
          >
            ✕
          </button>
        </div>

        <div v-if="withdrawError" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle :size="16" /> {{ withdrawError }}
        </div>

        <div class="space-y-4">
          <div class="p-3.5 rounded-xl bg-blue-50 text-xs space-y-1 border border-blue-100">
            <div class="flex items-center justify-between text-blue-900 font-bold">
              <span>Khả dụng để rút:</span>
              <span class="font-extrabold font-num text-brand-700 text-sm">
                {{ formatCurrencyVND(wallet?.withdrawableBalance) }}
              </span>
            </div>
            <p class="text-[11px] text-blue-700">
              Đã giữ lại mức ký quỹ duy trì tối thiểu {{ formatCurrencyVND(wallet?.minimumBalance) }}
            </p>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Số tiền muốn rút (₫):</label>
            <div class="relative">
              <input
                v-model.number="withdrawAmount"
                type="number"
                min="50000"
                :max="wallet?.withdrawableBalance ?? 0"
                step="10000"
                placeholder="100000"
                class="w-full px-4 py-3 rounded-xl border border-ink-200 font-num font-extrabold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
              />
              <span class="absolute right-4 top-3.5 text-xs font-bold text-ink-400">VNĐ</span>
            </div>
            <p class="text-[11px] text-ink-500">Rút tối thiểu 50.000 ₫</p>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Ngân hàng thụ hưởng:</label>
            <select
              v-model="bankName"
              class="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option v-for="b in popularBanks" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Số tài khoản ngân hàng:</label>
            <input
              v-model="bankAccountNumber"
              type="text"
              placeholder="VD: 1012345678"
              class="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 font-num text-xs font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Tên chủ tài khoản (In hoa không dấu):</label>
            <input
              v-model="bankAccountName"
              type="text"
              placeholder="VD: NGUYEN VAN A"
              class="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 text-xs font-bold text-ink-900 uppercase focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <FhButton variant="secondary" size="md" @click="showWithdrawModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton
              variant="primary"
              size="md"
              :loading="withdrawSubmitting"
              @click="handleWithdraw"
            >
              Gửi yêu cầu rút tiền
            </FhButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
