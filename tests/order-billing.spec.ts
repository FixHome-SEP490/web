import { describe, expect, it } from 'vitest';
import { orderBilling, paymentChannels } from '../src/utils/order-billing';
import type { ServiceOrderItem, AdditionalCostRecord } from '../src/api/orders.api';
import type { PartRequest } from '../src/api/part-requests.api';

const part = { type: 'PARTS', description: 'Van', quantity: 1, unitPrice: 550000, lineTotal: 550000, partSource: 'fixhome', partCatalogId: 'sku1' };
const order = { quotation: { id: 'q1', status: 'approved', items: [part] }, laborTotal: 0, partsTotal: 0, grandTotal: 0 } as unknown as ServiceOrderItem;
const free = { id: 'inv1', laborTotal: '0', partsTotal: '0', grandTotal: '0', items: [] };

describe('phase-specific billing', () => {
  it('uses the approved quotation plus approved extras before invoicing', () => {
    const costs = [{ status: 'APPROVED', totalLaborDelta: 10000, totalPartsDelta: 20000, shippingFee: 5000, items: [] },
      { status: 'REJECTED', totalLaborDelta: 999, totalPartsDelta: 999, items: [] }] as unknown as AdditionalCostRecord[];
    expect(orderBilling(order, null, costs)).toMatchObject({ labor: 10000, parts: 570000, total: 585000, final: false });
  });
  it('keeps invoice zero authoritative and flags a positive approved quote', () => {
    expect(orderBilling(order, free)).toMatchObject({ labor: 0, parts: 0, total: 0, items: [], mismatch: true, final: true });
  });
  it('does not reuse proposed or rejected quotations as approved money', () => {
    expect(orderBilling({ ...order, quotation: { ...order.quotation!, status: 'REJECTED' } }, null).total).toBeNull();
  });
  it('allows true zero and blocks missing/invalid final totals', () => {
    expect(orderBilling({ ...order, quotation: undefined }, free).mismatch).toBe(false);
    for (const grandTotal of [null, undefined, '', -1, 'invalid']) {
      expect(orderBilling(order, { ...free, grandTotal }).total).toBeNull();
    }
  });
  it('blocks zero when approved amounts or the invoice breakdown are malformed or incomplete', () => {
    for (const lineTotal of [NaN, undefined, 'invalid']) {
      const broken = { ...order, quotation: { ...order.quotation!, items: [{ ...part, lineTotal }] } } as unknown as ServiceOrderItem;
      expect(orderBilling(broken, free).mismatch).toBe(true);
    }
    expect(orderBilling({ ...order, quotation: { ...order.quotation!, partsTotal: 550000, items: [] } }, free).mismatch).toBe(true);
    expect(orderBilling({ ...order, quotation: { ...order.quotation!, partsTotal: 550000, items: [{ ...part, unitPrice: 0, lineTotal: 0 }] } }, free).mismatch).toBe(true);
    expect(orderBilling({ ...order, quotation: undefined }, free, [{ status: 'APPROVED', totalLaborDelta: 0, totalPartsDelta: 550000, items: [] } as unknown as AdditionalCostRecord]).mismatch).toBe(true);
    expect(orderBilling({ ...order, quotation: undefined }, { ...free, laborTotal: 5000 }).mismatch).toBe(true);
    expect(orderBilling({ ...order, quotation: undefined }, { id: 'inv1', grandTotal: 0 }).mismatch).toBe(true);
    expect(orderBilling({ ...order, quotation: undefined, pricingMode: 'fixed_price', fixedUnitPrice: 5000 }, free).mismatch).toBe(true);
  });
  it('accepts zero only with complete matching received RETURNED proof', () => {
    const request = { requestType: 'pre_repair', status: 'received', receivedAt: '2026-10-20', items: [{ ...part, partSource: 'fixhome', usageStatus: 'returned' }] } as unknown as PartRequest;
    expect(orderBilling(order, free, [], [request]).mismatch).toBe(false);
    for (const change of [{ status: 'ready' }, { requestType: 'additional', additionalCostId: 'other' }, { receivedAt: null },
      { items: [{ ...request.items[0], usageStatus: 'pending' }] }, { items: [{ ...request.items[0], partCatalogId: 'other' }] }]) {
      expect(orderBilling(order, free, [], [{ ...request, ...change } as PartRequest]).mismatch).toBe(true);
    }
    expect(orderBilling(order, free, [], [{ ...request, items: [{ ...request.items[0], quantity: NaN }] }]).mismatch).toBe(true);
    const duplicated = { ...order, quotation: { ...order.quotation!, items: [order.quotation!.items[0], order.quotation!.items[0]] } };
    expect(orderBilling(duplicated, free, [], [request]).mismatch).toBe(true);
  });
  it('shows invoice lines and totals without reusing quoted lines', () => {
    const item = { type: 'labor', description: 'Công thực tế', quantity: 1, unitPrice: '5000', lineTotal: '5000' };
    expect(orderBilling(order, { id: 'i', laborTotal: '5000', partsTotal: '0', grandTotal: '5000', items: [item] })).toMatchObject({ labor: 5000, parts: 0, total: 5000, items: [{ description: 'Công thực tế' }] });
  });
});

describe('invoice payment boundaries', () => {
  it.each([
    [null, []], [-1, []], [0, ['no-charge']], [1, ['wallet', 'cash']], [4999, ['wallet', 'cash']],
    [5000, ['wallet', 'cash', 'vnpay']], [0.5, []],
  ])('%s', (amount, channels) => expect(paymentChannels(amount)).toEqual(channels));
  it('blocks every channel on a financial mismatch', () => expect(paymentChannels(0, true)).toEqual([]));
});
