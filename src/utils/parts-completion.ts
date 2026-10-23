import type { PartRequest } from '../api/part-requests.api';

interface CostLine {
  type: string;
  quantity: number;
  partSource?: string | null;
  partCatalogId?: string | null;
}

export const PARTS_MISMATCH = 'Lượng linh kiện FixHome đã nhận và ghi nhận dùng hoặc hoàn trả chưa khớp báo giá.';
export const ADDITIONAL_NOT_RECEIVED = 'Linh kiện FixHome theo chi phí phát sinh cần được nhận bằng QR.';
export const ADDITIONAL_NOT_RECORDED = 'Ghi nhận đã dùng hoặc hoàn trả linh kiện FixHome theo chi phí phát sinh.';

const isFixHomePart = (line: CostLine) => String(line.type).toUpperCase() !== 'LABOR' && line.partSource === 'fixhome';
const add = (map: Map<string, number>, key: string, quantity: number) => map.set(key, (map.get(key) ?? 0) + quantity);

/**
 * What still stands between the technician and "Hoàn thành" on the parts side, the same way
 * the Backend checks it at invoice time. Used quantities come from the custody ledger, so a
 * line of 2 used 1 and returned 1 counts 1 (BUG DETECTOR 12). Each approval keeps its own
 * quantity, and units delivered for the quotation beyond its approval may serve an approved
 * additional cost that has no units of its own (BUG DETECTOR 14).
 */
export function partsCompletionBlockers(
  quote: { id: string; items: CostLine[] } | null,
  approvedCosts: Array<{ id: string; items: CostLine[] }>,
  requests: PartRequest[],
  usedByItem: ReadonlyMap<string, number>,
): string[] {
  const blockers: string[] = [];
  const settled = (request: PartRequest) => request.status === 'received' || request.status === 'completed';
  const approvedBase = new Map<string, number>();
  let unmatched = false;
  for (const line of (quote?.items ?? []).filter(isFixHomePart)) {
    if (!line.partCatalogId || !Number.isSafeInteger(line.quantity) || line.quantity < 1) unmatched = true;
    else add(approvedBase, line.partCatalogId, line.quantity);
  }

  const tally = (rows: PartRequest[]) => {
    const resolved = new Map<string, number>();
    const used = new Map<string, number>();
    for (const request of rows.filter(settled)) {
      for (const item of request.items) {
        if (item.partSource !== 'fixhome' || !item.partCatalogId || (item.usageStatus !== 'used' && item.usageStatus !== 'returned')) continue;
        add(resolved, item.partCatalogId, item.quantity);
        if (item.usageStatus === 'used') add(used, item.partCatalogId, usedByItem.get(item.id) ?? item.quantity);
      }
    }
    return { resolved, used };
  };

  const base = tally(requests.filter((request) => request.requestType === 'pre_repair' ||
    (!!quote && request.requestType === 'quotation' && request.quotationId === quote.id && !request.additionalCostId)));

  // What approved additional costs lack from their own requests, per part: the quotation's surplus covers it.
  const resolvedNeed = new Map<string, number>();
  const usedRoom = new Map<string, number>();
  for (const cost of approvedCosts) {
    const lines = cost.items.filter(isFixHomePart);
    if (!lines.length) continue;
    const approved = new Map<string, number>();
    for (const line of lines) if (line.partCatalogId) add(approved, line.partCatalogId, line.quantity);
    const own = requests.filter((request) => request.requestType === 'additional' && request.additionalCostId === cost.id && request.status !== 'cancelled');
    if (own.length) {
      if (own.some((request) => !settled(request) || !request.receivedAt)) {
        // Still on its way: the QR handover is what is missing, not a quantity.
        blockers.push(ADDITIONAL_NOT_RECEIVED);
        continue;
      }
      if (own.some((request) => request.items.some((item) => item.partSource === 'fixhome' && item.usageStatus !== 'used' && item.usageStatus !== 'returned'))) {
        // Its usage is what is missing; quantities are checked once it is recorded.
        blockers.push(ADDITIONAL_NOT_RECORDED);
        continue;
      }
    }
    const mine = tally(own);
    for (const [part, quantity] of approved) {
      if ((mine.used.get(part) ?? 0) > quantity) unmatched = true;
      add(resolvedNeed, part, Math.max(0, quantity - (mine.resolved.get(part) ?? 0)));
      add(usedRoom, part, Math.max(0, quantity - (mine.used.get(part) ?? 0)));
    }
  }

  for (const part of new Set([...approvedBase.keys(), ...resolvedNeed.keys(), ...base.used.keys()])) {
    const approved = approvedBase.get(part) ?? 0;
    if ((base.resolved.get(part) ?? 0) < approved + (resolvedNeed.get(part) ?? 0)) unmatched = true;
    if ((base.used.get(part) ?? 0) > approved + (usedRoom.get(part) ?? 0)) unmatched = true;
  }
  if (unmatched) blockers.push(PARTS_MISMATCH);
  return [...new Set(blockers)];
}
