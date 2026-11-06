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
export interface W3PolicyHistory extends Inert { drafts: W3PolicyDraft[] }
export interface W3PolicyPreview extends Inert {
  hypotheticalOnly: true;
  draftId: string;
  policyStatus: 'DRAFT';
  policyRevision: number;
  proposals: W3ImpactProposal[];
}
export type W3PolicyLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export interface W3PolicyLifecycleVersion {
  id: string;
  state: { mode: 'NON_EXECUTABLE_PREVIEW'; financialExecution: 'BLOCKED'; status: W3PolicyLifecycleStatus; revision: number; policy: W3PolicySnapshot };
  activationPreviewId?: string;
  createdAt: string;
}
interface W3PolicyActivation { scope: 'OPERATING_CONFIG_ONLY'; previewRequired: true; financialExecution: 'BLOCKED' }
export interface W3PolicyLifecycleCurrent extends Inert { activation: W3PolicyActivation; version: W3PolicyLifecycleVersion | null }
export interface W3PolicyLifecycleHistory extends Inert { activation: W3PolicyActivation; versions: W3PolicyLifecycleVersion[] }
export interface W3PolicyLifecyclePreview extends Inert {
  activation: W3PolicyActivation;
  hypotheticalOnly: true;
  preview: { id: string; draftId: string; impact: W3PolicyPreview };
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
function exactStatus<T extends { status?: number }>(response: T, expected: number): T {
  if (response.status !== expected) return invalid();
  return response;
}
function activationShape(value: unknown): W3PolicyActivation {
  const data = shape(value, ['scope', 'previewRequired', 'financialExecution']);
  if (data.scope !== 'OPERATING_CONFIG_ONLY' || data.previewRequired !== true || data.financialExecution !== 'BLOCKED') return invalid();
  return { scope: 'OPERATING_CONFIG_ONLY', previewRequired: true, financialExecution: 'BLOCKED' };
}
async function lifecycleVersion(value: unknown): Promise<W3PolicyLifecycleVersion> {
  const data = object(value);
  const allowed = ['id', 'state', 'createdAt', ...(Object.hasOwn(data, 'activationPreviewId') ? ['activationPreviewId'] : [])];
  if (Reflect.ownKeys(data).length !== allowed.length || !allowed.every(k => Object.hasOwn(data, k))) return invalid();
  const state = shape(data.state, ['mode', 'financialExecution', 'status', 'revision', 'policy']);
  if (state.mode !== 'NON_EXECUTABLE_PREVIEW' || state.financialExecution !== 'BLOCKED' || !['DRAFT', 'ACTIVE', 'RETIRED'].includes(String(state.status)) || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) return invalid();
  const policy = await snapshot(state.policy);
  const revision = integer(state.revision, 1, maxRevision);
  if (revision < policy.version) return invalid();
  const id = uuid(data.id);
  const status = state.status as W3PolicyLifecycleStatus;
  if (status === 'ACTIVE') {
    if (typeof data.activationPreviewId !== 'string' || uuid(data.activationPreviewId) !== data.activationPreviewId) return invalid();
  } else if (Object.hasOwn(data, 'activationPreviewId')) return invalid();
  return { id, state: { mode: 'NON_EXECUTABLE_PREVIEW', financialExecution: 'BLOCKED', status, revision, policy }, ...(status === 'ACTIVE' ? { activationPreviewId: data.activationPreviewId as string } : {}), createdAt: data.createdAt as string };
}
async function lifecycleBase(value: unknown, expectedStatus: number) {
  const envelope = shape(value, ['success', 'statusCode', 'message', 'data']);
  if (envelope.success !== true || envelope.statusCode !== expectedStatus || typeof envelope.message !== 'string') return invalid();
  const data = object(envelope.data);
  const safety = inert(data);
  const activation = activationShape(data.activation);
  return { data, safety, activation };
}
async function lifecyclePreviewImpact(value: unknown, bound: W3PolicyLifecycleVersion, inputs: W3ImpactSample[]): Promise<W3PolicyPreview> {
  const data = shape(value, [...inertKeys, 'policyStatus', 'policyRevision', 'proposals', 'totals', 'counts']);
  const safety = inert(data);
  if (data.policyStatus !== 'DRAFT' || data.policyRevision !== bound.state.revision || !Array.isArray(data.proposals) || data.proposals.length !== inputs.length) return invalid();
  const proposals = await Promise.all(data.proposals.map(async (value, i): Promise<W3ImpactProposal> => {
    const row = shape(value, [...sampleKeys, 'policySnapshot', 'customerShippingShare', 'technicianShippingShare', 'aboveFeeCeiling', 'proposalReviewDue', 'courierEvidenceReviewDue']);
    const echoed = sample(Object.fromEntries(sampleKeys.map(k => [k, row[k]])));
    const policySnapshot = await snapshot(row.policySnapshot);
    if (JSON.stringify(echoed) !== JSON.stringify(inputs[i]) || policySnapshot.fingerprint !== bound.state.policy.fingerprint) return invalid();
    if ((echoed.courierEvidenceAgeMinutes === null) !== (row.courierEvidenceReviewDue === null)) return invalid();
    return { ...echoed, policySnapshot, customerShippingShare: integer(row.customerShippingShare), technicianShippingShare: integer(row.technicianShippingShare), aboveFeeCeiling: bool(row.aboveFeeCeiling), proposalReviewDue: bool(row.proposalReviewDue), courierEvidenceReviewDue: row.courierEvidenceReviewDue === null ? null : bool(row.courierEvidenceReviewDue) };
  }));
  const totals = shape(data.totals, ['shippingFeeVnd', 'customerShippingShare', 'technicianShippingShare']);
  Object.values(totals).forEach(v => integer(v));
  const counts = shape(data.counts, ['proposals', 'aboveFeeCeiling', 'proposalReviewDue', 'courierEvidenceReviewDue']);
  Object.values(counts).forEach(v => integer(v, 0, inputs.length));
  if (counts.proposals !== inputs.length) return invalid();
  return { ...safety, hypotheticalOnly: true, draftId: bound.id, policyStatus: 'DRAFT', policyRevision: bound.state.revision, proposals };
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
  async history(beforeRevision?: number): Promise<W3PolicyHistory> {
    const query = beforeRevision === undefined ? {} : { beforeRevision: integer(beforeRevision, 1, maxRevision) };
    const data = shape(body((await apiClient.get<unknown>(`${base}/history`, { params: { ...query, limit: 20 } })).data), [...inertKeys, 'drafts']);
    const state = inert(data);
    if (!Array.isArray(data.drafts) || data.drafts.length > 20) return invalid();
    const drafts = await Promise.all(data.drafts.map(draft));
    let previous = beforeRevision ?? maxRevision + 1;
    const ids = new Set<string>();
    for (const row of drafts) {
      if (row.state.revision >= previous || ids.has(row.id)) return invalid();
      previous = row.state.revision; ids.add(row.id);
    }
    return { ...state, drafts };
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
  async lifecycleCurrent(): Promise<W3PolicyLifecycleCurrent> {
    const response = exactStatus(await apiClient.get<unknown>(`${base}/versions/current`), 200);
    const { data, safety, activation } = await lifecycleBase(response.data, 200);
    const result = shape(data, [...inertKeys, 'activation', 'version']);
    return { ...safety, activation, version: result.version === null ? null : await lifecycleVersion(result.version) };
  },
  async lifecycleHistory(beforeRevision?: number): Promise<W3PolicyLifecycleHistory> {
    const query = beforeRevision === undefined ? {} : { beforeRevision: integer(beforeRevision, 1, maxRevision) };
    const response = exactStatus(await apiClient.get<unknown>(`${base}/versions/history`, { params: { ...query, limit: 20 } }), 200);
    const { data, safety, activation } = await lifecycleBase(response.data, 200);
    const result = shape(data, [...inertKeys, 'activation', 'versions']);
    if (!Array.isArray(result.versions) || result.versions.length > 20) return invalid();
    const versions = await Promise.all(result.versions.map(lifecycleVersion));
    let previous = beforeRevision ?? maxRevision + 1;
    const ids = new Set<string>();
    for (const version of versions) {
      if (version.state.revision >= previous || ids.has(version.id)) return invalid();
      previous = version.state.revision; ids.add(version.id);
    }
    return { ...safety, activation, versions };
  },
  async startLifecycle(expectedRevision: number, input: W3PolicyParameters): Promise<W3PolicyLifecycleVersion> {
    integer(expectedRevision, 0, maxRevision - 1);
    const expected = parameters(input);
    const response = exactStatus(await apiClient.post<unknown>(`${base}/versions/drafts`, { expectedRevision, parameters: expected }), 201);
    const { data, safety, activation } = await lifecycleBase(response.data, 201);
    const result = shape(data, [...inertKeys, 'activation', 'version']);
    const version = await lifecycleVersion(result.version);
    if (version.state.status !== 'DRAFT' || version.state.revision !== expectedRevision + 1 || JSON.stringify(version.state.policy.parameters) !== JSON.stringify(expected) || activation.scope !== 'OPERATING_CONFIG_ONLY' || safety.financialExecution !== 'BLOCKED') return invalid();
    return version;
  },
  async reviseLifecycle(id: string, expectedRevision: number, input: W3PolicyParameters): Promise<W3PolicyLifecycleVersion> {
    uuid(id); integer(expectedRevision, 1, maxRevision - 1);
    const expected = parameters(input);
    const response = exactStatus(await apiClient.patch<unknown>(`${base}/versions/drafts/${id}`, { expectedRevision, parameters: expected }), 200);
    const { data } = await lifecycleBase(response.data, 200);
    const result = shape(data, [...inertKeys, 'activation', 'version']);
    const version = await lifecycleVersion(result.version);
    if (version.id === id || version.state.status !== 'DRAFT' || version.state.revision !== expectedRevision + 1 || JSON.stringify(version.state.policy.parameters) !== JSON.stringify(expected)) return invalid();
    return version;
  },
  async saveLifecyclePreview(inputVersion: W3PolicyLifecycleVersion, inputs: W3ImpactSample[]): Promise<W3PolicyLifecyclePreview> {
    const bound = await lifecycleVersion(inputVersion);
    const { id, state } = bound;
    const expectedRevision = state.revision;
    if (state.status !== 'DRAFT' || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) return invalid();
    const samples = inputs.map(sample);
    if (new Set(samples.map(row => row.proposalId)).size !== samples.length) return invalid();
    uuid(id); integer(expectedRevision, 1, maxRevision);
    const response = exactStatus(await apiClient.post<unknown>(`${base}/versions/${id}/preview`, { expectedRevision, samples }), 200);
    const { data, safety, activation } = await lifecycleBase(response.data, 200);
    const result = shape(data, [...inertKeys, 'activation', 'hypotheticalOnly', 'preview']);
    const receipt = shape(result.preview, ['id', 'draftId', 'impact']);
    const receiptId = uuid(receipt.id);
    if (result.hypotheticalOnly !== true || receipt.draftId !== id) return invalid();
    const impactData = object(receipt.impact);
    const safetyData = inert(impactData);
    if (impactData.policyStatus !== 'DRAFT' || impactData.policyRevision !== expectedRevision || !Array.isArray(impactData.proposals) || impactData.proposals.length !== inputs.length) return invalid();
    const impact = await lifecyclePreviewImpact({ ...safetyData, policyStatus: impactData.policyStatus, policyRevision: impactData.policyRevision,
      proposals: impactData.proposals, totals: impactData.totals, counts: impactData.counts }, bound, samples);
    if (activation.financialExecution !== 'BLOCKED' || safety.effectivePolicy !== null) return invalid();
    return { ...safety, activation, hypotheticalOnly: true, preview: { id: receiptId, draftId: id, impact } };
  },
  async activate(id: string, expectedRevision: number, previewId: string): Promise<W3PolicyLifecycleVersion> {
    uuid(id); uuid(previewId); integer(expectedRevision, 1, maxRevision - 1);
    const response = exactStatus(await apiClient.post<unknown>(`${base}/versions/${id}/activate`, { expectedRevision, previewId, acknowledged: true }), 200);
    const { data } = await lifecycleBase(response.data, 200);
    const result = shape(data, [...inertKeys, 'activation', 'version']);
    const version = await lifecycleVersion(result.version);
    if (version.id === id || version.state.status !== 'ACTIVE' || version.state.revision !== expectedRevision + 1 || version.activationPreviewId !== previewId) return invalid();
    return version;
  },
  async retire(id: string, expectedRevision: number): Promise<W3PolicyLifecycleVersion> {
    uuid(id); integer(expectedRevision, 1, maxRevision - 1);
    const response = exactStatus(await apiClient.post<unknown>(`${base}/versions/${id}/retire`, { expectedRevision }), 200);
    const { data } = await lifecycleBase(response.data, 200);
    const result = shape(data, [...inertKeys, 'activation', 'version']);
    const version = await lifecycleVersion(result.version);
    if (version.id === id || version.state.status !== 'RETIRED' || version.state.revision !== expectedRevision + 1) return invalid();
    return version;
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
