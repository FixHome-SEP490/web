<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import {
  Wallet,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Sliders,
  AlertCircle,
  FileText,
  ShieldAlert,
} from 'lucide-vue-next';
import {
  walletApi,
  type WalletListItem,
  type WithdrawalRequest,
  type WalletTransaction,
  type WalletConfig,
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

// Tab 2: Withdrawals State
const withdrawals = ref<WithdrawalRequest[]>([]);
const wdLoading = ref(false);
const wdStatusFilter = ref<string>('ALL');
const wdPage = ref(1);
const wdTotalPages = ref(1);
const wdTotal = ref(0);

// Tab 3: Config State (Admin)
const config = ref<WalletConfig | null>(null);
const configLoading = ref(false);
const configSaving = ref(false);
const editMinBalance = ref<number>(200000);
const editFeeRateBps = ref<number>(1500);
const configSuccessMsg = ref<string | null>(null);

// Modals State
const selectedWd = ref<WithdrawalRequest | null>(null);
const showApproveModal = ref(false);
const showRejectModal = ref(false);
const rejectReason = ref('');
const actionSubmitting = ref(false);

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

const openApprove = (wd: WithdrawalRequest) => {
  selectedWd.value = wd;
  showApproveModal.value = true;
};

const handleApprove = async () => {
  if (!selectedWd.value) return;
  actionSubmitting.value = true;
  try {
    await walletApi.approveWithdrawal(selectedWd.value.id);
    showApproveModal.value = false;
    await loadWithdrawals();
    await loadWallets();
  } catch (err: unknown) {
    alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Phê duyệt thất bại');
  } finally {
    actionSubmitting.value = false;
  }
};

const openReject = (wd: WithdrawalRequest) => {
  selectedWd.value = wd;
  rejectReason.value = '';
  showRejectModal.value = true;
};

const handleReject = async () => {
  if (!selectedWd.value) return;
  if (!rejectReason.value.trim() || rejectReason.value.trim().length < 5) {
    alert('Vui lòng nhập lý do từ chối rõ ràng (tối thiểu 5 ký tự)');
    return;
  }
  actionSubmitting.value = true;
  try {
    await walletApi.rejectWithdrawal(selectedWd.value.id, rejectReason.value.trim());
    showRejectModal.value = false;
    await loadWithdrawals();
    await loadWallets();
  } catch (err: unknown) {
    alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Từ chối thất bại');
  } finally {
    actionSubmitting.value = false;
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
  if (tab === 'withdrawals') loadWithdrawals();
  if (tab === 'config') loadConfig();
});

onMounted(() => {
  loadWallets();
  loadWithdrawals();
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
          Giám sát số dư ký quỹ thợ, duyệt yêu cầu rút tiền về ngân hàng và điều chỉnh số dư kiểm toán
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
      <!-- Search & Filters -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="relative max-w-sm w-full">
          <Search :size="16" class="absolute left-3 top-3 text-ink-400" />
          <input
            v-model="walletSearch"
            type="text"
            placeholder="Tìm theo tên thợ, SĐT, email..."
            class="w-full pl-9 pr-4 py-2 rounded-xl border border-ink-200 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            @keyup.enter="walletsPage = 1; loadWallets()"
          />
        </div>

        <div class="flex items-center gap-2 text-xs font-bold">
          <span class="text-ink-400">Trạng thái:</span>
          <select
            v-model="walletEligibilityFilter"
            class="px-3 py-2 rounded-xl border border-ink-200 text-xs font-semibold text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="ALL">Tất cả điều kiện</option>
            <option value="ELIGIBLE">Đủ điều kiện nhận việc</option>
            <option value="INELIGIBLE">Dưới mức tối thiểu</option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="walletsLoading" class="py-16 text-center text-ink-400 text-xs">
        <RefreshCw class="animate-spin inline-block mr-2" :size="18" />
        Đang tải danh sách ví kỹ thuật viên...
      </div>

      <!-- Empty State -->
      <div
        v-else-if="wallets.length === 0"
        class="py-16 text-center text-ink-400 text-xs space-y-2 bg-white rounded-2xl border border-ink-100"
      >
        <Wallet :size="36" class="mx-auto text-ink-300 stroke-1" />
        <p>Không tìm thấy ví kỹ thuật viên nào phù hợp</p>
      </div>

      <!-- Wallets Table -->
      <div v-else class="bg-white rounded-2xl border border-ink-200/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-ink-50 text-ink-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-ink-100">
              <tr>
                <th class="py-3 px-4">Kỹ thuật viên</th>
                <th class="py-3 px-4">Số dư thực tế</th>
                <th class="py-3 px-4">Điều kiện nhận việc</th>
                <th class="py-3 px-4">Cập nhật lần cuối</th>
                <th class="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr v-for="item in wallets" :key="item.id" class="hover:bg-ink-50/50">
                <td class="py-3.5 px-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-extrabold text-sm shrink-0">
                      {{ item.technician.fullName?.charAt(0)?.toUpperCase() || 'T' }}
                    </div>
                    <div>
                      <div class="font-extrabold text-ink-900 text-xs sm:text-sm">
                        {{ item.technician.fullName }}
                      </div>
                      <div class="text-[11px] text-ink-500 font-num">
                        {{ item.technician.phoneNumber }} • {{ item.technician.email }}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div
                    class="text-sm font-extrabold font-num"
                    :class="[item.balance < 0 ? 'text-rose-600' : 'text-ink-900']"
                  >
                    {{ formatCurrencyVND(item.balance) }}
                  </div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <span
                    v-if="item.eligibleForJobs"
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
                </td>
                <td class="py-3.5 px-4 text-ink-500 whitespace-nowrap">
                  {{ formatDateTimeVN(item.updatedAt) }}
                </td>
                <td class="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                  <FhButton variant="secondary" size="sm" @click="viewTransactions(item)">
                    <FileText :size="13" class="mr-1" />
                    Lịch sử
                  </FhButton>
                  <FhButton
                    v-if="isAdmin"
                    variant="primary"
                    size="sm"
                    @click="openAdjustModal(item)"
                  >
                    Điều chỉnh
                  </FhButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          v-if="walletsTotalPages > 1"
          class="flex items-center justify-between p-4 border-t border-ink-100 text-xs text-ink-500"
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
    </div>

    <!-- TAB 2: YÊU CẦU RÚT TIỀN -->
    <div v-else-if="activeTab === 'withdrawals'" class="space-y-4">
      <!-- Status Filter -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs font-bold">
          <span class="text-ink-400">Trạng thái:</span>
          <select
            v-model="wdStatusFilter"
            class="px-3 py-2 rounded-xl border border-ink-200 text-xs font-semibold text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt chi (PENDING)</option>
            <option value="SUCCESS">Đã chi tiền (SUCCESS)</option>
            <option value="REJECTED">Đã từ chối (REJECTED)</option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="wdLoading" class="py-16 text-center text-ink-400 text-xs">
        <RefreshCw class="animate-spin inline-block mr-2" :size="18" />
        Đang tải danh sách yêu cầu rút tiền...
      </div>

      <!-- Empty State -->
      <div
        v-else-if="withdrawals.length === 0"
        class="py-16 text-center text-ink-400 text-xs space-y-2 bg-white rounded-2xl border border-ink-100"
      >
        <ArrowUpRight :size="36" class="mx-auto text-ink-300 stroke-1" />
        <p>Không có yêu cầu rút tiền nào</p>
      </div>

      <!-- Withdrawals Table -->
      <div v-else class="bg-white rounded-2xl border border-ink-200/80 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-ink-50 text-ink-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-ink-100">
              <tr>
                <th class="py-3 px-4">Thời gian</th>
                <th class="py-3 px-4">Kỹ thuật viên</th>
                <th class="py-3 px-4">Số tiền rút</th>
                <th class="py-3 px-4">Tài khoản thụ hưởng</th>
                <th class="py-3 px-4">Trạng thái</th>
                <th class="py-3 px-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              <tr v-for="w in withdrawals" :key="w.id" class="hover:bg-ink-50/50">
                <td class="py-3.5 px-4 whitespace-nowrap text-ink-600">
                  {{ formatDateTimeVN(w.requestedAt) }}
                </td>
                <td class="py-3.5 px-4">
                  <div class="font-extrabold text-ink-900">
                    {{ w.technician?.fullName || 'KTV FixHome' }}
                  </div>
                  <div class="text-[11px] text-ink-500 font-num">
                    {{ w.technician?.phoneNumber || w.technicianId }}
                  </div>
                </td>
                <td class="py-3.5 px-4 font-extrabold font-num text-ink-900 text-sm whitespace-nowrap">
                  {{ formatCurrencyVND(w.amount) }}
                </td>
                <td class="py-3.5 px-4">
                  <div class="font-bold text-ink-900">{{ w.bankName }}</div>
                  <div class="text-[11px] text-ink-600 font-num">
                    {{ w.bankAccountNumber }} — <span class="uppercase font-bold">{{ w.bankAccountName }}</span>
                  </div>
                </td>
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <FhStatusPill :status="w.status" />
                  <div v-if="w.status === 'REJECTED' && w.rejectReason" class="text-[10px] text-rose-600 mt-1 max-w-xs">
                    Lý do: {{ w.rejectReason }}
                  </div>
                  <div v-if="w.status === 'SUCCESS' && w.processedAt" class="text-[10px] text-ink-400 mt-1">
                    {{ formatDateTimeVN(w.processedAt) }}
                  </div>
                </td>
                <td class="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                  <template v-if="w.status === 'PENDING'">
                    <FhButton variant="primary" size="sm" @click="openApprove(w)">
                      <CheckCircle2 :size="13" class="mr-1" />
                      Duyệt chi
                    </FhButton>
                    <FhButton variant="danger" size="sm" @click="openReject(w)">
                      <XCircle :size="13" class="mr-1" />
                      Từ chối
                    </FhButton>
                  </template>
                  <span v-else class="text-ink-400 text-xs italic">Đã giải quyết</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          v-if="wdTotalPages > 1"
          class="flex items-center justify-between p-4 border-t border-ink-100 text-xs text-ink-500"
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

    <!-- MODAL: PHÊ DUYỆT RÚT TIỀN -->
    <div
      v-if="showApproveModal && selectedWd"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
        <h3 class="text-base font-extrabold text-ink-900 flex items-center gap-2">
          <CheckCircle2 class="text-emerald-600" :size="20" />
          <span>Xác nhận duyệt chi tiền</span>
        </h3>

        <div class="p-4 rounded-2xl bg-ink-50 border border-ink-100 space-y-2 text-xs">
          <div class="flex justify-between">
            <span class="text-ink-500">Kỹ thuật viên:</span>
            <span class="font-bold text-ink-900">{{ selectedWd.technician?.fullName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Số tiền chi trả:</span>
            <span class="font-extrabold font-num text-sm text-brand-600">{{ formatCurrencyVND(selectedWd.amount) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Ngân hàng:</span>
            <span class="font-bold text-ink-900">{{ selectedWd.bankName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Số tài khoản:</span>
            <span class="font-extrabold font-num text-ink-900">{{ selectedWd.bankAccountNumber }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Chủ tài khoản:</span>
            <span class="font-bold uppercase text-ink-900">{{ selectedWd.bankAccountName }}</span>
          </div>
        </div>

        <p class="text-xs text-ink-500">
          Vui lòng xác nhận bạn đã hoàn tất lệnh chuyển khoản đến tài khoản ngân hàng trên. Hệ thống sẽ ghi nhận trạng thái THÀNH CÔNG và trừ chính thức số dư ký quỹ của kỹ thuật viên.
        </p>

        <div class="flex items-center justify-end gap-3 pt-2">
          <FhButton variant="secondary" size="md" @click="showApproveModal = false">
            Huỷ bỏ
          </FhButton>
          <FhButton
            variant="primary"
            size="md"
            :loading="actionSubmitting"
            @click="handleApprove"
          >
            Xác nhận đã chi tiền
          </FhButton>
        </div>
      </div>
    </div>

    <!-- MODAL: TỪ CHỐI RÚT TIỀN -->
    <div
      v-if="showRejectModal && selectedWd"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
        <h3 class="text-base font-extrabold text-ink-900 flex items-center gap-2">
          <XCircle class="text-rose-600" :size="20" />
          <span>Từ chối yêu cầu rút tiền</span>
        </h3>

        <p class="text-xs text-ink-500">
          Số tiền <strong class="font-num text-ink-900">{{ formatCurrencyVND(selectedWd.amount) }}</strong> sẽ được hoàn trả lại ví khả dụng của KTV. Vui lòng cung cấp lý do từ chối rõ ràng.
        </p>

        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-ink-700">Lý do từ chối (Bắt buộc):</label>
          <textarea
            v-model="rejectReason"
            rows="3"
            placeholder="VD: Số tài khoản và tên chủ thẻ ngân hàng không trùng khớp..."
            class="w-full p-3 rounded-xl border border-ink-200 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
        </div>

        <div class="flex items-center justify-end gap-3 pt-2">
          <FhButton variant="secondary" size="md" @click="showRejectModal = false">
            Huỷ bỏ
          </FhButton>
          <FhButton
            variant="danger"
            size="md"
            :loading="actionSubmitting"
            @click="handleReject"
          >
            Xác nhận từ chối
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
