// Live order screens (PO 18/10/2026): when the server says an order changed
// (status, quotation, invoice, payment, warranty), the order data on screen is
// read again and copies no page shows are dropped, so the technician's job list
// and the customer's order pages follow without polling or a reload.
import type { QueryClient } from '@tanstack/vue-query';
import { affectedBy, queryKeys, refreshAfterChange } from '../lib/query-keys';
import { chatSocketService } from './chat-socket.service';

/** Several rows of one change arrive together; one refresh covers them. */
export const ORDER_REFRESH_DEBOUNCE_MS = 250;

export function startOrderRealtime(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    timer = null;
    void refreshAfterChange(client, [...affectedBy.orderChange, queryKeys.invitations.all]);
  };
  const unsubscribe = chatSocketService.subscribe({
    onOrderUpdated() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, ORDER_REFRESH_DEBOUNCE_MS);
    },
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
