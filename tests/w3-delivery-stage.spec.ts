import { describe, expect, it } from 'vitest';
import { displayPartRequestStatus, isW3Delivery } from '../src/utils/w3-delivery-stage';

describe('W3 delivery stage display (W-16)', () => {
  it('shows the W3 progress of a request the server keeps at requested', () => {
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: 'TECHNICIAN_RECEIVED' })).toBe('received');
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: 'DISPATCH_RECORDED' })).toBe('delivering');
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: 'ISSUED_TO_COURIER' })).toBe('delivering');
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: 'RESERVED' })).toBe('ready');
    expect(displayPartRequestStatus({ status: 'requested', w3DeliveryStage: 'ENROLLED' })).toBe('requested');
  });
  it('leaves other requests and closed requests alone', () => {
    expect(displayPartRequestStatus({ status: 'ready' })).toBe('ready');
    expect(displayPartRequestStatus({ status: 'cancelled', w3DeliveryStage: 'RESERVED' })).toBe('cancelled');
    expect(isW3Delivery({ w3DeliveryStage: null })).toBe(false);
    expect(isW3Delivery({ w3DeliveryStage: 'ENROLLED' })).toBe(true);
  });
});

describe('console search without Vietnamese marks (W-2)', () => {
  it('folds marks and case', async () => {
    const { foldForSearch } = await import('../src/utils/formatters');
    expect(foldForSearch('Điều hòa')).toBe('dieu hoa');
    expect(foldForSearch('Bán kính xác nhận')).toContain('ban kinh');
    expect(foldForSearch(null)).toBe('');
  });
});

describe('W3 delivery received on the order pages (13/11)', () => {
  it('reads a received W3 request as received and lets completion pass the receipt check', async () => {
    const { vi } = await import('vitest');
    const client = (await import('../src/api/client')).default;
    const spy = vi.spyOn(client, 'get').mockResolvedValue({ data: { data: [
      { id: 'r1', status: 'requested', w3DeliveryStage: 'TECHNICIAN_RECEIVED', requestType: 'additional', items: [] },
      { id: 'r2', status: 'requested', w3DeliveryStage: 'DISPATCH_RECORDED', requestType: 'additional', items: [] },
    ] } } as never);
    const { partRequestsApi } = await import('../src/api/part-requests.api');
    const rows = await partRequestsApi.getByOrderId('o1');
    expect(rows.map((r) => r.status)).toEqual(['received', 'requested']);
    spy.mockRestore();
  });
});
