<script setup lang="ts">
// Customer withdrawal (PO 14/10/2026): one step at a time, decided by the
// server's withdrawal-info. Identity check first (once), then a bank account
// in the verified name, then the amount (the whole balance by default, at
// least 10.000 ₫, no fee). The payout is immediate, no approval.
import { computed, ref, watch } from 'vue';
import { AlertCircle, CheckCircle2, Landmark } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import FhConfirmDialog from '../FhConfirmDialog.vue';
import FhMoney from '../FhMoney.vue';
import FhSkeleton from '../FhSkeleton.vue';
import {
  customerWalletApi,
  type CustomerWithdrawalInfo,
  type CustomerWithdrawalResult,
} from '../../api/customer-wallet.api';
import { customerVerificationApi } from '../../api/customer-verification.api';
import { useCacheUpdates, useCachedQuery } from '../../composables/useCachedQuery';
import { REFERENCE_STALE_TIME } from '../../lib/query-client';
import { affectedBy, queryKeys } from '../../lib/query-keys';
import { formatCurrencyVND, toBankAccountName } from '../../utils/formatters';
import { userFacingError, withoutCodes } from '../../utils/user-facing-error';

const KYC_LINK = '/app/kyc';

const cache = useCacheUpdates();
const infoQuery = useCachedQuery({
  key: queryKeys.wallet.customerWithdrawalInfo,
  fetch: () => customerWalletApi.withdrawalInfo(),
});
const info = computed<CustomerWithdrawalInfo | null>(() => infoQuery.data.value ?? null);
const loadError = computed(() =>
  infoQuery.error.value ? userFacingError(infoQuery.error.value, 'Chưa tải được thông tin rút tiền, vui lòng thử lại.') : '',
);

// ---- Bank account -----------------------------------------------------------
const editingBank = ref(false);
const showBankForm = computed(
  () => info.value?.kycStatus === 'verified' && (!info.value.bankAccount || editingBank.value),
);

const banksQuery = useCachedQuery({
  key: queryKeys.reference.customerBanks,
  fetch: () => customerWalletApi.listBanks(),
  enabled: showBankForm,
  staleTime: REFERENCE_STALE_TIME,
});
const banks = computed(() => banksQuery.data.value ?? []);

// The holder must be the verified person: the form starts with that name the way banks print it.
const identityQuery = useCachedQuery({
  key: queryKeys.identity.customer,
  fetch: () => customerVerificationApi.getMine(),
  enabled: showBankForm,
});
const verifiedName = computed(() => {
  const state = identityQuery.data.value;
  return state?.verification?.verifiedFullName || state?.profile.fullName || '';
});

const bankForm = ref({ bankBin: '', accountNumber: '', accountName: '' });
const bankError = ref('');
const bankSaving = ref(false);

function fillBankForm() {
  const account = info.value?.bankAccount;
  bankForm.value = {
    bankBin: account?.bankBin ?? '',
    accountNumber: account?.accountNumber ?? '',
    accountName: account?.accountName || toBankAccountName(verifiedName.value),
  };
  bankError.value = '';
}
watch(showBankForm, (open) => {
  if (open) fillBankForm();
}, { immediate: true });
watch(verifiedName, (name) => {
  if (name && !bankForm.value.accountName) bankForm.value.accountName = toBankAccountName(name);
});

function startEditBank() {
  editingBank.value = true;
  fillBankForm();
}

async function saveBank() {
  if (bankSaving.value) return;
  bankError.value = '';
  const accountNumber = bankForm.value.accountNumber.trim();
  const accountName = bankForm.value.accountName.trim();
  if (!bankForm.value.bankBin) {
    bankError.value = 'Vui lòng chọn ngân hàng.';
    return;
  }
  if (!/^\d{6,19}$/.test(accountNumber)) {
    bankError.value = 'Số tài khoản chỉ gồm chữ số, từ 6 đến 19 số.';
    return;
  }
  if (!accountName) {
    bankError.value = 'Vui lòng nhập tên chủ tài khoản.';
    return;
  }
  bankSaving.value = true;
  try {
    await customerWalletApi.saveBankAccount({ bankBin: bankForm.value.bankBin, accountNumber, accountName });
    await cache.refresh([queryKeys.wallet.customerWithdrawalInfo]);
    editingBank.value = false;
  } catch (err) {
    bankError.value = userFacingError(err, 'Chưa lưu được tài khoản ngân hàng, vui lòng thử lại.');
  } finally {
    bankSaving.value = false;
  }
}

/** Only the last four digits outside the edit form. */
const maskedAccount = computed(() => {
  const number = info.value?.bankAccount?.accountNumber ?? '';
  return number.length > 4 ? `••••${number.slice(-4)}` : number;
});

// ---- Amount -----------------------------------------------------------------
const amountText = ref<string | number>('');
const amountTouched = ref(false);
const amountError = ref('');
const confirming = ref(false);
const withdrawing = ref(false);
const withdrawError = ref('');
const result = ref<CustomerWithdrawalResult | null>(null);

const minimum = computed(() => info.value?.minimumAmount ?? 10_000);
const maximum = computed(() => info.value?.maximumAmount ?? 0);

// The whole balance by default; a new balance (after a withdrawal) resets it.
watch(
  () => info.value?.maximumAmount,
  (max) => {
    if (max === undefined) return;
    if (!amountTouched.value) amountText.value = max > 0 ? String(max) : '';
  },
  { immediate: true },
);

/** Why the withdraw button is off, as a note; '' when it can be pressed. */
const blockedNote = computed(() => {
  const value = info.value;
  if (!value) return '';
  if (value.openWithdrawal) return '';
  if (!value.payoutAvailable) return 'Rút tiền tạm thời chưa mở. Vui lòng quay lại sau.';
  if (value.maximumAmount < value.minimumAmount) return `Số dư cần từ ${formatCurrencyVND(value.minimumAmount)} để rút.`;
  return '';
});
const formDisabled = computed(() => !info.value || !!info.value.openWithdrawal || !!blockedNote.value || withdrawing.value);

const amount = computed(() => Number(String(amountText.value).replace(/[.,\s]/g, '')));

function askWithdraw() {
  amountError.value = '';
  withdrawError.value = '';
  result.value = null;
  if (formDisabled.value) return;
  const value = amount.value;
  if (!Number.isInteger(value) || value <= 0) {
    amountError.value = 'Vui lòng nhập số tiền hợp lệ.';
    return;
  }
  if (value < minimum.value) {
    amountError.value = `Số tiền rút tối thiểu ${formatCurrencyVND(minimum.value)}.`;
    return;
  }
  if (value > maximum.value) {
    amountError.value = `Số tiền rút tối đa ${formatCurrencyVND(maximum.value)}.`;
    return;
  }
  confirming.value = true;
}

const confirmText = computed(() => {
  const account = info.value?.bankAccount;
  return `Chuyển ${formatCurrencyVND(amount.value)} về ${account?.bankName ?? 'ngân hàng'} ${maskedAccount.value} (${account?.accountName ?? ''}). Tiền đi ngay, không mất phí; nếu ngân hàng không nhận, tiền được hoàn lại vào ví.`;
});

async function withdraw() {
  if (withdrawing.value) return;
  withdrawing.value = true;
  withdrawError.value = '';
  try {
    result.value = await customerWalletApi.withdraw(amount.value);
    confirming.value = false;
    amountTouched.value = false;
    // Money moved: balance, history and the next step are read again, never shown stale.
    await cache.refresh(affectedBy.walletChange);
  } catch (err) {
    confirming.value = false;
    // Refused before any money moved: the wallet is untouched.
    withdrawError.value = userFacingError(err, 'Chưa rút được tiền, vui lòng thử lại.');
  } finally {
    withdrawing.value = false;
  }
}

const fieldClass =
  'w-full h-11 rounded-xl border border-ink-200 bg-white px-3 text-base sm:text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500';
</script>

<template>
  <div class="space-y-3" data-testid="withdraw-panel">
    <h2 class="text-base font-semibold text-ink-900">Rút về tài khoản ngân hàng</h2>

    <div v-if="infoQuery.loading.value" class="space-y-2" aria-busy="true" aria-label="Đang tải thông tin rút tiền">
      <FhSkeleton height="16px" width="70%" />
      <FhSkeleton height="44px" />
    </div>

    <div v-else-if="loadError && !info" class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-ink-700">{{ loadError }}</p>
      <FhButton variant="secondary" size="sm" @click="infoQuery.refetch()">Thử lại</FhButton>
    </div>

    <template v-else-if="info">
      <!-- 1. Identity check, once -->
      <div v-if="info.kycStatus === 'none'" class="space-y-3" data-testid="withdraw-kyc-needed">
        <p class="text-sm text-ink-700 text-pretty">Lần rút đầu tiên cần xác minh danh tính bằng ảnh hai mặt CCCD. Chỉ cần làm một lần.</p>
        <router-link :to="KYC_LINK" class="inline-flex h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white whitespace-nowrap hover:bg-brand-700" data-testid="withdraw-kyc-link">Xác minh danh tính</router-link>
      </div>

      <div v-else-if="info.kycStatus === 'rejected'" class="space-y-3">
        <div role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800 flex items-start gap-2" data-testid="withdraw-kyc-rejected">
          <AlertCircle :size="16" class="shrink-0 mt-0.5 text-danger-600" />
          <div class="min-w-0 space-y-0.5">
            <p class="font-semibold">Hồ sơ xác minh chưa được duyệt</p>
            <p class="text-pretty">{{ info.kycRejectionReason || 'Ảnh hoặc thông tin chưa đúng. Vui lòng gửi lại.' }}</p>
          </div>
        </div>
        <router-link :to="KYC_LINK" class="inline-flex h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white whitespace-nowrap hover:bg-brand-700" data-testid="withdraw-kyc-link">Gửi lại hồ sơ</router-link>
      </div>

      <p v-else-if="info.kycStatus === 'pending'" class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 text-pretty" data-testid="withdraw-kyc-pending">
        Hồ sơ xác minh đang chờ duyệt. Bạn rút được tiền ngay khi FixHome duyệt xong.
      </p>

      <!-- 2. Bank account in the verified name -->
      <form v-else-if="showBankForm" class="space-y-3 text-sm" data-testid="withdraw-bank-form" novalidate @submit.prevent="saveBank">
        <p v-if="!info.bankAccount" class="text-ink-700 text-pretty">Khai báo tài khoản ngân hàng đứng tên bạn để nhận tiền.</p>
        <div class="space-y-1.5">
          <label for="cw-bank" class="block font-medium text-ink-700">Ngân hàng</label>
          <select id="cw-bank" v-model="bankForm.bankBin" data-testid="withdraw-bank-select" :class="fieldClass">
            <option value="" disabled>{{ banks.length ? 'Chọn ngân hàng' : 'Đang tải danh sách ngân hàng…' }}</option>
            <option v-for="b in banks" :key="b.bin" :value="b.bin">{{ b.shortName }} — {{ b.name }}</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <label for="cw-account-number" class="block font-medium text-ink-700">Số tài khoản</label>
          <input id="cw-account-number" v-model="bankForm.accountNumber" type="text" inputmode="numeric" maxlength="19" autocomplete="off" data-testid="withdraw-bank-number" :class="[fieldClass, 'font-num']" />
        </div>
        <div class="space-y-1.5">
          <label for="cw-account-name" class="block font-medium text-ink-700">Tên chủ tài khoản</label>
          <input id="cw-account-name" v-model="bankForm.accountName" type="text" maxlength="128" autocomplete="off" data-testid="withdraw-bank-name" :class="fieldClass" />
          <p class="text-ink-500 text-pretty">Phải trùng họ tên đã xác minh danh tính.</p>
        </div>
        <p v-if="bankError" role="alert" class="text-danger-700" data-testid="withdraw-bank-error">{{ bankError }}</p>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <FhButton v-if="info.bankAccount" variant="secondary" size="md" @click="editingBank = false">Huỷ</FhButton>
          <FhButton type="submit" size="md" :loading="bankSaving" data-testid="withdraw-bank-save">Lưu tài khoản</FhButton>
        </div>
      </form>

      <!-- 3. Amount and confirm -->
      <form v-else-if="info.bankAccount" class="space-y-3 text-sm" data-testid="withdraw-form" novalidate @submit.prevent="askWithdraw">
        <div class="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2.5">
          <Landmark :size="18" class="shrink-0 text-ink-500" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-ink-900 truncate" data-testid="withdraw-bank">{{ info.bankAccount.bankName }} · <span class="font-num whitespace-nowrap">{{ maskedAccount }}</span></p>
            <p class="text-ink-500 truncate">{{ info.bankAccount.accountName }}</p>
          </div>
          <button type="button" class="shrink-0 h-10 rounded-xl px-3 font-semibold text-brand-600 whitespace-nowrap hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" @click="startEditBank">Đổi</button>
        </div>

        <p v-if="info.openWithdrawal" class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-warning-800 text-pretty" data-testid="withdraw-open">
          Lệnh rút <FhMoney :amount="info.openWithdrawal.amount" /> đang được chuyển về ngân hàng. Bạn rút tiếp được khi lệnh này xong.
        </p>
        <p v-else-if="blockedNote" class="rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-warning-800 text-pretty" data-testid="withdraw-blocked">{{ blockedNote }}</p>

        <div class="space-y-1.5">
          <label for="cw-amount" class="block font-medium text-ink-700">Số tiền rút</label>
          <input
            id="cw-amount"
            v-model="amountText"
            type="number"
            inputmode="numeric"
            :min="minimum"
            :max="maximum"
            step="1000"
            :disabled="formDisabled"
            data-testid="withdraw-amount"
            :class="[fieldClass, 'font-num disabled:bg-ink-50 disabled:text-ink-400']"
            @input="amountTouched = true"
          />
          <p class="text-ink-500 text-pretty">Tối thiểu <FhMoney :amount="minimum" />, tối đa <FhMoney :amount="maximum" /> (toàn bộ số dư). Không mất phí.</p>
          <p v-if="amountError" role="alert" class="text-danger-700" data-testid="withdraw-amount-error">{{ amountError }}</p>
        </div>

        <p v-if="withdrawError" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-danger-800 text-pretty" data-testid="withdraw-error">{{ withdrawError }}</p>

        <FhButton type="submit" size="md" block :disabled="formDisabled" data-testid="withdraw-submit">Rút tiền</FhButton>
      </form>

      <!-- How the last withdrawal ended -->
      <div v-if="result" data-testid="withdraw-result" role="status">
        <p v-if="result.status === 'SUCCESS'" class="rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800 flex items-start gap-2">
          <CheckCircle2 :size="16" class="shrink-0 mt-0.5" />
          <span class="text-pretty">Đã chuyển <FhMoney :amount="result.amount" /> về {{ result.bankName }} <span class="font-num whitespace-nowrap">{{ result.bankAccountNumber }}</span>.</span>
        </p>
        <p v-else-if="result.status === 'FAILED'" class="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800 text-pretty">
          Chưa chuyển được <FhMoney :amount="result.amount" /><template v-if="withoutCodes(result.failureReason)">: {{ withoutCodes(result.failureReason) }}</template>. Tiền đã được hoàn lại vào ví.
        </p>
        <p v-else class="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 text-pretty">
          Ngân hàng đang xử lý lệnh rút <FhMoney :amount="result.amount" />. Kết quả cập nhật trong lịch sử rút tiền.
        </p>
      </div>
    </template>

    <FhConfirmDialog
      :open="confirming"
      :loading="withdrawing"
      :danger="false"
      title="Rút tiền về ngân hàng?"
      :consequence="confirmText"
      confirm-text="Rút tiền"
      cancel-text="Quay lại"
      @confirm="withdraw"
      @cancel="confirming = false"
    />
  </div>
</template>
