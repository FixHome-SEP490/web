// src/api/part-requests.api.ts
import apiClient, { getHttpStatus } from './client';

export type PartRequestStatus =
  | 'requested'
  | 'ready'
  | 'delivering'
  | 'received'
  | 'completed'
  | 'cancelled';

export type PartRequestType = 'pre_repair' | 'additional' | 'quotation';
export type FulfillmentMethod = 'pickup' | 'delivery';
export type PartUsageStatus = 'pending' | 'used' | 'returned';
export type PartSource = 'fixhome' | 'technician' | 'external';

export interface PartRequestItem {
  id: string;
  partRequestId: string;
  partCatalogId?: string | null;
  partSource: PartSource;
  partNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  usageStatus: PartUsageStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartRequest {
  id: string;
  serviceOrderId: string;
  technicianId: string;
  requestType: PartRequestType;
  fulfillmentMethod: FulfillmentMethod;
  status: PartRequestStatus;
  reason?: string | null;
  shippingFee: number;
  additionalCostId?: string | null;
  quotationId?: string | null;
  qrToken?: string | null;
  qrGeneratedAt?: string | null;
  receivedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  preparedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PartRequestItem[];
}

export interface CreatePartRequestPayload {
  items: Array<{
    partCatalogId: string;
    quantity: number;
    note?: string;
  }>;
  fulfillmentMethod?: FulfillmentMethod;
  reason?: string;
}

export interface ReceivePartRequestPayload {
  qrToken: string;
}

export interface UpdateItemUsagePayload {
  usageStatus: 'used' | 'returned';
  /** Only for parts enrolled in custody with an exact ledger version. */
  usedQty?: number;
  expectedVersion?: number;
  idempotencyKey?: string;
}

export interface MarkReadyPayload {
  note?: string;
}

export interface MarkDeliveringPayload {
  shippingFee?: number;
  note?: string;
}

export interface QueryPartRequestsParams {
  status?: PartRequestStatus;
  requestType?: PartRequestType;
  fulfillmentMethod?: FulfillmentMethod;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  serviceOrderId?: string;
  technicianId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * P1 parts custody (owner lock 19/10/2026): the return obligation of one
 * FixHome part line the technician received through QR handover.
 *
 * `outstandingQty` is what is still owed after the Service Manager physically
 * accepted everything received so far. A technician declaration only marks the
 * intent to hand parts back; the obligation ends when the manager accepts the
 * parts at the counter, never when the technician clicks.
 */
export interface PartCustodyReturnRecord {
  partRequestId: string;
  partRequestItemId: string;
  partNameSnapshot: string;
  issuedQty: number;
  usedQty: number;
  declaredQty: number;
  managerAcceptedQty: number;
  outstandingQty: number;
  version: number;
  trackingOnly?: boolean;
  usageRecorded?: boolean;
  /** References the Backend may attach (P1 lock contract, still being wired). */
  id?: string;
  orderId?: string;
  technicianId?: string;
  technicianName?: string | null;
}

export interface DeclareReturnPayload {
  quantity: number;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface AcceptReturnPayload {
  quantity: number;
  expectedVersion: number;
  idempotencyKey: string;
}

/**
 * One key per user action, reused only when the same action is retried after a
 * failure; the Backend rejects a key reused with a different request.
 */
export function createIdempotencyKey(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}

/**
 * The return feature is gated: with the flag off the routes are absent (404),
 * the role may not read them (403) or the environment has not enabled them
 * (501), or activation is not yet available (503). Screens then hide the return UI and keep QR/usage working.
 */
export function isPartReturnsUnavailableError(err: unknown): boolean {
  const status = getHttpStatus(err);
  return status === 403 || status === 404 || status === 501 || status === 503;
}

/**
 * Read-only Service Manager review of FixHome parts handed over before custody
 * enrollment (Backend T3b). There is no custody ledger for these rows, so the
 * receipt state is UNKNOWN: never accepted, returned or outstanding quantities.
 */
export type LegacyManualReviewKind = 'legacy_manual_review';
export type LegacyManualReviewReceiptState = 'UNKNOWN';
export type LegacyReviewStatus = 'INVESTIGATING' | 'PHYSICALLY_VERIFIED' | 'DISCREPANCY_RECORDED';
export interface LegacyManualReviewCommand {
  commandId: string;
  expectedVersion: number;
  status: LegacyReviewStatus;
  reason: string;
  evidenceReferenceId?: string;
  observedQty?: number;
  correctsEventId?: string;
  correctionReason?: string;
}
export interface LegacyManualReviewEvent extends LegacyManualReviewCommand {
  id: string;
  version: number;
  actorUserId: string;
  actorRole: 'service_manager';
  occurredAt: string;
  orderId: string;
  technicianId: string;
  partRequestId: string;
  partRequestItemId: string;
}
export interface LegacyManualReviewView {
  receiptState: 'UNKNOWN';
  manualReviewState: 'UNKNOWN' | LegacyReviewStatus;
  lastManualReview: LegacyManualReviewEvent | null;
}

export interface LegacyManualReviewRecord {
  kind: LegacyManualReviewKind;
  receiptState: LegacyManualReviewReceiptState;
  orderId: string;
  partRequestId: string;
  partRequestItemId: string;
  technicianId: string;
  requestType: PartRequestType;
  requestStatus: PartRequestStatus;
  handedOverAt: string;
  partCatalogId: string | null;
  partNameSnapshot: string;
  issuedQty: number;
  /** Absent on the T3 read-only Backend: do not enable the T11 form there. */
  manualReviewState?: LegacyManualReviewView['manualReviewState'];
  lastManualReview?: LegacyManualReviewEvent | null;
}

export interface LegacyManualReviewPage {
  data: LegacyManualReviewRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LegacyManualReviewParams {
  page?: number;
  pageSize?: number;
}

const LEGACY_MANUAL_REVIEW_PATH = '/part-returns/legacy-manual-review';
const LEGACY_MAX_PAGE = 1_000_000;
const LEGACY_MAX_PAGE_SIZE = 100;
const LEGACY_MAX_ISSUED_QTY = 1_000_000;
const LEGACY_DEFAULT_PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PART_REQUEST_TYPES: readonly PartRequestType[] = ['pre_repair', 'additional', 'quotation'];
const PART_REQUEST_STATUSES: readonly PartRequestStatus[] = [
  'requested',
  'ready',
  'delivering',
  'received',
  'completed',
  'cancelled',
];

/** The response is not the T3b contract; the screen must show an error, never an invented row. */
export class LegacyManualReviewPayloadError extends Error {
  constructor() {
    super('Dữ liệu linh kiện lịch sử không hợp lệ.');
    this.name = 'LegacyManualReviewPayloadError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function readUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new LegacyManualReviewPayloadError();
  return value;
}

function readName(value: unknown): string {
  if (typeof value !== 'string') throw new LegacyManualReviewPayloadError();
  const name = value.trim();
  if (!name || name.length > 500) throw new LegacyManualReviewPayloadError();
  return name;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new LegacyManualReviewPayloadError();
  return value as T;
}

function readHandedOverAt(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new LegacyManualReviewPayloadError();
  return value;
}

function readIssuedQty(value: unknown): number {
  const quantity = readCount(value);
  if (quantity === null || quantity < 1 || quantity > LEGACY_MAX_ISSUED_QTY) throw new LegacyManualReviewPayloadError();
  return quantity;
}

function readLegacyRecord(value: unknown): LegacyManualReviewRecord {
  if (!isRecord(value)) throw new LegacyManualReviewPayloadError();
  if (value.kind !== 'legacy_manual_review' || value.receiptState !== 'UNKNOWN') {
    throw new LegacyManualReviewPayloadError();
  }
  const row: LegacyManualReviewRecord = {
    kind: 'legacy_manual_review',
    receiptState: 'UNKNOWN',
    orderId: readUuid(value.orderId),
    partRequestId: readUuid(value.partRequestId),
    partRequestItemId: readUuid(value.partRequestItemId),
    technicianId: readUuid(value.technicianId),
    requestType: readEnum(value.requestType, PART_REQUEST_TYPES),
    requestStatus: readEnum(value.requestStatus, PART_REQUEST_STATUSES),
    handedOverAt: readHandedOverAt(value.handedOverAt),
    partCatalogId: value.partCatalogId === null ? null : readUuid(value.partCatalogId),
    partNameSnapshot: readName(value.partNameSnapshot),
    issuedQty: readIssuedQty(value.issuedQty),
  };
  if ('manualReviewState' in value || 'lastManualReview' in value) Object.assign(row, readLegacyReview(value, row));
  return row;
}

const REVIEW_STATUSES: readonly LegacyReviewStatus[] = ['INVESTIGATING', 'PHYSICALLY_VERIFIED', 'DISCREPANCY_RECORDED'];
const reviewText = (value: unknown): string => {
  if (typeof value !== 'string') throw new LegacyManualReviewPayloadError();
  const text = value.trim();
  if (text.length < 5 || text.length > 300 || /https?:\/\/|\S+@\S+|(?:\+?84|0)[\d .()-]{8,}/i.test(text)) throw new LegacyManualReviewPayloadError();
  return text;
};
/** Mirrors DTO bounds for feedback only; the SM-only Backend remains authoritative. */
export function legacyReviewCommand(input: LegacyManualReviewCommand): LegacyManualReviewCommand {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new LegacyManualReviewPayloadError();
  const command: LegacyManualReviewCommand = { commandId: readUuid(input.commandId).toLowerCase(),
    expectedVersion: input.expectedVersion, status: readEnum(input.status, REVIEW_STATUSES), reason: reviewText(input.reason) };
  if (input.evidenceReferenceId !== undefined) command.evidenceReferenceId = readUuid(input.evidenceReferenceId).toLowerCase();
  if (command.status === 'PHYSICALLY_VERIFIED' && !command.evidenceReferenceId) throw new LegacyManualReviewPayloadError();
  if (input.observedQty !== undefined) {
    if (!Number.isInteger(input.observedQty) || input.observedQty < 0 || input.observedQty > 100
      || !command.evidenceReferenceId || command.status === 'INVESTIGATING') throw new LegacyManualReviewPayloadError();
    command.observedQty = input.observedQty;
  }
  if (input.correctsEventId !== undefined || input.correctionReason !== undefined) {
    command.correctsEventId = readUuid(input.correctsEventId).toLowerCase();
    command.correctionReason = reviewText(input.correctionReason);
  }
  return command;
}
function readLegacyReview(value: unknown, source: LegacyManualReviewRecord): LegacyManualReviewView {
  if (!isRecord(value) || value.receiptState !== 'UNKNOWN') throw new LegacyManualReviewPayloadError();
  if (value.manualReviewState === 'UNKNOWN' && value.lastManualReview === null)
    return { receiptState: 'UNKNOWN', manualReviewState: 'UNKNOWN', lastManualReview: null };
  const state = readEnum(value.manualReviewState, REVIEW_STATUSES);
  const event = value.lastManualReview;
  if (!isRecord(event) || event.status !== state || event.actorRole !== 'service_manager'
    || !Number.isSafeInteger(event.version) || (event.version as number) < 1
    || event.expectedVersion !== (event.version as number) - 1
    || ['orderId', 'technicianId', 'partRequestId', 'partRequestItemId'].some(key => event[key] !== source[key as keyof LegacyManualReviewRecord])) throw new LegacyManualReviewPayloadError();
  const command = legacyReviewCommand(event as unknown as LegacyManualReviewCommand);
  return { receiptState: 'UNKNOWN', manualReviewState: state, lastManualReview: { ...command,
    id: readUuid(event.id), version: event.version as number, actorUserId: readUuid(event.actorUserId),
    actorRole: 'service_manager', occurredAt: readHandedOverAt(event.occurredAt),
    orderId: source.orderId, technicianId: source.technicianId, partRequestId: source.partRequestId, partRequestItemId: source.partRequestItemId } };
}

/** Bounded integers only, so no request value can change the fixed endpoint or inject a query. */
function safeLegacyPagination(params?: LegacyManualReviewParams): { page: number; pageSize: number } {
  const requestedPage = params?.page;
  const requestedPageSize = params?.pageSize;
  const page = typeof requestedPage === 'number' && Number.isSafeInteger(requestedPage) && requestedPage >= 1
    ? Math.min(requestedPage, LEGACY_MAX_PAGE)
    : 1;
  const pageSize = typeof requestedPageSize === 'number' && Number.isSafeInteger(requestedPageSize) && requestedPageSize >= 1
    ? Math.min(requestedPageSize, LEGACY_MAX_PAGE_SIZE)
    : LEGACY_DEFAULT_PAGE_SIZE;
  return { page, pageSize };
}

function parseLegacyPage(body: unknown, requested: { page: number; pageSize: number }): LegacyManualReviewPage {
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.meta)) {
    throw new LegacyManualReviewPayloadError();
  }
  const total = readCount(body.meta.total);
  const page = readCount(body.meta.page);
  const pageSize = readCount(body.meta.pageSize);
  if (total === null || page === null || pageSize === null) throw new LegacyManualReviewPayloadError();
  if (page < 1 || page > LEGACY_MAX_PAGE || pageSize < 1 || pageSize > LEGACY_MAX_PAGE_SIZE) {
    throw new LegacyManualReviewPayloadError();
  }
  if (total < body.data.length) throw new LegacyManualReviewPayloadError();
  if (page !== requested.page || pageSize !== requested.pageSize) throw new LegacyManualReviewPayloadError();
  return {
    data: body.data.map(readLegacyRecord),
    total,
    page,
    pageSize,
  };
}

export const partRequestsApi = {
  async reviewLegacyItem(source: LegacyManualReviewRecord, input: LegacyManualReviewCommand): Promise<LegacyManualReviewView> {
    const command = legacyReviewCommand(input);
    const response = await apiClient.post<{ data: unknown }>(`${LEGACY_MANUAL_REVIEW_PATH}/${readUuid(source.partRequestItemId)}`, command);
    const result = readLegacyReview(response.data?.data, source);
    const event = result.lastManualReview;
    if (!event || Object.entries(command).some(([key, value]) => event[key as keyof LegacyManualReviewEvent] !== value)) throw new LegacyManualReviewPayloadError();
    return result;
  },
  async regenerateQr(requestId: string): Promise<PartRequest> {
    const response = await apiClient.patch<{ data: PartRequest }>(`/part-requests/${requestId}/qr`, {});
    return response.data.data;
  },
  /**
   * Flow 1: Technician creates a Pre-Repair Parts Request
   */
  async createPreRepair(
    orderId: string,
    payload: CreatePartRequestPayload,
  ): Promise<PartRequest> {
    const res = await apiClient.post<{ data: PartRequest }>(
      `/service-orders/${orderId}/part-requests`,
      payload,
    );
    return res.data.data;
  },

  /**
   * Get all parts requests for a Service Order
   */
  async getByOrderId(orderId: string): Promise<PartRequest[]> {
    const res = await apiClient.get<{ data: PartRequest[] }>(
      `/service-orders/${orderId}/part-requests`,
    );
    return res.data.data || [];
  },

  /**
   * Technician scans QR code to receive parts
   */
  async receiveByQr(
    requestId: string,
    payload: ReceivePartRequestPayload,
  ): Promise<PartRequest> {
    const res = await apiClient.post<{ data: PartRequest }>(
      `/part-requests/${requestId}/receive`,
      payload,
    );
    return res.data.data;
  },

  /**
   * Technician updates part item usage: USED or RETURNED
   */
  async updateItemUsage(
    requestId: string,
    itemId: string,
    payload: UpdateItemUsagePayload,
  ): Promise<PartRequestItem> {
    const res = await apiClient.patch<{ data: PartRequestItem }>(
      `/part-requests/${requestId}/items/${itemId}/usage`,
      payload,
    );
    return res.data.data;
  },

  /**
   * Cancel a parts request
   */
  async cancel(requestId: string, reason?: string): Promise<PartRequest> {
    const res = await apiClient.patch<{ data: PartRequest }>(
      `/part-requests/${requestId}/cancel`,
      { reason },
    );
    return res.data.data;
  },

  /**
   * SM / Admin: Query all parts requests with pagination & filters
   */
  async getAll(
    params?: QueryPartRequestsParams,
  ): Promise<{ data: PartRequest[]; total: number }> {
    const res = await apiClient.get<{
      data: PartRequest[];
      meta: { total: number };
    }>('/part-requests', { params });
    return {
      data: res.data.data || [],
      total: res.data.meta?.total || 0,
    };
  },

  /**
   * Get single part request detail
   */
  async getById(requestId: string): Promise<PartRequest> {
    const res = await apiClient.get<{ data: PartRequest }>(
      `/part-requests/${requestId}`,
    );
    return res.data.data;
  },

  /**
   * SM marks parts request READY (generates QR code token)
   */
  async markReady(
    requestId: string,
    payload?: MarkReadyPayload,
  ): Promise<PartRequest> {
    const res = await apiClient.patch<{ data: PartRequest }>(
      `/part-requests/${requestId}/ready`,
      payload || {},
    );
    return res.data.data;
  },

  /**
   * SM marks delivery parts DELIVERING
   */
  async markDelivering(
    requestId: string,
    payload?: MarkDeliveringPayload,
  ): Promise<PartRequest> {
    const res = await apiClient.patch<{ data: PartRequest }>(
      `/part-requests/${requestId}/delivering`,
      payload || {},
    );
    return res.data.data;
  },

  /**
   * P1: FixHome part-return obligations of one service order (technician owner
   * or Service Manager). Absent while the feature flag is off.
   */
  async getReturnsByOrderId(orderId: string): Promise<PartCustodyReturnRecord[]> {
    const res = await apiClient.get<{ data: PartCustodyReturnRecord[] }>(
      `/service-orders/${orderId}/part-returns`,
    );
    return res.data.data || [];
  },

  /**
   * P1: manager queue of technician declarations waiting for the physical
   * check at the counter; oldest first.
   */
  async getPendingReturns(): Promise<PartCustodyReturnRecord[]> {
    const res = await apiClient.get<{ data: PartCustodyReturnRecord[] }>(
      '/part-returns/pending',
    );
    return res.data.data || [];
  },

  /**
   * Service Manager only: legacy FixHome handovers without a custody ledger.
   * Read-only; every row is UNKNOWN, so no accept or discrepancy action exists.
   */
  async getLegacyManualReview(params?: LegacyManualReviewParams): Promise<LegacyManualReviewPage> {
    const safe = safeLegacyPagination(params);
    const res = await apiClient.get<unknown>(LEGACY_MANUAL_REVIEW_PATH, {
      params: { page: safe.page, pageSize: safe.pageSize },
    });
    return parseLegacyPage(res.data, safe);
  },

  /**
   * P1: the technician declares unused quantity. This is never a completed
   * return: the Service Manager still has to accept the parts physically.
   */
  async declareReturn(
    requestId: string,
    itemId: string,
    payload: DeclareReturnPayload,
  ): Promise<PartCustodyReturnRecord | null> {
    const res = await apiClient.post<{ data?: PartCustodyReturnRecord | null }>(
      `/part-requests/${requestId}/items/${itemId}/declare-return`,
      payload,
    );
    return res.data.data ?? null;
  },

  /**
   * P1: the Service Manager records the quantity physically received. A
   * quantity smaller than declared leaves the remainder outstanding.
   */
  async acceptReturn(
    requestId: string,
    itemId: string,
    payload: AcceptReturnPayload,
  ): Promise<PartCustodyReturnRecord | null> {
    const res = await apiClient.post<{ data?: PartCustodyReturnRecord | null }>(
      `/part-requests/${requestId}/items/${itemId}/accept-return`,
      payload,
    );
    return res.data.data ?? null;
  },
};
