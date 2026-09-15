import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { adminPartsApi } from '../src/api/admin-parts.api';

const samplePart = {
  id: 'part-1',
  sku: 'FH-FAN-5V-001',
  name: 'Quạt tản nhiệt 5V',
  description: 'Quạt tản nhiệt laptop thay thế',
  sellingPrice: 150000,
  warrantyDays: 365,
  warrantyPolicy: 'Bảo hành tại cửa hàng',
  isActive: true,
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

describe('adminPartsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads paginated parts and preserves the backend filter contract', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [samplePart],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const result = await adminPartsApi.getParts({
      page: 1,
      limit: 10,
      search: 'quạt',
      isActive: true,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/parts', {
      params: { page: 1, limit: 10, search: 'quạt', isActive: true },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe('Quạt tản nhiệt 5V');
    expect(result.data[0]?.sellingPrice).toBe(150000);
    expect(result.data[0]?.warrantyDays).toBe(365);
    expect(result.meta.total).toBe(1);
  });

  it('normalizes nullable optional fields correctly', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'part-2',
            sku: null,
            name: 'Linh kiện không bảo hành',
            description: null,
            sellingPrice: 50000,
            warrantyDays: null,
            warrantyPolicy: null,
            isActive: false,
            createdAt: '2026-09-15T00:00:00.000Z',
            updatedAt: '2026-09-15T00:00:00.000Z',
          },
        ],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const result = await adminPartsApi.getParts({});

    expect(result.data[0]?.sku).toBeNull();
    expect(result.data[0]?.description).toBeNull();
    expect(result.data[0]?.warrantyDays).toBeNull();
    expect(result.data[0]?.warrantyPolicy).toBeNull();
    expect(result.data[0]?.isActive).toBe(false);
  });

  it('creates a part and returns the normalized response', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: samplePart } });

    const result = await adminPartsApi.createPart({
      sku: 'FH-FAN-5V-001',
      name: 'Quạt tản nhiệt 5V',
      description: 'Quạt tản nhiệt laptop thay thế',
      sellingPrice: 150000,
      warrantyDays: 365,
      warrantyPolicy: 'Bảo hành tại cửa hàng',
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/admin/parts', {
      sku: 'FH-FAN-5V-001',
      name: 'Quạt tản nhiệt 5V',
      description: 'Quạt tản nhiệt laptop thay thế',
      sellingPrice: 150000,
      warrantyDays: 365,
      warrantyPolicy: 'Bảo hành tại cửa hàng',
    });
    expect(result.id).toBe('part-1');
    expect(result.name).toBe('Quạt tản nhiệt 5V');
  });

  it('updates a part with the correct endpoint and payload', async () => {
    const updated = { ...samplePart, name: 'Quạt tản nhiệt 5V (cập nhật)', sellingPrice: 160000 };
    apiClientMock.patch.mockResolvedValueOnce({ data: { data: updated } });

    const result = await adminPartsApi.updatePart('part-1', {
      name: 'Quạt tản nhiệt 5V (cập nhật)',
      sellingPrice: 160000,
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/admin/parts/part-1', {
      name: 'Quạt tản nhiệt 5V (cập nhật)',
      sellingPrice: 160000,
    });
    expect(result.name).toBe('Quạt tản nhiệt 5V (cập nhật)');
    expect(result.sellingPrice).toBe(160000);
  });

  it('sends only isActive to the status endpoint when deactivating', async () => {
    const deactivated = { ...samplePart, isActive: false };
    apiClientMock.patch.mockResolvedValueOnce({ data: { data: deactivated } });

    const result = await adminPartsApi.setPartStatus('part-1', false);

    expect(apiClientMock.patch).toHaveBeenCalledWith('/admin/parts/part-1/status', {
      isActive: false,
    });
    expect(result.isActive).toBe(false);
  });

  it('sends only isActive to the status endpoint when activating', async () => {
    const activated = { ...samplePart, isActive: true };
    apiClientMock.patch.mockResolvedValueOnce({ data: { data: activated } });

    const result = await adminPartsApi.setPartStatus('part-1', true);

    expect(apiClientMock.patch).toHaveBeenCalledWith('/admin/parts/part-1/status', {
      isActive: true,
    });
    expect(result.isActive).toBe(true);
  });

  it('fails closed when the part list response is malformed', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { unexpected: true } });

    await expect(adminPartsApi.getParts()).rejects.toThrow(
      'Backend returned an invalid part list response.',
    );
  });

  it('loads a single part by id', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: samplePart } });

    const result = await adminPartsApi.getPart('part-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/parts/part-1');
    expect(result.id).toBe('part-1');
    expect(result.sku).toBe('FH-FAN-5V-001');
  });

  it('fails closed when a single-part payload has an invalid status type', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: { data: { ...samplePart, isActive: 'false' } },
    });

    await expect(adminPartsApi.getPart('part-1')).rejects.toThrow(
      'Backend returned an invalid part response.',
    );
  });

});
