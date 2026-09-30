<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
  ArrowRight,
  Landmark,
  Pencil,
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
      message: 'Giao dịch nạp tiền qua cổng VNPay thành công! Số dư ví của bạn đã được cập nhật.',
    };
    await loadWallet();
    await loadTransactions();
    router.replace({ query: {} });
  } else if (route.query.payment === 'failed') {
    returnBanner.value = {
      type: 'error',
      message: 'Giao dịch nạp tiền qua VNPay không thành công hoặc đã bị hủy. Vui lòng thử lại.',
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
    const res = await walletApi.topUp(topUpAmount.value);
    if (res.paymentUrl) {
      topUpSuccessMsg.value = 'Đang chuyển hướng tới cổng thanh toán VNPay...';
      setTimeout(() => {
        window.location.href = res.paymentUrl!;
      }, 500);
      return;
    }

    topUpSuccessMsg.value = res.message || 'Nạp tiền vào ví thành công';
    await loadWallet();
    await loadTransactions();
    setTimeout(() => {
      showTopUpModal.value = false;
      topUpSuccessMsg.value = null;
      topUpError.value = null;
    }, 1500);
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
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
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

    <!-- VNPay Return Alert Banner -->
    <div
      v-if="returnBanner"
      :class="[
        'p-4 sm:p-5 rounded-2xl border flex items-center justify-between gap-3 shadow-xs transition-all',
        returnBanner.type === 'success'
          ? 'bg-success-50 border-success-300 text-success-900'
          : 'bg-danger-50 border-danger-300 text-danger-900',
      ]"
    >
      <div class="flex items-center gap-3">
        <CheckCircle2 v-if="returnBanner.type === 'success'" :size="22" class="text-success-600 shrink-0" />
        <XCircle v-else :size="22" class="text-danger-600 shrink-0" />
        <span class="text-xs sm:text-sm font-semibold">{{ returnBanner.message }}</span>
      </div>
      <button
        type="button"
        class="text-xs font-bold text-ink-500 hover:text-ink-800 p-1.5 cursor-pointer"
        @click="returnBanner = null"
      >
        Đóng
      </button>
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
        class="p-4 sm:p-5 rounded-2xl bg-warning-50 border border-warning-300 text-warning-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs cursor-pointer hover:bg-warning-100/70 hover:border-warning-400 transition-all group"
        @click="showTopUpModal = true"
        title="Bấm để mở nạp tiền nhanh"
      >
        <div class="flex items-start gap-3">
          <AlertCircle :size="22" class="text-warning-600 shrink-0 mt-0.5" />
          <div class="text-xs sm:text-sm space-y-0.5">
            <div class="font-bold text-warning-900 group-hover:text-warning-900 transition-colors">
              Số dư ví dưới mức tối thiểu quy định ({{ formatCurrencyVND(wallet.minimumBalance) }})
            </div>
            <p class="text-warning-800">
              Tài khoản của bạn tạm dừng nhận các lời mời sửa chữa mới. Vui lòng nạp thêm tiền để kích hoạt lại điều kiện nhận việc.
            </p>
          </div>
        </div>
        <FhButton size="sm" class="shrink-0" @click.stop="showTopUpModal = true">
          <PlusCircle :size="15" class="mr-1.5" />
          Nạp tiền ngay
        </FhButton>
      </div>

      <!-- Negative Balance Critical Banner -->
      <div
        v-if="wallet.balance < 0"
        class="p-4 sm:p-5 rounded-2xl bg-danger-50 border border-danger-300 text-danger-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs cursor-pointer hover:bg-danger-100/70 hover:border-danger-400 transition-all group"
        @click="showTopUpModal = true"
        title="Bấm để mở thanh toán công nợ"
      >
        <div class="flex items-start gap-3">
          <AlertCircle :size="22" class="text-danger-600 shrink-0 mt-0.5" />
          <div class="text-xs sm:text-sm space-y-0.5">
            <div class="font-bold text-danger-900 group-hover:text-danger-900 transition-colors">
              Ví của bạn đang có số dư âm do khấu trừ phí đơn tiền mặt
            </div>
            <p class="text-danger-800">
              Số dư hiện tại là <span class="font-bold text-danger-900">{{ formatCurrencyVND(wallet.balance) }}</span>. Vui lòng nạp tiền để hoàn tất công nợ với nền tảng.
            </p>
          </div>
        </div>
        <FhButton size="sm" variant="danger" class="shrink-0" @click.stop="showTopUpModal = true">
          <PlusCircle :size="15" class="mr-1.5" />
          Thanh toán công nợ
        </FhButton>
      </div>

      <!-- Hero Wallet Balance Card -->
      <div class="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-700 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2.5">
            <span class="text-xs font-bold text-brand-200 bg-white/10 px-2.5 py-0.5 rounded-full">
              Ví FixHome Kỹ thuật viên
            </span>
            <span
              v-if="wallet.eligibleForJobs"
              class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-success-400/20 text-success-200 border border-success-300/30"
            >
              <CheckCircle2 :size="12" /> Đủ điều kiện nhận việc
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-danger-400/20 text-danger-200 border border-danger-300/30"
            >
              <XCircle :size="12" /> Dưới mức ký quỹ
            </span>
          </div>

          <div class="text-xs text-brand-100 font-medium">Tổng số dư thực tế</div>
          <div class="text-3xl sm:text-5xl font-bold font-num tracking-tight">
            {{ formatCurrencyVND(wallet.balance) }}
          </div>

          <div class="text-xs text-brand-100/90 flex flex-wrap items-center gap-3 pt-1">
            <span>Ký quỹ tối thiểu: <strong class="text-white">{{ formatCurrencyVND(wallet.minimumBalance) }}</strong></span>
            <span>•</span>
            <span>Khả dụng để rút: <strong class="text-white">{{ formatCurrencyVND(wallet.withdrawableBalance) }}</strong></span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
          <button
            type="button"
            class="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white text-brand-700 hover:bg-brand-50 active:scale-95 text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2"
            @click="showTopUpModal = true"
          >
            <ArrowDownLeft :size="16" />
            <span>Nạp tiền vào ví</span>
          </button>

          <button
            type="button"
            class="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white active:scale-95 text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!!withdrawBlockedReason"
            :title="withdrawBlockedReason ?? 'Rút tiền về tài khoản ngân hàng'"
            @click="openWithdraw"
          >
            <ArrowUpRight :size="16" />
            <span>Rút tiền về ngân hàng</span>
          </button>
        </div>
      </div>

      <!-- Stat Cards Breakdown -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Card 1: Withdrawable Balance -->
        <div
          class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1.5 cursor-pointer hover:border-brand-400 hover:shadow-sm transition-all group"
          @click="openWithdraw"
          :title="withdrawBlockedReason ?? 'Bấm để yêu cầu rút tiền'"
        >
          <div class="flex items-center justify-between text-xs font-bold text-ink-500">
            <span>Số dư có thể rút</span>
            <CreditCard :size="16" class="text-brand-600" />
          </div>
          <div class="text-2xl font-bold font-num text-ink-900 group-hover:text-brand-700 transition-colors">
            {{ formatCurrencyVND(wallet.withdrawableBalance) }}
          </div>
          <p class="text-[11px] text-ink-500">
            Đã trừ ký quỹ tối thiểu và các lệnh rút đang xử lý
          </p>
        </div>

        <!-- Card 2: Minimum Required -->
        <div
          class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1.5 cursor-pointer hover:border-warning-400 hover:shadow-sm transition-all group"
          @click="showTopUpModal = true"
          title="Bấm để nạp thêm tiền vào ví"
        >
          <div class="flex items-center justify-between text-xs font-bold text-ink-500">
            <span>Mức ký quỹ duy trì</span>
            <Info :size="16" class="text-warning-500" />
          </div>
          <div class="text-2xl font-bold font-num text-ink-900 group-hover:text-warning-700 transition-colors">
            {{ formatCurrencyVND(wallet.minimumBalance) }}
          </div>
          <p class="text-[11px] text-ink-500">
            Duy trì để đảm bảo quyền nhận lời mời việc mới
          </p>
        </div>

        <!-- Card 3: Pending Withdrawal -->
        <div
          class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1.5 cursor-pointer hover:border-brand-400 hover:shadow-sm transition-all group"
          @click="activeTab = 'withdrawals'"
          title="Bấm để xem danh sách lệnh rút tiền"
        >
          <div class="flex items-center justify-between text-xs font-bold text-ink-500">
            <span>Đang chuyển về ngân hàng</span>
            <Clock :size="16" class="text-brand-600" />
          </div>
          <div class="text-2xl font-bold font-num text-ink-900 group-hover:text-brand-700 transition-colors">
            {{ formatCurrencyVND(wallet.pendingWithdrawal + (wallet.processingWithdrawal ?? 0)) }}
          </div>
          <p class="text-[11px] text-ink-500">
            {{
              (wallet.processingWithdrawal ?? 0) > 0
                ? 'Ngân hàng đang xử lý lệnh chuyển, bạn sẽ nhận thông báo khi tiền về'
                : 'Rút tiền được chuyển ngay, không cần chờ duyệt'
            }}
          </p>
        </div>
      </div>

      <!-- Receiving bank account -->
      <div class="p-5 rounded-2xl bg-white border border-ink-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <Landmark :size="20" />
          </div>
          <div v-if="bankAccount" class="min-w-0">
            <div class="text-xs font-bold text-ink-500">Tài khoản nhận tiền rút</div>
            <div class="text-sm font-bold text-ink-900 truncate">
              {{ bankAccount.bankName }} · <span class="font-num">{{ maskedAccountNumber }}</span>
            </div>
            <div class="text-[11px] text-ink-500 truncate">{{ bankAccount.accountName }}</div>
          </div>
          <div v-else class="min-w-0">
            <div class="text-sm font-bold text-ink-900">Chưa khai báo tài khoản nhận tiền</div>
            <p class="text-[11px] text-ink-500">
              Khai một lần, tên chủ tài khoản phải trùng tên đã xác minh danh tính
            </p>
          </div>
        </div>
        <FhButton
          :variant="bankAccount ? 'secondary' : 'primary'"
          size="md"
          @click="openBankModal(false)"
        >
          <Pencil v-if="bankAccount" :size="14" />
          <span>{{ bankAccount ? 'Đổi tài khoản' : 'Khai báo tài khoản' }}</span>
        </FhButton>
      </div>

      <!-- Main Navigation Tabs -->
      <div class="bg-white rounded-3xl border border-ink-200/80 shadow-xs overflow-hidden">
        <!-- Tab Headers -->
        <div class="flex items-center border-b border-ink-200 px-6 pt-4 gap-6">
          <button
            type="button"
            class="pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2"
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
            class="pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2"
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
              class="w-2 h-2 rounded-full bg-warning-500"
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
                  { id: 'WITHDRAW_REFUND', label: 'Hoàn tiền rút' },
                  { id: 'ADJUSTMENT', label: 'Điều chỉnh' },
                ]"
                :key="f.id"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs transition-all"
                :class="[
                  txFilterType === f.id
                    ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
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
              class="py-3.5 flex items-center justify-between gap-4 px-2 rounded-xl transition-all"
              :class="[
                tx.referenceType === 'SERVICE_ORDER' && tx.referenceId
                  ? 'cursor-pointer hover:bg-brand-50/50 hover:shadow-2xs group'
                  : 'hover:bg-ink-50/50'
              ]"
              @click="tx.referenceType === 'SERVICE_ORDER' && tx.referenceId ? router.push(`/tech/jobs/${tx.referenceId}`) : null"
              :title="tx.referenceType === 'SERVICE_ORDER' && tx.referenceId ? 'Bấm để mở chi tiết đơn hàng liên quan' : undefined"
            >
              <div class="flex items-center gap-3 min-w-0">
                <!-- Icon badge -->
                <div
                  class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                  :class="[
                    formatWalletTxType(tx.type).isCredit
                      ? 'bg-success-50 text-success-600'
                      : 'bg-danger-50 text-danger-600'
                  ]"
                >
                  <ArrowDownLeft v-if="formatWalletTxType(tx.type).isCredit" :size="18" />
                  <ArrowUpRight v-else :size="18" />
                </div>

                <!-- Info -->
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs sm:text-sm font-bold text-ink-900 truncate group-hover:text-brand-700 transition-colors">
                      {{ formatWalletTxType(tx.type).label }}
                    </span>
                    <span
                      v-if="tx.referenceType === 'SERVICE_ORDER' && tx.referenceId"
                      class="text-[11px] font-bold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 group-hover:bg-brand-600 group-hover:text-white transition-colors flex items-center gap-1"
                    >
                      <span>Đơn hàng</span>
                      <ArrowRight :size="10" />
                    </span>
                  </div>
                  <p class="text-xs text-ink-500 truncate">
                    {{ withoutCodes(tx.description) || 'Giao dịch ví FixHome' }}
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
                  class="text-sm sm:text-base font-bold font-num"
                  :class="[
                    formatWalletTxType(tx.type).isCredit ? 'text-success-600' : 'text-danger-600'
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
              <thead class="bg-ink-50 text-ink-600 font-bold text-[10px] border-b border-ink-100">
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
                  <td class="py-3.5 px-3 font-bold font-num text-ink-900 whitespace-nowrap">
                    {{ formatCurrencyVND(w.amount) }}
                  </td>
                  <td class="py-3.5 px-3">
                    <div class="font-bold text-ink-900">{{ w.bankName }}</div>
                    <div class="text-[11px] text-ink-500 font-num">{{ w.bankAccountNumber }} — {{ w.bankAccountName }}</div>
                  </td>
                  <td class="py-3.5 px-3 whitespace-nowrap">
                    <FhStatusPill :status="w.status" :label="formatWithdrawalStatus(w.status).label" />
                  </td>
                  <td class="py-3.5 px-3 text-ink-500 max-w-xs">
                    <span v-if="w.status === 'REJECTED' && w.rejectReason" class="text-danger-600 font-medium">
                      Lý do: {{ withoutCodes(w.rejectReason) }}
                    </span>
                    <span v-else-if="w.status === 'FAILED'" class="text-danger-600 font-medium">
                      Không chuyển được<template v-if="w.failureReason">: {{ withoutCodes(w.failureReason) }}</template>.
                      Tiền đã được hoàn lại vào ví.
                    </span>
                    <span v-else-if="w.status === 'SUCCESS'">
                      <template v-if="w.payoutBankReference">
                        Mã giao dịch ngân hàng: <strong class="font-num text-ink-700">{{ w.payoutBankReference }}</strong>
                      </template>
                      <template v-else-if="w.processedAt">
                        Đã chuyển lúc {{ formatDateTimeVN(w.processedAt) }}
                      </template>
                    </span>
                    <span v-else-if="w.status === 'PROCESSING'">
                      Ngân hàng đang xử lý lệnh chuyển
                    </span>
                    <span v-else-if="w.status === 'PENDING'">
                      Đang chờ xử lý
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
          <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
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

        <div v-if="topUpSuccessMsg" class="p-4 rounded-2xl bg-success-50 border border-success-200 text-success-800 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 :size="18" /> {{ topUpSuccessMsg }}
        </div>

        <div v-if="topUpError" class="p-3.5 rounded-2xl bg-danger-50 border border-danger-200 text-danger-700 text-xs font-semibold flex items-start gap-2">
          <AlertCircle :size="16" class="shrink-0 mt-0.5" />
          <span>{{ topUpError }}</span>
        </div>

        <div v-else class="space-y-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Chọn nhanh mức nạp:</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="amt in topUpPresets"
                :key="amt"
                type="button"
                class="py-2.5 px-3 rounded-xl border text-xs font-bold font-num transition-all"
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
                class="w-full px-4 py-3 rounded-xl border border-ink-200 font-num font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
              />
              <span class="absolute right-4 top-3.5 text-xs font-bold text-ink-400">VNĐ</span>
            </div>
            <p class="text-[11px] text-ink-500">Mức nạp tối thiểu là 10.000 ₫</p>
          </div>

          <div class="p-3.5 rounded-xl bg-ink-50 text-xs space-y-1 border border-ink-100">
            <div class="flex items-center justify-between text-ink-600">
              <span>Số dư hiện tại:</span>
              <span class="font-bold font-num">{{ formatCurrencyVND(wallet?.balance) }}</span>
            </div>
            <div class="flex items-center justify-between text-ink-900 font-bold">
              <span>Số dư dự kiến sau nạp:</span>
              <span class="font-bold font-num text-success-600">
                {{ formatCurrencyVND((wallet?.balance ?? 0) + (topUpAmount || 0)) }}
              </span>
            </div>
          </div>

          <div class="p-3 rounded-xl bg-brand-50 border border-brand-100 flex items-start gap-2.5 text-brand-900 text-xs">
            <Info :size="16" class="text-brand-600 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold">Cổng thanh toán điện tử VNPay:</span>
              <p class="text-brand-700 text-[11px] mt-0.5">
                Hỗ trợ ứng dụng ngân hàng quét mã VNPAY-QR, thẻ ATM nội địa & Mobile Banking. Giao dịch bảo mật và số dư ví được ghi nhận tức thì.
              </p>
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
              Nạp tiền qua VNPay
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
          <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
            <ArrowUpRight class="text-brand-600" :size="20" />
            <span>Rút tiền về ngân hàng</span>
          </h3>
          <button
            type="button"
            class="text-ink-400 hover:text-ink-700 text-lg font-bold"
            @click="showWithdrawModal = false"
          >
            ✕
          </button>
        </div>

        <div v-if="withdrawError" class="p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle :size="16" /> {{ withdrawError }}
        </div>

        <div class="space-y-4">
          <div class="p-3.5 rounded-xl bg-brand-50 text-xs space-y-1 border border-brand-100">
            <div class="flex items-center justify-between text-brand-900 font-bold">
              <span>Khả dụng để rút:</span>
              <span class="font-bold font-num text-brand-700 text-sm">
                {{ formatCurrencyVND(wallet?.withdrawableBalance) }}
              </span>
            </div>
            <p class="text-[11px] text-brand-700">
              Đã giữ lại mức ký quỹ duy trì tối thiểu {{ formatCurrencyVND(wallet?.minimumBalance) }}
            </p>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Số tiền muốn rút (₫):</label>
            <div class="relative">
              <input
                v-model.number="withdrawAmount"
                type="number"
                :min="minimumWithdrawal"
                :max="wallet?.withdrawableBalance ?? 0"
                step="10000"
                placeholder="100000"
                class="w-full px-4 py-3 rounded-xl border border-ink-200 font-num font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-lg"
              />
              <span class="absolute right-4 top-3.5 text-xs font-bold text-ink-400">VNĐ</span>
            </div>
            <p class="text-[11px] text-ink-500">Rút tối thiểu {{ formatCurrencyVND(minimumWithdrawal) }}</p>
          </div>

          <!-- Where the money goes: always the saved, KYC-checked account -->
          <div v-if="bankAccount" class="p-3.5 rounded-xl border border-ink-200 text-xs space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-bold text-ink-700">Chuyển về tài khoản</span>
              <button
                type="button"
                class="text-brand-600 hover:text-brand-700 font-bold"
                @click="showWithdrawModal = false; openBankModal(false)"
              >
                Đổi
              </button>
            </div>
            <div class="font-bold text-ink-900">
              {{ bankAccount.bankName }} · <span class="font-num">{{ bankAccount.accountNumber }}</span>
            </div>
            <div class="text-ink-500">{{ bankAccount.accountName }}</div>
          </div>

          <p class="text-[11px] text-ink-500 flex items-start gap-1.5">
            <Info :size="13" class="shrink-0 mt-0.5 text-brand-600" />
            <span>Tiền được chuyển ngay về tài khoản trên qua payOS, không cần chờ duyệt. Nếu chuyển không thành công, tiền được hoàn lại vào ví.</span>
          </p>

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
              Rút tiền ngay
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 3: TÀI KHOẢN NHẬN TIỀN -->
    <div
      v-if="showBankModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
            <Landmark class="text-brand-600" :size="20" />
            <span>Tài khoản nhận tiền rút</span>
          </h3>
          <button
            type="button"
            class="text-ink-400 hover:text-ink-700 text-lg font-bold"
            aria-label="Đóng"
            @click="showBankModal = false"
          >
            ✕
          </button>
        </div>

        <p
          v-if="bankNeededForWithdraw"
          class="p-3 rounded-xl bg-brand-50 border border-brand-100 text-xs text-brand-900"
        >
          Bạn cần khai báo tài khoản nhận tiền trước khi rút. Khai một lần, lần sau hệ thống điền sẵn.
        </p>

        <div v-if="bankError" class="p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-800 text-xs font-bold flex items-start gap-2">
          <AlertCircle :size="16" class="shrink-0 mt-0.5" /> <span>{{ bankError }}</span>
        </div>

        <div class="space-y-4">
          <div class="space-y-1.5">
            <label for="bank-bin" class="block text-xs font-bold text-ink-700">Ngân hàng</label>
            <select
              id="bank-bin"
              v-model="bankForm.bankBin"
              class="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="" disabled>{{ banks.length ? 'Chọn ngân hàng' : 'Đang tải danh sách ngân hàng...' }}</option>
              <option v-for="b in banks" :key="b.bin" :value="b.bin">{{ b.shortName }} — {{ b.name }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="bank-account-number" class="block text-xs font-bold text-ink-700">Số tài khoản</label>
            <input
              id="bank-account-number"
              v-model="bankForm.accountNumber"
              type="text"
              inputmode="numeric"
              maxlength="19"
              autocomplete="off"
              placeholder="VD: 1012345678"
              class="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 font-num text-xs font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div class="space-y-1.5">
            <label for="bank-account-name" class="block text-xs font-bold text-ink-700">Tên chủ tài khoản</label>
            <input
              id="bank-account-name"
              v-model="bankForm.accountName"
              type="text"
              maxlength="128"
              autocomplete="off"
              placeholder="VD: NGUYEN VAN A"
              class="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 text-xs font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <p class="text-[11px] text-ink-500">
              Phải trùng họ tên đã xác minh danh tính. Gõ có dấu hay không dấu đều được.
            </p>
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <FhButton variant="secondary" size="md" @click="showBankModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton
              variant="primary"
              size="md"
              :loading="bankSaving"
              @click="handleSaveBank"
            >
              Lưu tài khoản
            </FhButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
