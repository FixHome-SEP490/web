<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import FhButton from '../../../components/FhButton.vue';
import ConsolePageHeader from '../../../components/console/ConsolePageHeader.vue';
import { consoleField, consoleLabel } from '../../../components/console/console-ui';
import { getHttpStatus } from '../../../api/client';
import { w3DeliveryPolicyApi, W3_BLOCKERS, type W3PolicyCurrent, type W3PolicyHistory, type W3PolicyParameters, type W3PolicyPreview, type W3PolicyLifecycleCurrent, type W3PolicyLifecycleHistory, type W3PolicyLifecyclePreview, type W3PolicyLifecycleVersion, type W3ImpactSample } from '../../../api/w3-delivery-policy.api';
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
const lifecycleCurrent = ref<W3PolicyLifecycleCurrent | null>(null);
const lifecycleHistory = ref<W3PolicyLifecycleHistory | null>(null);
const lifecycleLoading = ref(false);
const lifecycleSaving = ref(false);
const lifecyclePreviewing = ref(false);
const lifecycleTransitioning = ref(false);
const lifecycleUnavailable = ref(false);
const lifecycleLegacyFallback = ref(false);
const lifecycleError = ref('');
const lifecycleSuccess = ref('');
const lifecycleReloadRequired = ref(false);
const lifecycleResult = ref<W3PolicyLifecyclePreview | null>(null);
const lifecycleConfirmation = ref(false);
const lifecycleFields = reactive({ feeCeilingVnd: '', proposalReviewAfterMinutes: '', courierEvidenceReviewAfterMinutes: '' });
const lifecycleSample = reactive({ proposalId: '', proposalVersion: '', shippingFeeVnd: '', proposalAgeMinutes: '', courierEvidenceAgeMinutes: '' });
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
const lifecycleBusy = computed(() => lifecycleLoading.value || lifecycleSaving.value || lifecyclePreviewing.value || lifecycleTransitioning.value);
const canReadPage = computed(() => auth.hasRole('ADMIN') && auth.hasPermission('config:read'));
const canUpdateLifecycle = computed(() => canReadPage.value && auth.hasPermission('config:update') && !lifecycleUnavailable.value && !lifecycleReloadRequired.value);
const lifecycleVersion = computed(() => lifecycleCurrent.value?.version ?? null);
const legacyEditingAllowed = computed(() => !lifecycleVersion.value && (lifecycleLegacyFallback.value || (!!lifecycleCurrent.value && !lifecycleUnavailable.value)));
const lifecycleDirty = computed(() => {
  const saved = lifecycleVersion.value?.state.policy.parameters;
  return !!saved && (Object.keys(lifecycleFields) as (keyof W3PolicyParameters)[]).some(k => lifecycleFields[k] !== String(saved[k]));
});
const lifecycleReceiptMatches = computed(() => {
  const version = lifecycleVersion.value;
  const receipt = lifecycleResult.value?.preview;
  return !!version && version.state.status === 'DRAFT' && !!receipt && receipt.draftId === version.id && lifecycleResult.value?.preview.impact.policyRevision === version.state.revision && lifecycleResult.value.preview.impact.proposals.every(p => p.policySnapshot.fingerprint === version.state.policy.fingerprint);
});
const selectedHistoryDraft = computed(() => history.value?.drafts.find(draft => draft.id === selectedHistoryId.value) ?? null);
const canSave = computed(() => canReadPage.value && !!current.value && !busy.value && !reloadRequired.value && auth.hasPermission('config:update') && current.value.draft?.state.revision !== 2147483647);
const dirty = computed(() => {
  const saved = current.value?.draft?.state.policy.parameters;
  return !!saved && (Object.keys(fields) as (keyof W3PolicyParameters)[]).some(k => fields[k] !== String(saved[k]));
});
const canPreview = computed(() => canReadPage.value && !!current.value?.draft && !busy.value && !reloadRequired.value && !dirty.value);
let actorEpoch = 0;
let historyRequest = 0;
let lifecycleRequest = 0;

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
function lifecycleFailed(reason: unknown) {
  lifecycleResult.value = null; lifecycleConfirmation.value = false; lifecycleSuccess.value = '';
  const status = getHttpStatus(reason);
  lifecycleUnavailable.value = status === 404 || status === 503;
  lifecycleLegacyFallback.value = status === 404;
  lifecycleReloadRequired.value = true;
  lifecycleError.value = lifecycleUnavailable.value
    ? 'Quản lý vòng đời cấu hình chưa khả dụng (NOT_AVAILABLE). Các thao tác vòng đời đã bị ẩn.'
    : status === 409 ? 'Phiên bản đã thay đổi hoặc bản xem trước không còn khớp. Tải lại trước khi tiếp tục.'
      : status === 403 ? 'Bạn không có quyền cập nhật cấu hình vận hành.'
        : 'Chưa xác nhận được kết quả vòng đời. Tải lại để đối chiếu trước khi tiếp tục.';
}
async function loadLifecycle() {
  if (!canReadPage.value) return;
  const actor = actorEpoch;
  const request = ++lifecycleRequest;
  lifecycleLoading.value = true; lifecycleCurrent.value = null; lifecycleHistory.value = null;
  lifecycleResult.value = null; lifecycleConfirmation.value = false; lifecycleError.value = ''; lifecycleSuccess.value = '';
  try {
    const [loaded, historyPage] = await Promise.all([w3DeliveryPolicyApi.lifecycleCurrent(), w3DeliveryPolicyApi.lifecycleHistory()]);
    if (actor !== actorEpoch || request !== lifecycleRequest || !canReadPage.value) return;
    lifecycleCurrent.value = loaded; lifecycleHistory.value = historyPage;
    const version = loaded.version;
    for (const key of Object.keys(lifecycleFields) as (keyof W3PolicyParameters)[]) lifecycleFields[key] = version?.state.status === 'DRAFT' ? String(version.state.policy.parameters[key]) : '';
    lifecycleReloadRequired.value = false; lifecycleUnavailable.value = false; lifecycleLegacyFallback.value = false;
  } catch (reason) {
    if (actor === actorEpoch && request === lifecycleRequest) lifecycleFailed(reason);
  } finally { if (actor === actorEpoch && request === lifecycleRequest) lifecycleLoading.value = false; }
}
async function refreshLifecycle() {
  const actor = actorEpoch;
  try {
    const [loaded, historyPage] = await Promise.all([w3DeliveryPolicyApi.lifecycleCurrent(), w3DeliveryPolicyApi.lifecycleHistory()]);
    if (actor !== actorEpoch || !canReadPage.value) return;
    lifecycleCurrent.value = loaded; lifecycleHistory.value = historyPage;
    const version = loaded.version;
    for (const key of Object.keys(lifecycleFields) as (keyof W3PolicyParameters)[]) lifecycleFields[key] = version?.state.status === 'DRAFT' ? String(version.state.policy.parameters[key]) : '';
    lifecycleReloadRequired.value = false; lifecycleUnavailable.value = false; lifecycleLegacyFallback.value = false;
  } catch (reason) { if (actor === actorEpoch) lifecycleFailed(reason); }
}
async function saveLifecycle() {
  if (!canUpdateLifecycle.value || lifecycleBusy.value) return;
  const actor = actorEpoch;
  const values: Record<string, number> = {};
  for (const key of Object.keys(lifecycleFields) as (keyof W3PolicyParameters)[]) {
    const parsed = numeric(lifecycleFields[key]);
    if (parsed === null) { lifecycleError.value = 'Nhập đủ ba tham số dưới dạng số nguyên không âm.'; return; }
    values[key] = parsed;
  }
  const params = values as unknown as W3PolicyParameters;
  lifecycleSaving.value = true; lifecycleError.value = ''; lifecycleSuccess.value = ''; lifecycleResult.value = null; lifecycleConfirmation.value = false;
  try {
    const currentVersion = lifecycleVersion.value;
    let saved: W3PolicyLifecycleVersion;
    if (currentVersion?.state.status === 'DRAFT') saved = await w3DeliveryPolicyApi.reviseLifecycle(currentVersion.id, currentVersion.state.revision, params);
    else saved = await w3DeliveryPolicyApi.startLifecycle(currentVersion?.state.revision ?? 0, params);
    if (actor !== actorEpoch || !canReadPage.value) return;
    lifecycleCurrent.value = { ...lifecycleCurrent.value!, version: saved };
    lifecycleFields.feeCeilingVnd = String(saved.state.policy.parameters.feeCeilingVnd);
    lifecycleFields.proposalReviewAfterMinutes = String(saved.state.policy.parameters.proposalReviewAfterMinutes);
    lifecycleFields.courierEvidenceReviewAfterMinutes = String(saved.state.policy.parameters.courierEvidenceReviewAfterMinutes);
    lifecycleSuccess.value = 'Đã lưu phiên bản DRAFT. Cấu hình chưa được kích hoạt; tài chính vẫn bị khóa.';
    await refreshLifecycle();
  } catch (reason) { if (actor === actorEpoch) lifecycleFailed(reason); }
  finally { if (actor === actorEpoch) lifecycleSaving.value = false; }
}
async function previewLifecycle() {
  const version = lifecycleVersion.value;
  if (!canUpdateLifecycle.value || lifecycleBusy.value || !version || version.state.status !== 'DRAFT' || lifecycleDirty.value) return;
  const parsed: Record<string, number> = {};
  for (const key of ['proposalVersion', 'shippingFeeVnd', 'proposalAgeMinutes', 'courierEvidenceAgeMinutes'] as const) {
    if (key === 'courierEvidenceAgeMinutes' && lifecycleSample[key] === '') continue;
    const value = numeric(lifecycleSample[key], key === 'proposalVersion' ? 1 : 0);
    if (value === null) { lifecycleError.value = 'Nhập đầy đủ dữ liệu giả định hợp lệ trước khi xem trước.'; return; }
    parsed[key] = value;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_/-]{0,255}$/.test(lifecycleSample.proposalId)) { lifecycleError.value = 'Nhập mã đề xuất giả định hợp lệ.'; return; }
  const inputs: W3ImpactSample[] = [{ proposalId: lifecycleSample.proposalId, proposalVersion: parsed.proposalVersion!, shippingFeeVnd: parsed.shippingFeeVnd!, proposalAgeMinutes: parsed.proposalAgeMinutes!, courierEvidenceAgeMinutes: lifecycleSample.courierEvidenceAgeMinutes === '' ? null : parsed.courierEvidenceAgeMinutes! }];
  const actor = actorEpoch;
  lifecyclePreviewing.value = true; lifecycleError.value = ''; lifecycleSuccess.value = ''; lifecycleResult.value = null; lifecycleConfirmation.value = false;
  try {
    const result = await w3DeliveryPolicyApi.saveLifecyclePreview(version, inputs);
    if (actor === actorEpoch && canReadPage.value && lifecycleVersion.value?.id === version.id && lifecycleVersion.value.state.revision === version.state.revision && result.preview.impact.proposals.every(p => p.policySnapshot.fingerprint === version.state.policy.fingerprint)) lifecycleResult.value = result;
  } catch (reason) { if (actor === actorEpoch) lifecycleFailed(reason); }
  finally { if (actor === actorEpoch) lifecyclePreviewing.value = false; }
}
async function activateLifecycle() {
  const version = lifecycleVersion.value; const receipt = lifecycleResult.value?.preview;
  if (!canUpdateLifecycle.value || lifecycleBusy.value || !lifecycleConfirmation.value || !version || version.state.status !== 'DRAFT' || !lifecycleReceiptMatches.value || !receipt) return;
  const actor = actorEpoch; lifecycleTransitioning.value = true; lifecycleError.value = ''; lifecycleSuccess.value = '';
  try {
    const active = await w3DeliveryPolicyApi.activate(version.id, version.state.revision, receipt.id);
    if (actor !== actorEpoch || !canReadPage.value) return;
    lifecycleCurrent.value = { ...lifecycleCurrent.value!, version: active }; lifecycleResult.value = null; lifecycleConfirmation.value = false;
    lifecycleSuccess.value = 'Đã kích hoạt cấu hình vận hành. Finance 70/30 remains blocked.';
    await refreshLifecycle();
  } catch (reason) { if (actor === actorEpoch) lifecycleFailed(reason); }
  finally { if (actor === actorEpoch) lifecycleTransitioning.value = false; }
}
async function retireLifecycle() {
  const version = lifecycleVersion.value;
  if (!canUpdateLifecycle.value || lifecycleBusy.value || !version || version.state.status !== 'ACTIVE') return;
  if (!window.confirm(`Ngừng cấu hình vận hành phiên bản ${version.state.policy.version}? Finance vẫn bị khóa.`)) return;
  const actor = actorEpoch; lifecycleTransitioning.value = true; lifecycleError.value = ''; lifecycleSuccess.value = '';
  try {
    const retired = await w3DeliveryPolicyApi.retire(version.id, version.state.revision);
    if (actor !== actorEpoch || !canReadPage.value) return;
    lifecycleCurrent.value = { ...lifecycleCurrent.value!, version: retired }; lifecycleResult.value = null;
    lifecycleSuccess.value = 'Đã ngừng phiên bản. Phiên bản RETIRED không thể kích hoạt lại; hãy tạo DRAFT mới nếu cần.';
    await refreshLifecycle();
  } catch (reason) { if (actor === actorEpoch) lifecycleFailed(reason); }
  finally { if (actor === actorEpoch) lifecycleTransitioning.value = false; }
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
watch([lifecycleFields, lifecycleSample], () => { lifecycleResult.value = null; lifecycleConfirmation.value = false; lifecycleSuccess.value = ''; }, { flush: 'sync' });
watch(() => [auth.user?.id, auth.userRole, auth.token, canReadPage.value] as const, () => {
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
  lifecycleRequest += 1; lifecycleCurrent.value = null; lifecycleHistory.value = null; lifecycleResult.value = null;
  lifecycleConfirmation.value = false; lifecycleUnavailable.value = false; lifecycleLegacyFallback.value = false; lifecycleReloadRequired.value = false; lifecycleError.value = ''; lifecycleSuccess.value = '';
  error.value = '';
  success.value = '';
  fieldErrors.value = {};
  previewErrors.value = {};
  for (const key of Object.keys(fields) as (keyof W3PolicyParameters)[]) fields[key] = '';
  if (canReadPage.value) { void load(); void loadLifecycle(); }
}, { flush: 'sync' });
onMounted(() => { load(); loadLifecycle(); });
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
    <section v-if="lifecycleLoading" role="status" class="text-sm text-ink-600">Đang tải vòng đời cấu hình…</section>
    <section v-if="lifecycleError" role="alert" class="rounded-[var(--radius-sm)] bg-danger-50 p-4 text-sm text-danger-800">{{ lifecycleError }}</section>
    <p v-if="lifecycleSuccess" role="status" class="text-sm text-success-800">{{ lifecycleSuccess }}</p>
    <section v-if="lifecycleCurrent && !lifecycleUnavailable && canReadPage" data-testid="lifecycle-section" class="space-y-5 border-t border-ink-200 pt-5" aria-labelledby="lifecycle-title">
      <div class="max-w-4xl space-y-2">
        <h2 id="lifecycle-title" class="text-xl font-semibold text-ink-900">Vòng đời cấu hình vận hành giao linh kiện</h2>
        <div class="rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          <p class="font-semibold">ACTIVE chỉ là cấu hình vận hành · Finance 70/30 remains blocked.</p>
          <p>Không có legal hoặc ledger approval trong luồng này. Cấu hình không tạo payout, không thay đổi phí giao thực tế và không đặt giao hàng.</p>
        </div>
      </div>
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <section class="space-y-4 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-4" aria-labelledby="lifecycle-current-title">
          <div>
            <h3 id="lifecycle-current-title" class="text-lg font-semibold text-ink-900">Phiên bản hiện tại</h3>
            <p v-if="lifecycleVersion" class="mt-1 text-sm text-ink-700">{{ lifecycleVersion.state.status }} · revision {{ lifecycleVersion.state.revision }} · nội dung v{{ lifecycleVersion.state.policy.version }}</p>
            <p v-else class="mt-1 text-sm text-ink-600">Chưa có phiên bản lifecycle.</p>
          </div>
          <dl v-if="lifecycleVersion" class="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt class="font-medium text-ink-700">Trạng thái tài chính</dt><dd>BLOCKED</dd></div>
            <div><dt class="font-medium text-ink-700">Chính sách có hiệu lực</dt><dd>Không có (null)</dd></div>
            <div v-for="(label, key) in parameterLabels" :key="key" class="min-w-0"><dt class="font-medium text-ink-700">{{ label }}</dt><dd class="break-words">{{ key === 'feeCeilingVnd' ? formatCurrency(lifecycleVersion.state.policy.parameters[key]) : `${lifecycleVersion.state.policy.parameters[key]} phút` }}</dd></div>
          </dl>
          <form v-if="lifecycleVersion?.state.status !== 'ACTIVE'" data-testid="lifecycle-parameters-form" class="space-y-3 border-t border-ink-200 pt-4" novalidate @submit.prevent="saveLifecycle">
            <fieldset :disabled="!canUpdateLifecycle || lifecycleBusy" class="space-y-3">
              <legend class="text-base font-semibold text-ink-900">{{ lifecycleVersion?.state.status === 'DRAFT' ? 'Cập nhật DRAFT' : 'Tạo DRAFT lifecycle' }}</legend>
              <p class="text-sm text-ink-600">Lưu tạo snapshot mới theo revision CAS. Không tự kích hoạt cấu hình.</p>
              <div v-for="(label, key) in parameterLabels" :key="key">
                <label :for="`lifecycle-${key}`" :class="consoleLabel">{{ label }}</label>
                <input :id="`lifecycle-${key}`" v-model="lifecycleFields[key]" type="text" inputmode="numeric" required :class="[consoleField, 'mt-1 w-full']" />
              </div>
              <FhButton type="submit" :disabled="!canUpdateLifecycle" :loading="lifecycleSaving">{{ lifecycleSaving ? 'Đang lưu…' : lifecycleVersion ? 'Lưu revision mới' : 'Tạo DRAFT' }}</FhButton>
            </fieldset>
            <p v-if="!auth.hasPermission('config:update')" class="text-sm text-ink-600">Bạn chỉ có quyền xem cấu hình lifecycle.</p>
          </form>
          <div v-if="lifecycleVersion?.state.status === 'ACTIVE'" class="border-t border-ink-200 pt-4">
            <FhButton data-testid="retire-lifecycle" variant="secondary" :disabled="!canUpdateLifecycle || lifecycleBusy" :loading="lifecycleTransitioning" @click="retireLifecycle">Ngừng cấu hình ACTIVE</FhButton>
          </div>
          <p v-if="lifecycleVersion?.state.status === 'RETIRED'" class="border-t border-ink-200 pt-4 text-sm text-ink-700">RETIRED là trạng thái cuối, không thể kích hoạt lại. Tạo DRAFT mới để bắt đầu phiên bản tiếp theo.</p>
        </section>
        <section class="space-y-4 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-4" aria-labelledby="lifecycle-history-title">
          <div>
            <h3 id="lifecycle-history-title" class="text-lg font-semibold text-ink-900">Lịch sử lifecycle</h3>
            <p class="text-sm text-ink-600">Lịch sử gồm DRAFT, ACTIVE và RETIRED theo revision mới nhất.</p>
          </div>
          <p v-if="!lifecycleHistory?.versions.length" class="text-sm text-ink-600">Chưa có phiên bản lifecycle trong lịch sử.</p>
          <ol v-else data-testid="lifecycle-history" class="space-y-3">
            <li v-for="version in lifecycleHistory.versions" :key="version.id" class="rounded-[var(--radius-sm)] bg-ink-50 p-3 text-sm">
              <p class="font-semibold">{{ version.state.status }} · revision {{ version.state.revision }} · nội dung v{{ version.state.policy.version }}</p>
              <p class="break-all text-ink-600">{{ version.id }} · Tài chính {{ version.state.financialExecution }}</p>
              <p v-if="version.activationPreviewId" class="break-all text-ink-600">Receipt kích hoạt: {{ version.activationPreviewId }}</p>
              <p class="text-ink-600">{{ new Date(version.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) }}</p>
            </li>
          </ol>
        </section>
      </div>
      <section v-if="lifecycleVersion?.state.status === 'DRAFT'" class="max-w-4xl space-y-4 rounded-[var(--radius-sm)] border border-ink-200 p-4" aria-labelledby="lifecycle-preview-title">
        <div>
          <h3 id="lifecycle-preview-title" class="text-lg font-semibold text-ink-900">Preview giả định có receipt máy chủ</h3>
          <p class="text-sm text-ink-600">Các mẫu nhập tay chỉ dùng mô phỏng. Preview được lưu phía máy chủ và chỉ có thể kích hoạt đúng Admin, version, revision và snapshot đã xem trước.</p>
        </div>
        <p v-if="lifecycleDirty" class="text-sm text-warning-800">Tham số đã thay đổi. Lưu revision mới trước khi preview.</p>
        <form data-testid="lifecycle-preview-form" class="grid gap-3 sm:grid-cols-2" novalidate @submit.prevent="previewLifecycle">
          <fieldset :disabled="!canUpdateLifecycle || lifecycleBusy || lifecycleDirty" class="contents">
            <div v-for="(label, key) in sampleLabels" :key="key">
              <label :for="`lifecycle-${key}`" :class="consoleLabel">{{ label }}</label>
              <input :id="`lifecycle-${key}`" v-model="lifecycleSample[key]" type="text" :inputmode="key === 'proposalId' ? 'text' : 'numeric'" :required="key !== 'courierEvidenceAgeMinutes'" :class="[consoleField, 'mt-1 w-full']" />
            </div>
            <div class="sm:col-span-2"><FhButton type="submit" variant="secondary" :disabled="!canUpdateLifecycle || lifecycleDirty" :loading="lifecyclePreviewing">{{ lifecyclePreviewing ? 'Đang tạo preview…' : 'Tạo preview và lưu receipt' }}</FhButton></div>
          </fieldset>
        </form>
        <div v-if="lifecycleResult && lifecycleReceiptMatches" data-testid="lifecycle-preview-receipt" role="status" class="space-y-2 rounded-[var(--radius-sm)] bg-ink-50 p-4 text-sm">
          <p class="font-semibold">Preview giả định · receipt {{ lifecycleResult.preview.id }} · revision {{ lifecycleResult.preview.impact.policyRevision }} · Finance BLOCKED</p>
          <dl v-for="proposal in lifecycleResult.preview.impact.proposals" :key="proposal.proposalId" class="grid gap-1 sm:grid-cols-2">
            <div><dt>Mã mẫu giả định</dt><dd>{{ proposal.proposalId }}</dd></div><div><dt>Phí giả định</dt><dd>{{ formatCurrency(proposal.shippingFeeVnd) }}</dd></div>
            <div><dt>Chia giả định cho khách</dt><dd>{{ formatCurrency(proposal.customerShippingShare) }}</dd></div><div><dt>Chia giả định cho kỹ thuật viên</dt><dd>{{ formatCurrency(proposal.technicianShippingShare) }}</dd></div>
            <div><dt>Vượt ngưỡng</dt><dd>{{ proposal.aboveFeeCeiling ? 'Có' : 'Không' }}</dd></div><div><dt>Đề xuất đến hạn xem xét</dt><dd>{{ proposal.proposalReviewDue ? 'Có' : 'Không' }}</dd></div>
          </dl>
          <label class="flex items-start gap-3 pt-2 text-warning-800"><input v-model="lifecycleConfirmation" data-testid="lifecycle-activate-confirm" type="checkbox" class="mt-1 size-4" /><span>Tôi xác nhận chỉ kích hoạt cấu hình vận hành này. Legal/ledger approval chưa có; payout theo Finance 70/30 vẫn bị chặn.</span></label>
          <FhButton data-testid="activate-lifecycle" :disabled="!canUpdateLifecycle || !lifecycleReceiptMatches || !lifecycleConfirmation || lifecycleBusy" :loading="lifecycleTransitioning" @click="activateLifecycle">Kích hoạt cấu hình vận hành</FhButton>
        </div>
      </section>
    </section>
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
      <section v-if="lifecycleVersion && lifecycleVersion.state.status !== 'DRAFT'" data-testid="legacy-lifecycle-locked" class="rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        <p class="font-semibold">Luồng bản nháp legacy đang ở chế độ chỉ đọc.</p>
        <p>Đã có phiên bản lifecycle {{ lifecycleVersion.state.status }} · revision {{ lifecycleVersion.state.revision }}. Tạo, sửa và chuyển trạng thái dùng riêng API versions; cấu hình vận hành không mở tài chính.</p>
      </section>
      <form v-if="legacyEditingAllowed" data-testid="draft-form" class="max-w-[720px] space-y-4" novalidate @submit.prevent="save">
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
      <section v-if="current.draft && legacyEditingAllowed" class="max-w-[720px] space-y-4 border-t border-ink-200 pt-5" aria-labelledby="preview-title">
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
