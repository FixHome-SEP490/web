// src/api/console-order-context.api.ts
//
// Dev2-owned read-only adapter for the console (Service Manager / Admin) order
// detail view. It calls GET /service-orders/:id and fails closed: network, API
// and malformed responses throw and never fall back to local/mock order data.
//
// The current Backend detail runtime can be double-nested because the Dev1
// controller returns an inner `{ data: order }` shape before the global
// TransformInterceptor wraps it again. This adapter tolerates exactly that
// currently observed nested detail form locally and does not generalize into
// a permissive fallback. Do not reuse this tolerance elsewhere.
import apiClient from './client';

export type ConsoleOrderStatus =
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'UNDER_REPAIR'
  | 'COMPLETED'
  | 'CANCELLED';

export type ConsoleOrderPaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

export interface ConsoleOrderTimelineEntry {
  status: string;
  title: string;
  timestamp: string;
  actor: string;
}

export interface ConsoleQuotationItem {
  id?: string;
  type: 'LABOR' | 'PARTS' | 'PARTS_EQUIPMENT';
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  warrantyDays?: number;
  partSource?: string | null;
  partNameSnapshot?: string | null;
  partCatalogId?: string | null;
}

export interface ConsoleQuotation {
  id?: string;
  status?: string;
  version?: number;
  laborTotal?: number;
  partsTotal?: number;
  note?: string | null;
  items: ConsoleQuotationItem[];
}

export interface ConsoleTechnicianInfo {
  id: string;
  fullName: string;
  phoneNumber: string;
  avatarUrl?: string | null;
  verificationStatus?: string | null;
}

export interface ConsoleOrderMedia {
  id: string;
  url: string | null;
  isPrivate: boolean;
  legacyInsecure?: boolean;
  mimeType: string;
  sizeBytes: number | null;
}

export interface ConsoleOrderContext {
  visitGroupId?: string | null;
  id: string;
  code: string;
  bookingId: string;
  status: ConsoleOrderStatus;
  scheduledAt: string | null;
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  paymentStatus: ConsoleOrderPaymentStatus;
  createdAt: string | null;
  updatedAt: string | null;
  timeline?: ConsoleOrderTimelineEntry[];

  // Extended fields for Service Manager order detail view
  serviceName?: string;
  categoryName?: string;
  addressSummary?: string;
  customerName?: string;
  customerPhone?: string;
  customerAvatarUrl?: string | null;
  technician?: ConsoleTechnicianInfo | null;
  pricingMode?: string | null;
  fixedUnitPrice?: number | null;
  quantity?: number | null;
  scopeDescription?: string | null;
  bookingDescription?: string | null;
  customerNote?: string | null;
  bookingMode?: string | null;
  slot?: string | null;
  quotation?: ConsoleQuotation | null;
  bookingMedia?: ConsoleOrderMedia[] | null;
}

const ORDER_STATUSES: readonly ConsoleOrderStatus[] = [
  'ACCEPTED',
  'EN_ROUTE',
  'UNDER_REPAIR',
  'COMPLETED',
  'CANCELLED',
];

const PAYMENT_STATUSES: readonly ConsoleOrderPaymentStatus[] = ['UNPAID', 'PAID', 'REFUNDED'];

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

function optionalDateTime(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function finiteNumber(value: unknown, message: string): number {
  const normalized = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(normalized)) invalid(message);
  return normalized;
}

function normalizeStatus(value: unknown): ConsoleOrderStatus {
  const canonical = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!ORDER_STATUSES.includes(canonical as ConsoleOrderStatus)) {
    invalid('Backend returned an unsupported service order status.');
  }
  return canonical as ConsoleOrderStatus;
}

function normalizePaymentStatus(value: unknown): ConsoleOrderPaymentStatus {
  const canonical = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!PAYMENT_STATUSES.includes(canonical as ConsoleOrderPaymentStatus)) {
    invalid('Backend returned an unsupported service order payment status.');
  }
  return canonical as ConsoleOrderPaymentStatus;
}

function normalizeTimeline(payload: unknown): ConsoleOrderTimelineEntry[] | undefined {
  if (payload === undefined) return undefined;
  if (!Array.isArray(payload)) invalid('Backend returned an invalid service order timeline.');
  return payload.map((entry) => {
    if (!isRecord(entry)) invalid('Backend returned an invalid service order timeline.');
    return {
      status: requiredString(entry.status, 'Backend returned an invalid service order timeline.'),
      title: requiredString(entry.title, 'Backend returned an invalid service order timeline.'),
      timestamp: requiredString(entry.timestamp, 'Backend returned an invalid service order timeline.'),
      actor: requiredString(entry.actor, 'Backend returned an invalid service order timeline.'),
    };
  });
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeTechnician(payload: unknown): ConsoleTechnicianInfo | null {
  if (!isRecord(payload)) return null;
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const phoneNumber = typeof payload.phoneNumber === 'string' ? payload.phoneNumber.trim() : '';
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!fullName && !phoneNumber && !id) return null;
  return {
    id,
    fullName: fullName || 'Kỹ thuật viên',
    phoneNumber,
    avatarUrl: normalizeNullableString(payload.avatarUrl),
    verificationStatus: normalizeNullableString(payload.verificationStatus),
  };
}

function normalizeQuotationItem(payload: unknown): ConsoleQuotationItem | null {
  if (!isRecord(payload)) return null;
  const rawType = String(payload.type ?? '').trim().toUpperCase();
  const type: 'LABOR' | 'PARTS' | 'PARTS_EQUIPMENT' =
    rawType.includes('PART') ? 'PARTS' : 'LABOR';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const quantity = typeof payload.quantity === 'number' ? payload.quantity : Number(payload.quantity) || 1;
  const unitPrice = typeof payload.unitPrice === 'number' ? payload.unitPrice : Number(payload.unitPrice) || 0;
  const lineTotal = typeof payload.lineTotal === 'number' ? payload.lineTotal : Number(payload.lineTotal) || (quantity * unitPrice);
  const warrantyDays = typeof payload.warrantyDays === 'number'
    ? payload.warrantyDays
    : (payload.warrantyDaysSnapshot != null ? Number(payload.warrantyDaysSnapshot) : undefined);

  return {
    id: typeof payload.id === 'string' ? payload.id.trim() : undefined,
    type,
    description: description || (type === 'LABOR' ? 'Hạng mục công việc' : 'Linh kiện / vật tư'),
    quantity: Math.max(1, quantity),
    unitPrice: Math.max(0, unitPrice),
    lineTotal: Math.max(0, lineTotal),
    warrantyDays: warrantyDays != null && Number.isFinite(warrantyDays) ? warrantyDays : undefined,
    partSource: normalizeNullableString(payload.partSource),
    partNameSnapshot: normalizeNullableString(payload.partNameSnapshot),
    partCatalogId: normalizeNullableString(payload.partCatalogId),
  };
}

function normalizeQuotation(payload: unknown): ConsoleQuotation | null {
  if (!isRecord(payload)) return null;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .map(normalizeQuotationItem)
    .filter((item): item is ConsoleQuotationItem => item !== null);

  const rawStatus = typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : 'PENDING';
  const laborTotal = typeof payload.laborTotal === 'number' ? payload.laborTotal : Number(payload.laborTotal) || 0;
  const partsTotal = typeof payload.partsTotal === 'number' ? payload.partsTotal : Number(payload.partsTotal) || 0;

  return {
    id: typeof payload.id === 'string' ? payload.id.trim() : undefined,
    status: rawStatus,
    version: typeof payload.version === 'number' ? payload.version : undefined,
    laborTotal,
    partsTotal,
    note: normalizeNullableString(payload.note),
    items,
  };
}

function normalizeMediaItem(payload: unknown): ConsoleOrderMedia | null {
  if (!isRecord(payload)) return null;
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!id) return null;
  return {
    id,
    url: normalizeNullableString(payload.url),
    isPrivate: Boolean(payload.isPrivate),
    legacyInsecure: Boolean(payload.legacyInsecure),
    mimeType: typeof payload.mimeType === 'string' ? payload.mimeType.trim() : 'image/jpeg',
    sizeBytes: typeof payload.sizeBytes === 'number' ? payload.sizeBytes : null,
  };
}

function normalizeConsoleOrderContext(payload: unknown): ConsoleOrderContext {
  if (!isRecord(payload)) invalid('Backend returned an invalid service order response.');
  const context: ConsoleOrderContext = {
    ...(payload.visitGroupId === null || typeof payload.visitGroupId === 'string' ? { visitGroupId: payload.visitGroupId } : {}),
    id: requiredString(payload.id, 'Backend returned an invalid service order response.'),
    code: requiredString(payload.code, 'Backend returned an invalid service order response.'),
    bookingId: requiredString(payload.bookingId, 'Backend returned an invalid service order response.'),
    status: normalizeStatus(payload.status),
    scheduledAt: optionalDateTime(payload.scheduledAt),
    laborTotal: finiteNumber(payload.laborTotal, 'Backend returned an invalid service order response.'),
    partsTotal: finiteNumber(payload.partsTotal, 'Backend returned an invalid service order response.'),
    grandTotal: finiteNumber(payload.grandTotal, 'Backend returned an invalid service order response.'),
    paymentStatus: normalizePaymentStatus(payload.paymentStatus),
    createdAt: optionalDateTime(payload.createdAt),
    updatedAt: optionalDateTime(payload.updatedAt),
  };
  const timeline = normalizeTimeline(payload.timeline);
  if (timeline !== undefined) context.timeline = timeline;

  if (typeof payload.serviceName === 'string' && payload.serviceName.trim()) {
    context.serviceName = payload.serviceName.trim();
  }
  if (typeof payload.categoryName === 'string' && payload.categoryName.trim()) {
    context.categoryName = payload.categoryName.trim();
  }
  if (typeof payload.addressSummary === 'string' && payload.addressSummary.trim()) {
    context.addressSummary = payload.addressSummary.trim();
  }
  if (typeof payload.customerName === 'string' && payload.customerName.trim()) {
    context.customerName = payload.customerName.trim();
  }
  if (typeof payload.customerPhone === 'string' && payload.customerPhone.trim()) {
    context.customerPhone = payload.customerPhone.trim();
  }
  if (typeof payload.customerAvatarUrl === 'string' && payload.customerAvatarUrl.trim()) {
    context.customerAvatarUrl = payload.customerAvatarUrl.trim();
  }
  if (isRecord(payload.technician)) {
    const tech = normalizeTechnician(payload.technician);
    if (tech) context.technician = tech;
  }
  if (typeof payload.pricingMode === 'string' && payload.pricingMode.trim()) {
    context.pricingMode = payload.pricingMode.trim();
  }
  if (payload.fixedUnitPrice !== undefined && payload.fixedUnitPrice !== null) {
    const p = typeof payload.fixedUnitPrice === 'number' ? payload.fixedUnitPrice : Number(payload.fixedUnitPrice);
    if (Number.isFinite(p)) context.fixedUnitPrice = p;
  }
  if (typeof payload.quantity === 'number' && Number.isFinite(payload.quantity)) {
    context.quantity = payload.quantity;
  }
  if (typeof payload.scopeDescription === 'string' && payload.scopeDescription.trim()) {
    context.scopeDescription = payload.scopeDescription.trim();
  }
  if (typeof payload.bookingDescription === 'string' && payload.bookingDescription.trim()) {
    context.bookingDescription = payload.bookingDescription.trim();
  }
  if (typeof payload.customerNote === 'string' && payload.customerNote.trim()) {
    context.customerNote = payload.customerNote.trim();
  }
  if (typeof payload.bookingMode === 'string' && payload.bookingMode.trim()) {
    context.bookingMode = payload.bookingMode.trim();
  }
  if (typeof payload.slot === 'string' && payload.slot.trim()) {
    context.slot = payload.slot.trim();
  }
  if (isRecord(payload.quotation)) {
    const q = normalizeQuotation(payload.quotation);
    if (q) context.quotation = q;
  }
  if (Array.isArray(payload.bookingMedia)) {
    const media = payload.bookingMedia.map(normalizeMediaItem).filter((m): m is ConsoleOrderMedia => m !== null);
    if (media.length > 0) context.bookingMedia = media;
  }

  return context;
}

function unwrapDetailEnvelope(payload: unknown): unknown {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    typeof payload.statusCode !== 'number' ||
    !Number.isInteger(payload.statusCode) ||
    typeof payload.message !== 'string' ||
    !('data' in payload)
  ) {
    invalid('Backend returned an invalid service order response.');
  }
  const inner = payload.data;
  // Tolerate exactly the currently observed double-nested detail form
  // (`outer.data.data`) produced by the Dev1 controller shape. Anything else
  // is validated as-is and rejected when it is not a valid order object.
  if (isRecord(inner) && 'data' in inner && isRecord(inner.data)) return inner.data;
  return inner;
}

export const consoleOrderContextApi = {
  async getConsoleOrderContext(orderId: string): Promise<ConsoleOrderContext> {
    const id = requiredString(orderId, 'A service order id is required.');
    const response = await apiClient.get<unknown>(`/service-orders/${encodeURIComponent(id)}`);
    return normalizeConsoleOrderContext(unwrapDetailEnvelope(response.data));
  },
};
