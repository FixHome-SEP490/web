// src/pages/customer/customer-orders-filters.ts
// Which states each status tab of "Đơn của tôi" lists. Each list is one server request
// per page (`statuses=` plus server search), so pages, totals and order are exact.

export type OrdersTab = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/** Repair orders; ALL sends no state, so every order is listed. */
export const ORDER_STATES: Record<OrdersTab, readonly string[]> = {
  ALL: [],
  IN_PROGRESS: ['accepted', 'en_route', 'under_repair'],
  COMPLETED: ['completed'],
  CANCELLED: ['cancelled'],
};

/**
 * Backend keeps `en_route`/`under_repair` DB status when onsite work stops (`workStopped: true`),
 * so FE collects stopped orders from these states when displaying the `CANCELLED` tab.
 */
export const STOPPED_ORDER_STATES: readonly string[] = ['en_route', 'under_repair'];

/**
 * Booking requests no technician holds. A matched booking shows as its order. A request
 * nobody took yet (closed, "chờ hỗ trợ") is still being handled, so it is under
 * "Đang xử lý" too. The request list also asks the server to leave out bookings that
 * reached an order (`withoutOrder`): when an order is cancelled its booking turns
 * cancelled or closed, and it is listed once, as the cancelled order.
 */
export const REQUEST_STATES: Record<OrdersTab, readonly string[]> = {
  ALL: ['submitted', 'matching', 'closed', 'cancelled'],
  IN_PROGRESS: ['submitted', 'matching', 'closed'],
  COMPLETED: [],
  CANCELLED: ['cancelled'],
};

export type OrdersListView = 'orders' | 'requests' | 'visits';

const WAITING_REQUEST = new Set(['SUBMITTED', 'MATCHING']);
const WAITING_VISIT = new Set(['submitted', 'matching']);

/**
 * The list the page opens on, once all three first pages are in. Something still waiting
 * for a technician comes first, so a customer told "đang chờ kỹ thuật viên" sees it at once
 * (PO 19/11: customer1 had two waiting visits but the page opened on repair orders and
 * looked empty of them). Then repair orders, then requests, then visits. Null: wait.
 */
export function pickInitialList(state: {
  orders: { loading: boolean; total: number };
  requests: { loading: boolean; total: number; statuses: string[] };
  visits: { loading: boolean; total: number; statuses: string[] };
}): OrdersListView | null {
  if (state.orders.loading || state.requests.loading || state.visits.loading) return null;
  if (state.requests.statuses.some((s) => WAITING_REQUEST.has(String(s).toUpperCase()))) return 'requests';
  if (state.visits.statuses.some((s) => WAITING_VISIT.has(String(s).toLowerCase()))) return 'visits';
  if (state.orders.total > 0) return 'orders';
  if (state.requests.total > 0) return 'requests';
  if (state.visits.total > 0) return 'visits';
  return null;
}

const STALE_REQUEST = new Set(['SUBMITTED', 'MATCHING', 'CLOSED']);
const STALE_VISIT = new Set(['submitted', 'matching', 'no_technician']);
export const STALE_WAITING_MS = 24 * 3600_000;

/** A visit the customer may still cancel from the list: nobody holds it yet. */
export const canCancelVisit = (status: string) => STALE_VISIT.has(String(status).toLowerCase());

/**
 * Requests and visits still waiting for a technician more than 24 hours after they were
 * made, oldest first, for the reminder at the top of the page (PO 19/11/2026).
 */
export function staleWaiting(
  requests: { id: string; status: string; createdAt: string; visitGroupId?: string | null }[],
  visits: { id: string; status: string; createdAt: string }[],
  now: number,
): { kind: 'request' | 'visit'; id: string; createdAt: string }[] {
  const old = (createdAt: string) => now - Date.parse(createdAt) > STALE_WAITING_MS;
  return [
    ...requests.filter((b) => !b.visitGroupId && STALE_REQUEST.has(String(b.status).toUpperCase()) && old(b.createdAt))
      .map((b) => ({ kind: 'request' as const, id: b.id, createdAt: b.createdAt })),
    ...visits.filter((v) => STALE_VISIT.has(String(v.status).toLowerCase()) && old(v.createdAt))
      .map((v) => ({ kind: 'visit' as const, id: v.id, createdAt: v.createdAt })),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
