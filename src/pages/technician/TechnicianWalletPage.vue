<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
  CheckCircle2,
  XCircle,
  CreditCard,
  RefreshCw,
  ChevronRight,
  Landmark,
  X,
} from 'lucide-vue-next';
import {
  walletApi,
  type WalletSummary,
  type WalletTransaction,
  type WithdrawalRequest,
  type BankAccount,
  type BankOption,
} from '../../api/wallet.api';
import {
  FhButton,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import {
  formatCurrencyVND,
  formatDateTimeVN,
  formatWalletTxType,
  formatWithdrawalStatus,
} from '../../utils/formatters';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { toast } from 'vue-sonner';
import { userFacingError, withoutCodes } from '../../utils/user-facing-error';

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
const txError = ref<string | null>(null);

const txFilters = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'ONLINE_EARNING', label: 'Thu nhập online' },
  { id: 'PLATFORM_FEE', label: 'Phí nền tảng' },
  { id: 'TOP_UP', label: 'Nạp tiền' },
  { id: 'WITHDRAW', label: 'Rút tiền' },
  { id: 'WITHDRAW_REFUND', label: 'Hoàn tiền rút' },
  { id: 'ADJUSTMENT', label: 'Điều chỉnh' },
];

// Withdrawals State
const withdrawals = ref<WithdrawalRequest[]>([]);
const wdLoading = ref(false);
const wdError = ref<string | null>(null);
const wdPage = ref(1);
const wdTotalPages = ref(1);
const wdTotal = ref(0);

// Modals
const showTopUpModal = ref(false);
const topUpAmount = ref<number>(200000);
const topUpSubmitting = ref(false);
const topUpSuccessMsg = ref<string | null>(null);
const topUpError = ref<string | null>(null);

watch(showTopUpModal, (open) => {
  if (open) {
    topUpError.value = null;
    topUpSuccessMsg.value = null;
  }
});

const showWithdrawModal = ref(false);
const withdrawAmount = ref<number>(100000);
const withdrawSubmitting = ref(false);
const withdrawError = ref<string | null>(null);

const topUpPresets = [100000, 200000, 500000, 1000000];

// ---- Bank account the money is paid to --------------------------------------
// Saved once and reused. The backend only accepts it when the holder name
// matches the name verified at KYC, which is why a withdrawal never carries
// its own bank details.
const bankAccount = ref<BankAccount | null>(null);
const banks = ref<BankOption[]>([]);
const showBankModal = ref(false);
const bankForm = ref({ bankBin: '', accountNumber: '', accountName: '' });
const bankSaving = ref(false);
const bankError = ref<string | null>(null);
/** Set when the technician tried to withdraw before saving an account. */
const bankNeededForWithdraw = ref(false);

/** Falls back to the PO's 10.000 ₫ if an older backend omits the field. */
const minimumWithdrawal = computed(() => wallet.value?.minimumWithdrawal ?? 10000);

const withdrawBlockedReason = computed<string | null>(() => {
  if (!wallet.value) return 'Đang tải ví';
  if ((wallet.value.processingWithdrawal ?? 0) > 0) {
    return 'Bạn có lệnh rút đang được chuyển về ngân hàng';
  }
  if (wallet.value.pendingWithdrawal > 0) return 'Bạn có lệnh rút đang chờ xử lý';
  if (wallet.value.withdrawableBalance < minimumWithdrawal.value) {
    return `Cần tối thiểu ${formatCurrencyVND(minimumWithdrawal.value)} có thể rút`;
  }
  return null;
});

/** Only the last four digits are shown outside the edit form. */
const maskedAccountNumber = computed(() => {
  const number = bankAccount.value?.accountNumber ?? '';
  return number.length > 4 ? `•••• ${number.slice(-4)}` : number;
});

/** Money already on its way to the bank (waiting or being paid out). */
const inFlightWithdrawal = computed(
  () => (wallet.value?.pendingWithdrawal ?? 0) + (wallet.value?.processingWithdrawal ?? 0),
);

/** A ledger line that belongs to a repair job opens that job. */
const txJobId = (tx: WalletTransaction): string | null =>
  tx.referenceType === 'SERVICE_ORDER' && tx.referenceId ? tx.referenceId : null;

const openTxJob = (tx: WalletTransaction) => {
  const id = txJobId(tx);
  if (id) void router.push(`/tech/jobs/${id}`);
};

const loadWallet = async () => {
  try {
    error.value = null;
    wallet.value = await walletApi.getMyWallet();
  } catch (err: unknown) {
    error.value = userFacingError(err, 'Không thể tải thông tin ví. Vui lòng thử lại.');
  }
};

const loadTransactions = async () => {
  if (!wallet.value) return;
  txLoading.value = true;
  txError.value = null;
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
    txError.value = userFacingError(err, 'Không thể tải biến động số dư. Vui lòng thử lại.');
  } finally {
    txLoading.value = false;
  }
};

const loadBankAccount = async () => {
  try {
    bankAccount.value = await walletApi.getMyBankAccount();
  } catch (err) {
    console.error('Failed to load bank account:', err);
  }
};

const loadBanks = async () => {
  if (banks.value.length > 0) return;
  try {
    banks.value = await walletApi.listBanks();
  } catch (err) {
    console.error('Failed to load bank list:', err);
  }
};

const loadWithdrawals = async () => {
  wdLoading.value = true;
  wdError.value = null;
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
    wdError.value = userFacingError(err, 'Không thể tải lịch sử rút tiền. Vui lòng thử lại.');
  } finally {
    wdLoading.value = false;
  }
};

const refreshAll = async () => {
  refreshing.value = true;
  await Promise.all([loadWallet(), loadBankAccount()]);
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

const route = useRoute();
const router = useRouter();
const returnBanner = ref<{ type: 'success' | 'error'; message: string } | null>(null);

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadWallet(), loadBankAccount()]);
  await loadTransactions();
  loading.value = false;

  if (route.query.payment === 'success') {
    returnBanner.value = {
      type: 'success',
      message: 'Nạp tiền thành công. Số dư đã được cập nhật.',
    };
    await loadWallet();
    await loadTransactions();
    router.replace({ query: {} });
  } else if (route.query.payment === 'failed') {
    returnBanner.value = {
      type: 'error',
      message: 'Nạp tiền chưa thành công hoặc đã bị huỷ. Vui lòng thử lại.',
    };
    router.replace({ query: {} });
  }
});

// Top-up Handler
const handleTopUp = async () => {
  topUpError.value = null;
  if (!topUpAmount.value || topUpAmount.value < 10000) {
    topUpError.value = 'Số tiền nạp tối thiểu là 10.000 ₫';
    return;
  }
  if (topUpAmount.value > 50000000) {
    topUpError.value = 'Số tiền nạp tối đa mỗi lần là 50.000.000 ₫';
    return;
  }
  topUpSubmitting.value = true;
  topUpSuccessMsg.value = null;
  try {
    // The wallet is credited only after VNPay confirms; topUp throws when no
    // payment page was opened, so there is no "instant credit" branch here.
    const res = await walletApi.topUp(topUpAmount.value);
    topUpSuccessMsg.value = 'Đang chuyển tới VNPay…';
    setTimeout(() => {
      window.location.href = res.paymentUrl;
    }, 500);
  } catch (err: unknown) {
    topUpError.value = userFacingError(err, 'Nạp tiền thất bại. Vui lòng thử lại.');
  } finally {
    topUpSubmitting.value = false;
  }
};

// Bank account handlers
const openBankModal = async (forWithdraw = false) => {
  bankNeededForWithdraw.value = forWithdraw;
  bankError.value = null;
  bankForm.value = {
    bankBin: bankAccount.value?.bankBin ?? '',
    accountNumber: bankAccount.value?.accountNumber ?? '',
    accountName: bankAccount.value?.accountName ?? '',
  };
  showBankModal.value = true;
  await loadBanks();
};

const handleSaveBank = async () => {
  bankError.value = null;
  const accountNumber = bankForm.value.accountNumber.trim();
  const accountName = bankForm.value.accountName.trim();
  if (!bankForm.value.bankBin) {
    bankError.value = 'Vui lòng chọn ngân hàng';
    return;
  }
  if (!/^\d{6,19}$/.test(accountNumber)) {
    bankError.value = 'Số tài khoản chỉ gồm chữ số, từ 6 đến 19 số';
    return;
  }
  if (!accountName) {
    bankError.value = 'Vui lòng nhập tên chủ tài khoản';
    return;
  }

  bankSaving.value = true;
  try {
    bankAccount.value = await walletApi.saveMyBankAccount({
      bankBin: bankForm.value.bankBin,
      accountNumber,
      accountName,
    });
    showBankModal.value = false;
    // They came here on the way to withdrawing: carry on to where they meant to go.
    if (bankNeededForWithdraw.value) openWithdraw();
  } catch (err: unknown) {
    bankError.value = extractApiErrorMessage(err, 'Không lưu được tài khoản ngân hàng');
  } finally {
    bankSaving.value = false;
  }
};

// Withdrawal Handler
const openWithdraw = () => {
  if (withdrawBlockedReason.value) return;
  if (!bankAccount.value) {
    void openBankModal(true);
    return;
  }
  withdrawError.value = null;
  withdrawAmount.value = Math.min(
    Math.max(100000, minimumWithdrawal.value),
    wallet.value?.withdrawableBalance ?? 0,
  );
  showWithdrawModal.value = true;
};

const handleWithdraw = async () => {
  withdrawError.value = null;
  const amount = Number(withdrawAmount.value);
  const max = wallet.value?.withdrawableBalance ?? 0;
  if (!Number.isInteger(amount) || amount < minimumWithdrawal.value) {
    withdrawError.value = `Số tiền rút tối thiểu là ${formatCurrencyVND(minimumWithdrawal.value)}`;
    return;
  }
  if (amount > max) {
    withdrawError.value = `Số tiền rút không được vượt quá số dư khả dụng (${formatCurrencyVND(max)})`;
    return;
  }

  withdrawSubmitting.value = true;
  try {
    // No approval step: this call is the payout, and it says how it ended.
    const result = await walletApi.requestWithdrawal(amount);
    showWithdrawModal.value = false;
    if (result.status === 'SUCCESS') {
      toast.success(result.message, {
        description: result.payoutBankReference
          ? `Mã giao dịch ngân hàng: ${result.payoutBankReference}`
          : undefined,
      });
    } else if (result.status === 'FAILED') {
      toast.error(result.message, { description: withoutCodes(result.failureReason) || undefined });
    } else {
      toast.info(result.message);
    }
    await Promise.all([loadWallet(), loadTransactions()]);
    activeTab.value = 'withdrawals';
    await loadWithdrawals();
  } catch (err: unknown) {
    // Refused before any money moved: the wallet is untouched.
    withdrawError.value = extractApiErrorMessage(err, 'Rút tiền không thành công');
  } finally {
    withdrawSubmitting.value = false;
  }
};
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header: title + quiet refresh -->
    <div class="flex items-center justify-between gap-3">
      <h1 class="min-w-0 text-xl sm:text-2xl font-bold text-ink-900 tracking-tight text-balance">
        Ví của tôi
      </h1>
      <button
        type="button"
        class="shrink-0 w-10 h-10 rounded-xl text-ink-500 hover:text-ink-800 hover:bg-ink-100 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50"
        aria-label="Làm mới"
        title="Làm mới"
        :disabled="refreshing"
        @click="refreshAll"
      >
        <RefreshCw :size="18" :class="refreshing ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- VNPay return -->
    <div
      v-if="returnBanner"
      role="status"
      :class="[
        'px-4 py-3 rounded-2xl border flex items-center gap-3',
        returnBanner.type === 'success'
          ? 'bg-success-50 border-success-200 text-success-800'
          : 'bg-danger-50 border-danger-200 text-danger-700',
      ]"
    >
      <CheckCircle2 v-if="returnBanner.type === 'success'" :size="18" class="text-success-600 shrink-0" />
      <XCircle v-else :size="18" class="text-danger-600 shrink-0" />
      <span class="min-w-0 flex-1 text-sm font-medium text-pretty">{{ returnBanner.message }}</span>
      <button
        type="button"
        class="shrink-0 w-10 h-10 -my-2 -mr-2 rounded-xl flex items-center justify-center opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        aria-label="Đóng thông báo"
        @click="returnBanner = null"
      >
        <X :size="16" />
      </button>
    </div>

    <!-- Loading: same shape as the page -->
    <div v-if="loading" class="space-y-6" aria-busy="true" aria-label="Đang tải ví">
      <div class="p-6 rounded-3xl bg-white border border-ink-200/80 space-y-4">
        <FhSkeleton width="120px" height="14px" />
        <FhSkeleton width="220px" height="40px" rounded="md" />
        <div class="grid grid-cols-3 gap-4 pt-2">
          <FhSkeleton height="32px" />
          <FhSkeleton height="32px" />
          <FhSkeleton height="32px" />
        </div>
      </div>
      <FhSkeleton height="64px" rounded="lg" />
      <div class="p-6 rounded-3xl bg-white border border-ink-200/80 space-y-5">
        <FhSkeleton width="260px" height="20px" />
        <FhSkeleton height="48px" :count="5" />
      </div>
    </div>

    <!-- Wallet failed to load -->
    <div
      v-else-if="error"
      class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 flex items-center gap-3"
    >
      <AlertCircle :size="18" class="shrink-0 text-danger-600" />
      <span class="min-w-0 flex-1 text-sm font-medium">{{ error }}</span>
      <FhButton variant="secondary" size="sm" :loading="refreshing" @click="refreshAll">
        Thử lại
      </FhButton>
    </div>

    <template v-else-if="wallet">
      <!-- One alert at most: a negative balance is the stronger case -->
      <div
        v-if="wallet.balance < 0"
        role="alert"
        class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 flex items-start gap-3"
      >
        <AlertCircle :size="18" class="shrink-0 mt-0.5 text-danger-600" />
        <p class="text-sm text-pretty">
          Số dư đang âm <strong class="font-num whitespace-nowrap">{{ formatCurrencyVND(wallet.balance) }}</strong>
          do khấu trừ phí đơn tiền mặt. Nạp tiền để trả công nợ.
        </p>
      </div>
      <div
        v-else-if="!wallet.eligibleForJobs"
        class="px-4 py-3 rounded-2xl bg-warning-50 border border-warning-200 text-warning-800 flex items-start gap-3"
      >
        <AlertCircle :size="18" class="shrink-0 mt-0.5 text-warning-600" />
        <p class="text-sm text-pretty">
          Số dư dưới mức ký quỹ
          <strong class="font-num whitespace-nowrap">{{ formatCurrencyVND(wallet.minimumBalance) }}</strong>,
          bạn tạm không nhận lời mời mới. Nạp thêm để nhận việc lại.
        </p>
      </div>

      <!-- Balance: the page's one accent block, holding both money actions -->
      <section class="p-5 sm:p-7 rounded-3xl bg-brand-600 text-white shadow-md space-y-6">
        <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-brand-100 whitespace-nowrap">Số dư</span>
              <span
                v-if="wallet.eligibleForJobs"
                class="whitespace-nowrap inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-success-400/20 text-success-200 border border-success-300/30"
              >
                <CheckCircle2 :size="12" /> Đủ điều kiện nhận việc
              </span>
              <span
                v-else
                class="whitespace-nowrap inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-danger-400/20 text-danger-200 border border-danger-300/30"
              >
                <XCircle :size="12" /> Dưới mức ký quỹ
              </span>
            </div>
            <div class="text-3xl sm:text-5xl font-bold font-num tracking-tight whitespace-nowrap">
              {{ formatCurrencyVND(wallet.balance) }}
            </div>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              type="button"
              class="h-11 px-5 rounded-xl bg-white text-brand-700 hover:bg-brand-50 text-sm font-semibold whitespace-nowrap transition-colors shadow-sm flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
              @click="showTopUpModal = true"
            >
              <ArrowDownLeft :size="16" />
              <span>Nạp tiền vào ví</span>
            </button>
            <button
              type="button"
              class="h-11 px-5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-sm font-semibold whitespace-nowrap transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
              :disabled="!!withdrawBlockedReason"
              :title="withdrawBlockedReason ?? 'Rút tiền về tài khoản ngân hàng'"
              @click="openWithdraw"
            >
              <ArrowUpRight :size="16" />
              <span>Rút tiền về ngân hàng</span>
            </button>
          </div>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 pt-5 border-t border-white/20 text-sm">
          <div class="flex sm:block items-baseline justify-between gap-3">
            <dt class="text-brand-100 whitespace-nowrap">Có thể rút</dt>
            <dd class="font-semibold font-num whitespace-nowrap sm:text-lg">{{ formatCurrencyVND(wallet.withdrawableBalance) }}</dd>
          </div>
          <div class="flex sm:block items-baseline justify-between gap-3">
            <dt class="text-brand-100 whitespace-nowrap">Ký quỹ tối thiểu</dt>
            <dd class="font-semibold font-num whitespace-nowrap sm:text-lg">{{ formatCurrencyVND(wallet.minimumBalance) }}</dd>
          </div>
          <div class="flex sm:block items-baseline justify-between gap-3">
            <dt class="text-brand-100 whitespace-nowrap">Đang chuyển về ngân hàng</dt>
            <dd class="font-semibold font-num whitespace-nowrap sm:text-lg">{{ formatCurrencyVND(inFlightWithdrawal) }}</dd>
          </div>
        </dl>

        <p
          v-if="withdrawBlockedReason && withdrawBlockedReason !== 'Đang tải ví'"
          class="-mt-2 text-sm text-brand-100 text-pretty"
        >
          {{ withdrawBlockedReason }}.
        </p>
      </section>

      <!-- Receiving bank account -->
      <section class="px-4 sm:px-5 py-3.5 rounded-2xl bg-white border border-ink-200/80 shadow-xs flex items-center gap-3">
        <Landmark :size="20" class="text-ink-500 shrink-0" />
        <div v-if="bankAccount" class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-ink-900 truncate">
            {{ bankAccount.bankName }} · <span class="font-num whitespace-nowrap">{{ maskedAccountNumber }}</span>
          </div>
          <div class="text-sm text-ink-500 truncate">{{ bankAccount.accountName }}</div>
        </div>
        <div v-else class="min-w-0 flex-1 text-sm font-semibold text-ink-900">
          Chưa có tài khoản nhận tiền
        </div>
        <FhButton variant="secondary" size="md" @click="openBankModal(false)">
          {{ bankAccount ? 'Đổi tài khoản' : 'Khai báo tài khoản' }}
        </FhButton>
      </section>

      <!-- History -->
      <section class="bg-white rounded-3xl border border-ink-200/80 shadow-xs overflow-hidden">
        <div role="tablist" class="flex items-center border-b border-ink-200 px-4 sm:px-6 pt-2 gap-6 overflow-x-auto">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'transactions'"
            class="h-11 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-t"
            :class="activeTab === 'transactions' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'transactions'"
          >
            <span>Biến động số dư</span>
            <span class="px-2 py-0.5 rounded-full text-xs font-num font-semibold bg-ink-100 text-ink-700">{{ txTotal }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'withdrawals'"
            class="h-11 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-t"
            :class="activeTab === 'withdrawals' ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-800'"
            @click="activeTab = 'withdrawals'"
          >
            <span>Lịch sử rút tiền</span>
            <span v-if="wallet.pendingWithdrawal > 0" class="w-2 h-2 rounded-full bg-warning-500" aria-label="Có lệnh đang chờ" />
          </button>
        </div>

        <!-- Balance changes -->
        <div v-if="activeTab === 'transactions'" class="p-4 sm:p-6 space-y-4">
          <div class="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1">
            <button
              v-for="f in txFilters"
              :key="f.id"
              type="button"
              class="h-10 px-3.5 rounded-full text-sm whitespace-nowrap shrink-0 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              :class="txFilterType === f.id
                ? 'bg-brand-50 text-brand-700 font-semibold border-brand-200'
                : 'bg-white text-ink-600 border-ink-200 hover:bg-ink-50'"
              :aria-pressed="txFilterType === f.id"
              @click="txFilterType = f.id"
            >
              {{ f.label }}
            </button>
          </div>

          <div v-if="txLoading" aria-busy="true">
            <FhSkeleton height="52px" :count="5" />
          </div>

          <div v-else-if="txError" class="py-8 flex flex-col items-center gap-3 text-center">
            <p class="text-sm text-ink-600">{{ txError }}</p>
            <FhButton variant="secondary" size="sm" @click="loadTransactions">Thử lại</FhButton>
          </div>

          <div v-else-if="transactions.length === 0" class="py-10 flex flex-col items-center gap-3 text-center">
            <span class="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center">
              <Wallet :size="22" class="text-ink-400" />
            </span>
            <p class="text-sm text-ink-500">Chưa có biến động số dư.</p>
          </div>

          <ul v-else class="divide-y divide-ink-100 -mx-2">
            <li v-for="tx in transactions" :key="tx.id">
              <component
                :is="txJobId(tx) ? 'button' : 'div'"
                :type="txJobId(tx) ? 'button' : undefined"
                class="w-full text-left px-2 py-3 flex items-center gap-3 rounded-xl"
                :class="txJobId(tx) ? 'cursor-pointer hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600' : ''"
                :title="txJobId(tx) ? 'Mở đơn sửa chữa liên quan' : undefined"
                @click="openTxJob(tx)"
              >
                <div class="min-w-0 flex-1 space-y-0.5">
                  <div class="flex items-baseline gap-3">
                    <span class="min-w-0 flex-1 text-sm font-semibold text-ink-900 truncate">
                      {{ formatWalletTxType(tx.type, tx).label }}
                    </span>
                    <span
                      class="shrink-0 text-sm sm:text-base font-semibold font-num whitespace-nowrap"
                      :class="formatWalletTxType(tx.type, tx).isCredit ? 'text-success-600' : 'text-danger-600'"
                    >
                      {{ formatWalletTxType(tx.type, tx).isCredit ? '+' : '-' }}{{ formatCurrencyVND(tx.amount) }}
                    </span>
                  </div>
                  <div class="flex items-baseline gap-3">
                    <span
                      class="min-w-0 flex-1 text-sm text-ink-500 truncate"
                      :title="withoutCodes(tx.description) || undefined"
                    >
                      <span class="whitespace-nowrap">{{ formatDateTimeVN(tx.createdAt) }}</span>
                      · {{ withoutCodes(tx.description) || 'Giao dịch ví FixHome' }}
                    </span>
                    <span class="shrink-0 text-xs text-ink-400 whitespace-nowrap">
                      Số dư sau <span class="font-num">{{ formatCurrencyVND(tx.balanceAfter) }}</span>
                    </span>
                  </div>
                </div>
                <ChevronRight v-if="txJobId(tx)" :size="16" class="text-ink-400 shrink-0" />
              </component>
            </li>
          </ul>

          <div
            v-if="!txLoading && !txError && txTotalPages > 1"
            class="flex items-center justify-between gap-3 pt-4 border-t border-ink-100"
          >
            <span class="text-sm text-ink-500 whitespace-nowrap">Trang {{ txPage }}/{{ txTotalPages }}</span>
            <div class="flex items-center gap-2">
              <FhButton variant="secondary" size="sm" :disabled="txPage <= 1" @click="txPage--; loadTransactions()">
                Trước
              </FhButton>
              <FhButton variant="secondary" size="sm" :disabled="txPage >= txTotalPages" @click="txPage++; loadTransactions()">
                Sau
              </FhButton>
            </div>
          </div>
        </div>

        <!-- Withdrawals -->
        <div v-else-if="activeTab === 'withdrawals'" class="p-4 sm:p-6">
          <div v-if="wdLoading" aria-busy="true">
            <FhSkeleton height="60px" :count="4" />
          </div>

          <div v-else-if="wdError" class="py-8 flex flex-col items-center gap-3 text-center">
            <p class="text-sm text-ink-600">{{ wdError }}</p>
            <FhButton variant="secondary" size="sm" @click="loadWithdrawals">Thử lại</FhButton>
          </div>

          <div v-else-if="withdrawals.length === 0" class="py-10 flex flex-col items-center gap-3 text-center">
            <span class="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center">
              <CreditCard :size="22" class="text-ink-400" />
            </span>
            <p class="text-sm text-ink-500">Chưa có lệnh rút tiền.</p>
          </div>

          <ul v-else class="divide-y divide-ink-100">
            <li v-for="w in withdrawals" :key="w.id" class="py-3 first:pt-0 last:pb-0 space-y-1">
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1 space-y-0.5">
                  <div class="text-sm sm:text-base font-semibold font-num text-ink-900 whitespace-nowrap">
                    {{ formatCurrencyVND(w.amount) }}
                  </div>
                  <div class="text-sm text-ink-500 truncate">
                    {{ w.bankName }} · <span class="font-num">{{ w.bankAccountNumber }}</span> · {{ w.bankAccountName }}
                  </div>
                </div>
                <div class="shrink-0 flex flex-col items-end gap-1">
                  <FhStatusPill :status="w.status" :label="formatWithdrawalStatus(w.status).label" />
                  <span class="text-xs text-ink-400 whitespace-nowrap">{{ formatDateTimeVN(w.requestedAt) }}</span>
                </div>
              </div>
              <p
                v-if="w.status === 'REJECTED' && w.rejectReason"
                class="text-sm text-danger-600 text-pretty"
              >
                Lý do: {{ withoutCodes(w.rejectReason) }}
              </p>
              <p v-else-if="w.status === 'FAILED'" class="text-sm text-danger-600 text-pretty">
                Không chuyển được<template v-if="w.failureReason">: {{ withoutCodes(w.failureReason) }}</template>.
                Tiền đã được hoàn lại vào ví.
              </p>
              <p v-else-if="w.status === 'SUCCESS' && w.payoutBankReference" class="text-sm text-ink-500">
                Mã giao dịch ngân hàng: <span class="font-num text-ink-700 break-all">{{ w.payoutBankReference }}</span>
              </p>
              <p v-else-if="w.status === 'SUCCESS' && w.processedAt" class="text-sm text-ink-500">
                Đã chuyển lúc <span class="whitespace-nowrap">{{ formatDateTimeVN(w.processedAt) }}</span>
              </p>
            </li>
          </ul>
        </div>
      </section>
    </template>

    <!-- Nạp tiền -->
    <div
      v-if="showTopUpModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
      @keydown.esc="!topUpSubmitting && (showTopUpModal = false)"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        class="bg-white rounded-3xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-5"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 id="topup-title" class="text-lg font-bold text-ink-900">Nạp tiền vào ví</h3>
          <button
            type="button"
            class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Đóng"
            @click="showTopUpModal = false"
          >
            <X :size="18" />
          </button>
        </div>

        <div v-if="topUpSuccessMsg" role="status" class="px-4 py-3 rounded-2xl bg-success-50 border border-success-200 text-success-800 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 :size="18" class="shrink-0" /> {{ topUpSuccessMsg }}
        </div>

        <div v-if="topUpError" role="alert" class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 text-sm font-medium flex items-start gap-2">
          <AlertCircle :size="16" class="shrink-0 mt-0.5" />
          <span>{{ topUpError }}</span>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-2" role="group" aria-label="Chọn nhanh số tiền">
            <button
              v-for="amt in topUpPresets"
              :key="amt"
              type="button"
              class="h-11 px-3 rounded-xl border text-sm font-semibold font-num whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              :class="topUpAmount === amt
                ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-600/20'
                : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300'"
              :aria-pressed="topUpAmount === amt"
              @click="topUpAmount = amt"
            >
              {{ formatCurrencyVND(amt) }}
            </button>
          </div>

          <div class="space-y-1.5">
            <label for="topup-amount" class="block text-sm font-medium text-ink-700">Số tiền khác</label>
            <div class="relative">
              <input
                id="topup-amount"
                v-model.number="topUpAmount"
                type="number"
                inputmode="numeric"
                min="10000"
                step="10000"
                placeholder="200000"
                class="w-full h-12 pl-4 pr-12 rounded-xl border border-ink-200 font-num font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">₫</span>
            </div>
            <p class="text-sm text-ink-500">Tối thiểu 10.000 ₫.</p>
          </div>

          <dl class="text-sm divide-y divide-ink-100 border-y border-ink-100">
            <div class="flex items-center justify-between gap-3 py-2.5">
              <dt class="text-ink-500">Số dư hiện tại</dt>
              <dd class="font-num font-semibold text-ink-900 whitespace-nowrap">{{ formatCurrencyVND(wallet?.balance) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 py-2.5">
              <dt class="text-ink-700 font-medium">Sau khi nạp</dt>
              <dd class="font-num font-semibold text-success-600 whitespace-nowrap">
                {{ formatCurrencyVND((wallet?.balance ?? 0) + (topUpAmount || 0)) }}
              </dd>
            </div>
          </dl>

          <p class="text-sm text-ink-500">Thanh toán qua VNPay: QR ngân hàng, thẻ ATM hoặc Mobile Banking.</p>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-1">
            <FhButton variant="secondary" size="md" @click="showTopUpModal = false">Huỷ</FhButton>
            <FhButton variant="primary" size="md" :loading="topUpSubmitting" @click="handleTopUp">
              Nạp tiền qua VNPay
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Rút tiền -->
    <div
      v-if="showWithdrawModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
      @keydown.esc="!withdrawSubmitting && (showWithdrawModal = false)"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
        class="bg-white rounded-3xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-5"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 id="withdraw-title" class="text-lg font-bold text-ink-900">Rút tiền về ngân hàng</h3>
          <button
            type="button"
            class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Đóng"
            @click="showWithdrawModal = false"
          >
            <X :size="18" />
          </button>
        </div>

        <div v-if="withdrawError" role="alert" class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 text-sm font-medium flex items-start gap-2">
          <AlertCircle :size="16" class="shrink-0 mt-0.5" />
          <span>{{ withdrawError }}</span>
        </div>

        <div class="space-y-4">
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-sm text-ink-500">Có thể rút</span>
            <span class="text-right">
              <span class="block font-num font-semibold text-ink-900 whitespace-nowrap">{{ formatCurrencyVND(wallet?.withdrawableBalance) }}</span>
              <span class="block text-xs text-ink-400 whitespace-nowrap">Đã trừ ký quỹ {{ formatCurrencyVND(wallet?.minimumBalance) }}</span>
            </span>
          </div>

          <div class="space-y-1.5">
            <label for="withdraw-amount" class="block text-sm font-medium text-ink-700">Số tiền rút</label>
            <div class="relative">
              <input
                id="withdraw-amount"
                v-model.number="withdrawAmount"
                type="number"
                inputmode="numeric"
                :min="minimumWithdrawal"
                :max="wallet?.withdrawableBalance ?? 0"
                step="10000"
                placeholder="100000"
                class="w-full h-12 pl-4 pr-12 rounded-xl border border-ink-200 font-num font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">₫</span>
            </div>
            <p class="text-sm text-ink-500">Tối thiểu {{ formatCurrencyVND(minimumWithdrawal) }}.</p>
          </div>

          <!-- Where the money goes: always the saved, KYC-checked account -->
          <div v-if="bankAccount" class="flex items-center gap-3 py-3 border-y border-ink-100">
            <div class="min-w-0 flex-1 text-sm">
              <div class="text-ink-500">Chuyển về tài khoản</div>
              <div class="font-semibold text-ink-900 truncate">
                {{ bankAccount.bankName }} · <span class="font-num">{{ bankAccount.accountNumber }}</span>
              </div>
              <div class="text-ink-500 truncate">{{ bankAccount.accountName }}</div>
            </div>
            <button
              type="button"
              class="shrink-0 h-10 px-3 rounded-xl text-sm font-semibold text-brand-600 hover:bg-brand-50 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              @click="showWithdrawModal = false; openBankModal(false)"
            >
              Đổi
            </button>
          </div>

          <p class="text-sm text-ink-500 text-pretty">
            Chuyển ngay, không cần chờ duyệt. Nếu không thành công, tiền được hoàn lại vào ví.
          </p>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-1">
            <FhButton variant="secondary" size="md" @click="showWithdrawModal = false">Huỷ</FhButton>
            <FhButton variant="primary" size="md" :loading="withdrawSubmitting" @click="handleWithdraw">
              Rút tiền ngay
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Tài khoản nhận tiền -->
    <div
      v-if="showBankModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
      @keydown.esc="!bankSaving && (showBankModal = false)"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-title"
        class="bg-white rounded-3xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-5"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 id="bank-title" class="text-lg font-bold text-ink-900">Tài khoản nhận tiền</h3>
          <button
            type="button"
            class="w-10 h-10 -mr-2 rounded-xl text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Đóng"
            @click="showBankModal = false"
          >
            <X :size="18" />
          </button>
        </div>

        <p
          v-if="bankNeededForWithdraw"
          class="px-4 py-3 rounded-2xl bg-warning-50 border border-warning-200 text-sm text-warning-800"
        >
          Bạn cần khai báo tài khoản nhận tiền trước khi rút.
        </p>

        <div v-if="bankError" role="alert" class="px-4 py-3 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 text-sm font-medium flex items-start gap-2">
          <AlertCircle :size="16" class="shrink-0 mt-0.5" /> <span>{{ bankError }}</span>
        </div>

        <div class="space-y-4">
          <div class="space-y-1.5">
            <label for="bank-bin" class="block text-sm font-medium text-ink-700">Ngân hàng</label>
            <select
              id="bank-bin"
              v-model="bankForm.bankBin"
              class="w-full h-11 px-3.5 rounded-xl border border-ink-200 bg-white text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="" disabled>{{ banks.length ? 'Chọn ngân hàng' : 'Đang tải danh sách ngân hàng…' }}</option>
              <option v-for="b in banks" :key="b.bin" :value="b.bin">{{ b.shortName }} — {{ b.name }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="bank-account-number" class="block text-sm font-medium text-ink-700">Số tài khoản</label>
            <input
              id="bank-account-number"
              v-model="bankForm.accountNumber"
              type="text"
              inputmode="numeric"
              maxlength="19"
              autocomplete="off"
              placeholder="VD: 1012345678"
              class="w-full h-11 px-3.5 rounded-xl border border-ink-200 font-num text-sm font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div class="space-y-1.5">
            <label for="bank-account-name" class="block text-sm font-medium text-ink-700">Tên chủ tài khoản</label>
            <input
              id="bank-account-name"
              v-model="bankForm.accountName"
              type="text"
              maxlength="128"
              autocomplete="off"
              placeholder="VD: NGUYEN VAN A"
              class="w-full h-11 px-3.5 rounded-xl border border-ink-200 text-sm font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <p class="text-sm text-ink-500">Phải trùng họ tên đã xác minh danh tính.</p>
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-1">
            <FhButton variant="secondary" size="md" @click="showBankModal = false">Huỷ</FhButton>
            <FhButton variant="primary" size="md" :loading="bankSaving" @click="handleSaveBank">
              Lưu tài khoản
            </FhButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
