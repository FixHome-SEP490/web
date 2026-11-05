<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import FhButton from '../../../components/FhButton.vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import { consoleField, consoleLabel } from '../../../components/console/console-ui';
import { getHttpStatus } from '../../../api/client';
import { w3DeliveryPolicyApi, W3_BLOCKERS, type W3PolicyCurrent, type W3PolicyHistory, type W3PolicyParameters, type W3PolicyPreview } from '../../../api/w3-delivery-policy.api';
import { useAuthStore } from '../../../stores';
import { formatCurrencyVND as formatCurrency } from '../../../utils/formatters';

const auth = useAuthStore();
const current = ref<W3PolicyCurrent | null>(null);
const history = ref<W3PolicyHistory | null>(null);
const selectedHistoryId = ref('');
const historyLoading = ref(false);
const historyCanLoadMore = ref(false);
const historyError = ref('');
const loading = ref(false);
const saving = ref(false);
const previewing = ref(false);
const unavailable = ref(false);
const reloadRequired = ref(false);
const error = ref('');
const success = ref('');
const fieldErrors = ref<Record<string, string>>({});
const previewErrors = ref<Record<string, string>>({});
const result = ref<W3PolicyPreview | null>(null);
const fields = reactive({ feeCeilingVnd: '', proposalReviewAfterMinutes: '', courierEvidenceReviewAfterMinutes: '' });
const sample = reactive({ proposalId: '', proposalVersion: '', shippingFeeVnd: '', proposalAgeMinutes: '', courierEvidenceAgeMinutes: '' });
const parameterLabels = {
  feeCeilingVnd: 'Ngưỡng xem xét phí giao (₫)',
  proposalReviewAfterMinutes: 'Xem xét đề xuất sau (phút)',
  courierEvidenceReviewAfterMinutes: 'Xem xét bằng chứng đơn vị giao hàng sau (phút)',
};
const sampleLabels = {
  proposalId: 'Mã đề xuất giả định', proposalVersion: 'Phiên bản đề xuất giả định',
  shippingFeeVnd: 'Phí giao giả định (₫)', proposalAgeMinutes: 'Tuổi đề xuất giả định (phút)',
  courierEvidenceAgeMinutes: 'Tuổi bằng chứng đơn vị giao hàng (phút, để trống nếu chưa xác định)',
};
const blockerLabels: Record<typeof W3_BLOCKERS[number], string> = {
  LEGAL_UNVERIFIED: 'Pháp lý chưa xác minh', ACCOUNTING_UNVERIFIED: 'Kế toán chưa xác minh',
  WAREHOUSE_UNVERIFIED: 'Kho chưa xác minh', COURIER_UNVERIFIED: 'Đơn vị giao hàng chưa xác minh',
  SHIPPING_APPROVAL_SOURCE_UNVERIFIED: 'Nguồn duyệt phí giao chưa xác minh', FINANCE_CUTOVER_CLOSED: 'Cổng tài chính đang đóng',
};
const busy = computed(() => loading.value || saving.value || previewing.value);
const canReadPage = computed(() => auth.hasRole('ADMIN') && auth.hasPermission('config:read'));
const selectedHistoryDraft = computed(() => history.value?.drafts.find(draft => draft.id === selectedHistoryId.value) ?? null);
const canSave = computed(() => canReadPage.value && !!current.value && !busy.value && !reloadRequired.value && auth.hasPermission('config:update') && current.value.draft?.state.revision !== 2147483647);
const dirty = computed(() => {
  const saved = current.value?.draft?.state.policy.parameters;
  return !!saved && (Object.keys(fields) as (keyof W3PolicyParameters)[]).some(k => fields[k] !== String(saved[k]));
});
const canPreview = computed(() => canReadPage.value && !!current.value?.draft && !busy.value && !reloadRequired.value && !dirty.value);
let actorEpoch = 0;
let historyRequest = 0;

function clearHistory() {
  historyRequest += 1;
  history.value = null;
  selectedHistoryId.value = '';
  historyCanLoadMore.value = false;
  historyLoading.value = false;
  historyError.value = '';
}

function numeric(value: string, minimum = 0): number | null {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) return null;
  return Number(value);
}
function failed(reason: unknown) {
  success.value = ''; result.value = null;
  clearHistory();
  const status = getHttpStatus(reason);
  unavailable.value = status === 404 || status === 503;
  reloadRequired.value = true;
  if (unavailable.value) { current.value = null; error.value = 'Chưa có dịch vụ bản nháp chính sách giao linh kiện (NOT_AVAILABLE).'; }
  else if (status === 409) error.value = 'Bản nháp đã thay đổi. Nội dung nhập được giữ lại; vui lòng tải lại trước khi tiếp tục. Tải lại sẽ thay nội dung bằng bản máy chủ.';
  else if (status === 403) error.value = 'Bạn không có quyền thực hiện thao tác này. Vui lòng tải lại.';
  else error.value = 'Chưa xác nhận được dữ liệu hoặc kết quả. Vui lòng tải lại để đối chiếu trước khi tiếp tục.';
}
async function load() {
  if (!canReadPage.value || busy.value) return;
  const requestActor = actorEpoch;
  loading.value = true; current.value = null; result.value = null; success.value = ''; error.value = '';
  fieldErrors.value = {}; previewErrors.value = {}; clearHistory();
  try {
    const loaded = await w3DeliveryPolicyApi.current();
    if (requestActor !== actorEpoch || !canReadPage.value) return;
    current.value = loaded;
    for (const key of Object.keys(fields) as (keyof W3PolicyParameters)[]) fields[key] = current.value.draft ? String(current.value.draft.state.policy.parameters[key]) : '';
    reloadRequired.value = false; unavailable.value = false;
    await loadHistory();
  } catch (reason) {
    if (requestActor === actorEpoch) failed(reason);
  } finally {
    if (requestActor === actorEpoch) loading.value = false;
  }
}
async function loadHistory(older = false) {
  if (!canReadPage.value) return;
  const existing = history.value;
  const oldest = existing?.drafts[existing.drafts.length - 1];
  if (older && (!historyCanLoadMore.value || !oldest)) return;
  const beforeRevision = older ? oldest!.state.revision : undefined;
  const requestActor = actorEpoch;
  const requestId = ++historyRequest;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const page = await w3DeliveryPolicyApi.history(beforeRevision);
    if (requestActor !== actorEpoch || requestId !== historyRequest || !canReadPage.value) return;
    const previousHistory = older ? history.value : null;
    if (older && previousHistory) {
      const seenIds = new Set(previousHistory.drafts.map(draft => draft.id));
      const seenRevisions = new Set(previousHistory.drafts.map(draft => draft.state.revision));
      if (page.drafts.some(draft => seenIds.has(draft.id) || seenRevisions.has(draft.state.revision))) {
        historyError.value = 'Chưa thể đối chiếu thêm lịch sử bản nháp. Vui lòng tải lại để kiểm tra.';
        return;
      }
      history.value = { ...page, drafts: [...previousHistory.drafts, ...page.drafts] };
    } else {
      history.value = page;
    }
    const nextSelection = selectedHistoryId.value;
    selectedHistoryId.value = history.value.drafts.some(draft => draft.id === nextSelection)
      ? nextSelection
      : history.value.drafts[0]?.id ?? '';
    historyCanLoadMore.value = page.drafts.length === 20;
  } catch (reason) {
    if (requestActor !== actorEpoch || requestId !== historyRequest) return;
    history.value = older ? existing : null;
    if (!older) selectedHistoryId.value = '';
    const status = getHttpStatus(reason);
    if (status === 404 || status === 503) historyError.value = 'Lịch sử bản nháp chưa khả dụng (NOT_AVAILABLE). Bản nháp hiện tại vẫn có thể được xem.';
    else if (status === 403) historyError.value = 'Bạn không có quyền xem lịch sử bản nháp.';
    else historyError.value = 'Chưa thể đối chiếu lịch sử bản nháp. Vui lòng tải lại để kiểm tra.';
  } finally {
    if (requestActor === actorEpoch && requestId === historyRequest) historyLoading.value = false;
  }
}
async function save() {
  if (!canSave.value) return;
  const requestActor = actorEpoch;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(fields)) if (numeric(fields[key as keyof typeof fields]) === null) errors[key] = 'Nhập số nguyên không âm, tối đa 9.007.199.254.740.991.';
  fieldErrors.value = errors;
  if (Object.keys(errors).length) return;
  const parameters = { feeCeilingVnd: Number(fields.feeCeilingVnd), proposalReviewAfterMinutes: Number(fields.proposalReviewAfterMinutes), courierEvidenceReviewAfterMinutes: Number(fields.courierEvidenceReviewAfterMinutes) };
  saving.value = true; error.value = ''; success.value = ''; result.value = null;
  try {
    const existing = current.value!.draft;
    const saved = existing ? await w3DeliveryPolicyApi.revise(existing.id, existing.state.revision, parameters) : await w3DeliveryPolicyApi.create(parameters);
    if (requestActor !== actorEpoch || !canReadPage.value) return;
    current.value = { ...current.value!, draft: saved };
    for (const key of Object.keys(fields) as (keyof W3PolicyParameters)[]) fields[key] = String(saved.state.policy.parameters[key]);
    success.value = 'Đã lưu bản nháp. Tài chính vẫn bị khóa.';
    await loadHistory();
  } catch (reason) { if (requestActor === actorEpoch) failed(reason); }
  finally { if (requestActor === actorEpoch) saving.value = false; }
}
async function preview() {
  if (!canPreview.value || !current.value?.draft) return;
  const requestActor = actorEpoch;
  const errors: Record<string, string> = {};
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_/-]{0,255}$/.test(sample.proposalId)) errors.proposalId = 'Nhập mã giả định từ 1–256 ký tự chữ, số hoặc : _ / -.';
  for (const key of ['proposalVersion', 'shippingFeeVnd', 'proposalAgeMinutes', 'courierEvidenceAgeMinutes'] as const) {
    if (key === 'courierEvidenceAgeMinutes' && sample[key] === '') continue;
    if (numeric(sample[key], key === 'proposalVersion' ? 1 : 0) === null) errors[key] = key === 'proposalVersion' ? 'Nhập số nguyên dương trong giới hạn an toàn.' : 'Nhập số nguyên không âm trong giới hạn an toàn.';
  }
  previewErrors.value = errors;
  if (Object.keys(errors).length) return;
  previewing.value = true; result.value = null; error.value = ''; success.value = '';
  try {
    const nextResult = await w3DeliveryPolicyApi.preview(current.value.draft, [{ proposalId: sample.proposalId, proposalVersion: Number(sample.proposalVersion), shippingFeeVnd: Number(sample.shippingFeeVnd), proposalAgeMinutes: Number(sample.proposalAgeMinutes), courierEvidenceAgeMinutes: sample.courierEvidenceAgeMinutes === '' ? null : Number(sample.courierEvidenceAgeMinutes) }]);
    if (requestActor === actorEpoch && canReadPage.value) result.value = nextResult;
  } catch (reason) { if (requestActor === actorEpoch) failed(reason); }
  finally { if (requestActor === actorEpoch) previewing.value = false; }
}
watch([fields, sample], () => { result.value = null; success.value = ''; }, { flush: 'sync' });
watch(() => [auth.user?.id, auth.userRole, canReadPage.value] as const, () => {
  actorEpoch += 1;
  historyRequest += 1;
  current.value = null;
  result.value = null;
  reloadRequired.value = false;
  unavailable.value = false;
  loading.value = false;
  saving.value = false;
  previewing.value = false;
  clearHistory();
  error.value = '';
  success.value = '';
  fieldErrors.value = {};
  previewErrors.value = {};
  for (const key of Object.keys(fields) as (keyof W3PolicyParameters)[]) fields[key] = '';
  if (canReadPage.value) void load();
}, { flush: 'sync' });
onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <ConsolePageHeader title="Chính sách giao linh kiện (Bản nháp)">
      <template #actions><FhButton data-testid="reload" variant="secondary" :disabled="busy" @click="load">Tải lại</FhButton></template>
    </ConsolePageHeader>
    <section class="rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800" aria-label="Trạng thái tài chính">
      <p class="font-semibold">Chỉ bản nháp và xem trước giả định · Tài chính bị khóa</p>
      <p>Chưa có chính sách có hiệu lực. Ngưỡng phí chỉ dùng để xem xét, không phải phí giao thực tế được duyệt. Không thay đổi hóa đơn hoặc yêu cầu đặt lịch.</p>
    </section>
    <p v-if="loading" role="status">Đang tải…</p>
    <p v-if="error" role="alert" class="rounded-[var(--radius-sm)] bg-danger-50 p-4 text-sm text-danger-800">{{ error }}</p>
    <p v-if="success" role="status" class="text-sm text-success-800">{{ success }}</p>
    <template v-if="current && !unavailable && canReadPage">
      <section class="space-y-3 text-sm text-ink-700" aria-labelledby="current-title">
        <h2 id="current-title" class="text-xl font-semibold text-ink-900">Bản nháp hiện tại</h2>
        <p v-if="current.draft">Bản nháp · Phiên bản nội dung {{ current.draft.state.policy.version }} · Lần sửa {{ current.draft.state.revision }}</p>
        <p v-else>Chưa có bản nháp. Nhập đủ các tham số để tạo bản nháp đầu tiên.</p>
        <details><summary class="cursor-pointer focus-visible:outline-brand-600">Điều kiện đang chặn tài chính</summary>
          <ul class="list-disc pl-5"><li v-for="blocker in current.blockers" :key="blocker">{{ blockerLabels[blocker] }}</li></ul>
        </details>
      </section>
      <section data-testid="history-section" class="max-w-[720px] space-y-3 border-t border-ink-200 pt-5" aria-labelledby="history-title">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="history-title" class="text-xl font-semibold text-ink-900">Lịch sử bản nháp</h2>
            <p class="text-sm text-ink-600">Chỉ đọc các phiên bản DRAFT theo thứ tự mới nhất trước.</p>
          </div>
          <FhButton data-testid="reload-history" variant="secondary" :disabled="historyLoading || busy" @click="loadHistory()">Tải lại lịch sử</FhButton>
        </div>
        <p v-if="historyError" role="alert" class="rounded-[var(--radius-sm)] bg-danger-50 p-3 text-sm text-danger-800">{{ historyError }}</p>
        <p v-else-if="historyLoading && !history" role="status" class="text-sm text-ink-600">Đang tải lịch sử…</p>
        <p v-else-if="history && !history.drafts.length" class="text-sm text-ink-600">Chưa có phiên bản bản nháp trong lịch sử.</p>
        <template v-if="history && history.drafts.length && selectedHistoryDraft">
          <label for="history-revision" :class="consoleLabel">Phiên bản bản nháp</label>
          <select id="history-revision" v-model="selectedHistoryId" aria-label="Chọn phiên bản bản nháp" class="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm text-ink-800 focus-visible:outline-brand-600">
            <option v-for="snapshot in history.drafts" :key="snapshot.id" :value="snapshot.id">DRAFT · Lần sửa {{ snapshot.state.revision }} · phiên bản {{ snapshot.state.policy.version }}</option>
          </select>
          <dl data-testid="history-detail" class="space-y-3 rounded-[var(--radius-sm)] bg-ink-50 p-4 text-sm text-ink-800">
            <div><dt class="font-semibold">Trạng thái</dt><dd>{{ selectedHistoryDraft.state.status }} · Tài chính bị khóa ({{ selectedHistoryDraft.state.financialExecution }})</dd></div>
            <div><dt class="font-semibold">Phiên bản nội dung</dt><dd>{{ selectedHistoryDraft.state.policy.version }} · Lần sửa {{ selectedHistoryDraft.state.revision }}</dd></div>
            <div><dt class="font-semibold">Thời điểm tạo</dt><dd>{{ new Date(selectedHistoryDraft.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) }}</dd></div>
            <div><dt class="font-semibold">{{ parameterLabels.feeCeilingVnd }}</dt><dd>{{ formatCurrency(selectedHistoryDraft.state.policy.parameters.feeCeilingVnd) }}</dd></div>
            <div><dt class="font-semibold">{{ parameterLabels.proposalReviewAfterMinutes }}</dt><dd>{{ selectedHistoryDraft.state.policy.parameters.proposalReviewAfterMinutes }} phút</dd></div>
            <div><dt class="font-semibold">{{ parameterLabels.courierEvidenceReviewAfterMinutes }}</dt><dd>{{ selectedHistoryDraft.state.policy.parameters.courierEvidenceReviewAfterMinutes }} phút</dd></div>
            <div>
              <dt class="font-semibold">Điều kiện đang chặn tài chính</dt>
              <dd><ul class="mt-1 list-disc space-y-1 pl-5"><li v-for="blocker in history.blockers" :key="blocker">{{ blockerLabels[blocker] }}</li></ul></dd>
            </div>
          </dl>
          <p v-if="historyLoading" role="status" class="text-sm text-ink-600">Đang tải các phiên bản cũ hơn…</p>
          <FhButton v-if="historyCanLoadMore" data-testid="load-older-history" variant="secondary" :disabled="historyLoading || busy" @click="loadHistory(true)">Tải bản nháp cũ hơn</FhButton>
        </template>
      </section>
      <form data-testid="draft-form" class="max-w-[720px] space-y-4" novalidate @submit.prevent="save">
        <fieldset :disabled="busy || reloadRequired || !canReadPage || !auth.hasPermission('config:update')" class="space-y-4">
          <legend class="mb-3 text-xl font-semibold text-ink-900">Tham số bản nháp</legend>
          <p id="parameter-help" class="text-sm text-ink-600">Số nguyên không âm; không tự điền mức phí. Lưu chỉ tạo phiên bản nháp, không áp dụng chính sách.</p>
          <div v-for="(label, key) in parameterLabels" :key="key">
            <label :for="key" :class="consoleLabel">{{ label }}</label>
            <input :id="key" v-model="fields[key]" type="text" inputmode="numeric" required :class="[consoleField, 'w-full mt-1']" :aria-invalid="!!fieldErrors[key]" :aria-describedby="`parameter-help ${key}-error`" />
            <p :id="`${key}-error`" class="text-sm text-danger-700">{{ fieldErrors[key] }}</p>
          </div>
          <FhButton type="submit" :disabled="!canSave" :loading="saving">{{ saving ? 'Đang lưu…' : 'Lưu bản nháp' }}</FhButton>
        </fieldset>
        <p v-if="!auth.hasPermission('config:update')" class="text-sm text-ink-600">Bạn chỉ có quyền xem bản nháp.</p>
      </form>
      <section v-if="current.draft" class="max-w-[720px] space-y-4 border-t border-ink-200 pt-5" aria-labelledby="preview-title">
        <h2 id="preview-title" class="text-xl font-semibold text-ink-900">Xem trước tác động giả định</h2>
        <p id="preview-help" class="text-sm text-ink-600">Nhập thủ công một mẫu giả định cho bản nháp đã lưu. Không tra cứu đề xuất, hóa đơn hoặc yêu cầu đặt lịch thật. Kết quả không phải số tiền được duyệt.</p>
        <p v-if="dirty" class="text-sm text-warning-800">Tham số đang sửa chưa được lưu. Lưu bản nháp hoặc tải lại trước khi xem trước.</p>
        <form data-testid="preview-form" novalidate @submit.prevent="preview">
          <fieldset :disabled="!canPreview" class="space-y-4">
            <legend class="sr-only">Mẫu đề xuất giả định</legend>
            <div v-for="(label, key) in sampleLabels" :key="key">
              <label :for="key" :class="consoleLabel">{{ label }}</label>
              <input :id="key" v-model="sample[key]" type="text" :inputmode="key === 'proposalId' ? 'text' : 'numeric'" :required="key !== 'courierEvidenceAgeMinutes'" :class="[consoleField, 'w-full mt-1']" :aria-invalid="!!previewErrors[key]" :aria-describedby="`preview-help ${key}-error`" />
              <p :id="`${key}-error`" class="text-sm text-danger-700">{{ previewErrors[key] }}</p>
            </div>
            <FhButton type="submit" variant="secondary" :disabled="!canPreview" :loading="previewing">{{ previewing ? 'Đang xem trước…' : 'Xem trước giả định' }}</FhButton>
          </fieldset>
        </form>
        <div v-if="result" data-testid="preview-result" role="status" class="space-y-2 rounded-[var(--radius-sm)] bg-ink-50 p-4 text-sm text-ink-800">
          <p class="font-semibold">Kết quả giả định từ máy chủ · Lần sửa {{ result.policyRevision }} · Tài chính bị khóa</p>
          <dl v-for="proposal in result.proposals" :key="proposal.proposalId" class="space-y-2">
            <div><dt>Mã đề xuất giả định</dt><dd>{{ proposal.proposalId }}</dd></div>
            <div><dt>Phí giao giả định</dt><dd class="font-num">{{ formatCurrency(proposal.shippingFeeVnd) }}</dd></div>
            <div><dt>Phần khách hàng giả định</dt><dd class="font-num">{{ formatCurrency(proposal.customerShippingShare) }}</dd></div>
            <div><dt>Phần kỹ thuật viên giả định</dt><dd class="font-num">{{ formatCurrency(proposal.technicianShippingShare) }}</dd></div>
            <div><dt>Vượt ngưỡng xem xét phí</dt><dd>{{ proposal.aboveFeeCeiling ? 'Có' : 'Không' }}</dd></div>
            <div><dt>Đề xuất đến hạn xem xét</dt><dd>{{ proposal.proposalReviewDue ? 'Có' : 'Không' }}</dd></div>
            <div><dt>Bằng chứng đến hạn xem xét</dt><dd>{{ proposal.courierEvidenceReviewDue === null ? 'Chưa xác định' : proposal.courierEvidenceReviewDue ? 'Có' : 'Không' }}</dd></div>
          </dl>
        </div>
      </section>
    </template>
  </div>
</template>
