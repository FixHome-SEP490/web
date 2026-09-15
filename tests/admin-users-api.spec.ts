import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { adminUsersApi } from '../src/api/admin-users.api';

const userSample = {
  id: 'user-1',
  email: 'tech@example.com',
  fullName: 'Technician One',
  phoneNumber: null,
  role: 'technician',
  status: 'active',
  isActive: true,
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data, ...(meta ? { meta } : {}) },
});

const pageMeta = { page: 1, limit: 10, total: 1, totalPages: 1 };

describe('adminUsersApi strict envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a raw array list response instead of accepting it as success', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [userSample] });

    await expect(adminUsersApi.getUsers()).rejects.toThrow(
      'Backend returned an invalid user list response.',
    );
  });

  it('rejects list responses with malformed pagination meta', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope([userSample], { page: 1, total: 1 }));

    await expect(adminUsersApi.getUsers()).rejects.toThrow(
      'Backend returned an invalid user pagination meta.',
    );
  });

  it('rejects users with missing or blank core identity fields', async () => {
    for (const identity of [
      { id: '', email: userSample.email, fullName: userSample.fullName },
      { id: userSample.id, email: '   ', fullName: userSample.fullName },
      { id: userSample.id, email: userSample.email, fullName: '' },
    ]) {
      apiClientMock.get.mockResolvedValueOnce(
        envelope([{ ...userSample, ...identity }], pageMeta),
      );
      await expect(adminUsersApi.getUsers()).rejects.toThrow(
        /Backend returned a user without (an id|an email|a full name)\./,
      );
    }
  });

  it('keeps rejecting unsupported roles and statuses', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope([{ ...userSample, role: 'superuser' }], pageMeta),
    );
    await expect(adminUsersApi.getUsers()).rejects.toThrow(
      'Backend returned an unsupported user role.',
    );

    apiClientMock.get.mockResolvedValueOnce(
      envelope([{ ...userSample, status: 'deleted' }], pageMeta),
    );
    await expect(adminUsersApi.getUsers()).rejects.toThrow(
      'Backend returned an unsupported user status.',
    );
  });

  it('requires the outer envelope for detail and status mutations', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: userSample });
    await expect(adminUsersApi.getUser('user-1')).rejects.toThrow(
      'Backend returned an invalid user detail response.',
    );

    apiClientMock.patch.mockResolvedValueOnce({
      data: { ...userSample, status: 'locked' },
    });
    await expect(adminUsersApi.updateStatus('user-1', { status: 'locked' })).rejects.toThrow(
      'Backend returned an invalid user status response.',
    );
  });

  it('normalizes a valid detail envelope and preserves the status payload contract', async () => {
    apiClientMock.patch.mockResolvedValueOnce(
      envelope({ ...userSample, status: 'locked', isActive: false }),
    );

    const result = await adminUsersApi.updateStatus('user-1', {
      status: 'locked',
      reason: 'Security review',
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/admin/users/user-1/status', {
      status: 'locked',
      reason: 'Security review',
    });
    expect(result.status).toBe('locked');
    expect(result.fullName).toBe('Technician One');
  });
});
