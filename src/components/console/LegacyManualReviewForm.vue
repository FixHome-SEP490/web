<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import FhButton from '../FhButton.vue';
import { consoleField, consoleTextarea } from './console-ui';
import { useAuthStore } from '../../stores/auth';
import { getHttpStatus } from '../../api/client';
import { legacyReviewCommand, partRequestsApi, type LegacyManualReviewRecord, type LegacyManualReviewCommand, type LegacyReviewStatus } from '../../api/part-requests.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';

const props = defineProps<{ row: LegacyManualReviewRecord }>();
const emit = defineEmits<{ saved: []; refresh: [] }>();
const auth = useAuthStore();
const canOperate = computed(() => auth.hasRole('SERVICE_MANAGER'));
const labels = { UNKNOWN: 'Chưa xác minh', INVESTIGATING: 'Đang xác minh', PHYSICALLY_VERIFIED: 'Đã kiểm tra vật lý', DISCREPANCY_RECORDED: 'Đã ghi nhận chênh lệch' };
const status = ref<LegacyReviewStatus>('INVESTIGATING');
const reason = ref('');
const evidence = ref('');
const observedQty = ref<number | ''>('');
const correctionReason = ref('');
const pending = ref<LegacyManualReviewCommand | null>(null);
const busy = ref(false);
const uncertain = ref(false);
const reloadRequired = ref(false);
const saved = ref(false);
const error = ref('');
const version = computed(() => props.row.lastManualReview?.version ?? 0);
const correcting = computed(() => !!props.row.lastManualReview && props.row.lastManualReview.status !== 'INVESTIGATING');
const locked = computed(() => busy.value || uncertain.value || reloadRequired.value || saved.value);
let generation = 0;
onBeforeUnmount(() => { ++generation; });
watch(() => [props.row.partRequestItemId, version.value, canOperate.value], () => {
  ++generation; pending.value = null; busy.value = false; uncertain.value = false; reloadRequired.value = false;
  saved.value = false; error.value = ''; reason.value = ''; evidence.value = ''; observedQty.value = ''; correctionReason.value = '';
});
async function submit() {
  if (!canOperate.value || busy.value || reloadRequired.value || saved.value) return;
  error.value = '';
  if (!pending.value) {
    if (correcting.value && correctionReason.value.trim().length < 5) {
      error.value = 'Nhập lý do đính chính từ 5 đến 300 ký tự.'; return;
    }
    try {
      pending.value = legacyReviewCommand({ commandId: crypto.randomUUID(), expectedVersion: version.value, status: status.value,
        reason: reason.value, ...(evidence.value.trim() ? { evidenceReferenceId: evidence.value.trim() } : {}),
        ...(observedQty.value !== '' ? { observedQty: observedQty.value } : {}),
        ...(correcting.value ? { correctsEventId: props.row.lastManualReview!.id, correctionReason: correctionReason.value } : {}) });
    } catch { error.value = 'Kiểm tra lý do (5–300 ký tự), mã bằng chứng nội bộ và số lượng (0–100). Số lượng quan sát cần bằng chứng và không dùng khi đang xác minh.'; return; }
  }
  const request = generation;
  busy.value = true;
  try {
    await partRequestsApi.reviewLegacyItem(props.row, pending.value);
    if (request !== generation || !canOperate.value) return;
    saved.value = true; uncertain.value = false;
    emit('saved');
  } catch (err) {
    if (request !== generation || !canOperate.value) return;
    const code = getHttpStatus(err);
    uncertain.value = code === undefined || code >= 500 || code === 408;
    if (uncertain.value) error.value = 'Chưa xác nhận được kết quả. Thử lại giữ nguyên nội dung và mã lệnh để kiểm tra.';
    else if (code === 400 || code === 422) { pending.value = null; error.value = userFacingError(err, 'Nội dung xác minh chưa hợp lệ. Kiểm tra rồi gửi lại.'); }
    else { reloadRequired.value = true; error.value = code === 409 ? 'Xác minh đã thay đổi. Tải lại để xem phiên bản mới trước khi tiếp tục.' : 'Quyền hoặc nguồn linh kiện đã thay đổi. Tải lại để kiểm tra.'; }
  } finally { if (request === generation) busy.value = false; }
}
</script>

<template>
  <div v-if="canOperate" class="space-y-2 border-t border-ink-100 pt-3 text-sm">
    <p v-if="row.manualReviewState">{{ labels[row.manualReviewState] }} · Phiên bản {{ version }}</p>
    <p v-if="row.lastManualReview" class="text-ink-600">{{ row.lastManualReview.reason }} · {{ vnDateTimeString(row.lastManualReview.occurredAt) }}<span v-if="row.lastManualReview.observedQty !== undefined"> · Số lượng quan sát: {{ row.lastManualReview.observedQty }}</span></p>
    <p class="text-warning-800">Đây là ghi nhận quan sát, không phải xác nhận nhận kho. Trạng thái biên nhận vẫn chưa xác định.</p>
    <form v-if="row.manualReviewState" class="space-y-3" data-testid="legacy-review-form" @submit.prevent="submit">
      <fieldset :disabled="locked" class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1">Kết quả xác minh
          <select v-model="status" :class="consoleField" class="min-h-11 w-full">
            <option value="INVESTIGATING">Đang xác minh</option><option value="PHYSICALLY_VERIFIED">Đã kiểm tra vật lý</option><option value="DISCREPANCY_RECORDED">Đã ghi nhận chênh lệch</option>
          </select>
        </label>
        <label class="space-y-1">Mã bằng chứng nội bộ (UUID)
          <input v-model="evidence" :class="consoleField" class="min-h-11 w-full" autocomplete="off" data-testid="legacy-review-evidence" />
        </label>
        <label class="space-y-1 sm:col-span-2">Lý do xác minh
          <textarea v-model="reason" :disabled="locked" rows="2" maxlength="300" :class="consoleTextarea" class="w-full" data-testid="legacy-review-reason" />
          <span class="text-xs text-ink-600">5–300 ký tự, không nhập liên kết hoặc thông tin cá nhân.</span>
        </label>
        <label class="space-y-1">Số lượng quan sát (không bắt buộc)
          <input v-model.number="observedQty" type="number" min="0" max="100" step="1" :class="consoleField" class="min-h-11 w-full" data-testid="legacy-review-quantity" />
        </label>
        <label v-if="correcting" class="space-y-1">Lý do đính chính kết luận trước
          <textarea v-model="correctionReason" maxlength="300" rows="2" :class="consoleTextarea" class="w-full" data-testid="legacy-review-correction" />
        </label>
      </fieldset>
      <p v-if="error" role="alert" class="text-danger-700">{{ error }}</p>
      <p v-if="saved" role="status">Đã ghi nhận xác minh; chưa phải biên nhận kho.</p>
      <FhButton v-if="reloadRequired" type="button" size="md" variant="secondary" @click="emit('refresh')">Tải lại xác minh</FhButton>
      <FhButton v-else type="submit" size="md" :loading="busy" :disabled="busy || saved">{{ uncertain ? 'Thử lại cùng lệnh' : correcting ? 'Ghi đính chính' : 'Ghi nhận xác minh' }}</FhButton>
    </form>
    <p v-else class="text-ink-600">Chưa có thông tin phiên bản để ghi nhận xác minh. Vui lòng tải lại sau.</p>
  </div>
</template>
