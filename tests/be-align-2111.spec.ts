import { describe, expect, it, vi, beforeEach } from 'vitest';

const post = vi.fn();
vi.mock('../src/api/client', () => ({ default: { post: (...a: unknown[]) => post(...a), get: vi.fn() }, getHttpStatus: () => null }));

import { technicianProfileApi } from '../src/api/technician-profile.api';

describe('skill evidence upload reads the server envelope', () => {
  beforeEach(() => post.mockReset());

  it('takes the signed upload link from data, as the server wraps every reply', async () => {
    post.mockResolvedValue({ data: { success: true, data: { storageObjectPath: 'p/1.png', uploadUrl: 'https://u' } } });
    await expect(technicianProfileApi.requestSkillEvidenceUploadUrl('s1', 'image/png'))
      .resolves.toEqual({ storageObjectPath: 'p/1.png', uploadUrl: 'https://u' });
  });

  it('reads the saved verification from data after attaching a file', async () => {
    post.mockResolvedValue({ data: { success: true, data: { id: 'v1', status: 'pending', documents: [] } } });
    const result = await technicianProfileApi.attachSkillEvidence('s1', { storageObjectPath: 'p', fileName: 'a.png', fileSize: 1, mimeType: 'image/png' });
    expect(result.id).toBe('v1');
  });
});
