<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, ArrowLeft, ExternalLink, ReceiptText } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { FhButton, FhCard, FhMoney, FhSkeleton, FhStatusPill } from '../../components';
import { supportCasesApi, type SupportCaseDetail } from '../../api/support-cases.api';
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
let latestRequest = 0;

async function loadCase(id: string) {
  const requestId = ++latestRequest;
  supportCase.value = null;
  loading.value = true;
  error.value = '';
  try {
    supportCase.value = await supportCasesApi.getCase(id);
  } catch (reason) {
    if (requestId !== latestRequest) return;
    error.value = getSupportErrorMessage(reason, 'Không thể tải chi tiết tranh chấp tiền mặt từ Backend.');
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

function openEvidence(value: string) {
  if (!isSafeEvidenceLink(value)) return;
  window.open(value, '_blank', 'noopener,noreferrer');
}

watch(caseId, (id) => {
  if (id) void loadCase(id);
  else loading.value = false;
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

    <FhSkeleton v-if="loading" height="96px" :count="3" rounded="md" />

    <div v-else-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800" role="alert">
      {{ error }}
      <button class="ml-3 font-semibold underline" type="button" @click="loadCase(caseId)">Thử lại</button>
    </div>

    <template v-else-if="supportCase">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="rounded bg-danger-50 px-2 py-1 font-mono text-[11px] font-semibold text-danger-700">{{ supportCase.id }}</span>
            <FhStatusPill :status="supportCase.status" :label="supportCaseStatusLabels[supportCase.status]" />
          </div>
          <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-900">
            <ReceiptText class="text-danger-600" :size="24" />
            {{ supportCaseTypeLabels[supportCase.caseType] }}
          </h1>
          <p class="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">{{ supportCase.reason }}</p>
        </div>
        <FhButton variant="secondary" size="sm" @click="router.push(`/console/support/${encodeURIComponent(supportCase.id)}`)">
          Mở form xử lý
        </FhButton>
      </div>

      <div v-if="!isCashCase(supportCase.caseType)" class="flex items-start gap-3 rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900" role="status">
        <AlertTriangle :size="18" class="mt-0.5 shrink-0" />
        <p>Case này không thuộc nhóm cash dispute. Trang vẫn giữ nguyên dữ liệu Backend và không thực hiện thao tác mutation.</p>
      </div>

      <FhCard class="border-danger-200 bg-danger-50/30">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-danger-50 text-danger-600"><AlertTriangle :size="20" /></div>
          <div>
            <h2 class="text-h2 text-ink-900">Đối soát tiền mặt — chỉ đọc</h2>
            <p class="mt-1 text-xs leading-relaxed text-ink-600">Các số tiền và trạng thái bên dưới là canonical context từ Backend. Không có thao tác xác nhận thanh toán, ghi đè payment success hoặc sửa CashSettlement/Invoice tại đây.</p>
          </div>
        </div>
      </FhCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <FhCard>
          <h2 class="mb-4 text-h2 text-ink-900">CashSettlement</h2>
          <div v-if="supportCase.cashSettlement" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2"><FhStatusPill :status="supportCase.cashSettlement.status" /><span class="font-mono text-[11px] text-ink-500">{{ supportCase.cashSettlement.id }}</span></div>
            <dl class="grid gap-4 sm:grid-cols-2"><div><dt class="text-xs text-ink-500">Declared amount</dt><dd class="mt-1"><FhMoney :amount="supportCase.cashSettlement.declaredAmount" emphasis /></dd></div><div><dt class="text-xs text-ink-500">Confirmed amount</dt><dd class="mt-1"><FhMoney v-if="supportCase.cashSettlement.confirmedAmount != null" :amount="supportCase.cashSettlement.confirmedAmount" emphasis /><span v-else class="text-sm italic text-ink-400">Chưa có từ Backend</span></dd></div><div><dt class="text-xs text-ink-500">Declared at</dt><dd class="mt-1 text-xs text-ink-700">{{ formatSupportDate(supportCase.cashSettlement.declaredAt) }}</dd></div><div><dt class="text-xs text-ink-500">Confirmed at</dt><dd class="mt-1 text-xs text-ink-700">{{ formatSupportDate(supportCase.cashSettlement.confirmedAt) }}</dd></div></dl>
            <p v-if="supportCase.cashSettlement.technicianNotes" class="border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-600">{{ supportCase.cashSettlement.technicianNotes }}</p>
            <div v-if="supportCase.cashSettlement.receiptEvidenceUrl" class="border-t border-ink-100 pt-3 text-xs">
              <span class="text-ink-500">Receipt evidence ref</span>
              <a v-if="isSafeEvidenceLink(supportCase.cashSettlement.receiptEvidenceUrl)" :href="supportCase.cashSettlement.receiptEvidenceUrl" target="_blank" rel="noopener noreferrer" class="mt-1 block break-all font-mono text-brand-700 underline" @click.prevent="openEvidence(supportCase.cashSettlement.receiptEvidenceUrl)">{{ supportCase.cashSettlement.receiptEvidenceUrl }} <ExternalLink :size="12" class="inline" /></a>
              <span v-else class="mt-1 block break-all font-mono text-ink-700">{{ supportCase.cashSettlement.receiptEvidenceUrl }}</span>
            </div>
          </div>
          <p v-else class="text-sm italic text-ink-400">Backend chưa cung cấp CashSettlement context.</p>
        </FhCard>

        <FhCard>
          <h2 class="mb-4 text-h2 text-ink-900">ServiceOrder / Invoice</h2>
          <div v-if="supportCase.serviceOrder" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-4">
            <div class="flex flex-wrap items-center gap-2"><span class="font-mono text-xs font-semibold text-ink-900">{{ supportCase.serviceOrder.code }}</span><FhStatusPill :status="supportCase.serviceOrder.status" /></div>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-ink-500">Payment status</dt><dd class="mt-1"><FhStatusPill :status="supportCase.serviceOrder.paymentStatus" /></dd></div><div><dt class="text-ink-500">ServiceOrder ID</dt><dd class="mt-1 break-all font-mono text-ink-700">{{ supportCase.serviceOrder.id }}</dd></div><div><dt class="text-ink-500">Labor total</dt><dd class="mt-1"><FhMoney :amount="supportCase.serviceOrder.laborTotal" /></dd></div><div><dt class="text-ink-500">Parts total</dt><dd class="mt-1"><FhMoney :amount="supportCase.serviceOrder.partsTotal" /></dd></div><div class="col-span-2 border-t border-ink-200 pt-2"><dt class="text-ink-500">Grand total</dt><dd class="mt-1"><FhMoney :amount="supportCase.serviceOrder.grandTotal" emphasis /></dd></div></dl>
          </div>
          <p v-else class="text-sm italic text-ink-400">Backend chưa cung cấp ServiceOrder context.</p>
          <div v-if="supportCase.invoice" class="mt-4 border-t border-ink-100 pt-4">
            <div class="flex items-center justify-between gap-2"><h3 class="text-sm font-semibold text-ink-900">Invoice {{ supportCase.invoice.id }}</h3><FhStatusPill :status="supportCase.invoice.paymentStatus" /></div>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-ink-500">Labor</dt><dd class="mt-1"><FhMoney :amount="supportCase.invoice.laborTotal" /></dd></div><div><dt class="text-ink-500">Parts</dt><dd class="mt-1"><FhMoney :amount="supportCase.invoice.partsTotal" /></dd></div><div class="col-span-2"><dt class="text-ink-500">Grand total</dt><dd class="mt-1"><FhMoney :amount="supportCase.invoice.grandTotal" emphasis /></dd></div><div class="col-span-2 text-ink-500">Issued: {{ formatSupportDate(supportCase.invoice.issuedAt) }}<br />Paid: {{ formatSupportDate(supportCase.invoice.paidAt) }}</div></dl>
          </div>
          <p v-else class="mt-4 border-t border-ink-100 pt-4 text-xs italic text-ink-400">Backend chưa cung cấp Invoice context.</p>
        </FhCard>
      </div>

      <FhCard>
        <h2 class="mb-3 text-h2 text-ink-900">Tham chiếu case</h2>
        <dl class="grid gap-3 text-xs sm:grid-cols-3"><div><dt class="text-ink-500">Booking ID</dt><dd class="mt-1 break-all font-mono text-ink-800">{{ supportCase.bookingId ?? '—' }}</dd></div><div><dt class="text-ink-500">ServiceOrder ID</dt><dd class="mt-1 break-all font-mono text-ink-800">{{ supportCase.serviceOrderId ?? '—' }}</dd></div><div><dt class="text-ink-500">Created</dt><dd class="mt-1 text-ink-700">{{ formatSupportDate(supportCase.createdAt) }}</dd></div></dl>
        <p class="mt-4 text-xs text-ink-500">Resolution được thực hiện tại màn hình chi tiết chuẩn để giữ nguyên confirmation và duplicate-submit guard.</p>
      </FhCard>
    </template>
  </div>
</template>
