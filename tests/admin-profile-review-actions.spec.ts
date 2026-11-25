import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth';
import { flushPromises, mount } from '@vue/test-utils';

// QA 22/11/2026: sau khi mở lại hồ sơ, khung chi tiết vẫn hiện "Duyệt hồ sơ" dù thợ chưa gặp lại;
// bấm vào chỉ ra lỗi chung. Nút duyệt chỉ có khi hồ sơ đang ở bước duyệt (đã gặp trực tiếp).
const { listReviews, getReview, approveReview } = vi.hoisted(() => ({ listReviews: vi.fn(), getReview: vi.fn(), approveReview: vi.fn() }));
vi.mock('../src/api/admin-office-visits.api', () => ({
  adminOfficeVisitsApi: { listReviews, getReview, approveReview, reopenReview: vi.fn(), rejectReview: vi.fn() },
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
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth('token', { id: 'sm1', fullName: 'Quản lý', email: 'sm@example.test', role: 'service_manager', status: 'ACTIVE' } as never);
  });

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

describe('Profile review is read-only for the admin', () => {
  it('shows no decision button to the admin, even on a profile waiting for review', async () => {
    setActivePinia(createPinia());
    useAuthStore().setAuth('token', { id: 'a1', fullName: 'Admin', email: 'a@example.test', role: 'admin', status: 'ACTIVE' } as never);
    expect(await open('profile_review')).not.toEqual(expect.arrayContaining(['Duyệt hồ sơ']));
    expect(await open('profile_rejected')).not.toContain('Mở lại hồ sơ');
  });
});

describe('Profile review: a skill left unconfirmed needs a reason', () => {
  const skill = (id: string, name: string) => ({ id, serviceName: name, categoryId: 'c1', categoryName: 'Điều hòa', declaredLevel: 'INTERMEDIATE', level: 'INTERMEDIATE', verificationStatus: 'pending' });

  it('blocks the approval without one, then sends the reason with the decision', async () => {
    setActivePinia(createPinia());
    useAuthStore().setAuth('token', { id: 'sm1', fullName: 'Quản lý', email: 'sm@example.test', role: 'service_manager', status: 'ACTIVE' } as never);
    listReviews.mockResolvedValue([{ ...row, stage: 'profile_review' }]);
    getReview.mockResolvedValue({ ...detail('profile_review'), skills: [skill('s1', 'Lắp đặt điều hòa'), skill('s2', 'Sửa điều hòa')] });
    approveReview.mockResolvedValue(undefined);
    const wrapper = mount(AdminProfileReviewsPage, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Xem hồ sơ')!.trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="skill-group-toggle-Điều hòa"]').trigger('click');
    await wrapper.get('[data-testid="skill-approve-s2"]').setValue(false);
    const approveButton = () => wrapper.findAll('button').find((b) => b.text() === 'Duyệt hồ sơ')!;
    await approveButton().trigger('click');
    await flushPromises();
    expect(approveReview).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Ghi lý do (ít nhất 5 ký tự)');
    await wrapper.get('[data-testid="skill-reason-s2"]').setValue('Bằng chưa rõ cấp');
    await approveButton().trigger('click');
    await flushPromises();
    expect(approveReview).toHaveBeenCalledWith('t1', [
      expect.objectContaining({ skillId: 's1', approved: true, reason: undefined }),
      expect.objectContaining({ skillId: 's2', approved: false, reason: 'Bằng chưa rõ cấp' }),
    ]);
  });
});
