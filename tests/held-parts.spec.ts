import { describe, expect, it } from 'vitest';
import { heldSpareParts } from '../src/utils/held-parts';
import type { PartRequest } from '../src/api/part-requests.api';

// BUG DETECTOR 14: the additional cost form offers the FixHome parts the technician still holds.
const request = (status: string, items: Array<{ id: string; quantity: number; usageStatus?: string; partCatalogId?: string }>) => ({
  id: `pr-${status}`, status, requestType: 'pre_repair',
  items: items.map((item) => ({ partSource: 'fixhome', partCatalogId: 'valve', partNameSnapshot: 'Van xả', unitPriceSnapshot: 50000, usageStatus: 'pending', ...item })),
}) as unknown as PartRequest;

describe('heldSpareParts', () => {
  it('offers what was received beyond the approved quotation', () => {
    const spare = heldSpareParts([request('received', [{ id: 'a', quantity: 2 }])], new Map(), [{ type: 'PARTS', quantity: 1, partSource: 'fixhome', partCatalogId: 'valve' }]);
    expect(spare).toEqual([{ partCatalogId: 'valve', name: 'Van xả', unitPrice: 50000, quantity: 1 }]);
  });

  it('leaves out returned lines, what is declared going back and what approved costs already use', () => {
    const spare = heldSpareParts(
      [request('received', [{ id: 'a', quantity: 3 }, { id: 'b', quantity: 2, usageStatus: 'returned' }]), request('cancelled', [{ id: 'c', quantity: 5 }])],
      new Map([['a', 1]]),
      [{ type: 'PARTS', quantity: 1, partSource: 'fixhome', partCatalogId: 'valve' }, { type: 'LABOR', quantity: 1 }],
    );
    expect(spare).toEqual([{ partCatalogId: 'valve', name: 'Van xả', unitPrice: 50000, quantity: 1 }]);
  });

  it('offers nothing when the approvals use everything held', () => {
    expect(heldSpareParts([request('received', [{ id: 'a', quantity: 1 }])], new Map(), [{ type: 'PARTS', quantity: 1, partSource: 'fixhome', partCatalogId: 'valve' }])).toEqual([]);
  });
});
