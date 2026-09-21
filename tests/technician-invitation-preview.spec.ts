import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { mockGet, push } = vi.hoisted(() => ({ mockGet: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import { bookingsApi } from '../src/api/bookings.api';
import TechnicianInvitationsPage from '../src/pages/technician/TechnicianInvitationsPage.vue';

const preview = {
  id: 'booking-synthetic', province: 'Synthetic Province', district: 'Synthetic District',
  serviceName: 'Synthetic repair', quantity: 2, urgency: 'high',
  preferredStartAt: '2030-01-01T09:00:00.000Z', preferredEndAt: '2030-01-01T10:00:00.000Z',
  customerId: 'PRIVATE_CUSTOMER_ID', addressTextSnapshot: 'PRIVATE_HOUSE_NUMBER',
  description: 'PRIVATE_FREE_TEXT', media: [{ url: 'PRIVATE_IMAGE_URL' }],
  latitudeSnapshot: 10.123, longitudeSnapshot: 106.123, diagnosis: { rawResponse: 'PRIVATE_AI' },
};
const invitation = {
  id: 'invite-synthetic', bookingId: 'booking-synthetic', priorityOrder: 1,
  status: 'pending', invitedAt: '2030-01-01T08:00:00.000Z',
  expiresAt: '2030-01-01T08:30:00.000Z', booking: preview,
  technicianId: 'PRIVATE_TECH_ID',
};

beforeEach(() => { mockGet.mockReset(); push.mockReset(); });

describe('WEB technician invitation safe preview integration', () => {
  it('maps backend preview with no Booking.status into a strict allowlisted invitation', async () => {
    mockGet.mockResolvedValue({ data: { data: [invitation] } });
    const result = await bookingsApi.getMyInvitations();
    expect(mockGet).toHaveBeenCalledWith('/invitations/my');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('PENDING');
    expect(result[0].booking).toEqual({
      id: 'booking-synthetic', serviceName: 'Synthetic repair',
      addressSummary: 'Synthetic District, Synthetic Province',
      quantity: 2, urgency: 'high',
      preferredStartAt: preview.preferredStartAt, preferredEndAt: preview.preferredEndAt,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });
  it('renders only coarse area/service/urgency, never private description or media', async () => {
    mockGet.mockResolvedValue({ data: { data: [invitation] } });
    const wrapper = mount(TechnicianInvitationsPage, {
      global: { stubs: { FhCountdown: true, FhButton: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Synthetic repair');
    expect(wrapper.text()).toContain('Synthetic District, Synthetic Province');
    expect(wrapper.text()).not.toContain('PRIVATE_');
    const details = wrapper.find('button.w-full');
    expect(details.exists()).toBe(true);
    await details.trigger('click');
    expect(wrapper.text()).not.toContain('PRIVATE_');
    expect(wrapper.find('a[href="PRIVATE_IMAGE_URL"]').exists()).toBe(false);
  });
});