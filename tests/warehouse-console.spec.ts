import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { warehousesApi } from '../src/api/warehouses.api';
import { consoleNavigation } from '../src/components/console/console-navigation';
import { canAdministerWarehouse, canConfirmWarehouseHandover, canTechnicianAcknowledgeWarehousePickup, warehouseQrAction, warehouseReturnAccepted } from '../src/utils/warehouse-fulfillment';
import router from '../src/router';

describe('Warehouse console API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads warehouse rows and paginated stock using the documented endpoints', async () => {
    apiClientMock.get
      .mockResolvedValueOnce({ data: [{ id: 'warehouse-1', name: 'Kho A', address: null, status: 'active', responsibleUserId: 'sm-1', createdAt: '', updatedAt: '' }] })
      .mockResolvedValueOnce({ data: { data: [{ warehouseId: 'warehouse-1', partId: 'part-1', partName: 'Lọc gió', sku: 'FH-1', onHand: 0, reserved: 0, available: 0, version: 0 }], meta: { total: 1, limit: 25, offset: 0 } } });

    const warehouses = await warehousesApi.list();
    const stock = await warehousesApi.getStock('warehouse-1', { limit: 25, offset: 0 });

    expect(apiClientMock.get).toHaveBeenNthCalledWith(1, '/warehouses');
    expect(apiClientMock.get).toHaveBeenNthCalledWith(2, '/warehouses/warehouse-1/stock', { params: { limit: 25, offset: 0 } });
    expect(warehouses[0]?.responsibleUserId).toBe('sm-1');
    expect(stock.data[0]?.available).toBe(0);
  });

  it('sends one stock adjustment with the selected catalog id and stable idempotency key', async () => {
    const payload = { partId: 'real-catalog-part', delta: 8, kind: 'stock_in' as const, reason: 'Nhập lô kiểm kê', idempotencyKey: '00000000-0000-4000-8000-000000000001' };
    apiClientMock.post.mockResolvedValueOnce({ data: { id: 'movement-1', warehouseId: 'warehouse-1', ...payload, actorUserId: 'sm-1', onHandAfter: 8, reservedAfter: 0, createdAt: '2026-11-04T00:00:00.000Z' } });

    const result = await warehousesApi.adjustStock('warehouse-1', payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/warehouses/warehouse-1/stock-adjustments', payload);
    expect(result.onHandAfter).toBe(8);
  });

  it('uses only the documented W2 allocation, reserve, QR, handover and technician receive routes', async () => {
    const allocation = { partRequestId: 'pr-1', mode: 'warehouse' as const, status: 'reserved' as const, warehouseId: 'wh-1', warehouseName: 'Kho A', responsibleUserId: 'sm-1', distanceNotVerified: true, reviewRequired: true, tokenExpiresAt: null, tokenVersion: 0, handedOverAt: null, receivedAt: null };
    apiClientMock.get.mockResolvedValueOnce({ data: { data: allocation } });
    apiClientMock.post
      .mockResolvedValueOnce({ data: { data: allocation } })
      .mockResolvedValueOnce({ data: { data: { allocation: { ...allocation, status: 'ready' }, qrToken: 'pickup-secret' } } })
      .mockResolvedValueOnce({ data: { data: { allocation: { ...allocation, status: 'handed_over' }, qrToken: 'receipt-secret' } } })
      .mockResolvedValueOnce({ data: { data: { id: 'pr-1', status: 'received' } } });

    await expect((await import('../src/api/part-requests.api')).partRequestsApi.getWarehouseAllocation('pr-1')).resolves.toMatchObject({ status: 'reserved' });
    await (await import('../src/api/part-requests.api')).partRequestsApi.reserveWarehouse('pr-1', { idempotencyKey: 'key-1' });
    await (await import('../src/api/part-requests.api')).partRequestsApi.prepareWarehouseQr('pr-1', { idempotencyKey: 'key-2' });
    const handover = await (await import('../src/api/part-requests.api')).partRequestsApi.confirmWarehouseHandover('pr-1', { qrToken: 'pickup-secret', idempotencyKey: 'key-3' });
    await (await import('../src/api/part-requests.api')).partRequestsApi.receiveByQr('pr-1', { qrToken: handover.qrToken! });

    expect(apiClientMock.get).toHaveBeenLastCalledWith('/part-requests/pr-1/warehouse-allocation');
    expect(apiClientMock.post.mock.calls.map(([path]) => path)).toEqual([
      '/part-requests/pr-1/warehouse-reserve',
      '/part-requests/pr-1/warehouse-qr',
      '/part-requests/pr-1/warehouse-handover',
      '/part-requests/pr-1/receive',
    ]);
    expect(handover.qrToken).toBe('receipt-secret');
  });

  it('keeps warehouse create and delete behind the Admin route and menu', () => {
    const route = router.resolve('/console/warehouses').matched.at(-1);
    expect(route?.meta.roles).toEqual(['SERVICE_MANAGER', 'ADMIN']);
    const smPaths = consoleNavigation('SERVICE_MANAGER').flatMap((group) => group.items.map((item) => item.path));
    const adminPaths = consoleNavigation('ADMIN').flatMap((group) => group.items.map((item) => item.path));
    expect(smPaths).toContain('/console/warehouses');
    expect(adminPaths).toContain('/console/warehouses');
    expect(canAdministerWarehouse('SERVICE_MANAGER')).toBe(false);
    expect(canAdministerWarehouse('TECHNICIAN')).toBe(false);
  });

  it('allows technician acknowledgement only after assigned SM handover', () => {
    const base = { partRequestId: 'pr-1', mode: 'warehouse' as const, warehouseId: 'wh-1', responsibleUserId: 'sm-1' };
    expect(canTechnicianAcknowledgeWarehousePickup({ ...base, status: 'reserved' })).toBe(false);
    expect(canTechnicianAcknowledgeWarehousePickup({ ...base, status: 'ready' })).toBe(false);
    expect(canTechnicianAcknowledgeWarehousePickup({ ...base, status: 'handed_over' })).toBe(true);
    expect(canConfirmWarehouseHandover('ADMIN', 'admin-1', { ...base, status: 'ready' })).toBe(false);
    expect(canConfirmWarehouseHandover('SERVICE_MANAGER', 'other-sm', { ...base, status: 'ready' })).toBe(false);
    expect(canConfirmWarehouseHandover('SERVICE_MANAGER', 'sm-1', { ...base, status: 'ready' })).toBe(true);
    expect(warehouseQrAction('reserved')).toBe('prepare');
    expect(warehouseQrAction('ready')).toBe('prepare');
    expect(warehouseQrAction('handed_over')).toBe('reissue');
    expect(warehouseQrAction('received')).toBe(null);
  });

  it('labels stock as returned only after a warehouse manager acceptance is recorded', () => {
    expect(warehouseReturnAccepted('warehouse', 0)).toBe(false);
    expect(warehouseReturnAccepted('warehouse', 1)).toBe(true);
    expect(warehouseReturnAccepted('legacy', 1)).toBe(false);
  });

  it('rejects a zero quantity adjustment before it reaches the Backend', async () => {
    await expect(warehousesApi.adjustStock('warehouse-1', {
      partId: 'real-catalog-part', delta: 0, kind: 'correction', reason: 'Kiểm kê',
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    })).rejects.toThrow('Số lượng điều chỉnh không hợp lệ.');
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });
});
