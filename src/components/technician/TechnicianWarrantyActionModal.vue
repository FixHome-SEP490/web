<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';
import {
  declineReasonLabels,
  inspectionResultLabels,
  notCoveredReasonLabels,
  type DeclineReason,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

export type WarrantyActionMode = 'accept' | 'decline' | 'propose' | 'complete';

const props = defineProps<{ claim: StaffWarrantyClaim | null; mode: WarrantyActionMode | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', claim: StaffWarrantyClaim): void }>();

const MIN_TEXT = 10;
const evidence = useEvidencePhotos();

const scheduledAt = ref('');
const declineReason = ref<DeclineReason>('busy');
const note = ref('');
const result = ref<InspectionResult>('covered_part');
const notCoveredReason = ref<NotCoveredReason>('other_component');
const findings = ref('');
const submitting = ref(false);
const error = ref('');

const open = computed(() => !!props.claim && !!props.mode);
const notCovered = computed(() => result.value === 'not_covered');
const title = computed(
  () =>
    ({
      accept: 'Nhận yêu cầu bảo hành',
      decline: 'Không nhận được yêu cầu bảo hành',
      propose: 'Gửi kết luận kiểm tra',
      complete: 'Báo đã bảo hành xong',
    })[props.mode ?? 'accept'],
);
const submitLabel = computed(
  () =>
    ({
      accept: 'Nhận yêu cầu',
      decline: 'Gửi lý do',
      propose: 'Gửi kết luận',
      complete: 'Báo hoàn tất',
    })[props.mode ?? 'accept'],
);
const showPhotos = computed(() => props.mode === 'propose' || props.mode === 'complete');

watch(open, (isOpen) => {
  if (!isOpen) return;
  scheduledAt.value = '';
  declineReason.value = 'busy';
  note.value = '';
  result.value = 'covered_part';
  notCoveredReason.value = 'other_component';
  findings.value = '';
  error.value = '';
  evidence.reset();
}, { immediate: true });

function close() {
  if (submitting.value || evidence.uploading.value) return;
  emit('close');
}

async function run(claim: StaffWarrantyClaim, mode: WarrantyActionMode): Promise<StaffWarrantyClaim> {
  const refs = evidence.photos.value.length ? { evidenceRefs: evidence.urls() } : {};
  if (mode === 'accept') {
    return warrantyClaimsApi.accept(claim.id, {
      ...(scheduledAt.value ? { scheduledAt: new Date(scheduledAt.value).toISOString() } : {}),
    });
  }
  if (mode === 'decline') {
    return warrantyClaimsApi.decline(claim.id, {
      reasonCode: declineReason.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    });
  }
  if (mode === 'propose') {
    return warrantyClaimsApi.propose(claim.id, {
      result: result.value,
      ...(notCovered.value ? { notCoveredReasonCode: notCoveredReason.value } : {}),
      findings: findings.value.trim(),
      ...refs,
    });
  }
  return warrantyClaimsApi.complete(claim.id, { notes: note.value.trim(), ...refs });
}

function validate(mode: WarrantyActionMode): string {
  if (mode === 'decline' && declineReason.value === 'other' && note.value.trim().length < MIN_TEXT) {
    return `Vui lòng ghi rõ lý do ít nhất ${MIN_TEXT} ký tự.`;
  }
  if (mode === 'propose') {
    if (findings.value.trim().length < MIN_TEXT) return `Vui lòng mô tả kết quả kiểm tra ít nhất ${MIN_TEXT} ký tự.`;
    if (notCovered.value && !evidence.photos.value.length) {
      return 'Cần ít nhất một ảnh làm bằng chứng khi kết luận không bảo hành.';
    }
  }
  if (mode === 'complete' && note.value.trim().length < MIN_TEXT) {
    return `Vui lòng mô tả việc đã làm ít nhất ${MIN_TEXT} ký tự.`;
  }
  return '';
}

async function submit() {
  if (!props.claim || !props.mode || submitting.value || evidence.uploading.value) return;
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
      aria-labelledby="warranty-action-title"
      class="bg-white rounded-[var(--radius-lg)] max-w-md w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between">
        <h3 id="warranty-action-title" class="text-base font-bold text-ink-900">{{ title }}</h3>
        <button type="button" class="p-1 rounded-full hover:bg-ink-100" aria-label="Đóng" @click="close">
          <X :size="18" />
        </button>
      </div>

      <p class="text-xs text-ink-600">
        Đơn <span class="font-mono font-bold text-brand-700">{{ claim.order.code }}</span> ·
        {{ claim.coverage?.itemDescription || 'Bảo hành dịch vụ' }}
      </p>

      <template v-if="mode === 'accept'">
        <div class="space-y-1">
          <label for="warranty-schedule" class="text-xs font-medium text-ink-700">Thời gian dự kiến tới kiểm tra (không bắt buộc)</label>
          <input
            id="warranty-schedule"
            v-model="scheduledAt"
            type="datetime-local"
            class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          />
        </div>
        <p class="text-xs text-ink-500">Bạn hãy liên hệ khách hàng để thống nhất lịch. Bảo hành không thu phí công.</p>
      </template>

      <template v-else-if="mode === 'decline'">
        <div class="space-y-1">
          <label for="warranty-decline-reason" class="text-xs font-medium text-ink-700">Lý do</label>
          <select
            id="warranty-decline-reason"
            v-model="declineReason"
            class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          >
            <option v-for="(label, value) in declineReasonLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label for="warranty-decline-note" class="text-xs font-medium text-ink-700">
            Ghi chú {{ declineReason === 'other' ? '' : '(không bắt buộc)' }}
          </label>
          <textarea
            id="warranty-decline-note"
            v-model="note"
            rows="3"
            maxlength="2000"
            class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          ></textarea>
        </div>
        <p class="text-xs text-ink-500">Quản lý dịch vụ sẽ phân công kỹ thuật viên khác. Lý do của bạn được ghi lại.</p>
      </template>

      <template v-else-if="mode === 'propose'">
        <fieldset class="space-y-1.5">
          <legend class="text-xs font-medium text-ink-700 mb-1">Kết luận đề xuất</legend>
          <label
            v-for="(label, value) in inspectionResultLabels"
            :key="value"
            class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs cursor-pointer"
            :class="result === value ? 'border-brand-600 bg-brand-50' : ''"
          >
            <input v-model="result" type="radio" name="warranty-result" :value="value" />
            {{ label }}
          </label>
        </fieldset>
        <div v-if="notCovered" class="space-y-1">
          <label for="warranty-not-covered" class="text-xs font-medium text-ink-700">Lý do không bảo hành</label>
          <select
            id="warranty-not-covered"
            v-model="notCoveredReason"
            class="w-full h-[44px] px-3 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          >
            <option v-for="(label, value) in notCoveredReasonLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label for="warranty-findings" class="text-xs font-medium text-ink-700">Kết quả kiểm tra</label>
          <textarea
            id="warranty-findings"
            v-model="findings"
            rows="4"
            maxlength="2000"
            placeholder="Mô tả tình trạng thực tế, vị trí lỗi và nguyên nhân bạn xác định"
            class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          ></textarea>
        </div>
        <p class="text-xs text-ink-500">Kết luận chỉ là đề xuất. Quản lý dịch vụ sẽ duyệt trước khi thông báo cho khách hàng.</p>
      </template>

      <template v-else>
        <div class="space-y-1">
          <label for="warranty-complete-notes" class="text-xs font-medium text-ink-700">Việc đã làm</label>
          <textarea
            id="warranty-complete-notes"
            v-model="note"
            rows="4"
            maxlength="2000"
            placeholder="Mô tả việc đã xử lý để khắc phục lỗi"
            class="w-full p-2.5 bg-white border border-ink-300 rounded-[var(--radius-sm)] text-sm"
          ></textarea>
        </div>
      </template>

      <div v-if="showPhotos" class="space-y-2">
        <span class="text-xs font-medium text-ink-700">
          Ảnh đính kèm ({{ mode === 'propose' && notCovered ? 'bắt buộc' : 'không bắt buộc' }}, tối đa {{ evidence.maxPhotos }} ảnh)
        </span>
        <div v-if="evidence.photos.value.length" class="flex flex-wrap gap-2">
          <div v-for="(photo, index) in evidence.photos.value" :key="photo.url" class="relative">
            <img :src="photo.url" :alt="photo.name" class="w-16 h-16 object-cover rounded-[var(--radius-sm)] border border-ink-200" />
            <button
              type="button"
              class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-ink-300 flex items-center justify-center"
              :aria-label="`Bỏ ảnh ${photo.name}`"
              @click="evidence.remove(index)"
            >
              <X :size="12" />
            </button>
          </div>
        </div>
        <label
          class="inline-flex items-center gap-1.5 h-[36px] px-3 text-sm rounded-[var(--radius-sm)] border border-ink-300 cursor-pointer hover:bg-ink-50"
          :class="{ 'opacity-60 pointer-events-none': evidence.uploading.value || evidence.photos.value.length >= evidence.maxPhotos }"
        >
          <Camera :size="14" />
          {{ evidence.uploading.value ? 'Đang tải ảnh…' : 'Thêm ảnh' }}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="evidence.pick" />
        </label>
      </div>

      <p v-if="error || evidence.error.value" role="alert" class="text-xs text-danger-700">
        {{ error || evidence.error.value }}
      </p>

      <div class="flex gap-2 pt-2">
        <FhButton variant="ghost" size="sm" class="flex-1" :disabled="submitting || evidence.uploading.value" @click="close">
          Đóng
        </FhButton>
        <FhButton
          variant="primary"
          size="sm"
          class="flex-1"
          :loading="submitting"
          :disabled="submitting || evidence.uploading.value"
          @click="submit"
        >
          {{ submitting ? 'Đang gửi yêu cầu…' : submitLabel }}
        </FhButton>
      </div>
    </div>
  </div>
</template>
