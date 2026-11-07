<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { FhButton } from '.';
import { useAuthStore } from '../stores/auth';
import { UserRole } from '../types';
import { isDeliveryPhysicalRequestId } from '../api/w3-delivery-physical.api';
import { w3DeliveryTermsApi, type DeliveryTermsRead } from '../api/w3-delivery-terms.api';

const props = defineProps<{
  requestId: string; requestType: string; fulfillmentMethod: string; shippingFee: number | null | undefined;
  audience: 'customer' | 'technician' | 'manager'; sourceOwnerId?: string | null; technicianId?: string | null;
}>();
const auth = useAuthStore();
const data = ref<DeliveryTermsRead | null>(null);
const status = ref<'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'forbidden'>('idle');
const errorMessage = ref('');
const accepted = ref(false);
const busy = ref(false);
const requiresReload = ref(false);
const retry = ref<(() => Promise<void>) | null>(null);
let generation = 0;
let alive = true;

const role = { customer: UserRole.CUSTOMER, technician: UserRole.TECHNICIAN, manager: UserRole.SERVICE_MANAGER } as const;
const isCurrentParty = computed(() => props.audience === 'customer'
  ? props.sourceOwnerId === auth.user?.id
  : props.audience === 'technician' ? props.technicianId === auth.user?.id : false);
const contextValid = computed(() => isDeliveryPhysicalRequestId(props.requestId) && props.requestType === 'additional'
  && props.fulfillmentMethod === 'delivery' && typeof props.shippingFee === 'number' && Number.isSafeInteger(props.shippingFee)
  && props.shippingFee > 0 && auth.user?.role === role[props.audience] && !!auth.user.id
  && (props.audience === 'manager' || isCurrentParty.value));
const state = computed(() => data.value?.state ?? null);
const currentShare = computed(() => props.audience === 'customer' ? state.value?.quote.customerShippingShare
  : props.audience === 'technician' ? state.value?.quote.technicianShippingShare : undefined);
const ownConsentRecorded = computed(() => props.audience === 'customer' ? state.value?.customerConsented
  : props.audience === 'technician' ? state.value?.technicianConsented : false);
const sourceMatches = computed(() => !!state.value && typeof props.shippingFee === 'number'
  && Number.isSafeInteger(props.shippingFee) && props.shippingFee > 0
  && state.value.quote.totalShippingFee <= props.shippingFee);
const termsReadyForPhysical = computed(() => !!state.value && !data.value?.invalidated && sourceMatches.value
  && state.value.customerConsented && state.value.technicianConsented && state.value.actual !== null);
const canConsent = computed(() => props.audience !== 'manager' && contextValid.value && status.value === 'ready'
  && !requiresReload.value && !data.value?.invalidated && !!state.value && currentShare.value !== undefined
  && sourceMatches.value && !ownConsentRecorded.value);
const amount = (value: number | string) => `${new Intl.NumberFormat('vi-VN').format(typeof value === 'string' ? BigInt(value) : value)} ₫`;
const scopeKey = () => `${props.requestId}:${auth.user?.id ?? ''}:${props.audience}`;
const current = (token: number, key: string) => alive && token === generation && key === scopeKey();

async function load() {
  const token = ++generation;
  const key = scopeKey();
  data.value = null;
  errorMessage.value = '';
  accepted.value = false;
  if (!contextValid.value) { status.value = 'idle'; return; }
  status.value = 'loading';
  try {
    const response = await w3DeliveryTermsApi.read(props.requestId);
    if (!current(token, key)) return;
    data.value = response;
    requiresReload.value = false;
    retry.value = null;
    status.value = 'ready';
  } catch (error) {
    if (!current(token, key)) return;
    data.value = null;
    const http = typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status : undefined;
    status.value = http === 404 || http === 503 ? 'unavailable' : http === 401 || http === 403 ? 'forbidden' : 'error';
  }
}
watch(() => [props.requestId, props.requestType, props.fulfillmentMethod, props.shippingFee, props.audience,
  props.sourceOwnerId, props.technicianId, auth.user?.id, auth.user?.role, auth.token] as const, () => {
  ++generation; data.value = null; status.value = 'idle'; retry.value = null; requiresReload.value = false; busy.value = false;
  if (contextValid.value) void load();
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { alive = false; ++generation; });

function consentCommand() {
  const s = state.value;
  if (!s || currentShare.value === undefined || currentShare.value === null) return null;
  const action = 'consent';
  const key = `fixhome:w3-delivery-terms:${scopeKey()}:${action}`;
  const fields = { quoteVersion: s.quote.quoteVersion, quoteFingerprint: s.quote.fingerprint,
    totalShippingFee: s.quote.totalShippingFee, shippingShare: currentShare.value, accepted: true as const };
  const previous = sessionStorage.getItem(key);
  let commandId: string;
  if (previous) {
    try {
      const saved = JSON.parse(previous) as { expectedVersion: number; fields: typeof fields; commandId: string };
      if (saved.expectedVersion !== s.version || JSON.stringify(saved.fields) !== JSON.stringify(fields)) throw new Error('stale');
      commandId = saved.commandId;
    } catch { throw new Error('Hãy tải lại trạng thái trước khi tiếp tục.'); }
  } else {
    commandId = crypto.randomUUID();
    sessionStorage.setItem(key, JSON.stringify({ expectedVersion: s.version, fields, commandId }));
  }
  return { key, body: { commandId, expectedVersion: s.version, ...fields } };
}
async function submitConsent() {
  if (!canConsent.value || !accepted.value || busy.value) return;
  const payload = consentCommand();
  if (!payload) return;
  const token = generation;
  const key = scopeKey();
  busy.value = true; errorMessage.value = '';
  retry.value = () => submitConsent();
  try {
    await w3DeliveryTermsApi.consent(props.requestId, payload.body, currentShare.value!);
    if (!current(token, key)) return;
    sessionStorage.removeItem(payload.key);
    retry.value = null;
    await load();
    errorMessage.value = status.value === 'ready' ? 'Đã làm mới điều khoản từ hệ thống.' : 'Đã gửi consent; chưa tải lại được trạng thái.';
  } catch (error) {
    if (!current(token, key)) return;
    const http = typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status : undefined;
    if (http === 409) {
      sessionStorage.removeItem(payload.key);
      requiresReload.value = true; data.value = null; retry.value = null;
      errorMessage.value = 'Trạng thái đã thay đổi. Hãy tải lại trước khi tiếp tục.';
    } else if (http === 401 || http === 403 || http === 404 || http === 503) {
      data.value = null; retry.value = null;
      status.value = http === 401 || http === 403 ? 'forbidden' : 'unavailable';
    } else {
      errorMessage.value = 'Chưa xác định được kết quả. Có thể thử lại cùng consent hoặc tải lại trạng thái.';
    }
  } finally { if (alive && key === scopeKey()) busy.value = false; }
}
</script>

<template>
  <section v-if="contextValid" class="space-y-3 rounded-lg border border-ink-200 bg-white p-4" aria-live="polite" :aria-busy="status === 'loading'">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div><h3 class="text-sm font-semibold text-ink-900">Điều khoản phí giao hàng</h3>
        <p class="mt-1 break-all text-xs text-ink-600">Mã yêu cầu: {{ requestId }}</p></div>
      <span class="rounded-md bg-ink-100 px-2 py-1 text-xs font-medium text-ink-700">Điều khoản trước hóa đơn</span>
    </div>
    <p v-if="status === 'loading'" class="text-sm text-ink-600" role="status">Đang tải điều khoản…</p>
    <div v-else-if="status === 'unavailable'" class="space-y-2 text-sm text-ink-700" role="status">
      <p>Chưa có điều khoản khả dụng để hiển thị.</p><FhButton data-testid="delivery-terms-reload" variant="secondary" size="sm" @click="load">Tải lại điều khoản</FhButton>
    </div>
    <div v-else-if="status === 'forbidden'" class="text-sm text-danger-700" role="alert">Bạn không có quyền xem điều khoản này.</div>
    <div v-else-if="status === 'error'" class="space-y-2 text-sm" role="alert">
      <p class="text-danger-700">Không thể xác minh điều khoản từ hệ thống.</p><FhButton data-testid="delivery-terms-reload" variant="secondary" size="sm" @click="load">Tải lại điều khoản</FhButton>
    </div>
    <div v-else-if="requiresReload" class="space-y-2 text-sm" role="alert">
      <p class="text-warning-800">{{ errorMessage }}</p><FhButton data-testid="delivery-terms-reload" variant="secondary" size="sm" @click="load">Tải lại điều khoản</FhButton>
    </div>
    <template v-else-if="status === 'ready' && data">
      <p v-if="!state" class="text-sm text-ink-700">Chưa có điều khoản phí giao hàng được Backend ghi nhận.</p>
      <template v-else>
        <p class="text-xs text-ink-600">Chính sách {{ state.quote.policyVersion }} · Điều khoản phiên bản {{ state.quote.quoteVersion }}</p>
        <dl class="grid gap-2 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-2"><dt class="text-ink-600">Tổng phí giao</dt><dd class="font-num text-ink-900">{{ amount(state.quote.totalShippingFee) }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-ink-600">Khách hàng chịu (70%)</dt><dd class="font-num text-ink-900">{{ amount(state.quote.customerShippingShare) }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-ink-600">Kỹ thuật viên chịu (30%)</dt><dd class="font-num text-ink-900">{{ amount(state.quote.technicianShippingShare) }}</dd></div>
          <div v-if="state.actual" class="flex justify-between gap-2"><dt class="text-ink-600">Phí thực tế đã ghi nhận</dt><dd class="font-num text-ink-900">{{ amount(state.actual.totalShippingFee) }}</dd></div>
          <div v-if="state.actual" class="flex justify-between gap-2"><dt class="text-ink-600">Khách hàng chịu thực tế (70%)</dt><dd class="font-num text-ink-900">{{ amount(state.actual.customerShippingShare) }}</dd></div>
          <div v-if="state.actual" class="flex justify-between gap-2"><dt class="text-ink-600">Kỹ thuật viên chịu thực tế (30%)</dt><dd class="font-num text-ink-900">{{ amount(state.actual.technicianShippingShare) }}</dd></div>
          <div v-if="data.recordedConditionalCeilings" class="flex justify-between gap-2 sm:col-span-2"><dt class="text-ink-600">Tổng điều khoản đã ghi nhận</dt><dd class="font-num text-ink-900">{{ amount(data.recordedConditionalCeilings.shipping) }}</dd></div>
        </dl>
        <p v-if="state.actual" class="text-xs text-warning-800">Phí thực tế mới được ghi nhận, chưa xác minh độc lập.</p>
        <p v-if="data.invalidated" class="text-sm text-warning-800" role="status">Điều khoản đã mất hiệu lực; consent đã khóa.</p>
        <p v-else-if="!sourceMatches" class="text-sm text-warning-800" role="status">Phí trong yêu cầu không khớp snapshot terms; consent đã khóa.</p>
        <p v-if="termsReadyForPhysical" class="text-xs text-success-700">Đã đủ điều kiện ghi nhận giao nhận vật lý.</p>
        <p v-else class="text-xs text-ink-600">Giao nhận vật lý chỉ khả dụng sau khi cả hai bên đồng thuận và phí thực tế được ghi nhận.</p>
        <div v-if="ownConsentRecorded" class="text-sm text-success-700">Bạn đã đồng ý điều khoản giao hàng.</div>
        <div v-else-if="canConsent" data-testid="delivery-terms-actions" class="space-y-2 border-t border-ink-100 pt-3">
          <label class="flex items-start gap-2 text-sm text-ink-800"><input v-model="accepted" type="checkbox" class="mt-1" />
            <span>Tôi đồng ý với phần phí giao hàng {{ audience === 'customer' ? 'khách hàng' : 'kỹ thuật viên' }} chịu: {{ amount(currentShare!) }}.</span></label>
          <FhButton data-testid="delivery-terms-consent" :disabled="busy || !accepted" @click="submitConsent">{{ busy ? 'Đang ghi nhận…' : 'Ghi nhận đồng ý' }}</FhButton>
        </div>
        <div v-else-if="audience === 'manager'" class="text-sm text-ink-700">Quản lý dịch vụ ghi đề xuất và phí thực tế tại mục Giao linh kiện.</div>
      </template>
      <p v-if="errorMessage" class="text-sm text-ink-700" role="status">{{ errorMessage }}</p>
      <FhButton v-if="retry" variant="secondary" size="sm" :disabled="busy" @click="retry?.()">Thử lại cùng consent</FhButton>
      <p class="text-xs text-warning-800">Khoản phí này chưa được thanh toán. Chỉ hóa đơn W3 đã khóa và đủ điều kiện mới có thể được thanh toán hoặc chi trả.</p>
    </template>
  </section>
</template>
