<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { warrantyManagerApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import {
  inspectionResultLabels,
  notCoveredReasonLabels,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

export type WarrantyDecisionMode = 'assign' | 'approve' | 'reject' | 'close';

const props = defineProps<{
  claim: StaffWarrantyClaim | null;
  mode: WarrantyDecisionMode | null;
  technicians: { id: string; fullName: string }[];
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', claim: StaffWarrantyClaim): void }>();

const MIN_NOTE = 10;

const technicianId = ref('');
const result = ref<InspectionResult>('covered_part');
const reasonCode = ref<NotCoveredReason>('other_component');
const customerNote = ref('');
const outcome = ref<'resolved' | 'rejected'>('resolved');
const closeNote = ref('');
const submitting = ref(false);
const error = ref('');

const open = computed(() => !!props.claim && !!props.mode);
const proposal = computed(() => props.claim?.visit?.proposedResult ?? null);
const notCovered = computed(() => result.value === 'not_covered');
const customerAgreed = computed(
  () => props.claim?.status === 'awaiting_customer' && props.claim.customerResponse === 'agreed',
);
const title = computed(
  () =>
    ({
      assign: props.claim?.technician ? 'Phân công lại kỹ thuật viên' : 'Phân công kỹ thuật viên',
      approve: 'Duyệt kết luận kiểm tra',
      reject: 'Từ chối yêu cầu bảo hành',
      close: 'Đóng yêu cầu bảo hành',
    })[props.mode ?? 'assign'],
);
const assignable = computed(() => props.technicians.filter((t) => t.id !== props.claim?.technician?.id));

watch(open, (isOpen) => {
  if (!isOpen || !props.claim) return;
  error.value = '';
  technicianId.value = '';
  customerNote.value = '';
  closeNote.value = '';
  outcome.value = props.claim.awaitingPrompt === 'completion' || props.claim.status === 'in_progress' ? 'resolved' : 'rejected';
  result.value = proposal.value ?? 'covered_part';
  reasonCode.value = (props.claim.visit?.notCoveredReasonCode as NotCoveredReason) || 'other_component';
}, { immediate: true });

function close() {
  if (!submitting.value) emit('close');
}

function validate(mode: WarrantyDecisionMode): string {
  if (mode === 'assign' && !technicianId.value) return 'Vui lòng chọn kỹ thuật viên.';
  if (mode === 'approve' && notCovered.value && customerNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng nhập nội dung giải thích cho khách hàng (ít nhất ${MIN_NOTE} ký tự).`;
  }
  if (mode === 'reject' && customerNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng nhập nội dung giải thích cho khách hàng (ít nhất ${MIN_NOTE} ký tự).`;
  }
  if (mode === 'close' && !customerAgreed.value && closeNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng nhập ghi chú đóng yêu cầu (ít nhất ${MIN_NOTE} ký tự).`;
  }
  return '';
}

async function run(claim: StaffWarrantyClaim, mode: WarrantyDecisionMode): Promise<StaffWarrantyClaim> {
  if (mode === 'assign') return warrantyManagerApi.assign(claim.id, technicianId.value);
  if (mode === 'approve') {
    return warrantyManagerApi.approve(claim.id, {
      ...(result.value !== proposal.value ? { result: result.value } : {}),
      ...(notCovered.value ? { reasonCode: reasonCode.value } : {}),
      ...(customerNote.value.trim() ? { customerNote: customerNote.value.trim() } : {}),
    });
  }
  if (mode === 'reject') {
    return warrantyManagerApi.reject(claim.id, { reasonCode: reasonCode.value, customerNote: customerNote.value.trim() });
  }
  return warrantyManagerApi.close(claim.id, {
    outcome: outcome.value,
    ...(closeNote.value.trim() ? { note: closeNote.value.trim() } : {}),
  });
}

async function submit() {
  if (!props.claim || !props.mode || submitting.value) return;
  const invalid = validate(props.mode);
  if (invalid) {
    error.value = invalid;
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    emit('done', await run(props.claim, props.mode));
  } catch (reason) {
    error.value = getSupportErrorMessage(
      reason,
      'Chưa xác nhận được kết quả. Vui lòng tải lại danh sách trước khi thực hiện lại.',
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="open && claim && mode"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-xs p-4"
    @keydown.esc="close"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="warranty-decision-title"
      class="bg-white rounded-[var(--radius-lg)] max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between">
        <h3 id="warranty-decision-title" class="text-base font-bold text-ink-900">{{ title }}</h3>
        <button type="button" class="p-1 rounded-full hover:bg-ink-100" aria-label="Đóng" @click="close">
          <X :size="18" />
        </button>
      </div>

      <div class="p-3 rounded-[var(--radius-sm)] bg-ink-50 text-xs space-y-1">
        <p>
          Đơn <span class="font-mono font-bold text-brand-700">{{ claim.order.code }}</span> ·
          {{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }} · Khách hàng: {{ claim.order.customerName }}
        </p>
        <p class="whitespace-pre-line text-ink-700">{{ claim.description }}</p>
        <p v-if="claim.submittedAfterExpiry" class="text-warning-700">Yêu cầu được gửi sau khi hạng mục hết hạn bảo hành.</p>
      </div>

      <template v-if="mode === 'assign'">
        <div class="space-y-1">
          <label for="warranty-assign" class="text-xs font-medium text-ink-700">Kỹ thuật viên</label>
          <select
            id="warranty-assign"
            v-model="technicianId"
            class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          >
            <option value="" disabled>Chọn kỹ thuật viên</option>
            <option v-for="tech in assignable" :key="tech.id" :value="tech.id">{{ tech.fullName }}</option>
          </select>
        </div>
        <p class="text-xs text-ink-500">Yêu cầu quay lại bước chờ nhận; các lượt kiểm tra đang mở sẽ bị hủy.</p>
      </template>

      <template v-else-if="mode === 'approve'">
        <div v-if="claim.visit" class="p-3 rounded-[var(--radius-sm)] border border-ink-200 text-xs space-y-1.5">
          <p class="font-semibold text-ink-800">Đề xuất của kỹ thuật viên</p>
          <p>{{ proposal ? inspectionResultLabels[proposal] : '—' }}</p>
          <p v-if="claim.visit.notCoveredReasonCode">
            Lý do: {{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || claim.visit.notCoveredReasonCode }}
          </p>
          <p class="whitespace-pre-line text-ink-700">{{ claim.visit.findings }}</p>
          <div v-if="claim.visit.evidenceRefs?.length" class="flex flex-wrap gap-2">
            <a v-for="url in claim.visit.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
              <img :src="url" alt="Bằng chứng của kỹ thuật viên" class="w-14 h-14 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
            </a>
          </div>
        </div>
        <fieldset class="space-y-1.5">
          <legend class="text-xs font-medium text-ink-700 mb-1">Kết luận cuối cùng</legend>
          <label
            v-for="(label, value) in inspectionResultLabels"
            :key="value"
            class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs cursor-pointer"
            :class="result === value ? 'border-brand-600 bg-brand-50' : ''"
          >
            <input v-model="result" type="radio" name="warranty-final" :value="value" />
            {{ label }}
            <span v-if="value === proposal" class="ml-auto text-ink-500">Đề xuất</span>
          </label>
        </fieldset>
        <p v-if="proposal && result !== proposal" class="text-xs text-warning-700">
          Bạn đang đổi kết luận so với đề xuất của kỹ thuật viên; thay đổi này được ghi vào thống kê.
        </p>
        <div v-if="notCovered" class="space-y-1">
          <label for="warranty-final-reason" class="text-xs font-medium text-ink-700">Lý do không bảo hành</label>
          <select
            id="warranty-final-reason"
            v-model="reasonCode"
            class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          >
            <option v-for="(label, value) in notCoveredReasonLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label for="warranty-customer-note" class="text-xs font-medium text-ink-700">
            Nội dung gửi khách hàng {{ notCovered ? '' : '(không bắt buộc)' }}
          </label>
          <textarea
            id="warranty-customer-note"
            v-model="customerNote"
            rows="4"
            maxlength="2000"
            class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          ></textarea>
        </div>
      </template>

      <template v-else-if="mode === 'reject'">
        <div class="space-y-1">
          <label for="warranty-reject-reason" class="text-xs font-medium text-ink-700">Lý do từ chối</label>
          <select
            id="warranty-reject-reason"
            v-model="reasonCode"
            class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          >
            <option v-for="(label, value) in notCoveredReasonLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label for="warranty-reject-note" class="text-xs font-medium text-ink-700">Nội dung gửi khách hàng</label>
          <textarea
            id="warranty-reject-note"
            v-model="customerNote"
            rows="4"
            maxlength="2000"
            class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          ></textarea>
        </div>
      </template>

      <template v-else>
        <fieldset class="space-y-1.5">
          <legend class="text-xs font-medium text-ink-700 mb-1">Kết quả đóng</legend>
          <label class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs cursor-pointer" :class="outcome === 'resolved' ? 'border-brand-600 bg-brand-50' : ''">
            <input v-model="outcome" type="radio" name="warranty-outcome" value="resolved" /> Đã hoàn tất bảo hành
          </label>
          <label class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs cursor-pointer" :class="outcome === 'rejected' ? 'border-brand-600 bg-brand-50' : ''">
            <input v-model="outcome" type="radio" name="warranty-outcome" value="rejected" /> Không được bảo hành
          </label>
        </fieldset>
        <p v-if="claim.status === 'disputed'" class="text-xs text-warning-700">
          Yêu cầu bị khách phản đối: quản lý đã duyệt lần đầu không thể tự đóng, cần một quản lý khác xem xét.
        </p>
        <div class="space-y-1">
          <label for="warranty-close-note" class="text-xs font-medium text-ink-700">
            Ghi chú {{ customerAgreed ? '(không bắt buộc vì khách hàng đã đồng ý)' : '' }}
          </label>
          <textarea
            id="warranty-close-note"
            v-model="closeNote"
            rows="3"
            maxlength="2000"
            class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          ></textarea>
        </div>
      </template>

      <p v-if="error" role="alert" class="text-xs text-danger-700">{{ error }}</p>

      <div class="flex gap-2 pt-2">
        <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting" @click="close">Đóng</FhButton>
        <FhButton variant="primary" size="sm" class="flex-1" :loading="submitting" :disabled="submitting" @click="submit">
          {{ submitting ? 'Đang gửi yêu cầu…' : 'Xác nhận' }}
        </FhButton>
      </div>
    </div>
  </div>
</template>
