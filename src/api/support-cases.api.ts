import apiClient from './client';
import type { PaginationMeta } from '../types';

export type SupportCaseType =
  | 'matching_exhausted'
  | 'arrival_abnormal'
  | 'cash_non_response'
  | 'cash_mismatch'
  | 'cancellation_review'
  | 'parts_dispute'
  | 'warranty_dispute'
  | 'mid_job_interruption'
  | 'property_damage'
  | 'quality'
  | 'pricing_dispute'
  | 'conduct'
  | 'other'
  | 'technician_replacement';

export type SupportCaseStatus = 'open' | 'in_review' | 'resolved' | 'rejected';
export type SupportCaseFinalStatus = 'resolved' | 'rejected';
export type SupportCaseRequestIntent = 'stop_or_replace';

export interface SupportCaseSummary {
  id: string;
  caseType: SupportCaseType;
  status: SupportCaseStatus;
  bookingId?: string | null;
  serviceOrderId?: string | null;
  customerId?: string | null;
  technicianId?: string | null;
  createdByUserId?: string | null;
  assignedManagerId?: string | null;
  reason: string;
  description?: string | null;
  resolutionCode?: string | null;
  resolutionReason?: string | null;
  evidenceRefs?: string[] | null;
  resolvedAt?: string | null;
  isUrgent?: boolean;
  respondBy?: string | null;
  holdCompletion?: boolean;
  requestIntent?: SupportCaseRequestIntent | null;
  workflowVersion?: number;
  liableParty?: string | null;
  amount?: number | null;
  voucherGrossRefundVnd?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MySupportCase {
  id: string;
  caseType: SupportCaseType;
  status: SupportCaseStatus;
  bookingId: string | null;
  serviceOrderId: string | null;
  reason: string;
  description: string | null;
  resolutionReason: string | null;
  resolutionCode: string | null;
  evidenceRefs: string[] | null;
  isUrgent: boolean;
  respondBy: string | null;
  holdCompletion: boolean;
  requestIntent: SupportCaseRequestIntent | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportCasePayload {
  caseType: SupportCaseType;
  reason: string;
  description?: string;
  evidenceRefs?: string[];
  bookingId?: string;
  serviceOrderId?: string;
  isUrgent?: boolean;
}

export interface MySupportCaseQuery {
  page?: number;
  limit?: number;
  status?: SupportCaseStatus;
  serviceOrderId?: string;
}

export interface SupportBookingContext {
  id: string;
  status: string;
  customerId: string;
  serviceId: string;
}

export interface SupportServiceOrderContext {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
}

export interface SupportInvoiceContext {
  id: string;
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  paymentStatus: string;
  issuedAt: string;
  paidAt?: string | null;
}

export interface SupportCashSettlementContext {
  id: string;
  status: string;
  declaredAmount: number;
  confirmedAmount?: number | null;
  declaredAt: string;
  confirmedAt?: string | null;
  technicianNotes?: string | null;
  receiptEvidenceUrl?: string | null;
}

export interface SupportCaseDetail extends SupportCaseSummary {
  booking?: SupportBookingContext | null;
  serviceOrder?: SupportServiceOrderContext | null;
  invoice?: SupportInvoiceContext | null;
  cashSettlement?: SupportCashSettlementContext | null;
}

export interface SupportCaseQuery {
  page?: number;
  limit?: number;
  caseType?: SupportCaseType;
  status?: SupportCaseStatus;
  bookingId?: string;
  serviceOrderId?: string;
  assignedManagerId?: string;
  search?: string;
  sort?: 'newest' | 'priority';
}

export interface SupportCaseResolvePayload {
  finalStatus: SupportCaseFinalStatus;
  resolutionCode: string;
  reason: string;
  evidenceRefs?: string[];
  liableParty?: 'technician' | 'customer' | 'platform' | 'shared';
  amount?: number;
  /** Original-gross funding basis; amount remains customer NET. */
  grossRefundVnd?: number;
}

export type InterruptionAction = 'DIRECT_REASSIGN_SOLO' | 'CLOSE_FOR_REBOOK' | 'REJECT_REQUEST';
export interface InterruptionDecision {
  allowed: boolean;
  reasons: string[];
}
export interface ReplacementOptions {
  caseId: string;
  caseStatus: SupportCaseStatus;
  caseVersion: number;
  serviceOrderId: string;
  visitGroupId: string | null;
  requestIntent: SupportCaseRequestIntent | null;
  flags: {
    approvedQuote: boolean;
    invoice: boolean;
    payment: boolean;
    voucher: boolean;
    parts: boolean;
    incompleteSiblings: boolean;
  };
  actions: Record<InterruptionAction, InterruptionDecision>;
}
export interface ResolveInterruptionPayload {
  commandId: string;
  expectedCaseVersion: number;
  action: InterruptionAction;
  reason: string;
  technicianId?: string;
}
export interface ResolveInterruptionResult {
  case: SupportCaseDetail;
  order: { id: string; status: string };
  nextAction: 'none' | 'interruption_rebook';
}

export interface SupportCaseListResponse {
  data: SupportCaseSummary[];
  meta: PaginationMeta;
}

const CASE_TYPES: readonly SupportCaseType[] = [
  'matching_exhausted',
  'arrival_abnormal',
  'cash_non_response',
  'cash_mismatch',
  'cancellation_review',
  'parts_dispute',
  'warranty_dispute',
  'mid_job_interruption',
  'property_damage',
  'quality',
  'pricing_dispute',
  'conduct',
  'other',
  'technician_replacement',
];

const CASE_STATUSES: readonly SupportCaseStatus[] = ['open', 'in_review', 'resolved', 'rejected'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new Error(message);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(message);
  return value.trim();
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  message: string,
): string | null | undefined {
  if (!(key in source) || source[key] === undefined) return undefined;
  if (source[key] === null) return null;
  return requiredString(source[key], message);
}

function finiteNumber(value: unknown, message: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) invalid(message);
  return number;
}

function optionalNumber(
  source: Record<string, unknown>,
  key: string,
  message: string,
): number | null | undefined {
  if (!(key in source) || source[key] === undefined) return undefined;
  if (source[key] === null) return null;
  return finiteNumber(source[key], message);
}

function normalizeEvidenceRefs(
  source: Record<string, unknown>,
  message: string,
): string[] | null | undefined {
  if (!('evidenceRefs' in source) || source.evidenceRefs === undefined) return undefined;
  if (source.evidenceRefs === null) return null;
  if (
    !Array.isArray(source.evidenceRefs) ||
    source.evidenceRefs.length > 20 ||
    source.evidenceRefs.some((ref) => typeof ref !== 'string' || ref.length > 500)
  ) {
    invalid(message);
  }
  return source.evidenceRefs.map((ref) => String(ref));
}

function normalizeSummary(payload: unknown): SupportCaseSummary {
  if (!isRecord(payload)) invalid('Backend returned an invalid support case response.');

  const caseType = payload.caseType;
  const status = payload.status;
  if (!CASE_TYPES.includes(caseType as SupportCaseType)) {
    invalid('Backend returned an unsupported support case type.');
  }
  if (!CASE_STATUSES.includes(status as SupportCaseStatus)) {
    invalid('Backend returned an unsupported support case status.');
  }
  if (payload.requestIntent != null && payload.requestIntent !== 'stop_or_replace') {
    invalid('Backend returned an unsupported support case request intent.');
  }
  const workflowVersion = payload.workflowVersion;
  if (workflowVersion !== undefined && (!Number.isSafeInteger(workflowVersion) || (workflowVersion as number) < 0)) {
    invalid('Backend returned an invalid support case workflow version.');
  }

  return {
    id: requiredString(payload.id, 'Backend returned an invalid support case response.'),
    caseType: caseType as SupportCaseType,
    status: status as SupportCaseStatus,
    bookingId: optionalString(payload, 'bookingId', 'Backend returned an invalid support case response.'),
    serviceOrderId: optionalString(payload, 'serviceOrderId', 'Backend returned an invalid support case response.'),
    customerId: optionalString(payload, 'customerId', 'Backend returned an invalid support case response.'),
    technicianId: optionalString(payload, 'technicianId', 'Backend returned an invalid support case response.'),
    createdByUserId: optionalString(payload, 'createdByUserId', 'Backend returned an invalid support case response.'),
    assignedManagerId: optionalString(payload, 'assignedManagerId', 'Backend returned an invalid support case response.'),
    reason: requiredString(payload.reason, 'Backend returned an invalid support case response.'),
    description: optionalString(payload, 'description', 'Backend returned an invalid support case response.'),
    resolutionCode: optionalString(payload, 'resolutionCode', 'Backend returned an invalid support case response.'),
    resolutionReason: optionalString(payload, 'resolutionReason', 'Backend returned an invalid support case response.'),
    evidenceRefs: normalizeEvidenceRefs(
      payload,
      'Backend returned invalid support case evidence references.',
    ),
    resolvedAt: optionalString(payload, 'resolvedAt', 'Backend returned an invalid support case response.'),
    isUrgent: payload.isUrgent === true,
    respondBy: optionalString(payload, 'respondBy', 'Backend returned an invalid support case response.'),
    holdCompletion: payload.holdCompletion === true,
    requestIntent: payload.requestIntent == null ? null : payload.requestIntent as SupportCaseRequestIntent,
    ...(workflowVersion !== undefined ? { workflowVersion: workflowVersion as number } : {}),
    liableParty: optionalString(payload, 'liableParty', 'Backend returned an invalid support case response.'),
    amount: optionalNumber(payload, 'amount', 'Backend returned an invalid support case response.'),
    voucherGrossRefundVnd: optionalNumber(payload, 'voucherGrossRefundVnd', 'Invalid voucher refund source.'),
    createdAt: requiredString(payload.createdAt, 'Backend returned an invalid support case response.'),
    updatedAt: requiredString(payload.updatedAt, 'Backend returned an invalid support case response.'),
  };
}

function normalizeMine(payload: unknown): MySupportCase {
  const base = normalizeSummary(payload);
  return {
    id: base.id,
    caseType: base.caseType,
    status: base.status,
    bookingId: base.bookingId ?? null,
    serviceOrderId: base.serviceOrderId ?? null,
    reason: base.reason,
    description: base.description ?? null,
    resolutionReason: base.resolutionReason ?? null,
    resolutionCode: base.resolutionCode ?? null,
    evidenceRefs: base.evidenceRefs ?? null,
    isUrgent: base.isUrgent === true,
    respondBy: base.respondBy ?? null,
    holdCompletion: base.holdCompletion === true,
    requestIntent: base.requestIntent ?? null,
    resolvedAt: base.resolvedAt ?? null,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };
}

function normalizeNullableContext<T>(
  source: Record<string, unknown>,
  key: string,
  normalize: (value: unknown) => T,
): T | null | undefined {
  if (!(key in source) || source[key] === undefined) return undefined;
  if (source[key] === null) return null;
  return normalize(source[key]);
}

function normalizeBookingContext(payload: unknown): SupportBookingContext {
  if (!isRecord(payload)) invalid('Backend returned an invalid support booking context.');
  return {
    id: requiredString(payload.id, 'Backend returned an invalid support booking context.'),
    status: requiredString(payload.status, 'Backend returned an invalid support booking context.'),
    customerId: requiredString(payload.customerId, 'Backend returned an invalid support booking context.'),
    serviceId: requiredString(payload.serviceId, 'Backend returned an invalid support booking context.'),
  };
}

function normalizeServiceOrderContext(payload: unknown): SupportServiceOrderContext {
  if (!isRecord(payload)) invalid('Backend returned an invalid support service order context.');
  return {
    id: requiredString(payload.id, 'Backend returned an invalid support service order context.'),
    code: requiredString(payload.code, 'Backend returned an invalid support service order context.'),
    status: requiredString(payload.status, 'Backend returned an invalid support service order context.'),
    paymentStatus: requiredString(
      payload.paymentStatus,
      'Backend returned an invalid support service order context.',
    ),
    laborTotal: finiteNumber(payload.laborTotal, 'Backend returned an invalid support service order context.'),
    partsTotal: finiteNumber(payload.partsTotal, 'Backend returned an invalid support service order context.'),
    grandTotal: finiteNumber(payload.grandTotal, 'Backend returned an invalid support service order context.'),
  };
}

function normalizeInvoiceContext(payload: unknown): SupportInvoiceContext {
  if (!isRecord(payload)) invalid('Backend returned an invalid support invoice context.');
  return {
    id: requiredString(payload.id, 'Backend returned an invalid support invoice context.'),
    laborTotal: finiteNumber(payload.laborTotal, 'Backend returned an invalid support invoice context.'),
    partsTotal: finiteNumber(payload.partsTotal, 'Backend returned an invalid support invoice context.'),
    grandTotal: finiteNumber(payload.grandTotal, 'Backend returned an invalid support invoice context.'),
    paymentStatus: requiredString(payload.paymentStatus, 'Backend returned an invalid support invoice context.'),
    issuedAt: requiredString(payload.issuedAt, 'Backend returned an invalid support invoice context.'),
    paidAt: optionalString(payload, 'paidAt', 'Backend returned an invalid support invoice context.'),
  };
}

function normalizeCashSettlementContext(payload: unknown): SupportCashSettlementContext {
  if (!isRecord(payload)) invalid('Backend returned an invalid support cash settlement context.');
  return {
    id: requiredString(payload.id, 'Backend returned an invalid support cash settlement context.'),
    status: requiredString(payload.status, 'Backend returned an invalid support cash settlement context.'),
    declaredAmount: finiteNumber(
      payload.declaredAmount,
      'Backend returned an invalid support cash settlement context.',
    ),
    confirmedAmount: optionalNumber(
      payload,
      'confirmedAmount',
      'Backend returned an invalid support cash settlement context.',
    ),
    declaredAt: requiredString(payload.declaredAt, 'Backend returned an invalid support cash settlement context.'),
    confirmedAt: optionalString(payload, 'confirmedAt', 'Backend returned an invalid support cash settlement context.'),
    technicianNotes: optionalString(
      payload,
      'technicianNotes',
      'Backend returned an invalid support cash settlement context.',
    ),
    receiptEvidenceUrl: optionalString(
      payload,
      'receiptEvidenceUrl',
      'Backend returned an invalid support cash settlement context.',
    ),
  };
}

function normalizeDetail(payload: unknown): SupportCaseDetail {
  if (!isRecord(payload)) invalid('Backend returned an invalid support case response.');
  const summary = normalizeSummary(payload);
  return {
    ...summary,
    booking: normalizeNullableContext(payload, 'booking', normalizeBookingContext),
    serviceOrder: normalizeNullableContext(payload, 'serviceOrder', normalizeServiceOrderContext),
    invoice: normalizeNullableContext(payload, 'invoice', normalizeInvoiceContext),
    cashSettlement: normalizeNullableContext(payload, 'cashSettlement', normalizeCashSettlementContext),
  };
}

function normalizeReplacementOptions(payload: unknown): ReplacementOptions {
  if (!isRecord(payload) || !isRecord(payload.flags) || !isRecord(payload.actions)
    || !CASE_STATUSES.includes(payload.caseStatus as SupportCaseStatus)
    || !Number.isSafeInteger(payload.caseVersion) || (payload.caseVersion as number) < 0
    || (payload.requestIntent != null && payload.requestIntent !== 'stop_or_replace')) {
    invalid('Backend returned invalid replacement options.');
  }
  const flags = payload.flags;
  const actions = payload.actions;
  const flagNames = ['approvedQuote', 'invoice', 'payment', 'voucher', 'parts', 'incompleteSiblings'] as const;
  const actionNames: InterruptionAction[] = ['DIRECT_REASSIGN_SOLO', 'CLOSE_FOR_REBOOK', 'REJECT_REQUEST'];
  if (flagNames.some(name => typeof flags[name] !== 'boolean')) invalid('Backend returned invalid replacement flags.');
  for (const name of actionNames) {
    const action = actions[name];
    if (!isRecord(action) || typeof action.allowed !== 'boolean' || !Array.isArray(action.reasons)
      || action.reasons.some(reason => typeof reason !== 'string')) invalid('Backend returned invalid replacement actions.');
  }
  const visitGroupId = payload.visitGroupId;
  if (visitGroupId !== null && (typeof visitGroupId !== 'string' || !visitGroupId.trim())) invalid('Backend returned invalid replacement options.');
  return {
    caseId: requiredString(payload.caseId, 'Backend returned invalid replacement options.'),
    caseStatus: payload.caseStatus as SupportCaseStatus,
    caseVersion: payload.caseVersion as number,
    serviceOrderId: requiredString(payload.serviceOrderId, 'Backend returned invalid replacement options.'),
    visitGroupId: visitGroupId as string | null,
    requestIntent: payload.requestIntent == null ? null : payload.requestIntent as SupportCaseRequestIntent,
    flags: Object.fromEntries(flagNames.map(name => [name, flags[name]])) as ReplacementOptions['flags'],
    actions: Object.fromEntries(actionNames.map(name => [name, {
      allowed: (actions[name] as Record<string, unknown>).allowed,
      reasons: [...(actions[name] as { reasons: string[] }).reasons],
    }])) as Record<InterruptionAction, InterruptionDecision>,
  };
}

function normalizeInterruptionResult(payload: unknown): ResolveInterruptionResult {
  if (!isRecord(payload) || !isRecord(payload.order) || !['none', 'interruption_rebook'].includes(String(payload.nextAction))) {
    invalid('Backend returned an invalid interruption result.');
  }
  const order = {
    id: requiredString(payload.order.id, 'Backend returned an invalid interruption result.'),
    status: requiredString(payload.order.status, 'Backend returned an invalid interruption result.'),
  };
  return { case: normalizeDetail(payload.case), order, nextAction: payload.nextAction as ResolveInterruptionResult['nextAction'] };
}

function unwrapEnvelope(payload: unknown, message: string): { data: unknown; meta?: unknown } {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    typeof payload.statusCode !== 'number' ||
    !Number.isInteger(payload.statusCode) ||
    typeof payload.message !== 'string' ||
    !('data' in payload)
  ) {
    invalid(message);
  }
  return { data: payload.data, meta: payload.meta };
}

function normalizePagination(payload: unknown): PaginationMeta {
  if (!isRecord(payload)) invalid('Backend returned an invalid support case pagination meta.');
  const page = payload.page;
  const limit = payload.limit;
  const total = payload.total;
  const totalPages = payload.totalPages;
  if (
    ![page, limit, total, totalPages].every((value) => typeof value === 'number' && Number.isInteger(value)) ||
    (page as number) < 1 ||
    (limit as number) < 1 ||
    (total as number) < 0 ||
    (totalPages as number) < 0
  ) {
    invalid('Backend returned an invalid support case pagination meta.');
  }
  return { page, limit, total, totalPages } as PaginationMeta;
}

function normalizeQuery(query: SupportCaseQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const key of [
    'page',
    'limit',
    'caseType',
    'status',
    'bookingId',
    'serviceOrderId',
    'assignedManagerId',
    'search',
    'sort',
  ] as const) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') params[key] = value;
  }
  return params;
}

function assertId(id: string): string {
  return requiredString(id, 'A support case id is required.');
}

function assertResolvePayload(payload: SupportCaseResolvePayload): void {
  const keys = Object.keys(payload);
  if (
    keys.some((key) => !['finalStatus', 'resolutionCode', 'reason', 'evidenceRefs', 'liableParty', 'amount', 'grossRefundVnd'].includes(key)) ||
    (payload.amount !== undefined && (!Number.isSafeInteger(payload.amount) || payload.amount < 0 || payload.amount > 2_000_000_000)) ||
    (payload.grossRefundVnd !== undefined && (!Number.isSafeInteger(payload.grossRefundVnd) || payload.grossRefundVnd <= 0 || payload.grossRefundVnd > 2_000_000_000 || payload.resolutionCode !== 'refund_to_wallet' || payload.finalStatus !== 'resolved')) ||
    !['resolved', 'rejected'].includes(payload.finalStatus) ||
    !payload.resolutionCode.trim() ||
    payload.resolutionCode.length > 128 ||
    payload.reason.trim().length < 10 ||
    payload.reason.length > 2000 ||
    (payload.evidenceRefs !== undefined &&
      (!Array.isArray(payload.evidenceRefs) ||
        payload.evidenceRefs.length > 20 ||
        payload.evidenceRefs.some((ref) => typeof ref !== 'string' || ref.length > 500)))
  ) {
    invalid('Invalid support case resolve payload.');
  }
}

export const supportCasesApi = {
  async listCases(query: SupportCaseQuery = {}): Promise<SupportCaseListResponse> {
    const response = await apiClient.get<unknown>('/support/cases', { params: normalizeQuery(query) });
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case list response.');
    if (!Array.isArray(envelope.data) || envelope.meta === undefined) {
      invalid('Backend returned an invalid support case list response.');
    }
    return {
      data: envelope.data.map(normalizeSummary),
      meta: normalizePagination(envelope.meta),
    };
  },

  async getCase(id: string): Promise<SupportCaseDetail> {
    const response = await apiClient.get<unknown>(`/support/cases/${encodeURIComponent(assertId(id))}`);
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case detail response.');
    return normalizeDetail(envelope.data);
  },

  async replacementOptions(id: string): Promise<ReplacementOptions> {
    const caseId = assertId(id);
    const response = await apiClient.get<unknown>(`/support/cases/${encodeURIComponent(caseId)}/replacement-options`);
    const envelope = unwrapEnvelope(response.data, 'Backend returned invalid replacement options.');
    const result = normalizeReplacementOptions(envelope.data);
    if (result.caseId !== caseId) invalid('Backend returned replacement options for another case.');
    return result;
  },

  async resolveInterruption(id: string, payload: ResolveInterruptionPayload): Promise<ResolveInterruptionResult> {
    const caseId = assertId(id);
    const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
    const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const actions: InterruptionAction[] = ['DIRECT_REASSIGN_SOLO', 'CLOSE_FOR_REBOOK', 'REJECT_REQUEST'];
    if (!uuid(payload?.commandId) || !Number.isSafeInteger(payload.expectedCaseVersion) || payload.expectedCaseVersion < 0
      || !actions.includes(payload.action) || reason.length < 10 || reason.length > 2000
      || (payload.action === 'DIRECT_REASSIGN_SOLO' ? !uuid(payload.technicianId) : payload.technicianId !== undefined)) {
      invalid('Invalid interruption command.');
    }
    const command = { ...payload, reason };
    const response = await apiClient.post<unknown>(`/support/cases/${encodeURIComponent(caseId)}/resolve-interruption`, command);
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid interruption result.');
    return normalizeInterruptionResult(envelope.data);
  },

  async createCase(payload: CreateSupportCasePayload): Promise<MySupportCase> {
    const response = await apiClient.post<unknown>('/support/cases', payload);
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case create response.');
    return normalizeMine(envelope.data);
  },

  async requestStopOrReplace(orderId: string, reason: string): Promise<MySupportCase> {
    const id = assertId(orderId);
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (text.length < 10 || text.length > 2000) invalid('Invalid stop-or-replace request reason.');
    const response = await apiClient.post<unknown>(`/service-orders/${encodeURIComponent(id)}/stop-replace-request`, { reason: text });
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid stop-or-replace request response.');
    const result = normalizeMine(envelope.data);
    if (result.serviceOrderId !== id || result.caseType !== 'mid_job_interruption'
      || result.requestIntent !== 'stop_or_replace' || !result.holdCompletion) {
      invalid('Backend returned an invalid stop-or-replace request result.');
    }
    return result;
  },

  async listMine(query: MySupportCaseQuery = {}): Promise<{ data: MySupportCase[]; meta: PaginationMeta }> {
    const params: Record<string, unknown> = {};
    for (const key of ['page', 'limit', 'status', 'serviceOrderId'] as const) {
      const value = query[key];
      if (value !== undefined && value !== null && value !== '') params[key] = value;
    }
    const response = await apiClient.get<unknown>('/support/cases/mine', { params });
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case list response.');
    if (!Array.isArray(envelope.data) || envelope.meta === undefined) {
      invalid('Backend returned an invalid support case list response.');
    }
    return { data: envelope.data.map(normalizeMine), meta: normalizePagination(envelope.meta) };
  },

  async getMine(id: string): Promise<MySupportCase> {
    const response = await apiClient.get<unknown>(`/support/cases/mine/${encodeURIComponent(assertId(id))}`);
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case detail response.');
    return normalizeMine(envelope.data);
  },

  async startReview(id: string): Promise<SupportCaseDetail> {
    const response = await apiClient.post<unknown>(`/support/cases/${encodeURIComponent(assertId(id))}/review`);
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case review response.');
    return normalizeDetail(envelope.data);
  },

  async setHold(id: string, hold: boolean): Promise<SupportCaseDetail> {
    const response = await apiClient.post<unknown>(`/support/cases/${encodeURIComponent(assertId(id))}/hold`, { hold });
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case hold response.');
    return normalizeDetail(envelope.data);
  },

  async resolveCase(id: string, payload: SupportCaseResolvePayload): Promise<SupportCaseDetail> {
    assertResolvePayload(payload);
    const response = await apiClient.post<unknown>(
      `/support/cases/${encodeURIComponent(assertId(id))}/resolve`,
      payload,
    );
    const envelope = unwrapEnvelope(response.data, 'Backend returned an invalid support case resolve response.');
    return normalizeDetail(envelope.data);
  },
};
