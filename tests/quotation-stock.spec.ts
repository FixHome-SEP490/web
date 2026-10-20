import { describe, expect, it } from 'vitest';
import { suggestReceivedStock } from '../src/utils/quotation-stock';
import type { PartRequest } from '../src/api/part-requests.api';
import type { FixHomePart } from '../src/api/admin-parts.api';

const catalog = new Map([['sku1', { id: 'sku1', warrantyDays: 90, sku: 'V1' } as FixHomePart]]);
const request = { requestType: 'pre_repair', status: 'received', receivedAt: '2026-10-20', items: [
  { id: 'i1', partCatalogId: 'sku1', partSource: 'fixhome', partNameSnapshot: 'Van', quantity: 2, unitPriceSnapshot: '50000' },
] } as unknown as PartRequest;
describe('received stock quotation suggestions', () => {
  it('uses received backend prices and catalog warranty, without recording usage', () => {
    expect(suggestReceivedStock([], [request], catalog)).toEqual([expect.objectContaining({
      type: 'PARTS', partSource: 'fixhome', partCatalogId: 'sku1', description: 'Van', quantity: 2, unitPrice: 50000, warrantyDays: 90,
    })]);
    expect(request.items[0].usageStatus).toBeUndefined();
  });
  it('preserves edits, technician items and quantity without duplicating repeated refreshes', () => {
    const own = { type: 'PARTS' as const, partSource: 'technician' as const, description: 'Van riêng', quantity: 1, unitPrice: 123 };
    const first = suggestReceivedStock([own], [request], catalog);
    first[1].quantity = 1;
    expect(suggestReceivedStock(first, [request, request], catalog)).toEqual(first);
  });
  it('does not suggest unreceived, additional, returned or unknown-warranty stock', () => {
    for (const change of [{ status: 'ready' }, { receivedAt: null }, { requestType: 'additional' },
      { items: [{ ...request.items[0], usageStatus: 'returned' }] }]) {
      expect(suggestReceivedStock([], [{ ...request, ...change } as PartRequest], catalog)).toEqual([]);
    }
    expect(suggestReceivedStock([], [request], new Map())).toEqual([]);
  });
});
