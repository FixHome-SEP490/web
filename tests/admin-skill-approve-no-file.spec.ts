import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { patch } }));

import { adminSkillVerificationsApi } from '../src/api/admin-skill-verifications.api';

beforeEach(() => {
  patch.mockReset();
  patch.mockResolvedValue({ data: { data: { id: 'rq1', status: 'verified' } } });
});

describe('approving a skill needs no certificate file', () => {
  it('sends an empty body when no certificate is given', async () => {
    await adminSkillVerificationsApi.approve('rq1');
    expect(patch).toHaveBeenCalledWith('/admin/technician-skill-verifications/rq1/approve', {});
  });

  it('still forwards a certificate when one is given', async () => {
    const certificate = { storageObjectPath: 'kyc/u/c.pdf', fileName: 'c.pdf', fileSize: 1, mimeType: 'application/pdf' };
    await adminSkillVerificationsApi.approve('rq1', certificate);
    expect(patch).toHaveBeenCalledWith('/admin/technician-skill-verifications/rq1/approve', certificate);
  });
});
