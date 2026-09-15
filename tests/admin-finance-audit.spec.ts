import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../src/api/client', () => ({ default: apiClientMock }));

import { platformDuesApi } from '../src/api/admin-platform-dues.api';
import { auditLogsApi } from '../src/api/admin-audit-logs.api';
import router from '../src/router';

const envelope = (data: unknown, meta?: unknown) => ({
  data: { success: true, statusCode: 200, message: 'OK', data, ...(meta ? { meta } : {}) },
});

const dueSample = {
  id: 'due-1',
  invoiceId: 'inv-1',
  serviceOrderId: 'order-1',
  laborTotalSnapshot: 180000,
  fixHomePartsTotalSnapshot: 120000,
  commissionRateSnapshot: 0.15,
  commissionAmountSnapshot: 27000,
  dueAmount: 147000,
  status: 'PENDING',
  settledAt: null,
};

const logSample = {
  id: 'log-1',
  actorUserId: 'admin-1',
  actorRole: 'admin',
  action: 'order.cancel',
  resourceType: 'service_order',
  resourceId: 'order-1',
  before: { status: 'ACCEPTED' },
  after: { status: 'CANCELLED' },
  ip: '127.0.0.1',
  userAgent: 'vitest',
  createdAt: '2026-09-15T08:00:00.000Z',
};

describe('Admin PlatformDue audit API + route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls GET /finance/platform-dues with page/limit/status and normalizes the envelope', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope([dueSample], { page: 1, limit: 10, total: 1, totalPages: 1 }),
    );

    const result = await platformDuesApi.listDues({ page: 1, limit: 10, status: 'PENDING' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/finance/platform-dues', {
      params: { page: 1, limit: 10, status: 'PENDING' },
    });
    expect(result.data[0]?.dueAmount).toBe(147000);
    expect(result.data[0]?.fixHomePartsTotalSnapshot).toBe(120000);
    expect(result.meta.total).toBe(1);
  });

  it('omits an empty status filter instead of sending noise to Backend', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope([], { page: 1, limit: 10, total: 0, totalPages: 0 }),
    );

    await platformDuesApi.listDues({ page: 1, limit: 10, status: '   ' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/finance/platform-dues', {
      params: { page: 1, limit: 10 },
    });
  });

  it('fails closed on a non-envelope response instead of accepting legacy shapes', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [dueSample] });

    await expect(platformDuesApi.listDues()).rejects.toThrow(
      'Backend returned an invalid platform due list response.',
    );
  });

  it('propagates Backend failures without mock fallback', async () => {
    apiClientMock.get.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(platformDuesApi.listDues()).rejects.toThrow('network unavailable');
  });

  it('registers /console/admin/platform-dues as ADMIN-only', () => {
    const route = router.getRoutes().find((item) => item.name === 'admin-platform-dues');

    expect(route).toBeDefined();
    expect(route?.path).toBe('/console/admin/platform-dues');
    expect(route?.meta.roles).toEqual(['ADMIN']);
  });
});

describe('Admin Audit Log API + route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls GET /admin/audit-logs with bounded filters and normalizes the envelope', async () => {
    apiClientMock.get.mockResolvedValueOnce(
      envelope([logSample], { page: 2, limit: 10, total: 11, totalPages: 2 }),
    );

    const result = await auditLogsApi.listLogs({
      page: 2,
      limit: 10,
      resourceType: 'service_order',
      actorUserId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'order.cancel',
    });

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/audit-logs', {
      params: {
        page: 2,
        limit: 10,
        resourceType: 'service_order',
        actorUserId: '123e4567-e89b-12d3-a456-426614174000',
        action: 'order.cancel',
      },
    });
    expect(result.data[0]?.action).toBe('order.cancel');
    expect(result.data[0]?.before).toEqual({ status: 'ACCEPTED' });
    expect(result.meta.totalPages).toBe(2);
  });

  it('fetches audit detail through GET /admin/audit-logs/:id', async () => {
    apiClientMock.get.mockResolvedValueOnce(envelope(logSample));

    const result = await auditLogsApi.getLog('log-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/admin/audit-logs/log-1');
    expect(result.after).toEqual({ status: 'CANCELLED' });
    expect(result.ip).toBe('127.0.0.1');
  });

  it('fails closed on a non-envelope response instead of accepting legacy shapes', async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [logSample] } });

    await expect(auditLogsApi.listLogs()).rejects.toThrow(
      'Backend returned an invalid audit log list response.',
    );
  });

  it('registers /console/admin/audit-logs as ADMIN-only', () => {
    const route = router.getRoutes().find((item) => item.name === 'admin-audit-logs');

    expect(route).toBeDefined();
    expect(route?.path).toBe('/console/admin/audit-logs');
    expect(route?.meta.roles).toEqual(['ADMIN']);
  });
});

describe('ConsoleOrderDetail read-only regression', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/pages/console/ConsoleOrderDetailPage.vue'),
    'utf-8',
  );

  it.each([
    'handleReassign',
    'handleForceCancel',
    'showReassignModal',
    'showCancelModal',
    'reassignTechId',
    'reassignReason',
    'alert(',
    'Audit Log',
    'PENDING_MATCHING',
    '(ASSIGNED)',
    '(ARRIVED)',
    '(IN_PROGRESS)',
    'tech-2',
    'Điều phối lại thợ',
    'Huỷ đơn can thiệp',
    'huỷ đơn cưỡng chế',
  ])('no longer contains fake mutation artifact %s', (artifact) => {
    expect(source).not.toContain(artifact);
  });

  it('keeps the page as read-only context with exception-handling navigation', () => {
    expect(source).toContain('chỉ đọc');
    expect(source).toContain('/console/support');
    expect(source).toContain('/console/cancellations');
    expect(source).toContain('ordersApi.getOrder');
  });

  it('keeps console-order-detail accessible to SERVICE_MANAGER + ADMIN', () => {
    const route = router.getRoutes().find((item) => item.name === 'console-order-detail');

    expect(route).toBeDefined();
    expect(route?.meta.roles).toEqual(['SERVICE_MANAGER', 'ADMIN']);
  });
});
