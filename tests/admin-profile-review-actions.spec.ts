import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// QA 22/11/2026: sau khi mở lại hồ sơ, khung chi tiết vẫn hiện "Duyệt hồ sơ" dù thợ chưa gặp lại;
// bấm vào chỉ ra lỗi chung. Nút duyệt chỉ có khi hồ sơ đang ở bước duyệt (đã gặp trực tiếp).
const { listReviews, getReview } = vi.hoisted(() => ({ listReviews: vi.fn(), getReview: vi.fn() }));
vi.mock('../src/api/admin-office-visits.api', () => ({
  adminOfficeVisitsApi: { listReviews, getReview, approveReview: vi.fn(), reopenReview: vi.fn(), rejectReview: vi.fn() },
}));
vi.mock('../src/api/admin-verifications.api', () => ({ adminVerificationsApi: { getDocumentAccess: vi.fn() } }));

import AdminProfileReviewsPage from '../src/pages/console/admin/AdminProfileReviewsPage.vue';

const row = { technicianId: 't1', fullName: 'Thợ Thử', email: 't1@x.vn', phoneNumber: null, identityVerifiedAt: '2026-11-13T03:00:00Z', stage: null, visit: null, missedVisits: 0 };
const detail = (stage: string) => ({
  technicianId: 't1',
  stage,
  technician: { fullName: 'Thợ Thử', email: 't1@x.vn', phoneNumber: null, citizenIdNumber: null },
  profile: { yearsExperience: 1, bio: null, fullAddress: null, serviceRadiusKm: 10, serviceAreas: [], rejectionReason: null },
  skills: [],
  verificationId: null,
  faceMatchScore: null,
  documents: [],
  visits: [],
});

async function open(stage: string) {
  listReviews.mockResolvedValue([{ ...row, stage }]);
  getReview.mockResolvedValue(detail(stage));
  const wrapper = mount(AdminProfileReviewsPage, { global: { stubs: { teleport: true } } });
  await flushPromises();
  await wrapper.findAll('button').find((b) => b.text() === 'Xem hồ sơ')!.trigger('click');
  await flushPromises();
  return wrapper.findAll('button').map((b) => b.text());
}

describe('Profile review actions follow the review stage', () => {
  it('offers approval only after the office visit', async () => {
    expect(await open('profile_review')).toEqual(expect.arrayContaining(['Duyệt hồ sơ', 'Từ chối']));
    expect(await open('visit_required')).not.toContain('Duyệt hồ sơ');
    expect(await open('visit_scheduled')).not.toContain('Duyệt hồ sơ');
  });

  it('offers only reopening on a rejected profile', async () => {
    const buttons = await open('profile_rejected');
    expect(buttons).toContain('Mở lại hồ sơ');
    expect(buttons).not.toContain('Duyệt hồ sơ');
    expect(buttons).not.toContain('Từ chối');
  });
});
