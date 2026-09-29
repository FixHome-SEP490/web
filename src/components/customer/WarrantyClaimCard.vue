<script setup lang="ts">
import { computed, ref } from 'vue';
import FhButton from '../FhButton.vue';
import { ordersApi, type WarrantyClaimView } from '../../api/orders.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { formatDateTimeVN } from '../../utils/formatters';
import { claimStatusMeta, warrantyClaimToneClasses } from '../../utils/warranty-claim';

const props = defineProps<{
  claim: WarrantyClaimView;
  coverageLabel?: string;
}>();

const emit = defineEmits<{ (e: 'updated', claim: WarrantyClaimView): void }>();

const MIN_NOTE = 10;

const meta = computed(() => claimStatusMeta(props.claim.status));
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
  <div class="p-3 rounded-[var(--radius-sm)] border border-ink-200 bg-white space-y-2 text-xs">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-semibold text-ink-900">{{ coverageLabel || 'Yêu cầu bảo hành' }}</span>
      <span
        class="inline-flex items-center h-[24px] px-2 rounded-[var(--radius-sm)] text-[12px] font-medium"
        :class="warrantyClaimToneClasses[meta.tone]"
      >
        {{ meta.label }}
      </span>
    </div>

    <p class="text-ink-700 whitespace-pre-line">{{ claim.description }}</p>

    <div v-if="claim.evidenceRefs?.length" class="flex flex-wrap gap-2">
      <a
        v-for="url in claim.evidenceRefs"
        :key="url"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img :src="url" alt="Ảnh đính kèm yêu cầu bảo hành" class="w-14 h-14 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
      </a>
    </div>

    <p v-if="claim.submittedAfterExpiry" class="text-warning-700">
      Yêu cầu được gửi sau khi hạng mục hết hạn bảo hành, quản lý dịch vụ sẽ xem xét.
    </p>
    <p v-if="claim.resolutionNotes" class="p-2 bg-ink-50 rounded-[var(--radius-sm)] text-ink-800">
      <span class="font-semibold">Phản hồi:</span> {{ claim.resolutionNotes }}
    </p>
    <p class="text-[11px] text-ink-500">
      Gửi lúc {{ formatDateTimeVN(claim.submittedAt) }}
      <template v-if="claim.technician"> · Kỹ thuật viên: {{ claim.technician.fullName }}</template>
    </p>

    <p v-if="agreed" role="status" class="text-ink-600">{{ copy.agreed }}</p>

    <div v-if="waitingForMe" class="pt-2 border-t border-ink-100 space-y-2">
      <template v-if="!disputing">
        <p class="text-ink-700">{{ copy.question }}</p>
        <div class="flex flex-wrap gap-2">
          <FhButton variant="secondary" size="sm" :disabled="submitting" @click="respond('agree')">
            {{ copy.agree }}
          </FhButton>
          <FhButton variant="ghost" size="sm" :disabled="submitting" @click="disputing = true">
            {{ copy.dispute }}
          </FhButton>
        </div>
      </template>
      <template v-else>
        <label :for="`dispute-${claim.id}`" class="block font-medium text-ink-700">{{ copy.reason }}</label>
        <textarea
          :id="`dispute-${claim.id}`"
          v-model="note"
          rows="3"
          maxlength="2000"
          class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
        ></textarea>
        <div class="flex flex-wrap gap-2">
          <FhButton variant="ghost" size="sm" :disabled="submitting" @click="disputing = false">Quay lại</FhButton>
          <FhButton variant="primary" size="sm" :loading="submitting" :disabled="submitting" @click="respond('dispute')">
            {{ submitting ? 'Đang gửi yêu cầu…' : copy.send }}
          </FhButton>
        </div>
      </template>
      <p v-if="error" role="alert" class="text-danger-700">{{ error }}</p>
    </div>
  </div>
</template>
