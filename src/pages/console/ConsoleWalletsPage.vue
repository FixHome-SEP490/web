<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Coins,
  History,
  RotateCcw,
  Search,
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
import { FhButton, FhSkeleton } from '../../components';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleStatCard from '../../components/console/ConsoleStatCard.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import CustomerWithdrawalsTab from '../../components/console/CustomerWithdrawalsTab.vue';
import TechnicianWalletHistoryModal from '../../components/console/wallets/TechnicianWalletHistoryModal.vue';
import { consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
import {
  formatCurrencyVND,
  formatDateTimeVN,
  formatWithdrawalStatus,
} from '../../utils/formatters';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { consoleCustomerWithdrawalsApi } from '../../api/console-customer-withdrawals.api';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { useQueryChoice } from '../../composables/useQueryState';
import { queryKeys } from '../../lib/query-keys';

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.userRole === 'ADMIN');

// Withdrawals of technicians and of customers (PO 16/10/2026) are two lists
// with their own totals, never mixed; only the payOS source balance is shared
// (one payout channel) and shown once above them (?payout=customers).
type PayoutTab = 'technicians' | 'customers';
const payoutTab = useQueryChoice<PayoutTab>('payout', ['technicians', 'customers'], 'technicians');

const activeTab = ref<'wallets' | 'withdrawals' | 'config'>(payoutTab.value === 'customers' ? 'withdrawals' : 'wallets');

// Tab 1: Wallets State
const wallets = ref<WalletListItem[]>([]);
const walletsLoading = ref(false);
const walletsError = ref(false);
const walletSearch = ref('');
const walletEligibilityFilter = ref<'ALL' | 'ELIGIBLE' | 'INELIGIBLE'>('ALL');
const walletsPage = ref(1);
const walletsTotalPages = ref(1);
const walletsTotal = ref(0);

// Tab 2: Withdrawals State
const withdrawals = ref<WithdrawalRequest[]>([]);
const wdLoading = ref(false);
const wdError = ref(false);
const wdStatusFilter = ref<string>('ALL');
const wdPage = ref(1);
const wdTotalPages = ref(1);
const wdTotal = ref(0);

// Tab 3: Config State (Admin)
const config = ref<WalletConfig | null>(null);
const configLoading = ref(false);
const configError = ref(false);
const configSaveError = ref('');
const configSaving = ref(false);
const editMinBalance = ref<number>(200000);
const editFeeRateBps = ref<number>(1500);
const configSuccessMsg = ref<string | null>(null);

// Withdrawals are paid out the moment the technician asks (PO decision
// 30/09/2026). Managers track the money leaving; there is nothing to approve.
// What has left, what is moving, and what the payout source holds:
const payoutOverview = ref<PayoutOverview | null>(null);
const payoutOverviewLoading = ref(false);
/** Id of the withdrawal whose payout is being re-checked with payOS. */
const reconcilingId = ref<string | null>(null);

// Customer side of the payout section: read only while its tab is open.
const showingCustomerPayouts = computed(() => activeTab.value === 'withdrawals' && payoutTab.value === 'customers');
const customerPayout = useCachedQuery({
  key: queryKeys.wallet.consoleCustomerPayout,
  fetch: () => consoleCustomerWithdrawalsApi.payoutOverview(),
  enabled: showingCustomerPayouts,
});
// The overview is extra context: a failed read hides it, the list still loads on its own.
const customerOverview = computed(() => (customerPayout.error.value ? null : customerPayout.data.value ?? null));
const customerOverviewLoading = computed(() => customerPayout.loading.value);
/** Customer withdrawals for the current filter; known once the customer tab has read its list. */
const customerWdTotal = ref<number | null>(null);
const cache = useCacheUpdates();

/** The payout channel both tabs share; either overview carries its balance. */
const sourceOverview = computed<PayoutOverview | null>(() =>
  payoutTab.value === 'customers'
    ? customerOverview.value ?? payoutOverview.value
    : payoutOverview.value ?? customerOverview.value,
);

const payoutTabs = computed(() => [
  { key: 'technicians' as const, label: 'Kỹ thuật viên', count: wdTotal.value },
  { key: 'customers' as const, label: 'Khách hàng', count: customerWdTotal.value },
]);

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
const selectedTech = ref<{ id: string; name: string; balance: number; accountNumber?: string | null } | null>(null);
const techTransactions = ref<WalletTransaction[]>([]);
const techTxLoading = ref(false);
const techTxError = ref(false);

const tabs = computed(() => [
  { key: 'wallets' as const, label: 'Ví kỹ thuật viên', count: walletsTotal.value },
  { key: 'withdrawals' as const, label: 'Yêu cầu rút tiền' },
  ...(isAdmin.value ? [{ key: 'config' as const, label: 'Cấu hình' }] : []),
]);

const refreshActiveTab = () => {
  if (activeTab.value === 'wallets') void loadWallets();
  else if (activeTab.value === 'withdrawals') {
    if (payoutTab.value === 'customers') {
      void cache.refresh([queryKeys.wallet.consoleCustomerWithdrawalsAll]);
      return;
    }
    void loadWithdrawals();
    void loadPayoutOverview();
  } else void loadConfig();
};

const loadWallets = async () => {
  walletsLoading.value = true;
  walletsError.value = false;
  try {
    const res = await walletApi.listWallets({
      page: walletsPage.value,
      limit: 15,
      search: walletSearch.value.trim() || undefined,
      eligible: walletEligibilityFilter.value === 'ALL' ? undefined : walletEligibilityFilter.value === 'ELIGIBLE',
    });
    wallets.value = res.data;
    walletsTotal.value = res.meta.total;
    walletsTotalPages.value = res.meta.totalPages || 1;
  } catch {
    walletsError.value = true;
  } finally {
    walletsLoading.value = false;
  }
};

const loadWithdrawals = async () => {
  wdLoading.value = true;
  wdError.value = false;
  try {
    const res = await walletApi.listWithdrawals({
      page: wdPage.value,
      limit: 15,
      status: wdStatusFilter.value === 'ALL' ? undefined : wdStatusFilter.value,
    });
    withdrawals.value = res.data;
    wdTotal.value = res.meta.total;
    wdTotalPages.value = res.meta.totalPages || 1;
  } catch {
    wdError.value = true;
  } finally {
    wdLoading.value = false;
  }
};

const loadPayoutOverview = async () => {
  payoutOverviewLoading.value = true;
  try {
    payoutOverview.value = await walletApi.getPayoutOverview();
  } catch {
    payoutOverview.value = null;
  } finally {
    payoutOverviewLoading.value = false;
  }
};

const loadConfig = async () => {
  if (!isAdmin.value) return;
  configLoading.value = true;
  configError.value = false;
  try {
    config.value = await walletApi.getWalletConfig();
    editMinBalance.value = config.value.minimumWalletBalance;
    editFeeRateBps.value = config.value.platformFeeRateBps;
  } catch {
    configError.value = true;
  } finally {
    configLoading.value = false;
  }
};

const saveConfig = async () => {
  configSaveError.value = '';
  if (editMinBalance.value < 0 || editFeeRateBps.value < 0 || editFeeRateBps.value > 5000) {
    configSaveError.value = 'Ký quỹ không được âm; phí nền tảng từ 0 đến 5000 phần vạn (0% đến 50%).';
    return;
  }
  configSaving.value = true;
  configSuccessMsg.value = null;
  try {
    config.value = await walletApi.updateWalletConfig({
      minimumWalletBalance: editMinBalance.value,
      platformFeeRateBps: editFeeRateBps.value,
    });
    configSuccessMsg.value = 'Đã lưu thay đổi.';
    setTimeout(() => {
      configSuccessMsg.value = null;
    }, 2500);
  } catch (err: unknown) {
    configSaveError.value = extractApiErrorMessage(err, 'Chưa lưu được cấu hình, vui lòng thử lại.');
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
    toast.error(extractApiErrorMessage(err, 'Chưa kiểm tra được với payOS, vui lòng thử lại.'));
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
    adjustError.value = 'Số tiền phải lớn hơn 0.';
    return;
  }
  if (!adjustReason.value.trim()) {
    adjustError.value = 'Ghi lý do điều chỉnh.';
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
    adjustError.value = extractApiErrorMessage(err, 'Chưa điều chỉnh được số dư, vui lòng thử lại.');
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
  techTxError.value = false;
  techTransactions.value = [];
  try {
    const res = await walletApi.getWalletTransactions(item.technicianId, { limit: 50 });
    techTransactions.value = res.data;
  } catch {
    techTxError.value = true;
  } finally {
    techTxLoading.value = false;
  }
};

const viewTransactionsFromWd = (wd: WithdrawalRequest) => {
  if (!wd.technician) return;
  selectedTech.value = {
    id: wd.technicianId,
    name: wd.technician.fullName,
    balance: wd.amount,
    accountNumber: wd.bankAccountNumber,
  };
  showTxModal.value = true;
  techTxLoading.value = true;
  techTxError.value = false;
  techTransactions.value = [];
  walletApi.getWalletTransactions(wd.technicianId, { limit: 50 })
    .then((res) => {
      techTransactions.value = res.data;
    })
    .catch(() => {
      techTxError.value = true;
    })
    .finally(() => {
      techTxLoading.value = false;
    });
};

function getInitials(name: string): string {
  if (!name) return 'KT';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

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
  if (tab === 'withdrawals' && payoutTab.value === 'technicians') {
    loadWithdrawals();
    loadPayoutOverview();
  }
  if (tab === 'config') loadConfig();
});

watch(payoutTab, (tab) => {
  if (tab === 'technicians' && activeTab.value === 'withdrawals') {
    loadWithdrawals();
    loadPayoutOverview();
  }
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
  <div class="space-y-5">
    <!-- Header: Modern, Clean with Wallet Icon and Action Menu -->
    <header class="animate-slide-up flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100/80 text-brand-600 shadow-2xs">
          <Wallet :size="24" :stroke-width="2" aria-hidden="true" />
        </div>
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-ink-900">Chi hộ và rút tiền</h1>
          <p class="text-xs text-ink-500 sm:text-sm">
            Quản lý các yêu cầu chi hộ và rút tiền của kỹ thuật viên trên nền tảng.
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <ConsoleMoreMenu>
          <ConsoleMenuItem @click="refreshActiveTab">
            <span class="flex items-center gap-1.5">
              <RotateCcw :size="14" />
              Làm mới dữ liệu
            </span>
          </ConsoleMenuItem>
        </ConsoleMoreMenu>
      </div>
    </header>

    <!-- Navigation Tabs: 3 Main Tabs -->
    <ConsoleTabs v-model="activeTab" class="animate-slide-up-delay-1" :tabs="tabs" />

    <!-- TAB 1: Wallets (Ví kỹ thuật viên) -->
    <div v-if="activeTab === 'wallets'" class="animate-slide-up-delay-2 space-y-4">
      <!-- Search & Eligibility Filter Bar -->
      <div class="flex flex-wrap items-center gap-2.5 rounded-2xl border border-ink-100 bg-white p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] sm:p-4">
        <div class="relative w-full min-w-0 sm:w-72">
          <Search
            :size="15"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <input
            v-model="walletSearch"
            type="search"
            maxlength="100"
            placeholder="Tìm theo tên, email, số điện thoại..."
            aria-label="Tìm kiếm ví kỹ thuật viên"
            class="h-9 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-800 transition-colors focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            @input="walletsPage = 1; loadWallets()"
          />
        </div>

        <select
          v-model="walletEligibilityFilter"
          aria-label="Điều kiện nhận việc"
          class="h-9 cursor-pointer rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <option value="ALL">Mọi điều kiện</option>
          <option value="ELIGIBLE">Đủ điều kiện nhận việc</option>
          <option value="INELIGIBLE">Dưới mức tối thiểu</option>
        </select>
      </div>

      <ConsoleLoadError v-if="walletsError" @retry="loadWallets" />

      <!-- Wallets Data Table -->
      <div v-else class="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        <div class="overflow-x-auto overscroll-x-contain">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-ink-100 bg-ink-50/70">
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Kỹ thuật viên</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold text-ink-500">Số dư ví</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Điều kiện nhận việc</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Thời gian cập nhật</th>
                <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold text-ink-500">Thao tác</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-ink-100/70">
              <tr v-if="walletsLoading">
                <td colspan="5" class="px-4 py-12 text-center text-sm text-ink-400">
                  <div class="inline-flex items-center gap-2">
                    <div class="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                    <span>Đang tải danh sách ví kỹ thuật viên...</span>
                  </div>
                </td>
              </tr>

              <tr v-else-if="wallets.length === 0">
                <td colspan="5" class="px-4 py-16 text-center text-sm text-ink-500">
                  <div class="mx-auto flex max-w-xs flex-col items-center justify-center gap-2">
                    <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
                      <Wallet :size="24" />
                    </div>
                    <p class="font-medium text-ink-800">Không có ví kỹ thuật viên nào phù hợp.</p>
                  </div>
                </td>
              </tr>

              <tr
                v-for="row in wallets"
                v-else
                :key="row.id"
                class="transition-colors hover:bg-brand-50/30"
              >
                <!-- 1. Kỹ thuật viên (Avatar + Info) -->
                <td class="px-4 py-3.5 align-middle">
                  <div class="flex items-center gap-3">
                    <!-- Avatar circle or initials -->
                    <img
                      v-if="row.technician.avatarUrl"
                      :src="row.technician.avatarUrl"
                      :alt="row.technician.fullName"
                      class="h-9 w-9 rounded-full object-cover border border-ink-100"
                    />
                    <div
                      v-else
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100/80 text-xs font-bold text-brand-700"
                    >
                      {{ getInitials(row.technician.fullName) }}
                    </div>

                    <div class="min-w-0">
                      <div class="font-semibold text-ink-900 text-xs sm:text-sm">
                        {{ row.technician.fullName }}
                      </div>
                      <div class="truncate text-[11px] text-ink-500" :title="row.technician.email">
                        <span class="whitespace-nowrap font-num text-ink-600">{{ row.technician.phoneNumber }}</span>
                        <span class="text-ink-300"> · </span>
                        <span>{{ row.technician.email }}</span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- 2. Số dư -->
                <td class="px-4 py-3.5 text-right align-middle">
                  <span
                    class="whitespace-nowrap font-num text-xs font-bold sm:text-sm"
                    :class="row.balance < 0 ? 'text-danger-600' : 'text-ink-900'"
                  >
                    {{ formatCurrencyVND(row.balance) }}
                  </span>
                </td>

                <!-- 3. Điều kiện nhận việc -->
                <td class="px-4 py-3.5 align-middle">
                  <span
                    v-if="row.eligibleForJobs"
                    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Đủ điều kiện
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Dưới mức ký quỹ
                  </span>
                </td>

                <!-- 4. Thời gian cập nhật -->
                <td class="px-4 py-3.5 align-middle">
                  <span class="whitespace-nowrap font-num text-xs text-ink-500">
                    {{ formatDateTimeVN(row.updatedAt) }}
                  </span>
                </td>

                <!-- 5. Thao tác -->
                <td class="px-4 py-3.5 text-right align-middle">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-2xs transition-colors hover:bg-ink-50 active:bg-ink-100"
                      @click="viewTransactions(row)"
                    >
                      <History :size="13" class="text-ink-500" />
                      <span>Lịch sử</span>
                    </button>

                    <ConsoleMoreMenu v-if="isAdmin" label="Thao tác khác với ví">
                      <ConsoleMenuItem @click="openAdjustModal(row)">
                        Điều chỉnh số dư
                      </ConsoleMenuItem>
                    </ConsoleMoreMenu>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer Pagination -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white px-5 py-3">
          <div class="text-xs text-ink-500">
            Hiển thị {{ wallets.length }} trong {{ walletsTotal }} ví
          </div>
          <ConsolePagination
            :page="walletsPage"
            :total-pages="walletsTotalPages"
            :disabled="walletsLoading"
            @update:page="(p) => { walletsPage = p; loadWallets(); }"
          />
        </div>
      </div>
    </div>

    <!-- TAB 2: Withdrawals (Yêu cầu rút tiền) -->
    <div v-else-if="activeTab === 'withdrawals'" class="animate-slide-up-delay-2 space-y-4">
      <!-- Shared Payout Source (Ví nguồn chi hộ payOS) -->
      <template v-if="sourceOverview">
        <Transition name="fh-fade-slide">
          <p
            v-if="sourceOverview.provider === 'disabled'"
            class="flex items-center gap-2 rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700 shadow-2xs"
            role="alert"
          >
            <AlertCircle :size="18" class="shrink-0" aria-hidden="true" />
            Chưa cấu hình payOS nên chưa thể chi tiền rút cho {{ payoutTab === 'customers' ? 'khách hàng' : 'kỹ thuật viên' }}.
          </p>
        </Transition>

        <section
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
          aria-label="Ví nguồn chi hộ"
          data-testid="payout-source"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Wallet :size="20" />
            </div>
            <div class="min-w-0">
              <div class="whitespace-nowrap text-sm font-bold text-ink-900">Ví nguồn chi hộ</div>
              <div class="mt-0.5 text-xs text-ink-500">
                {{ sourceOverview.provider === 'disabled' ? 'Chưa cấu hình payOS' : 'Ví payOS dùng để chi hộ, chung cho kỹ thuật viên và khách hàng' }}
              </div>
            </div>
          </div>
          <div class="whitespace-nowrap font-num text-xl font-bold text-ink-900">
            {{ sourceOverview.sourceBalance === null ? 'Không đọc được' : formatCurrencyVND(sourceOverview.sourceBalance) }}
          </div>
        </section>
      </template>

      <!-- Sub Tabs: Kỹ thuật viên & Khách hàng -->
      <ConsoleTabs v-model="payoutTab" :tabs="payoutTabs" />

      <!-- Customer Withdrawals Tab Component -->
      <CustomerWithdrawalsTab
        v-if="payoutTab === 'customers'"
        :overview="customerOverview"
        :overview-loading="customerOverviewLoading"
        @total="customerWdTotal = $event"
      />

      <!-- Technician Withdrawals Section -->
      <div v-else class="space-y-4">
        <!-- Top 4 KPI Summary Cards (When in Technician Withdrawals tab) -->
        <section
          v-if="payoutOverview || payoutOverviewLoading"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Tổng quan chi tiền"
        >
          <ConsoleStatCard
            featured
            :loading="!payoutOverview && payoutOverviewLoading"
            label="Tổng số yêu cầu"
            :value="wdTotal.toLocaleString('vi-VN')"
            sublabel="Yêu cầu trên hệ thống"
            :icon="Coins"
            tone="neutral"
          />

          <ConsoleStatCard
            :loading="!payoutOverview && payoutOverviewLoading"
            label="Đã chi trả"
            :value="payoutOverview ? formatCurrencyVND(payoutOverview.paidOut.amount) : 0"
            :icon="CheckCircle2"
            tone="success"
          >
            <template v-if="payoutOverview" #sub>
              <span class="sr-only">Đã chuyển cho kỹ thuật viên </span>
              <span class="font-num font-semibold text-ink-700">{{ payoutOverview.paidOut.count }}</span> lệnh thành công
            </template>
          </ConsoleStatCard>

          <ConsoleStatCard
            :loading="!payoutOverview && payoutOverviewLoading"
            label="Đang xử lý"
            :value="payoutOverview ? formatCurrencyVND(payoutOverview.processing.amount) : 0"
            :icon="Clock"
            tone="warning"
          >
            <template v-if="payoutOverview" #sub>
              <span class="sr-only">Đang chuyển </span>
              <span class="font-num font-semibold text-ink-700">{{ payoutOverview.processing.count }}</span> lệnh chờ payOS xác nhận
            </template>
          </ConsoleStatCard>

          <ConsoleStatCard
            :loading="!payoutOverview && payoutOverviewLoading"
            label="Chuyển thất bại"
            :value="payoutOverview ? formatCurrencyVND(payoutOverview.failed.amount) : 0"
            :icon="X"
            tone="danger"
          >
            <template v-if="payoutOverview" #sub>
              <span class="font-num font-semibold text-ink-700">{{ payoutOverview.failed.count }}</span> lệnh, tiền đã hoàn về ví kỹ thuật viên
            </template>
          </ConsoleStatCard>
        </section>

        <!-- Filter Status Bar -->
        <div class="flex flex-wrap items-center gap-2.5 rounded-2xl border border-ink-100 bg-white p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] sm:p-4">
          <select
            v-model="wdStatusFilter"
            aria-label="Trạng thái rút tiền"
            class="h-9 cursor-pointer rounded-xl border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt</option>
            <option value="PROCESSING">Đang chuyển tiền</option>
            <option value="SUCCESS">Đã chi tiền</option>
            <option value="FAILED">Chuyển thất bại</option>
            <option value="REJECTED">Đã từ chối</option>
          </select>
        </div>

        <ConsoleLoadError v-if="wdError" @retry="loadWithdrawals" />

        <!-- Withdrawals Table -->
        <div v-else class="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <div class="overflow-x-auto overscroll-x-contain">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b border-ink-100 bg-ink-50/70">
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Kỹ thuật viên</th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold text-ink-500">Số tiền</th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Tài khoản nhận</th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Trạng thái</th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Thời gian yêu cầu</th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-ink-500">Thời gian hoàn tất</th>
                  <th scope="col" class="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold text-ink-500">Thao tác</th>
                </tr>
              </thead>

              <tbody class="divide-y divide-ink-100/70">
                <tr v-if="wdLoading">
                  <td colspan="7" class="px-4 py-12 text-center text-sm text-ink-400">
                    <div class="inline-flex items-center gap-2">
                      <div class="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                      <span>Đang tải danh sách yêu cầu rút tiền...</span>
                    </div>
                  </td>
                </tr>

                <tr v-else-if="withdrawals.length === 0">
                  <td colspan="7" class="px-4 py-16 text-center text-sm text-ink-500">
                    <div class="mx-auto flex max-w-xs flex-col items-center justify-center gap-2">
                      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
                        <Coins :size="24" />
                      </div>
                      <p class="font-medium text-ink-800">Chưa có yêu cầu rút tiền nào.</p>
                    </div>
                  </td>
                </tr>

                <tr
                  v-for="row in withdrawals"
                  v-else
                  :key="row.id"
                  class="transition-colors hover:bg-brand-50/30"
                >
                  <!-- 1. Kỹ thuật viên (Avatar + Info) -->
                  <td class="px-4 py-3.5 align-middle">
                    <div class="flex items-center gap-3">
                      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100/80 text-xs font-bold text-brand-700">
                        {{ getInitials(row.technician?.fullName || 'KT') }}
                      </div>
                      <div class="min-w-0">
                        <div class="font-semibold text-ink-900 text-xs sm:text-sm">
                          {{ row.technician?.fullName || 'Kỹ thuật viên' }}
                        </div>
                        <div class="whitespace-nowrap font-num text-[11px] text-ink-500">
                          {{ row.technician?.phoneNumber || '—' }}
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- 2. Số tiền -->
                  <td class="px-4 py-3.5 text-right align-middle">
                    <span class="whitespace-nowrap font-num text-xs font-bold text-ink-900 sm:text-sm">
                      {{ formatCurrencyVND(row.amount) }}
                    </span>
                  </td>

                  <!-- 3. Tài khoản nhận -->
                  <td class="px-4 py-3.5 align-middle">
                    <div class="whitespace-nowrap text-xs font-medium text-ink-900">{{ row.bankName }}</div>
                    <div class="whitespace-nowrap text-[11px] text-ink-500">
                      <span class="font-num text-ink-700 font-medium">{{ row.bankAccountNumber }}</span> · {{ row.bankAccountName }}
                    </div>
                  </td>

                  <!-- 4. Trạng thái -->
                  <td class="px-4 py-3.5 align-middle">
                    <span
                      v-if="row.status === 'SUCCESS'"
                      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                    >
                      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Đã chi tiền
                    </span>
                    <span
                      v-else-if="row.status === 'PROCESSING'"
                      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                    >
                      <span class="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      Đang chuyển tiền
                    </span>
                    <span
                      v-else-if="row.status === 'PENDING'"
                      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                    >
                      <span class="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Chờ duyệt
                    </span>
                    <span
                      v-else-if="row.status === 'FAILED'"
                      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700"
                    >
                      <span class="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      Chuyển thất bại
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-200 bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-700"
                    >
                      {{ formatWithdrawalStatus(row.status).label }}
                    </span>

                    <div v-if="row.status === 'REJECTED' && row.rejectReason" class="mt-1 max-w-56 text-[11px] text-danger-600">
                      Lý do: {{ row.rejectReason }}
                    </div>
                    <div v-if="row.status === 'FAILED'" class="mt-1 max-w-56 text-[11px] text-danger-600">
                      {{ row.failureReason || 'Không chuyển được' }} · đã hoàn tiền vào ví
                    </div>
                    <div v-if="row.status === 'PROCESSING' && row.failureReason" class="mt-1 max-w-56 text-[11px] text-info-600">
                      {{ row.failureReason }}
                    </div>
                  </td>

                  <!-- 5. Thời gian yêu cầu -->
                  <td class="px-4 py-3.5 align-middle">
                    <span class="whitespace-nowrap font-num text-xs text-ink-600">
                      {{ formatDateTimeVN(row.requestedAt) }}
                    </span>
                  </td>

                  <!-- 6. Thời gian hoàn tất -->
                  <td class="px-4 py-3.5 align-middle">
                    <div v-if="row.status === 'SUCCESS'" class="whitespace-nowrap text-xs text-ink-600">
                      <span v-if="row.payoutBankReference" class="font-num font-medium text-ink-700">Mã giao dịch {{ row.payoutBankReference }}</span>
                      <span v-else-if="row.processedAt" class="font-num">{{ formatDateTimeVN(row.processedAt) }}</span>
                    </div>
                    <span v-else class="text-ink-400">—</span>
                  </td>

                  <!-- 7. Thao tác -->
                  <td class="px-4 py-3.5 text-right align-middle">
                    <div class="flex items-center justify-end gap-2">
                      <button
                        v-if="row.status === 'PROCESSING'"
                        type="button"
                        class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50 shadow-2xs"
                        :disabled="reconcilingId === row.id"
                        @click="handleReconcile(row)"
                      >
                        <RotateCcw v-if="reconcilingId === row.id" :size="12" class="animate-spin" />
                        <span>Kiểm tra lại</span>
                      </button>

                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50 shadow-2xs"
                        @click="viewTransactionsFromWd(row)"
                      >
                        <History :size="12" class="text-ink-500" />
                        <span>Lịch sử</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Footer Pagination -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-white px-5 py-3">
            <div class="text-xs text-ink-500">
              Hiển thị {{ withdrawals.length }} trong {{ wdTotal }} yêu cầu
            </div>
            <ConsolePagination
              :page="wdPage"
              :total-pages="wdTotalPages"
              :disabled="wdLoading"
              @update:page="(p) => { wdPage = p; loadWithdrawals(); }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: Config (Cấu hình ví kỹ thuật viên - Admin) -->
    <section
      v-else-if="activeTab === 'config' && isAdmin"
      class="animate-slide-up-delay-2 max-w-2xl rounded-2xl border border-ink-100 bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
    >
      <div class="border-b border-ink-100 pb-4">
        <h2 class="text-base font-bold text-ink-900">Thông số ví kỹ thuật viên</h2>
        <p class="mt-1 text-xs text-ink-500 sm:text-sm">Áp dụng ngay cho lời mời nhận việc và phí trừ khi hoàn thành đơn.</p>
      </div>

      <div v-if="configLoading" class="mt-5 space-y-3">
        <FhSkeleton height="40px" :count="2" />
      </div>
      <ConsoleLoadError v-else-if="configError" class="mt-5" @retry="loadConfig" />
      <form v-else class="mt-5 space-y-5" @submit.prevent="saveConfig">
        <Transition name="fh-fade-slide">
          <p
            v-if="configSuccessMsg"
            class="flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-success-800"
            role="status"
          >
            <CheckCircle2 :size="16" aria-hidden="true" />
            {{ configSuccessMsg }}
          </p>
        </Transition>

        <label :class="consoleLabel">
          <span>Ký quỹ tối thiểu (₫)</span>
          <input
            v-model.number="editMinBalance"
            type="number"
            min="0"
            max="100000000"
            step="1"
            inputmode="numeric"
            :class="consoleField"
            class="h-10 max-w-xs font-num !rounded-xl"
          />
          <span class="text-xs font-normal text-ink-500">Số dư thấp hơn mức này thì kỹ thuật viên không nhận lời mời mới.</span>
        </label>

        <label :class="consoleLabel">
          <span>Phí nền tảng (phần vạn)</span>
          <span class="flex max-w-xs items-center gap-3">
            <input
              v-model.number="editFeeRateBps"
              type="number"
              min="0"
              max="5000"
              step="1"
              inputmode="numeric"
              :class="consoleField"
              class="h-10 w-full font-num !rounded-xl"
            />
            <span class="whitespace-nowrap font-num font-semibold text-brand-700">= {{ (editFeeRateBps / 100).toFixed(1) }}%</span>
          </span>
          <span class="text-xs font-normal text-ink-500">1500 = 15%, trừ khi đơn hoàn thành.</span>
        </label>

        <Transition name="fh-fade-slide">
          <p
            v-if="configSaveError"
            class="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2 text-xs sm:text-sm text-danger-700"
            role="alert"
          >
            {{ configSaveError }}
          </p>
        </Transition>

        <div class="flex justify-end pt-2">
          <FhButton type="submit" variant="primary" size="sm" :loading="configSaving" class="!rounded-xl">
            Lưu thay đổi
          </FhButton>
        </div>
      </form>
    </section>

    <!-- Adjust balance modal (Admin) -->
    <Transition name="fh-modal">
      <div
        v-if="showAdjustModal && selectedWalletForAdjust"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/50 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-title"
        @click.self="showAdjustModal = false"
        @keydown.esc="showAdjustModal = false"
      >
        <div class="fh-modal-panel bg-white rounded-2xl border border-ink-100 max-w-md w-full p-6 shadow-2xl space-y-5">
          <div class="flex items-center justify-between border-b border-ink-100 pb-3">
            <h3 id="adjust-title" class="text-base font-bold text-ink-900">Điều chỉnh số dư</h3>
            <button
              type="button"
              class="rounded-xl p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 cursor-pointer"
              aria-label="Đóng"
              @click="showAdjustModal = false"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <dl class="space-y-1.5 rounded-xl border border-ink-100 bg-ink-50/70 p-3.5 text-xs sm:text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-ink-500">Kỹ thuật viên</dt>
              <dd class="font-medium text-ink-900">{{ selectedWalletForAdjust.technician.fullName }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-ink-500">Số dư hiện tại</dt>
              <dd class="whitespace-nowrap font-num font-bold text-ink-900">
                {{ formatCurrencyVND(selectedWalletForAdjust.balance) }}
              </dd>
            </div>
          </dl>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại điều chỉnh">
              <button
                type="button"
                role="radio"
                :aria-checked="adjustType === 'CREDIT'"
                class="whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                :class="adjustType === 'CREDIT' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'"
                @click="adjustType = 'CREDIT'"
              >
                + Cộng tiền
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="adjustType === 'DEBIT'"
                class="whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                :class="adjustType === 'DEBIT' ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'"
                @click="adjustType = 'DEBIT'"
              >
                - Trừ tiền
              </button>
            </div>

            <label :class="consoleLabel">
              <span>Số tiền (₫)</span>
              <input
                v-model.number="adjustAmount"
                type="number"
                min="1"
                max="100000000"
                step="1"
                inputmode="numeric"
                :class="consoleField"
                class="h-10 font-num !rounded-xl"
              />
            </label>

            <label :class="consoleLabel">
              <span>Lý do điều chỉnh</span>
              <textarea
                v-model="adjustReason"
                rows="3"
                placeholder="Nhập lý do điều chỉnh số dư"
                :class="consoleTextarea"
                class="!rounded-xl"
              />
            </label>

            <Transition name="fh-fade-slide">
              <p
                v-if="adjustError"
                class="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700"
                role="alert"
              >
                {{ adjustError }}
              </p>
            </Transition>

            <div class="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                class="cursor-pointer rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                @click="showAdjustModal = false"
              >
                Huỷ
              </button>
              <FhButton
                variant="primary"
                size="sm"
                :loading="adjustSubmitting"
                class="!rounded-xl"
                @click="handleAdjust"
              >
                Điều chỉnh
              </FhButton>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Popup Lịch sử ví kỹ thuật viên (Matching Reference Design 1) -->
    <TechnicianWalletHistoryModal
      :open="showTxModal"
      :technician="selectedTech"
      :transactions="techTransactions"
      :loading="techTxLoading"
      :error="techTxError"
      @close="showTxModal = false"
    />
  </div>
</template>
