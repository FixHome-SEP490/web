import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Admin look-up of technicians (PO 08/10/2026): by name, email, phone, CCCD or
// id, never by address; everything about one technician on the right.
const { search, detail } = vi.hoisted(() => ({ search: vi.fn(), detail: vi.fn() }));
vi.mock('../src/api/admin-technicians.api', () => ({ adminTechniciansApi: { search, detail } }));
import AdminTechnicianDirectoryPage from '../src/pages/console/admin/AdminTechnicianDirectoryPage.vue';

const row = {
  id: 'u1', profileId: 'p1', fullName: 'Nguyễn Văn Thợ', email: 'tho@fixhome.vn', phoneNumber: '0912345678',
  citizenIdNumber: '079200001234', status: 'active', reputationPoints: 90, verificationStatus: 'verified',
  isAvailable: true, averageRating: 4.5, ratingCount: 10, workSuspendedUntil: null, createdAt: '2026-09-01T00:00:00Z',
};
const full = {
  user: { id: 'u1', fullName: 'Nguyễn Văn Thợ', email: 'tho@fixhome.vn', phoneNumber: '0912345678', citizenIdNumber: '079200001234', dateOfBirth: '1990-05-01', gender: 'male', avatarUrl: null, status: 'active', emailVerified: true, authProvider: 'local', reputationPoints: 90, createdAt: '2026-09-01T00:00:00Z' },
  profile: { id: 'p1', verificationStatus: 'verified', yearsExperience: 5, bio: null, averageRating: 4.5, ratingCount: 10, reliabilityScore: 100, isAvailable: true, serviceRadiusKm: 15, fullAddress: '1 Lê Lợi, Quận 1', workSuspendedUntil: null, priorityBoostUntil: null, lastLocationAt: null, onboardingStep: 5 },
  skills: [{ serviceName: 'Vệ sinh máy lạnh', listedLaborPrice: 200000, verificationStatus: 'verified', isActive: true }],
  serviceAreas: [{ provinceCode: '79', districtCode: '760' }],
  schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '18:00' }],
  upcomingTimeOff: [],
  walletBalance: 500000,
  orderCounts: { completed: 3 },
  recentOrders: [{ id: 'o1', code: 'FH-1', status: 'completed', grandTotal: 400000, createdAt: '2026-10-01T00:00:00Z' }],
  verification: { status: 'verified', submittedAt: '2026-09-02T00:00:00Z', reviewedAt: null, rejectionReason: null },
  reputationEvents: [{ kind: 'violation', delta: -10, pointsAfter: 90, reason: 'Huỷ nhận đơn #FH-0', createdAt: '2026-10-02T00:00:00Z' }],
};

describe('Admin technician directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.mockResolvedValue({ data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    detail.mockResolvedValue(full);
  });

  it('asks for something to search before calling the server', async () => {
    const w = mount(AdminTechnicianDirectoryPage, { global: { stubs: { RouterLink: true } } });
    await w.get('form').trigger('submit');
    expect(search).not.toHaveBeenCalled();
    expect(w.text()).toContain('Nhập tên, email, số điện thoại, CCCD');
  });

  it('searches the trimmed text and shows each technician briefly', async () => {
    const w = mount(AdminTechnicianDirectoryPage, { global: { stubs: { RouterLink: true } } });
    await w.get('[data-testid="tech-search"]').setValue('  0912345678  ');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(search).toHaveBeenCalledWith({ search: '0912345678', page: 1, pageSize: 20 });
    const text = w.get('[data-testid="tech-results"]').text();
    expect(text).toContain('Nguyễn Văn Thợ');
    expect(text).toContain('KYC: Đã duyệt');
    expect(text).toContain('Điểm uy tín 90');
  });

  it('opens everything about the technician', async () => {
    const w = mount(AdminTechnicianDirectoryPage, { global: { stubs: { RouterLink: true } } });
    await w.get('[data-testid="tech-search"]').setValue('tho');
    await w.get('form').trigger('submit');
    await flushPromises();
    await w.get('[data-testid="tech-row-u1"]').trigger('click');
    await flushPromises();
    expect(detail).toHaveBeenCalledWith('u1');
    const text = w.get('[data-testid="tech-detail"]').text().replace(/\s+/g, ' ');
    for (const piece of ['079200001234', '0912345678', '01/05/1990', 'Vệ sinh máy lạnh', 'T2 08:00-18:00', 'Hoàn tất: 3', '500.000', 'Huỷ nhận đơn #FH-0', '1 Lê Lợi, Quận 1']) {
      expect(text).toContain(piece);
    }
  });
});
