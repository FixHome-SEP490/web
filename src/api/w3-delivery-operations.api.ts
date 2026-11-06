import apiClient from './client';

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type DeliveryEvidencePurpose = 'QUOTE' | 'ACTUAL' | 'ISSUE_TO_COURIER' | 'COURIER_DISPATCH' | 'TECHNICIAN_RECEIPT';
export type DeliveryPhysicalStatus = 'INELIGIBLE' | 'PENDING_ASSISTANCE' | 'RESERVED' | 'RELEASED' | 'ISSUED_TO_COURIER' | 'DISPATCH_RECORDED' | 'TECHNICIAN_RECEIVED';
export interface DeliveryOperationsQuote {
  quoteVersion: number;
  fingerprint: string;
  policyVersion: 'W3_70_30_V1';
  totalShippingFee: number;
  customerShippingShare: number;
  technicianShippingShare: number;
  laborBudget: 'UNVERIFIED';
}
export interface DeliveryPhysicalState {
  status: DeliveryPhysicalStatus;
  version: number;
  reason: string | null;
  warehouseId: string | null;
  responsibleUserId: string | null;
  courierReference: string | null;
  evidence: Array<{ kind: string; verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' }>;
}
export interface DeliveryOperationsRead {
  version: number;
  quote: DeliveryOperationsQuote | null;
  invalidated: boolean;
  customerConsented: boolean;
  technicianConsented: boolean;
  actual: { totalShippingFee: number; quoteVersion: number } | null;
  physical: DeliveryPhysicalState | null;
  financialExecution: 'BLOCKED';
  financialBlocker: 'FINANCE_LEDGER_SOURCE_REQUIRED';
}
export interface DeliveryCommandIdentity { commandId: string; expectedVersion: number }
export interface ShippingProposalInput extends DeliveryCommandIdentity {
  warehouseId: string; evidenceId: string; courierReference: string; totalShippingFee: 0;
}
export interface ShippingConsentInput extends DeliveryCommandIdentity {
  quoteVersion: number; quoteFingerprint: string; totalShippingFee: 0; shippingShare: 0; accepted: true;
}
export interface DeliveryActualInput extends DeliveryCommandIdentity {
  quoteVersion: number; totalShippingFee: 0; evidenceId: string;
}
export interface DeliveryStageInput extends DeliveryCommandIdentity { evidenceId: string }
export interface DeliveryUploadedEvidence { evidenceId: string; purpose: DeliveryEvidencePurpose; quoteVersion: number }

const invalid = (): never => { throw new Error('Chưa thể đối chiếu trạng thái giao linh kiện.'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const data = record(value);
  if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key))) return invalid();
  return data;
}
function int(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function envelope(value: unknown, expectedStatusCode: 200 | 201): unknown {
  const outer = exact(value, ['success', 'statusCode', 'message', 'data']);
  if (outer.success !== true || outer.statusCode !== expectedStatusCode || typeof outer.message !== 'string') return invalid();
  return outer.data;
}
function parseQuote(value: unknown): DeliveryOperationsQuote {
  const q = exact(value, ['quoteVersion', 'fingerprint', 'policyVersion', 'totalShippingFee', 'customerShippingShare', 'technicianShippingShare', 'laborBudget']);
  if (!int(q.quoteVersion, 1, 2147483647) || typeof q.fingerprint !== 'string' || !SHA256.test(q.fingerprint)
    || q.policyVersion !== 'W3_70_30_V1' || !int(q.totalShippingFee)
    || !int(q.customerShippingShare) || !int(q.technicianShippingShare)
    || q.customerShippingShare + q.technicianShippingShare !== q.totalShippingFee
    || BigInt(q.customerShippingShare) !== (7n * BigInt(q.totalShippingFee) + 5n) / 10n
    || q.laborBudget !== 'UNVERIFIED') return invalid();
  return { quoteVersion: q.quoteVersion, fingerprint: q.fingerprint, policyVersion: 'W3_70_30_V1',
    totalShippingFee: q.totalShippingFee, customerShippingShare: q.customerShippingShare,
    technicianShippingShare: q.technicianShippingShare, laborBudget: 'UNVERIFIED' };
}
function parsePhysical(value: unknown): DeliveryPhysicalState {
  const p = exact(value, ['status', 'reason', 'warehouseId', 'responsibleUserId', 'quantities', 'version', 'courierReference', 'evidence']);
  const statuses: DeliveryPhysicalStatus[] = ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RESERVED', 'RELEASED', 'ISSUED_TO_COURIER', 'DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED'];
  if (typeof p.status !== 'string' || !statuses.includes(p.status as DeliveryPhysicalStatus)
    || !int(p.version, 1, 2147483647) || (p.reason !== null && typeof p.reason !== 'string')
    || (p.warehouseId !== null && (typeof p.warehouseId !== 'string' || !UUID_V4.test(p.warehouseId)))
    || (p.responsibleUserId !== null && (typeof p.responsibleUserId !== 'string' || !UUID_V4.test(p.responsibleUserId)))
    || (typeof p.reason === 'string' && p.reason.length > 300)
    || !Array.isArray(p.quantities) || (p.courierReference !== null && typeof p.courierReference !== 'string') || !Array.isArray(p.evidence)) return invalid();
  for (const quantity of p.quantities) {
    const q = exact(quantity, ['partId', 'quantity']);
    if (typeof q.partId !== 'string' || !UUID_V4.test(q.partId) || !int(q.quantity, 1, 2147483647)) return invalid();
  }
  const evidence = p.evidence.map(item => {
    const e = exact(item, ['courierReference', 'evidenceRef', 'contentDigest', 'kind', 'verification']);
    if (typeof e.verification !== 'string' || e.verification !== 'RECORDED_NOT_EXTERNALLY_VERIFIED'
      || !['ISSUE_TO_COURIER', 'COURIER_DISPATCH', 'TECHNICIAN_RECEIPT'].includes(String(e.kind))
      || typeof e.courierReference !== 'string' || typeof e.evidenceRef !== 'string'
      || typeof e.contentDigest !== 'string' || !SHA256.test(e.contentDigest)) return invalid();
    return { kind: e.kind as string, verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' as const };
  });
  return { status: p.status as DeliveryPhysicalStatus, version: p.version, reason: p.reason as string | null,
    warehouseId: p.warehouseId as string | null, responsibleUserId: p.responsibleUserId as string | null,
    courierReference: p.courierReference as string | null, evidence };
}
function parseRead(value: unknown, requestId: string): DeliveryOperationsRead {
  const d = exact(value, ['version', 'quote', 'invalidated', 'customerConsented', 'technicianConsented', 'actual', 'physical', 'financialExecution', 'financialBlocker']);
  if (!int(d.version, 0, 2147483646) || typeof d.invalidated !== 'boolean' || typeof d.customerConsented !== 'boolean'
    || typeof d.technicianConsented !== 'boolean' || d.financialExecution !== 'BLOCKED'
    || d.financialBlocker !== 'FINANCE_LEDGER_SOURCE_REQUIRED') return invalid();
  const quote = d.quote === null ? null : parseQuote(d.quote);
  let actual: DeliveryOperationsRead['actual'] = null;
  if (d.actual !== null) {
    const a = exact(d.actual, ['totalShippingFee', 'quoteVersion']);
    if (!int(a.totalShippingFee) || !int(a.quoteVersion, 1, 2147483647) || !quote
      || a.quoteVersion !== quote.quoteVersion || a.totalShippingFee > quote.totalShippingFee) return invalid();
    actual = { totalShippingFee: a.totalShippingFee, quoteVersion: a.quoteVersion };
  }
  const physical = d.physical === null ? null : parsePhysical(d.physical);
  if (!UUID_V4.test(requestId) || ((d.customerConsented || d.technicianConsented || actual) && !quote)) return invalid();
  return { version: d.version, quote, invalidated: d.invalidated, customerConsented: d.customerConsented,
    technicianConsented: d.technicianConsented, actual, physical, financialExecution: 'BLOCKED', financialBlocker: 'FINANCE_LEDGER_SOURCE_REQUIRED' };
}
const path = (requestId: string) => {
  if (!UUID_V4.test(requestId)) return invalid();
  return `/part-requests/${requestId}/delivery`;
};
const validateIdentity = ({ commandId, expectedVersion }: DeliveryCommandIdentity) => {
  if (!UUID_V4.test(commandId) || !int(expectedVersion, 0, 2147483646)) return invalid();
};

export const w3DeliveryOperationsApi = {
  async read(requestId: string): Promise<DeliveryOperationsRead> {
    const response = await apiClient.get<unknown>(path(requestId));
    return parseRead(envelope(response.data, 200), requestId);
  },
  async uploadEvidence(requestId: string, input: { warehouseId: string; purpose: DeliveryEvidencePurpose; quoteVersion: number; file: File }): Promise<DeliveryUploadedEvidence> {
    const base = path(requestId);
    if (!UUID_V4.test(input.warehouseId) || !int(input.quoteVersion, 1, 2147483647)
      || !['QUOTE', 'ACTUAL', 'ISSUE_TO_COURIER', 'COURIER_DISPATCH', 'TECHNICIAN_RECEIPT'].includes(input.purpose)
      || !ALLOWED_MIME.includes(input.file.type as (typeof ALLOWED_MIME)[number]) || input.file.size < 1 || input.file.size > MAX_FILE_SIZE) return invalid();
    const form = new FormData();
    form.append('file', input.file);
    form.append('warehouseId', input.warehouseId);
    form.append('purpose', input.purpose);
    form.append('quoteVersion', String(input.quoteVersion));
    const response = await apiClient.post<unknown>(`${base}/evidence`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    const d = exact(envelope(response.data, 201), ['evidenceId', 'purpose', 'quoteVersion', 'verification']);
    if (typeof d.evidenceId !== 'string' || !UUID_V4.test(d.evidenceId) || d.purpose !== input.purpose
      || d.quoteVersion !== input.quoteVersion || d.verification !== 'UPLOADED_BYTES_NOT_COURIER_VERIFIED') return invalid();
    return { evidenceId: d.evidenceId, purpose: input.purpose, quoteVersion: input.quoteVersion };
  },
  async propose(requestId: string, input: ShippingProposalInput) {
    validateIdentity(input);
    if (!UUID_V4.test(input.warehouseId) || !UUID_V4.test(input.evidenceId) || input.totalShippingFee !== 0
      || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(input.courierReference)) return invalid();
    const response = await apiClient.post<unknown>(`${path(requestId)}/proposal`, input);
    const d = exact(envelope(response.data, 201), ['version', 'quote', 'replayed', 'financialExecution']);
    const parsedQuote = parseQuote(d.quote);
    if (!int(d.version, 1, 2147483646) || typeof d.replayed !== 'boolean' || d.financialExecution !== 'BLOCKED') return invalid();
    return { version: d.version, quote: parsedQuote, replayed: d.replayed, financialExecution: 'BLOCKED' as const };
  },
  async consent(requestId: string, input: ShippingConsentInput) {
    validateIdentity(input);
    if (!int(input.quoteVersion, 1, 2147483647) || !SHA256.test(input.quoteFingerprint)
      || input.totalShippingFee !== 0 || input.shippingShare !== 0 || input.accepted !== true) return invalid();
    const response = await apiClient.post<unknown>(`${path(requestId)}/consent`, input);
    const d = exact(envelope(response.data, 201), ['version', 'quote', 'customerConsented', 'technicianConsented', 'replayed', 'financialExecution']);
    const quote = parseQuote(d.quote);
    if (!int(d.version, 1, 2147483646) || quote.quoteVersion !== input.quoteVersion || quote.fingerprint !== input.quoteFingerprint
      || typeof d.customerConsented !== 'boolean' || typeof d.technicianConsented !== 'boolean'
      || typeof d.replayed !== 'boolean' || d.financialExecution !== 'BLOCKED') return invalid();
    return { version: d.version, quote, customerConsented: d.customerConsented, technicianConsented: d.technicianConsented,
      replayed: d.replayed, financialExecution: 'BLOCKED' as const };
  },
  async actual(requestId: string, input: DeliveryActualInput) {
    validateIdentity(input);
    if (!int(input.quoteVersion, 1, 2147483647) || input.totalShippingFee !== 0 || !UUID_V4.test(input.evidenceId)) return invalid();
    const response = await apiClient.post<unknown>(`${path(requestId)}/actual`, input);
    const d = exact(envelope(response.data, 201), ['version', 'replayed', 'financialExecution']);
    if (!int(d.version, 1, 2147483646) || typeof d.replayed !== 'boolean' || d.financialExecution !== 'BLOCKED') return invalid();
    return { version: d.version, replayed: d.replayed, financialExecution: 'BLOCKED' as const };
  },
  async physical(requestId: string, action: 'reserve' | 'release' | 'issue-to-courier' | 'dispatch' | 'receipt', input: DeliveryCommandIdentity | DeliveryStageInput) {
    validateIdentity(input);
    if (action !== 'reserve' && action !== 'release' && !UUID_V4.test((input as DeliveryStageInput).evidenceId)) return invalid();
    const response = await apiClient.post<unknown>(`${path(requestId)}/${action}`, input);
    const d = exact(envelope(response.data, 201), ['state', 'replayed']);
    if (typeof d.replayed !== 'boolean') return invalid();
    return { state: parsePhysical(d.state), replayed: d.replayed };
  },
};
