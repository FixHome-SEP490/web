import { describe, expect, it } from 'vitest';
import { technicianApprovedParts, technicianUsageLimit, technicianPreRepairLabel } from '../src/utils/technician-workflow';

describe('technician approved parts ceiling', () => {
  const part = (quantity: number) => ({ type: 'PARTS', partSource: 'fixhome', partCatalogId: 'sku', quantity });
  it('counts approved base and each approved supplement, never pending or rejected', () => {
    expect(technicianApprovedParts({ status: 'sent', items: [part(5)] }, [
      { status: 'APPROVED', items: [part(2)] }, { status: 'PENDING_APPROVAL', items: [part(4)] }, { status: 'REJECTED', items: [part(6)] },
    ])).toEqual({ sku: 2 });
    expect(technicianApprovedParts({ status: 'approved', items: [part(1)] }, [{ status: 'approved', items: [part(2)] }])).toEqual({ sku: 3 });
  });
  it('restricts unapproved stock to zero and subtracts use on other lines of the same SKU', () => {
    const item = { id: 'i1', partCatalogId: 'sku', quantity: 2 };
    const rows = [{ partRequestItemId: 'i1', issuedQty: 2, usedQty: 0, declaredQty: 0, managerAcceptedQty: 0 }, { partRequestItemId: 'i2', issuedQty: 2, usedQty: 1, declaredQty: 0, managerAcceptedQty: 0 }];
    const items = [item, { id: 'i2', partCatalogId: 'sku', quantity: 2 }];
    expect(technicianUsageLimit(item, {}, items, rows)).toBe(0);
    expect(technicianUsageLimit(item, { sku: 2 }, items, rows)).toBe(1);
    expect(technicianUsageLimit(item, { sku: 9 }, items, [{ ...rows[0]!, declaredQty: 1 }])).toBe(1);
    expect(technicianUsageLimit(item, null, items, rows)).toBe(0);
  });
  it('distinguishes unknown part reads from no speculative preorder', () => {
    expect(technicianPreRepairLabel(null)).toBe('Chưa kiểm tra được linh kiện');
    expect(technicianPreRepairLabel([])).toBe('Chưa đặt linh kiện trước');
    expect(technicianPreRepairLabel([{ requestType: 'pre_repair', status: 'ready' }])).toBe('Sẵn sàng nhận');
    expect(technicianPreRepairLabel([{ requestType: 'additional', status: 'ready' }])).toBe('Chưa đặt linh kiện trước');
  });
});
