import apiClient from './client';

export interface W3PolicyParameters {
  feeCeilingVnd: number;
  proposalReviewAfterMinutes: number;
  courierEvidenceReviewAfterMinutes: number;
}
export interface W3PolicySnapshot {
  kind: 'W3_DELIVERY_OPERATING_POLICY_V1';
  policyId: 'w3-delivery-operating-policy';
  version: number;
  parameters: W3PolicyParameters;
  fingerprint: string;
}
export interface W3PolicyDraft {
  id: string;
  state: { mode: 'NON_EXECUTABLE_PREVIEW'; financialExecution: 'BLOCKED'; status: 'DRAFT'; revision: number; policy: W3PolicySnapshot };
  createdAt: string;
}
export interface W3ImpactSample {
  proposalId: string;
  proposalVersion: number;
  shippingFeeVnd: number;
  proposalAgeMinutes: number;
  courierEvidenceAgeMinutes: number | null;
}
export interface W3ImpactProposal extends W3ImpactSample {
  policySnapshot: W3PolicySnapshot;
  customerShippingShare: number;
  technicianShippingShare: number;
  aboveFeeCeiling: boolean;
  proposalReviewDue: boolean;
  courierEvidenceReviewDue: boolean | null;
}
export const W3_BLOCKERS = [
  'LEGAL_UNVERIFIED', 'ACCOUNTING_UNVERIFIED', 'WAREHOUSE_UNVERIFIED',
  'COURIER_UNVERIFIED', 'SHIPPING_APPROVAL_SOURCE_UNVERIFIED', 'FINANCE_CUTOVER_CLOSED',
] as const;
interface Inert {
  mode: 'NON_EXECUTABLE_PREVIEW'; financialExecution: 'BLOCKED'; effectivePolicy: null;
  blockers: typeof W3_BLOCKERS;
}
export interface W3PolicyCurrent extends Inert { draft: W3PolicyDraft | null }
export interface W3PolicyPreview extends Inert {
  hypotheticalOnly: true;
  draftId: string;
  policyStatus: 'DRAFT';
  policyRevision: number;
  proposals: W3ImpactProposal[];
}
const base = '/admin/w3-delivery-policy';
const maxRevision = 2147483647;
const parameterKeys = ['feeCeilingVnd', 'proposalReviewAfterMinutes', 'courierEvidenceReviewAfterMinutes'] as const;
const sampleKeys = ['proposalId', 'proposalVersion', 'shippingFeeVnd', 'proposalAgeMinutes', 'courierEvidenceAgeMinutes'] as const;
const inertKeys = ['mode', 'financialExecution', 'effectivePolicy', 'blockers'];
const invalid = (): never => { throw new Error('Chưa thể đối chiếu dữ liệu chính sách giao linh kiện. Vui lòng tải lại.'); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (!Reflect.ownKeys(value).every(k => typeof k === 'string' && descriptors[k]?.enumerable && 'value' in descriptors[k])) return invalid();
  return value as Record<string, unknown>;
}
function shape(value: unknown, keys: readonly string[]) {
  const data = object(value);
  if (Reflect.ownKeys(data).length !== keys.length || !keys.every(k => Object.hasOwn(data, k))) return invalid();
  return data;
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) return invalid();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return invalid();
  return value;
}
function reference(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_/-]{0,255}$/.test(value)) return invalid();
  return value;
}
function parameters(value: unknown): W3PolicyParameters {
  const data = shape(value, parameterKeys);
  return { feeCeilingVnd: integer(data.feeCeilingVnd), proposalReviewAfterMinutes: integer(data.proposalReviewAfterMinutes), courierEvidenceReviewAfterMinutes: integer(data.courierEvidenceReviewAfterMinutes) };
}
async function snapshot(value: unknown): Promise<W3PolicySnapshot> {
  const data = shape(value, ['kind', 'policyId', 'version', 'parameters', 'fingerprint']);
  if (data.kind !== 'W3_DELIVERY_OPERATING_POLICY_V1' || data.policyId !== 'w3-delivery-operating-policy' || typeof data.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.fingerprint)) return invalid();
  const content: Omit<W3PolicySnapshot, 'fingerprint'> = { kind: data.kind, policyId: data.policyId, version: integer(data.version, 1, maxRevision), parameters: parameters(data.parameters) };
  // Content identity only; this hash never grants approval or financial authority.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (fingerprint !== data.fingerprint) return invalid();
  return { ...content, fingerprint };
}
async function draft(value: unknown): Promise<W3PolicyDraft> {
  const data = shape(value, ['id', 'state', 'createdAt']);
  const state = shape(data.state, ['mode', 'financialExecution', 'status', 'revision', 'policy']);
  if (state.mode !== 'NON_EXECUTABLE_PREVIEW' || state.financialExecution !== 'BLOCKED' || state.status !== 'DRAFT' || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) return invalid();
  const policy = await snapshot(state.policy);
  const revision = integer(state.revision, 1, maxRevision);
  if (revision !== policy.version) return invalid();
  return { id: uuid(data.id), state: { mode: state.mode, financialExecution: state.financialExecution, status: state.status, revision, policy }, createdAt: data.createdAt };
}
function inert(data: Record<string, unknown>): Inert {
  const blockers = data.blockers;
  if (data.mode !== 'NON_EXECUTABLE_PREVIEW' || data.financialExecution !== 'BLOCKED' || data.effectivePolicy !== null || !Array.isArray(blockers) || blockers.length !== W3_BLOCKERS.length || !W3_BLOCKERS.every(k => blockers.includes(k))) return invalid();
  return { mode: data.mode, financialExecution: data.financialExecution, effectivePolicy: null, blockers: W3_BLOCKERS };
}
function body(value: unknown) {
  const envelope = object(value);
  if (envelope.success !== true || (envelope.statusCode !== 200 && envelope.statusCode !== 201) || typeof envelope.message !== 'string') return invalid();
  return envelope.data;
}
async function readCurrent(value: unknown): Promise<W3PolicyCurrent> {
  const data = shape(body(value), [...inertKeys, 'draft']);
  return { ...inert(data), draft: data.draft === null ? null : await draft(data.draft) };
}
function sample(value: unknown): W3ImpactSample {
  const data = shape(value, sampleKeys);
  return { proposalId: reference(data.proposalId), proposalVersion: integer(data.proposalVersion, 1), shippingFeeVnd: integer(data.shippingFeeVnd), proposalAgeMinutes: integer(data.proposalAgeMinutes), courierEvidenceAgeMinutes: data.courierEvidenceAgeMinutes === null ? null : integer(data.courierEvidenceAgeMinutes) };
}
function bool(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }

export const w3DeliveryPolicyApi = {
  async current(): Promise<W3PolicyCurrent> {
    return readCurrent((await apiClient.get<unknown>(`${base}/current`)).data);
  },
  async history(beforeRevision?: number): Promise<W3PolicyDraft[]> {
    const query = beforeRevision === undefined ? {} : { beforeRevision: integer(beforeRevision, 1, maxRevision) };
    const data = shape(body((await apiClient.get<unknown>(`${base}/history`, { params: { ...query, limit: 20 } })).data), [...inertKeys, 'drafts']);
    inert(data);
    if (!Array.isArray(data.drafts) || data.drafts.length > 20) return invalid();
    const drafts = await Promise.all(data.drafts.map(draft));
    let previous = beforeRevision ?? maxRevision + 1;
    const ids = new Set<string>();
    for (const row of drafts) {
      if (row.state.revision >= previous || ids.has(row.id)) return invalid();
      previous = row.state.revision; ids.add(row.id);
    }
    return drafts;
  },
  async create(input: W3PolicyParameters): Promise<W3PolicyDraft> {
    const expected = parameters(input);
    const result = await readCurrent((await apiClient.post<unknown>(`${base}/drafts`, { expectedRevision: 0, parameters: expected })).data);
    if (!result.draft || result.draft.state.revision !== 1 || JSON.stringify(result.draft.state.policy.parameters) !== JSON.stringify(expected)) return invalid();
    return result.draft;
  },
  async revise(id: string, expectedRevision: number, input: W3PolicyParameters): Promise<W3PolicyDraft> {
    uuid(id); integer(expectedRevision, 1, maxRevision - 1);
    const expected = parameters(input);
    const result = await readCurrent((await apiClient.patch<unknown>(`${base}/drafts/${id}`, { expectedRevision, parameters: expected })).data);
    if (!result.draft || result.draft.id === id || result.draft.state.revision !== expectedRevision + 1 || JSON.stringify(result.draft.state.policy.parameters) !== JSON.stringify(expected)) return invalid();
    return result.draft;
  },
  async preview(inputDraft: W3PolicyDraft, inputs: W3ImpactSample[]): Promise<W3PolicyPreview> {
    const bound = await draft(inputDraft);
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) return invalid();
    const samples = inputs.map(sample);
    if (new Set(samples.map(s => s.proposalId)).size !== samples.length) return invalid();
    const data = shape(body((await apiClient.post<unknown>(`${base}/preview`, { draftId: bound.id, expectedRevision: bound.state.revision, samples })).data), [...inertKeys, 'hypotheticalOnly', 'draftId', 'policyStatus', 'policyRevision', 'proposals', 'totals', 'counts']);
    const safety = inert(data);
    if (data.hypotheticalOnly !== true || data.draftId !== bound.id || data.policyStatus !== 'DRAFT' || data.policyRevision !== bound.state.revision || !Array.isArray(data.proposals) || data.proposals.length !== samples.length) return invalid();
    const proposals = await Promise.all(data.proposals.map(async (value, i): Promise<W3ImpactProposal> => {
      const row = shape(value, [...sampleKeys, 'policySnapshot', 'customerShippingShare', 'technicianShippingShare', 'aboveFeeCeiling', 'proposalReviewDue', 'courierEvidenceReviewDue']);
      const echoed = sample(Object.fromEntries(sampleKeys.map(k => [k, row[k]])));
      const policySnapshot = await snapshot(row.policySnapshot);
      if (JSON.stringify(echoed) !== JSON.stringify(samples[i]) || policySnapshot.fingerprint !== bound.state.policy.fingerprint) return invalid();
      if ((echoed.courierEvidenceAgeMinutes === null) !== (row.courierEvidenceReviewDue === null)) return invalid();
      return { ...echoed, policySnapshot, customerShippingShare: integer(row.customerShippingShare), technicianShippingShare: integer(row.technicianShippingShare), aboveFeeCeiling: bool(row.aboveFeeCeiling), proposalReviewDue: bool(row.proposalReviewDue), courierEvidenceReviewDue: row.courierEvidenceReviewDue === null ? null : bool(row.courierEvidenceReviewDue) };
    }));
    const totals = shape(data.totals, ['shippingFeeVnd', 'customerShippingShare', 'technicianShippingShare']);
    Object.values(totals).forEach(v => integer(v));
    const counts = shape(data.counts, ['proposals', 'aboveFeeCeiling', 'proposalReviewDue', 'courierEvidenceReviewDue']);
    Object.values(counts).forEach(v => integer(v, 0, samples.length));
    if (counts.proposals !== samples.length) return invalid();
    return { ...safety, hypotheticalOnly: true, draftId: bound.id, policyStatus: 'DRAFT', policyRevision: bound.state.revision, proposals };
  },
};
