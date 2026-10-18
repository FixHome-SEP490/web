// Live updates (PO 18/10/2026): screens follow what happens on the server as it
// happens, without polling and without reloading the page.
//
// The server announces every committed change with what it touched (see the
// backend's realtime listener). Here:
//   - a screen showing one order or booking registers for it and reads again
//     only the part that changed (photos, quotation, invoice, warranty...);
//   - lists and counters are read again only when an order's status or holder
//     changed, never for a photo or a price;
//   - the technician's position moves the customer's map directly, no request;
//   - wallets, invitations and notifications follow their own events.
// Events that arrive together are merged first. While the socket is down, the
// few screens that need it fall back to a slow poll, and read once when it is
// back, since the changes made meanwhile were not heard.
import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import { queryKeys } from '../lib/query-keys';
import {
  chatSocketService,
  type BookingUpdatedEvent,
  type OrderChangeKind,
  type OrderLocationEvent,
  type OrderUpdatedEvent,
} from './chat-socket.service';

/** Rows of one change arrive within moments of each other; one refresh covers them. */
export const LIVE_DEBOUNCE_MS = 150;

/** Kinds that change what an order list or a counter shows. */
const LIST_KINDS: ReadonlySet<OrderChangeKind> = new Set(['status', 'order', 'assignment', 'invoice', 'cash', 'warranty']);

const orderListeners = new Map<string, Set<(event: OrderUpdatedEvent) => void>>();
const locationListeners = new Map<string, Set<(event: OrderLocationEvent) => void>>();
const bookingListeners = new Map<string, Set<(event: BookingUpdatedEvent) => void>>();
const resyncListeners = new Set<() => void>();
const listListeners = new Set<() => void>();

function register<T>(map: Map<string, Set<T>>, key: string, listener: T): () => void {
  const set = map.get(key) ?? new Set<T>();
  set.add(listener);
  map.set(key, set);
  return () => {
    set.delete(listener);
    if (!set.size) map.delete(key);
  };
}

/** A screen showing this order hears what changed in it, merged, to read only that part again. */
export function onOrderChange(orderId: string, listener: (event: OrderUpdatedEvent) => void): () => void {
  return register(orderListeners, orderId, listener);
}

/** The customer's map follows the technician on the way. */
export function onOrderLocation(orderId: string, listener: (event: OrderLocationEvent) => void): () => void {
  return register(locationListeners, orderId, listener);
}

/** A screen showing this booking hears when it is taken, closed or its invitations move on. */
export function onBookingChange(bookingId: string, listener: (event: BookingUpdatedEvent) => void): () => void {
  return register(bookingListeners, bookingId, listener);
}

/** Called (once per burst) when an order's status or holder changed, for counters kept outside the query cache. */
export function onOrderListsChange(listener: () => void): () => void {
  listListeners.add(listener);
  return () => listListeners.delete(listener);
}

/** Called when changes may have been missed (socket or server reconnected): read once. */
export function onResync(listener: () => void): () => void {
  resyncListeners.add(listener);
  return () => resyncListeners.delete(listener);
}

/** Every kind ever announced for an order, so a merged event says all that changed. */
export function mergeKinds(a: OrderChangeKind[] | undefined, b: OrderChangeKind[] | undefined): OrderChangeKind[] | undefined {
  // An event without kinds (older server) means anything may have changed.
  if (!a || !b) return undefined;
  return [...new Set([...a, ...b])].sort();
}

/** True when this change can move an order between list tabs or change a counter. */
export function touchesLists(kinds: OrderChangeKind[] | undefined): boolean {
  return !kinds || kinds.some((kind) => LIST_KINDS.has(kind));
}

/**
 * Runs `poll` every `everyMs` only while the socket is down, and once when it
 * comes back: the screen keeps up even without live updates, and does not poll
 * while they work.
 */
export function whileOffline(poll: () => void, everyMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (!timer) timer = setInterval(poll, everyMs);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  if (!chatSocketService.connected) start();
  const unsubscribe = chatSocketService.subscribe({
    onStatusChange(connected) {
      if (connected) {
        stop();
      } else {
        start();
      }
    },
    onReconnected: poll,
    onRealtimeResync: poll,
  });
  return () => {
    stop();
    unsubscribe();
  };
}

/**
 * Waits for a read of `queryKey` that is already running (opening the page,
 * coming back to the tab) before a screen reads the part a change touched. That
 * read began before the change, so landing after the partial one it would put
 * the old state back, and no further event would come to correct it.
 */
export function afterRunningRead(client: QueryClient, queryKey: QueryKey, maxWaitMs = 20_000): Promise<void> {
  const cache = client.getQueryCache();
  const query = cache.find({ queryKey, exact: true });
  if (!query || query.state.fetchStatus !== 'fetching') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, maxWaitMs);
    const unsubscribe = cache.subscribe((event) => {
      if (event.query === query && query.state.fetchStatus !== 'fetching') done();
    });
  });
}

const refreshActive = (client: QueryClient, keys: readonly QueryKey[]) =>
  Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey, refetchType: 'active' })));

/** The order list and counter queries of every role. */
const ORDER_LIST_KEYS: readonly QueryKey[] = [
  ['orders', 'technician-jobs'],
  queryKeys.orders.technicianJobCounts,
  queryKeys.orders.technicianActive,
  queryKeys.orders.technicianCalendar,
  ['orders', 'customer-list'],
  queryKeys.orders.customerRecent,
  ['orders', 'history'],
  ['orders', 'console'],
  queryKeys.orders.cancellations,
  queryKeys.consoleDashboard,
];

export function startLiveUpdates(client: QueryClient): () => void {
  const orders = new Map<string, OrderUpdatedEvent>();
  const bookings = new Map<string, BookingUpdatedEvent>();
  let invitationsChanged = false;
  let walletsChanged = false;
  let notificationsChanged = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const orderEvents = [...orders.values()];
    const bookingEvents = [...bookings.values()];
    orders.clear();
    bookings.clear();

    let lists = false;
    let warranty = false;
    for (const event of orderEvents) {
      const listeners = orderListeners.get(event.serviceOrderId);
      if (listeners?.size) {
        for (const listener of [...listeners]) listener(event);
      } else {
        // Nobody has it open: it is read again on the next visit only.
        void client.invalidateQueries({ queryKey: queryKeys.orders.customerDetail(event.serviceOrderId), refetchType: 'none' });
        void client.invalidateQueries({ queryKey: queryKeys.orders.technicianDetail(event.serviceOrderId), refetchType: 'none' });
      }
      lists ||= touchesLists(event.kinds);
      warranty ||= !event.kinds || event.kinds.includes('warranty') || event.kinds.includes('status');
    }
    for (const event of bookingEvents) {
      for (const listener of [...(bookingListeners.get(event.bookingId) ?? [])]) listener(event);
    }

    const keys: QueryKey[] = [];
    if (lists) keys.push(...ORDER_LIST_KEYS);
    if (warranty) keys.push(queryKeys.warranty.all);
    if (bookingEvents.length || (lists && orderEvents.some((event) => !event.kinds || event.kinds.includes('status')))) {
      keys.push(queryKeys.bookings.all);
    }
    if (invitationsChanged) keys.push(queryKeys.invitations.all);
    if (walletsChanged) keys.push(queryKeys.wallet.all, queryKeys.earnings.all);
    if (notificationsChanged) keys.push(queryKeys.notifications.all);
    if (lists) for (const listener of [...listListeners]) listener();
    invitationsChanged = false;
    walletsChanged = false;
    notificationsChanged = false;
    if (keys.length) void refreshActive(client, keys);
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, LIVE_DEBOUNCE_MS);
  };

  /** Read every open screen once: changes may have been missed. */
  const resync = () => {
    for (const listener of [...resyncListeners]) listener();
    for (const listener of [...listListeners]) listener();
    void refreshActive(client, [...ORDER_LIST_KEYS, queryKeys.bookings.all, queryKeys.invitations.all, queryKeys.wallet.all, queryKeys.warranty.all, queryKeys.notifications.all]);
  };

  const unsubscribe = chatSocketService.subscribe({
    onOrderUpdated(event) {
      const known = orders.get(event.serviceOrderId);
      orders.set(event.serviceOrderId, known ? { ...event, kinds: mergeKinds(known.kinds, event.kinds) } : event);
      schedule();
    },
    onOrderLocation(event) {
      for (const listener of [...(locationListeners.get(event.serviceOrderId) ?? [])]) listener(event);
    },
    onBookingUpdated(event) {
      bookings.set(event.bookingId, event);
      schedule();
    },
    onInvitationUpdated() {
      invitationsChanged = true;
      schedule();
    },
    onWalletUpdated() {
      walletsChanged = true;
      schedule();
    },
    onNotificationNew() {
      notificationsChanged = true;
      schedule();
    },
    onReconnected: resync,
    onRealtimeResync: resync,
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
