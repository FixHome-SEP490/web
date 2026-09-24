import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { partRequestsApi } from '../src/api/part-requests.api';
import { partsCatalogApi } from '../src/api/parts-catalog.api';
import router from '../src/router';

describe('Part Requests Flow & API Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates pre-repair part request via partRequestsApi.createPreRepair', async () => {
    apiClientMock.post.mockResolvedValueOnce({
      data: {
        data: {
          id: 'pr-123',
          serviceOrderId: 'order-1',
          technicianId: 'tech-1',
          requestType: 'pre_repair',
          fulfillmentMethod: 'pickup',
          status: 'requested',
          items: [{ id: 'item-1', partNameSnapshot: 'Mainboard', quantity: 1, unitPriceSnapshot: 500000, usageStatus: 'pending' }],
        },
      },
    });

    const result = await partRequestsApi.createPreRepair('order-1', {
      items: [{ partCatalogId: 'cat-1', quantity: 1, note: 'Check board' }],
      fulfillmentMethod: 'pickup',
      reason: 'Suspected board issue',
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/service-orders/order-1/part-requests', {
      items: [{ partCatalogId: 'cat-1', quantity: 1, note: 'Check board' }],
      fulfillmentMethod: 'pickup',
      reason: 'Suspected board issue',
    });
    expect(result.id).toBe('pr-123');
    expect(result.status).toBe('requested');
  });

  it('receives parts via QR token via partRequestsApi.receiveByQr', async () => {
    apiClientMock.post.mockResolvedValueOnce({
      data: {
        data: {
          id: 'pr-123',
          status: 'received',
          receivedAt: new Date().toISOString(),
        },
      },
    });

    const result = await partRequestsApi.receiveByQr('pr-123', {
      qrToken: 'FH-PR-ABCDEF123456',
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/part-requests/pr-123/receive', {
      qrToken: 'FH-PR-ABCDEF123456',
    });
    expect(result.status).toBe('received');
  });

  it('updates item usage status to used or returned', async () => {
    apiClientMock.patch.mockResolvedValueOnce({
      data: {
        data: {
          id: 'item-1',
          usageStatus: 'used',
        },
      },
    });

    const result = await partRequestsApi.updateItemUsage('pr-123', 'item-1', {
      usageStatus: 'used',
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/part-requests/pr-123/items/item-1/usage', {
      usageStatus: 'used',
    });
    expect(result.usageStatus).toBe('used');
  });

  it('SM marks request ready via partRequestsApi.markReady', async () => {
    apiClientMock.patch.mockResolvedValueOnce({
      data: {
        data: {
          id: 'pr-123',
          status: 'ready',
          qrToken: 'FH-PR-TOKEN-999',
        },
      },
    });

    const result = await partRequestsApi.markReady('pr-123');

    expect(apiClientMock.patch).toHaveBeenCalledWith('/part-requests/pr-123/ready', {});
    expect(result.status).toBe('ready');
    expect(result.qrToken).toBe('FH-PR-TOKEN-999');
  });

  it('SM marks request delivering via partRequestsApi.markDelivering', async () => {
    apiClientMock.patch.mockResolvedValueOnce({
      data: {
        data: {
          id: 'pr-123',
          status: 'delivering',
          shippingFee: 25000,
        },
      },
    });

    const result = await partRequestsApi.markDelivering('pr-123', { shippingFee: 25000 });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/part-requests/pr-123/delivering', { shippingFee: 25000 });
    expect(result.status).toBe('delivering');
  });

  it('fetches catalog parts via partsCatalogApi.getCatalog', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'part-1', name: 'Board X', sellingPrice: 200000 }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const result = await partsCatalogApi.getCatalog({ limit: 10 });
    expect(apiClientMock.get).toHaveBeenCalledWith('/parts/catalog', { params: { limit: 10 } });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Board X');
  });

  it('verifies /console/part-requests route is registered with appropriate roles', () => {
    const route = router.getRoutes().find((r) => r.path === '/console/part-requests');
    expect(route).toBeDefined();
    expect(route?.meta?.roles).toContain('SERVICE_MANAGER');
    expect(route?.meta?.roles).toContain('ADMIN');
    expect(route?.meta?.title).toBe('Yêu cầu linh kiện');
  });
});
