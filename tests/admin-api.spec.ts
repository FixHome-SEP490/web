import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { adminConfigApi } from '../src/api/admin-config.api';
import { adminUsersApi } from '../src/api/admin-users.api';
import { adminVerificationsApi } from '../src/api/admin-verifications.api';

describe('Admin API adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads paginated users and preserves the Backend filter contract', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        statusCode: 200,
        message: 'OK',
        data: [
          {
            id: 'user-1',
            email: 'tech@example.com',
            fullName: 'Technician One',
            phoneNumber: null,
            role: 'technician',
            status: 'active',
            isActive: true,
            createdAt: '2026-09-15T00:00:00.000Z',
            updatedAt: '2026-09-15T00:00:00.000Z',
          },
        ],
        meta: { page: 2, limit: 10, total: 11, totalPages: 2 },
      },
    });

    const result = await adminUsersApi.getUsers({
      page: 2,
      limit: 10,
      role: 'technician',
      status: 'active',
    });

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/users', {
      params: { page: 2, limit: 10, role: 'technician', status: 'active' },
    });
    expect(result.data[0]?.role).toBe('technician');
    expect(result.meta.totalPages).toBe(2);
  });

  it('updates a user status through the server response', async () => {
    apiClientMock.patch.mockResolvedValueOnce({
      data: {
        success: true,
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'user-1',
          email: 'tech@example.com',
          fullName: 'Technician One',
          phoneNumber: null,
          role: 'technician',
          status: 'locked',
          isActive: false,
          createdAt: '2026-09-15T00:00:00.000Z',
          updatedAt: '2026-09-15T01:00:00.000Z',
        },
      },
    });

    const result = await adminUsersApi.updateStatus('user-1', {
      status: 'locked',
      reason: 'Security review',
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/admin/users/user-1/status', {
      status: 'locked',
      reason: 'Security review',
    });
    expect(result.status).toBe('locked');
    expect(result.isActive).toBe(false);
  });

  it('normalizes legacy APPROVED verification responses to canonical VERIFIED', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'verification-1',
            technicianId: 'tech-1',
            status: 'approved',
            submittedAt: '2026-09-15T00:00:00.000Z',
            documents: [],
          },
        ],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const result = await adminVerificationsApi.getVerifications({ status: 'VERIFIED' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/technician-verifications', {
      params: { status: 'approved' },
    });
    expect(result.data[0]?.status).toBe('VERIFIED');
  });

  it('loads canonical PENDING verification responses', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'verification-pending',
            technicianId: 'tech-pending',
            status: 'pending',
            submittedAt: '2026-09-15T00:00:00.000Z',
            documents: [],
          },
        ],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const result = await adminVerificationsApi.getVerifications({ status: 'PENDING' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/technician-verifications', {
      params: { status: 'pending' },
    });
    expect(result.data[0]?.status).toBe('PENDING');
  });

  it('sends a rejection reason to the KYC decision endpoint', async () => {
    apiClientMock.patch.mockResolvedValueOnce({
      data: {
        id: 'verification-1',
        technicianId: 'tech-1',
        status: 'rejected',
        submittedAt: '2026-09-15T00:00:00.000Z',
        documents: [],
      },
    });

    const result = await adminVerificationsApi.rejectVerification(
      'verification-1',
      'Document is unreadable',
    );

    expect(apiClientMock.patch).toHaveBeenCalledWith(
      '/admin/technician-verifications/verification-1/reject',
      { rejectionReason: 'Document is unreadable' },
    );
    expect(result.status).toBe('REJECTED');
  });

  it('reads config effect metadata and sends typed string updates', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [
        {
          key: 'geofence.radius_meters',
          value: '300',
          valueType: 'int',
          description: 'Geofence radius',
          updatedByUserId: null,
          updatedAt: '2026-09-15T00:00:00.000Z',
          effectStatus: 'TO_WIRE',
          consumerEvidence: 'arrival-checkin.service.ts',
        },
      ],
    });
    apiClientMock.patch.mockResolvedValueOnce({
      data: {
        key: 'geofence.radius_meters',
        value: '250',
        valueType: 'int',
        description: 'Geofence radius',
        updatedByUserId: 'admin-1',
        updatedAt: '2026-09-15T01:00:00.000Z',
        effectStatus: 'TO_WIRE',
        consumerEvidence: 'arrival-checkin.service.ts',
      },
    });

    const configs = await adminConfigApi.getConfigs();
    const updated = await adminConfigApi.updateConfig('geofence.radius_meters', '250');

    expect(configs[0]?.effectStatus).toBe('TO_WIRE');
    expect(apiClientMock.patch).toHaveBeenCalledWith(
      '/admin/config/geofence.radius_meters',
      { value: '250' },
    );
    expect(updated.value).toBe('250');
  });

  it('fails closed when an admin list response is malformed', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { unexpected: true } });

    await expect(adminUsersApi.getUsers()).rejects.toThrow(
      'Backend returned an invalid user list response.',
    );
  });
});
