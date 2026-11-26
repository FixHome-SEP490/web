import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { useAuthStore } from '../src/stores/auth';

const { listReviews, getReview, approveReview } = vi.hoisted(() => ({
  listReviews: vi.fn(),
  getReview: vi.fn(),
  approveReview: vi.fn(),
}));

vi.mock('../src/api/admin-office-visits.api', () => ({
  adminOfficeVisitsApi: {
    listReviews,
    getReview,
    approveReview,
    reopenReview: vi.fn(),
    rejectReview: vi.fn(),
  },
}));

vi.mock('../src/api/admin-verifications.api', () => ({
  adminVerificationsApi: { getDocumentAccess: vi.fn() },
}));

import AdminProfileReviewsPage from '../src/pages/console/admin/AdminProfileReviewsPage.vue';

const sampleRows = [
  {
    technicianId: 'tech-1',
    fullName: 'Nguyễn Văn A',
    email: 'nva@fixhome.vn',
    phoneNumber: '0901234567',
    identityVerifiedAt: '2026-11-13T03:00:00Z',
    stage: 'visit_required' as const,
    visit: null,
    missedVisits: 0,
  },
  {
    technicianId: 'tech-2',
    fullName: 'Trần Thị B',
    email: 'ttb@fixhome.vn',
    phoneNumber: '0912345678',
    identityVerifiedAt: '2026-11-14T03:00:00Z',
    stage: 'visit_scheduled' as const,
    visit: {
      id: 'visit-1',
      status: 'scheduled' as const,
      scheduledAt: '2026-11-28T08:00:00Z',
      officeName: 'Trụ sở Quận 1',
    },
    missedVisits: 0,
  },
  {
    technicianId: 'tech-3',
    fullName: 'Lê Văn C',
    email: 'lvc@fixhome.vn',
    phoneNumber: '0987654321',
    identityVerifiedAt: '2026-11-15T03:00:00Z',
    stage: 'profile_review' as const,
    visit: {
      id: 'visit-2',
      status: 'attended' as const,
      scheduledAt: '2026-11-20T08:00:00Z',
      officeName: 'Trụ sở Quận 1',
    },
    missedVisits: 0,
  },
  {
    technicianId: 'tech-4',
    fullName: 'Phạm Văn D',
    email: 'pvd@fixhome.vn',
    phoneNumber: null,
    identityVerifiedAt: '2026-11-16T03:00:00Z',
    stage: null, // Backend deriveReviewStage returns null when onboardingStatus is in_progress
    visit: null,
    missedVisits: 1,
  },
];

const mockDetail = (id: string, stage: string) => ({
  technicianId: id,
  stage,
  technician: { fullName: `Kỹ thuật viên ${id}`, email: `${id}@x.vn`, phoneNumber: '0900000000', citizenIdNumber: '123456789' },
  profile: { yearsExperience: 3, bio: 'Thợ lành nghề', fullAddress: 'Hà Nội', serviceRadiusKm: 15, serviceAreas: [], rejectionReason: null },
  skills: [],
  evidence: [],
  verificationId: null,
  faceMatchScore: null,
  documents: [],
  visits: [],
});

describe('AdminProfileReviewsPage UI & Bug Fixes', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().setAuth('token', {
      id: 'admin-1',
      fullName: 'Quản trị viên',
      email: 'admin@fixhome.vn',
      role: 'admin',
      status: 'ACTIVE',
    } as never);
    vi.clearAllMocks();
  });

  it('renders correct stats from actual data rows', async () => {
    listReviews.mockResolvedValue(sampleRows);
    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    const text = wrapper.text();
    // Header
    expect(text).toContain('Duyệt hồ sơ');
    expect(text).toContain('Xác nhận thông tin kỹ thuật viên, đặt lịch lên trụ sở để kiểm tra và duyệt cấp độ kỹ năng.');

    // Stats cards
    expect(text).toContain('Chờ đặt lịch');
    expect(text).toContain('Đã đặt lịch');
    expect(text).toContain('Chờ duyệt kỹ năng');

    // Numbers: 2 waiting booking (tech-1, tech-4), 1 booked (tech-2), 1 waiting skill (tech-3)
    const statButtons = wrapper.findAll('button[title*="Nhấn để lọc hồ sơ"]');
    expect(statButtons.length).toBe(3);
    expect(statButtons[0].text()).toContain('2'); // Chờ đặt lịch
    expect(statButtons[1].text()).toContain('1'); // Đã đặt lịch
    expect(statButtons[2].text()).toContain('1'); // Chờ duyệt kỹ năng
  });

  it('fixes loading bug: only clicked profile shows spinner, others remain active', async () => {
    listReviews.mockResolvedValue(sampleRows);
    let resolveDetail: (val: unknown) => void;
    const detailPromise = new Promise((resolve) => {
      resolveDetail = resolve;
    });
    getReview.mockReturnValue(detailPromise);

    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    // Find all 'Xem hồ sơ' buttons in the table
    const buttons = wrapper
      .findAll('tbody button')
      .filter((b) => b.text().includes('Xem hồ sơ'));
    expect(buttons.length).toBe(4);

    // Click the first profile button
    await buttons[0].trigger('click');

    // First button should now be disabled and show loading indicator
    expect(buttons[0].attributes('disabled')).toBeDefined();
    expect(buttons[0].html()).toContain('animate-spin');

    // Other buttons must NOT be disabled and must NOT show loading spinner
    expect(buttons[1].attributes('disabled')).toBeUndefined();
    expect(buttons[1].html()).not.toContain('animate-spin');
    expect(buttons[2].attributes('disabled')).toBeUndefined();
    expect(buttons[2].html()).not.toContain('animate-spin');
    expect(buttons[3].attributes('disabled')).toBeUndefined();
    expect(buttons[3].html()).not.toContain('animate-spin');

    // Resolve the API call
    resolveDetail!(mockDetail('tech-1', 'visit_required'));
    await flushPromises();

    // After resolving, first button should no longer be loading
    expect(buttons[0].html()).not.toContain('animate-spin');
  });

  it('prevents duplicate API call when clicking the same row repeatedly', async () => {
    listReviews.mockResolvedValue(sampleRows);
    let resolveDetail: (val: unknown) => void;
    const detailPromise = new Promise((resolve) => {
      resolveDetail = resolve;
    });
    getReview.mockReturnValue(detailPromise);

    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    const buttons = wrapper
      .findAll('tbody button')
      .filter((b) => b.text().includes('Xem hồ sơ'));

    // Click twice quickly
    await buttons[0].trigger('click');
    await buttons[0].trigger('click');

    expect(getReview).toHaveBeenCalledTimes(1);

    resolveDetail!(mockDetail('tech-1', 'visit_required'));
    await flushPromises();
  });

  it('handles race conditions: ignores stale response if user switches to another profile', async () => {
    listReviews.mockResolvedValue(sampleRows);

    let resolveFirst: (val: unknown) => void;
    let resolveSecond: (val: unknown) => void;
    const p1 = new Promise((res) => {
      resolveFirst = res;
    });
    const p2 = new Promise((res) => {
      resolveSecond = res;
    });

    getReview.mockImplementation((id: string) => {
      if (id === 'tech-1') return p1;
      if (id === 'tech-2') return p2;
      return Promise.resolve(mockDetail(id, 'profile_review'));
    });

    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    const buttons = wrapper
      .findAll('tbody button')
      .filter((b) => b.text().includes('Xem hồ sơ'));

    // Admin clicks tech-1, then immediately clicks tech-2
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    // Tech-1 resolves AFTER tech-2 (out-of-order response)
    resolveSecond!(mockDetail('tech-2', 'visit_scheduled'));
    await flushPromises();

    resolveFirst!(mockDetail('tech-1', 'visit_required'));
    await flushPromises();

    // The open detail drawer must show tech-2, NOT tech-1
    expect(wrapper.text()).toContain('Duyệt hồ sơ: Kỹ thuật viên tech-2');
    expect(wrapper.text()).not.toContain('Duyệt hồ sơ: Kỹ thuật viên tech-1');
  });

  it('resets loading state when API fails, avoiding infinite spinner', async () => {
    listReviews.mockResolvedValue(sampleRows);
    getReview.mockRejectedValue(new Error('Network error'));

    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    const buttons = wrapper
      .findAll('tbody button')
      .filter((b) => b.text().includes('Xem hồ sơ'));

    await buttons[0].trigger('click');
    await flushPromises();

    // Button must recover from loading
    expect(buttons[0].html()).not.toContain('animate-spin');
    expect(buttons[0].attributes('disabled')).toBeUndefined();
    // Error notification must be visible
    expect(wrapper.text()).toContain('Chưa mở được hồ sơ, vui lòng thử lại.');
  });

  it('filters by search query across name, email and phone', async () => {
    listReviews.mockResolvedValue(sampleRows);
    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    const searchInput = wrapper.get('input[type="search"]');

    // Search by name
    await searchInput.setValue('Nguyễn Văn A');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('nva@fixhome.vn');

    // Search by email
    await searchInput.setValue('ttb@fixhome.vn');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Trần Thị B');

    // Search by phone
    await searchInput.setValue('0987654321');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Lê Văn C');
  });

  it('opens detail drawer when clicking anywhere on the table row', async () => {
    listReviews.mockResolvedValue(sampleRows);
    getReview.mockResolvedValue(mockDetail('tech-1', 'visit_required'));

    const wrapper = mount(AdminProfileReviewsPage, {
      global: {
        stubs: { teleport: true },
        provide: {
          'Symbol(router)': { push: vi.fn() },
        },
      },
    });
    await flushPromises();

    // Click directly on the first row (tr)
    const rows = wrapper.findAll('tbody tr');
    await rows[0].trigger('click');
    await flushPromises();

    expect(getReview).toHaveBeenCalledWith('tech-1');
    expect(wrapper.text()).toContain('Duyệt hồ sơ: Kỹ thuật viên tech-1');
  });
});
