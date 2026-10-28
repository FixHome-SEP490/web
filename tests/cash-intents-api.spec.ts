import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { cashIntentsApi, type CashIntent } from '../src/api/cash-intents.api';

const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data, ...(meta ? { meta } : {}) },
});

const intent: CashIntent = {
  id: '6a73b6a5-91dc-47c8-becf-847ab9bbfc83',
  scopeKind: 'VISIT_GROUP',
  scopeId: 'group-1',
  status: 'pending',
  grossVnd: 300000,
  customerDueVnd: 275000,
  technicianId: 'tech-1',
  createdAt: '2026-10-29T00:00:00.000Z',
  receivedAt: null,
  receiptId: null,
};

describe('cashIntentsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads server readiness and the authoritative group intent from the cash GET response', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope({ data: intent, cashFirstEnabled: true }));

    const result = await cashIntentsApi.get('VISIT_GROUP', 'group-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/finance/cash-intents/VISIT_GROUP/group-1');
    expect(result).toEqual({ cashFirstEnabled: true, intent });
  });

  it('keeps legacy capability false and fails closed when Backend omits readiness', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope({ data: null, cashFirstEnabled: false }));
    await expect(cashIntentsApi.get('SOLO', 'order-1')).resolves.toEqual({
      cashFirstEnabled: false,
      intent: null,
    });

    apiClientMock.get.mockResolvedValueOnce(envelope({ data: null }));
    await expect(cashIntentsApi.get('SOLO', 'order-1')).rejects.toThrow(
      'Backend returned an invalid cash intent capability response.',
    );
  });

  it('creates one intent with the idempotent command and optional funded reservation', async () => {
    const payload = {
      commandId: 'd5ced0eb-c3db-490c-98a9-1e14e50b2695',
      voucherReservationId: '7e268fbd-65b9-43c0-8a5f-27da11c88a11',
    };
    apiClientMock.post.mockResolvedValueOnce(envelope({ data: intent }));

    await expect(cashIntentsApi.create('VISIT_GROUP', 'group-1', payload)).resolves.toEqual(intent);

    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/finance/cash-intents/VISIT_GROUP/group-1',
      payload,
    );
  });

  it('cancels a pending customer intent using its scope, intent id and command id', async () => {
    const payload = { intentId: '6a73b6a5-91dc-47c8-becf-847ab9bbfc83', commandId: 'cdd1a22a-0ac7-4f82-9961-7f3fe8bc8e35' };
    apiClientMock.post.mockResolvedValueOnce(envelope({ data: { ...intent, status: 'cancelled' } }));

    const result = await cashIntentsApi.cancel('VISIT_GROUP', 'group-1', payload);

    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/finance/cash-intents/VISIT_GROUP/group-1/cancel',
      payload,
    );
    expect(result.status).toBe('cancelled');
  });

  it('records receipt only through the server intent route with the exact server due', async () => {
    const payload = {
      intentId: '6a73b6a5-91dc-47c8-becf-847ab9bbfc83',
      commandId: '06ae7a1b-32d3-49a2-89e3-46c4f52a3b84',
      receivedAmountVnd: 275000,
    };
    apiClientMock.post.mockResolvedValueOnce(envelope({ data: { ...intent, status: 'received', receivedAt: '2026-10-29T00:05:00.000Z' } }));

    const result = await cashIntentsApi.receive('VISIT_GROUP', 'group-1', payload);

    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/finance/cash-intents/VISIT_GROUP/group-1/received',
      payload,
    );
    expect(result).toMatchObject({ status: 'received', receivedAt: '2026-10-29T00:05:00.000Z' });
  });
});
