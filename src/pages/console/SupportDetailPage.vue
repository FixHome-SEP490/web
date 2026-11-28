<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  ExternalLink,
  FileText,
  Headset,
  Image as ImageIcon,
  Info,
  Layers,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  User,
} from 'lucide-vue-next';
import { ordersApi } from '../../api/orders.api';
import { getHttpStatus } from '../../api/client';
import TechnicianReplacementPanel from '../../components/console/TechnicianReplacementPanel.vue';
import GroupStopIncidentsPanel from '../../components/console/GroupStopIncidentsPanel.vue';
import StoppedWorkFinancePanel from '../../components/console/StoppedWorkFinancePanel.vue';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import ConsoleMoreMenu from '../../components/console/ConsoleMoreMenu.vue';
import ConsoleMenuItem from '../../components/console/ConsoleMenuItem.vue';
import { consoleField, consoleLabel, consoleTextarea } from '../../components/console/console-ui';
import {
  bookingStatusLabel,
  cashSettlementLabel,
  orderStatusLabel,
  paymentStatusLabel,
} from '../../components/console/console-labels';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  FhButton,
  FhConfirmDialog,
  FhMoney,
  FhSkeleton,
} from '../../components';
import {
  supportCasesApi,
  type SupportCaseDetail,
  type SupportCaseFinalStatus,
  type SupportCaseResolvePayload,
  type TechnicianReportReasonClass,
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
  technicianReportCodeLabels,
  supportExecutionLabel,
} from './support-cases.utils';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
// Admin's global permission shortcut must never grant manager operations here.
const canManage = computed(() => auth.userRole === 'SERVICE_MANAGER' && auth.hasPermission('support:resolve')
  && supportCase.value?.caseType !== 'technician_delay');
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
const requiresInterruptionCommand = computed(
  () => supportCase.value?.requestIntent === 'stop_or_replace' || supportCase.value?.caseType === 'technician_replacement',
);
// Settling cash only makes sense when the case is resolved, not rejected.
const codeLabels = computed<Record<string, string>>(() => {
  if (usesStandardCodes.value) {
    return Object.fromEntries(
      Object.entries(resolutionCodeLabels).filter(([code]) => {
        if (code === 'refund_to_wallet' && !REFUND_CASE_TYPES.includes(supportCase.value!.caseType)) return false;
        if (requiresInterruptionCommand.value && (code === 'worker_reassigned' || code === 'order_cancelled_no_fee')) {
          return false;
        }
        return true;
      }),
    );
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

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'open':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'in_review':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'resolved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'rejected':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function statusDotClasses(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-amber-500';
    case 'in_review':
      return 'bg-blue-500';
    case 'resolved':
      return 'bg-emerald-500';
    case 'rejected':
      return 'bg-slate-400';
    default:
      return 'bg-slate-400';
  }
}

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
  if (evidenceRefs.length > 20 || evidenceRefs.some((value) => value.length > 512)) {
    responsibilityError.value = 'Tối đa 20 bằng chứng, mỗi mục không quá 512 ký tự.';
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
  if (evidenceRefs.some((ref) => ref.length > 512)) {
    formError.value = 'Mỗi bằng chứng tối đa 512 ký tự.';
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
  if (code === 'interrupted_for_rebook') return 'Kết thúc đơn để khách đặt lại';
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
  <div class="mx-auto max-w-7xl space-y-6 pb-16">
    <!-- Skeleton Loading -->
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <FhSkeleton height="16px" width="160px" />
      <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs space-y-3">
        <FhSkeleton height="32px" width="340px" />
        <FhSkeleton height="18px" width="220px" />
      </div>
      <div class="grid gap-6 md:grid-cols-2">
        <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs space-y-3">
          <FhSkeleton height="20px" width="140px" />
          <FhSkeleton height="16px" :count="4" />
        </div>
        <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs space-y-3">
          <FhSkeleton height="20px" width="140px" />
          <FhSkeleton height="16px" :count="4" />
        </div>
      </div>
      <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
        <FhSkeleton height="24px" width="200px" />
      </div>
    </div>

    <!-- Error State -->
    <template v-else-if="error && !supportCase">
      <ConsolePageHeader title="Chi tiết yêu cầu hỗ trợ" back-to="/console/support" back-label="Yêu cầu hỗ trợ" />
      <ConsoleLoadError @retry="loadCase(caseId)" />
    </template>

    <!-- Main Detail Content -->
    <template v-else-if="supportCase">
      <!-- Role / Delay System Notice -->
      <div
        v-if="supportCase.caseType === 'technician_delay'"
        class="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800"
        role="status"
      >
        Chỉ xem. Đây là thông báo hệ thống về kỹ thuật viên đến trễ; không thực hiện hủy đơn hoặc quyết định tài chính tại đây.
      </div>

      <div
        v-if="isAdmin"
        class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
        role="status"
      >
        Chỉ xem. Quản lý dịch vụ thực hiện các thao tác xử lý.
      </div>

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <router-link
          to="/console/support"
          class="flex items-center gap-1 font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ChevronLeft :size="14" />
          <span>Yêu cầu hỗ trợ</span>
        </router-link>
        <span class="text-slate-300">/</span>
        <span class="font-medium text-slate-700">Chi tiết yêu cầu</span>
      </nav>

      <!-- Section A: Header Card -->
      <div class="animate-slide-up rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
        <div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div class="flex min-w-0 flex-1 items-start gap-4">
            <!-- Icon container -->
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-xs">
              <Headset :size="24" class="stroke-[1.75]" />
            </div>

            <!-- Title, Status, Subtitle, Meta -->
            <div class="min-w-0 flex-1">
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <h1 class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {{ supportCase.requestIntent === 'stop_or_replace' ? 'Khách yêu cầu dừng sửa / Đổi thợ' : (supportCaseTypeLabels[supportCase.caseType] || 'Yêu cầu hỗ trợ') }}
                </h1>

                <!-- Status Badge -->
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  :class="statusBadgeClasses(supportCase.status)"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="statusDotClasses(supportCase.status)"></span>
                  {{ supportCaseStatusLabels[supportCase.status] }}
                </span>

                <!-- Overdue Badge -->
                <span
                  v-if="overdue"
                  class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700"
                >
                  <Clock :size="12" />
                  Quá hạn phản hồi
                </span>

                <!-- Hold Completion Badge -->
                <span
                  v-if="supportCase.holdCompletion"
                  class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                >
                  <RotateCw :size="12" />
                  Đang giữ đơn
                </span>

                <!-- Urgent Badge -->
                <span
                  v-if="supportCase.isUrgent && !isTerminal"
                  class="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700"
                >
                  <AlertTriangle :size="12" />
                  Cần xử lý ngay
                </span>
              </div>

              <!-- Subtitle / Reason -->
              <p class="mb-3 text-sm text-slate-500">
                {{ supportCase.reason || 'Quản lý yêu cầu hỗ trợ liên quan đến đơn và lịch làm việc.' }}
              </p>

              <!-- Meta info bar -->
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-num text-xs text-slate-500">
                <div class="inline-flex items-center gap-1.5">
                  <Calendar :size="14" class="text-slate-400" />
                  <span>Tạo lúc: <strong class="font-medium text-slate-700">{{ formatSupportDate(supportCase.createdAt) }}</strong></span>
                </div>
                <span class="hidden text-slate-200 sm:inline">|</span>
                <div class="inline-flex items-center gap-1.5">
                  <RotateCw :size="14" class="text-slate-400" />
                  <span>Cập nhật: <strong class="font-medium text-slate-700">{{ formatSupportDate(supportCase.updatedAt) }}</strong></span>
                </div>
                <span class="hidden text-slate-200 sm:inline">|</span>
                <div class="inline-flex items-center gap-1.5">
                  <User :size="14" class="text-slate-400" />
                  <span>Người xử lý: <strong class="font-medium text-slate-700">{{ supportCase.assignedManagerId ? 'Đã có người nhận' : 'Chưa có người nhận' }}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Header Actions -->
          <div class="flex shrink-0 items-center gap-2 self-start lg:self-auto">
            <FhButton
              v-if="canManage && !isTerminal && supportCase.status === 'open'"
              size="sm"
              :loading="actionBusy"
              :disabled="actionBusy"
              @click="startReview"
            >
              Nhận xử lý case này
            </FhButton>

            <ConsoleMoreMenu
              v-if="canHold || supportCase.serviceOrderId || (canManage && isCashCase(supportCase.caseType))"
              show-label
              button-label="Thao tác"
            >
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
          </div>
        </div>
      </div>

      <!-- Feedback Alerts -->
      <Transition name="fh-fade-slide">
        <div v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {{ error }}
        </div>
      </Transition>
      <Transition name="fh-fade-slide">
        <div v-if="successMessage" class="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          <CheckCircle2 :size="16" aria-hidden="true" />
          {{ successMessage }}
        </div>
      </Transition>

      <!-- Replacement Action Panel -->
      <TechnicianReplacementPanel
        v-if="isReplacementCase && !isTerminal"
        :support-case="supportCase"
        @done="onReplacementDone"
      />

      <!-- Section B: Two Horizontal Cards (Desktop) -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Cột trái: Thông tin yêu cầu -->
        <div class="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
          <div>
            <div class="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Info :size="18" />
              </div>
              <h2 class="text-base font-semibold text-slate-900">Thông tin yêu cầu</h2>
            </div>

            <dl class="space-y-3.5 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-slate-500">
                  <Calendar :size="16" class="text-slate-400" />
                  <span>Hạn phản hồi</span>
                </dt>
                <dd class="whitespace-nowrap font-num">
                  <span
                    v-if="supportCase.respondBy"
                    :class="overdue ? 'rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700' : 'font-medium text-slate-800'"
                  >
                    {{ formatSupportDate(supportCase.respondBy) }}
                  </span>
                  <span v-else class="text-slate-400">—</span>
                </dd>
              </div>

              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-slate-500">
                  <User :size="16" class="text-slate-400" />
                  <span>Người xử lý</span>
                </dt>
                <dd class="font-medium text-slate-800">
                  {{ supportCase.assignedManagerId ? 'Đã có người nhận' : 'Chưa có người nhận' }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-slate-500">
                  <RotateCw :size="16" class="text-slate-400" />
                  <span>Cập nhật gần nhất</span>
                </dt>
                <dd class="whitespace-nowrap font-num font-medium text-slate-800">
                  {{ formatSupportDate(supportCase.updatedAt) }}
                </dd>
              </div>

              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-slate-500">
                  <Tag :size="16" class="text-slate-400" />
                  <span>Loại yêu cầu</span>
                </dt>
                <dd>
                  <span class="inline-flex items-center rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {{ supportCaseTypeLabels[supportCase.caseType] || 'Thay đổi kỹ thuật viên' }}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div v-if="supportCase.description" class="mt-5 border-t border-slate-100 pt-4">
            <div class="mb-1 text-xs font-medium text-slate-400">Mô tả thêm</div>
            <p class="text-pretty text-sm text-slate-700">{{ supportCase.description }}</p>
          </div>
        </div>

        <!-- Cột phải: Đơn liên quan -->
        <div class="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
          <div>
            <div class="mb-5 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <FileText :size="18" />
              </div>
              <h2 class="text-base font-semibold text-slate-900">Đơn liên quan</h2>
            </div>

            <template v-if="supportCase.serviceOrder">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <router-link
                  :to="`/console/orders/${supportCase.serviceOrder.id}`"
                  class="inline-flex items-center gap-1.5 font-num text-base font-bold text-blue-600 transition-colors hover:text-blue-800"
                >
                  <span>{{ supportCase.serviceOrder.code }}</span>
                  <ExternalLink :size="14" />
                </router-link>
              </div>

              <div class="mb-4 flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  <span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                  {{ orderStatusLabel(supportCase.serviceOrder.status) }}
                </span>
                <span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  {{ paymentStatusLabel(supportCase.serviceOrder.paymentStatus) }}
                </span>
              </div>

              <dl class="space-y-3.5 text-sm">
                <div v-if="supportCase.serviceOrder.laborTotal != null" class="flex items-center justify-between gap-3">
                  <dt class="text-slate-500">Tiền công</dt>
                  <dd><FhMoney :amount="supportCase.serviceOrder.laborTotal" /></dd>
                </div>
                <div v-if="supportCase.serviceOrder.partsTotal != null" class="flex items-center justify-between gap-3">
                  <dt class="text-slate-500">Linh kiện</dt>
                  <dd><FhMoney :amount="supportCase.serviceOrder.partsTotal" /></dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <dt class="flex items-center gap-2 font-medium text-slate-500">
                    <Banknote :size="16" class="text-slate-400" />
                    <span>Tổng tiền</span>
                  </dt>
                  <dd class="font-num font-bold text-slate-900">
                    <FhMoney :amount="supportCase.serviceOrder.grandTotal" emphasis />
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <dt class="flex items-center gap-2 text-slate-500">
                    <Calendar :size="16" class="text-slate-400" />
                    <span>Yêu cầu đặt lịch</span>
                  </dt>
                  <dd>
                    <span
                      v-if="supportCase.booking"
                      class="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                    >
                      {{ bookingStatusLabel(supportCase.booking.status) }}
                    </span>
                    <span v-else-if="supportCase.bookingId" class="text-xs text-slate-500">Đã liên kết</span>
                    <span v-else class="text-slate-400">—</span>
                  </dd>
                </div>
              </dl>
            </template>

            <template v-else-if="supportCase.booking">
              <dl class="space-y-3.5 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <dt class="flex items-center gap-2 text-slate-500">
                    <Calendar :size="16" class="text-slate-400" />
                    <span>Yêu cầu đặt lịch</span>
                  </dt>
                  <dd>
                    <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {{ bookingStatusLabel(supportCase.booking.status) }}
                    </span>
                  </dd>
                </div>
              </dl>
            </template>

            <div v-else class="py-8 text-center text-sm text-slate-400">
              Không có đơn liên quan.
            </div>
          </div>

          <!-- Secondary Context (Invoice / Cash declaration) -->
          <div v-if="supportCase.invoice || supportCase.cashSettlement" class="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <div v-if="supportCase.invoice" class="space-y-1.5 rounded-xl bg-slate-50/70 p-3 text-xs text-slate-600">
              <div class="flex items-center justify-between font-medium text-slate-800">
                <span>Hóa đơn</span>
                <span class="rounded-full border border-slate-200 bg-white px-2 py-0.5">{{ paymentStatusLabel(supportCase.invoice.paymentStatus) }}</span>
              </div>
              <div class="flex justify-between"><span>Tổng cộng:</span><FhMoney :amount="supportCase.invoice.grandTotal" /></div>
              <div v-if="supportCase.invoice.paidAt" class="flex justify-between text-slate-500"><span>Đã trả lúc:</span><span class="font-num">{{ formatSupportDate(supportCase.invoice.paidAt) }}</span></div>
            </div>

            <div v-if="supportCase.cashSettlement" class="space-y-1.5 rounded-xl bg-slate-50/70 p-3 text-xs text-slate-600">
              <div class="flex items-center justify-between font-medium text-slate-800">
                <span>Tiền mặt</span>
                <span class="rounded-full border border-slate-200 bg-white px-2 py-0.5">{{ cashSettlementLabel(supportCase.cashSettlement.status) }}</span>
              </div>
              <div class="flex justify-between"><span>Thợ khai:</span><FhMoney :amount="supportCase.cashSettlement.declaredAmount" /></div>
              <div v-if="supportCase.cashSettlement.confirmedAmount != null" class="flex justify-between"><span>Đã xác nhận:</span><FhMoney :amount="supportCase.cashSettlement.confirmedAmount" /></div>
              <div v-if="supportCase.cashSettlement.receiptEvidenceUrl" class="pt-1">
                <a
                  v-if="isSafeEvidenceLink(supportCase.cashSettlement.receiptEvidenceUrl)"
                  :href="supportCase.cashSettlement.receiptEvidenceUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  @click.prevent="openEvidence(supportCase.cashSettlement.receiptEvidenceUrl)"
                >
                  <span>Xem biên nhận</span>
                  <ExternalLink :size="12" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section C: Đối soát công việc gián đoạn -->
      <StoppedWorkFinancePanel
        v-if="supportCase.serviceOrderId"
        :order-id="supportCase.serviceOrderId"
      />

      <GroupStopIncidentsPanel
        v-if="supportCase.serviceOrderId && ['customer_absent', 'customer_unreachable'].includes(supportCase.reasonCode ?? '')"
        :key="supportCase.id"
        :order-id="supportCase.serviceOrderId"
      />

      <!-- Section D: Đánh giá trách nhiệm -->
      <div v-if="isTypedTechnicianReport" class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
        <div class="mb-1 flex items-center gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ShieldCheck :size="20" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-slate-900">Đánh giá trách nhiệm</h2>
            <p class="text-xs text-slate-500">Báo cáo của kỹ thuật viên; kết luận này không thay đổi trạng thái đơn sửa chữa.</p>
          </div>
        </div>

        <dl class="mt-5 grid gap-4 sm:grid-cols-2">
          <div class="flex items-center gap-3.5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Layers :size="16" />
            </div>
            <div class="min-w-0">
              <dt class="text-xs font-medium text-slate-400">Nhóm tình huống</dt>
              <dd class="mt-0.5 text-pretty text-sm font-medium text-slate-900">{{ technicianReportClassLabels[supportCase.reasonClass!] }}</dd>
            </div>
          </div>

          <div class="flex items-center gap-3.5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <SlidersHorizontal :size="16" />
            </div>
            <div class="min-w-0">
              <dt class="text-xs font-medium text-slate-400">Lý do</dt>
              <dd class="mt-0.5 text-pretty text-sm font-medium text-slate-900">{{ technicianReportCodeLabels[supportCase.reasonCode!] }}</dd>
            </div>
          </div>
        </dl>

        <!-- Trạng thái đánh giá -->
        <div class="mt-4 flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
          <Clock :size="18" class="mt-0.5 shrink-0 text-amber-600" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-900">{{ responsibilityLabels[supportCase.responsibility ?? 'pending'] }}</p>
            <p v-if="supportCase.responsibilityReason" class="mt-1 text-pretty text-sm text-slate-700">{{ supportCase.responsibilityReason }}</p>
            <p v-if="supportCase.responsibility === 'pending'" class="mt-1 text-pretty text-sm text-slate-600">Chưa có quyết định về điểm uy tín. Báo cáo không tự trừ điểm kỹ thuật viên.</p>
            <p v-if="supportCase.responsibilityDecidedAt" class="mt-2 font-num text-xs text-slate-500">Quyết định lúc {{ formatSupportDate(supportCase.responsibilityDecidedAt) }}</p>
            <ul v-if="supportCase.responsibilityEvidenceRefs?.length" class="mt-3 space-y-1 text-sm">
              <li v-for="(refValue, idx) in supportCase.responsibilityEvidenceRefs" :key="refValue">
                <a
                  v-if="isSafeEvidenceLink(refValue)"
                  :href="refValue"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                  @click.prevent="openEvidence(refValue)"
                >
                  <span>Bằng chứng quyết định <span class="font-num">{{ idx + 1 }}</span></span>
                  <ExternalLink :size="12" />
                </a>
                <span v-else class="break-all font-mono text-xs text-slate-700">{{ refValue }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Form kết luận trách nhiệm -->
        <form
          v-if="canDecideResponsibility"
          data-testid="responsibility-form"
          class="mt-5 max-w-3xl space-y-4 border-t border-slate-100 pt-5"
          @submit.prevent="submitResponsibilityDecision"
        >
          <label :class="consoleLabel">
            Kết luận của quản lý
            <select
              v-model="responsibilityDecision"
              data-testid="responsibility-decision"
              required
              :class="consoleField"
              class="h-11 w-full"
              @change="resetResponsibilityCommand"
            >
              <option value="" disabled>Chọn kết luận</option>
              <option value="technician_fault">Lỗi thuộc trách nhiệm kỹ thuật viên</option>
              <option value="no_technician_fault">Không thuộc trách nhiệm kỹ thuật viên</option>
              <option value="inconclusive">Chưa đủ căn cứ kết luận</option>
            </select>
            <span
              v-if="responsibilityDecision === 'technician_fault'"
              class="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-pretty text-xs font-normal text-amber-800"
            >
              Điểm uy tín chỉ được ghi nhận sau khi quản lý xác nhận kết luận này.
            </span>
          </label>
          <label :class="consoleLabel">
            Lý do kết luận
            <textarea
              v-model="responsibilityReason"
              data-testid="responsibility-reason"
              maxlength="2000"
              rows="4"
              required
              :class="consoleTextarea"
              aria-describedby="responsibility-reason-hint"
              @input="resetResponsibilityCommand"
            />
            <span id="responsibility-reason-hint" class="text-xs font-normal text-slate-500">10–2.000 ký tự, nêu rõ căn cứ cho kết luận.</span>
          </label>
          <label :class="consoleLabel">
            Bằng chứng bổ sung (không bắt buộc)
            <textarea
              v-model="responsibilityEvidenceRefsText"
              rows="3"
              :class="consoleTextarea"
              aria-describedby="responsibility-evidence-hint"
              @input="resetResponsibilityCommand"
            />
            <span id="responsibility-evidence-hint" class="text-xs font-normal text-slate-500">Mỗi dòng một liên kết, tối đa 20 bằng chứng.</span>
          </label>
          <Transition name="fh-fade-slide">
            <p v-if="responsibilityError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{{ responsibilityError }}</p>
          </Transition>
          <div class="flex justify-end">
            <FhButton type="submit" class="w-full sm:w-auto" :disabled="responsibilitySubmitting" :loading="responsibilitySubmitting">Gửi kết luận</FhButton>
          </div>
        </form>
        <p v-else-if="canManage && supportCase.responsibility === 'pending' && !canDecideResponsibility" class="mt-4 text-sm text-amber-800">
          Thiếu phiên bản quy trình mới nhất. Tải lại hồ sơ trước khi quyết định.
        </p>
      </div>

      <!-- Section E: Bằng chứng -->
      <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ImageIcon :size="20" />
          </div>
          <h2 class="text-base font-semibold text-slate-900">Bằng chứng</h2>
        </div>

        <div v-if="supportCase.evidenceRefs?.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div
            v-for="(refValue, idx) in supportCase.evidenceRefs"
            :key="refValue"
            class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:bg-slate-50"
          >
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ImageIcon :size="16" />
            </div>
            <div class="min-w-0 flex-1">
              <a
                v-if="isSafeEvidenceLink(refValue)"
                :href="refValue"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                :title="refValue"
                @click.prevent="openEvidence(refValue)"
              >
                <span>Bằng chứng <span class="font-num">{{ idx + 1 }}</span></span>
                <ExternalLink :size="13" class="shrink-0" />
              </a>
              <span v-else class="break-all font-mono text-xs text-slate-700">{{ refValue }}</span>
            </div>
          </div>
        </div>

        <div v-else class="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
          <ImageIcon :size="18" class="text-slate-400" />
          <span>Chưa có bằng chứng.</span>
        </div>
      </div>

      <!-- Section F: Kết quả xử lý (nếu đã có kết luận) -->
      <div
        v-if="supportCase.resolutionCode || supportCase.resolutionReason || supportCase.resolvedAt"
        class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs"
      >
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CheckCircle2 :size="20" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-slate-900">Kết quả xử lý</h2>
            <p class="font-medium text-xs text-slate-500" data-testid="support-execution-state">{{ supportExecutionLabel(supportCase) }}</p>
          </div>
        </div>

        <p v-if="supportCase.resolutionExecutionKind !== 'DOMAIN_ACTION_EXECUTED'" class="mb-4 text-sm text-slate-600">
          Kết luận chưa thực hiện thao tác nghiệp vụ như hoàn tiền, điều chỉnh giá, phạt hoặc thay đổi bảo hành.
        </p>
        <p v-if="supportCase.needsManualAction" class="mb-4 rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-800">
          Cần xử lý tiếp: {{ supportCase.nextActor === 'admin' ? 'Quản trị viên xem xét; quản lý dịch vụ vẫn phụ trách' : 'Quản lý dịch vụ' }}.
        </p>

        <dl class="space-y-3 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-slate-500">Kết quả</dt><dd class="text-right font-medium text-slate-900">{{ resolutionLabel(supportCase.resolutionCode) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-slate-500">Thời điểm</dt><dd class="whitespace-nowrap font-num text-slate-800">{{ formatSupportDate(supportCase.resolvedAt) }}</dd></div>
          <div v-if="supportCase.liableParty" class="flex justify-between gap-3"><dt class="text-slate-500">Bên chịu trách nhiệm</dt><dd class="text-slate-800">{{ liablePartyLabels[supportCase.liableParty] ?? 'Chưa xác định' }}</dd></div>
          <div v-if="supportCase.amount != null" class="flex justify-between gap-3"><dt class="text-slate-500">Số tiền</dt><dd><FhMoney :amount="supportCase.amount" /></dd></div>
        </dl>
        <p v-if="supportCase.resolutionReason" class="mt-4 border-t border-slate-100 pt-4 text-pretty text-sm text-slate-800">{{ supportCase.resolutionReason }}</p>
      </div>

      <!-- Section G: Ghi nhận kết quả (Form cho Service Manager khi chưa hoàn tất; không dùng cho case đổi thợ/dừng sửa) -->
      <div
        v-if="canManage && !isTerminal && !isTypedTechnicianReport && !isReplacementCase"
        class="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs"
      >
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CheckCircle2 :size="20" />
          </div>
          <h2 class="text-base font-semibold text-slate-900">Ghi nhận kết quả</h2>
        </div>

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
                <span
                  v-if="refundsToWallet"
                  class="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-pretty text-xs font-normal text-amber-800"
                  data-testid="refund-wallet-hint"
                >
                  Tiền hoàn vào ví khách là phần thực trả; FixHome chịu khoản hoàn. Với hóa đơn có voucher, quản lý phải nhập thêm giá gốc được duyệt hoàn để Backend đối chiếu trợ giá FixHome. Tiền hoàn luôn được ghi có vào ví FixHome của khách, kể cả đơn đã thanh toán qua VNPay hoặc tiền mặt, sau khi xác nhận giao dịch gốc đã thanh toán thành công.
                </span>
                <span
                  v-if="settlesCash"
                  class="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-pretty text-xs font-normal text-amber-800"
                >
                  Hoá đơn được ghi đã trả bằng tiền mặt, phí nền tảng trừ vào ví kỹ thuật viên, đơn hoàn tất nếu khách đã xác nhận công việc.
                </span>
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
                <input v-model="amountText" type="number" min="0" step="1" inputmode="numeric" :class="consoleField" class="h-10 font-num" />
              </label>
            </div>

            <label v-if="refundsToWallet" :class="consoleLabel" data-testid="funded-gross-refund-field">
              Giá gốc được duyệt hoàn (đơn có voucher, ₫)
              <input
                v-model="grossRefundText"
                data-testid="funded-gross-refund-input"
                type="number"
                min="1"
                max="2000000000"
                step="1"
                inputmode="numeric"
                :class="consoleField"
                class="h-10 font-num"
              />
              <span class="text-xs font-normal text-slate-500">Để trống với đơn không có voucher. Khác với tiền hoàn vào ví khách; Backend đối chiếu phần FixHome tài trợ.</span>
            </label>

            <label :class="consoleLabel">
              Lý do xử lý
              <textarea v-model="resolutionReason" maxlength="2000" rows="5" required :class="consoleTextarea" placeholder="Tối thiểu 10 ký tự" />
              <span class="self-end font-num text-xs font-normal text-slate-500">{{ resolutionReason.length }}/2000</span>
            </label>

            <label :class="consoleLabel">
              {{ escalating ? 'Mã bằng chứng nội bộ (UUID, không bắt buộc, mỗi dòng một mã)' : 'Bằng chứng (không bắt buộc, mỗi dòng một liên kết)' }}
              <textarea v-model="evidenceRefsText" rows="3" :class="consoleTextarea" />
            </label>
            <p v-if="escalating" class="text-sm text-slate-600">Hồ sơ tiếp tục rà soát và giữ nguyên việc giữ đơn; không thực hiện quyết định tiền hoặc trách nhiệm.</p>
          </fieldset>

          <Transition name="fh-fade-slide">
            <div v-if="formError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{{ formError }}</div>
          </Transition>

          <div class="flex justify-end">
            <FhButton v-if="resolutionNeedsReload" type="button" variant="secondary" @click="loadCase(caseId)">Tải lại hồ sơ</FhButton>
            <FhButton v-else type="submit" :disabled="submitting">{{ resolutionRetry ? 'Thử lại cùng lệnh' : 'Kiểm tra và xác nhận' }}</FhButton>
          </div>
        </form>
      </div>

      <!-- Confirm Dialog -->
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