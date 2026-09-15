import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { consoleOrderContextApi } from '../src/api/console-order-context.api';

const orderSample = {
  id: 'order-1',
  code: 'SO-1001',
  bookingId: 'booking-1',
  status: 'UNDER_REPAIR',
  scheduledAt: '2026-09-15T09:00:00.000Z',
  laborTotal: 180000,
  partsTotal: 120000,
  grandTotal: 300000,
  paymentStatus: 'UNPAID',
  createdAt: '2026-09-15T08:00:00.000Z',
  updatedAt: '2026-09-15T08:30:00.000Z',
};

const envelope = (data: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data },
});

describe('consoleOrderContextApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes the standard outer envelope through GET /service-orders/:id', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope(orderSample));

    const result = await consoleOrderContextApi.getConsoleOrderContext('order-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/service-orders/order-1');
    expect(result).toEqual(orderSample);
  });

  it('tolerates the currently observed double-nested detail envelope', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope({ data: orderSample }));

    const result = await consoleOrderContextApi.getConsoleOrderContext('order-1');

    expect(result.id).toBe('order-1');
    expect(result.code).toBe('SO-1001');
    expect(result.grandTotal).toBe(300000);
  });

  it('fails closed on a non-envelope response instead of rendering fake success', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: orderSample });

    await expect(consoleOrderContextApi.getConsoleOrderContext('order-1')).rejects.toThrow(
      'Backend returned an invalid service order response.',
    );
  });

  it('fails closed when required order context fields are missing', async () => {
    const { code, ...withoutCode } = orderSample;
    void code;
    apiClientMock.get.mockResolvedValueOnce(envelope(withoutCode));

    await expect(consoleOrderContextApi.getConsoleOrderContext('order-1')).rejects.toThrow(
      'Backend returned an invalid service order response.',
    );
  });

  it('fails closed on unsupported status and non-finite totals', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope({ ...orderSample, status: 'PENDING_MATCHING' }),
    );
    await expect(consoleOrderContextApi.getConsoleOrderContext('order-1')).rejects.toThrow(
      'Backend returned an unsupported service order status.',
    );

    apiClientMock.get.mockResolvedValueOnce(
      envelope({ ...orderSample, grandTotal: Number.NaN }),
    );
    await expect(consoleOrderContextApi.getConsoleOrderContext('order-1')).rejects.toThrow(
      'Backend returned an invalid service order response.',
    );
  });

  it.each(['PENDING_CONFIRMATION'])(
    'rejects %s as an unsupported ServiceOrder status (CashSettlement-only)',
    async (status) => {
      apiClientMock.get.mockResolvedValueOnce(envelope({ ...orderSample, status }));

      await expect(consoleOrderContextApi.getConsoleOrderContext('order-1')).rejects.toThrow(
        'Backend returned an unsupported service order status.',
      );
    },
  );

  it('fails closed on network failure without falling back to mock data', async () => {
    apiClientMock.get.mockRejectedValueOnce(new Error('Network Error'));

    await expect(consoleOrderContextApi.getConsoleOrderContext('order-1')).rejects.toThrow(
      'Network Error',
    );
  });

  it('treats missing timestamps as null instead of inventing values', async () => {
    const { scheduledAt, createdAt, updatedAt, ...rest } = orderSample;
    void scheduledAt;
    void createdAt;
    void updatedAt;
    apiClientMock.get.mockResolvedValueOnce(envelope(rest));

    const result = await consoleOrderContextApi.getConsoleOrderContext('order-1');

    expect(result.scheduledAt).toBeNull();
    expect(result.createdAt).toBeNull();
    expect(result.updatedAt).toBeNull();
  });
});
