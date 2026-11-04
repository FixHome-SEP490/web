import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, put, deleteRequest, post } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  deleteRequest: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  default: { get, put, delete: deleteRequest, post },
}));

import { bookingDraftsApi, type SafeDraftSnapshot } from '../src/api/booking-drafts.api';

const snapshot: SafeDraftSnapshot = {
  kind: 'booking',
  addressId: 'address-1',
  mode: 'scheduled',
  date: '2026-11-05',
  slot: 'morning',
  items: [{ serviceId: 'service-1', description: 'Máy lạnh chảy nước', photoUploadIds: ['upload-1'] }],
  savedDeviceCount: 0,
  quantity: 1,
  customerNote: 'Nếu được, vui lòng đến buổi sáng',
};

describe('bookingDraftsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the current account draft from the shared API client', async () => {
    const draft = { id: 'draft-1', version: 3, expiresAt: '2026-12-05T00:00:00.000Z', snapshot };
    get.mockResolvedValue({ data: { data: draft } });

    await expect(bookingDraftsApi.current()).resolves.toEqual(draft);
    expect(get).toHaveBeenCalledWith('/booking-drafts/current');
  });

  it('saves only the snapshot with the expected optimistic version', async () => {
    const draft = { id: 'draft-1', version: 4, expiresAt: '2026-12-05T00:00:00.000Z', snapshot };
    put.mockResolvedValue({ data: { data: draft } });

    await expect(bookingDraftsApi.save(snapshot, 3)).resolves.toEqual(draft);
    expect(put).toHaveBeenCalledWith('/booking-drafts/current', { snapshot, expectedVersion: 3 });
  });

  it('starts a new draft generation with a null expected version', async () => {
    const draft = { id: 'draft-2', version: 1, expiresAt: '2026-12-05T00:00:00.000Z', snapshot };
    put.mockResolvedValue({ data: { data: draft } });

    await bookingDraftsApi.save(snapshot, null);
    expect(put).toHaveBeenCalledWith('/booking-drafts/current', { snapshot, expectedVersion: null });
  });

  it('discards the active draft only when explicitly called', async () => {
    deleteRequest.mockResolvedValue({ data: { data: { deleted: true } } });

    await expect(bookingDraftsApi.discard()).resolves.toEqual({ deleted: true });
    expect(deleteRequest).toHaveBeenCalledWith('/booking-drafts/current');
  });

  it('submits one immutable draft generation with its operation key and final request', async () => {
    const result = { kind: 'booking', bookingId: 'booking-1', visitGroupId: null } as const;
    const request = { kind: 'booking' as const, data: { serviceId: 'service-1' } };
    post.mockResolvedValue({ data: { data: result } });

    await expect(bookingDraftsApi.submit('draft-1', {
      expectedVersion: 4,
      operationKey: 'operation-1',
      request,
    })).resolves.toEqual(result);
    expect(post).toHaveBeenCalledWith('/booking-drafts/draft-1/submit', {
      expectedVersion: 4,
      operationKey: 'operation-1',
      request,
    });
  });
});
