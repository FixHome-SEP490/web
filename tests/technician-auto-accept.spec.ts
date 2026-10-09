import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// "Tự nhận việc" on the invitations page (PO 10/10/2026).
const { bookingsApi, technicianProfileApi, push } = vi.hoisted(() => ({
  bookingsApi: { getMyInvitations: vi.fn(), respondInvitation: vi.fn() },
  technicianProfileApi: { getMyProfile: vi.fn(), updateMyProfile: vi.fn() },
  push: vi.fn(),
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi }));
vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import TechnicianInvitationsPage from '../src/pages/technician/TechnicianInvitationsPage.vue';

const invitation = {
  id: 'inv-1', bookingId: 'b-1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-10-10T01:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
  booking: { id: 'b-1', province: 'TP HCM', district: 'Quận 1', serviceName: 'Sửa quạt', quantity: 1, urgency: 'medium', preferredStartAt: null, preferredEndAt: null },
};
const stubs = { FhCountdown: true, FhSkeleton: true, FhButton: { template: '<button><slot /></button>' } };
const mountPage = async () => {
  const w = mount(TechnicianInvitationsPage, { global: { stubs } });
  await flushPromises();
  return w;
};

describe('Tự nhận việc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookingsApi.getMyInvitations.mockResolvedValue([invitation]);
    technicianProfileApi.getMyProfile.mockResolvedValue({ autoAcceptInvitations: false });
  });

  it('shows the switch with the saved state', async () => {
    const w = await mountPage();
    const toggle = w.get('[data-testid="auto-accept-toggle"]');
    expect(toggle.text()).toContain('Tự nhận việc');
    expect(toggle.attributes('aria-checked')).toBe('false');
  });

  it('switching on saves it and reloads the list, whose waiting invitations are taken', async () => {
    technicianProfileApi.updateMyProfile.mockResolvedValue({ autoAcceptInvitations: true });
    const w = await mountPage();
    bookingsApi.getMyInvitations.mockResolvedValue([]);

    await w.get('[data-testid="auto-accept-toggle"]').trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMyProfile).toHaveBeenCalledWith({ autoAcceptInvitations: true });
    expect(w.get('[data-testid="auto-accept-toggle"]').attributes('aria-checked')).toBe('true');
    expect(bookingsApi.getMyInvitations).toHaveBeenCalledTimes(2);
    expect(w.text()).toContain('Lời mời mới sẽ được tự nhận');
  });

  it('switching off saves it without reloading', async () => {
    technicianProfileApi.getMyProfile.mockResolvedValue({ autoAcceptInvitations: true });
    technicianProfileApi.updateMyProfile.mockResolvedValue({ autoAcceptInvitations: false });
    const w = await mountPage();

    await w.get('[data-testid="auto-accept-toggle"]').trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMyProfile).toHaveBeenCalledWith({ autoAcceptInvitations: false });
    expect(w.get('[data-testid="auto-accept-toggle"]').attributes('aria-checked')).toBe('false');
    expect(bookingsApi.getMyInvitations).toHaveBeenCalledTimes(1);
  });

  it('a failed save keeps the old state and says only to try again', async () => {
    technicianProfileApi.updateMyProfile.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL' } } } });
    const w = await mountPage();

    await w.get('[data-testid="auto-accept-toggle"]').trigger('click');
    await flushPromises();

    expect(w.get('[data-testid="auto-accept-toggle"]').attributes('aria-checked')).toBe('false');
    expect(w.text()).toContain('Chưa đổi được chế độ tự nhận việc. Vui lòng thử lại.');
    expect(w.text()).not.toMatch(/INTERNAL|500/);
  });

  it('hides the switch when the profile cannot be read, the list still works', async () => {
    technicianProfileApi.getMyProfile.mockRejectedValue(new Error('offline'));
    const w = await mountPage();

    expect(w.find('[data-testid="auto-accept-toggle"]').exists()).toBe(false);
    expect(w.text()).toContain('Sửa quạt');
  });
});
