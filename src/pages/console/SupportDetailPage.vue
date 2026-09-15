<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, LifeBuoy, LockKeyhole, ReceiptText } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import {
  FhButton,
  FhCard,
  FhConfirmDialog,
  FhEmptyState,
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
  } catch (reason) {
    if (requestId !== latestRequest) return;
    error.value = getSupportErrorMessage(reason, 'Không thể tải chi tiết support case từ Backend.');
  } finally {
    if (requestId === latestRequest) loading.value = false;
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
    formError.value = 'Mã xử lý là bắt buộc.';
    return null;
  }
  if (code.length > 128) {
    formError.value = 'Mã xử lý không được vượt quá 128 ký tự.';
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
    formError.value = 'Chỉ được gửi tối đa 20 evidence reference.';
    return null;
  }
  if (evidenceRefs.some((ref) => ref.length > 500)) {
    formError.value = 'Mỗi evidence reference không được vượt quá 500 ký tự.';
    return null;
  }

  const payload: SupportCaseResolvePayload = {
    finalStatus: finalStatus.value,
    resolutionCode: code,
    reason,
  };
  if (evidenceRefs.length > 0) payload.evidenceRefs = evidenceRefs;
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
    successMessage.value = 'Backend đã ghi nhận kết quả xử lý support case.';
    showConfirm.value = false;
    pendingPayload.value = null;
  } catch (reason) {
    error.value = getSupportErrorMessage(reason, 'Backend không thể ghi nhận kết quả xử lý.');
    showConfirm.value = false;
  } finally {
    submitting.value = false;
  }
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
    <div class="flex items-center justify-between gap-3">
      <button
        class="inline-flex min-h-[36px] items-center gap-1.5 rounded px-2 text-xs font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        type="button"
        @click="router.push('/console/support')"
      >
        <ArrowLeft :size="16" />
        Quay lại hàng đợi
      </button>
      <span class="font-mono text-[11px] text-ink-400">{{ caseId || '—' }}</span>
    </div>

    <FhSkeleton v-if="loading" height="96px" :count="4" rounded="md" />

    <div v-else-if="error && !supportCase" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
      {{ error }}
      <button class="ml-3 font-semibold underline" type="button" @click="loadCase(caseId)">Thử lại</button>
    </div>

    <template v-else-if="supportCase">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="rounded bg-brand-50 px-2 py-1 font-mono text-[11px] font-semibold text-brand-700">{{ supportCase.id }}</span>
            <FhStatusPill :status="supportCase.status" :label="supportCaseStatusLabels[supportCase.status]" />
          </div>
          <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-900">
            <LifeBuoy class="text-brand-600" :size="24" />
            {{ supportCaseTypeLabels[supportCase.caseType] }}
          </h1>
          <p class="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">{{ supportCase.reason }}</p>
        </div>
        <FhButton
          v-if="isCashCase(supportCase.caseType)"
          variant="secondary"
          size="sm"
          @click="router.push(`/console/support/cash/${encodeURIComponent(supportCase.id)}`)"
        >
          <ReceiptText :size="14" />
          Bản xem tiền mặt
        </FhButton>
      </div>

      <div v-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
        {{ error }}
      </div>
      <div v-if="successMessage" class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800" role="status">
        <CheckCircle2 :size="16" />
        {{ successMessage }}
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <FhCard>
          <h2 class="mb-4 flex items-center gap-2 text-h2 text-ink-900"><FileText :size="18" class="text-brand-600" /> Metadata case</h2>
          <dl class="grid gap-3 text-xs sm:grid-cols-2">
            <div><dt class="text-ink-500">Booking ID</dt><dd class="mt-1 font-mono font-semibold text-ink-900">{{ supportCase.bookingId ?? '—' }}</dd></div>
            <div><dt class="text-ink-500">Service order ID</dt><dd class="mt-1 font-mono font-semibold text-ink-900">{{ supportCase.serviceOrderId ?? '—' }}</dd></div>
            <div><dt class="text-ink-500">Customer ID</dt><dd class="mt-1 font-mono text-ink-700">{{ supportCase.customerId ?? '—' }}</dd></div>
            <div><dt class="text-ink-500">Technician ID</dt><dd class="mt-1 font-mono text-ink-700">{{ supportCase.technicianId ?? '—' }}</dd></div>
            <div><dt class="text-ink-500">Manager phụ trách</dt><dd class="mt-1 font-mono text-ink-700">{{ supportCase.assignedManagerId ?? '—' }}</dd></div>
            <div><dt class="text-ink-500">Tạo / cập nhật</dt><dd class="mt-1 text-ink-700">{{ formatSupportDate(supportCase.createdAt) }}<br />{{ formatSupportDate(supportCase.updatedAt) }}</dd></div>
          </dl>
          <div v-if="supportCase.description" class="mt-4 border-t border-ink-100 pt-4 text-sm leading-relaxed text-ink-700">
            <span class="text-xs font-semibold text-ink-500">Mô tả bổ sung</span>
            <p class="mt-1">{{ supportCase.description }}</p>
          </div>
        </FhCard>

        <FhCard>
          <h2 class="mb-4 flex items-center gap-2 text-h2 text-ink-900"><LockKeyhole :size="18" class="text-brand-600" /> Evidence references</h2>
          <p class="mb-3 text-xs leading-relaxed text-ink-500">Các giá trị dưới đây chỉ là opaque reference do Backend cung cấp; không đồng nghĩa quyền truy cập KYC công khai.</p>
          <div v-if="supportCase.evidenceRefs?.length" class="space-y-2">
            <div v-for="refValue in supportCase.evidenceRefs" :key="refValue" class="flex items-start gap-2 rounded border border-ink-100 bg-ink-50 px-3 py-2">
              <a
                v-if="isSafeEvidenceLink(refValue)"
                class="min-w-0 break-all text-xs font-mono text-brand-700 underline hover:text-brand-900"
                :href="refValue"
                target="_blank"
                rel="noopener noreferrer"
                @click.prevent="openEvidence(refValue)"
              >{{ refValue }} <ExternalLink :size="12" class="inline" /></a>
              <span v-else class="min-w-0 break-all text-xs font-mono text-ink-700">{{ refValue }}</span>
            </div>
          </div>
          <p v-else class="text-xs italic text-ink-400">Backend chưa cung cấp evidence reference.</p>
        </FhCard>
      </div>

      <FhCard v-if="supportCase.booking || supportCase.serviceOrder || supportCase.invoice || supportCase.cashSettlement">
        <h2 class="mb-4 text-h2 text-ink-900">Context readonly từ Backend</h2>
        <p class="mb-4 text-xs text-ink-500">Thông tin dưới đây chỉ để đối chiếu. Trang này không thay đổi Booking, ServiceOrder, Invoice hoặc CashSettlement.</p>
        <div class="grid gap-4 xl:grid-cols-2">
          <div v-if="supportCase.booking" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-4">
            <h3 class="text-sm font-semibold text-ink-900">Booking</h3>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-ink-500">ID</dt><dd class="mt-1 font-mono text-ink-800">{{ supportCase.booking.id }}</dd></div><div><dt class="text-ink-500">Trạng thái</dt><dd class="mt-1"><FhStatusPill :status="supportCase.booking.status" /></dd></div><div><dt class="text-ink-500">Customer ID</dt><dd class="mt-1 font-mono text-ink-800">{{ supportCase.booking.customerId }}</dd></div><div><dt class="text-ink-500">Service ID</dt><dd class="mt-1 font-mono text-ink-800">{{ supportCase.booking.serviceId }}</dd></div></dl>
          </div>
          <div v-if="supportCase.serviceOrder" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-4">
            <h3 class="text-sm font-semibold text-ink-900">ServiceOrder</h3>
            <div class="mt-3 flex flex-wrap items-center gap-2"><span class="font-mono text-xs text-ink-700">{{ supportCase.serviceOrder.code }}</span><FhStatusPill :status="supportCase.serviceOrder.status" /></div>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-ink-500">Payment</dt><dd class="mt-1"><FhStatusPill :status="supportCase.serviceOrder.paymentStatus" /></dd></div><div><dt class="text-ink-500">ID</dt><dd class="mt-1 font-mono text-ink-800">{{ supportCase.serviceOrder.id }}</dd></div><div><dt class="text-ink-500">Công</dt><dd class="mt-1"><FhMoney :amount="supportCase.serviceOrder.laborTotal" /></dd></div><div><dt class="text-ink-500">Phụ tùng</dt><dd class="mt-1"><FhMoney :amount="supportCase.serviceOrder.partsTotal" /></dd></div><div class="col-span-2 border-t border-ink-200 pt-2"><dt class="text-ink-500">Tổng Backend</dt><dd class="mt-1"><FhMoney :amount="supportCase.serviceOrder.grandTotal" emphasis /></dd></div></dl>
          </div>
          <div v-if="supportCase.invoice" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-4">
            <h3 class="text-sm font-semibold text-ink-900">Invoice</h3>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-ink-500">ID</dt><dd class="mt-1 font-mono text-ink-800">{{ supportCase.invoice.id }}</dd></div><div><dt class="text-ink-500">Payment</dt><dd class="mt-1"><FhStatusPill :status="supportCase.invoice.paymentStatus" /></dd></div><div><dt class="text-ink-500">Công</dt><dd class="mt-1"><FhMoney :amount="supportCase.invoice.laborTotal" /></dd></div><div><dt class="text-ink-500">Phụ tùng</dt><dd class="mt-1"><FhMoney :amount="supportCase.invoice.partsTotal" /></dd></div><div class="col-span-2 border-t border-ink-200 pt-2"><dt class="text-ink-500">Tổng Backend</dt><dd class="mt-1"><FhMoney :amount="supportCase.invoice.grandTotal" emphasis /></dd></div><div class="col-span-2 text-ink-500">Issued: {{ formatSupportDate(supportCase.invoice.issuedAt) }}<br />Paid: {{ formatSupportDate(supportCase.invoice.paidAt) }}</div></dl>
          </div>
          <div v-if="supportCase.cashSettlement" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-4">
            <h3 class="text-sm font-semibold text-ink-900">CashSettlement</h3>
            <div class="mt-3 flex items-center gap-2"><FhStatusPill :status="supportCase.cashSettlement.status" /><span class="font-mono text-[11px] text-ink-500">{{ supportCase.cashSettlement.id }}</span></div>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-ink-500">Đã khai báo</dt><dd class="mt-1"><FhMoney :amount="supportCase.cashSettlement.declaredAmount" emphasis /></dd></div><div><dt class="text-ink-500">Đã xác nhận</dt><dd class="mt-1"><FhMoney v-if="supportCase.cashSettlement.confirmedAmount != null" :amount="supportCase.cashSettlement.confirmedAmount" /><span v-else class="text-ink-400">—</span></dd></div><div><dt class="text-ink-500">Khai báo lúc</dt><dd class="mt-1 text-ink-700">{{ formatSupportDate(supportCase.cashSettlement.declaredAt) }}</dd></div><div><dt class="text-ink-500">Xác nhận lúc</dt><dd class="mt-1 text-ink-700">{{ formatSupportDate(supportCase.cashSettlement.confirmedAt) }}</dd></div></dl>
            <p v-if="supportCase.cashSettlement.technicianNotes" class="mt-3 border-t border-ink-200 pt-3 text-xs leading-relaxed text-ink-600">{{ supportCase.cashSettlement.technicianNotes }}</p>
          </div>
        </div>
      </FhCard>

      <FhCard v-if="supportCase.resolutionCode || supportCase.resolutionReason || supportCase.resolvedAt" class="border-success-200">
        <h2 class="mb-3 flex items-center gap-2 text-h2 text-ink-900"><CheckCircle2 :size="18" class="text-success-600" /> Kết quả đã ghi nhận</h2>
        <dl class="grid gap-3 text-xs sm:grid-cols-3"><div><dt class="text-ink-500">Mã xử lý</dt><dd class="mt-1 font-mono font-semibold text-ink-900">{{ supportCase.resolutionCode ?? '—' }}</dd></div><div><dt class="text-ink-500">Thời điểm</dt><dd class="mt-1 text-ink-700">{{ formatSupportDate(supportCase.resolvedAt) }}</dd></div><div class="sm:col-span-1"><dt class="text-ink-500">Lý do</dt><dd class="mt-1 leading-relaxed text-ink-700">{{ supportCase.resolutionReason ?? '—' }}</dd></div></dl>
      </FhCard>

      <FhCard v-if="!isTerminal" class="border-brand-200">
        <h2 class="mb-1 text-h2 text-ink-900">Ghi nhận kết quả xử lý</h2>
        <p class="mb-5 text-xs text-ink-500">Backend là nơi quyết định trạng thái cuối cùng. Kiểm tra kỹ nội dung trước khi xác nhận.</p>
        <form class="space-y-4" @submit.prevent="submitResolution">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-700">
              Trạng thái cuối <span class="text-danger-600">*</span>
              <select v-model="finalStatus" class="h-10 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <option value="resolved">resolved — Đã giải quyết</option>
                <option value="rejected">rejected — Từ chối</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-700">
              Resolution code <span class="text-danger-600">*</span>
              <input v-model="resolutionCode" maxlength="128" type="text" required class="h-10 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" placeholder="Ví dụ: CASH_CONFIRMED" />
              <span class="font-normal text-ink-400">Tối đa 128 ký tự · {{ resolutionCode.length }}/128</span>
            </label>
          </div>
          <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-700">
            Lý do xử lý <span class="text-danger-600">*</span>
            <textarea v-model="resolutionReason" maxlength="2000" rows="5" required class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm font-normal leading-relaxed text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" placeholder="Nhập lý do có thể kiểm toán, tối thiểu 10 ký tự." />
            <span class="font-normal text-ink-400">10–2000 ký tự · {{ resolutionReason.length }}/2000</span>
          </label>
          <label class="flex flex-col gap-1.5 text-xs font-semibold text-ink-700">
            Evidence references <span class="font-normal text-ink-400">(tuỳ chọn, mỗi dòng một ref; tối đa 20 dòng, 500 ký tự/ref)</span>
            <textarea v-model="evidenceRefsText" rows="3" class="rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" placeholder="audit://case/123" />
          </label>
          <div v-if="formError" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-800" role="alert">{{ formError }}</div>
          <div class="flex justify-end">
            <FhButton type="submit" :disabled="submitting">Kiểm tra và xác nhận</FhButton>
          </div>
        </form>
      </FhCard>

      <FhEmptyState
        v-else
        title="Case đã kết thúc"
        description="Support case này đã có trạng thái cuối từ Backend; form resolution không còn khả dụng."
        :icon="CheckCircle2"
      />

      <FhConfirmDialog
        :open="showConfirm"
        :loading="submitting"
        :danger="pendingPayload?.finalStatus === 'rejected'"
        title="Xác nhận kết quả support case"
        :consequence="`Backend sẽ ghi nhận trạng thái cuối: ${pendingPayload?.finalStatus ?? '—'}. Hành động này không thay đổi dữ liệu Booking, ServiceOrder, Invoice hoặc CashSettlement.`"
        confirm-text="Gửi kết quả"
        cancel-text="Kiểm tra lại"
        @confirm="confirmResolution"
        @cancel="cancelResolution"
      />
    </template>
  </div>
</template>
