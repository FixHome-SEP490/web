<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { CheckCircle2, AlertCircle, X } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import {
  walletApi,
  type WalletListItem,
  type WithdrawalRequest,
  type WalletTransaction,
  type WalletConfig,
  type PayoutOverview,
} from '../../api/wallet.api';
import { FhButton, FhStatusPill, FhSkeleton } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import ConsoleSearch from '../../components/console/ConsoleSearch.vue';
import ConsoleTabs from '../../components/console/ConsoleTabs.vue';
import ConsolePagination from '../../components/console/ConsolePagination.vue';
import ConsoleTable, { type ConsoleColumn } from '../../components/console/ConsoleTable.vue';
import { CONSOLE_LOAD_ERROR, consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
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
const walletsError = ref(false);
const walletSearch = ref('');
const walletEligibilityFilter = ref<'ALL' | 'ELIGIBLE' | 'INELIGIBLE'>('ALL');
const walletsPage = ref(1);
const walletsTotalPages = ref(1);
const walletsTotal = ref(0);

const walletsColumns: ConsoleColumn[] = [
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'balance', label: 'Số dư', align: 'right' },
  { key: 'eligibleForJobs', label: 'Nhận việc', hideBelow: 'lg' },
  { key: 'updatedAt', label: 'Cập nhật', hideBelow: 'xl' },
  { key: 'actions', label: '', align: 'right' },
];

// Tab 2: Withdrawals State
const withdrawals = ref<WithdrawalRequest[]>([]);
const wdLoading = ref(false);
const wdError = ref(false);
const wdStatusFilter = ref<string>('ALL');
const wdPage = ref(1);
const wdTotalPages = ref(1);
const wdTotal = ref(0);

const wdColumns: ConsoleColumn[] = [
  { key: 'requestedAt', label: 'Thời gian', hideBelow: 'xl' },
  { key: 'technician', label: 'Kỹ thuật viên' },
  { key: 'amount', label: 'Số tiền', align: 'right' },
  { key: 'bankInfo', label: 'Tài khoản nhận', hideBelow: 'xl' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'actions', label: '', align: 'right' },
];

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
const techTxError = ref(false);

const tabs = computed(() => [
  { key: 'wallets' as const, label: 'Ví', count: walletsTotal.value },
  { key: 'withdrawals' as const, label: 'Yêu cầu rút tiền', count: wdTotal.value },
  ...(isAdmin.value ? [{ key: 'config' as const, label: 'Cấu hình' }] : []),
]);

const refreshActiveTab = () => {
  if (activeTab.value === 'wallets') void loadWallets();
  else if (activeTab.value === 'withdrawals') {
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
      status: walletEligibilityFilter.value === 'ALL' ? undefined : walletEligibilityFilter.value,
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
  try {
    payoutOverview.value = await walletApi.getPayoutOverview();
  } catch {
    // The overview is extra context; the withdrawal list still loads on its own.
    payoutOverview.value = null;
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
  if (!adjustReason.value.trim() || adjustReason.value.trim().length < 10) {
    adjustError.value = 'Ghi lý do điều chỉnh, tối thiểu 10 ký tự.';
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
  <div class="space-y-5">
    <ConsolePageHeader title="Ví kỹ thuật viên">
      <template #actions>
        <ConsoleMoreMenu>
          <ConsoleMenuItem @click="refreshActiveTab">Làm mới</ConsoleMenuItem>
        </ConsoleMoreMenu>
      </template>
    </ConsolePageHeader>

    <ConsoleTabs v-model="activeTab" :tabs="tabs" />

    <!-- Wallets -->
    <div v-if="activeTab === 'wallets'" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <ConsoleSearch
          v-model="walletSearch"
          placeholder="Tìm tên, số điện thoại, email"
          label="Tìm ví kỹ thuật viên"
          @update:model-value="walletsPage = 1; loadWallets()"
        />
        <select v-model="walletEligibilityFilter" :class="consoleField" aria-label="Điều kiện nhận việc">
          <option value="ALL">Mọi điều kiện</option>
          <option value="ELIGIBLE">Đủ điều kiện nhận việc</option>
          <option value="INELIGIBLE">Dưới mức tối thiểu</option>
        </select>
      </div>

      <ConsoleLoadError v-if="walletsError" @retry="loadWallets" />
      <ConsoleTable
        v-else
        :columns="walletsColumns"
        :rows="wallets"
        :loading="walletsLoading"
        empty-text="Không có ví kỹ thuật viên nào phù hợp."
      >
        <template #cell-technician="{ row }">
          <div class="font-medium text-ink-900">{{ row.technician.fullName }}</div>
          <div class="truncate text-xs text-ink-500" :title="row.technician.email">
            <span class="whitespace-nowrap font-num">{{ row.technician.phoneNumber }}</span> · {{ row.technician.email }}
          </div>
        </template>
        <template #cell-balance="{ row }">
          <span class="whitespace-nowrap font-num font-semibold" :class="row.balance < 0 ? 'text-rose-600' : 'text-ink-900'">
            {{ formatCurrencyVND(row.balance) }}
          </span>
        </template>
        <template #cell-eligibleForJobs="{ row }">
          <span
            v-if="row.eligibleForJobs"
            class="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          >Đủ điều kiện</span>
          <span
            v-else
            class="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
          >Dưới mức ký quỹ</span>
        </template>
        <template #cell-updatedAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-500">{{ formatDateTimeVN(row.updatedAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-2">
            <FhButton variant="secondary" size="sm" @click="viewTransactions(row)">Lịch sử</FhButton>
            <ConsoleMoreMenu v-if="isAdmin" label="Thao tác khác với ví">
              <ConsoleMenuItem @click="openAdjustModal(row)">Điều chỉnh số dư</ConsoleMenuItem>
            </ConsoleMoreMenu>
          </div>
        </template>
      </ConsoleTable>
      <ConsolePagination :page="walletsPage" :total-pages="walletsTotalPages" :disabled="walletsLoading" @update:page="(p) => { walletsPage = p; loadWallets(); }" />
    </div>

    <!-- Withdrawals -->
    <div v-else-if="activeTab === 'withdrawals'" class="space-y-4">
      <template v-if="payoutOverview">
        <p
          v-if="payoutOverview.provider === 'disabled'"
          class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700"
          role="alert"
        >
          <AlertCircle :size="16" class="shrink-0" aria-hidden="true" />
          Chưa cấu hình payOS nên chưa thể chi tiền rút cho kỹ thuật viên.
        </p>
        <section class="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Tổng quan chi tiền">
          <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
            <div class="whitespace-nowrap text-sm text-ink-500">Ví nguồn chi hộ</div>
            <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-ink-900">
              {{ payoutOverview.sourceBalance === null ? 'Không đọc được' : formatCurrencyVND(payoutOverview.sourceBalance) }}
            </div>
            <div class="mt-0.5 text-xs text-ink-500">{{ payoutOverview.provider === 'disabled' ? 'Chưa cấu hình payOS' : 'Ví payOS dùng để chi hộ' }}</div>
          </div>
          <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
            <div class="whitespace-nowrap text-sm text-ink-500">Đã chuyển cho kỹ thuật viên</div>
            <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-success-600">{{ formatCurrencyVND(payoutOverview.paidOut.amount) }}</div>
            <div class="mt-0.5 text-xs text-ink-500">{{ payoutOverview.paidOut.count }} lệnh thành công</div>
          </div>
          <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
            <div class="whitespace-nowrap text-sm text-ink-500">Đang chuyển</div>
            <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-info-600">{{ formatCurrencyVND(payoutOverview.processing.amount) }}</div>
            <div class="mt-0.5 text-xs text-ink-500">{{ payoutOverview.processing.count }} lệnh chờ payOS xác nhận</div>
          </div>
          <div class="rounded-[var(--radius-md)] border border-ink-200 bg-white p-4">
            <div class="whitespace-nowrap text-sm text-ink-500">Chuyển thất bại</div>
            <div class="mt-1 whitespace-nowrap font-num text-xl font-semibold text-danger-600">{{ formatCurrencyVND(payoutOverview.failed.amount) }}</div>
            <div class="mt-0.5 text-xs text-ink-500">{{ payoutOverview.failed.count }} lệnh, tiền đã hoàn về ví kỹ thuật viên</div>
          </div>
        </section>
      </template>

      <div class="flex flex-wrap items-center gap-2">
        <select v-model="wdStatusFilter" :class="consoleField" aria-label="Trạng thái rút tiền">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="PROCESSING">Đang chuyển tiền</option>
          <option value="SUCCESS">Đã chi tiền</option>
          <option value="FAILED">Chuyển thất bại</option>
          <option value="REJECTED">Đã từ chối</option>
        </select>
      </div>

      <ConsoleLoadError v-if="wdError" @retry="loadWithdrawals" />
      <ConsoleTable
        v-else
        :columns="wdColumns"
        :rows="withdrawals"
        :loading="wdLoading"
        empty-text="Chưa có yêu cầu rút tiền nào."
      >
        <template #cell-requestedAt="{ row }">
          <span class="whitespace-nowrap font-num text-ink-600">{{ formatDateTimeVN(row.requestedAt) }}</span>
        </template>
        <template #cell-technician="{ row }">
          <div class="whitespace-nowrap font-medium text-ink-900">{{ row.technician?.fullName || 'Kỹ thuật viên' }}</div>
          <div class="whitespace-nowrap font-num text-xs text-ink-500">{{ row.technician?.phoneNumber || '—' }}</div>
        </template>
        <template #cell-amount="{ row }">
          <span class="whitespace-nowrap font-num font-semibold text-ink-900">{{ formatCurrencyVND(row.amount) }}</span>
        </template>
        <template #cell-bankInfo="{ row }">
          <div class="whitespace-nowrap text-ink-900">{{ row.bankName }}</div>
          <div class="whitespace-nowrap text-xs text-ink-500"><span class="font-num">{{ row.bankAccountNumber }}</span> · {{ row.bankAccountName }}</div>
        </template>
        <template #cell-status="{ row }">
          <FhStatusPill :status="row.status" :label="formatWithdrawalStatus(row.status).label" />
          <div v-if="row.status === 'REJECTED' && row.rejectReason" class="mt-1 max-w-56 text-xs text-rose-600">Lý do: {{ row.rejectReason }}</div>
          <div v-if="row.status === 'FAILED'" class="mt-1 max-w-56 text-xs text-rose-600">{{ row.failureReason || 'Không chuyển được' }} · đã hoàn tiền vào ví</div>
          <div v-if="row.status === 'PROCESSING' && row.failureReason" class="mt-1 max-w-56 text-xs text-info-600">{{ row.failureReason }}</div>
          <div v-if="row.status === 'SUCCESS'" class="mt-1 whitespace-nowrap text-xs text-ink-500">
            <template v-if="row.payoutBankReference">Mã giao dịch <span class="font-num font-medium text-ink-700">{{ row.payoutBankReference }}</span></template>
            <template v-else-if="row.processedAt"><span class="font-num">{{ formatDateTimeVN(row.processedAt) }}</span></template>
          </div>
        </template>
        <template #cell-actions="{ row }">
          <FhButton
            v-if="row.status === 'PROCESSING'"
            variant="secondary"
            size="sm"
            :loading="reconcilingId === row.id"
            @click="handleReconcile(row)"
          >Kiểm tra lại</FhButton>
        </template>
      </ConsoleTable>
      <ConsolePagination :page="wdPage" :total-pages="wdTotalPages" :disabled="wdLoading" @update:page="(p) => { wdPage = p; loadWithdrawals(); }" />
    </div>

    <!-- Wallet settings (admin) -->
    <section v-else-if="activeTab === 'config' && isAdmin" class="max-w-2xl rounded-[var(--radius-md)] border border-ink-200 bg-white p-6">
      <h2 class="text-base font-semibold text-ink-900">Thông số ví kỹ thuật viên</h2>
      <p class="mt-1 text-sm text-ink-500">Áp dụng ngay cho lời mời nhận việc và phí trừ khi hoàn thành đơn.</p>

      <div v-if="configLoading" class="mt-5 space-y-3"><FhSkeleton height="40px" :count="2" /></div>
      <ConsoleLoadError v-else-if="configError" class="mt-5" @retry="loadConfig" />
      <form v-else class="mt-5 space-y-5" @submit.prevent="saveConfig">
        <p v-if="configSuccessMsg" class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          <CheckCircle2 :size="16" aria-hidden="true" /> {{ configSuccessMsg }}
        </p>
        <label :class="consoleLabel">
          Ký quỹ tối thiểu (₫)
          <input v-model.number="editMinBalance" type="number" min="0" step="50000" inputmode="numeric" :class="consoleField" class="h-10 max-w-xs font-num" />
          <span class="text-xs font-normal text-ink-500">Số dư thấp hơn mức này thì kỹ thuật viên không nhận lời mời mới.</span>
        </label>
        <label :class="consoleLabel">
          Phí nền tảng (phần vạn)
          <span class="flex max-w-xs items-center gap-3">
            <input v-model.number="editFeeRateBps" type="number" min="0" max="5000" step="100" inputmode="numeric" :class="consoleField" class="h-10 w-full font-num" />
            <span class="whitespace-nowrap font-num font-semibold text-brand-700">= {{ (editFeeRateBps / 100).toFixed(1) }}%</span>
          </span>
          <span class="text-xs font-normal text-ink-500">1500 = 15%, trừ khi đơn hoàn thành.</span>
        </label>
        <p v-if="configSaveError" class="text-sm text-danger-600" role="alert">{{ configSaveError }}</p>
        <div class="flex justify-end">
          <FhButton type="submit" variant="primary" size="sm" :loading="configSaving">Lưu thay đổi</FhButton>
        </div>
      </form>
    </section>

    <!-- Adjust balance (admin) -->
    <div
      v-if="showAdjustModal && selectedWalletForAdjust"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-title"
      @keydown.esc="showAdjustModal = false"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
        <div class="flex items-center justify-between">
          <h3 id="adjust-title" class="text-base font-semibold text-ink-900">Điều chỉnh số dư</h3>
          <button type="button" class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="showAdjustModal = false">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <dl class="space-y-1.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Kỹ thuật viên</dt><dd class="font-medium text-ink-900">{{ selectedWalletForAdjust.technician.fullName }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Số dư hiện tại</dt><dd class="whitespace-nowrap font-num font-semibold text-ink-900">{{ formatCurrencyVND(selectedWalletForAdjust.balance) }}</dd></div>
        </dl>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại điều chỉnh">
            <button
              type="button"
              role="radio"
              :aria-checked="adjustType === 'CREDIT'"
              class="whitespace-nowrap rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors"
              :class="adjustType === 'CREDIT' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'"
              @click="adjustType = 'CREDIT'"
            >Cộng tiền</button>
            <button
              type="button"
              role="radio"
              :aria-checked="adjustType === 'DEBIT'"
              class="whitespace-nowrap rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors"
              :class="adjustType === 'DEBIT' ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'"
              @click="adjustType = 'DEBIT'"
            >Trừ tiền</button>
          </div>
          <label :class="consoleLabel">
            Số tiền (₫)
            <input v-model.number="adjustAmount" type="number" min="1000" step="10000" inputmode="numeric" :class="consoleField" class="h-10 font-num" />
          </label>
          <label :class="consoleLabel">
            Lý do
            <textarea v-model="adjustReason" rows="3" placeholder="Tối thiểu 10 ký tự" :class="consoleTextarea" />
          </label>
          <p v-if="adjustError" class="text-sm text-danger-600" role="alert">{{ adjustError }}</p>
          <div class="flex items-center justify-end gap-2">
            <FhButton variant="secondary" size="sm" @click="showAdjustModal = false">Huỷ</FhButton>
            <FhButton variant="primary" size="sm" :loading="adjustSubmitting" @click="handleAdjust">Điều chỉnh</FhButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Wallet history -->
    <div
      v-if="showTxModal && selectedTech"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-title"
      @keydown.esc="showTxModal = false"
    >
      <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 id="tx-title" class="text-base font-semibold text-ink-900">Lịch sử ví: {{ selectedTech.name }}</h3>
            <p class="text-sm text-ink-500">Số dư <span class="whitespace-nowrap font-num font-semibold text-ink-900">{{ formatCurrencyVND(selectedTech.balance) }}</span></p>
          </div>
          <button type="button" class="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Đóng" @click="showTxModal = false">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>

        <FhSkeleton v-if="techTxLoading" height="44px" :count="5" />
        <p v-else-if="techTxError" class="py-8 text-center text-sm text-ink-700">{{ CONSOLE_LOAD_ERROR }}</p>
        <p v-else-if="techTransactions.length === 0" class="py-8 text-center text-sm text-ink-500">Chưa có giao dịch nào.</p>
        <ul v-else class="flex-1 overflow-y-auto divide-y divide-ink-100 pr-1">
          <li v-for="tx in techTransactions" :key="tx.id" class="flex items-center justify-between gap-4 py-3 text-sm">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-x-2">
                <span class="font-medium text-ink-900">{{ formatWalletTxType(tx.type, tx).label }}</span>
                <span class="whitespace-nowrap font-num text-xs text-ink-500">{{ formatDateTimeVN(tx.createdAt) }}</span>
              </div>
              <p class="text-xs text-ink-500">{{ tx.description || 'Giao dịch ví' }}</p>
              <div class="text-xs text-ink-500">Số dư sau <span class="whitespace-nowrap font-num font-medium">{{ formatCurrencyVND(tx.balanceAfter) }}</span></div>
            </div>
            <div
              class="shrink-0 whitespace-nowrap text-right font-num font-semibold"
              :class="formatWalletTxType(tx.type, tx).isCredit ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ formatWalletTxType(tx.type, tx).isCredit ? '+' : '-' }}{{ formatCurrencyVND(tx.amount) }}
            </div>
          </li>
        </ul>

        <div class="flex justify-end">
          <FhButton variant="secondary" size="sm" @click="showTxModal = false">Đóng</FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
