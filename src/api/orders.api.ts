// src/api/orders.api.ts
import apiClient from './client';

export type CanonicalOrderStatus =
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'UNDER_REPAIR'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'accepted'
  | 'en_route'
  | 'under_repair'
  | 'completed'
  | 'cancelled'
  | 'ARRIVED' // UI transitional alias
  | 'IN_PROGRESS'; // UI transitional alias

export interface HistoricalOrderItem {
  id: string;
  code: string;
  status: CanonicalOrderStatus;
  createdAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  historical: true;
}

export type TechnicianOrderItem = ServiceOrderItem | HistoricalOrderItem;
export const isHistoricalOrder = (order: TechnicianOrderItem): order is HistoricalOrderItem =>
  (order as HistoricalOrderItem).historical === true;
export interface ServiceOrderItem {
  arrivalVerified?: boolean;
  beforeEvidenceCount?: number;
  afterEvidenceCount?: number;
  completionRequestedAt?: string;
  customerConfirmed?: boolean;
  pricingMode?: string;
  fixedUnitPrice?: number | null;
  quantity?: number;
  scopeDescription?: string;
  id: string;
  code: string;
  bookingId: string;
  serviceName: string;
  status: CanonicalOrderStatus;
  customerName: string;
  customerPhone: string;
  addressSummary: string;
  scheduledAt: string;
  destination?: { lat: number; lng: number } | null;
  technicianLocation?: { lat: number; lng: number; updatedAt: string | null } | null;
  technician?: {
    id: string;
    fullName: string;
    phoneNumber: string;
    avatarUrl?: string;
    averageRating: number;
  };
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED' | 'unpaid' | 'paid' | 'refunded';
  createdAt: string;
  timeline?: {
    status: string;
    title: string;
    timestamp: string;
    actor: string;
  }[];
  quotation?: {
    id: string;
    status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'approved' | 'draft' | 'pending';
    laborTotal: number;
    partsTotal: number;
    items: {
      type: 'LABOR' | 'PARTS';
      description: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      warrantyDays?: number;
    }[];
  };
  cashSettlement?: {
    id: string;
    declaredAmount: number;
    confirmedAmount?: number;
    status: 'pending_confirmation' | 'confirmed' | 'disputed';
    technicianNotes?: string;
  };
}

export interface PublicTrackResult {
  code: string;
  status: CanonicalOrderStatus;
  serviceName?: string;
  technician?: { fullName: string; phoneNumber: string };
  destination?: { lat: number; lng: number } | null;
  technicianLocation?: { lat: number; lng: number; updatedAt: string | null } | null;
  timeline: { status: string; timestamp: string }[];
}

export interface AdditionalCostRecord {
  id: string;
  serviceOrderId: string;
  technicianId: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  reason: string;
  totalLaborDelta: number;
  totalPartsDelta: number;
  expiresAt: string;
  decidedAt?: string | null;
  supersedesId?: string | null;
  evidenceUrls?: string[] | null;
  createdAt: string;
  items: {
    id: string;
    type: 'LABOR' | 'PARTS_EQUIPMENT';
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

export interface CancellationRecord {
  id: string;
  serviceOrderId: string;
  actor: 'CUSTOMER' | 'TECHNICIAN' | 'customer' | 'technician';
  actorUserId: string;
  reason: string;
  stateAtCancel: string;
  strikeApplied: boolean;
  compensationStatus: string;
  reviewedByUserId?: string | null;
  createdAt: string;
}

export interface StrikeRecord {
  id: string;
  userId: string;
  cancellationId: string;
  status: 'ACTIVE' | 'WAIVED' | 'active' | 'waived';
  waivedByUserId?: string | null;
  waiveReason?: string | null;
  createdAt: string;
}

export interface WarrantyItem {
  id: string;
  orderCode: string;
  serviceName: string;
  itemDescription: string;
  startsAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CLAIMED';
  technicianName: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  message?: string;
  statusCode?: number;
}

export interface QuotationItemPayload {
  type: 'LABOR' | 'PARTS';
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  warrantyDays?: number;
  partSource?: 'fixhome' | 'technician';
  partCatalogId?: string;
  partWarrantyOption?: 'included' | 'no_warranty' | 'paid_warranty';
  warrantyFee?: number;
  warrantyTermDays?: number;
}

function normalizeOrder(order: ServiceOrderItem): ServiceOrderItem {
  return { ...order, status: order.status.toUpperCase() as CanonicalOrderStatus,
    paymentStatus: order.paymentStatus.toUpperCase() as ServiceOrderItem['paymentStatus'],
    laborTotal: Number(order.laborTotal), partsTotal: Number(order.partsTotal), grandTotal: Number(order.grandTotal),
    quotation: order.quotation ? { ...order.quotation,
      items: order.quotation.items.map(item => ({ ...item,
        type: String(item.type).toLowerCase() === 'labor' ? 'LABOR' : 'PARTS',
        quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal),
      })),
    } : undefined,
  };
}

function normalizeTechnicianOrder(order: TechnicianOrderItem): TechnicianOrderItem {
  if (isHistoricalOrder(order)) {
    // Fail closed: return only the history allowlist, even if an API adds fields unexpectedly.
    return {
      id: order.id, code: order.code,
      status: String(order.status).toUpperCase() as CanonicalOrderStatus,
      createdAt: order.createdAt, completedAt: order.completedAt ?? null,
      cancelledAt: order.cancelledAt ?? null, historical: true,
    };
  }
  return normalizeOrder(order);
}
function normalizeAdditionalCost(rec: AdditionalCostRecord): AdditionalCostRecord {
  return {
    ...rec,
    status: String(rec.status).toUpperCase() as AdditionalCostRecord['status'],
    totalLaborDelta: Number(rec.totalLaborDelta),
    totalPartsDelta: Number(rec.totalPartsDelta),
    items: rec.items.map((item) => ({
      ...item,
      type: String(item.type).toLowerCase() === 'labor' ? 'LABOR' : 'PARTS_EQUIPMENT',
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
  };
}

export const ordersApi = {
  // ── Queries ──

  async getCustomerOrders(): Promise<ServiceOrderItem[]> { const res = await apiClient.get<{data: ServiceOrderItem[]}>('/service-orders/my'); return res.data.data.map(normalizeOrder); },

  async getCustomerOrdersPaged(page: number, pageSize: number): Promise<{ data: ServiceOrderItem[]; total: number }> {
    const res = await apiClient.get<{ data: ServiceOrderItem[]; meta: { total: number } }>('/service-orders/my', { params: { page, pageSize } });
    if (typeof res.data.meta?.total !== 'number') {
      throw new Error('Unexpected API response: service-orders/my missing meta.total');
    }
    return { data: res.data.data.map(normalizeOrder), total: res.data.meta.total };
  },

  async getTechnicianJobs(): Promise<TechnicianOrderItem[]> { const res = await apiClient.get<{data: TechnicianOrderItem[]}>('/service-orders/my'); return res.data.data.map(normalizeTechnicianOrder); },

  async getTechnicianOrder(id: string): Promise<TechnicianOrderItem> {
    const res = await apiClient.get<{ data: TechnicianOrderItem }>('/service-orders/' + encodeURIComponent(id));
    return normalizeTechnicianOrder(res.data.data);
  },

  async getConsoleOrders(statusFilter?: string): Promise<ServiceOrderItem[]> { const res = await apiClient.get<{data: ServiceOrderItem[]}>('/service-orders', {params:{status:statusFilter?.toLowerCase() || undefined}}); return res.data.data.map(normalizeOrder); },

  async getOrder(id: string): Promise<ServiceOrderItem> { const res = await apiClient.get<{data: ServiceOrderItem}>(`/service-orders/${id}`); return normalizeOrder(res.data.data); },

  async trackOrder(orderCode: string, phone: string): Promise<PublicTrackResult> {
    const res = await apiClient.post<{ data: PublicTrackResult }>('/service-orders/public/track', { orderCode, phone });
    return { ...res.data.data, status: res.data.data.status.toUpperCase() as CanonicalOrderStatus };
  },

  // ── Spec v1.2: Order Execution & Lifecycle Transitions ──

  async enRoute(orderId: string): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/service-orders/${orderId}/en-route`);
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async checkIn(
    orderId: string,
    coords: { lat: number; lng: number; accuracyMeters?: number },
  ): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/service-orders/${orderId}/check-in`, {
      lat: coords.lat,
      lng: coords.lng,
      accuracyMeters: coords.accuracyMeters ?? 20,
    });
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async startRepair(orderId: string): Promise<Record<string, unknown>> { const res = await apiClient.post<{data: Record<string,unknown>}>(`/service-orders/${orderId}/start-repair`); return res.data.data; },

  async updateLocation(
    orderId: string,
    coords: { lat: number; lng: number; accuracyMeters?: number },
  ): Promise<{ lat: number; lng: number; updatedAt: string }> {
    const res = await apiClient.patch<ApiResponse<{ lat: number; lng: number; updatedAt: string }>>(`/service-orders/${orderId}/location`, coords);
    return (res.data?.data || res.data) as { lat: number; lng: number; updatedAt: string };
  },

  async uploadEvidence(
    orderId: string,
    body: { phase: 'BEFORE' | 'AFTER'; file: File; caption?: string },
  ): Promise<Record<string, unknown>> {
    const form = new FormData();
    form.append('file', body.file);
    form.append('type', body.phase.toLowerCase());
    if (body.caption) form.append('note', body.caption);
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/service-orders/${orderId}/evidence`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async getEvidence(
    orderId: string,
  ): Promise<Array<{ id: string; type: 'before' | 'after' | 'additional'; mediaUrl: string; createdAt?: string }>> {
    const res = await apiClient.get<ApiResponse<Array<{ id: string; type: 'before' | 'after' | 'additional'; mediaUrl: string; createdAt?: string }>>>(`/service-orders/${orderId}/evidence`);
    return (res.data?.data || res.data || []) as Array<{ id: string; type: 'before' | 'after' | 'additional'; mediaUrl: string; createdAt?: string }>;
  },

  async deleteEvidence(orderId: string, evidenceId: string): Promise<void> {
    await apiClient.delete(`/service-orders/${orderId}/evidence/${evidenceId}`);
  },


  async completeRepair(
    orderId: string,
    body?: { completionNote?: string },
  ): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/service-orders/${orderId}/request-completion`, body || {});
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async confirmCompletion(orderId: string) {
    const res = await apiClient.post<{data: {order: ServiceOrderItem}}>(`/service-orders/${orderId}/confirm-completion`, {});
    return res.data.data;
  },

  async cancelOrder(orderId: string, reason: string): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/service-orders/${orderId}/cancel`, { reason });
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  // ── Quotations ──

  async submitQuotation(orderId: string, items: QuotationItemPayload[]): Promise<Record<string, unknown>> { const res = await apiClient.post<{data: Record<string,unknown>}>(`/service-orders/${orderId}/quotations`, {items: items.map(item => ({...item, type: item.type === 'LABOR' ? 'labor' : 'parts_equipment'}))}); return res.data.data; },

  async approveQuotation(quotationId: string): Promise<Record<string, unknown>> { const res = await apiClient.post<{data: Record<string,unknown>}>(`/quotations/${quotationId}/decision`, {action:'APPROVE'}); return res.data.data; },

  async rejectQuotation(quotationId: string, reason?: string): Promise<Record<string, unknown>> { void reason; const res = await apiClient.post<{data: Record<string,unknown>}>(`/quotations/${quotationId}/decision`, {action:'REJECT'}); return res.data.data; },

  // ── Chi phí phát sinh (Additional Cost) ──

  async getAdditionalCosts(orderId: string): Promise<AdditionalCostRecord[]> {
    const res = await apiClient.get<{ data: AdditionalCostRecord[] }>(`/service-orders/${orderId}/additional-costs`);
    return res.data.data.map(normalizeAdditionalCost);
  },

  async createAdditionalCost(
    orderId: string,
    body: { reason: string; items: QuotationItemPayload[]; evidenceUrls?: string[] },
  ): Promise<AdditionalCostRecord> {
    const res = await apiClient.post<{ data: AdditionalCostRecord }>(`/service-orders/${orderId}/additional-costs`, {
      ...body,
      items: body.items.map((item) => ({ ...item, type: item.type === 'LABOR' ? 'labor' : 'parts_equipment' })),
    });
    return normalizeAdditionalCost(res.data.data);
  },

  async decideAdditionalCost(id: string, action: 'APPROVE' | 'REJECT'): Promise<AdditionalCostRecord> {
    const res = await apiClient.post<{ data: AdditionalCostRecord }>(`/additional-costs/${id}/decision`, { action });
    return normalizeAdditionalCost(res.data.data);
  },

  async reviseAdditionalCost(
    id: string,
    body: { reason: string; items: QuotationItemPayload[]; evidenceUrls?: string[] },
  ): Promise<AdditionalCostRecord> {
    const res = await apiClient.post<{ data: AdditionalCostRecord }>(`/additional-costs/${id}/revise`, {
      ...body,
      items: body.items.map((item) => ({ ...item, type: item.type === 'LABOR' ? 'labor' : 'parts_equipment' })),
    });
    return normalizeAdditionalCost(res.data.data);
  },

  // ── Spec v1.2: Cash Settlement Dual-Confirmation ──

  async declareCashSettlement(
    orderId: string,
    body: { declaredAmount: number; technicianNotes?: string; receiptEvidenceUrl?: string },
  ): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(
      `/service-orders/${orderId}/cash-settlement/declare`,
      body,
    );
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async confirmCashSettlement(
    orderId: string,
    body: { agreed: boolean; disputeReason?: string; confirmedAmount?: number },
  ): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(
      `/service-orders/${orderId}/cash-settlement/confirm`,
      body,
    );
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async getCashSettlement(orderId: string): Promise<Record<string, unknown> | null> { const res = await apiClient.get<{data: Record<string,unknown> | null}>(`/service-orders/${orderId}/cash-settlement`); return res.data.data; },

  // ── Invoice & Warranties ──

  async getInvoice(orderId: string): Promise<Record<string, unknown>> { const res = await apiClient.get<{data: Record<string,unknown>}>(`/service-orders/${orderId}/invoice`); return res.data.data; },

  async payInvoice(invoiceId: string): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/invoices/${invoiceId}/pay`, { idempotencyKey: crypto.randomUUID() });
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  async createVnpayUrl(invoiceId: string): Promise<string> {
    const res = await apiClient.post<ApiResponse<{ paymentUrl: string }>>(`/invoices/${invoiceId}/vnpay-url`);
    const paymentUrl = (res.data?.data as { paymentUrl?: string } | undefined)?.paymentUrl;
    if (!paymentUrl) throw new Error('Không nhận được liên kết thanh toán VNPay.');
    return paymentUrl;
  },

  async getWarranties(): Promise<WarrantyItem[]> {
    const orders = await this.getCustomerOrders();
    const lists = await Promise.all(orders.map(async order => {
      const res = await apiClient.get<{data: {id:string;startsAt:string;expiresAt:string;status:string;note?:string}[]}>(`/service-orders/${order.id}/warranties`);
      return res.data.data.map(w => ({...w, orderCode:order.code, serviceName:order.serviceName, itemDescription:w.note || 'Bảo hành dịch vụ', technicianName:order.technician?.fullName || '', status:w.status.toUpperCase() as WarrantyItem['status']}));
    })); return lists.flat();
  },

  async createWarrantyClaim(orderId: string, description: string): Promise<Record<string, unknown>> {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(`/service-orders/${orderId}/warranty-claims`, {
      description,
    });
    return (res.data?.data || res.data || {}) as Record<string, unknown>;
  },

  // ── SM/Admin: Cancellations & Strikes ──

  async getCancellations(): Promise<CancellationRecord[]> {
    const res = await apiClient.get<{ data: CancellationRecord[] }>('/cancellations');
    return res.data.data;
  },

  async reviewCancellation(
    id: string,
    body: { waiveStrike?: boolean; waiveReason?: string; grantPriorityBoost?: boolean },
  ): Promise<CancellationRecord> {
    const res = await apiClient.post<{ data: CancellationRecord }>(`/cancellations/${id}/review`, body);
    return res.data.data;
  },

  async getStrikes(userId?: string): Promise<StrikeRecord[]> {
    const res = await apiClient.get<{ data: StrikeRecord[] }>('/strikes', { params: { userId } });
    return res.data.data;
  },

  async waiveStrike(id: string, reason: string): Promise<StrikeRecord> {
    const res = await apiClient.post<{ data: StrikeRecord }>(`/strikes/${id}/waive`, { reason });
    return res.data.data;
  },
};
