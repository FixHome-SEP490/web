// src/api/part-requests.api.ts
import apiClient from './client';

export type PartRequestStatus =
  | 'requested'
  | 'ready'
  | 'delivering'
  | 'received'
  | 'completed'
  | 'cancelled';

export type PartRequestType = 'pre_repair' | 'additional';
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
  status?: string;
  serviceOrderId?: string;
  technicianId?: string;
  page?: number;
  pageSize?: number;
}

export const partRequestsApi = {
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
};
