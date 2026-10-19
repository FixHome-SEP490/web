import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/vue-query';

// PO 18/10/2026: screens follow the server live. Only what a change touched is
// read again; lists only when a status changed; polling only while the socket is down.
type Handlers = Record<string, ((...args: unknown[]) => void) | undefined>;
const socket = vi.hoisted(() => {
  const handlers = new Set<Handlers>();
  return {
    connected: true,
    handlers,
    subscribe: vi.fn((h: Handlers) => { handlers.add(h); return () => handlers.delete(h); }),
    emit(name: string, ...args: unknown[]) { for (const h of [...handlers]) h[name]?.(...args); },
  };
});
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: socket, default: socket }));

import {
  LIVE_DEBOUNCE_MS,
  afterRunningRead,
  mergeKinds,
  onBookingChange,
  onOrderChange,
  onOrderListsChange,
  onOrderLocation,
  onResync,
  startLiveUpdates,
  touchesLists,
  whileOffline,
} from '../src/services/live-updates';

let client: QueryClient;
let invalidated: unknown[][];
let stop: () => void = () => undefined;
const order = (kinds?: string[], id = 'order-1') => ({ serviceOrderId: id, bookingId: 'booking-1', status: 'under_repair', ...(kinds ? { kinds } : {}) });

beforeEach(() => {
  vi.useFakeTimers();
  socket.handlers.clear();
  socket.connected = true;
  client = new QueryClient();
  invalidated = [];
  vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filters?: { queryKey?: readonly unknown[]; refetchType?: string }) => {
    invalidated.push([filters?.queryKey, filters?.refetchType]);
  });
  stop = startLiveUpdates(client);
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

const keysRefetched = () => invalidated.filter(([, type]) => type === 'active').map(([key]) => JSON.stringify(key));

describe('merging and deciding', () => {
  it('merges the kinds of one order, and an event without kinds means anything changed', () => {
    expect(mergeKinds(['quotation'], ['evidence', 'quotation'])).toEqual(['evidence', 'quotation']);
    expect(mergeKinds(['quotation'], undefined)).toBeUndefined();
    expect(touchesLists(['evidence', 'quotation', 'additional_cost', 'part', 'arrival'])).toBe(false);
    for (const kind of ['status', 'order', 'assignment', 'invoice', 'cash', 'warranty']) expect(touchesLists([kind as never])).toBe(true);
    expect(touchesLists(undefined)).toBe(true);
  });
});

describe('startLiveUpdates', () => {
  it('hands an open order screen one merged event and reads no list for a photo or a quotation', async () => {
    const heard = vi.fn();
    const off = onOrderChange('order-1', heard);
    socket.emit('onOrderUpdated', order(['evidence']));
    socket.emit('onOrderUpdated', order(['quotation']));
    expect(heard).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIVE_DEBOUNCE_MS);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0].kinds).toEqual(['evidence', 'quotation']);
    expect(keysRefetched()).toEqual([]);
    off();
  });

  it('reads the lists, counters and bookings again when a status changes', async () => {
    const counted = vi.fn();
    onOrderListsChange(counted);
    socket.emit('onOrderUpdated', order(['status']));
    await vi.advanceTimersByTimeAsync(LIVE_DEBOUNCE_MS);
    const keys = keysRefetched();
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['orders', 'technician-jobs']),
      JSON.stringify(['orders', 'technician-job-counts']),
      JSON.stringify(['orders', 'customer-list']),
      JSON.stringify(['warranty']),
      JSON.stringify(['bookings']),
    ]));
    // Wallets are not read for a status: they have their own event.
    expect(keys).not.toContain(JSON.stringify(['wallet']));
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it('marks an order nobody has open as stale without reading it', async () => {
    socket.emit('onOrderUpdated', order(['evidence'], 'order-9'));
    await vi.advanceTimersByTimeAsync(LIVE_DEBOUNCE_MS);
    expect(invalidated).toEqual(expect.arrayContaining([
      [['orders', 'customer-detail', 'order-9'], 'none'],
      [['orders', 'technician-detail', 'order-9'], 'none'],
    ]));
  });

  it('moves the map without any request, and routes bookings, invitations, wallets and notifications', async () => {
    const moved = vi.fn();
    onOrderLocation('order-1', moved);
    socket.emit('onOrderLocation', { serviceOrderId: 'order-1', lat: 10.77, lng: 106.69, updatedAt: null });
    socket.emit('onOrderLocation', { serviceOrderId: 'order-2', lat: 1, lng: 1, updatedAt: null });
    expect(moved).toHaveBeenCalledTimes(1);
    expect(invalidated).toEqual([]);

    const booked = vi.fn();
    onBookingChange('booking-1', booked);
    socket.emit('onBookingUpdated', { bookingId: 'booking-1', status: 'matched', serviceOrderId: 'order-1' });
    socket.emit('onInvitationUpdated', { invitationId: 'i1', bookingId: 'booking-1', status: 'expired' });
    socket.emit('onWalletUpdated', { scope: 'technician' });
    socket.emit('onNotificationNew', { id: 'n1' });
    await vi.advanceTimersByTimeAsync(LIVE_DEBOUNCE_MS);
    expect(booked).toHaveBeenCalledWith(expect.objectContaining({ status: 'matched' }));
    expect(keysRefetched()).toEqual(expect.arrayContaining([
      JSON.stringify(['bookings']),
      JSON.stringify(['invitations']),
      JSON.stringify(['wallet']),
      JSON.stringify(['earnings']),
      JSON.stringify(['notifications']),
    ]));
  });

  it('reads every open screen once after a reconnect, when changes may have been missed', async () => {
    const resynced = vi.fn();
    const counted = vi.fn();
    onResync(resynced);
    onOrderListsChange(counted);
    socket.emit('onRealtimeResync');
    expect(resynced).toHaveBeenCalledTimes(1);
    expect(counted).toHaveBeenCalledTimes(1);
    socket.emit('onReconnected');
    expect(resynced).toHaveBeenCalledTimes(2);
    expect(keysRefetched()).toEqual(expect.arrayContaining([JSON.stringify(['invitations']), JSON.stringify(['notifications'])]));
  });
});

describe('whileOffline', () => {
  it('polls only while the socket is down, and once when it comes back', async () => {
    const poll = vi.fn();
    socket.connected = false;
    const off = whileOffline(poll, 10_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(poll).toHaveBeenCalledTimes(2);
    socket.emit('onStatusChange', true);
    socket.emit('onReconnected');
    expect(poll).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(3);
    socket.emit('onStatusChange', false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(4);
    off();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it('does not poll at all while live', async () => {
    const poll = vi.fn();
    const off = whileOffline(poll, 5_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).not.toHaveBeenCalled();
    off();
  });
});

// Review 18/10/2026: a full read that began before a change must land before the partial read of that change.
describe('afterRunningRead', () => {
  it('waits for a read of the same screen already on its way, and not for anything else', async () => {
    const key = ['orders', 'customer-detail', 'order-1'];
    let finish!: (value: string) => void;
    void client.fetchQuery({ queryKey: key, queryFn: () => new Promise<string>((resolve) => { finish = resolve; }) });
    await vi.advanceTimersByTimeAsync(0);
    let waited = false;
    const waiting = afterRunningRead(client, key).then(() => { waited = true; });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(waited).toBe(false);
    finish('full read');
    await waiting;
    expect(waited).toBe(true);

    // Nothing running: no wait at all. A read that never ends is not waited on forever.
    await expect(afterRunningRead(client, ['orders', 'customer-detail', 'order-2'])).resolves.toBeUndefined();
    void client.fetchQuery({ queryKey: ['stuck'], queryFn: () => new Promise(() => undefined) });
    await vi.advanceTimersByTimeAsync(0);
    const stuck = afterRunningRead(client, ['stuck'], 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(stuck).resolves.toBeUndefined();
  });
});
