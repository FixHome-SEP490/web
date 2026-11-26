import { describe, expect, it } from 'vitest';
import { normalizeDocument } from '../src/api/admin-skill-verifications.api';

describe('admin skill verification evidence', () => {
  it('keeps what the technician declared for a paper', () => {
    const doc = normalizeDocument({
      id: 'd1', fileName: 'a.jpg', evidenceType: 'social_insurance', evidenceGroup: 'verifiable', issuer: 'BHXH',
      referenceNumber: '123', issuedAt: '2024-03-05', expiresAt: null, claimedYears: 5, reviewStatus: 'pending', reviewNote: '',
    });
    expect(doc).toMatchObject({
      evidenceType: 'social_insurance', evidenceGroup: 'verifiable', issuer: 'BHXH', referenceNumber: '123',
      issuedAt: '2024-03-05', expiresAt: null, claimedYears: 5, reviewStatus: 'pending', reviewNote: null,
    });
  });

  it('leaves every detail empty for an old paper without them', () => {
    expect(normalizeDocument({ id: 'd2' })).toMatchObject({ evidenceType: null, issuer: null, issuedAt: null, claimedYears: null });
  });
});
