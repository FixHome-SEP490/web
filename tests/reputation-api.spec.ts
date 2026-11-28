import { beforeEach, describe, expect, it, vi } from 'vitest';

// BUG 318: the reputation page reads its stat cards through the real api module; only the HTTP client is mocked.
const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { reputationApi } from '../src/api/reputation.api';

const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data, ...(meta ? { meta } : {}) },
});

describe('reputationApi stats and card filter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads GET /reputation/stats for both roles or the chosen one', async () => {
    const body = { roles: { all: 114, customer: 70, technician: 44 }, total: 44, deducted: 5, low: 2, suspended: 1, locked: 0 };
    apiClientMock.get.mockResolvedValue(envelope(body));
    expect(await reputationApi.stats()).toEqual(body);
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/reputation/stats', { params: {} });
    await reputationApi.stats('technician');
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/reputation/stats', { params: { role: 'technician' } });
  });

  it('turns missing or broken counts into 0 and refuses a response without data', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope({ roles: { all: '7' }, total: null, deducted: -3, low: 'x' }));
    expect(await reputationApi.stats()).toEqual({ roles: { all: 7, customer: 0, technician: 0 }, total: 0, deducted: 0, low: 0, suspended: 0, locked: 0 });
    apiClientMock.get.mockResolvedValueOnce(envelope(null));
    await expect(reputationApi.stats()).rejects.toThrow('invalid reputation stats');
  });

  it('sends the card state with the list query', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([], { page: 1, limit: 20, total: 0, totalPages: 0 }));
    const page = await reputationApi.list({ state: 'locked', page: 1, pageSize: 20 });
    expect(apiClientMock.get).toHaveBeenCalledWith('/reputation', { params: { state: 'locked', page: 1, pageSize: 20 } });
    expect(page.meta.total).toBe(0);
  });
});
