import type { PartRequest } from '../api/part-requests.api';

export interface HeldSparePart {
  partCatalogId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

interface ApprovedLine {
  type: string;
  quantity: number;
  partSource?: string | null;
  partCatalogId?: string | null;
}

/**
 * FixHome parts the technician still holds for an order beyond what the approved quotation and
 * the approved additional costs use (BUG DETECTOR 14): every live line not returned, less what
 * the technician declared going back, less the approved quantities. The Backend nets an approved
 * additional cost against the same stock, so these lines ask the warehouse for nothing new.
 */
export function heldSpareParts(
  requests: PartRequest[],
  declaredBackByItem: ReadonlyMap<string, number>,
  approvedLines: ApprovedLine[],
): HeldSparePart[] {
  const spare = new Map<string, HeldSparePart>();
  for (const request of requests) {
    if (!['requested', 'ready', 'delivering', 'received'].includes(request.status)) continue;
    for (const item of request.items) {
      if (item.partSource !== 'fixhome' || !item.partCatalogId || item.usageStatus === 'returned') continue;
      const row = spare.get(item.partCatalogId) ?? { partCatalogId: item.partCatalogId, name: item.partNameSnapshot, unitPrice: Number(item.unitPriceSnapshot) || 0, quantity: 0 };
      row.quantity += item.quantity - (declaredBackByItem.get(item.id) ?? 0);
      spare.set(item.partCatalogId, row);
    }
  }
  for (const line of approvedLines) {
    if (String(line.type).toUpperCase() === 'LABOR' || line.partSource !== 'fixhome' || !line.partCatalogId) continue;
    const row = spare.get(line.partCatalogId);
    if (row) row.quantity -= line.quantity;
  }
  return [...spare.values()].filter((row) => row.quantity > 0);
}
