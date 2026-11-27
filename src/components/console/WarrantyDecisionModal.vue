<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { consoleField, consoleTextarea } from './console-ui';
import { warrantyManagerApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { partsCatalogApi } from '../../api/parts-catalog.api';
import type { FixHomePart } from '../../api/admin-parts.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import {
  inspectionResultLabels,
  notCoveredReasonLabels,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

export type WarrantyDecisionMode = 'approve' | 'reject' | 'close' | 'review';

const props = defineProps<{
  claim: StaffWarrantyClaim | null;
  mode: WarrantyDecisionMode | null;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', claim: StaffWarrantyClaim): void }>();

const MIN_NOTE = 10;

const result = ref<InspectionResult>('covered_part');
const reasonCode = ref<NotCoveredReason>('other_component');
const customerNote = ref('');
const outcome = ref<'resolved' | 'rejected' | 'unfixed'>('resolved');
const closeNote = ref('');
const refundAmount = ref('');
const overrideReason = ref('');
const reviewValid = ref(true);
const reviewNote = ref('');
const partSearch = ref('');
// The manager normally just approves what the technician proposed; changing it is the exception.
const changing = ref(false);
const partOptions = ref<FixHomePart[]>([]);
const partId = ref('');
const partQty = ref(1);
let partTimer: ReturnType<typeof setTimeout> | undefined;
const submitting = ref(false);
const error = ref('');

const open = computed(() => !!props.claim && !!props.mode);
const proposal = computed(() => props.claim?.visit?.proposedResult ?? null);
const notCovered = computed(() => result.value === 'not_covered');
const overriding = computed(() => !!proposal.value && result.value !== proposal.value);
// A workmanship fault can still need a FixHome part; the technician then pays for it.
const workmanship = computed(() => result.value === 'covered_workmanship');
// What the technician saw: a part fault supplies exactly these FixHome lines unless the manager picks others.
const faultyLines = computed(() => {
  const ids = new Set(props.claim?.visit?.faultyInvoiceItemIds ?? []);
  return (props.claim?.order.partLines ?? []).filter((line) => ids.has(line.id));
});
const unfixed = computed(() => outcome.value === 'unfixed');
// A claim concluded "not covered" can only be closed as rejected (the backend enforces it too). The queue row has no decision block, so this only shows on the detail page.
const finalNotCovered = computed(
  () => (props.claim as { detail?: { decision?: { finalResult?: string | null } } } | null)?.detail?.decision?.finalResult === 'not_covered',
);
const customerAgreed = computed(
  () => props.claim?.status === 'awaiting_customer' && props.claim.customerResponse === 'agreed',
);
const title = computed(
  () =>
    ({
      approve: 'Duyệt kết luận kiểm tra',
      reject: 'Từ chối yêu cầu bảo hành',
      close: 'Đóng yêu cầu bảo hành',
      review: props.claim?.noShowFlaggedAt ? 'Xét việc không đến kiểm tra' : 'Xét việc không phản hồi',
    })[props.mode ?? 'approve'],
);

watch(open, (isOpen) => {
  if (!isOpen || !props.claim) return;
  error.value = '';
  customerNote.value = '';
  closeNote.value = '';
  refundAmount.value = '';
  overrideReason.value = '';
  reviewValid.value = true;
  reviewNote.value = '';
  changing.value = false;
  partSearch.value = '';
  partOptions.value = [];
  partId.value = '';
  partQty.value = 1;
  outcome.value = !finalNotCovered.value && (props.claim.awaitingPrompt === 'completion' || props.claim.status === 'in_progress') ? 'resolved' : 'rejected';
  result.value = proposal.value ?? 'covered_part';
  reasonCode.value = (props.claim.visit?.notCoveredReasonCode as NotCoveredReason) || 'other_component';
}, { immediate: true });

watch(partSearch, (term) => {
  clearTimeout(partTimer);
  partTimer = setTimeout(async () => {
    if (term.trim().length < 2) {
      partOptions.value = [];
      return;
    }
    try {
      partOptions.value = (await partsCatalogApi.getCatalog({ search: term.trim(), limit: 10 })).data;
    } catch {
      partOptions.value = [];
    }
  }, 300);
});

function close() {
  if (!submitting.value) emit('close');
}

function validate(mode: WarrantyDecisionMode): string {
  if (mode === 'approve' && notCovered.value && customerNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng nhập nội dung giải thích cho khách hàng (ít nhất ${MIN_NOTE} ký tự).`;
  }
  if (mode === 'reject' && customerNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng nhập nội dung giải thích cho khách hàng (ít nhất ${MIN_NOTE} ký tự).`;
  }
  if (mode === 'approve' && overriding.value && overrideReason.value.trim().length < MIN_NOTE) {
    return `Vui lòng ghi lý do đổi kết luận của kỹ thuật viên (ít nhất ${MIN_NOTE} ký tự).`;
  }
  if (mode === 'close' && (unfixed.value || !customerAgreed.value) && closeNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng nhập ghi chú đóng yêu cầu (ít nhất ${MIN_NOTE} ký tự).`;
  }
  if (mode === 'close' && unfixed.value && refundAmount.value.trim() && !/^[1-9]\d*$/.test(refundAmount.value.trim())) {
    return 'Số tiền hoàn phải là số nguyên VND lớn hơn 0.';
  }
  if (mode === 'review' && reviewNote.value.trim().length < MIN_NOTE) {
    return `Vui lòng ghi nhận xét của bạn (ít nhất ${MIN_NOTE} ký tự).`;
  }
  return '';
}

async function run(claim: StaffWarrantyClaim, mode: WarrantyDecisionMode): Promise<StaffWarrantyClaim> {
  if (mode === 'approve') {
    return warrantyManagerApi.approve(claim.id, {
      ...(result.value !== proposal.value ? { result: result.value } : {}),
      ...(notCovered.value ? { reasonCode: reasonCode.value } : {}),
      ...(customerNote.value.trim() ? { customerNote: customerNote.value.trim() } : {}),
      ...(overriding.value ? { overrideReason: overrideReason.value.trim() } : {}),
      ...(workmanship.value && partId.value ? { replacementParts: [{ partCatalogId: partId.value, quantity: partQty.value }] } : {}),
    });
  }
  if (mode === 'review') {
    return warrantyManagerApi.reviewDecline(claim.id, { valid: reviewValid.value, note: reviewNote.value.trim() });
  }
  if (mode === 'reject') {
    return warrantyManagerApi.reject(claim.id, { reasonCode: reasonCode.value, customerNote: customerNote.value.trim() });
  }
  return warrantyManagerApi.close(claim.id, {
    outcome: outcome.value,
    ...(closeNote.value.trim() ? { note: closeNote.value.trim() } : {}),
    ...(unfixed.value && refundAmount.value.trim() ? { refundAmount: Number(refundAmount.value.trim()) } : {}),
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
  <Transition name="fh-modal">
    <div
      v-if="open && claim && mode"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4"
      @click.self="close"
      @keydown.esc="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="warranty-decision-title"
        class="fh-modal-panel bg-white rounded-[var(--radius-lg)] border border-ink-200/90 max-w-lg w-full flex flex-col max-h-[90dvh] overflow-hidden shadow-(--shadow-e3)"
      >
        <div class="flex items-center justify-between border-b border-ink-100 bg-ink-50/70 px-6 py-4 shrink-0">
          <h3 id="warranty-decision-title" class="text-base font-bold text-ink-900">{{ title }}</h3>
          <button type="button" class="rounded-[var(--radius-sm)] p-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 cursor-pointer" aria-label="Đóng" @click="close">
            <X :size="18" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-4">
          <div class="p-3 rounded-[var(--radius-sm)] border border-ink-100 bg-ink-50/80 text-xs space-y-1">
            <p>
              Đơn <span class="font-num font-bold text-brand-700">{{ claim.order.code }}</span> ·
              {{ claim.order.serviceName || 'Bảo hành dịch vụ' }} · Khách hàng: {{ claim.order.customerName }}
            </p>
            <p class="whitespace-pre-line text-ink-700">{{ claim.description }}</p>
            <p v-if="claim.submittedAfterExpiry" class="text-warning-700">Yêu cầu được gửi sau khi hạng mục hết hạn bảo hành.</p>
          </div>

          <template v-if="mode === 'approve'">
            <div v-if="claim.visit" class="p-3 rounded-[var(--radius-sm)] border border-ink-200/90 bg-ink-50/40 text-xs space-y-1.5">
              <p class="font-semibold text-ink-800">Đề xuất của kỹ thuật viên</p>
              <p>{{ proposal ? inspectionResultLabels[proposal] : '—' }}</p>
              <p v-if="claim.visit.notCoveredReasonCode">
                Lý do: {{ notCoveredReasonLabels[claim.visit.notCoveredReasonCode as NotCoveredReason] || 'Khác' }}
              </p>
              <p class="whitespace-pre-line text-ink-700">{{ claim.visit.findings }}</p>
              <div v-if="claim.visit.evidenceRefs?.length" class="flex flex-wrap gap-2">
                <a v-for="url in claim.visit.evidenceRefs" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
                  <img :src="url" alt="Bằng chứng của kỹ thuật viên" class="w-14 h-14 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
                </a>
              </div>
            </div>
            <div v-if="!changing" class="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-sm)] border border-ink-200 text-xs">
              <span class="text-ink-700">Kết luận cuối cùng: <strong class="text-ink-900">{{ inspectionResultLabels[result] }}</strong></span>
              <button type="button" class="shrink-0 font-medium text-brand-700 transition-colors hover:text-brand-800 hover:underline cursor-pointer" @click="changing = true">Đổi kết luận / chọn linh kiện khác</button>
            </div>
            <fieldset v-if="changing" class="space-y-1.5">
              <legend class="text-xs font-medium text-ink-700 mb-1">Kết luận cuối cùng</legend>
              <label
                v-for="(label, value) in inspectionResultLabels"
                :key="value"
                class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer"
                :class="result === value ? 'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'"
              >
                <input v-model="result" type="radio" name="warranty-final" :value="value" class="accent-brand-600" />
                {{ label }}
                <span v-if="value === proposal" class="ml-auto text-ink-500">Đề xuất</span>
              </label>
            </fieldset>
            <div v-if="overriding" class="space-y-1.5">
              <label for="warranty-override-reason" class="text-xs font-medium text-warning-700">Lý do đổi kết luận của kỹ thuật viên</label>
              <textarea
                id="warranty-override-reason"
                v-model="overrideReason"
                rows="2"
                maxlength="2000"
                :class="consoleTextarea"
              ></textarea>
            </div>
            <div v-if="result === 'covered_part' && faultyLines.length" class="space-y-1 p-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50/40" data-testid="faulty-lines">
              <p class="text-xs font-medium text-ink-700">Kỹ thuật viên báo linh kiện hỏng</p>
              <ul class="text-sm text-ink-900">
                <li v-for="line in faultyLines" :key="line.id">{{ line.name }} <span class="font-num text-ink-500">× {{ claim?.visit?.faultyQuantities?.[line.id] ?? line.quantity }}<template v-if="(claim?.visit?.faultyQuantities?.[line.id] ?? line.quantity) !== line.quantity"> / {{ line.quantity }}</template></span></li>
              </ul>
              <p class="text-xs text-ink-500">FixHome cấp đúng các linh kiện này (dòng linh kiện kỹ thuật viên tự mua thì kỹ thuật viên tự thay).</p>
            </div>
            <div v-if="changing && workmanship" class="space-y-2 p-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50/40">
              <p class="text-xs font-medium text-ink-700">Cần linh kiện FixHome? Ai trả tiền do kết quả kiểm tra linh kiện hỏng quyết định (không bắt buộc)</p>
              <input
                v-model="partSearch"
                type="search"
                placeholder="Tìm linh kiện theo tên hoặc mã"
                aria-label="Tìm linh kiện FixHome"
                :class="[consoleField, 'w-full']"
              />
              <div v-if="partOptions.length" class="flex gap-2">
                <select v-model="partId" aria-label="Linh kiện" :class="[consoleField, 'flex-1']">
                  <option value="" disabled>Chọn linh kiện</option>
                  <option v-for="part in partOptions" :key="part.id" :value="part.id">{{ part.name }}</option>
                </select>
                <input
                  v-model.number="partQty"
                  type="number"
                  min="1"
                  max="100"
                  aria-label="Số lượng"
                  :class="[consoleField, 'w-20 font-num']"
                />
              </div>
            </div>
            <div v-if="notCovered" class="space-y-1.5">
              <label for="warranty-final-reason" class="text-xs font-medium text-ink-700">Lý do không bảo hành</label>
              <select
                id="warranty-final-reason"
                v-model="reasonCode"
                :class="[consoleField, 'w-full']"
              >
                <option v-for="(label, value) in notCoveredReasonLabels" :key="value" :value="value">{{ label }}</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="warranty-customer-note" class="text-xs font-medium text-ink-700">
                Nội dung gửi khách hàng {{ notCovered ? '' : '(không bắt buộc)' }}
              </label>
              <textarea
                id="warranty-customer-note"
                v-model="customerNote"
                rows="4"
                maxlength="2000"
                :class="consoleTextarea"
              ></textarea>
            </div>
          </template>

          <template v-else-if="mode === 'reject'">
            <div class="space-y-1.5">
              <label for="warranty-reject-reason" class="text-xs font-medium text-ink-700">Lý do từ chối</label>
              <select
                id="warranty-reject-reason"
                v-model="reasonCode"
                :class="[consoleField, 'w-full']"
              >
                <option v-for="(label, value) in notCoveredReasonLabels" :key="value" :value="value">{{ label }}</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="warranty-reject-note" class="text-xs font-medium text-ink-700">Nội dung gửi khách hàng</label>
              <textarea
                id="warranty-reject-note"
                v-model="customerNote"
                rows="4"
                maxlength="2000"
                :class="consoleTextarea"
              ></textarea>
            </div>
          </template>

          <template v-else-if="mode === 'review'">
            <p class="text-xs text-ink-700">
              {{ claim.noShowFlaggedAt ? 'Kỹ thuật viên đã nhận nhưng chưa xác nhận đã đến đúng hạn.' : 'Kỹ thuật viên không phản hồi yêu cầu đúng hạn.' }}
            </p>
            <fieldset class="space-y-1.5">
              <label class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer" :class="reviewValid ? 'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'">
                <input v-model="reviewValid" type="radio" name="warranty-review" :value="true" class="accent-brand-600" /> Hợp lệ, không trừ điểm
              </label>
              <label class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer" :class="!reviewValid ? 'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'">
                <input v-model="reviewValid" type="radio" name="warranty-review" :value="false" class="accent-brand-600" /> Không chính đáng, trừ điểm uy tín
              </label>
            </fieldset>
            <div class="space-y-1.5">
              <label for="warranty-review-note" class="text-xs font-medium text-ink-700">Nhận xét</label>
              <textarea
                id="warranty-review-note"
                v-model="reviewNote"
                rows="3"
                maxlength="2000"
                :class="consoleTextarea"
              ></textarea>
            </div>
          </template>

          <template v-else>
            <fieldset class="space-y-1.5">
              <legend class="text-xs font-medium text-ink-700 mb-1">Kết quả đóng</legend>
              <label v-if="!finalNotCovered" class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer" :class="outcome === 'resolved' ?'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'">
                <input v-model="outcome" type="radio" name="warranty-outcome" value="resolved" class="accent-brand-600" /> Đã hoàn tất bảo hành
              </label>
              <label class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer" :class="outcome === 'rejected' ? 'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'">
                <input v-model="outcome" type="radio" name="warranty-outcome" value="rejected" class="accent-brand-600" /> Không được bảo hành
              </label>
              <label v-if="!finalNotCovered" class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border text-xs transition-colors duration-150 cursor-pointer" :class="outcome === 'unfixed' ?'border-brand-600 bg-brand-50/70' : 'border-ink-200 bg-white hover:bg-ink-50'">
                <input v-model="outcome" type="radio" name="warranty-outcome" value="unfixed" class="accent-brand-600" /> Không khắc phục được: hoàn tiền cho khách
              </label>
            </fieldset>
            <div v-if="unfixed" class="space-y-1.5">
              <label for="warranty-refund" class="text-xs font-medium text-ink-700">Số tiền hoàn vào ví khách (₫, để trống = cả hạng mục)</label>
              <input
                id="warranty-refund"
                v-model="refundAmount"
                inputmode="numeric"
                :class="[consoleField, 'w-full font-num']"
              />
              <p class="text-xs text-ink-500">Số tiền này bị trừ từ ví kỹ thuật viên đã làm đơn gốc và kỹ thuật viên nhận bảo hành bị trừ điểm uy tín.</p>
            </div>
            <p v-if="claim.status === 'disputed'" class="text-xs text-warning-700">
              Yêu cầu bị khách phản đối: quản lý dịch vụ đã duyệt lần đầu không thể tự đóng, cần một quản lý dịch vụ khác xem xét.
            </p>
            <div class="space-y-1.5">
              <label for="warranty-close-note" class="text-xs font-medium text-ink-700">
                Ghi chú {{ customerAgreed && !unfixed ? '(không bắt buộc vì khách hàng đã đồng ý)' : '' }}
              </label>
              <textarea
                id="warranty-close-note"
                v-model="closeNote"
                rows="3"
                maxlength="2000"
                :class="consoleTextarea"
              ></textarea>
            </div>
          </template>

          <Transition name="fh-fade-slide">
            <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">{{ error }}</p>
          </Transition>
        </div>

        <div class="flex gap-2 border-t border-ink-100 bg-ink-50/50 px-6 py-3.5 shrink-0">
          <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting" @click="close">Đóng</FhButton>
          <FhButton variant="primary" size="sm" class="flex-1" :loading="submitting" :disabled="submitting" @click="submit">
            {{ submitting ? 'Đang gửi yêu cầu…' : 'Xác nhận' }}
          </FhButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
