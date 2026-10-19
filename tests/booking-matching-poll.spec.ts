import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient } from '@tanstack/vue-query';

const { getBooking, push } = vi.hoisted(() => ({ getBooking: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking, updateBooking: vi.fn(), cancelBooking: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-from-route' } }),
  useRouter: () => ({ push }),
}));
// PO 18/10/2026: the booking follows the server live; it is polled only while the socket is down.
type Handlers = Record<string, ((...args: unknown[]) => void) | undefined>;
const socket = vi.hoisted(() => {
  const handlers = new Set<Handlers>();
  return {
    connected: false,
    handlers,
    subscribe: vi.fn((h: Handlers) => { handlers.add(h); return () => handlers.delete(h); }),
    emit(name: string, ...args: unknown[]) { for (const h of [...handlers]) h[name]?.(...args); },
  };
});
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: socket, default: socket }));

import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';
import { startLiveUpdates } from '../src/services/live-updates';

const booking = (status: string, serviceOrderId?: string | null) => ({
  id: 'booking-from-route', status, serviceOrderId, description: 'Synthetic repair',
  preferredAt: '2030-01-01T09:00:00.000Z', urgency: 'normal',
  addressId: 'synthetic-address', serviceId: 'synthetic-service', customerId: 'synthetic-customer',
});
const global = { stubs: { FhDatePicker: true, FhTimeScrollPicker: true, FhConfirmDialog: true } };
let wrapper: ReturnType<typeof mount> | null = null;
let stopLive: () => void = () => undefined;
beforeEach(() => {
  getBooking.mockReset();
  push.mockReset();
  socket.handlers.clear();
  socket.connected = false;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  stopLive = startLiveUpdates(new QueryClient());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  stopLive();
  vi.useRealTimers();
});
async function render() { wrapper = mount(BookingDetailPage, { global }); await flushPromises(); return wrapper; }

describe('WEB-WIZARD-TECH live Booking matching', () => {
  it('reads the booking the moment the server says it was taken, and never polls while live', async () => {
    socket.connected = true;
    getBooking.mockResolvedValueOnce(booking('MATCHING'))
      .mockResolvedValueOnce(booking('MATCHED', 'service-order-from-backend'));
    const page = await render();
    expect(getBooking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getBooking).toHaveBeenCalledTimes(1);

    // Another booking's change is not ours.
    socket.emit('onBookingUpdated', { bookingId: 'someone-else', status: 'matched', serviceOrderId: 'x' });
    await vi.advanceTimersByTimeAsync(200);
    expect(getBooking).toHaveBeenCalledTimes(1);

    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'matched', serviceOrderId: 'service-order-from-backend' });
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    expect(getBooking).toHaveBeenCalledTimes(2);
    expect(page.find('[data-testid="booking-open-service-order"]').exists()).toBe(true);
    await page.find('[data-testid="booking-open-service-order"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'service-order-from-backend' } });
  });

  it('polls every 10 s only while the socket is down, and reads once when it comes back', async () => {
    getBooking.mockResolvedValue(booking('MATCHING'));
    await render();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getBooking).toHaveBeenCalledTimes(2);
    socket.connected = true;
    socket.emit('onStatusChange', true);
    socket.emit('onReconnected');
    await flushPromises();
    expect(getBooking).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getBooking).toHaveBeenCalledTimes(3);
    socket.connected = false;
    socket.emit('onStatusChange', false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getBooking).toHaveBeenCalledTimes(4);
  });

  it('stops after the match and does not overlap reads', async () => {
    let resolvePoll!: (value: ReturnType<typeof booking>) => void;
    getBooking.mockResolvedValueOnce(booking('MATCHING'))
      .mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; }));
    await render();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getBooking).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'matching', serviceOrderId: null });
    await vi.advanceTimersByTimeAsync(200);
    expect(getBooking).toHaveBeenCalledTimes(2);
    resolvePoll(booking('CLOSED'));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(30_000);
    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'closed', serviceOrderId: null });
    await vi.advanceTimersByTimeAsync(200);
    expect(getBooking).toHaveBeenCalledTimes(2);
  });

  // Review 18/10/2026: the event comes once; one that lands while a dialog is open must not be lost.
  it('reads a change that arrived while the cancel dialog was open as soon as it closes', async () => {
    socket.connected = true;
    getBooking.mockResolvedValueOnce(booking('MATCHING'))
      .mockResolvedValueOnce(booking('MATCHED', 'service-order-from-backend'));
    const page = await render();
    await page.find('[data-testid="booking-start-cancel"]').trigger('click');
    await flushPromises();
    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'matched', serviceOrderId: 'service-order-from-backend' });
    await vi.advanceTimersByTimeAsync(200);
    expect(getBooking).toHaveBeenCalledTimes(1);

    page.findComponent({ name: 'FhConfirmDialog' }).vm.$emit('cancel');
    await flushPromises();
    expect(getBooking).toHaveBeenCalledTimes(2);
    expect(page.find('[data-testid="booking-open-service-order"]').exists()).toBe(true);
  });

  it('reads again when a change arrives during a read', async () => {
    socket.connected = true;
    let resolveRead!: (value: ReturnType<typeof booking>) => void;
    getBooking.mockResolvedValueOnce(booking('MATCHING'))
      .mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }))
      .mockResolvedValueOnce(booking('MATCHED', 'service-order-from-backend'));
    const page = await render();
    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'matching', serviceOrderId: null });
    await vi.advanceTimersByTimeAsync(200);
    expect(getBooking).toHaveBeenCalledTimes(2);
    // The technician accepts while that read is still on its way.
    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'matched', serviceOrderId: 'service-order-from-backend' });
    await vi.advanceTimersByTimeAsync(200);
    resolveRead(booking('MATCHING'));
    await flushPromises();
    expect(getBooking).toHaveBeenCalledTimes(3);
    expect(page.find('[data-testid="booking-open-service-order"]').exists()).toBe(true);
  });

  it('never follows a SUBMITTED, CLOSED or CANCELLED booking', async () => {
    getBooking.mockResolvedValueOnce(booking('CLOSED'));
    await render();
    await vi.advanceTimersByTimeAsync(30_000);
    socket.emit('onBookingUpdated', { bookingId: 'booking-from-route', status: 'closed', serviceOrderId: null });
    await vi.advanceTimersByTimeAsync(200);
    expect(getBooking).toHaveBeenCalledTimes(1);
  });
});
