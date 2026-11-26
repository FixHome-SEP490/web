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
  embedded?: boolean;
}>();
const emit = defineEmits<{
  (e: 'quote-state', hasQuote: boolean): void;
}>();
const auth = useAuthStore();
const readState = ref<DeliveryOperationsRead | null>(null);
const readStatus = ref<'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'forbidden'>('idle');
const lastReadHttpStatus = ref<number | null>(null);
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

const deliveryBlockerHints: Record<string, string> = {
  DELIVERY_SCOPE_FROZEN: 'Đơn đã hoàn tất, đã có yêu cầu hoàn tất hoặc đã xuất hóa đơn nên không thể giao thêm linh kiện qua ĐVVC.',
  DELIVERY_RELEASE_REQUIRED: 'Yêu cầu đang có phân bổ giao trước đó; cần hủy phân bổ cũ trước khi đề xuất lại.',
  FINANCE_LEDGER_SOURCE_REQUIRED: 'Luồng phí giao có phí hiện chưa mở chốt nguồn tài chính từ hệ thống.',
  DELIVERY_WAREHOUSE_UNAVAILABLE: 'Kho đã chọn không còn hoạt động hoặc bạn không còn phụ trách kho này.',
  DELIVERY_PROPOSAL_INVALIDATED: 'Dữ liệu đề xuất không còn khớp với trạng thái đơn hoặc kho.',
  DELIVERY_APPROVED_SHIPPING_SOURCE_REQUIRED: 'Yêu cầu phát sinh nguồn chưa ở trạng thái đã duyệt giao tận nơi.',
  W3_SHIPPING_CAP_EXCEEDED: 'Trần phí giao mới «w3.shipping.max_new_fee_vnd» trong Cấu hình hệ thống (/console/admin/config) đang đặt bằng 0 ₫ hoặc thấp hơn mức phí đề xuất; Quản trị viên cần tăng cấu hình này lên trước.',
};

function extractErrorDetails(error: unknown) {
  const responseData = typeof error === 'object' && error !== null && 'response' in error
    ? (error as { response?: { status?: number; data?: { code?: unknown; message?: unknown; details?: { blocker?: unknown }; error?: { code?: unknown; details?: { blocker?: unknown }; message?: unknown } } } }).response
    : undefined;
  const status = responseData?.status;
  const rawCode = responseData?.data?.error?.code ?? responseData?.data?.code;
  const errorCode = typeof rawCode === 'string' ? rawCode : null;
  const rawBlocker = responseData?.data?.error?.details?.blocker ?? responseData?.data?.details?.blocker ?? errorCode;
  const blocker = typeof rawBlocker === 'string' ? rawBlocker : null;
  const blockerHint = blocker ? deliveryBlockerHints[blocker] ?? null : null;
  const rawMessage = responseData?.data?.message ?? responseData?.data?.error?.message;
  const serverMessage = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : null;
  return { status, errorCode, blockerHint, serverMessage };
}

const deliverySteps = computed(() => {
  const hasQuote = !!quote.value;
  const bothConsented = hasQuote && !!readState.value?.customerConsented && !!readState.value?.technicianConsented;
  const hasActual = actualRecorded.value;
  const physicalStatus = physical.value?.status;
  const reserved = !!physicalStatus && ['RESERVED', 'ISSUED_TO_COURIER', 'DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED'].includes(physicalStatus);
  const dispatched = !!physicalStatus && ['DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED'].includes(physicalStatus);
  const received = physicalStatus === 'TECHNICIAN_RECEIVED';
  const list = [
    { key: 'proposal', label: '1. SM đề xuất giao', done: hasQuote },
    { key: 'consent', label: '2. Khách & Thợ đồng ý', done: bothConsented },
    { key: 'actual', label: '3. SM ghi phí thực tế', done: hasActual },
    { key: 'reserve', label: '4. Thợ xin phân bổ kho', done: reserved },
    { key: 'dispatch', label: '5. Kho bàn giao & rời kho', done: dispatched },
    { key: 'receipt', label: '6. Thợ xác nhận nhận', done: received },
  ];
  const firstPendingIdx = list.findIndex(step => !step.done);
  return list.map((step, idx) => ({ ...step, active: idx === firstPendingIdx }));
});

const nextWaitingHint = computed(() => {
  if (props.audience === 'manager' && managerMode.value === 'bootstrap') {
    if (!selectedWarehouse.value) return 'Chọn kho đang hoạt động bạn phụ trách để kiểm tra hoặc đề xuất giao hàng.';
    return 'Nhập mã tham chiếu và tải ảnh đề xuất giao hàng bên dưới để gửi đề xuất lần đầu (hoặc bấm «Đối chiếu trạng thái đã có» nếu phiếu đã gửi đề xuất trước đó).';
  }
  const current = readState.value;
  if (!current || current.invalidated || requiresReload.value || physical.value?.status === 'TECHNICIAN_RECEIVED') return null;
  if (!quote.value) {
    return props.audience === 'manager'
      ? 'Chưa có đề xuất giao hàng. Chọn kho phụ trách để gửi đề xuất.'
      : 'Đang chờ Quản lý dịch vụ chọn kho và gửi đề xuất giao hàng.';
  }
  if (!current.customerConsented || !current.technicianConsented) {
    if (props.audience === 'manager') return 'Đang chờ Khách hàng và Kỹ thuật viên xác nhận đồng ý trước khi ghi nhận phí thực tế.';
    const ownConsented = props.audience === 'customer' ? current.customerConsented : current.technicianConsented;
    if (!ownConsented) {
      return positive.value
        ? 'Hãy xác nhận đồng ý tại mục Điều khoản phí giao hàng.'
        : 'Hãy tích đồng ý và bấm «Ghi nhận đồng ý» bên dưới.';
    }
    return props.audience === 'customer'
      ? 'Bạn đã đồng ý. Đang chờ Kỹ thuật viên xác nhận đồng ý.'
      : 'Bạn đã đồng ý. Đang chờ Khách hàng xác nhận đồng ý.';
  }
  if (!actualRecorded.value) {
    return props.audience === 'manager'
      ? 'Cả hai bên đã đồng ý. Hãy ghi nhận phí giao thực tế và ảnh đối chiếu để mở bước phân bổ kho.'
      : 'Cả hai bên đã đồng ý. Đang chờ Quản lý dịch vụ ghi nhận phí giao thực tế.';
  }
  const physicalStatus = physical.value?.status;
  if (!physicalStatus || ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RELEASED'].includes(physicalStatus)) {
    return props.audience === 'technician'
      ? 'Đã đủ điều kiện. Hãy bấm «Yêu cầu phân bổ kho» bên dưới để kho chuẩn bị giao hàng.'
      : 'Đang chờ Kỹ thuật viên bấm «Yêu cầu phân bổ kho».';
  }
  if (physicalStatus === 'RESERVED') {
    return props.audience === 'manager'
      ? 'Thợ đã yêu cầu phân bổ kho. Hãy tải ảnh và bàn giao cho đơn vị giao hàng.'
      : 'Kho đã giữ hàng. Đang chờ Quản lý dịch vụ bàn giao cho đơn vị giao hàng.';
  }
  if (physicalStatus === 'ISSUED_TO_COURIER') {
    return props.audience === 'manager'
      ? 'Đã bàn giao cho đơn vị giao hàng. Hãy tải ảnh xác nhận rời kho.'
      : 'Đang chờ Quản lý dịch vụ xác nhận hàng đã rời kho.';
  }
  if (physicalStatus === 'DISPATCH_RECORDED') {
    return props.audience === 'technician'
      ? 'Hàng đã rời kho. Khi nhận được linh kiện, hãy tải ảnh và bấm «Ghi nhận nhận linh kiện».'
      : 'Hàng đã rời kho. Đang chờ Kỹ thuật viên xác nhận đã nhận linh kiện.';
  }
  return null;
});

const proposalMissingFields = computed(() => {
  const missing: string[] = [];
  if (positive.value && proposedFee.value === null) missing.push('Tổng phí giao hợp lệ');
  if (!courierReference.value.trim()) missing.push('Mã tham chiếu');
  if (!quotePhoto.value) missing.push('Ảnh đề xuất giao hàng');
  return missing;
});

function scopeKey() { return `${props.requestId}:${auth.user?.id ?? ''}:${props.audience}`; }
function isCurrent(token: number, key: string) { return alive && token === generation.value && key === scopeKey(); }
async function load() {
  const token = ++generation.value;
  const key = scopeKey();
  readState.value = null;
  lastReadHttpStatus.value = null;
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
    lastReadHttpStatus.value = status ?? null;
    readState.value = null;
    readStatus.value = status === 404 || status === 503 ? 'unavailable' : status === 401 || status === 403 ? 'forbidden' : 'error';
  }
}
function clearPendingCommands() {
  const prefix = `fixhome:w3-delivery:${scopeKey()}:`;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
  }
}
async function manualReload() {
  clearPendingCommands();
  retryAction.value = null;
  quotePhoto.value = null;
  actualPhoto.value = null;
  stagePhoto.value = null;
  await load();
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
  lastReadHttpStatus.value = null;
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
watch(quote, val => emit('quote-state', Boolean(val)), { immediate: true, flush: 'sync' });
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
      const { status, blockerHint, serverMessage } = extractErrorDetails(error);
      if (status === 409) {
        sessionStorage.removeItem(pendingKey(action));
        if (!(props.audience === 'manager' && managerMode.value === 'bootstrap')) requiresReload.value = true;
        retryAction.value = null;
        const stageHint = ['physical-issue-to-courier', 'physical-dispatch', 'physical-receipt'].includes(action)
          ? 'Nếu đang gửi ảnh xác nhận, đảm bảo ảnh khác hoàn toàn với các bước trước và đơn chưa hoàn tất.'
          : action === 'terms-proposal'
            ? `${serverMessage ? `${serverMessage} ` : ''}Kiểm tra: (1) Cấu hình «w3.shipping.max_new_fee_vnd» trong /console/admin/config phải >= mức phí đề xuất (mặc định đang là 0 ₫); (2) Đơn phải có hạng mục Tiền công đã được khách duyệt và cấu hình «commission.rate_bps» hợp lệ; (3) Nếu phiếu đã từng gửi đề xuất trước đó, bấm «Đối chiếu trạng thái đã có».`
            : null;
        const extra = blockerHint || stageHint || (serverMessage && !serverMessage.startsWith('Yêu cầu chưa đủ điều kiện') ? serverMessage : null);
        message.value = extra
          ? `Trạng thái đã thay đổi. Hãy tải lại trước khi tiếp tục. (${extra})`
          : 'Trạng thái đã thay đổi. Hãy tải lại trước khi tiếp tục.';
      } else if (status === 400) {
        sessionStorage.removeItem(pendingKey(action));
        retryAction.value = null;
        message.value = serverMessage || 'Thông tin đầu vào chưa hợp lệ. Kiểm tra mã tham chiếu (chữ không dấu, số, không khoảng trắng) và ảnh đính kèm.';
      } else if (status === 403 || status === 404) {
        sessionStorage.removeItem(pendingKey(action));
        retryAction.value = null;
        message.value = blockerHint || (serverMessage ? `${serverMessage} Hãy tải lại trạng thái.` : 'Không tìm thấy hoặc không có quyền thao tác ở bước này. Hãy tải lại trạng thái.');
      } else if (status === 429) {
        message.value = 'Chưa xác định được kết quả: thao tác quá nhanh, đợi vài giây rồi thử lại.';
      } else if (status && status >= 500) {
        message.value = blockerHint || (serverMessage ? `Chưa xác định được kết quả (lỗi ${status}: ${serverMessage}).` : `Chưa xác định được kết quả (lỗi máy chủ ${status}). Có thể thử lại cùng thao tác hoặc tải lại trạng thái.`);
      } else if (error instanceof Error && (error.message.startsWith('Hãy tải lại') || error.message.startsWith('Chưa thể đối chiếu'))) {
        retryAction.value = null;
        message.value = props.audience === 'manager' && managerMode.value === 'bootstrap'
          ? `${error.message} Bấm «Xóa thao tác dở cũ» hoặc «Đối chiếu trạng thái đã có» để thử lại.`
          : `${error.message} Bấm «Tải lại trạng thái» để xóa thao tác dở cũ và thử lại.`;
      } else {
        message.value = blockerHint || 'Chưa xác định được kết quả. Có thể thử lại cùng thao tác hoặc tải lại trạng thái.';
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
  } catch (error) {
    if (isCurrent(token, key)) {
      const { status, blockerHint, serverMessage } = extractErrorDetails(error);
      message.value = blockerHint
        || (status === 429 ? 'Tải ảnh quá nhanh, đợi vài giây rồi thử lại.' : null)
        || (serverMessage ? `Chưa tải được ảnh bằng chứng (${serverMessage}).` : null)
        || 'Chưa tải được ảnh bằng chứng. Hãy tải lại trạng thái trước khi thử ảnh khác.';
    }
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
  } catch (error) {
    if (isCurrent(token, key)) {
      const { status, blockerHint, serverMessage } = extractErrorDetails(error);
      message.value = blockerHint
        || (status === 429 ? 'Tải ảnh quá nhanh, đợi vài giây rồi thử lại.' : null)
        || (serverMessage ? `Chưa tải được ảnh bằng chứng (${serverMessage}).` : null)
        || 'Chưa tải được ảnh bằng chứng. Hãy tải lại trạng thái trước khi thử ảnh khác.';
    }
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
  if (!selectedWarehouse.value || !quotePhoto.value || proposedFee.value === null
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
  clearPendingCommands();
  retryAction.value = null;
  const inspectingPositive = positive.value;
  managerMode.value = 'operations';
  await load();
  if (inspectingPositive && (readStatus.value === 'ready' || (readStatus.value === 'unavailable' && lastReadHttpStatus.value === 404))) {
    managerInspected.value = true;
    if (readStatus.value === 'unavailable') {
      readStatus.value = 'idle';
      managerMode.value = 'bootstrap';
      message.value = 'Chưa có đề xuất trước đó gắn với kho; bạn có thể gửi đề xuất phí giao mới bên dưới.';
    } else if (!readState.value?.quote) {
      managerMode.value = 'bootstrap';
    }
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
  <section v-if="panelContextValid" :class="embedded ? 'space-y-3 p-4' : 'space-y-3.5 rounded-[var(--radius-md)] border border-ink-200 bg-white p-4'" :aria-busy="readStatus === 'loading' || warehouseLoadStatus === 'loading'">
    <div v-if="!(embedded && readStatus === 'ready' && physical?.status === 'TECHNICIAN_RECEIVED')" class="flex flex-wrap items-start justify-between gap-2 pb-2" :class="embedded ? '' : 'border-b border-ink-100 pb-3'">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-ink-900">{{ positive ? 'Giao linh kiện · phí 70/30' : 'Giao linh kiện · 0 ₫' }}</h3>
        <p v-if="!embedded" class="mt-0.5 break-all font-mono text-[11px] text-ink-400">Mã yêu cầu: {{ requestId }}</p>
      </div>
      <span class="rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap" :class="positive ? 'bg-brand-50 text-brand-700' : 'bg-ink-100/80 text-ink-600'">
        {{ positive ? 'Điều khoản trước hóa đơn' : 'Không phát sinh phí' }}
      </span>
    </div>
    <template v-if="audience === 'manager' && managerMode === 'bootstrap'">
      <p class="text-sm text-ink-700">Chọn kho đang hoạt động do bạn phụ trách. Backend sẽ kiểm tra quyền và nguồn yêu cầu khi nhận đề xuất.</p>
      <p v-if="warehouseLoadStatus === 'loading'" class="text-sm text-ink-600" role="status">Đang tải kho bạn phụ trách…</p>
      <div v-else-if="warehouseLoadStatus === 'error'" class="space-y-2 text-sm" role="alert">
        <p class="text-danger-700">Chưa tải được danh sách kho của bạn.</p><FhButton variant="secondary" size="sm" @click="loadManagerWarehouses">Tải lại danh sách kho</FhButton>
      </div>
      <div v-else-if="warehouseLoadStatus === 'ready'" class="space-y-3">
        <p v-if="ownActiveWarehouses.length === 0" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700">Bạn chưa có kho đang hoạt động được giao phụ trách.</p>
        <label v-else class="block text-xs font-semibold text-ink-700">Kho phụ trách
          <select v-model="selectedWarehouseId" class="mt-1.5 min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden" aria-label="Chọn kho đang hoạt động do bạn phụ trách">
            <option value="">Chọn kho</option>
            <option v-for="warehouse in ownActiveWarehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
          </select>
        </label>
        <template v-if="selectedWarehouse">
          <FhButton variant="secondary" :disabled="busy || readStatus === 'loading'" @click="openExisting">{{ readStatus === 'loading' ? 'Đang đối chiếu…' : 'Đối chiếu trạng thái đã có' }}</FhButton>
          <p v-if="nextWaitingHint" class="rounded-[var(--radius-sm)] border border-brand-200/80 bg-brand-50/50 px-3 py-2 text-xs text-brand-800" data-testid="delivery-next-step">
            {{ nextWaitingHint }}
          </p>
          <template v-if="positive">
            <div v-if="!quote" class="space-y-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-3.5">
              <p class="text-sm text-ink-700">Chưa có điều khoản phí giao. Đề xuất không được vượt mức phí đã duyệt <strong class="font-num text-ink-900">{{ shippingFee }} ₫</strong>.</p>
              <label class="block text-xs font-semibold text-ink-700">Tổng phí giao đề xuất (VND)
                <input v-model="proposedShippingFee" data-testid="positive-shipping-fee" type="number" min="1" :max="shippingFee ?? undefined" inputmode="numeric" class="mt-1.5 min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal font-num text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden" />
              </label>
              <label class="block text-xs font-semibold text-ink-700">Mã tham chiếu đơn vị giao hàng
                <input v-model="courierReference" maxlength="256" autocomplete="off" placeholder="VD: AHM-241124 hoặc GRAB-001" class="mt-1.5 min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden" />
                <span class="mt-1 block text-[11px] font-normal text-ink-500">Mã vận đơn ĐVVC hoặc mã nội bộ; chỉ dùng chữ không dấu, số và các ký tự . _ : / - (không khoảng trắng).</span>
              </label>
              <label class="block text-xs font-semibold text-ink-700">Ảnh đề xuất giao hàng (JPEG, PNG hoặc WebP, tối đa 10 MB)
                <span class="mt-0.5 block text-[11px] font-normal text-ink-500">Chụp ảnh báo giá cước từ app giao hàng hoặc ảnh phiếu giao/gói hàng trước khi gửi.</span>
                <input data-testid="quote-evidence" type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-dashed border-ink-300 bg-white p-2 text-xs text-ink-600 cursor-pointer file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100" @change="setFile($event, 'quote')" />
                <span v-if="quotePhoto" class="mt-1 block text-[11px] font-normal text-success-700">Đã chọn: {{ quotePhoto.name }}</span>
              </label>
              <FhButton :disabled="busy || proposedFee === null || !courierReference.trim() || !quotePhoto" @click="proposePositive">{{ busy ? 'Đang ghi nhận…' : 'Ghi đề xuất phí giao' }}</FhButton>
              <p v-if="proposalMissingFields.length" class="text-[11px] text-ink-500" data-testid="proposal-missing-hint">Cần hoàn tất để mở nút gửi: {{ proposalMissingFields.join(' · ') }}.</p>
            </div>
            <p v-else class="text-sm text-ink-700">Đã có đề xuất phí giao. Chuyển sang phần giao nhận bên dưới.</p>
          </template>
          <div v-else class="space-y-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-3.5">
            <label class="block text-xs font-semibold text-ink-700">Mã tham chiếu đơn vị giao hàng
              <input v-model="courierReference" maxlength="256" autocomplete="off" placeholder="VD: AHM-241124 hoặc GRAB-001" class="mt-1.5 min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden" />
              <span class="mt-1 block text-[11px] font-normal text-ink-500">Mã vận đơn ĐVVC hoặc mã nội bộ; chỉ dùng chữ không dấu, số và các ký tự . _ : / - (không khoảng trắng).</span>
            </label>
            <label class="block text-xs font-semibold text-ink-700">Ảnh đề xuất giao hàng (JPEG, PNG hoặc WebP, tối đa 10 MB)
              <span class="mt-0.5 block text-[11px] font-normal text-ink-500">Chụp ảnh báo giá cước từ app giao hàng hoặc ảnh phiếu giao/gói hàng trước khi gửi.</span>
              <input data-testid="quote-evidence" type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-dashed border-ink-300 bg-white p-2 text-xs text-ink-600 cursor-pointer file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100" @change="setFile($event, 'quote')" />
              <span v-if="quotePhoto" class="mt-1 block text-[11px] font-normal text-success-700">Đã chọn: {{ quotePhoto.name }}</span>
            </label>
            <FhButton :disabled="busy || !courierReference.trim() || !quotePhoto" @click="propose">{{ busy ? 'Đang ghi nhận…' : 'Đề xuất phí giao 0 ₫' }}</FhButton>
            <p v-if="proposalMissingFields.length" class="text-[11px] text-ink-500" data-testid="proposal-missing-hint">Cần hoàn tất để mở nút gửi: {{ proposalMissingFields.join(' · ') }}.</p>
          </div>
        </template>
      </div>
      <p v-if="message" class="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700" role="status">{{ message }}</p>
      <div v-if="retryAction || message.includes('Xóa thao tác dở cũ')" class="flex flex-wrap gap-2">
        <FhButton v-if="retryAction" variant="secondary" size="sm" :disabled="busy" @click="retryAction?.()">Thử lại cùng thao tác</FhButton>
        <FhButton v-if="message.includes('Xóa thao tác dở cũ')" variant="secondary" size="sm" :disabled="busy" @click="clearPendingCommands(); message = ''; retryAction = null">Xóa thao tác dở cũ</FhButton>
      </div>
    </template>
    <p v-else-if="readStatus === 'loading'" class="text-sm text-ink-600" role="status">Đang tải tình trạng giao linh kiện…</p>
    <div v-else-if="readStatus === 'unavailable'" class="space-y-2 text-sm text-ink-700" role="status">
      <p>Chưa khả dụng.</p>
      <div class="flex flex-wrap gap-2">
        <FhButton variant="secondary" size="sm" :disabled="busy" @click="manualReload">Tải lại trạng thái</FhButton>
        <FhButton v-if="audience === 'manager'" variant="ghost" size="sm" @click="managerMode = 'bootstrap'">Quay lại form đề xuất</FhButton>
      </div>
    </div>
    <div v-else-if="readStatus === 'forbidden'" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">Bạn không có quyền xem thông tin giao linh kiện này.</div>
    <div v-else-if="readStatus === 'error'" class="space-y-2 text-sm" role="alert">
      <p class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-danger-700">Chưa thể kiểm tra trạng thái giao linh kiện.</p><FhButton variant="secondary" size="sm" :disabled="busy" @click="manualReload">Tải lại trạng thái</FhButton>
    </div>
    <template v-else-if="readStatus === 'ready' && readState">
      <!-- Once the technician has the parts the order moves on, so the server reports the terms as
           no longer current; that is the end of the delivery, not a change to review (13/11). -->
      <div v-if="physical?.status === 'TECHNICIAN_RECEIVED'" class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-success-50/80 px-3 py-2">
        <p class="text-sm font-medium text-success-800" role="status" data-testid="delivery-operations-done">Đã giao xong: kỹ thuật viên đã nhận linh kiện.</p>
        <FhButton variant="ghost" size="sm" :disabled="busy" @click="manualReload">Tải lại trạng thái</FhButton>
      </div>
      <p v-else-if="readState.invalidated" class="rounded-[var(--radius-sm)] bg-warning-50 px-3 py-2.5 text-sm text-warning-800" role="status">Dữ liệu nguồn đã thay đổi. Cần Quản lý dịch vụ kiểm tra lại.</p>
      <template v-else-if="requiresReload">
        <p class="rounded-[var(--radius-sm)] bg-warning-50 px-3 py-2 text-sm text-warning-800" role="alert">{{ message }}</p>
        <FhButton variant="secondary" size="sm" :disabled="busy" @click="manualReload">Tải lại trạng thái</FhButton>
      </template>
      <template v-else>
        <dl v-if="quote" class="grid gap-2 rounded-[var(--radius-sm)] bg-ink-50/70 p-3 text-xs sm:text-sm sm:grid-cols-2">
          <div><dt class="inline text-ink-500">{{ positive ? 'Phí giao theo thỏa thuận: ' : 'Phí giao thực tế: ' }}</dt><dd class="inline font-num font-semibold text-ink-900"><FhMoney :amount="quote.totalShippingFee" /></dd></div>
          <div><dt class="inline text-ink-500">Mã phiên báo giá: </dt><dd class="inline font-num font-semibold text-ink-900">{{ quote.quoteVersion }}</dd></div>
          <div v-if="positive"><dt class="inline text-ink-500">Khách hàng chịu (70%): </dt><dd class="inline font-num font-semibold text-ink-900"><FhMoney :amount="quote.customerShippingShare" /></dd></div>
          <div v-if="positive"><dt class="inline text-ink-500">Kỹ thuật viên chịu (30%): </dt><dd class="inline font-num font-semibold text-ink-900"><FhMoney :amount="quote.technicianShippingShare" /></dd></div>
          <div v-if="readState.actual"><dt class="inline text-ink-500">Phí thực tế đã ghi nhận: </dt><dd class="inline font-num font-semibold text-ink-900"><FhMoney :amount="readState.actual.totalShippingFee" /></dd></div>
          <div><dt class="inline text-ink-500">Đồng thuận khách hàng: </dt><dd class="inline font-medium" :class="readState.customerConsented ? 'text-success-700' : 'text-ink-700'">{{ readState.customerConsented ? 'Đã ghi nhận' : 'Chưa ghi nhận' }}</dd></div>
          <div><dt class="inline text-ink-500">Đồng thuận kỹ thuật viên: </dt><dd class="inline font-medium" :class="readState.technicianConsented ? 'text-success-700' : 'text-ink-700'">{{ readState.technicianConsented ? 'Đã ghi nhận' : 'Chưa ghi nhận' }}</dd></div>
        </dl>
        <p v-else class="rounded-[var(--radius-sm)] bg-ink-50 px-3 py-2 text-sm text-ink-700">
          {{ positive ? 'Chưa có điều khoản phí giao.' : 'Chưa có đề xuất phí giao 0 ₫.' }}
        </p>
        <p class="text-xs sm:text-sm text-ink-700">
          Giao nhận: <strong class="font-semibold text-ink-900">{{ statusLabel }}</strong>.
        </p>
        <ol class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 text-[11px]" aria-label="Tiến trình giao nhận" data-testid="delivery-progress-steps">
          <li
            v-for="step in deliverySteps"
            :key="step.key"
            class="rounded-[var(--radius-sm)] px-2.5 py-1.5 font-medium"
            :class="step.done
              ? 'bg-success-50 text-success-800'
              : step.active
                ? 'bg-brand-50 text-brand-800 font-semibold'
                : 'bg-ink-50/70 text-ink-500'"
          >
            {{ step.label }}
          </li>
        </ol>
        <p v-if="nextWaitingHint" class="rounded-[var(--radius-sm)] bg-brand-50/70 px-3 py-2 text-xs font-medium text-brand-800" data-testid="delivery-next-step">
          {{ nextWaitingHint }}
        </p>
        <div v-if="audience === 'manager' && !quote">
          <FhButton variant="secondary" size="sm" @click="managerMode = 'bootstrap'">Mở form đề xuất giao</FhButton>
        </div>
        <p v-if="positive" class="text-[11px] leading-relaxed text-ink-500">Giao nhận vật lý khả dụng khi cả hai bên đồng thuận và phí thực tế đã được ghi nhận. Thanh toán hoặc chi trả chỉ sau hóa đơn W3 đã khóa và đủ điều kiện; khoản phí này chưa được thanh toán.</p>
        <p v-else class="text-[11px] leading-relaxed text-ink-500">Phí giao và mọi phần chia đều bằng 0 ₫. Không ghi nhận thanh toán hoặc xác minh bên giao hàng.</p>
        <p v-if="positive && quote" class="text-xs font-medium" :class="canOperatePhysical ? 'text-success-700' : 'text-ink-600'">{{ canOperatePhysical ? 'Đã đủ điều kiện ghi nhận giao nhận vật lý.' : 'Chưa đủ điều kiện giao nhận vật lý: cần cả hai đồng thuận và phí thực tế.' }}</p>

        <div v-if="audience === 'customer' || audience === 'technician'" data-testid="delivery-operations-actions" class="space-y-3">
          <div v-if="canConsent" class="space-y-2.5 rounded-[var(--radius-sm)] border border-brand-200 bg-brand-50/40 p-3">
            <label class="flex items-start gap-2.5 text-sm text-ink-800 cursor-pointer"><input v-model="accepted" type="checkbox" class="mt-1 size-4 accent-brand-600" />Tôi đồng ý với mức phí giao 0 ₫ cho đề xuất này.</label>
            <FhButton data-testid="delivery-consent" :disabled="busy || !accepted" @click="consent">{{ busy ? 'Đang ghi nhận…' : 'Ghi nhận đồng ý' }}</FhButton>
          </div>
          <p v-else-if="positive && !readState?.[audience === 'customer' ? 'customerConsented' : 'technicianConsented']" class="text-xs text-ink-600">Đồng thuận phí dương được ghi tại mục Điều khoản phí giao hàng.</p>
          <div v-if="audience === 'technician' && canOperatePhysical && (!physical || ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RELEASED'].includes(physical.status))">
            <FhButton variant="secondary" :disabled="busy" @click="physicalAction('reserve')">{{ busy ? 'Đang ghi nhận…' : 'Yêu cầu phân bổ kho' }}</FhButton>
          </div>
          <div v-if="audience === 'technician' && canOperatePhysical && physical?.status === 'DISPATCH_RECORDED'" class="space-y-2.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-3">
            <label class="block text-xs font-semibold text-ink-700">Ảnh xác nhận nhận linh kiện
              <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-dashed border-ink-300 bg-white p-2 text-xs text-ink-600 cursor-pointer file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100" @change="setFile($event, 'stage')" />
              <span v-if="stagePhoto" class="mt-1 block text-[11px] font-normal text-success-700">Đã chọn: {{ stagePhoto.name }}</span>
            </label>
            <FhButton variant="secondary" :disabled="busy || !stagePhoto" @click="physicalAction('receipt')">Ghi nhận nhận linh kiện</FhButton>
          </div>
        </div>

        <div v-if="audience === 'manager' && managerMode === 'operations'" data-testid="delivery-operations-actions" class="space-y-3 border-t border-ink-100 pt-3">
          <template v-if="quote">
            <div v-if="readState.customerConsented && readState.technicianConsented && !actualRecorded" class="space-y-3 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-3.5">
              <label v-if="positive" class="block text-xs font-semibold text-ink-700">Tổng phí giao thực tế (0–{{ quote.totalShippingFee }} ₫)
                <input v-model="actualShippingFee" data-testid="positive-actual-fee" type="number" min="0" :max="quote.totalShippingFee" inputmode="numeric" class="mt-1.5 min-h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 text-sm font-normal font-num text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-hidden" />
              </label>
              <label class="block text-xs font-semibold text-ink-700">{{ positive ? 'Ảnh đối chiếu phí giao thực tế' : 'Ảnh đối chiếu phí giao thực tế 0 ₫' }}
                <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-dashed border-ink-300 bg-white p-2 text-xs text-ink-600 cursor-pointer file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100" @change="setFile($event, 'actual')" />
                <span v-if="actualPhoto" class="mt-1 block text-[11px] font-normal text-success-700">Đã chọn: {{ actualPhoto.name }}</span>
              </label>
              <FhButton :disabled="busy || !actualPhoto || (positive && actualFee === null)" @click="recordActual">{{ positive ? 'Ghi nhận phí thực tế' : 'Ghi nhận phí giao thực tế 0 ₫' }}</FhButton>
            </div>
            <div v-if="canOperatePhysical && physical?.status === 'RESERVED'" class="space-y-2.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-3.5">
              <label class="block text-xs font-semibold text-ink-700">Ảnh bàn giao cho đơn vị giao hàng
                <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-dashed border-ink-300 bg-white p-2 text-xs text-ink-600 cursor-pointer file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100" @change="setFile($event, 'stage')" />
                <span v-if="stagePhoto" class="mt-1 block text-[11px] font-normal text-success-700">Đã chọn: {{ stagePhoto.name }}</span>
              </label>
              <div class="flex flex-wrap gap-2">
                <FhButton variant="secondary" :disabled="busy || !stagePhoto" @click="physicalAction('issue-to-courier')">Ghi nhận bàn giao cho đơn vị giao hàng</FhButton>
                <FhButton variant="secondary" :disabled="busy" @click="physicalAction('release')">Hủy phân bổ giao hàng</FhButton>
              </div>
            </div>
            <div v-if="canOperatePhysical && physical?.status === 'ISSUED_TO_COURIER'" class="space-y-2.5 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-25 p-3.5">
              <label class="block text-xs font-semibold text-ink-700">Ảnh xác nhận rời kho
                <input type="file" accept="image/jpeg,image/png,image/webp" class="mt-1.5 block w-full rounded-[var(--radius-sm)] border border-dashed border-ink-300 bg-white p-2 text-xs text-ink-600 cursor-pointer file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100" @change="setFile($event, 'stage')" />
                <span v-if="stagePhoto" class="mt-1 block text-[11px] font-normal text-success-700">Đã chọn: {{ stagePhoto.name }}</span>
              </label>
              <FhButton variant="secondary" :disabled="busy || !stagePhoto" @click="physicalAction('dispatch')">Ghi nhận rời kho</FhButton>
            </div>
          </template>
        </div>
      </template>
      <p v-if="message && !requiresReload" class="rounded-[var(--radius-sm)] bg-ink-50 px-3 py-2 text-sm text-ink-700" role="status">{{ message }}</p>
      <div v-if="!requiresReload && physical?.status !== 'TECHNICIAN_RECEIVED'" class="flex flex-wrap items-center gap-2">
        <FhButton v-if="message.includes('Chưa xác định') && retryAction" variant="secondary" size="sm" :disabled="busy" @click="retryAction?.()">Thử lại cùng thao tác</FhButton>
        <FhButton variant="ghost" size="sm" :disabled="busy" @click="manualReload">Tải lại trạng thái</FhButton>
      </div>
    </template>
  </section>
</template>
