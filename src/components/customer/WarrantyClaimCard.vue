<script setup lang="ts">
import { computed, ref } from 'vue';
import FhButton from '../FhButton.vue';
import WarrantyNextStep from '../WarrantyNextStep.vue';
import { ordersApi, type WarrantyClaimView } from '../../api/orders.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { formatCurrencyVND, formatDateTimeVN } from '../../utils/formatters';
import {
  claimDisplayMeta,
  claimOutcomeLabels,
  customerNextStep,
  inspectionResultLabels,
  notCoveredReasonLabels,
  warrantyClaimToneClasses,
  type ClaimOutcome,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

const props = defineProps<{
  claim: WarrantyClaimView;
  coverageLabel?: string;
}>();

const emit = defineEmits<{ (e: 'updated', claim: WarrantyClaimView): void }>();

const MIN_NOTE = 10;

const meta = computed(() => claimDisplayMeta(props.claim));
// The verdict colours the whole result block: covered reads green, not covered reads neutral.
const resultToneClasses = computed(() =>
  props.claim.inspection?.result === 'not_covered'
    ? 'border-ink-300 bg-ink-50 text-ink-900'
    : 'border-success-200 bg-success-50 text-success-800',
);
const nextStep = computed(() => customerNextStep(props.claim));
const waitingForMe = computed(
  () => props.claim.status === 'awaiting_customer' && !props.claim.customerResponse,
);
const agreed = computed(
  () => props.claim.status === 'awaiting_customer' && props.claim.customerResponse === 'agreed',
);

const completion = computed(() => props.claim.awaitingPrompt === 'completion');
const copy = computed(() =>
  completion.value
    ? {
        question: 'Kỹ thuật viên báo đã xử lý xong. Lỗi đã được khắc phục chưa?',
        agree: 'Đã khắc phục',
        dispute: 'Vẫn còn lỗi',
        reason: 'Lỗi còn lại như thế nào',
        agreed: 'Bạn đã xác nhận đã khắc phục. Quản lý dịch vụ sẽ xác nhận và đóng yêu cầu.',
        send: 'Gửi phản hồi',
      }
    : {
        question: 'Bạn có đồng ý với kết luận trên không?',
        agree: 'Đồng ý',
        dispute: 'Không đồng ý',
        reason: 'Lý do bạn không đồng ý',
        agreed: 'Bạn đã đồng ý với kết luận. Quản lý dịch vụ sẽ xác nhận và đóng yêu cầu.',
        send: 'Gửi phản đối',
      },
);

const disputing = ref(false);
const note = ref('');
const submitting = ref(false);
const error = ref('');

async function respond(decision: 'agree' | 'dispute') {
  if (submitting.value) return;
  if (decision === 'dispute' && note.value.trim().length < MIN_NOTE) {
    error.value = `Vui lòng mô tả lý do ít nhất ${MIN_NOTE} ký tự.`;
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const updated = await ordersApi.respondWarrantyClaim(props.claim.serviceOrderId, props.claim.id, {
      decision,
      ...(decision === 'dispute' ? { note: note.value.trim() } : {}),
    });
    disputing.value = false;
    note.value = '';
    emit('updated', updated);
  } catch (reason) {
    error.value = getSupportErrorMessage(
      reason,
      'Chưa xác nhận được kết quả. Vui lòng tải lại trạng thái trước khi thực hiện lại.',
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="p-4 rounded-xl border border-ink-200 bg-white space-y-3 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-base font-semibold text-ink-900">{{ coverageLabel || 'Yêu cầu bảo hành' }}</span>
      <span
        class="inline-flex items-center h-7 px-2.5 rounded-lg text-sm font-medium"
        :class="warrantyClaimToneClasses[meta.tone]"
      >
        {{ meta.label }}
      </span>
    </div>

    <WarrantyNextStep :step="nextStep" />

    <div class="space-y-1">
      <p class="text-xs font-medium text-ink-500">Bạn đã mô tả</p>
      <p class="text-ink-800 whitespace-pre-line">{{ claim.description }}</p>
    </div>

    <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2">
      <a
        v-for="url in claim.evidenceRefs"
        :key="url"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img :src="url" alt="Ảnh đính kèm yêu cầu bảo hành" class="w-16 h-16 object-cover rounded-lg border border-ink-200" />
      </a>
    </div>

    <p v-if="claim.submittedAfterExpiry" class="text-warning-700">
      Yêu cầu được gửi sau khi hạng mục hết hạn bảo hành, quản lý dịch vụ sẽ xem xét.
    </p>
    <p v-if="claim.resolutionNotes" class="p-2 bg-ink-50 rounded-[var(--radius-sm)] text-ink-800">
      <span class="font-semibold">Phản hồi:</span> {{ claim.resolutionNotes }}
    </p>
    <section v-if="claim.inspection" class="space-y-3 rounded-xl border p-4" :class="resultToneClasses" data-testid="claim-inspection">
      <h4 class="text-xs font-semibold uppercase tracking-wide opacity-80">Kết quả kiểm tra</h4>
      <div class="space-y-1">
        <p class="text-xs font-medium opacity-80">Kết luận</p>
        <p class="text-[15px] font-semibold leading-snug text-pretty">
          {{ inspectionResultLabels[claim.inspection.result as InspectionResult] ?? 'Chưa xác định' }}
        </p>
      </div>
      <p v-if="claim.inspection.result === 'not_covered' && claim.inspection.reasonCode" class="text-sm">
        <span class="font-semibold">Lý do:</span>
        {{ notCoveredReasonLabels[claim.inspection.reasonCode as NotCoveredReason] ?? 'Lý do khác' }}
      </p>
      <div v-if="claim.outcomeCode" class="rounded-lg bg-white/70 px-3 py-2" data-testid="claim-outcome">
        <p class="text-xs font-medium text-ink-500">Kết cục</p>
        <p class="text-sm font-semibold text-ink-900">
          {{ claimOutcomeLabels[claim.outcomeCode as ClaimOutcome] }}
          <template v-if="claim.outcomeCode === 'unfixed' && claim.refundAmount"> · Đã hoàn {{ formatCurrencyVND(claim.refundAmount) }} vào ví</template>
        </p>
      </div>
      <div v-if="claim.inspection.findings || claim.inspection.reServiceNotes" class="space-y-2 text-sm text-ink-800">
        <p v-if="claim.inspection.findings" class="whitespace-pre-line">
          <span class="font-semibold">Chẩn đoán của kỹ thuật viên:</span> {{ claim.inspection.findings }}
        </p>
        <p v-if="claim.inspection.reServiceNotes" class="whitespace-pre-line">
          <span class="font-semibold">Kỹ thuật viên ghi chú sau khi xử lý:</span> {{ claim.inspection.reServiceNotes }}
        </p>
      </div>
      <div v-if="claim.inspection.evidenceRefs?.length" class="flex flex-wrap gap-2">
        <a v-for="url in claim.inspection.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
          <img :src="url" alt="Ảnh kiểm tra" class="w-16 h-16 object-cover rounded-lg border border-ink-200" />
        </a>
      </div>
      <div v-if="claim.inspection.reServiceEvidenceRefs?.length" class="flex flex-wrap gap-2">
        <a v-for="url in claim.inspection.reServiceEvidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
          <img :src="url" alt="Ảnh sau xử lý" class="w-16 h-16 object-cover rounded-lg border border-ink-200" />
        </a>
      </div>
    </section>
    <!-- The customer's decision sits right under the result it is about, large enough to be the obvious next move -->
    <div v-if="waitingForMe" class="rounded-xl border-2 border-warning-300 bg-warning-50/60 p-4 space-y-3" data-testid="claim-decision">
      <template v-if="!disputing">
        <p class="text-base font-semibold text-ink-900 text-pretty">{{ copy.question }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FhButton variant="primary" size="lg" block :disabled="submitting" :loading="submitting" @click="respond('agree')">
            {{ copy.agree }}
          </FhButton>
          <FhButton variant="secondary" size="lg" block :disabled="submitting" @click="disputing = true">
            {{ copy.dispute }}
          </FhButton>
        </div>
      </template>
      <template v-else>
        <label :for="`dispute-${claim.id}`" class="block text-base font-semibold text-ink-900">{{ copy.reason }}</label>
        <textarea
          :id="`dispute-${claim.id}`"
          v-model="note"
          rows="3"
          maxlength="2000"
          class="w-full p-3 bg-white border border-ink-300 rounded-xl text-sm"
        ></textarea>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FhButton variant="secondary" size="lg" block :disabled="submitting" @click="disputing = false">Quay lại</FhButton>
          <FhButton variant="primary" size="lg" block :loading="submitting" :disabled="submitting" @click="respond('dispute')">
            {{ submitting ? 'Đang gửi yêu cầu…' : copy.send }}
          </FhButton>
        </div>
      </template>
      <p v-if="error" role="alert" class="text-sm text-danger-700">{{ error }}</p>
    </div>

    <p class="text-xs text-ink-600">
      Gửi lúc {{ formatDateTimeVN(claim.submittedAt) }}
      <template v-if="claim.resolvedAt"> · Hoàn tất lúc {{ formatDateTimeVN(claim.resolvedAt) }}</template>
      <template v-if="claim.technician"> · Kỹ thuật viên: {{ claim.technician.fullName }}</template>
    </p>

    <p v-if="agreed" role="status" class="rounded-xl bg-ink-50 px-3.5 py-2.5 text-ink-700">{{ copy.agreed }}</p>

  </div>
</template>
