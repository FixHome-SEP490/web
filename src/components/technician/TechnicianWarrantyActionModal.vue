<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Camera, X } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';
import { warrantyClaimsApi, type StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { getSupportErrorMessage } from '../../pages/console/support-cases.utils';
import { useEvidencePhotos } from '../../composables/useEvidencePhotos';
import BookingSessionPicker from '../customer/BookingSessionPicker.vue';
import { upcomingSessions, type BookingSlot } from '../../utils/booking-session';
import { vnKeyAndClockToDate } from '../../utils/vn-time';
import {
  declineReasonLabels,
  inspectionResultLabels,
  notCoveredReasonLabels,
  type DeclineReason,
  type InspectionResult,
  type NotCoveredReason,
} from '../../utils/warranty-claim';

export type WarrantyActionMode = 'accept' | 'reschedule' | 'decline' | 'propose' | 'complete';

const props = defineProps<{ claim: StaffWarrantyClaim | null; mode: WarrantyActionMode | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', claim: StaffWarrantyClaim): void }>();

const MIN_TEXT = 10;
const evidence = useEvidencePhotos();

// The inspection time is a booking-style session (day + morning/afternoon/evening); the server stores its start,
// or "in a few minutes" when the session is already under way, so the time it sees is always in the future.
const SESSION_START_HOUR: Record<BookingSlot, number> = { morning: 8, afternoon: 13, evening: 18 };
const sessions = upcomingSessions(14);
const session = ref<{ date: string; slot: BookingSlot } | null>(null);
const scheduledAt = ref('');
watch(session, (picked) => {
  if (!picked) { scheduledAt.value = ''; return; }
  const start = vnKeyAndClockToDate(picked.date, SESSION_START_HOUR[picked.slot], 0).getTime();
  scheduledAt.value = new Date(Math.max(start, Date.now() + 10 * 60_000)).toISOString();
});
const declineReason = ref<DeclineReason>('busy');
const note = ref('');
const result = ref<InspectionResult>('covered_part');
const notCoveredReason = ref<NotCoveredReason>('other_component');
const findings = ref('');
const faultyIds = ref<string[]>([]);
const faultyCounts = ref<Record<string, number>>({});
const countOf = (line: { id: string; quantity: number }) => faultyCounts.value[line.id] ?? line.quantity;
const submitting = ref(false);
const error = ref('');

const open = computed(() => !!props.claim && !!props.mode);
const notCovered = computed(() => result.value === 'not_covered');
const partLines = computed(() => props.claim?.order.partLines ?? []);
// FixHome pays the part on a part fault, and "not covered" ends the claim: both need proof.
const evidenceRequired = computed(() => notCovered.value || result.value === 'covered_part');
const title = computed(
  () =>
    ({
      accept: 'Nhận yêu cầu bảo hành',
      reschedule: 'Đổi lịch kiểm tra',
      decline: 'Không nhận được yêu cầu bảo hành',
      propose: 'Gửi kết luận kiểm tra',
      complete: 'Báo đã bảo hành xong',
    })[props.mode ?? 'accept'],
);
const submitLabel = computed(
  () =>
    ({
      accept: 'Nhận yêu cầu',
      reschedule: 'Đổi lịch và báo khách',
      decline: 'Gửi lý do',
      propose: 'Gửi kết luận',
      complete: 'Báo hoàn tất',
    })[props.mode ?? 'accept'],
);
const showPhotos = computed(() => props.mode === 'propose' || props.mode === 'complete');

watch(open, (isOpen) => {
  if (!isOpen) return;
  session.value = null;
  scheduledAt.value = '';
  declineReason.value = 'busy';
  note.value = '';
  result.value = 'covered_part';
  notCoveredReason.value = 'other_component';
  findings.value = '';
  faultyIds.value = [];
  faultyCounts.value = {};
  error.value = '';
  evidence.reset();
}, { immediate: true });

function close() {
  if (submitting.value || evidence.uploading.value) return;
  emit('close');
}

async function run(claim: StaffWarrantyClaim, mode: WarrantyActionMode): Promise<StaffWarrantyClaim> {
  const refs = evidence.photos.value.length ? { evidenceRefs: evidence.urls() } : {};
  if (mode === 'accept' || mode === 'reschedule') {
    const payload = { scheduledAt: new Date(scheduledAt.value).toISOString() };
    return mode === 'accept' ? warrantyClaimsApi.accept(claim.id, payload) : warrantyClaimsApi.reschedule(claim.id, payload);
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
      ...(result.value === 'covered_part' ? { faultyInvoiceItemIds: faultyIds.value, faultyQuantities: Object.fromEntries(partLines.value.filter((l) => faultyIds.value.includes(l.id)).map((l) => [l.id, countOf(l)])) } : {}),
      findings: findings.value.trim(),
      ...refs,
    });
  }
  return warrantyClaimsApi.complete(claim.id, { notes: note.value.trim(), ...refs });
}

function validate(mode: WarrantyActionMode): string {
  if (mode === 'accept' || mode === 'reschedule') {
    const at = Date.parse(scheduledAt.value);
    if (!Number.isFinite(at) || at <= Date.now()) return 'Vui lòng chọn lịch kiểm tra ở thời điểm sau hiện tại.';
  }
  if (mode === 'decline' && declineReason.value === 'other' && note.value.trim().length < MIN_TEXT) {
    return `Vui lòng ghi rõ lý do ít nhất ${MIN_TEXT} ký tự.`;
  }
  if (mode === 'propose') {
    if (findings.value.trim().length < MIN_TEXT) return `Vui lòng mô tả kết quả kiểm tra ít nhất ${MIN_TEXT} ký tự.`;
    if (result.value === 'covered_part' && !faultyIds.value.length) return 'Chọn ít nhất một linh kiện bị hỏng.';
    const badCount = partLines.value.some((l) => faultyIds.value.includes(l.id) && (!Number.isInteger(countOf(l)) || countOf(l) < 1 || countOf(l) > l.quantity));
    if (result.value === 'covered_part' && badCount) return 'Số cái bị hỏng phải từ 1 đến số lượng đã dùng.';
    if (evidenceRequired.value && !evidence.photos.value.length) {
      return notCovered.value
        ? 'Cần ít nhất một ảnh làm bằng chứng khi kết luận không bảo hành.'
        : 'Cần ít nhất một ảnh linh kiện hỏng khi kết luận lỗi linh kiện.';
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
        {{ claim.order.serviceName || 'Bảo hành dịch vụ' }}
      </p>

      <template v-if="mode === 'accept' || mode === 'reschedule'">
        <div id="warranty-schedule" class="space-y-1.5">
          <p class="text-xs font-medium text-ink-700">Buổi tới kiểm tra đã hẹn với khách (bắt buộc)</p>
          <BookingSessionPicker v-model="session" :sessions="sessions" compact />
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
        <p class="text-xs text-ink-500">Nghỉ phép và ngoài khu vực được hệ thống kiểm tra. Lý do khác chờ quản lý xét; không chính đáng sẽ bị trừ điểm uy tín.</p>
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
        <fieldset v-if="result === 'covered_part'" class="space-y-1.5" data-testid="faulty-lines">
          <legend class="text-xs font-medium text-ink-700 mb-1">Linh kiện nào bị hỏng?</legend>
          <p v-if="!partLines.length" class="text-xs text-ink-500">Đơn gốc không có linh kiện. Hãy chọn kết luận khác.</p>
          <label
            v-for="line in partLines"
            :key="line.id"
            class="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border border-ink-300 text-xs cursor-pointer"
            :class="faultyIds.includes(line.id) ? 'border-brand-600 bg-brand-50' : ''"
          >
            <input v-model="faultyIds" type="checkbox" :value="line.id" />
            <span class="min-w-0 flex-1">{{ line.name }}</span>
            <span v-if="!(faultyIds.includes(line.id) && line.quantity > 1)" class="font-num text-ink-500">× {{ line.quantity }}</span>
            <span v-else class="flex items-center gap-1 font-num text-ink-700" data-testid="faulty-quantity">
              <span class="text-ink-500">Hỏng</span>
              <input v-model.number="faultyCounts[line.id]" type="number" min="1" :max="line.quantity" :placeholder="String(line.quantity)" class="w-14 h-7 px-1 text-center rounded-[var(--radius-sm)] border border-ink-300" :aria-label="`Số cái hỏng của ${line.name}`" />
              <span class="text-ink-500">/ {{ line.quantity }}</span>
            </span>
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
          Ảnh đính kèm ({{ mode === 'propose' && evidenceRequired ? 'bắt buộc' : 'không bắt buộc' }}, tối đa {{ evidence.maxPhotos }} ảnh)
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
