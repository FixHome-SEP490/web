import { describe, expect, it } from 'vitest';
import { normalizeDocument, normalizeVerification } from '../src/api/admin-skill-verifications.api';

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

  it('carries how many times a skill was reviewed and why the last refusal happened, one attempt when the server says nothing', () => {
    expect(normalizeVerification({ id: 'v1', attemptNumber: 3, previousRejectionReason: 'Ảnh mờ' })).toMatchObject({ attemptNumber: 3, previousRejectionReason: 'Ảnh mờ' });
    expect(normalizeVerification({ id: 'v2' })).toMatchObject({ attemptNumber: 1, previousRejectionReason: null });
  });
});
