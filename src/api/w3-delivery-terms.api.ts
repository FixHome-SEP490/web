import apiClient from './client';

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const BLOCKERS = ['COMMISSION_NOT_FROZEN', 'DEDUCTIONS_LEDGER_SOURCE_REQUIRED', 'SELLER_TAX_PAYMENT_POLICY_REQUIRED'] as const;
const invalid = (): never => { throw new Error('Chưa thể đối chiếu điều khoản giao linh kiện.'); };

export interface DeliveryTermsQuote {
  quoteVersion: number; policyVersion: 'W3_70_30_V1'; totalShippingFee: number;
  customerShippingShare: number; technicianShippingShare: number; fingerprint: string;
}
export interface DeliveryTermsState {
  version: number; scope: 'CONDITIONAL_TERMS_ONLY'; quote: DeliveryTermsQuote;
  customerConsented: boolean; technicianConsented: boolean;
  actual: { quoteVersion: number; totalShippingFee: number; customerShippingShare: number;
    technicianShippingShare: number; verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' } | null;
  financialExecution: 'BLOCKED'; laborBudget: null; aggregateBudgetVerified: false; paymentVerified: false;
}
export interface DeliveryTermsRead {
  state: DeliveryTermsState | null; invalidated: boolean; financialExecution: 'BLOCKED'; laborBudget: null;
  aggregateBudgetVerified: false;
  recordedConditionalCeilings: { count: number; shipping: string; technician: string } | null;
  blockers: typeof BLOCKERS[number][];
}
export interface DeliveryTermsIdentity { commandId: string; expectedVersion: number }
export interface DeliveryTermsConsentInput extends DeliveryTermsIdentity {
  quoteVersion: number; quoteFingerprint: string; totalShippingFee: number; shippingShare: number; accepted: true;
}

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
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function envelope(value: unknown, expectedStatusCode: 200 | 201): unknown {
  const outer = exact(value, ['success', 'statusCode', 'message', 'data']);
  if (outer.success !== true || outer.statusCode !== expectedStatusCode || typeof outer.message !== 'string') return invalid();
  return outer.data;
}
function parseQuote(value: unknown): DeliveryTermsQuote {
  const q = exact(value, ['quoteVersion', 'policyVersion', 'totalShippingFee', 'customerShippingShare', 'technicianShippingShare', 'fingerprint']);
  if (!integer(q.quoteVersion, 1, 2147483647) || q.policyVersion !== 'W3_70_30_V1'
    || !integer(q.totalShippingFee, 1) || !integer(q.customerShippingShare) || !integer(q.technicianShippingShare)
    || q.customerShippingShare + q.technicianShippingShare !== q.totalShippingFee
    || BigInt(q.customerShippingShare) !== (7n * BigInt(q.totalShippingFee) + 5n) / 10n
    || typeof q.fingerprint !== 'string' || !SHA256.test(q.fingerprint)) return invalid();
  return { quoteVersion: q.quoteVersion, policyVersion: 'W3_70_30_V1', totalShippingFee: q.totalShippingFee,
    customerShippingShare: q.customerShippingShare, technicianShippingShare: q.technicianShippingShare, fingerprint: q.fingerprint };
}
function parseState(value: unknown): DeliveryTermsState | null {
  if (value === null) return null;
  const d = exact(value, ['version', 'scope', 'quote', 'customerConsented', 'technicianConsented', 'actual', 'financialExecution', 'laborBudget', 'aggregateBudgetVerified', 'paymentVerified']);
  const quote = parseQuote(d.quote);
  if (!integer(d.version, 1, 2147483646) || d.scope !== 'CONDITIONAL_TERMS_ONLY'
    || typeof d.customerConsented !== 'boolean' || typeof d.technicianConsented !== 'boolean'
    || d.financialExecution !== 'BLOCKED' || d.laborBudget !== null || d.aggregateBudgetVerified !== false || d.paymentVerified !== false) return invalid();
  let actual: DeliveryTermsState['actual'] = null;
  if (d.actual !== null) {
    const a = exact(d.actual, ['quoteVersion', 'totalShippingFee', 'customerShippingShare', 'technicianShippingShare', 'verification']);
    if (!integer(a.quoteVersion, 1, 2147483647) || a.quoteVersion !== quote.quoteVersion
      || !integer(a.totalShippingFee) || a.totalShippingFee > quote.totalShippingFee
      || !integer(a.customerShippingShare) || !integer(a.technicianShippingShare)
      || a.customerShippingShare + a.technicianShippingShare !== a.totalShippingFee
      || BigInt(a.customerShippingShare) !== (7n * BigInt(a.totalShippingFee) + 5n) / 10n
      || a.verification !== 'RECORDED_NOT_EXTERNALLY_VERIFIED') return invalid();
    actual = { quoteVersion: a.quoteVersion, totalShippingFee: a.totalShippingFee,
      customerShippingShare: a.customerShippingShare, technicianShippingShare: a.technicianShippingShare,
      verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' };
  }
  return { version: d.version, scope: 'CONDITIONAL_TERMS_ONLY', quote,
    customerConsented: d.customerConsented, technicianConsented: d.technicianConsented, actual,
    financialExecution: 'BLOCKED', laborBudget: null, aggregateBudgetVerified: false, paymentVerified: false };
}
function parseRead(value: unknown): DeliveryTermsRead {
  const d = exact(value, ['state', 'invalidated', 'financialExecution', 'laborBudget', 'aggregateBudgetVerified', 'recordedConditionalCeilings', 'blockers']);
  if (typeof d.invalidated !== 'boolean' || d.financialExecution !== 'BLOCKED' || d.laborBudget !== null
    || d.aggregateBudgetVerified !== false || !Array.isArray(d.blockers)) return invalid();
  const blockers: unknown[] = d.blockers;
  if (blockers.length !== BLOCKERS.length || !BLOCKERS.every(blocker => blockers.includes(blocker))) return invalid();
  let totals: DeliveryTermsRead['recordedConditionalCeilings'] = null;
  if (d.recordedConditionalCeilings !== null) {
    const t = exact(d.recordedConditionalCeilings, ['count', 'shipping', 'technician']);
    const money = (v: unknown) => typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v);
    if (!integer(t.count) || !money(t.shipping) || !money(t.technician)) return invalid();
    totals = { count: t.count, shipping: t.shipping as string, technician: t.technician as string };
  }
  return { state: parseState(d.state), invalidated: d.invalidated, financialExecution: 'BLOCKED', laborBudget: null,
    aggregateBudgetVerified: false, recordedConditionalCeilings: totals, blockers: [...BLOCKERS] };
}
function basePath(requestId: string): string {
  if (!UUID_V4.test(requestId)) return invalid();
  return `/part-requests/${requestId}/delivery/terms`;
}
function validateIdentity(input: DeliveryTermsIdentity) {
  if (!UUID_V4.test(input.commandId) || !integer(input.expectedVersion, 0, 2147483646)) return invalid();
}
function parseCommand(value: unknown) {
  const d = exact(envelope(value, 201), ['state', 'replayed']);
  const state = parseState(d.state);
  if (!state || typeof d.replayed !== 'boolean') return invalid();
  return { state, replayed: d.replayed };
}

export const w3DeliveryTermsApi = {
  async read(requestId: string): Promise<DeliveryTermsRead> {
    const response = await apiClient.get<unknown>(basePath(requestId));
    return parseRead(envelope(response.data, 200));
  },
  async consent(requestId: string, input: DeliveryTermsConsentInput, authoritativePartyShare: number) {
    validateIdentity(input);
    if (!integer(input.quoteVersion, 1, 2147483647) || !SHA256.test(input.quoteFingerprint)
      || !integer(input.totalShippingFee, 1) || !integer(input.shippingShare) || !integer(authoritativePartyShare)
      || input.shippingShare !== authoritativePartyShare || input.accepted !== true) return invalid();
    const response = await apiClient.post<unknown>(`${basePath(requestId)}/consent`, input);
    const result = parseCommand(response.data);
    const quote = result.state.quote;
    if (quote.quoteVersion !== input.quoteVersion || quote.fingerprint !== input.quoteFingerprint
      || quote.totalShippingFee !== input.totalShippingFee
      || ![quote.customerShippingShare, quote.technicianShippingShare].includes(input.shippingShare)) return invalid();
    return result;
  },
};
