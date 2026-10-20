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

export const partRequestsApi = {
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
