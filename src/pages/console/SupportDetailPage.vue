<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckCircle2, ExternalLink } from 'lucide-vue-next';
import { ordersApi } from '../../api/orders.api';
import TechnicianReplacementPanel from '../../components/console/TechnicianReplacementPanel.vue';
import SupportCaseContext from '../../components/console/SupportCaseContext.vue';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
import { useRoute, useRouter } from 'vue-router';
import {
  FhButton,
  FhCard,
  FhConfirmDialog,
  FhMoney,
  FhSkeleton,
  FhStatusPill,
} from '../../components';
import {
  supportCasesApi,
  type SupportCaseDetail,
  type SupportCaseFinalStatus,
  type SupportCaseResolvePayload,
} from '../../api/support-cases.api';
import {
  formatSupportDate,
  getSupportErrorMessage,
  isCashCase,
  isSafeEvidenceLink,
  isResponseOverdue,
  liablePartyLabels,
  REFUND_CASE_TYPES,
  resolutionCodeLabels,
  cashResolutionCodeLabels,
  CASH_CONFIRMED_BY_MANAGER,
  supportCaseStatusLabels,
  supportCaseTypeLabels,
} from './support-cases.utils';

const route = useRoute();
const router = useRouter();
const caseId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));
const supportCase = ref<SupportCaseDetail | null>(null);
const loading = ref(true);
const error = ref('');
const successMessage = ref('');
let latestRequest = 0;

const finalStatus = ref<SupportCaseFinalStatus>('resolved');
const resolutionCode = ref('');
const resolutionReason = ref('');
const evidenceRefsText = ref('');
const formError = ref('');
const showConfirm = ref(false);
const pendingPayload = ref<SupportCaseResolvePayload | null>(null);
const submitting = ref(false);
const liableParty = ref<'' | 'technician' | 'customer' | 'platform' | 'shared'>('');
const amountText = ref<string | number>('');
const actionBusy = ref(false);

const usesStandardCodes = computed(() => !!supportCase.value && !isCashCase(supportCase.value.caseType));
// Settling cash only makes sense when the case is resolved, not rejected.
const codeLabels = computed<Record<string, string>>(() => {
  if (usesStandardCodes.value) {
    if (REFUND_CASE_TYPES.includes(supportCase.value!.caseType)) return resolutionCodeLabels;
    return Object.fromEntries(Object.entries(resolutionCodeLabels).filter(([code]) => code !== 'refund_to_wallet'));
  }
  if (finalStatus.value === 'rejected') return { no_action: cashResolutionCodeLabels.no_action };
  return cashResolutionCodeLabels;
});
// Refunds go into the customer's wallet (PO 08/10/2026): an amount is required and the case is accepted.
// FixHome bears the refund (PO 09/10/2026), so the liable party starts at the platform.
const refundsToWallet = computed(() => usesStandardCodes.value && resolutionCode.value === 'refund_to_wallet');
watch(refundsToWallet, (refunds) => {
  if (refunds && !liableParty.value) liableParty.value = 'platform';
});
const settlesCash = computed(() => !usesStandardCodes.value && resolutionCode.value === CASH_CONFIRMED_BY_MANAGER);
watch(codeLabels, (labels) => {
  if (resolutionCode.value && !(resolutionCode.value in labels)) resolutionCode.value = '';
});
const canHold = computed(() => !!supportCase.value?.serviceOrderId && !isTerminal.value);
const overdue = computed(() =>
  supportCase.value ? isResponseOverdue(supportCase.value.status, supportCase.value.respondBy) : false,
);

const isTerminal = computed(() =>
  supportCase.value ? ['resolved', 'rejected'].includes(supportCase.value.status) : false,
);

async function loadCase(id: string) {
  const requestId = ++latestRequest;
  supportCase.value = null;
  loading.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    supportCase.value = await supportCasesApi.getCase(id);
  } catch {
    if (requestId !== latestRequest) return;
    // A failed load shows one plain sentence and a retry, never the server's text.
    error.value = 'load';
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

// "Cần thay đổi thợ" cases get their own handling (PO 08/10/2026).
const isReplacementCase = computed(() => supportCase.value?.caseType === 'technician_replacement' && !!supportCase.value?.serviceOrderId);
async function onReplacementDone(message: string) {
  const id = supportCase.value?.id;
  if (!id) return;
  await loadCase(id);
  successMessage.value = message;
}

async function runAction(action: () => Promise<SupportCaseDetail>, success: string) {
  if (actionBusy.value) return;
  actionBusy.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    supportCase.value = await action();
    successMessage.value = success;
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Chưa xác nhận được kết quả. Vui lòng tải lại trước khi thực hiện lại.');
  } finally {
    actionBusy.value = false;
  }
}

const startReview = () => supportCase.value
  && runAction(() => supportCasesApi.startReview(supportCase.value!.id), 'Bạn đã nhận xử lý case này.');

const toggleHold = () => {
  const current = supportCase.value;
  if (!current) return;
  return runAction(
    () => supportCasesApi.setHold(current.id, !current.holdCompletion),
    current.holdCompletion ? 'Đã bỏ giữ hoàn tất đơn.' : 'Đơn sẽ không tự hoàn tất cho đến khi case được xử lý hoặc bạn bỏ giữ.',
  );
};

async function retryCompletion() {
  const orderId = supportCase.value?.serviceOrderId;
  if (!orderId || actionBusy.value) return;
  actionBusy.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const result = await ordersApi.retryCompletion(orderId);
    successMessage.value = result.completed
      ? 'Đơn đã được hoàn tất.'
      : 'Đơn chưa đủ điều kiện hoàn tất (thiếu xác nhận của khách hoặc thanh toán).';
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Chưa kiểm tra lại được, vui lòng thử lại.');
  } finally {
    actionBusy.value = false;
  }
}

function buildResolvePayload(): SupportCaseResolvePayload | null {
  const code = resolutionCode.value.trim();
  const reason = resolutionReason.value.trim();
  const evidenceRefs = evidenceRefsText.value
    .split(/\r?\n/)
    .map((ref) => ref.trim())
    .filter(Boolean);

  if (!code) {
    formError.value = 'Chọn kết quả xử lý.';
    return null;
  }
  if (code.length > 128) {
    formError.value = 'Kết quả xử lý không hợp lệ.';
    return null;
  }
  if (!(code in codeLabels.value)) {
    formError.value = 'Vui lòng chọn kết quả xử lý trong danh sách.';
    return null;
  }
  const rawAmount = String(amountText.value ?? '').trim();
  const amount = rawAmount === '' ? undefined : Number(rawAmount);
  if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
    formError.value = 'Số tiền phải là số nguyên không âm.';
    return null;
  }
  if (refundsToWallet.value && (!amount || amount <= 0)) {
    formError.value = 'Nhập số tiền hoàn vào ví khách (lớn hơn 0).';
    return null;
  }
  if (refundsToWallet.value && finalStatus.value !== 'resolved') {
    formError.value = 'Hoàn tiền vào ví chỉ dùng khi chấp nhận khiếu nại (Đã giải quyết).';
    return null;
  }
  if (reason.length < 10) {
    formError.value = 'Lý do xử lý phải có ít nhất 10 ký tự.';
    return null;
  }
  if (reason.length > 2000) {
    formError.value = 'Lý do xử lý không được vượt quá 2000 ký tự.';
    return null;
  }
  if (evidenceRefs.length > 20) {
    formError.value = 'Tối đa 20 bằng chứng.';
    return null;
  }
  if (evidenceRefs.some((ref) => ref.length > 500)) {
    formError.value = 'Mỗi bằng chứng tối đa 500 ký tự.';
    return null;
  }

  const payload: SupportCaseResolvePayload = {
    finalStatus: finalStatus.value,
    resolutionCode: code,
    reason,
  };
  if (evidenceRefs.length > 0) payload.evidenceRefs = evidenceRefs;
  if (usesStandardCodes.value) {
    if (liableParty.value) payload.liableParty = liableParty.value;
    if (amount !== undefined) payload.amount = amount;
  }
  return payload;
}

function submitResolution() {
  if (!supportCase.value || isTerminal.value || submitting.value) return;
  formError.value = '';
  const payload = buildResolvePayload();
  if (!payload) return;
  pendingPayload.value = payload;
  showConfirm.value = true;
}

function cancelResolution() {
  if (submitting.value) return;
  showConfirm.value = false;
  pendingPayload.value = null;
}

async function confirmResolution() {
  if (!supportCase.value || !pendingPayload.value || submitting.value || isTerminal.value) return;
  submitting.value = true;
  error.value = '';
  formError.value = '';
  try {
    supportCase.value = await supportCasesApi.resolveCase(supportCase.value.id, pendingPayload.value);
    successMessage.value = 'Đã lưu kết quả xử lý.';
    showConfirm.value = false;
    pendingPayload.value = null;
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Chưa lưu được kết quả, vui lòng thử lại.');
    showConfirm.value = false;
  } finally {
    submitting.value = false;
  }
}

const confirmConsequence = computed(() => {
  const status = pendingPayload.value?.finalStatus === 'rejected' ? 'Từ chối' : 'Đã giải quyết';
  const outcome = resolutionLabel(pendingPayload.value?.resolutionCode);
  return `Yêu cầu sẽ đóng với trạng thái "${status}", kết quả "${outcome}".`;
});

function resolutionLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return resolutionCodeLabels[code] ?? cashResolutionCodeLabels[code] ?? 'Kết quả khác';
}

function openEvidence(refValue: string) {
  if (!isSafeEvidenceLink(refValue)) return;
  window.open(refValue, '_blank', 'noopener,noreferrer');
}

watch(caseId, (id) => {
  if (id) void loadCase(id);
}, { immediate: true });
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 pb-12">
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <FhSkeleton height="14px" width="140px" />
      <FhSkeleton height="28px" width="320px" />
      <FhSkeleton height="96px" :count="3" rounded="md" />
    </div>

    <template v-else-if="error && !supportCase">
      <ConsolePageHeader title="Chi tiết yêu cầu hỗ trợ" back-to="/console/support" back-label="Yêu cầu hỗ trợ" />
      <ConsoleLoadError @retry="loadCase(caseId)" />
    </template>

    <template v-else-if="supportCase">
      <ConsolePageHeader :title="supportCaseTypeLabels[supportCase.caseType]" back-to="/console/support" back-label="Yêu cầu hỗ trợ">
        <template #badges>
          <FhStatusPill :status="supportCase.status" :label="supportCaseStatusLabels[supportCase.status]" />
          <span v-if="supportCase.isUrgent && !isTerminal" class="whitespace-nowrap rounded bg-danger-50 px-2 py-0.5 text-xs font-medium text-danger-700">Cần xử lý ngay</span>
          <span v-if="overdue" class="whitespace-nowrap rounded bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">Quá hạn phản hồi</span>
          <span v-if="supportCase.holdCompletion" class="whitespace-nowrap rounded bg-info-50 px-2 py-0.5 text-xs font-medium text-info-600">Đang giữ đơn</span>
        </template>
        <template #meta>
          <p class="mt-2 max-w-3xl text-sm text-ink-700 text-pretty">{{ supportCase.reason }}</p>
        </template>
        <template #actions>
          <FhButton v-if="!isTerminal && supportCase.status === 'open'" size="sm" :loading="actionBusy" :disabled="actionBusy" @click="startReview">
            Nhận xử lý case này
          </FhButton>
          <ConsoleMoreMenu v-if="canHold || supportCase.serviceOrderId || isCashCase(supportCase.caseType)">
            <ConsoleMenuItem v-if="canHold" :disabled="actionBusy" @click="toggleHold">
              {{ supportCase.holdCompletion ? 'Bỏ giữ hoàn tất đơn' : 'Giữ đơn không tự hoàn tất' }}
            </ConsoleMenuItem>
            <ConsoleMenuItem v-if="canHold && !supportCase.holdCompletion" :disabled="actionBusy" @click="retryCompletion">
              Kiểm tra lại hoàn tất đơn
            </ConsoleMenuItem>
            <ConsoleMenuItem v-if="supportCase.serviceOrderId" @click="router.push(`/console/orders/${supportCase.serviceOrderId}`)">
              Xem đơn sửa chữa
            </ConsoleMenuItem>
            <ConsoleMenuItem
              v-if="isCashCase(supportCase.caseType)"
              @click="router.push(`/console/support/cash/${encodeURIComponent(supportCase.id)}`)"
            >
              Xem đối soát tiền mặt
            </ConsoleMenuItem>
          </ConsoleMoreMenu>
        </template>
      </ConsolePageHeader>

      <div v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
        {{ error }}
      </div>
      <div v-if="successMessage" class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
        <CheckCircle2 :size="16" aria-hidden="true" />
        {{ successMessage }}
      </div>

      <TechnicianReplacementPanel v-if="isReplacementCase && !isTerminal" :support-case="supportCase" @done="onReplacementDone" />

      <div class="grid gap-6 lg:grid-cols-2">
        <FhCard title="Thông tin">
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Tạo lúc</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.createdAt) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Cập nhật</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.updatedAt) }}</dd></div>
            <div v-if="supportCase.respondBy" class="flex justify-between gap-3"><dt class="text-ink-500">Hạn phản hồi</dt><dd class="whitespace-nowrap font-num" :class="overdue ? 'text-warning-700' : 'text-ink-800'">{{ formatSupportDate(supportCase.respondBy) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-500">Người xử lý</dt><dd class="text-ink-800">{{ supportCase.assignedManagerId ? 'Đã có người nhận' : 'Chưa có người nhận' }}</dd></div>
          </dl>
          <div v-if="supportCase.description" class="mt-4 border-t border-ink-100 pt-4">
            <div class="text-sm text-ink-500">Mô tả thêm</div>
            <p class="mt-1 text-sm text-ink-800 text-pretty">{{ supportCase.description }}</p>
          </div>
        </FhCard>

        <FhCard title="Bằng chứng">
          <ul v-if="supportCase.evidenceRefs?.length" class="space-y-2 text-sm">
            <li v-for="(refValue, idx) in supportCase.evidenceRefs" :key="refValue">
              <a
                v-if="isSafeEvidenceLink(refValue)"
                class="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                :href="refValue"
                target="_blank"
                rel="noopener noreferrer"
                :title="refValue"
                @click.prevent="openEvidence(refValue)"
              >Bằng chứng {{ idx + 1 }} <ExternalLink :size="14" aria-hidden="true" /></a>
              <span v-else class="break-all text-ink-700">{{ refValue }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-ink-500">Chưa có bằng chứng.</p>
        </FhCard>
      </div>

      <SupportCaseContext
        v-if="supportCase.booking || supportCase.serviceOrder || supportCase.invoice || supportCase.cashSettlement"
        :support-case="supportCase"
      />

      <FhCard v-if="supportCase.resolutionCode || supportCase.resolutionReason || supportCase.resolvedAt" title="Kết quả xử lý">
        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Kết quả</dt><dd class="text-right text-ink-900">{{ resolutionLabel(supportCase.resolutionCode) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Thời điểm</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.resolvedAt) }}</dd></div>
          <div v-if="supportCase.liableParty" class="flex justify-between gap-3"><dt class="text-ink-500">Bên chịu trách nhiệm</dt><dd class="text-ink-800">{{ liablePartyLabels[supportCase.liableParty] ?? 'Chưa xác định' }}</dd></div>
          <div v-if="supportCase.amount != null" class="flex justify-between gap-3"><dt class="text-ink-500">Số tiền</dt><dd><FhMoney :amount="supportCase.amount" /></dd></div>
        </dl>
        <p v-if="supportCase.resolutionReason" class="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-800 text-pretty">{{ supportCase.resolutionReason }}</p>
      </FhCard>

      <FhCard v-if="!isTerminal" title="Ghi nhận kết quả">
        <form class="space-y-4" @submit.prevent="submitResolution">
          <div class="grid gap-4 sm:grid-cols-2">
            <label :class="consoleLabel">
              Trạng thái cuối
              <select v-model="finalStatus" :class="consoleField" class="h-10">
                <option value="resolved">Đã giải quyết</option>
                <option value="rejected">Từ chối</option>
              </select>
            </label>
            <label :class="consoleLabel">
              Kết quả xử lý
              <select v-model="resolutionCode" required :class="consoleField" class="h-10">
                <option value="" disabled>Chọn kết quả</option>
                <option v-for="(label, code) in codeLabels" :key="code" :value="code">{{ label }}</option>
              </select>
              <span v-if="refundsToWallet" class="font-normal text-warning-800 text-pretty" data-testid="refund-wallet-hint">Tiền vào ví khách ngay khi lưu, khách dùng để thanh toán lần sau. FixHome chịu khoản hoàn; muốn thu lại từ thợ thì quản trị viên điều chỉnh ví thợ. Tổng tiền hoàn của đơn không vượt số khách đã trả.</span>
              <span v-if="settlesCash" class="font-normal text-warning-800 text-pretty">Hoá đơn được ghi đã trả bằng tiền mặt, phí nền tảng trừ vào ví kỹ thuật viên, đơn hoàn tất nếu khách đã xác nhận công việc.</span>
            </label>
          </div>
          <div v-if="usesStandardCodes" class="grid gap-4 sm:grid-cols-2">
            <label :class="consoleLabel">
              Bên chịu trách nhiệm
              <select v-model="liableParty" :class="consoleField" class="h-10">
                <option value="">Chưa xác định</option>
                <option v-for="(label, value) in liablePartyLabels" :key="value" :value="value">{{ label }}</option>
              </select>
            </label>
            <label :class="consoleLabel">
              <template v-if="refundsToWallet">Số tiền hoàn vào ví khách (₫)</template>
              <template v-else>Số tiền ghi nhận (₫, không bắt buộc)</template>
              <input v-model="amountText" type="number" min="0" step="1000" inputmode="numeric" :class="consoleField" class="h-10" />
            </label>
          </div>
          <label :class="consoleLabel">
            Lý do xử lý
            <textarea v-model="resolutionReason" maxlength="2000" rows="5" required :class="consoleTextarea" placeholder="Tối thiểu 10 ký tự" />
            <span class="self-end font-num text-xs font-normal text-ink-500">{{ resolutionReason.length }}/2000</span>
          </label>
          <label :class="consoleLabel">
            Bằng chứng (không bắt buộc, mỗi dòng một liên kết)
            <textarea v-model="evidenceRefsText" rows="3" :class="consoleTextarea" />
          </label>
          <div v-if="formError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800" role="alert">{{ formError }}</div>
          <div class="flex justify-end">
            <FhButton type="submit" :disabled="submitting">Kiểm tra và xác nhận</FhButton>
          </div>
        </form>
      </FhCard>

      <FhConfirmDialog
        :open="showConfirm"
        :loading="submitting"
        :danger="pendingPayload?.finalStatus === 'rejected'"
        title="Xác nhận kết quả xử lý"
        :consequence="confirmConsequence"
        confirm-text="Gửi kết quả"
        cancel-text="Kiểm tra lại"
        @confirm="confirmResolution"
        @cancel="cancelResolution"
      />
    </template>
  </div>
</template>
