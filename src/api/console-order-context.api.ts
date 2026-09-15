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

export interface ConsoleOrderContext {
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

function normalizeConsoleOrderContext(payload: unknown): ConsoleOrderContext {
  if (!isRecord(payload)) invalid('Backend returned an invalid service order response.');
  const context: ConsoleOrderContext = {
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
