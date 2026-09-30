<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import {
  Wallet,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sliders,
  AlertCircle,
  FileText,
  ShieldAlert,
  Landmark,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import {
  walletApi,
  type WalletListItem,
  type WithdrawalRequest,
  type WalletTransaction,
  type WalletConfig,
  type PayoutOverview,
} from '../../api/wallet.api';
import {
  FhButton,
  FhStatusPill,
  FhTable,
  FhSkeleton,
  type TableColumn,
} from '../../components';
import {
  formatCurrencyVND,
  formatDateTimeVN,
  formatWalletTxType,
  formatWithdrawalStatus,
} from '../../utils/formatters';
import { extractApiErrorMessage } from '../../utils/input-validation';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.userRole === 'ADMIN');

const activeTab = ref<'wallets' | 'withdrawals' | 'config'>('wallets');

// Tab 1: Wallets State
const wallets = ref<WalletListItem[]>([]);
const walletsLoading = ref(false);
const walletSearch = ref('');
const walletEligibilityFilter = ref<'ALL' | 'ELIGIBLE' | 'INELIGIBLE'>('ALL');
const walletsPage = ref(1);
const walletsTotalPages = ref(1);
const walletsTotal = ref(0);

const walletsColumns: TableColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'balance', label: 'Số dư thực tế', width: '150px' },
  { key: 'eligibleForJobs', label: 'Điều kiện nhận việc', width: '180px' },
  { key: 'updatedAt', label: 'Cập nhật lần cuối', width: '160px' },
  { key: 'actions', label: 'Thao tác', width: '200px' },
];

const isSkeleton = (row: unknown): boolean => !!(row as Record<string, unknown>)._isSkeleton;

const filteredWallets = computed<(WalletListItem & { _isSkeleton?: boolean })[]>(() => {
  if (walletsLoading.value) {
    return Array.from({ length: 15 }).map((_, i) => ({
      id: `skeleton-w-${i}`,
      _isSkeleton: true,
      technicianId: '',
      technician: { fullName: '', phoneNumber: '', email: '' },
      balance: 0,
      eligibleForJobs: false,
      createdAt: '',
      updatedAt: '',
    } as unknown as WalletListItem & { _isSkeleton: boolean }));
  }
  return wallets.value;
});

// Tab 2: Withdrawals State
const withdrawals = ref<WithdrawalRequest[]>([]);
const wdLoading = ref(false);
const wdStatusFilter = ref<string>('ALL');
const wdPage = ref(1);
const wdTotalPages = ref(1);
const wdTotal = ref(0);

const wdColumns: TableColumn[] = [
  { key: 'requestedAt', label: 'Thời gian', width: '150px' },
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'amount', label: 'Số tiền rút', width: '150px' },
  { key: 'bankInfo', label: 'Tài khoản thụ hưởng' },
  { key: 'status', label: 'Trạng thái', width: '150px' },
  { key: 'actions', label: 'Hành động', width: '220px' },
];

const filteredWithdrawals = computed<(WithdrawalRequest & { _isSkeleton?: boolean })[]>(() => {
  if (wdLoading.value) {
    return Array.from({ length: 15 }).map((_, i) => ({
      id: `skeleton-wd-${i}`,
      _isSkeleton: true,
      technicianId: '',
      technician: null,
      amount: 0,
      bankName: '',
      bankAccountNumber: '',
      bankAccountName: '',
      status: 'PENDING',
      rejectReason: null,
      requestedAt: '',
      processedAt: null,
      processedByUserId: null,
    } as unknown as WithdrawalRequest & { _isSkeleton: boolean }));
  }
  return withdrawals.value;
});

// Tab 3: Config State (Admin)
const config = ref<WalletConfig | null>(null);
const configLoading = ref(false);
const configSaving = ref(false);
const editMinBalance = ref<number>(200000);
const editFeeRateBps = ref<number>(1500);
const configSuccessMsg = ref<string | null>(null);

// Withdrawals are paid out the moment the technician asks (PO decision
// 30/09/2026). Managers track the money leaving; there is nothing to approve.
// What has left, what is moving, and what the payout source holds:
const payoutOverview = ref<PayoutOverview | null>(null);
/** Id of the withdrawal whose payout is being re-checked with payOS. */
const reconcilingId = ref<string | null>(null);

// Admin Adjust Modal
const showAdjustModal = ref(false);
const selectedWalletForAdjust = ref<WalletListItem | null>(null);
const adjustType = ref<'CREDIT' | 'DEBIT'>('CREDIT');
const adjustAmount = ref<number>(100000);
const adjustReason = ref('');
const adjustSubmitting = ref(false);
const adjustError = ref<string | null>(null);

// View Tech Transactions Drawer / Modal
const showTxModal = ref(false);
const selectedTech = ref<{ id: string; name: string; balance: number } | null>(null);
const techTransactions = ref<WalletTransaction[]>([]);
const techTxLoading = ref(false);

const loadWallets = async () => {
  walletsLoading.value = true;
  try {
    const res = await walletApi.listWallets({
      page: walletsPage.value,
      limit: 15,
      search: walletSearch.value.trim() || undefined,
      status: walletEligibilityFilter.value === 'ALL' ? undefined : walletEligibilityFilter.value,
    });
    wallets.value = res.data;
    walletsTotal.value = res.meta.total;
    walletsTotalPages.value = res.meta.totalPages || 1;
  } catch (err) {
    console.error('Failed to load wallets:', err);
  } finally {
    walletsLoading.value = false;
  }
};

const loadWithdrawals = async () => {
  wdLoading.value = true;
  try {
    const res = await walletApi.listWithdrawals({
      page: wdPage.value,
      limit: 15,
      status: wdStatusFilter.value === 'ALL' ? undefined : wdStatusFilter.value,
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

const loadPayoutOverview = async () => {
  try {
    payoutOverview.value = await walletApi.getPayoutOverview();
  } catch (err) {
    console.error('Failed to load payout overview:', err);
  }
};

const loadConfig = async () => {
  if (!isAdmin.value) return;
  configLoading.value = true;
  try {
    config.value = await walletApi.getWalletConfig();
    editMinBalance.value = config.value.minimumWalletBalance;
    editFeeRateBps.value = config.value.platformFeeRateBps;
  } catch (err) {
    console.error('Failed to load wallet config:', err);
  } finally {
    configLoading.value = false;
  }
};

const saveConfig = async () => {
  if (editMinBalance.value < 0 || editFeeRateBps.value < 0 || editFeeRateBps.value > 5000) {
    alert('Mức ký quỹ không được âm; Tỷ lệ phí nền tảng từ 0% đến 50% (0 - 5000 bps)');
    return;
  }
  configSaving.value = true;
  configSuccessMsg.value = null;
  try {
    config.value = await walletApi.updateWalletConfig({
      minimumWalletBalance: editMinBalance.value,
      platformFeeRateBps: editFeeRateBps.value,
    });
    configSuccessMsg.value = 'Cập nhật cấu hình ví thành công';
    setTimeout(() => {
      configSuccessMsg.value = null;
    }, 2500);
  } catch (err: unknown) {
    alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Cập nhật cấu hình thất bại');
  } finally {
    configSaving.value = false;
  }
};

/** Say exactly where the payout ended up; each outcome needs a different reaction. */
const announcePayout = (result: WithdrawalRequest & { message: string }) => {
  if (result.status === 'SUCCESS') {
    toast.success(result.message, {
      description: result.payoutBankReference
        ? `Mã giao dịch ngân hàng: ${result.payoutBankReference}`
        : undefined,
    });
  } else if (result.status === 'FAILED') {
    toast.error(result.message, { description: result.failureReason ?? undefined });
  } else {
    toast.info(result.message);
  }
};

const handleReconcile = async (wd: WithdrawalRequest) => {
  reconcilingId.value = wd.id;
  try {
    const result = await walletApi.reconcileWithdrawal(wd.id);
    announcePayout(result);
    await Promise.all([loadWithdrawals(), loadPayoutOverview()]);
  } catch (err: unknown) {
    toast.error(extractApiErrorMessage(err, 'Không kiểm tra được với payOS'));
  } finally {
    reconcilingId.value = null;
  }
};

const openAdjustModal = (item: WalletListItem) => {
  selectedWalletForAdjust.value = item;
  adjustType.value = 'CREDIT';
  adjustAmount.value = 100000;
  adjustReason.value = '';
  adjustError.value = null;
  showAdjustModal.value = true;
};

const handleAdjust = async () => {
  if (!selectedWalletForAdjust.value) return;
  if (!adjustAmount.value || adjustAmount.value <= 0) {
    adjustError.value = 'Số tiền điều chỉnh phải lớn hơn 0';
    return;
  }
  if (!adjustReason.value.trim() || adjustReason.value.trim().length < 10) {
    adjustError.value = 'Lý do điều chỉnh kiểm toán bắt buộc (tối thiểu 10 ký tự)';
    return;
  }

  adjustSubmitting.value = true;
  adjustError.value = null;
  try {
    await walletApi.adminAdjustBalance(selectedWalletForAdjust.value.technicianId, {
      type: adjustType.value,
      amount: adjustAmount.value,
      reason: adjustReason.value.trim(),
    });
    showAdjustModal.value = false;
    await loadWallets();
  } catch (err: unknown) {
    adjustError.value = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Điều chỉnh số dư thất bại';
  } finally {
    adjustSubmitting.value = false;
  }
};

const viewTransactions = async (item: WalletListItem) => {
  selectedTech.value = {
    id: item.technicianId,
    name: item.technician.fullName,
    balance: item.balance,
  };
  showTxModal.value = true;
  techTxLoading.value = true;
  try {
    const res = await walletApi.getWalletTransactions(item.technicianId, { limit: 50 });
    techTransactions.value = res.data;
  } catch (err) {
    console.error('Failed to load tech transactions:', err);
  } finally {
    techTxLoading.value = false;
  }
};

watch(walletEligibilityFilter, () => {
  walletsPage.value = 1;
  loadWallets();
});

watch(wdStatusFilter, () => {
  wdPage.value = 1;
  loadWithdrawals();
});

watch(activeTab, (tab) => {
  if (tab === 'wallets') loadWallets();
  if (tab === 'withdrawals') {
    loadWithdrawals();
    loadPayoutOverview();
  }
  if (tab === 'config') loadConfig();
});

onMounted(() => {
  loadWallets();
  loadWithdrawals();
  loadPayoutOverview();
  if (isAdmin.value) {
    loadConfig();
  }
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
          <Wallet class="text-brand-600" :size="24" />
          <span>Quản lý Ví & Rút tiền Kỹ thuật viên</span>
        </h1>
        <p class="text-xs sm:text-sm text-ink-500 mt-1">
          Giám sát số dư ký quỹ thợ, theo dõi tiền rút tự động qua payOS và điều chỉnh số dư kiểm toán
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FhButton
          variant="secondary"
          size="sm"
          @click="activeTab === 'wallets' ? loadWallets() : activeTab === 'withdrawals' ? loadWithdrawals() : loadConfig()"
        >
          <RefreshCw :size="14" class="mr-1.5" />
          Làm mới
        </FhButton>
      </div>
    </div>

    <!-- Tab Headers -->
    <div class="flex items-center border-b border-ink-200 gap-6 text-sm font-extrabold">
      <button
        type="button"
        class="pb-3 border-b-2 transition-all flex items-center gap-2"
        :class="[
          activeTab === 'wallets'
            ? 'border-brand-600 text-brand-600'
            : 'border-transparent text-ink-500 hover:text-ink-800'
        ]"
        @click="activeTab = 'wallets'"
      >
        <span>Danh sách ví KTV</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-num font-bold bg-ink-100 text-ink-700">
          {{ walletsTotal }}
        </span>
      </button>

      <button
        type="button"
        class="pb-3 border-b-2 transition-all flex items-center gap-2"
        :class="[
          activeTab === 'withdrawals'
            ? 'border-brand-600 text-brand-600'
            : 'border-transparent text-ink-500 hover:text-ink-800'
        ]"
        @click="activeTab = 'withdrawals'"
      >
        <span>Yêu cầu rút tiền</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-num font-bold bg-ink-100 text-ink-700">
          {{ wdTotal }}
        </span>
      </button>

      <button
        v-if="isAdmin"
        type="button"
        class="pb-3 border-b-2 transition-all flex items-center gap-2"
        :class="[
          activeTab === 'config'
            ? 'border-brand-600 text-brand-600'
            : 'border-transparent text-ink-500 hover:text-ink-800'
        ]"
        @click="activeTab = 'config'"
      >
        <Sliders :size="15" />
        <span>Cấu hình ví & Tỷ lệ phí</span>
      </button>
    </div>

    <!-- TAB 1: DANH SÁCH VÍ KỸ THUẬT VIÊN -->
    <div v-if="activeTab === 'wallets'" class="space-y-4">
      <FhTable
        :columns="walletsColumns"
        :rows="filteredWallets"
        :loading="walletsLoading"
        :empty-text="'Không tìm thấy ví kỹ thuật viên nào phù hợp'"
        searchable
        v-model:searchQuery="walletSearch"
        search-placeholder="Tìm theo tên thợ, SĐT, email..."
        @update:searchQuery="walletsPage = 1; loadWallets()"
      >
        <template #toolbar>

          <div class="flex items-center gap-2 text-xs font-bold ml-auto">
            <span class="text-ink-500">Trạng thái:</span>
            <select
              v-model="walletEligibilityFilter"
              class="h-9 px-3 rounded-sm border border-ink-200 text-xs text-ink-700 focus:outline-none focus:border-brand-600"
            >
              <option value="ALL">Tất cả điều kiện</option>
              <option value="ELIGIBLE">Đủ điều kiện nhận việc</option>
              <option value="INELIGIBLE">Dưới mức tối thiểu</option>
            </select>
          </div>
        </template>

        <template #cell-technician="{ row }">
          <div v-if="isSkeleton(row)" class="flex items-center gap-3">
            <FhSkeleton width="36px" height="36px" class="rounded-full shrink-0" />
            <div>
              <FhSkeleton width="120px" height="16px" class="mb-1" />
              <FhSkeleton width="160px" height="12px" />
            </div>
          </div>
          <div v-else class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-extrabold text-sm shrink-0">
              {{ row.technician.fullName?.charAt(0)?.toUpperCase() || 'T' }}
            </div>
            <div>
              <div class="font-extrabold text-ink-900 text-xs">
                {{ row.technician.fullName }}
              </div>
              <div class="text-[11px] text-ink-500 font-num">
                {{ row.technician.phoneNumber }} • {{ row.technician.email }}
              </div>
            </div>
          </div>
        </template>

        <template #cell-balance="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="16px" />
          <div
            v-else
            class="text-sm font-extrabold font-num"
            :class="[row.balance < 0 ? 'text-rose-600' : 'text-ink-900']"
          >
            {{ formatCurrencyVND(row.balance) }}
          </div>
        </template>

        <template #cell-eligibleForJobs="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="24px" class="rounded-full" />
          <template v-else>
            <span
              v-if="row.eligibleForJobs"
              class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              <CheckCircle2 :size="12" /> Đủ điều kiện
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200"
            >
              <XCircle :size="12" /> Dưới mức ký quỹ
            </span>
          </template>
        </template>

        <template #cell-updatedAt="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="16px" />
          <span v-else class="text-ink-500 whitespace-nowrap">{{ formatDateTimeVN(row.updatedAt) }}</span>
        </template>

        <template #cell-actions="{ row }">
          <div v-if="isSkeleton(row)" class="flex justify-end gap-2">
            <FhSkeleton width="80px" height="28px" class="rounded-[var(--radius-sm)]" />
            <FhSkeleton width="80px" height="28px" class="rounded-[var(--radius-sm)]" v-if="isAdmin" />
          </div>
          <div v-else class="flex justify-end gap-2">
            <FhButton variant="secondary" size="sm" @click="viewTransactions(row)">
              <FileText :size="13" class="mr-1" />
              Lịch sử
            </FhButton>
            <FhButton
              v-if="isAdmin"
              variant="primary"
              size="sm"
              @click="openAdjustModal(row)"
            >
              Điều chỉnh
            </FhButton>
          </div>
        </template>
      </FhTable>

      <!-- Pagination -->
      <div
        v-if="walletsTotalPages > 1"
        class="flex items-center justify-between text-xs text-ink-500"
      >
        <span>Trang {{ walletsPage }} / {{ walletsTotalPages }} (Tổng {{ walletsTotal }} ví)</span>
        <div class="flex items-center gap-2">
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="walletsPage <= 1"
            @click="walletsPage--; loadWallets()"
          >
            Trước
          </FhButton>
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="walletsPage >= walletsTotalPages"
            @click="walletsPage++; loadWallets()"
          >
            Sau
          </FhButton>
        </div>
      </div>
    </div>

    <!-- TAB 2: YÊU CẦU RÚT TIỀN -->
    <div v-else-if="activeTab === 'withdrawals'" class="space-y-4">
      <!-- Payout overview -->
      <div v-if="payoutOverview" class="space-y-3">
        <div
          v-if="payoutOverview.provider === 'mock'"
          class="p-3 rounded-xl bg-warning-50 border border-warning-600/20 text-warning-600 text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle :size="15" class="shrink-0" />
          <span>Đang chạy chế độ giả lập chi hộ: lệnh rút của kỹ thuật viên không chuyển tiền thật.</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="p-4 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1">
            <div class="flex items-center justify-between text-[11px] font-bold text-ink-500">
              <span>Ví nguồn chi hộ</span>
              <Landmark :size="14" class="text-brand-600" />
            </div>
            <div class="text-lg font-extrabold font-num text-ink-900">
              {{ payoutOverview.sourceBalance === null ? 'Không đọc được' : formatCurrencyVND(payoutOverview.sourceBalance) }}
            </div>
            <p class="text-[11px] text-ink-500">
              {{ payoutOverview.provider === 'mock' ? 'Số dư giả lập' : 'Ví payOS dùng để chi hộ' }}
            </p>
          </div>
          <div class="p-4 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1">
            <div class="text-[11px] font-bold text-ink-500">Đã chuyển cho kỹ thuật viên</div>
            <div class="text-lg font-extrabold font-num text-success-600">
              {{ formatCurrencyVND(payoutOverview.paidOut.amount) }}
            </div>
            <p class="text-[11px] text-ink-500">{{ payoutOverview.paidOut.count }} lệnh thành công</p>
          </div>
          <div class="p-4 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1">
            <div class="text-[11px] font-bold text-ink-500">Đang chuyển</div>
            <div class="text-lg font-extrabold font-num text-info-600">
              {{ formatCurrencyVND(payoutOverview.processing.amount) }}
            </div>
            <p class="text-[11px] text-ink-500">{{ payoutOverview.processing.count }} lệnh chờ payOS xác nhận</p>
          </div>
          <div class="p-4 rounded-2xl bg-white border border-ink-200/80 shadow-xs space-y-1">
            <div class="text-[11px] font-bold text-ink-500">Chuyển thất bại</div>
            <div class="text-lg font-extrabold font-num text-danger-600">
              {{ formatCurrencyVND(payoutOverview.failed.amount) }}
            </div>
            <p class="text-[11px] text-ink-500">{{ payoutOverview.failed.count }} lệnh, tiền đã hoàn về ví kỹ thuật viên</p>
          </div>
        </div>
      </div>

      <FhTable
        :columns="wdColumns"
        :rows="filteredWithdrawals"
        :loading="wdLoading"
        :empty-text="'Không có yêu cầu rút tiền nào'"
      >
        <template #toolbar>
          <div class="flex items-center gap-2 text-xs font-bold ml-auto">
            <span class="text-ink-500">Trạng thái:</span>
            <select
              v-model="wdStatusFilter"
              class="h-9 px-3 rounded-sm border border-ink-200 text-xs text-ink-700 focus:outline-none focus:border-brand-600"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="PROCESSING">Đang chuyển tiền</option>
              <option value="SUCCESS">Đã chi tiền</option>
              <option value="FAILED">Chuyển thất bại</option>
              <option value="REJECTED">Đã từ chối</option>
            </select>
          </div>
        </template>

        <template #cell-requestedAt="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="16px" />
          <span v-else class="text-ink-600">{{ formatDateTimeVN(row.requestedAt) }}</span>
        </template>

        <template #cell-technician="{ row }">
          <div v-if="isSkeleton(row)">
            <FhSkeleton width="120px" height="16px" class="mb-1" />
            <FhSkeleton width="100px" height="12px" />
          </div>
          <div v-else>
            <div class="font-extrabold text-ink-900">
              {{ row.technician?.fullName || 'KTV FixHome' }}
            </div>
            <div class="text-[11px] text-ink-500 font-num">
              {{ row.technician?.phoneNumber || row.technicianId }}
            </div>
          </div>
        </template>

        <template #cell-amount="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="16px" />
          <span v-else class="font-extrabold font-num text-ink-900 text-sm whitespace-nowrap">
            {{ formatCurrencyVND(row.amount) }}
          </span>
        </template>

        <template #cell-bankInfo="{ row }">
          <div v-if="isSkeleton(row)">
            <FhSkeleton width="140px" height="16px" class="mb-1" />
            <FhSkeleton width="180px" height="12px" />
          </div>
          <div v-else>
            <div class="font-bold text-ink-900">{{ row.bankName }}</div>
            <div class="text-[11px] text-ink-600 font-num">
              {{ row.bankAccountNumber }} — <span class="uppercase font-bold">{{ row.bankAccountName }}</span>
            </div>
          </div>
        </template>

        <template #cell-status="{ row }">
          <FhSkeleton v-if="isSkeleton(row)" width="100px" height="24px" class="rounded-full" />
          <div v-else>
            <FhStatusPill :status="row.status" :label="formatWithdrawalStatus(row.status).label" />
            <div v-if="row.status === 'REJECTED' && row.rejectReason" class="text-[10px] text-rose-600 mt-1 max-w-xs whitespace-normal">
              Lý do: {{ row.rejectReason }}
            </div>
            <div v-if="row.status === 'FAILED'" class="text-[10px] text-rose-600 mt-1 max-w-xs whitespace-normal">
              {{ row.failureReason || 'Không chuyển được' }} · đã hoàn tiền vào ví
            </div>
            <div v-if="row.status === 'PROCESSING' && row.failureReason" class="text-[10px] text-info-600 mt-1 max-w-xs whitespace-normal">
              {{ row.failureReason }}
            </div>
            <div v-if="row.status === 'SUCCESS'" class="text-[10px] text-ink-400 mt-1">
              <template v-if="row.payoutBankReference">
                Mã GD: <span class="font-num font-bold text-ink-600">{{ row.payoutBankReference }}</span>
              </template>
              <template v-else-if="row.processedAt">{{ formatDateTimeVN(row.processedAt) }}</template>
            </div>
          </div>
        </template>

        <template #cell-actions="{ row }">
          <div v-if="isSkeleton(row)" class="flex justify-end gap-2">
            <FhSkeleton width="80px" height="28px" class="rounded-[var(--radius-sm)]" />
            <FhSkeleton width="80px" height="28px" class="rounded-[var(--radius-sm)]" />
          </div>
          <div v-else class="flex justify-end gap-2">
            <FhButton
              v-if="row.status === 'PROCESSING'"
              variant="secondary"
              size="sm"
              :loading="reconcilingId === row.id"
              @click="handleReconcile(row)"
            >
              <RefreshCw :size="13" class="mr-1" />
              Kiểm tra lại
            </FhButton>
            <span v-else class="text-ink-400 text-xs italic">Đã xong</span>
          </div>
        </template>
      </FhTable>

      <!-- Pagination -->
      <div
        v-if="wdTotalPages > 1"
        class="flex items-center justify-between text-xs text-ink-500"
      >
        <span>Trang {{ wdPage }} / {{ wdTotalPages }} (Tổng {{ wdTotal }} yêu cầu)</span>
        <div class="flex items-center gap-2">
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="wdPage <= 1"
            @click="wdPage--; loadWithdrawals()"
          >
            Trước
          </FhButton>
          <FhButton
            variant="secondary"
            size="sm"
            :disabled="wdPage >= wdTotalPages"
            @click="wdPage++; loadWithdrawals()"
          >
            Sau
          </FhButton>
        </div>
      </div>
    </div>

    <!-- TAB 3: CẤU HÌNH VÍ & TỶ LỆ PHÍ (ADMIN ONLY) -->
    <div v-else-if="activeTab === 'config' && isAdmin" class="max-w-2xl bg-white rounded-3xl p-6 sm:p-8 border border-ink-200/80 shadow-xs space-y-6">
      <div class="border-b border-ink-100 pb-4">
        <h2 class="text-base font-extrabold text-ink-900 flex items-center gap-2">
          <Sliders class="text-brand-600" :size="20" />
          <span>Thông số hệ thống Ví Kỹ thuật viên</span>
        </h2>
        <p class="text-xs text-ink-500 mt-1">
          Các thay đổi áp dụng tức thì cho logic thẩm định lời mời việc và khấu trừ hoa hồng
        </p>
      </div>

      <div v-if="configSuccessMsg" class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
        <CheckCircle2 :size="16" /> {{ configSuccessMsg }}
      </div>

      <div class="space-y-4">
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-ink-700">Mức ký quỹ duy trì tối thiểu (₫):</label>
          <div class="relative max-w-xs">
            <input
              v-model.number="editMinBalance"
              type="number"
              min="0"
              step="50000"
              class="w-full px-4 py-2.5 rounded-xl border border-ink-200 font-num font-extrabold text-ink-900 text-base focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <span class="absolute right-3.5 top-3 text-xs font-bold text-ink-400">VNĐ</span>
          </div>
          <p class="text-[11px] text-ink-500">
            Nếu số dư ví của KTV thấp hơn mức này, hệ thống sẽ tạm dừng gửi lời mời nhận việc mới.
          </p>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-ink-700">Tỷ lệ phí nền tảng hoa hồng (Basis points - bps):</label>
          <div class="flex items-center gap-3 max-w-xs">
            <input
              v-model.number="editFeeRateBps"
              type="number"
              min="0"
              max="5000"
              step="100"
              class="w-full px-4 py-2.5 rounded-xl border border-ink-200 font-num font-extrabold text-ink-900 text-base focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <span class="font-extrabold text-brand-600 text-sm whitespace-nowrap">
              = {{ (editFeeRateBps / 100).toFixed(1) }}%
            </span>
          </div>
          <p class="text-[11px] text-ink-500">
            1000 bps = 10.0%, 1500 bps = 15.0%. Áp dụng tự động tính khấu trừ khi hoàn thành đơn.
          </p>
        </div>

        <div class="pt-4 border-t border-ink-100 flex items-center justify-end">
          <FhButton
            variant="primary"
            size="md"
            :loading="configSaving"
            @click="saveConfig"
          >
            Lưu thay đổi cấu hình
          </FhButton>
        </div>
      </div>
    </div>

    <!-- MODAL: ADMIN BALANCE ADJUSTMENT -->
    <div
      v-if="showAdjustModal && selectedWalletForAdjust"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-extrabold text-ink-900 flex items-center gap-2">
            <ShieldAlert class="text-brand-600" :size="20" />
            <span>Điều chỉnh số dư ví (Admin)</span>
          </h3>
          <button type="button" class="text-ink-400 hover:text-ink-700 text-lg font-bold" @click="showAdjustModal = false">
            ✕
          </button>
        </div>

        <div v-if="adjustError" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle :size="16" /> {{ adjustError }}
        </div>

        <div class="p-3 rounded-xl bg-ink-50 border border-ink-100 text-xs space-y-1">
          <div class="flex justify-between">
            <span class="text-ink-500">Kỹ thuật viên:</span>
            <span class="font-bold text-ink-900">{{ selectedWalletForAdjust.technician.fullName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Số dư hiện tại:</span>
            <span class="font-extrabold font-num text-ink-900">{{ formatCurrencyVND(selectedWalletForAdjust.balance) }}</span>
          </div>
        </div>

        <div class="space-y-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Loại điều chỉnh:</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="py-2.5 px-3 rounded-xl border text-xs font-extrabold transition-all"
                :class="[
                  adjustType === 'CREDIT'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                ]"
                @click="adjustType = 'CREDIT'"
              >
                + Cộng tiền (CREDIT)
              </button>
              <button
                type="button"
                class="py-2.5 px-3 rounded-xl border text-xs font-extrabold transition-all"
                :class="[
                  adjustType === 'DEBIT'
                    ? 'border-rose-600 bg-rose-50 text-rose-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                ]"
                @click="adjustType = 'DEBIT'"
              >
                - Trừ tiền (DEBIT)
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Số tiền (₫):</label>
            <input
              v-model.number="adjustAmount"
              type="number"
              min="1000"
              step="10000"
              placeholder="100000"
              class="w-full px-4 py-2.5 rounded-xl border border-ink-200 font-num font-extrabold text-ink-900 text-base focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-ink-700">Lý do điều chỉnh kiểm toán (Bắt buộc):</label>
            <textarea
              v-model="adjustReason"
              rows="3"
              placeholder="Ghi rõ căn cứ quyết toán, mã tranh chấp hoặc lý do điều chỉnh..."
              class="w-full p-3 rounded-xl border border-ink-200 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <FhButton variant="secondary" size="md" @click="showAdjustModal = false">
              Huỷ bỏ
            </FhButton>
            <FhButton
              variant="primary"
              size="md"
              :loading="adjustSubmitting"
              @click="handleAdjust"
            >
              Thực hiện điều chỉnh
            </FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: TECH TRANSACTIONS LEDGER DRAWER -->
    <div
      v-if="showTxModal && selectedTech"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 class="text-base font-extrabold text-ink-900">
              Lịch sử ví: {{ selectedTech.name }}
            </h3>
            <p class="text-xs text-ink-500">
              Số dư hiện tại: <strong class="font-num text-ink-900">{{ formatCurrencyVND(selectedTech.balance) }}</strong>
            </p>
          </div>
          <button type="button" class="text-ink-400 hover:text-ink-700 text-lg font-bold" @click="showTxModal = false">
            ✕
          </button>
        </div>

        <div v-if="techTxLoading" class="py-12 text-center text-ink-400 text-xs">
          <RefreshCw class="animate-spin inline-block mr-2" :size="16" />
          Đang tải dữ liệu giao dịch...
        </div>

        <div v-else-if="techTransactions.length === 0" class="py-12 text-center text-ink-400 text-xs">
          Chưa có giao dịch nào
        </div>

        <div v-else class="flex-1 overflow-y-auto divide-y divide-ink-100 pr-1">
          <div
            v-for="tx in techTransactions"
            :key="tx.id"
            class="py-3 flex items-center justify-between gap-4 text-xs"
          >
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-extrabold text-ink-900">{{ formatWalletTxType(tx.type).label }}</span>
                <span class="text-[10px] text-ink-400 font-num">{{ formatDateTimeVN(tx.createdAt) }}</span>
              </div>
              <p class="text-[11px] text-ink-500">{{ tx.description || 'Giao dịch ví' }}</p>
              <div class="text-[10px] text-ink-400">
                Số dư sau: <strong class="font-num">{{ formatCurrencyVND(tx.balanceAfter) }}</strong>
              </div>
            </div>

            <div
              class="font-extrabold font-num text-sm text-right shrink-0"
              :class="[formatWalletTxType(tx.type).isCredit ? 'text-emerald-600' : 'text-rose-600']"
            >
              {{ formatWalletTxType(tx.type).isCredit ? '+' : '-' }}{{ formatCurrencyVND(tx.amount) }}
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-ink-100 flex justify-end">
          <FhButton variant="secondary" size="sm" @click="showTxModal = false">
            Đóng
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
