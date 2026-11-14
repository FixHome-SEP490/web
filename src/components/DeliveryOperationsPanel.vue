<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { UserRole } from '../types';
import { FhButton, FhMoney } from '.';
import { warehousesApi, type Warehouse } from '../api/warehouses.api';
import {
  w3DeliveryOperationsApi,
  type DeliveryCommandIdentity,
  type DeliveryEvidencePurpose,
  type DeliveryOperationsRead,
} from '../api/w3-delivery-operations.api';
import { w3DeliveryTermsApi } from '../api/w3-delivery-terms.api';
import { isDeliveryPhysicalRequestId } from '../api/w3-delivery-physical.api';

const props = defineProps<{
  requestId: string;
  fulfillmentMethod: string;
  requestType: string;
  shippingFee: number | null | undefined;
  audience: 'customer' | 'technician' | 'manager';
  sourceOwnerId?: string | null;
}>();
const auth = useAuthStore();
const readState = ref<DeliveryOperationsRead | null>(null);
const readStatus = ref<'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'forbidden'>('idle');
const message = ref('');
const requiresReload = ref(false);
const busy = ref(false);
const accepted = ref(false);
const courierReference = ref('');
const quotePhoto = ref<File | null>(null);
const actualPhoto = ref<File | null>(null);
const stagePhoto = ref<File | null>(null);
const generation = ref(0);
const retryAction = ref<(() => Promise<void>) | null>(null);
const managerWarehouses = ref<Warehouse[]>([]);
const warehouseLoadStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const selectedWarehouseId = ref('');
const managerMode = ref<'bootstrap' | 'operations'>('bootstrap');
const managerInspected = ref(false);
const proposedShippingFee = ref<string | number>('');
const actualShippingFee = ref<string | number>('');
let alive = true;

const roleForAudience = {
  customer: UserRole.CUSTOMER,
  technician: UserRole.TECHNICIAN,
  manager: UserRole.SERVICE_MANAGER,
} as const;
const sourceEligible = computed(() => props.requestType === 'additional'
  && typeof props.shippingFee === 'number' && Number.isSafeInteger(props.shippingFee) && props.shippingFee >= 0);
const panelContextValid = computed(() => isDeliveryPhysicalRequestId(props.requestId)
  && props.fulfillmentMethod === 'delivery' && sourceEligible.value
  && auth.userRole === roleForAudience[props.audience]
  && !!auth.user?.id && props.sourceOwnerId === auth.user?.id
  || (isDeliveryPhysicalRequestId(props.requestId) && props.fulfillmentMethod === 'delivery' && sourceEligible.value
    && props.audience === 'manager' && auth.userRole === UserRole.SERVICE_MANAGER && !!auth.user?.id));
const ownActiveWarehouses = computed(() => managerWarehouses.value.filter(warehouse => warehouse.status === 'active'
  && warehouse.responsibleUserId === auth.user?.id && isDeliveryPhysicalRequestId(warehouse.id)));
const selectedWarehouse = computed(() => ownActiveWarehouses.value.find(warehouse => warehouse.id === selectedWarehouseId.value) ?? null);
const validContext = computed(() => panelContextValid.value && (props.audience !== 'manager' || !!selectedWarehouse.value));
const quote = computed(() => readState.value?.invalidated ? null : readState.value?.quote ?? null);
const physical = computed(() => readState.value?.physical ?? null);
const positive = computed(() => (quote.value?.totalShippingFee ?? props.shippingFee ?? 0) > 0);
const canConsent = computed(() => !!quote.value && quote.value.totalShippingFee === 0 && !readState.value?.invalidated
  && !readState.value?.[props.audience === 'customer' ? 'customerConsented' : 'technicianConsented']);
const actualRecorded = computed(() => !!readState.value?.actual);
const canOperatePhysical = computed(() => !!quote.value && !!readState.value && !readState.value.invalidated
  && readState.value.customerConsented && readState.value.technicianConsented && actualRecorded.value);
const proposedFee = computed(() => {
  const raw = String(proposedShippingFee.value).trim();
  if (!/^(0|[1-9]\d*)$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && typeof props.shippingFee === 'number'
    && value <= props.shippingFee ? value : null;
});
const actualFee = computed(() => {
  const raw = String(actualShippingFee.value).trim();
  if (!/^(0|[1-9]\d*)$/.test(raw) || !quote.value) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= quote.value.totalShippingFee ? value : null;
});
const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    INELIGIBLE: 'Chưa đủ điều kiện', PENDING_ASSISTANCE: 'Cần hỗ trợ', RESERVED: 'Đã ghi nhận phân bổ kho',
    RELEASED: 'Đã ghi nhận hủy phân bổ', ISSUED_TO_COURIER: 'Đã ghi nhận bàn giao cho đơn vị giao hàng',
    DISPATCH_RECORDED: 'Đã ghi nhận rời kho', TECHNICIAN_RECEIVED: 'Đã ghi nhận kỹ thuật viên nhận hàng',
  };
  return physical.value ? labels[physical.value.status] ?? 'Trạng thái chưa xác định' : 'Chưa ghi nhận giao nhận';
});

function scopeKey() { return `${props.requestId}:${auth.user?.id ?? ''}:${props.audience}`; }
function isCurrent(token: number, key: string) { return alive && token === generation.value && key === scopeKey(); }
async function load() {
  const token = ++generation.value;
  const key = scopeKey();
  readState.value = null;
  message.value = '';
  accepted.value = false;
  busy.value = false;
  if (!validContext.value || (props.audience === 'manager' && managerMode.value !== 'operations')) { readStatus.value = 'idle'; return; }
  readStatus.value = 'loading';
  try {
    const result = await w3DeliveryOperationsApi.read(props.requestId);
    if (!isCurrent(token, key)) return;
    readState.value = result;
    requiresReload.value = false;
    readStatus.value = 'ready';
  } catch (error) {
    if (!isCurrent(token, key)) return;
    const status = typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status : undefined;
    readState.value = null;
    readStatus.value = status === 404 || status === 503 ? 'unavailable' : status === 401 || status === 403 ? 'forbidden' : 'error';
  }
}
async function loadManagerWarehouses() {
  const token = ++generation.value;
  const key = scopeKey();
  managerWarehouses.value = [];
  selectedWarehouseId.value = '';
  warehouseLoadStatus.value = 'loading';
  if (!panelContextValid.value || props.audience !== 'manager') { warehouseLoadStatus.value = 'idle'; return; }
  try {
    const rows = await warehousesApi.list();
    if (!isCurrent(token, key) || !panelContextValid.value) return;
    managerWarehouses.value = rows.filter(warehouse => warehouse.status === 'active'
      && warehouse.responsibleUserId === auth.user?.id && isDeliveryPhysicalRequestId(warehouse.id));
    warehouseLoadStatus.value = 'ready';
  } catch {
    if (isCurrent(token, key)) warehouseLoadStatus.value = 'error';
  }
}
function initialize() {
  // Scope changes invalidate in-flight reads and uncertain command retries.
  ++generation.value;
  retryAction.value = null;
  message.value = '';
  accepted.value = false;
  requiresReload.value = false;
  busy.value = false;
  quotePhoto.value = null;
  actualPhoto.value = null;
  stagePhoto.value = null;
  courierReference.value = '';
  readState.value = null;
  managerMode.value = 'bootstrap';
  managerInspected.value = false;
  proposedShippingFee.value = '';
  actualShippingFee.value = '';
  readStatus.value = 'idle';
  if (!panelContextValid.value) return;
  if (props.audience === 'manager') void loadManagerWarehouses();
  else void load();
}
watch(() => [props.requestId, props.fulfillmentMethod, props.requestType, props.shippingFee,
  props.audience, props.sourceOwnerId, auth.user?.id, auth.user?.role, auth.token] as const,
initialize, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { alive = false; ++generation.value; });

function pendingKey(action: string) { return `fixhome:w3-delivery:${scopeKey()}:${action}`; }
function commandFor(action: string, expectedVersion: number, fields: Record<string, unknown>): DeliveryCommandIdentity & Record<string, unknown> {
  const key = pendingKey(action);
  const intent = { action, expectedVersion, fields };
  const previous = sessionStorage.getItem(key);
  if (previous) {
    try {
      const saved = JSON.parse(previous) as { action: string; expectedVersion: number; fields: Record<string, unknown>; commandId: string };
      if (saved.action !== action || saved.expectedVersion !== expectedVersion || JSON.stringify(saved.fields) !== JSON.stringify(fields)) {
        throw new Error('Hãy tải lại trạng thái trước khi thay đổi nội dung thao tác.');
      }
      return { ...fields, commandId: saved.commandId, expectedVersion };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Hãy tải lại')) throw error;
      throw new Error('Chưa thể đối chiếu thao tác trước đó. Hãy tải lại trạng thái.');
    }
  }
  const commandId = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ ...intent, commandId }));
  return { ...fields, commandId, expectedVersion };
}
async function runCommand(action: string, expectedVersion: number, fields: Record<string, unknown>, operation: (body: DeliveryCommandIdentity & Record<string, unknown>) => Promise<unknown>, allowBootstrap = false) {
  if (busy.value || (!readState.value && !allowBootstrap) || !validContext.value) return;
  retryAction.value = () => runCommand(action, expectedVersion, fields, operation, allowBootstrap);
  const token = generation.value;
  const key = scopeKey();
  busy.value = true;
  message.value = '';
  try {
    const body = commandFor(action, expectedVersion, fields);
    await operation(body);
    if (!isCurrent(token, key)) return;
    sessionStorage.removeItem(pendingKey(action));
    retryAction.value = null;
    if (props.audience === 'manager' && (action === 'proposal' || action === 'terms-proposal')) managerMode.value = 'operations';
    accepted.value = false;
    await load();
    if (readStatus.value === 'ready') message.value = 'Đã ghi nhận từ phản hồi của hệ thống.';
    else message.value = 'Thao tác đã được ghi nhận; chưa tải lại được trạng thái.';
  } catch (error) {
    if (isCurrent(token, key)) {
      const status = typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status : undefined;
      if (status === 409) {
        requiresReload.value = true;
        retryAction.value = null;
        message.value = 'Trạng thái đã thay đổi. Hãy tải lại trước khi tiếp tục.';
      } else {
        message.value = 'Chưa xác định được kết quả. Có thể thử lại cùng thao tác hoặc tải lại trạng thái.';
      }
    }
  } finally {
    if (alive && key === scopeKey()) busy.value = false;
  }
}
async function upload(file: File | null, purpose: DeliveryEvidencePurpose, quoteVersion: number) {
  // The Technician never selects an SM warehouse. Receipt evidence must use the
  // warehouse already bound by the authoritative DELIVERY physical journal.
  const warehouseId = props.audience === 'technician' && purpose === 'TECHNICIAN_RECEIPT'
    ? physical.value?.warehouseId
    : selectedWarehouse.value?.id;
  if (!file || !warehouseId || !validContext.value || busy.value) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    message.value = 'Chọn ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 10 MB.';
    return null;
  }
  const token = generation.value;
  const key = scopeKey();
  busy.value = true;
  message.value = '';
  try {
    const evidence = await w3DeliveryOperationsApi.uploadEvidence(props.requestId,
      { warehouseId, purpose, quoteVersion, file });
    return isCurrent(token, key) ? evidence.evidenceId : null;
  } catch {
    if (isCurrent(token, key)) message.value = 'Chưa tải được ảnh bằng chứng. Hãy tải lại trạng thái trước khi thử ảnh khác.';
    return null;
  } finally {
    if (isCurrent(token, key)) busy.value = false;
  }
}
async function uploadTermsEvidence(file: File | null, purpose: 'QUOTE' | 'ACTUAL', quoteVersion: number) {
  const warehouseId = selectedWarehouse.value?.id;
  if (!file || !warehouseId || !validContext.value || busy.value) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    message.value = 'Chọn ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 10 MB.';
    return null;
  }
  const token = generation.value;
  const key = scopeKey();
  busy.value = true;
  message.value = '';
  try {
    const evidence = await w3DeliveryTermsApi.uploadEvidence(props.requestId,
      { warehouseId, purpose, quoteVersion, file });
    return isCurrent(token, key) ? evidence.evidenceId : null;
  } catch {
    if (isCurrent(token, key)) message.value = 'Chưa tải được ảnh bằng chứng. Hãy tải lại trạng thái trước khi thử ảnh khác.';
    return null;
  } finally {
    if (isCurrent(token, key)) busy.value = false;
  }
}
async function propose() {
  if (!selectedWarehouse.value || !quotePhoto.value || props.audience !== 'manager' || managerMode.value !== 'bootstrap') return;
  const version = 0;
  const quoteVersion = (quote.value?.quoteVersion ?? 0) + 1;
  const evidenceId = await upload(quotePhoto.value, 'QUOTE', quoteVersion);
  if (!evidenceId) return;
  await runCommand('proposal', version, { warehouseId: selectedWarehouse.value.id, evidenceId, courierReference: courierReference.value.trim(), totalShippingFee: 0 },
    body => w3DeliveryOperationsApi.propose(props.requestId, body as never), true);
}
async function proposePositive() {
  if (!selectedWarehouse.value || !quotePhoto.value || !managerInspected.value || proposedFee.value === null
    || props.audience !== 'manager' || managerMode.value !== 'bootstrap') return;
  const version = readState.value?.version ?? 0;
  const quoteVersion = (quote.value?.quoteVersion ?? 0) + 1;
  const evidenceId = await uploadTermsEvidence(quotePhoto.value, 'QUOTE', quoteVersion);
  if (!evidenceId) return;
  await runCommand('terms-proposal', version, {
    warehouseId: selectedWarehouse.value.id, evidenceId,
    courierReference: courierReference.value.trim(), totalShippingFee: proposedFee.value,
  }, body => w3DeliveryTermsApi.propose(props.requestId, body as never), true);
}
async function openExisting() {
  if (props.audience !== 'manager' || !selectedWarehouse.value) return;
  const inspectingPositive = positive.value;
  managerMode.value = 'operations';
  await load();
  if (inspectingPositive && readStatus.value === 'ready') {
    managerInspected.value = true;
    if (!readState.value?.quote) managerMode.value = 'bootstrap';
  }
}
async function consent() {
  if (!quote.value || !readState.value || quote.value.totalShippingFee !== 0 || !accepted.value) return;
  const actorKey = props.audience === 'customer' ? 'customer' : 'technician';
  const fields = { quoteVersion: quote.value.quoteVersion, quoteFingerprint: quote.value.fingerprint, totalShippingFee: 0, shippingShare: 0, accepted: true as const };
  await runCommand(`consent-${actorKey}`, readState.value.version, fields,
    body => w3DeliveryOperationsApi.consent(props.requestId, body as never));
}
async function recordActual() {
  if (!quote.value || !readState.value || !actualPhoto.value) return;
  if (quote.value.totalShippingFee > 0) {
    if (actualFee.value === null) return;
    const evidenceId = await uploadTermsEvidence(actualPhoto.value, 'ACTUAL', quote.value.quoteVersion);
    if (!evidenceId) return;
    await runCommand('terms-actual', readState.value.version, {
      quoteVersion: quote.value.quoteVersion, totalShippingFee: actualFee.value, evidenceId,
    }, body => w3DeliveryTermsApi.actual(props.requestId, body as never));
    return;
  }
  const evidenceId = await upload(actualPhoto.value, 'ACTUAL', quote.value.quoteVersion);
  if (!evidenceId) return;
  await runCommand('actual', readState.value.version, { quoteVersion: quote.value.quoteVersion, totalShippingFee: 0, evidenceId },
    body => w3DeliveryOperationsApi.actual(props.requestId, body as never));
}
async function physicalAction(action: 'reserve' | 'release' | 'issue-to-courier' | 'dispatch' | 'receipt') {
  if (!readState.value || !canOperatePhysical.value) return;
  const physicalVersion = physical.value?.version ?? 0;
  let evidenceId: string | undefined;
  const purpose: Record<typeof action, DeliveryEvidencePurpose | null> = {
    reserve: null, release: null, 'issue-to-courier': 'ISSUE_TO_COURIER', dispatch: 'COURIER_DISPATCH', receipt: 'TECHNICIAN_RECEIPT',
  };
  if (purpose[action]) {
    const file = stagePhoto.value;
    if (!file || !quote.value) return;
    evidenceId = await upload(file, purpose[action]!, quote.value.quoteVersion) ?? undefined;
    if (!evidenceId) return;
  }
  const fields = evidenceId ? { evidenceId } : {};
  await runCommand(`physical-${action}`, physicalVersion, fields,
    body => w3DeliveryOperationsApi.physical(props.requestId, action, body as never));
}
function setFile(event: Event, target: 'quote' | 'actual' | 'stage') {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  if (target === 'quote') quotePhoto.value = file;
  else if (target === 'actual') actualPhoto.value = file;
  else stagePhoto.value = file;
}
</script>

<template>
  <section v-if="panelContextValid" class="space-y-3 rounded-lg border border-ink-200 bg-white p-4" :aria-busy="readStatus === 'loading' || warehouseLoadStatus === 'loading'">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-ink-900">{{ positive ? 'Giao linh kiện · phí 70/30' : 'Giao linh kiện · 0 ₫' }}</h3>
        <p class="mt-1 break-all text-xs text-ink-600">Mã yêu cầu: {{ requestId }}</p>
      </div>
      <span class="rounded-md bg-ink-100 px-2 py-1 text-xs font-medium text-ink-700">{{ positive ? 'Điều khoản trước hóa đơn' : 'Không phát sinh phí' }}</span>
    </div>
    <template v-if="audience === 'manager' && managerMode === 'bootstrap'">
      <p class="text-sm text-ink-700">Chọn kho đang hoạt động do bạn phụ trách. Backend sẽ kiểm tra quyền và nguồn yêu cầu khi nhận đề xuất.</p>
      <p v-if="warehouseLoadStatus === 'loading'" class="text-sm text-ink-600" role="status">Đang tải kho bạn phụ trách…</p>
      <div v-else-if="warehouseLoadStatus === 'error'" class="space-y-2 text-sm" role="alert">
        <p class="text-danger-700">Chưa tải được danh sách kho của bạn.</p><FhButton variant="secondary" size="sm" @click="loadManagerWarehouses">Tải lại danh sách kho</FhButton>
      </div>
      <div v-else-if="warehouseLoadStatus === 'ready'" class="space-y-3">
        <p v-if="ownActiveWarehouses.length === 0" class="text-sm text-ink-700">Bạn chưa có kho đang hoạt động được giao phụ trách.</p>
        <label v-else class="block text-sm font-medium text-ink-800">Kho phụ trách
          <select v-model="selectedWarehouseId" class="mt-1 min-h-11 w-full rounded-md border border-ink-300 px-3" aria-label="Chọn kho đang hoạt động do bạn phụ trách">
            <option value="">Chọn kho</option>
            <option v-for="warehouse in ownActiveWarehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
          </select>
        </label>
        <template v-if="selectedWarehouse">
          <FhButton variant="secondary" :disabled="busy || readStatus === 'loading'" @click="openExisting">{{ readStatus === 'loading' ? 'Đang đối chiếu…' : 'Đối chiếu trạng thái đã có' }}</FhButton>
          <template v-if="positive">
            <p v-if="!managerInspected" class="text-sm text-ink-600">Đối chiếu trạng thái do Backend ghi nhận trước khi ghi đề xuất phí dương.</p>
            <template v-else-if="!quote">
              <p class="text-sm text-ink-700">Chưa có điều khoản phí giao. Đề xuất không được vượt mức phí đã duyệt {{ shippingFee }} ₫.</p>
              <label class="block text-sm font-medium text-ink-800">Tổng phí giao đề xuất (VND)
                <input v-model="proposedShippingFee" data-testid="positive-shipping-fee" type="number" min="1" :max="shippingFee ?? undefined" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-ink-300 px-3" />
              </label>
              <label class="block text-sm font-medium text-ink-800">Mã tham chiếu đơn vị giao hàng
                <input v-model="courierReference" maxlength="256" autocomplete="off" class="mt-1 min-h-11 w-full rounded-md border border-ink-300 px-3" />
              </label>
              <label class="block text-sm font-medium text-ink-800">Ảnh đề xuất giao hàng (JPEG, PNG hoặc WebP, tối đa 10 MB)
                <input data-testid="quote-evidence" type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm" @change="setFile($event, 'quote')" />
              </label>
              <FhButton :disabled="busy || proposedFee === null || !courierReference.trim() || !quotePhoto" @click="proposePositive">{{ busy ? 'Đang ghi nhận…' : 'Ghi đề xuất phí giao' }}</FhButton>
            </template>
            <p v-else class="text-sm text-ink-700">Đã có đề xuất phí giao. Chuyển sang phần giao nhận bên dưới.</p>
          </template>
          <template v-else>
            <label class="block text-sm font-medium text-ink-800">Mã tham chiếu đơn vị giao hàng
              <input v-model="courierReference" maxlength="256" autocomplete="off" class="mt-1 min-h-11 w-full rounded-md border border-ink-300 px-3" />
            </label>
            <label class="block text-sm font-medium text-ink-800">Ảnh đề xuất giao hàng (JPEG, PNG hoặc WebP, tối đa 10 MB)
              <input data-testid="quote-evidence" type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm" @change="setFile($event, 'quote')" />
            </label>
            <FhButton :disabled="busy || !courierReference.trim() || !quotePhoto" @click="propose">{{ busy ? 'Đang ghi nhận…' : 'Đề xuất phí giao 0 ₫' }}</FhButton>
          </template>
        </template>
      </div>
      <p v-if="message" class="text-sm text-ink-700" role="status">{{ message }}</p>
      <FhButton v-if="retryAction" variant="secondary" size="sm" :disabled="busy" @click="retryAction?.()">Thử lại cùng thao tác</FhButton>
    </template>
    <p v-else-if="readStatus === 'loading'" class="text-sm text-ink-600" role="status">Đang tải tình trạng giao linh kiện…</p>
    <div v-else-if="readStatus === 'unavailable'" class="space-y-2 text-sm text-ink-700" role="status">
      <p>Chưa khả dụng.</p><FhButton variant="secondary" size="sm" :disabled="busy" @click="load">Tải lại trạng thái</FhButton>
    </div>
    <div v-else-if="readStatus === 'forbidden'" class="text-sm text-danger-700" role="alert">Bạn không có quyền xem thông tin giao linh kiện này.</div>
    <div v-else-if="readStatus === 'error'" class="space-y-2 text-sm" role="alert">
      <p class="text-danger-700">Chưa thể kiểm tra trạng thái giao linh kiện.</p><FhButton variant="secondary" size="sm" :disabled="busy" @click="load">Tải lại trạng thái</FhButton>
    </div>
    <template v-else-if="readStatus === 'ready' && readState">
      <!-- Once the technician has the parts the order moves on, so the server reports the terms as
           no longer current; that is the end of the delivery, not a change to review (13/11). -->
      <p v-if="physical?.status === 'TECHNICIAN_RECEIVED'" class="text-sm text-success-700" role="status" data-testid="delivery-operations-done">Đã giao xong: kỹ thuật viên đã nhận linh kiện.</p>
      <p v-else-if="readState.invalidated" class="text-sm text-warning-800" role="status">Dữ liệu nguồn đã thay đổi. Cần Quản lý dịch vụ kiểm tra lại.</p>
      <template v-else-if="requiresReload">
        <p class="text-sm text-warning-800" role="alert">{{ message }}</p>
        <FhButton variant="secondary" size="sm" :disabled="busy" @click="load">Tải lại trạng thái</FhButton>
      </template>
      <template v-else>
        <dl v-if="quote" class="grid gap-1 text-sm sm:grid-cols-2">
          <div><dt class="inline text-ink-600">{{ positive ? 'Phí giao theo thỏa thuận: ' : 'Phí giao thực tế: ' }}</dt><dd class="inline font-medium text-ink-900"><FhMoney :amount="quote.totalShippingFee" /></dd></div>
          <div><dt class="inline text-ink-600">Mã phiên báo giá: </dt><dd class="inline font-num text-ink-900">{{ quote.quoteVersion }}</dd></div>
          <div v-if="positive"><dt class="inline text-ink-600">Khách hàng chịu (70%): </dt><dd class="inline font-num text-ink-900"><FhMoney :amount="quote.customerShippingShare" /></dd></div>
          <div v-if="positive"><dt class="inline text-ink-600">Kỹ thuật viên chịu (30%): </dt><dd class="inline font-num text-ink-900"><FhMoney :amount="quote.technicianShippingShare" /></dd></div>
          <div v-if="readState.actual"><dt class="inline text-ink-600">Phí thực tế đã ghi nhận: </dt><dd class="inline font-num text-ink-900"><FhMoney :amount="readState.actual.totalShippingFee" /></dd></div>
          <div><dt class="inline text-ink-600">Đồng thuận khách hàng: </dt><dd class="inline">{{ readState.customerConsented ? 'Đã ghi nhận' : 'Chưa ghi nhận' }}</dd></div>
          <div><dt class="inline text-ink-600">Đồng thuận kỹ thuật viên: </dt><dd class="inline">{{ readState.technicianConsented ? 'Đã ghi nhận' : 'Chưa ghi nhận' }}</dd></div>
        </dl>
        <p v-else class="text-sm text-ink-700">{{ positive ? 'Chưa có điều khoản phí giao.' : 'Chưa có đề xuất phí giao 0 ₫.' }}</p>
        <p class="text-sm text-ink-700">Giao nhận: {{ statusLabel }}.</p>
        <p v-if="positive" class="text-xs text-warning-800">Giao nhận vật lý khả dụng khi cả hai bên đồng thuận và phí thực tế đã được ghi nhận. Thanh toán hoặc chi trả chỉ sau hóa đơn W3 đã khóa và đủ điều kiện; khoản phí này chưa được thanh toán.</p>
        <p v-else class="text-xs text-warning-800">Phí giao và mọi phần chia đều bằng 0 ₫. Không ghi nhận thanh toán hoặc xác minh bên giao hàng.</p>
        <p v-if="positive && quote" class="text-xs" :class="canOperatePhysical ? 'text-success-700' : 'text-ink-600'">{{ canOperatePhysical ? 'Đã đủ điều kiện ghi nhận giao nhận vật lý.' : 'Chưa đủ điều kiện giao nhận vật lý: cần cả hai đồng thuận và phí thực tế.' }}</p>

        <div v-if="audience === 'customer' || audience === 'technician'" data-testid="delivery-operations-actions" class="space-y-3">
          <div v-if="canConsent" class="space-y-2 rounded-md border border-ink-200 p-3">
            <label class="flex items-start gap-2 text-sm text-ink-800"><input v-model="accepted" type="checkbox" class="mt-1 size-4 accent-brand-600" />Tôi đồng ý với mức phí giao 0 ₫ cho đề xuất này.</label>
            <FhButton data-testid="delivery-consent" :disabled="busy || !accepted" @click="consent">{{ busy ? 'Đang ghi nhận…' : 'Ghi nhận đồng ý' }}</FhButton>
          </div>
          <p v-else-if="positive && !readState?.[audience === 'customer' ? 'customerConsented' : 'technicianConsented']" class="text-xs text-ink-600">Đồng thuận phí dương được ghi tại mục Điều khoản phí giao hàng.</p>
          <div v-if="audience === 'technician' && canOperatePhysical && (!physical || ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RELEASED'].includes(physical.status))">
            <FhButton variant="secondary" :disabled="busy" @click="physicalAction('reserve')">{{ busy ? 'Đang ghi nhận…' : 'Yêu cầu phân bổ kho' }}</FhButton>
          </div>
          <div v-if="audience === 'technician' && canOperatePhysical && physical?.status === 'DISPATCH_RECORDED'" class="space-y-2">
            <label class="block text-sm font-medium text-ink-800">Ảnh xác nhận nhận linh kiện
              <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm" @change="setFile($event, 'stage')" />
            </label>
            <FhButton variant="secondary" :disabled="busy || !stagePhoto" @click="physicalAction('receipt')">Ghi nhận nhận linh kiện</FhButton>
          </div>
        </div>

        <div v-if="audience === 'manager' && managerMode === 'operations'" data-testid="delivery-operations-actions" class="space-y-3 border-t border-ink-100 pt-3">
          <template v-if="quote">
            <div v-if="readState.customerConsented && readState.technicianConsented && !actualRecorded" class="space-y-2">
              <label v-if="positive" class="block text-sm font-medium text-ink-800">Tổng phí giao thực tế (0–{{ quote.totalShippingFee }} ₫)
                <input v-model="actualShippingFee" data-testid="positive-actual-fee" type="number" min="0" :max="quote.totalShippingFee" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-ink-300 px-3" />
              </label>
              <label class="block text-sm font-medium text-ink-800">{{ positive ? 'Ảnh đối chiếu phí giao thực tế' : 'Ảnh đối chiếu phí giao thực tế 0 ₫' }}
                <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm" @change="setFile($event, 'actual')" />
              </label>
              <FhButton :disabled="busy || !actualPhoto || (positive && actualFee === null)" @click="recordActual">{{ positive ? 'Ghi nhận phí thực tế' : 'Ghi nhận phí giao thực tế 0 ₫' }}</FhButton>
            </div>
            <div v-if="canOperatePhysical && physical?.status === 'RESERVED'" class="space-y-2">
              <label class="block text-sm font-medium text-ink-800">Ảnh bàn giao cho đơn vị giao hàng
                <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm" @change="setFile($event, 'stage')" />
              </label>
              <FhButton variant="secondary" :disabled="busy || !stagePhoto" @click="physicalAction('issue-to-courier')">Ghi nhận bàn giao cho đơn vị giao hàng</FhButton>
              <FhButton variant="secondary" :disabled="busy" @click="physicalAction('release')">Hủy phân bổ giao hàng</FhButton>
            </div>
            <div v-if="canOperatePhysical && physical?.status === 'ISSUED_TO_COURIER'" class="space-y-2">
              <label class="block text-sm font-medium text-ink-800">Ảnh xác nhận rời kho
                <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm" @change="setFile($event, 'stage')" />
              </label>
              <FhButton variant="secondary" :disabled="busy || !stagePhoto" @click="physicalAction('dispatch')">Ghi nhận rời kho</FhButton>
            </div>
          </template>
        </div>
      </template>
      <p v-if="message" class="text-sm text-ink-700" role="status">{{ message }}</p>
      <FhButton v-if="message.includes('Chưa xác định') && retryAction" variant="secondary" size="sm" :disabled="busy" @click="retryAction?.()">Thử lại cùng thao tác</FhButton>
      <FhButton variant="ghost" size="sm" :disabled="busy" @click="load">Tải lại trạng thái</FhButton>
    </template>
  </section>
</template>
