import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PO 18/10/2026: the job page and the order pages follow the other side's changes live.
const handlers = vi.hoisted(() => [] as Array<{ onOrderUpdated?: (e: unknown) => void }>);
vi.mock('../src/services/chat-socket.service', () => ({
  chatSocketService: {
    subscribe: vi.fn((h: { onOrderUpdated?: (e: unknown) => void }) => {
      handlers.push(h);
      return () => handlers.splice(handlers.indexOf(h), 1);
    }),
  },
}));

import { createTestQueryClient } from './support/query-client';
import { ORDER_REFRESH_DEBOUNCE_MS, startOrderRealtime } from '../src/services/order-realtime';
import { queryKeys } from '../src/lib/query-keys';

const event = { serviceOrderId: 'order-1', bookingId: 'booking-1', status: 'completed' };

beforeEach(() => {
  vi.useFakeTimers();
  handlers.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('order:updated', () => {
  it('reads the order data on screen again once per burst of changes', async () => {
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const remove = vi.spyOn(client, 'removeQueries');
    const stop = startOrderRealtime(client);

    handlers[0].onOrderUpdated?.(event);
    handlers[0].onOrderUpdated?.({ ...event, status: 'under_repair' });
    handlers[0].onOrderUpdated?.(event);
    expect(invalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ORDER_REFRESH_DEBOUNCE_MS);

    const refreshed = invalidate.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey: unknown }).queryKey));
    for (const key of [queryKeys.orders.all, queryKeys.bookings.all, queryKeys.wallet.all, queryKeys.earnings.all, queryKeys.warranty.all, queryKeys.invitations.all]) {
      expect(refreshed.filter((k) => k === JSON.stringify(key))).toHaveLength(1);
    }
    // Only what a page shows is read again; the rest is dropped and read fresh on the next visit.
    expect(invalidate.mock.calls.every(([filters]) => (filters as { refetchType?: string }).refetchType === 'active')).toBe(true);
    expect(remove.mock.calls.every(([filters]) => (filters as { type?: string }).type === 'inactive')).toBe(true);

    stop();
    expect(handlers).toHaveLength(0);
  });

  it('stops listening and drops a pending refresh when stopped', async () => {
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const stop = startOrderRealtime(client);
    handlers[0].onOrderUpdated?.(event);
    stop();
    await vi.advanceTimersByTimeAsync(ORDER_REFRESH_DEBOUNCE_MS * 2);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
