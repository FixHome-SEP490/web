// Screens that list many orders outside the query cache (part requests, returns,
// warranty queues, console order detail) hear every order change of a burst.
// Kept apart from live-updates so screens and their tests depend only on this bus.
import type { OrderChangeKind, OrderUpdatedEvent } from './chat-socket.service';

const anyOrderListeners = new Set<(events: OrderUpdatedEvent[]) => void>();

/** Called once per burst with every order that changed. */
export function onAnyOrderChange(listener: (events: OrderUpdatedEvent[]) => void): () => void {
  anyOrderListeners.add(listener);
  return () => anyOrderListeners.delete(listener);
}

/** Hands one merged burst to every listener (called by live-updates). */
export function publishOrderChanges(events: OrderUpdatedEvent[]): void {
  if (!events.length) return;
  for (const listener of [...anyOrderListeners]) listener(events);
}

/** True when one of these changes touches one of the kinds (no kinds: anything may have changed). */
export function eventsTouch(events: OrderUpdatedEvent[], kinds: readonly OrderChangeKind[]): boolean {
  return events.some((event) => !event.kinds || event.kinds.some((kind) => kinds.includes(kind)));
}
