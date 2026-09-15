// src/api/orders.api.ts
import apiClient from './client';
import { unwrap } from './response';

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

export interface ServiceOrderItem {
  id: string;
  code: string;
  bookingId: string;
  serviceName: string;
  pricingMode?: string;
  completionRequestedAt?: string;
  customerConfirmed?: boolean;
  arrivalVerified?: boolean;
  beforeEvidenceCount?: number;
  afterEvidenceCount?: number;
  status: CanonicalOrderStatus;
  customerName: string;
  customerPhone: string;
  addressSummary: string;
  scheduledAt: string;
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
    status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | 'approved' | 'draft' | 'pending';
    laborTotal: number;
    partsTotal: number;
    items: {
      id?: string;
      partSource?: string;
      partWarrantyOption?: string;
      warrantyFee?: number;
      warrantyTermDays?: number;
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
  partSource?: 'FIXHOME' | 'TECHNICIAN' | 'fixhome' | 'technician';
  partWarrantyOption?: 'no_warranty' | 'included' | 'paid_warranty';
  warrantyFee?: number;
  warrantyTermDays?: number;
}

export interface CostRequest {
  id: string; serviceOrderId: string; status: string; reason: string; totalLaborDelta: number; totalPartsDelta: number; createdAt: string;
  items: Array<QuotationItemPayload & { id: string; lineTotal: number }>;
}
export interface RepairHistoryItem { orderId: string; bookingId: string; code: string; status: string; serviceName?: string; technicianName?: string; laborTotal: number; partsTotal: number; grandTotal: number; completedAt?: string; cancelledAt?: string; }
export interface ReviewItem { id: string; rating: number; comment?: string; createdAt?: string; }
export interface EvidenceResponse { id: string; serviceOrderId: string; type: 'BEFORE' | 'AFTER' | 'ADDITIONAL'; mediaUrl: string; note?: string; capturedAt?: string; createdAt: string; }
const get = async <T>(url: string): Promise<T> => unwrap<T>((await apiClient.get(url)).data);
const post = async (url: string, body: unknown = {}): Promise<Record<string, unknown>> => unwrap((await apiClient.post(url,body)).data);
const normalizeOrder = (order: ServiceOrderItem): ServiceOrderItem => ({ ...order, status: order.status.toUpperCase() as CanonicalOrderStatus, paymentStatus: order.paymentStatus.toUpperCase() as ServiceOrderItem['paymentStatus'], quotation: order.quotation ? { ...order.quotation, status: order.quotation.status.toUpperCase() as NonNullable<ServiceOrderItem['quotation']>['status'], items: order.quotation.items.map(item => ({ ...item, type: String(item.type).toLowerCase() === 'labor' ? 'LABOR' : 'PARTS' })) } : undefined });
const wireItems = (items: QuotationItemPayload[]) => items.map(item => ({ type: item.type === 'LABOR' ? 'labor' : 'parts_equipment', description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, ...(item.type === 'LABOR' ? { warrantyDays: item.warrantyDays } : { partSource: item.partSource?.toLowerCase(), partWarrantyOption: item.partWarrantyOption ?? 'no_warranty', ...(item.partWarrantyOption === 'paid_warranty' ? { warrantyFee: item.warrantyFee, warrantyTermDays: item.warrantyTermDays } : {}) }) }));
export const ordersApi = {
  async getCustomerOrders(): Promise<ServiceOrderItem[]> { return (await get<ServiceOrderItem[]>('/service-orders/my')).map(normalizeOrder); },
  async getTechnicianJobs(): Promise<ServiceOrderItem[]> { return (await get<ServiceOrderItem[]>('/service-orders/my')).map(normalizeOrder); },
  async getConsoleOrders(statusFilter?: string): Promise<ServiceOrderItem[]> { const response = await apiClient.get('/service-orders', { params: { status: statusFilter?.toLowerCase() } }); return unwrap<ServiceOrderItem[]>(response.data).map(normalizeOrder); },
  async getOrder(id: string): Promise<ServiceOrderItem> { return normalizeOrder(await get<ServiceOrderItem>('/service-orders/'+id)); },
  async enRoute(id: string) { return post('/service-orders/'+id+'/en-route'); },
  async checkIn(id: string, coords: { lat: number; lng: number; accuracyMeters?: number }) { return post('/service-orders/'+id+'/check-in', coords); },
  async startRepair(id: string) { return post('/service-orders/'+id+'/start-repair'); },
  async uploadEvidence(id: string, body: { phase: 'BEFORE' | 'AFTER'; file: File; caption?: string }) {
    const form = new FormData();
    form.append('type', body.phase.toLowerCase()); form.append('file', body.file);
    if (body.caption) form.append('note', body.caption);
    return unwrap((await apiClient.post('/service-orders/'+id+'/evidence', form, { headers: { 'Content-Type': undefined }, timeout: 30000 })).data);
  },
  async requestCompletion(id: string, body?: { completionNote?: string }) { return post('/service-orders/'+id+'/request-completion', body); },
  async confirmCompletion(id: string, body?: { feedback?: string; rating?: number; signatureUrl?: string }) { return post('/service-orders/'+id+'/confirm-completion', body); },
  async completeRepair(id: string, body?: { completionNote?: string }) { return post('/service-orders/'+id+'/complete', body); },
  async cancelOrder(id: string, reason: string) { return post('/service-orders/'+id+'/cancel', { reason }); },
  async submitQuotation(id: string, items: QuotationItemPayload[], note?: string) { return post('/service-orders/'+id+'/quotations', { items: wireItems(items), note }); },
  async approveQuotation(id: string, paidWarrantyItemIds: string[] = []) { return post('/quotations/'+id+'/decision', { action: 'APPROVE', paidWarrantyItemIds }); },
  async rejectQuotation(id: string) { return post('/quotations/'+id+'/decision', { action: 'REJECT' }); },
  async createAdditionalCost(id: string, body: { reason: string; items: QuotationItemPayload[] }) { return post('/service-orders/'+id+'/additional-costs', { reason: body.reason, items: wireItems(body.items) }); },
  async getAdditionalCosts(id: string): Promise<CostRequest[]> { return get('/service-orders/'+id+'/additional-costs'); },
  async decideAdditionalCost(id: string, action: 'APPROVE' | 'REJECT', paidWarrantyItemIds: string[] = []) { return post('/additional-costs/'+id+'/decision', { action, paidWarrantyItemIds }); },
  async getEvidence(id: string): Promise<EvidenceResponse[]> { return (await get<EvidenceResponse[]>('/service-orders/'+id+'/evidence')).map(e => ({ ...e, type: e.type.toUpperCase() as EvidenceResponse['type'] })); },
  async submitReview(id: string, body: { rating: number; comment?: string }) { return post('/service-orders/'+id+'/reviews', body); },
  async getOrderReview(id: string): Promise<ReviewItem | null> { return get('/service-orders/'+id+'/reviews'); },
  async getTechnicianReviews(id: string, page=1, pageSize=10): Promise<{ data: ReviewItem[]; total: number }> { const response = await apiClient.get('/technicians/'+id+'/reviews', { params: { page, pageSize } }); return { data: unwrap(response.data), total: response.data.meta?.total ?? 0 }; },
  async rebook(id: string, body: { preferredStartAt: string; preferredEndAt: string; problemDescription?: string; quantity?: number }) { return post('/bookings/'+id+'/rebook', body); },
  async getRepairHistory(page=1, pageSize=20): Promise<{ data: RepairHistoryItem[]; total: number }> { const response = await apiClient.get('/repair-history', { params: { page, pageSize } }); return { data: unwrap(response.data), total: response.data.meta?.total ?? 0 }; },
  async declareCashSettlement(id: string, body: { declaredAmount: number; technicianNotes?: string; receiptEvidenceUrl?: string }) { return post('/service-orders/'+id+'/cash-settlement/declare', body); },
  async confirmCashSettlement(id: string, body: { agreed: boolean; disputeReason?: string; confirmedAmount?: number }) { return post('/service-orders/'+id+'/cash-settlement/confirm', body); },
  async getCashSettlement(id: string): Promise<Record<string, unknown> | null> { return get('/service-orders/'+id+'/cash-settlement'); },
  async getInvoice(id: string): Promise<Record<string, unknown>> { return (await get<Record<string, unknown> | null>('/service-orders/'+id+'/invoice')) ?? {}; },
  async payInvoice(id: string, paymentMethod = 'VNPAY_SANDBOX') { return post('/invoices/'+id+'/pay', { paymentMethod }); },
  async getWarranties(): Promise<WarrantyItem[]> {
    const orders = await this.getCustomerOrders();
    const coverages = await Promise.all(orders.filter(o=>o.status==='COMPLETED').map(async order => (await get<WarrantyItem[]>('/service-orders/'+order.id+'/warranties')).map(w => ({ ...w, orderCode: order.code, serviceName: order.serviceName, technicianName: order.technician?.fullName ?? '', status: w.status.toUpperCase() as WarrantyItem['status'] }))));
    return coverages.flat();
  },
  async createWarrantyClaim(id: string, description: string) { return post('/service-orders/'+id+'/warranty-claims', { description }); },
};
