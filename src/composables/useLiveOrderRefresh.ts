import { onUnmounted } from 'vue';
import type { OrderChangeKind, OrderUpdatedEvent } from '../services/chat-socket.service';
import { onResync } from '../services/live-updates';
import { eventsTouch, onAnyOrderChange } from '../services/order-change-bus';

/**
 * Reads a screen again when the server announces a change of these kinds
 * (optionally only for one order), and once after a reconnect. Events are
 * already merged per burst; this waits a moment more so a burst is one read.
 * No polling: the screen reads only when something it shows changed.
 */
export function useLiveOrderRefresh(
  kinds: readonly OrderChangeKind[],
  refresh: () => unknown,
  orderId?: () => string | null | undefined,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const schedule = () => {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (!disposed) void refresh(); }, 200);
  };
  const matches = (events: OrderUpdatedEvent[]) => {
    const id = orderId?.();
    const relevant = id ? events.filter(event => event.serviceOrderId === id) : events;
    return relevant.length > 0 && eventsTouch(relevant, kinds);
  };
  const stopOrders = onAnyOrderChange(events => { if (matches(events)) schedule(); });
  const stopResync = onResync(schedule);
  onUnmounted(() => {
    disposed = true;
    clearTimeout(timer);
    stopOrders();
    stopResync();
  });
}
