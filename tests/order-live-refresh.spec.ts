import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient } from '@tanstack/vue-query';

// PO 18/10/2026: an open order page follows the other side live and reads only
// what a change touched - a photo does not read the invoice, the booking and the
// warranties again; a status change reads everything; a position moves nothing but the map.
const api = vi.hoisted(() => ({
  getOrder: vi.fn(), getInvoice: vi.fn(), getCashSettlement: vi.fn(), getEvidence: vi.fn(),
  getAdditionalCosts: vi.fn(), getOrderWarranties: vi.fn(), getOrderWarrantyClaims: vi.fn(),
  getTechnicianOrder: vi.fn(), getBooking: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: new Proxy(api as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? vi.fn().mockRejectedValue(new Error('not needed')),
  }),
  coverageKindLabel: vi.fn(() => ''),
  describeCoverage: vi.fn(() => ''),
}));
vi.mock('../src/api/part-requests.api', () => ({ partRequestsApi: { getByOrderId: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: api.getBooking }, isFullBookingWithMedia: () => false }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: vi.fn().mockResolvedValue(null) } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'o1' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));
type Handlers = Record<string, ((...args: unknown[]) => void) | undefined>;
const socket = vi.hoisted(() => {
  const handlers = new Set<Handlers>();
  return {
    connected: true,
    handlers,
    subscribe: vi.fn((h: Handlers) => { handlers.add(h); return () => handlers.delete(h); }),
    emit(name: string, ...args: unknown[]) { for (const h of [...handlers]) h[name]?.(...args); },
    connect: vi.fn(), disconnect: vi.fn(), joinConversation: vi.fn(), leaveConversation: vi.fn(), sendTyping: vi.fn(), updateToken: vi.fn(),
  };
});
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: socket, default: socket }));

import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';
import { LIVE_DEBOUNCE_MS, startLiveUpdates } from '../src/services/live-updates';

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', code: 'FH-1', status: 'UNDER_REPAIR', paymentStatus: 'UNPAID', grandTotal: 400000, bookingId: 'b1', ...extra,
});
const stubs = { RouterLink: true, 'router-link': true, CustomerStopReplaceRequest: true, CustomerCancelledRebookAction: true, OrderComplaintPanel: true, WarrantyClaimCard: true, WarrantyClaimModal: true, RebookDialog: true, ChatThread: true };
let stopLive: () => void = () => undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  socket.handlers.clear();
  for (const fn of Object.values(api)) fn.mockReset();
  api.getOrder.mockResolvedValue(order());
  api.getInvoice.mockResolvedValue({ id: 'inv-1', grandTotal: 400000 });
  api.getCashSettlement.mockResolvedValue(null);
  api.getEvidence.mockResolvedValue([]);
  api.getAdditionalCosts.mockResolvedValue([]);
  api.getBooking.mockResolvedValue({ id: 'b1', description: 'Vòi rỉ' });
  stopLive = startLiveUpdates(new QueryClient());
});
afterEach(() => stopLive());

const calls = () => Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, fn.mock.calls.length]));

describe('CustomerOrderDetailPage live', () => {
  it('reads only the photos (and the order) when the technician adds one, everything on a status change', async () => {
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    const first = calls();
    expect(first.getOrder).toBeGreaterThanOrEqual(1);
    expect(first.getBooking).toBe(1);

    socket.emit('onOrderUpdated', { serviceOrderId: 'o1', bookingId: 'b1', status: 'under_repair', kinds: ['evidence'] });
    await new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 20));
    await flushPromises();
    const afterPhoto = calls();
    expect(afterPhoto.getOrder).toBe(first.getOrder + 1);
    expect(afterPhoto.getEvidence).toBe(first.getEvidence + 1);
    expect(afterPhoto.getInvoice).toBe(first.getInvoice);
    expect(afterPhoto.getCashSettlement).toBe(first.getCashSettlement);
    expect(afterPhoto.getAdditionalCosts).toBe(first.getAdditionalCosts);
    expect(afterPhoto.getBooking).toBe(1);

    // Another order's change is not read here.
    socket.emit('onOrderUpdated', { serviceOrderId: 'o2', bookingId: 'b2', status: 'completed', kinds: ['status'] });
    await new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 20));
    await flushPromises();
    expect(calls().getOrder).toBe(afterPhoto.getOrder);

    api.getOrder.mockResolvedValue(order({ status: 'COMPLETED' }));
    socket.emit('onOrderUpdated', { serviceOrderId: 'o1', bookingId: 'b1', status: 'completed', kinds: ['status'] });
    await new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 20));
    await flushPromises();
    const afterStatus = calls();
    expect(afterStatus.getInvoice).toBe(afterPhoto.getInvoice + 1);
    expect(afterStatus.getEvidence).toBe(afterPhoto.getEvidence + 1);
    // The booking does not change once the order exists: still read once.
    expect(afterStatus.getBooking).toBe(1);

    // The technician moving sends no request at all.
    socket.emit('onOrderLocation', { serviceOrderId: 'o1', lat: 10.77, lng: 106.69, updatedAt: '2030-01-01T00:00:00Z' });
    await flushPromises();
    expect(calls()).toEqual(afterStatus);

    w.unmount();
    socket.emit('onOrderUpdated', { serviceOrderId: 'o1', bookingId: 'b1', status: 'completed', kinds: ['status'] });
    await new Promise((resolve) => setTimeout(resolve, LIVE_DEBOUNCE_MS + 20));
    await flushPromises();
    expect(calls().getOrder).toBe(afterStatus.getOrder);
  });
});
