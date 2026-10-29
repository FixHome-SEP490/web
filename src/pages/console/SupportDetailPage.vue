<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckCircle2, ExternalLink } from 'lucide-vue-next';
import { ordersApi } from '../../api/orders.api';
import { getHttpStatus } from '../../api/client';
import TechnicianReplacementPanel from '../../components/console/TechnicianReplacementPanel.vue';
import SupportCaseContext from '../../components/console/SupportCaseContext.vue';
import StoppedWorkFinancePanel from '../../components/console/StoppedWorkFinancePanel.vue';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
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
  type TechnicianReportReasonClass,
  type TechnicianReportReasonCode,
  type TechnicianResponsibility,
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
  supportExecutionLabel,
} from './support-cases.utils';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
// Admin's global permission shortcut must never grant manager operations here.
const canManage = computed(() => auth.userRole === 'SERVICE_MANAGER' && auth.hasPermission('support:resolve'));
const isAdmin = computed(() => auth.userRole === 'ADMIN');
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
const resolutionRetry = ref<SupportCaseResolvePayload | null>(null);
const resolutionNeedsReload = ref(false);
const escalating = computed(() => resolutionCode.value === 'escalate_admin');
const liableParty = ref<'' | 'technician' | 'customer' | 'platform' | 'shared'>('');
const amountText = ref<string | number>('');
const grossRefundText = ref<string | number>('');
const actionBusy = ref(false);
const responsibilityDecision = ref<'' | Exclude<TechnicianResponsibility, 'pending'>>('');
const responsibilityReason = ref('');
const responsibilityEvidenceRefsText = ref('');
const responsibilityError = ref('');
const responsibilitySubmitting = ref(false);
const responsibilityCommandId = ref<string | null>(null);

const technicianReportClassLabels: Record<TechnicianReportReasonClass, string> = {
  technician_skill_gap: 'Lỗi thuộc kỹ năng hoặc thao tác kỹ thuật',
  non_technician_exception: 'Ngoại lệ thiết bị hoặc khách hàng',
};
const technicianReportCodeLabels: Record<TechnicianReportReasonCode, string> = {
  skill_gap: 'Thiếu kỹ năng hoặc thao tác chưa đúng',
  device_too_old: 'Thiết bị đã quá cũ',
  severe_damage: 'Thiết bị hư hỏng nặng',
  no_compatible_part: 'Không có linh kiện phù hợp',
  manufacturer_warranty_or_workshop: 'Cần trung tâm hoặc bảo hành hãng',
  customer_absent: 'Khách không có mặt',
  customer_cancelled: 'Khách đã hủy',
  dispute_or_other: 'Tranh chấp hoặc tình huống khác',
};
const responsibilityLabels: Record<TechnicianResponsibility, string> = {
  pending: 'Chờ quản lý đánh giá',
  technician_fault: 'Lỗi thuộc trách nhiệm kỹ thuật viên',
  no_technician_fault: 'Không thuộc trách nhiệm kỹ thuật viên',
  inconclusive: 'Chưa đủ căn cứ kết luận',
};
const isTypedTechnicianReport = computed(() => !!supportCase.value?.reasonClass && !!supportCase.value.reasonCode);
const responsibilityEvidenceRefs = computed(() => responsibilityEvidenceRefsText.value
  .split(/\r?\n/).map((value) => value.trim()).filter(Boolean));
const canDecideResponsibility = computed(() => canManage.value && isTypedTechnicianReport.value
  && supportCase.value?.responsibility === 'pending'
  && Number.isSafeInteger(supportCase.value.workflowVersion)
  && (supportCase.value.workflowVersion ?? -1) >= 0);

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
const canHold = computed(() => canManage.value && !!supportCase.value?.serviceOrderId && !isTerminal.value);
const overdue = computed(() =>
  supportCase.value ? isResponseOverdue(supportCase.value.status, supportCase.value.respondBy) : false,
);

const isTerminal = computed(() =>
  supportCase.value ? ['resolved', 'rejected'].includes(supportCase.value.status) : false,
);

async function loadCase(id: string) {
  const requestId = ++latestRequest;
  resetActionForms();
  supportCase.value = null;
  loading.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const detail = await supportCasesApi.getCase(id);
    if (requestId !== latestRequest) return;
    supportCase.value = detail;
  } catch {
    if (requestId !== latestRequest) return;
    // A failed load shows one plain sentence and a retry, never the server's text.
    error.value = 'load';
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

function resetActionForms() {
  submitting.value = false;
  resolutionRetry.value = null;
  resolutionNeedsReload.value = false;
  showConfirm.value = false;
  pendingPayload.value = null;
  finalStatus.value = 'resolved';
  resolutionCode.value = '';
  resolutionReason.value = '';
  evidenceRefsText.value = '';
  liableParty.value = '';
  amountText.value = '';
  grossRefundText.value = '';
  formError.value = '';
  responsibilityDecision.value = '';
  responsibilityReason.value = '';
  responsibilityEvidenceRefsText.value = '';
  resetResponsibilityCommand();
}

watch(canManage, (allowed) => {
  if (!allowed) resetActionForms();
});

// "Cần thay đổi thợ" cases get their own handling (PO 08/10/2026).
const isReplacementCase = computed(() => canManage.value && !!supportCase.value?.serviceOrderId && (
  supportCase.value.caseType === 'technician_replacement'
  || (supportCase.value.caseType === 'mid_job_interruption' && supportCase.value.requestIntent === 'stop_or_replace')
));
async function onReplacementDone(message: string) {
  const id = supportCase.value?.id;
  if (!id) return;
  await loadCase(id);
  successMessage.value = message;
}

async function runAction(action: () => Promise<SupportCaseDetail>, success: string) {
  if (!canManage.value || actionBusy.value || resolutionRetry.value) return;
  const requestId = latestRequest;
  actionBusy.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const detail = await action();
    if (requestId !== latestRequest || !canManage.value) return;
    supportCase.value = detail;
    successMessage.value = success;
  } catch (reason) {
    if (requestId !== latestRequest || !canManage.value) return;
    error.value = getSupportErrorMessage(reason, 'Chưa xác nhận được kết quả. Vui lòng tải lại trước khi thực hiện lại.');
  } finally {
    actionBusy.value = false;
  }
}

function resetResponsibilityCommand() {
  responsibilityCommandId.value = null;
  responsibilityError.value = '';
}

async function submitResponsibilityDecision() {
  const current = supportCase.value;
  const requestId = latestRequest;
  const reason = responsibilityReason.value.trim();
  const evidenceRefs = responsibilityEvidenceRefs.value;
  if (!current || !canDecideResponsibility.value || responsibilitySubmitting.value) return;
  responsibilityError.value = '';
  if (!responsibilityDecision.value) {
    responsibilityError.value = 'Chọn kết luận trách nhiệm.';
    return;
  }
  if (reason.length < 10 || reason.length > 2000) {
    responsibilityError.value = 'Lý do kết luận cần từ 10 đến 2000 ký tự.';
    return;
  }
  if (evidenceRefs.length > 20 || evidenceRefs.some((value) => value.length > 500)) {
    responsibilityError.value = 'Tối đa 20 bằng chứng, mỗi mục không quá 500 ký tự.';
    return;
  }
  responsibilityCommandId.value ??= crypto.randomUUID();
  responsibilitySubmitting.value = true;
  error.value = '';
  try {
    const detail = await supportCasesApi.decideTechnicianResponsibility(current.id, {
      commandId: responsibilityCommandId.value,
      workflowVersion: current.workflowVersion!,
      decision: responsibilityDecision.value,
      reason,
      ...(evidenceRefs.length ? { evidenceRefs } : {}),
    });
    if (requestId !== latestRequest || !canManage.value) return;
    supportCase.value = detail;
    responsibilityCommandId.value = null;
    successMessage.value = 'Đã ghi nhận kết luận trách nhiệm từ Backend.';
  } catch (reasonError) {
    if (requestId !== latestRequest || !canManage.value) return;
    responsibilityError.value = getSupportErrorMessage(reasonError, 'Chưa lưu được kết luận. Có thể thử lại với cùng mã thao tác.');
  } finally {
    responsibilitySubmitting.value = false;
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
  if (!canManage.value || !orderId || actionBusy.value || resolutionRetry.value) return;
  const requestId = latestRequest;
  actionBusy.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const result = await ordersApi.retryCompletion(orderId);
    if (requestId !== latestRequest || !canManage.value) return;
    successMessage.value = result.completed
      ? 'Đơn đã được hoàn tất.'
      : 'Đơn chưa đủ điều kiện hoàn tất (thiếu xác nhận của khách hoặc thanh toán).';
  } catch (reason) {
    if (requestId !== latestRequest || !canManage.value) return;
    error.value = getSupportErrorMessage(reason, 'Chưa kiểm tra lại được, vui lòng thử lại.');
  } finally {
    actionBusy.value = false;
  }
}

function buildResolvePayload(): SupportCaseResolvePayload | null {
  if (resolutionRetry.value) return resolutionRetry.value;
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
  const rawAmount = code === 'escalate_admin' ? '' : String(amountText.value ?? '').trim();
  const amount = rawAmount === '' ? undefined : Number(rawAmount);
  const rawGross = code === 'escalate_admin' ? '' : String(grossRefundText.value ?? '').trim();
  const grossRefundVnd = rawGross === '' ? undefined : Number(rawGross);
  if (grossRefundVnd !== undefined && (!Number.isSafeInteger(grossRefundVnd) || grossRefundVnd <= 0 || grossRefundVnd > 2_000_000_000)) {
    formError.value = 'Giá gốc được duyệt hoàn phải là số nguyên dương hợp lệ.';
    return null;
  }
  if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_000_000_000)) {
    formError.value = 'Số tiền phải là số nguyên không âm.';
    return null;
  }
  if (refundsToWallet.value && (amount === undefined || (amount === 0 && grossRefundVnd === undefined))) {
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
  if (code === 'escalate_admin') {
    const version = supportCase.value?.workflowVersion;
    if (!Number.isInteger(version) || (version ?? -1) < 0 || (version ?? 0) >= 2147483647) {
      formError.value = 'Thiếu phiên bản hồ sơ hiện tại. Tải lại trước khi chuyển quản trị viên.'; return null;
    }
    if (evidenceRefs.some(ref => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(ref))) {
      formError.value = 'Chuyển quản trị viên chỉ nhận mã bằng chứng nội bộ (UUID).'; return null;
    }
    return { finalStatus: 'resolved', resolutionCode: code, reason, commandId: crypto.randomUUID(), expectedVersion: version,
      ...(evidenceRefs.length ? { evidenceRefs } : {}) };
  }

  const payload: SupportCaseResolvePayload = {
    finalStatus: finalStatus.value,
    resolutionCode: code,
    reason,
  };
  if (evidenceRefs.length > 0) payload.evidenceRefs = evidenceRefs;
  if (refundsToWallet.value && grossRefundVnd !== undefined) payload.grossRefundVnd = grossRefundVnd;
  if (usesStandardCodes.value) {
    if (liableParty.value) payload.liableParty = liableParty.value;
    if (amount !== undefined) payload.amount = amount;
  }
  return payload;
}

function submitResolution() {
  if (!canManage.value || !supportCase.value || isTerminal.value || submitting.value || resolutionNeedsReload.value) return;
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
  if (!canManage.value || !supportCase.value || !pendingPayload.value || submitting.value || isTerminal.value) return;
  const requestId = latestRequest;
  submitting.value = true;
  error.value = '';
  formError.value = '';
  if (pendingPayload.value.resolutionCode === 'escalate_admin') resolutionRetry.value = { ...pendingPayload.value };
  try {
    const detail = await supportCasesApi.resolveCase(supportCase.value.id, pendingPayload.value);
    if (requestId !== latestRequest || !canManage.value) return;
    supportCase.value = detail;
    successMessage.value = supportExecutionLabel(detail);
    resolutionRetry.value = null;
    showConfirm.value = false;
    pendingPayload.value = null;
  } catch (reason) {
    if (requestId !== latestRequest || !canManage.value) return;
    error.value = getSupportErrorMessage(reason, 'Chưa lưu được kết quả, vui lòng thử lại.');
    if (resolutionRetry.value) {
      const status = getHttpStatus(reason);
      if (status === 400 || status === 422) resolutionRetry.value = null;
      else if (status !== undefined && status < 500 && status !== 408) resolutionNeedsReload.value = true;
      else error.value = 'Chưa xác nhận được kết quả chuyển quản trị viên. Thử lại giữ nguyên nội dung và mã lệnh.';
    }
    showConfirm.value = false;
  } finally {
    if (requestId === latestRequest) submitting.value = false;
  }
}

const confirmConsequence = computed(() => {
  if (pendingPayload.value?.resolutionCode === 'escalate_admin') return 'Hồ sơ vẫn đang rà soát, giữ nguyên việc giữ đơn. Quản trị viên chỉ xem xét; quản lý dịch vụ tiếp tục phụ trách.';
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
          <FhButton v-if="canManage && !isTerminal && supportCase.status === 'open'" size="sm" :loading="actionBusy" :disabled="actionBusy" @click="startReview">
            Nhận xử lý case này
          </FhButton>
          <ConsoleMoreMenu v-if="canHold || supportCase.serviceOrderId || (canManage && isCashCase(supportCase.caseType))">
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
              v-if="canManage && isCashCase(supportCase.caseType)"
              @click="router.push(`/console/support/cash/${encodeURIComponent(supportCase.id)}`)"
            >
              Xem đối soát tiền mặt
            </ConsoleMenuItem>
          </ConsoleMoreMenu>
        </template>
      </ConsolePageHeader>

      <p v-if="isAdmin" class="text-sm text-ink-600" role="status">Chỉ xem. Quản lý dịch vụ thực hiện các thao tác xử lý.</p>

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
      <StoppedWorkFinancePanel v-if="supportCase.serviceOrderId" :order-id="supportCase.serviceOrderId" />

      <FhCard v-if="isTypedTechnicianReport" title="Đánh giá trách nhiệm">
        <p class="mb-4 text-sm text-ink-600">Báo cáo của kỹ thuật viên; kết luận này không thay đổi trạng thái đơn sửa chữa.</p>
        <dl class="grid gap-4 text-sm sm:grid-cols-2">
          <div class="min-w-0"><dt class="text-ink-500">Nhóm tình huống</dt><dd class="mt-1 font-medium text-ink-900 text-pretty">{{ technicianReportClassLabels[supportCase.reasonClass!] }}</dd></div>
          <div class="min-w-0"><dt class="text-ink-500">Lý do</dt><dd class="mt-1 font-medium text-ink-900 text-pretty">{{ technicianReportCodeLabels[supportCase.reasonCode!] }}</dd></div>
        </dl>
        <div class="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-4">
          <p class="text-sm font-semibold text-ink-900">{{ responsibilityLabels[supportCase.responsibility ?? 'pending'] }}</p>
          <p v-if="supportCase.responsibilityReason" class="mt-1 text-sm text-ink-700 text-pretty">{{ supportCase.responsibilityReason }}</p>
          <p v-if="supportCase.responsibility === 'pending'" class="mt-1 text-sm text-ink-600 text-pretty">Chưa có quyết định về điểm uy tín. Báo cáo không tự trừ điểm kỹ thuật viên.</p>
          <p v-if="supportCase.responsibilityDecidedAt" class="mt-2 text-xs text-ink-500">Quyết định lúc {{ formatSupportDate(supportCase.responsibilityDecidedAt) }}</p>
          <ul v-if="supportCase.responsibilityEvidenceRefs?.length" class="mt-3 space-y-1 text-sm">
            <li v-for="(refValue, idx) in supportCase.responsibilityEvidenceRefs" :key="refValue">
              <a v-if="isSafeEvidenceLink(refValue)" :href="refValue" target="_blank" rel="noopener noreferrer" class="font-medium text-brand-700 hover:underline" @click.prevent="openEvidence(refValue)">Bằng chứng quyết định {{ idx + 1 }}</a>
              <span v-else class="break-all text-ink-700">{{ refValue }}</span>
            </li>
          </ul>
        </div>
        <form v-if="canDecideResponsibility" data-testid="responsibility-form" class="mt-5 max-w-3xl space-y-4 border-t border-ink-100 pt-5" @submit.prevent="submitResponsibilityDecision">
          <label :class="consoleLabel">
            Kết luận của quản lý
            <select v-model="responsibilityDecision" data-testid="responsibility-decision" required :class="consoleField" class="h-11 w-full" @change="resetResponsibilityCommand">
              <option value="" disabled>Chọn kết luận</option>
              <option value="technician_fault">Lỗi thuộc trách nhiệm kỹ thuật viên</option>
              <option value="no_technician_fault">Không thuộc trách nhiệm kỹ thuật viên</option>
              <option value="inconclusive">Chưa đủ căn cứ kết luận</option>
            </select>
            <span v-if="responsibilityDecision === 'technician_fault'" class="font-normal text-warning-800 text-pretty">Điểm uy tín chỉ được ghi nhận sau khi quản lý xác nhận kết luận này.</span>
          </label>
          <label :class="consoleLabel">
            Lý do kết luận
            <textarea v-model="responsibilityReason" data-testid="responsibility-reason" maxlength="2000" rows="4" required :class="consoleTextarea" aria-describedby="responsibility-reason-hint" @input="resetResponsibilityCommand" />
            <span id="responsibility-reason-hint" class="font-normal text-ink-600">10–2.000 ký tự, nêu rõ căn cứ cho kết luận.</span>
          </label>
          <label :class="consoleLabel">
            Bằng chứng bổ sung (không bắt buộc)
            <textarea v-model="responsibilityEvidenceRefsText" rows="3" :class="consoleTextarea" aria-describedby="responsibility-evidence-hint" @input="resetResponsibilityCommand" />
            <span id="responsibility-evidence-hint" class="font-normal text-ink-600">Mỗi dòng một liên kết, tối đa 20 bằng chứng.</span>
          </label>
          <p v-if="responsibilityError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800" role="alert">{{ responsibilityError }}</p>
          <div class="flex justify-end">
            <FhButton type="submit" class="w-full sm:w-auto" :disabled="responsibilitySubmitting" :loading="responsibilitySubmitting">Gửi kết luận</FhButton>
          </div>
        </form>
        <p v-else-if="canManage && supportCase.responsibility === 'pending' && !canDecideResponsibility" class="mt-4 text-sm text-warning-800">Thiếu phiên bản quy trình mới nhất. Tải lại hồ sơ trước khi quyết định.</p>
      </FhCard>

      <FhCard v-if="supportCase.resolutionCode || supportCase.resolutionReason || supportCase.resolvedAt" title="Kết quả xử lý">
        <p class="mb-3 text-sm font-semibold text-ink-900" data-testid="support-execution-state">{{ supportExecutionLabel(supportCase) }}</p>
        <p v-if="supportCase.resolutionExecutionKind !== 'DOMAIN_ACTION_EXECUTED'" class="mb-3 text-sm text-ink-600">Kết luận chưa thực hiện thao tác nghiệp vụ như hoàn tiền, điều chỉnh giá, phạt hoặc thay đổi bảo hành.</p>
        <p v-if="supportCase.needsManualAction" class="mb-3 text-sm text-warning-800">Cần xử lý tiếp: {{ supportCase.nextActor === 'admin' ? 'Quản trị viên xem xét; quản lý dịch vụ vẫn phụ trách' : 'Quản lý dịch vụ' }}.</p>
        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Kết quả</dt><dd class="text-right text-ink-900">{{ resolutionLabel(supportCase.resolutionCode) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-ink-500">Thời điểm</dt><dd class="whitespace-nowrap font-num text-ink-800">{{ formatSupportDate(supportCase.resolvedAt) }}</dd></div>
          <div v-if="supportCase.liableParty" class="flex justify-between gap-3"><dt class="text-ink-500">Bên chịu trách nhiệm</dt><dd class="text-ink-800">{{ liablePartyLabels[supportCase.liableParty] ?? 'Chưa xác định' }}</dd></div>
          <div v-if="supportCase.amount != null" class="flex justify-between gap-3"><dt class="text-ink-500">Số tiền</dt><dd><FhMoney :amount="supportCase.amount" /></dd></div>
        </dl>
        <p v-if="supportCase.resolutionReason" class="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-800 text-pretty">{{ supportCase.resolutionReason }}</p>
      </FhCard>

      <FhCard v-if="canManage && !isTerminal && !isTypedTechnicianReport" title="Ghi nhận kết quả">
        <form class="space-y-4" @submit.prevent="submitResolution">
          <fieldset :disabled="submitting || !!resolutionRetry" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label :class="consoleLabel">
              Trạng thái cuối
              <select v-model="finalStatus" :disabled="escalating" :class="consoleField" class="h-10">
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
              <span v-if="refundsToWallet" class="font-normal text-warning-800 text-pretty" data-testid="refund-wallet-hint">Tiền hoàn vào ví khách là phần thực trả; FixHome chịu khoản hoàn. Với hóa đơn có voucher, quản lý phải nhập thêm giá gốc được duyệt hoàn để Backend đối chiếu trợ giá FixHome. Tiền hoàn luôn được ghi có vào ví FixHome của khách, kể cả đơn đã thanh toán qua VNPay hoặc tiền mặt, sau khi xác nhận giao dịch gốc đã thanh toán thành công.</span>
              <span v-if="settlesCash" class="font-normal text-warning-800 text-pretty">Hoá đơn được ghi đã trả bằng tiền mặt, phí nền tảng trừ vào ví kỹ thuật viên, đơn hoàn tất nếu khách đã xác nhận công việc.</span>
            </label>
          </div>
          <div v-if="usesStandardCodes && !escalating" class="grid gap-4 sm:grid-cols-2">
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
          <label v-if="refundsToWallet" :class="consoleLabel" data-testid="funded-gross-refund-field">
            Giá gốc được duyệt hoàn (đơn có voucher, ₫)
            <input v-model="grossRefundText" data-testid="funded-gross-refund-input" type="number" min="1" max="2000000000" step="1" inputmode="numeric" :class="consoleField" class="h-10" />
            <span class="text-xs font-normal text-ink-600">Để trống với đơn không có voucher. Khác với tiền hoàn vào ví khách; Backend đối chiếu phần FixHome tài trợ.</span>
          </label>
          <label :class="consoleLabel">
            Lý do xử lý
            <textarea v-model="resolutionReason" maxlength="2000" rows="5" required :class="consoleTextarea" placeholder="Tối thiểu 10 ký tự" />
            <span class="self-end font-num text-xs font-normal text-ink-500">{{ resolutionReason.length }}/2000</span>
          </label>
          <label :class="consoleLabel">
            {{ escalating ? 'Mã bằng chứng nội bộ (UUID, không bắt buộc, mỗi dòng một mã)' : 'Bằng chứng (không bắt buộc, mỗi dòng một liên kết)' }}
            <textarea v-model="evidenceRefsText" rows="3" :class="consoleTextarea" />
          </label>
          <p v-if="escalating" class="text-sm text-ink-600">Hồ sơ tiếp tục rà soát và giữ nguyên việc giữ đơn; không thực hiện quyết định tiền hoặc trách nhiệm.</p>
          </fieldset>
          <div v-if="formError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800" role="alert">{{ formError }}</div>
          <div class="flex justify-end">
            <FhButton v-if="resolutionNeedsReload" type="button" variant="secondary" @click="loadCase(caseId)">Tải lại hồ sơ</FhButton>
            <FhButton v-else type="submit" :disabled="submitting">{{ resolutionRetry ? 'Thử lại cùng lệnh' : 'Kiểm tra và xác nhận' }}</FhButton>
          </div>
        </form>
      </FhCard>

      <FhConfirmDialog
        v-if="canManage"
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
