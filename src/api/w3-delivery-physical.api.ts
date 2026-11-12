import apiClient from './client';

const requiredBlockers = [
  'SHIPPING_APPROVAL_SOURCE_UNVERIFIED', 'WAREHOUSE_DELIVERY_ALLOCATION_MISSING',
  'COURIER_PROOF_UNVERIFIED', 'FINANCE_CUTOVER_CLOSED', 'TOTAL_ORDER_LABOR_BUDGET_UNVERIFIED',
  'PHYSICAL_ACTIVATION_CLOSED', 'DUAL_CONSENT_UNVERIFIED',
] as const;
export const deliveryPhysicalBlockerLabels = {
  SHIPPING_APPROVAL_SOURCE_UNVERIFIED: 'Chưa xác minh phê duyệt phí giao.',
  WAREHOUSE_DELIVERY_ALLOCATION_MISSING: 'Chưa có phân bổ kho cho giao hàng.',
  COURIER_PROOF_UNVERIFIED: 'Chưa xác minh chứng từ của đơn vị giao hàng.',
  FINANCE_CUTOVER_CLOSED: 'Chưa mở thực hiện tài chính.',
  TOTAL_ORDER_LABOR_BUDGET_UNVERIFIED: 'Chưa xác minh ngân sách tiền công của đơn.',
  PHYSICAL_ACTIVATION_CLOSED: 'Chưa mở thực hiện giao nhận linh kiện.',
  DUAL_CONSENT_UNVERIFIED: 'Chưa xác minh đầy đủ đồng thuận của khách hàng và kỹ thuật viên.',
  ORDER_FROZEN: 'Đơn sửa chữa đang bị khóa thao tác.',
  ORDER_INVOICED: 'Đơn sửa chữa đã có hóa đơn.',
  REQUEST_FROZEN: 'Yêu cầu linh kiện đang bị khóa thao tác.',
  REQUEST_KIND_UNSUPPORTED: 'Loại yêu cầu linh kiện chưa được hỗ trợ.',
  FULFILLMENT_NOT_DELIVERY: 'Yêu cầu không thuộc hình thức giao hàng.',
  SOURCE_BINDING_UNVERIFIED: 'Chưa đối chiếu được nguồn yêu cầu linh kiện.',
  PARTS_LABOR_SOURCE_NOT_APPROVED: 'Nguồn linh kiện và tiền công chưa được phê duyệt.',
} as const;
type Blocker = keyof typeof deliveryPhysicalBlockerLabels;
type AssessmentStatus = 'INELIGIBLE' | 'PENDING_ASSISTANCE' | 'RESERVED' | 'RELEASED'
  | 'ISSUED_TO_COURIER' | 'DISPATCH_RECORDED' | 'TECHNICIAN_RECEIVED';
export interface DeliveryPhysicalPreview {
  mode: 'NON_EXECUTABLE_PREVIEW';
  consistency: 'NON_ATOMIC';
  requestId: string;
  eligibility: 'PENDING_ASSISTANCE' | 'INELIGIBLE';
  reason: 'LEGACY_OR_NOT_ENROLLED' | 'SCOPE_OR_PARTS_SOURCE_UNVERIFIED' | 'SHIPPING_APPROVAL_SOURCE_UNVERIFIED';
  lastAssessment: { version: number; status: AssessmentStatus; reason: string | null } | null;
  physicalExecution: 'BLOCKED';
  financialExecution: 'BLOCKED';
  evidence: 'NOT_RECORDED' | 'RECORDED_NOT_EXTERNALLY_VERIFIED';
  actualCourierCost: null;
  courierPayment: 'NOT_RECORDED';
  blockers: Blocker[];
  actions: { reserve: 'BLOCKED'; issueToCourier: 'BLOCKED'; dispatch: 'BLOCKED'; technicianReceipt: 'BLOCKED' };
  /** W-16: paid W3 path only — the recorded physical step and the actual fee split. */
  progress: DeliveryPhysicalProgress | null;
}
export interface DeliveryPhysicalProgress {
  status: AssessmentStatus;
  actualShippingFee: number | null;
  customerShippingShare: number | null;
  technicianShippingShare: number | null;
}
const invalid = (): never => { throw new Error('Chưa thể đối chiếu trạng thái giao linh kiện.'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: readonly string[]) {
  const data = record(value);
  if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key))) return invalid();
  return data;
}
function member<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return invalid();
  return value as T;
}
export function isDeliveryPhysicalRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}
function readPreview(body: unknown, requestId: string): DeliveryPhysicalPreview {
  const envelope = record(body);
  if (envelope.success !== true || envelope.statusCode !== 200 || typeof envelope.message !== 'string') return invalid();
  const keys = ['mode', 'consistency', 'requestId', 'eligibility', 'reason', 'lastAssessment',
    'physicalExecution', 'financialExecution', 'evidence', 'actualCourierCost', 'courierPayment', 'blockers', 'actions'];
  const data = shape(envelope.data, Object.hasOwn(record(envelope.data), 'progress') ? [...keys, 'progress'] : keys);
  if (data.mode !== 'NON_EXECUTABLE_PREVIEW' || data.consistency !== 'NON_ATOMIC' || data.requestId !== requestId
    || data.physicalExecution !== 'BLOCKED' || data.financialExecution !== 'BLOCKED'
    || data.actualCourierCost !== null || data.courierPayment !== 'NOT_RECORDED') return invalid();
  const eligibility = member(data.eligibility, ['PENDING_ASSISTANCE', 'INELIGIBLE']);
  const reason = member(data.reason, ['LEGACY_OR_NOT_ENROLLED', 'SCOPE_OR_PARTS_SOURCE_UNVERIFIED', 'SHIPPING_APPROVAL_SOURCE_UNVERIFIED']);
  if ((eligibility === 'PENDING_ASSISTANCE') !== (reason === 'SHIPPING_APPROVAL_SOURCE_UNVERIFIED')) return invalid();
  const evidence = member(data.evidence, ['NOT_RECORDED', 'RECORDED_NOT_EXTERNALLY_VERIFIED']);
  let lastAssessment: DeliveryPhysicalPreview['lastAssessment'] = null;
  if (data.lastAssessment !== null) {
    const assessment = shape(data.lastAssessment, ['version', 'status', 'reason']);
    if (typeof assessment.version !== 'number' || !Number.isSafeInteger(assessment.version) || assessment.version < 1
      || (assessment.reason !== null && (typeof assessment.reason !== 'string' || !assessment.reason.trim() || assessment.reason.length > 300))) return invalid();
    lastAssessment = { version: assessment.version,
      status: member(assessment.status, ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RESERVED', 'RELEASED', 'ISSUED_TO_COURIER', 'DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED']),
      reason: assessment.reason as string | null };
  }
  if (!lastAssessment && evidence !== 'NOT_RECORDED') return invalid();
  if (!Array.isArray(data.blockers) || new Set(data.blockers).size !== data.blockers.length) return invalid();
  const blockers = data.blockers.map(value => member(value, Object.keys(deliveryPhysicalBlockerLabels) as Blocker[]));
  if (!requiredBlockers.every(value => blockers.includes(value))) return invalid();
  const actions = shape(data.actions, ['reserve', 'issueToCourier', 'dispatch', 'technicianReceipt']);
  if (Object.values(actions).some(value => value !== 'BLOCKED')) return invalid();
  let progress: DeliveryPhysicalProgress | null = null;
  if (data.progress != null) {
    const p = shape(data.progress, ['status', 'actualShippingFee', 'customerShippingShare', 'technicianShippingShare']);
    const money = (value: unknown) => (value === null ? null
      : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid());
    progress = { status: member(p.status, ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RESERVED', 'RELEASED', 'ISSUED_TO_COURIER', 'DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED']),
      actualShippingFee: money(p.actualShippingFee), customerShippingShare: money(p.customerShippingShare),
      technicianShippingShare: money(p.technicianShippingShare) };
  }
  // Construct the typed projection only after all authority and money fields are checked.
  return { progress, mode: 'NON_EXECUTABLE_PREVIEW', consistency: 'NON_ATOMIC', requestId, eligibility, reason, lastAssessment,
    physicalExecution: 'BLOCKED', financialExecution: 'BLOCKED', evidence, actualCourierCost: null,
    courierPayment: 'NOT_RECORDED', blockers,
    actions: { reserve: 'BLOCKED', issueToCourier: 'BLOCKED', dispatch: 'BLOCKED', technicianReceipt: 'BLOCKED' } };
}
export const w3DeliveryPhysicalApi = {
  async preview(requestId: string): Promise<DeliveryPhysicalPreview> {
    if (!isDeliveryPhysicalRequestId(requestId)) return invalid();
    const response = await apiClient.get<unknown>(`/part-requests/${requestId}/delivery-physical/preview`);
    return readPreview(response.data, requestId);
  },
};
