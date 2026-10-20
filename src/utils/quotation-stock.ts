import type { QuotationItemPayload } from '../api/orders.api';
import type { PartRequest } from '../api/part-requests.api';
import type { FixHomePart } from '../api/admin-parts.api';
import { billingAmount } from './order-billing';

/** Suggest once while preparing a quote; never mutate existing choices or usage. */
export function suggestReceivedStock(existing: QuotationItemPayload[], requests: PartRequest[], catalog: Map<string, FixHomePart>): QuotationItemPayload[] {
  const result = [...existing];
  const seen = new Set(existing.filter(item => item.partSource === 'fixhome').map(item => item.partCatalogId));
  const stock = new Map<string, QuotationItemPayload>();
  const seenItems = new Set<string>();
  for (const request of requests) {
    if (request.requestType !== 'pre_repair' || request.status !== 'received' || !request.receivedAt) continue;
    for (const item of request.items) {
      const id = item.partCatalogId;
      const price = billingAmount(item.unitPriceSnapshot);
      const part = id ? catalog.get(id) : undefined;
      if (!id || !part || part.warrantyDays == null || price === null || item.partSource !== 'fixhome' || item.usageStatus === 'returned' || seenItems.has(item.id) || seen.has(id)) continue;
      seenItems.add(item.id);
      const previous = stock.get(id);
      if (previous) { previous.quantity += item.quantity; continue; }
      stock.set(id, { type: 'PARTS', partSource: 'fixhome', partCatalogId: id, description: item.partNameSnapshot,
        partNameSnapshot: item.partNameSnapshot, quantity: item.quantity, unitPrice: price,
        warrantyDays: part.warrantyDays, warrantyPolicy: part.warrantyPolicy ?? undefined, partSku: part.sku ?? undefined });
    }
  }
  return [...result, ...stock.values()];
}
