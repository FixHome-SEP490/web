import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getMyProfile, updateMyProfile, getTechnicianJobs, getMyInvitations, getMyAvailability } = vi.hoisted(() => ({
  getMyProfile: vi.fn(), updateMyProfile: vi.fn(), getTechnicianJobs: vi.fn(), getMyInvitations: vi.fn(), getMyAvailability: vi.fn(),
}));
vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi: { getMyProfile, updateMyProfile, getMyAvailability } }));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: { getTechnicianJobs },
  isHistoricalOrder: (o: { historical?: boolean }) => o.historical === true,
}));
vi.mock('../src/api/technician-onboarding.api', () => ({ technicianOnboardingApi: { getStatus: vi.fn().mockResolvedValue({ onboardingStatus: 'approved', verificationStatus: 'verified' }) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getMyInvitations } }));
vi.mock('../src/api/wallet.api', () => ({
  walletApi: {
    getMyWallet: vi.fn().mockResolvedValue({
      id: 'mock-wallet',
      technicianId: 'tech-1',
      balance: 0,
      pendingWithdrawal: 0,
      processingWithdrawal: 0,
      minimumBalance: 200000,
      minimumWithdrawal: 10000,
      availableBalance: 0,
      withdrawableBalance: 0,
      eligibleForJobs: false,
    }),
  },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { fullName: 'Synthetic technician' } }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn() }) }));
import TechnicianDashboard from '../src/pages/technician/TechnicianDashboard.vue';

beforeEach(() => {
  getMyProfile.mockReset(); getTechnicianJobs.mockReset(); getMyInvitations.mockReset();
  getTechnicianJobs.mockResolvedValue([]); getMyInvitations.mockResolvedValue([]);
  // Without the schedule-based status the badge falls back to the manual switch.
  getMyAvailability.mockReset().mockRejectedValue(new Error('not loaded'));
});
const badge = '[data-testid="technician-receive-status"]';

describe('WEB-WIZARD-TECH real pause state on technician dashboard', () => {
  it.each([
    [true, 'Đang nhận việc'],
    [false, 'Tạm nghỉ nhận đơn'],
  ])('shows source-backed isAvailable=%s rather than a hard-coded green badge', async (isAvailable, label) => {
    getMyProfile.mockResolvedValue({ isAvailable });
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();
    const indicator = wrapper.find(badge);
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('title')).toBe(label);
    expect(getMyProfile).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not claim the technician is available when profile loading fails', async () => {
    getMyProfile.mockRejectedValue(new Error('Synthetic network failure'));
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();
    const indicator = wrapper.find(badge);
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('title')).toBe('Chưa xác định trạng thái nhận đơn');
    expect(indicator.classes()).not.toContain('bg-emerald-500');
    wrapper.unmount();
  });

  it('stays grey outside working hours even with the switch on, and says when it comes back (PO 08/10/2026)', async () => {
    getMyProfile.mockResolvedValue({ isAvailable: true });
    getMyAvailability.mockReset().mockResolvedValue({ state: 'off_hours', receiving: false, until: null, nextStartAt: '2030-01-02T01:00:00Z' });
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();
    const indicator = wrapper.find(badge);
    expect(indicator.attributes('title')).toBe('Ngoài giờ làm');
    expect(indicator.classes()).toContain('bg-ink-400');
    expect(wrapper.get('[data-testid="availability-status"]').text()).toContain('Tự nhận việc lại lúc 08:00');
    wrapper.unmount();
  });

  it('renders 0 VND balance and Dưới mức ký quỹ with the floor, and offers no second availability switch', async () => {
    getMyProfile.mockResolvedValue({ isAvailable: false });
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();

    const summary = wrapper.get('[data-testid="dashboard-summary"]').text();
    expect(summary).toContain('0 ₫');
    expect(summary).toContain('Dưới mức ký quỹ');
    expect(summary).toContain('200.000 ₫');
    expect(summary).not.toContain('Đủ điều kiện nhận việc');

    // The header owns the switch (one action, one place): nothing on the dashboard changes availability.
    for (const button of wrapper.findAll('button')) {
      await button.trigger('click');
    }
    await flushPromises();
    expect(updateMyProfile).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="availability-status"]').element.tagName).not.toBe('BUTTON');
    wrapper.unmount();
  });

  it('does not repeat the navigation the layout already gives', async () => {
    getMyProfile.mockResolvedValue({ isAvailable: true });
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();
    const text = wrapper.text();
    for (const duplicate of ['Lối tắt', 'Việc của tôi', 'Thư mời nhận đơn', 'Lưu ý khi làm việc', 'Mở danh sách việc', 'Xem tất cả lịch sử', 'Kiểm tra hộp thư mời']) {
      expect(text).not.toContain(duplicate);
    }
    // Every page this screen links to is linked once.
    const links = wrapper.findAll('router-link-stub').map((link) => link.attributes('to'));
    expect(links.filter((to) => to === '/tech/jobs')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows the real payment state of recent completed jobs, not a blanket "paid"', async () => {
    getMyProfile.mockResolvedValue({ isAvailable: true });
    getTechnicianJobs.mockResolvedValue([
      { id: 'p', code: 'SO-P', status: 'COMPLETED', paymentStatus: 'PAID', serviceName: 'Paid job', addressSummary: 'A', laborTotal: 100000, grandTotal: 100000, completedAt: '2030-01-01T00:00:00Z' },
      { id: 'u', code: 'SO-U', status: 'COMPLETED', paymentStatus: 'UNPAID', serviceName: 'Unpaid job', addressSummary: 'B', laborTotal: 50000, grandTotal: 50000, completedAt: '2030-01-01T00:00:00Z' },
    ]);
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();
    const rows = wrapper.findAll('li').filter((li) => /SO-[PU]/.test(li.text()));
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Đã thanh toán');
    expect(rows[1].text()).toContain('Chưa thanh toán');
    expect(rows[1].text()).not.toContain('Đã thanh toán');
    wrapper.unmount();
  });

  it('says plainly when jobs fail to load and offers to retry, without technical wording', async () => {
    getMyProfile.mockResolvedValue({ isAvailable: true });
    getTechnicianJobs.mockRejectedValue({ response: { status: 500, data: { error: { message: 'Internal server error' } } } });
    const Button = { template: '<button type="button"><slot /></button>' };
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: Button, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Không thể tải công việc');
    expect(alert.text()).toContain('Thử lại');
    expect(wrapper.text()).not.toMatch(/Internal|500/);
    expect(wrapper.text()).not.toContain('Chưa có việc đang làm');
    wrapper.unmount();
  });
});