import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getMyProfile, updateMyProfile, getTechnicianJobs, getMyInvitations, getMyAvailability } = vi.hoisted(() => ({
  getMyProfile: vi.fn(), updateMyProfile: vi.fn(), getTechnicianJobs: vi.fn(), getMyInvitations: vi.fn(), getMyAvailability: vi.fn(),
}));
vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi: { getMyProfile, updateMyProfile, getMyAvailability } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getTechnicianJobs } }));
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

  it('renders 0 VND balance, Dưới mức ký quỹ, and blocks online toggle when balance is 0', async () => {
    getMyProfile.mockResolvedValue({ isAvailable: false });
    const wrapper = mount(TechnicianDashboard, { global: { stubs: { FhButton: true, FhStatusPill: true, FhCountdown: true, 'router-link': true } } });
    await flushPromises();

    // Verify 0 VND balance & status
    expect(wrapper.text()).toContain('0');
    expect(wrapper.text()).toContain('Dưới mức ký quỹ');
    expect(wrapper.text()).toContain('đang thấp hơn mức ký quỹ tối thiểu');

    // Click toggle button
    const toggleBtn = wrapper.find('button[type="button"]');
    await toggleBtn.trigger('click');
    await flushPromises();

    // Still unavailable, updateMyProfile was not called with true
    expect(updateMyProfile).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});