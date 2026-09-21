import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getMyProfile, getTechnicianJobs, getMyInvitations } = vi.hoisted(() => ({
  getMyProfile: vi.fn(), getTechnicianJobs: vi.fn(), getMyInvitations: vi.fn(),
}));
vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi: { getMyProfile } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getTechnicianJobs } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getMyInvitations } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { fullName: 'Synthetic technician' } }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn() }) }));
import TechnicianDashboard from '../src/pages/technician/TechnicianDashboard.vue';

beforeEach(() => {
  getMyProfile.mockReset(); getTechnicianJobs.mockReset(); getMyInvitations.mockReset();
  getTechnicianJobs.mockResolvedValue([]); getMyInvitations.mockResolvedValue([]);
});
const badge = '[data-testid="technician-receive-status"]';

describe('WEB-WIZARD-TECH real pause state on technician dashboard', () => {
  it.each([
    [true, 'Đang nhận đơn mới'],
    [false, 'Tạm ngưng nhận đơn mới'],
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
});