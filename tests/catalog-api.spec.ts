import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { catalogApi } from '../src/api/catalog.api';

const categorySample = {
  id: 'cat-1',
  name: 'Điện lạnh',
  code: 'DIEN_LANH',
  sortOrder: 1,
  isActive: true,
};

const serviceSample = {
  id: 'svc-1',
  categoryId: 'cat-1',
  name: 'Vệ sinh máy lạnh',
  code: 'VE_SINH_ML',
  estimatedMinutes: 45,
  isActive: true,
};

const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data, ...(meta ? { meta } : {}) },
});

const pageMeta = { page: 1, limit: 10, total: 1, totalPages: 1 };

describe('catalogApi envelope normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads categories from the success envelope and filters inactive by default', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope([categorySample, { ...categorySample, id: 'cat-2', isActive: false }]),
    );

    const result = await catalogApi.getCategories();

    expect(apiClientMock.get).toHaveBeenCalledWith('/categories');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('cat-1');
  });

  it('rejects a non-envelope category list instead of returning raw data', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [categorySample] });

    await expect(catalogApi.getCategories()).rejects.toThrow(
      'Backend returned an invalid category list response.',
    );
  });

  it('normalizes a single category envelope for detail and mutations', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope(categorySample));
    await expect(catalogApi.getCategory('cat-1')).resolves.toEqual(categorySample);

    apiClientMock.post.mockResolvedValueOnce(envelope(categorySample));
    await expect(catalogApi.createCategory({ name: 'Điện lạnh' })).resolves.toEqual(categorySample);

    apiClientMock.patch.mockResolvedValueOnce(envelope(categorySample));
    await expect(catalogApi.toggleCategoryStatus('cat-1', true)).resolves.toEqual(categorySample);
  });

  it('rejects array data for single category endpoints', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([categorySample]));

    await expect(catalogApi.getCategory('cat-1')).rejects.toThrow(
      'Backend returned an invalid category response.',
    );
  });

  it('normalizes paginated service envelopes and keeps the local {data,meta} shape', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([serviceSample], pageMeta));

    const result = await catalogApi.getAdminServices({ limit: 100 });

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/services', {
      params: { limit: 100 },
    });
    expect(result.data).toEqual([serviceSample]);
    expect(result.meta).toEqual(pageMeta);
  });

  it('rejects service lists with malformed meta instead of returning raw data', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([serviceSample], { total: 1 }));

    await expect(catalogApi.getAdminServices()).rejects.toThrow(
      'Backend returned an invalid service list response.',
    );
  });

  it('rejects non-envelope service detail responses', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: serviceSample });

    await expect(catalogApi.getService('svc-1')).rejects.toThrow(
      'Backend returned an invalid service response.',
    );
  });

  it('fails closed on network failure without mock fallback', async () => {
    apiClientMock.get.mockRejectedValueOnce(new Error('Network Error'));

    await expect(catalogApi.getCategories()).rejects.toThrow('Network Error');
  });
});
