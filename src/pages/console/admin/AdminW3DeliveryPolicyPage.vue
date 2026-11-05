<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import FhButton from '../../../components/FhButton.vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import { consoleField, consoleLabel } from '../../../components/console/console-ui';
import { getHttpStatus } from '../../../api/client';
import { w3DeliveryPolicyApi, W3_BLOCKERS, type W3PolicyCurrent, type W3PolicyParameters, type W3PolicyPreview } from '../../../api/w3-delivery-policy.api';
import { useAuthStore } from '../../../stores';
import { formatCurrencyVND as formatCurrency } from '../../../utils/formatters';

const auth = useAuthStore();
const current = ref<W3PolicyCurrent | null>(null);
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
const canSave = computed(() => !!current.value && !busy.value && !reloadRequired.value && auth.hasPermission('config:update') && current.value.draft?.state.revision !== 2147483647);
const dirty = computed(() => {
  const saved = current.value?.draft?.state.policy.parameters;
  return !!saved && (Object.keys(fields) as (keyof W3PolicyParameters)[]).some(k => fields[k] !== String(saved[k]));
});
const canPreview = computed(() => !!current.value?.draft && !busy.value && !reloadRequired.value && !dirty.value);

function numeric(value: string, minimum = 0): number | null {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) return null;
  return Number(value);
}
function failed(reason: unknown) {
  success.value = ''; result.value = null;
  const status = getHttpStatus(reason);
  unavailable.value = status === 404 || status === 503;
  reloadRequired.value = true;
  if (unavailable.value) { current.value = null; error.value = 'Chưa có dịch vụ bản nháp chính sách giao linh kiện (NOT_AVAILABLE).'; }
  else if (status === 409) error.value = 'Bản nháp đã thay đổi. Nội dung nhập được giữ lại; vui lòng tải lại trước khi tiếp tục. Tải lại sẽ thay nội dung bằng bản máy chủ.';
  else if (status === 403) error.value = 'Bạn không có quyền thực hiện thao tác này. Vui lòng tải lại.';
  else error.value = 'Chưa xác nhận được dữ liệu hoặc kết quả. Vui lòng tải lại để đối chiếu trước khi tiếp tục.';
}
async function load() {
  if (busy.value) return;
  loading.value = true; current.value = null; result.value = null; success.value = ''; error.value = '';
  fieldErrors.value = {}; previewErrors.value = {};
  try {
    current.value = await w3DeliveryPolicyApi.current();
    for (const key of Object.keys(fields) as (keyof W3PolicyParameters)[]) fields[key] = current.value.draft ? String(current.value.draft.state.policy.parameters[key]) : '';
    reloadRequired.value = false; unavailable.value = false;
  } catch (reason) { failed(reason); }
  finally { loading.value = false; }
}
async function save() {
  if (!canSave.value) return;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(fields)) if (numeric(fields[key as keyof typeof fields]) === null) errors[key] = 'Nhập số nguyên không âm, tối đa 9.007.199.254.740.991.';
  fieldErrors.value = errors;
  if (Object.keys(errors).length) return;
  const parameters = { feeCeilingVnd: Number(fields.feeCeilingVnd), proposalReviewAfterMinutes: Number(fields.proposalReviewAfterMinutes), courierEvidenceReviewAfterMinutes: Number(fields.courierEvidenceReviewAfterMinutes) };
  saving.value = true; error.value = ''; success.value = ''; result.value = null;
  try {
    const existing = current.value!.draft;
    const saved = existing ? await w3DeliveryPolicyApi.revise(existing.id, existing.state.revision, parameters) : await w3DeliveryPolicyApi.create(parameters);
    current.value = { ...current.value!, draft: saved };
    for (const key of Object.keys(fields) as (keyof W3PolicyParameters)[]) fields[key] = String(saved.state.policy.parameters[key]);
    success.value = 'Đã lưu bản nháp. Tài chính vẫn bị khóa.';
  } catch (reason) { failed(reason); }
  finally { saving.value = false; }
}
async function preview() {
  if (!canPreview.value || !current.value?.draft) return;
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
    result.value = await w3DeliveryPolicyApi.preview(current.value.draft, [{ proposalId: sample.proposalId, proposalVersion: Number(sample.proposalVersion), shippingFeeVnd: Number(sample.shippingFeeVnd), proposalAgeMinutes: Number(sample.proposalAgeMinutes), courierEvidenceAgeMinutes: sample.courierEvidenceAgeMinutes === '' ? null : Number(sample.courierEvidenceAgeMinutes) }]);
  } catch (reason) { failed(reason); }
  finally { previewing.value = false; }
}
watch([fields, sample], () => { result.value = null; success.value = ''; }, { flush: 'sync' });
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
    <template v-if="current && !unavailable">
      <section class="space-y-3 text-sm text-ink-700" aria-labelledby="current-title">
        <h2 id="current-title" class="text-xl font-semibold text-ink-900">Bản nháp hiện tại</h2>
        <p v-if="current.draft">Bản nháp · Phiên bản nội dung {{ current.draft.state.policy.version }} · Lần sửa {{ current.draft.state.revision }}</p>
        <p v-else>Chưa có bản nháp. Nhập đủ các tham số để tạo bản nháp đầu tiên.</p>
        <details><summary class="cursor-pointer focus-visible:outline-brand-600">Điều kiện đang chặn tài chính</summary>
          <ul class="list-disc pl-5"><li v-for="blocker in current.blockers" :key="blocker">{{ blockerLabels[blocker] }}</li></ul>
        </details>
      </section>
      <form data-testid="draft-form" class="max-w-[720px] space-y-4" novalidate @submit.prevent="save">
        <fieldset :disabled="busy || reloadRequired || !auth.hasPermission('config:update')" class="space-y-4">
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
