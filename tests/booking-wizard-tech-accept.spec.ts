import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const { mockGet, mockPost, push, route } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockPost: vi.fn(), push: vi.fn(),
  route: { params: { id: 'booking-from-route' } },
}));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: mockPost } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import { bookingsApi } from '../src/api/bookings.api';
import TechnicianInvitationsPage from '../src/pages/technician/TechnicianInvitationsPage.vue';
import BookingCandidatesPage from '../src/pages/customer/BookingCandidatesPage.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { slots, attrs }) { return () => h('button', { ...attrs, disabled: props.disabled || props.loading }, slots.default?.()); },
});
const invitation = {
  id: 'inv-1', bookingId: 'booking-from-route', priorityOrder: 1, status: 'pending',
  invitedAt: '2030-01-01T08:00:00Z', expiresAt: '2030-01-01T09:00:00Z',
  booking: { id: 'booking-from-route', serviceName: 'Synthetic repair', district: 'Synthetic District', province: 'Synthetic Province', quantity: 1, urgency: 'medium', preferredStartAt: null, preferredEndAt: null },
};
const candidate = { userId: 'technician-real-id', technicianId: 'profile-not-user-id', fullName: 'Synthetic technician', averageRating: 4, ratingCount: 2, yearsExperience: 2, reliabilityScore: 80, isAvailable: true };
const global = { stubs: { FhButton: ActionButton, FhCountdown: true, FhMoney: true, FhEmptyState: true, FhStatusPill: true } };

beforeEach(() => {
  mockGet.mockReset(); mockPost.mockReset(); push.mockReset();
  vi.stubGlobal('alert', vi.fn());
});

describe('WEB-WIZARD-TECH Accept must open the returned ServiceOrder', () => {
  it('reads actual serviceOrder.id from Backend response envelope and opens exact tech job', async () => {
    mockPost.mockResolvedValue({ data: { data: { invitation: { id: 'inv-1', status: 'accepted' }, serviceOrder: { id: 'service-order-real-id' } } } });
    const result = await bookingsApi.respondInvitation('inv-1', 'ACCEPT');
    expect(result).toEqual({ serviceOrderId: 'service-order-real-id' });
    expect(mockPost).toHaveBeenCalledWith('/invitations/inv-1/respond', { action: 'ACCEPT' });
  });
  it('navigates only to returned ServiceOrder ID after Accept, never generic jobs', async () => {
    mockGet.mockResolvedValue({ data: { data: [invitation] } });
    mockPost.mockResolvedValue({ data: { data: { invitation: { id: 'inv-1', status: 'accepted' }, serviceOrder: { id: 'service-order-real-id' } } } });
    const wrapper = mount(TechnicianInvitationsPage, { global });
    await flushPromises();
    const accept = wrapper.findAll('button').find(b => b.text().includes('Chấp nhận đơn này'));
    expect(accept?.exists()).toBe(true);
    await accept!.trigger('click');
    await flushPromises();
    expect(push).toHaveBeenCalledWith({ name: 'tech-job-detail', params: { id: 'service-order-real-id' } });
    expect(push).not.toHaveBeenCalledWith('/tech/jobs');
  });
  it('never navigates or claims success if Backend response has no serviceOrder ID', async () => {
    mockGet.mockResolvedValue({ data: { data: [invitation] } });
    mockPost.mockResolvedValue({ data: { data: { invitation: { id: 'inv-1' } } } });
    const wrapper = mount(TechnicianInvitationsPage, { global });
    await flushPromises();
    const accept = wrapper.findAll('button').find(b => b.text().includes('Chấp nhận đơn này'));
    await accept!.trigger('click');
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
    expect(vi.mocked(alert)).toHaveBeenCalledWith(expect.stringContaining('Chưa xác nhận được'));
  });
});

describe('WEB-WIZARD-TECH shortlist confirmation', () => {
  it.each([1, 3, 5])('submits exactly %i distinct backend User IDs and never profile IDs', async number => {
    const items = Array.from({ length: number }, (_, i) => ({
      ...candidate, userId: `user-${i + 1}`, technicianId: `profile-${i + 1}`, fullName: `Synthetic tech ${i + 1}`,
    }));
    mockGet.mockResolvedValue({ data: { data: items } });
    mockPost.mockResolvedValue({ data: { data: [] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    // Backend ranks candidates, Web defaults to three and lets the customer select up to five.
    if (number > 3) {
      for (let i = 3; i < number; i++) await wrapper.findAll('input[type="checkbox"]')[i].trigger('change');
    }
    const send = wrapper.findAll('button').find(b => b.text().includes('Gửi lời mời đồng thời'));
    await send!.trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-from-route/shortlist', {
      technicianIds: items.map(item => item.userId),
    });
    wrapper.unmount();
  });

  it('rejects a candidate lacking backend userId instead of sending a profile id', async () => {
    mockGet.mockResolvedValue({ data: { data: [{ ...candidate, userId: undefined }] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    expect(wrapper.text()).toContain('Không thể tải danh sách kỹ thuật viên phù hợp');
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('opens actual Booking detail after shortlist instead of a delayed generic orders redirect', async () => {
    mockGet.mockResolvedValue({ data: { data: [candidate] } });
    mockPost.mockResolvedValue({ data: { data: [{ id: 'invite-1', status: 'pending' }] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    const send = wrapper.findAll('button').find(b => b.text().includes('Gửi lời mời đồng thời'));
    expect(send?.exists()).toBe(true);
    await send!.trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-from-route/shortlist', { technicianIds: ['technician-real-id'] });
    expect(wrapper.text()).toContain('Đã gửi lời mời');
    const view = wrapper.find('[data-testid="view-matching-booking"]');
    expect(view.exists()).toBe(true);
    await view.trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'booking-detail', params: { id: 'booking-from-route' } });
    expect(push).not.toHaveBeenCalledWith('/app/orders');
  });

  it('describes simultaneous invitations and first valid Accept wins', async () => {
    mockGet.mockResolvedValue({ data: { data: [candidate] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();

    expect(wrapper.text()).toContain('gửi lời mời đến các thợ bạn chọn cùng lúc');
    expect(wrapper.text()).toContain('Người đầu tiên đủ điều kiện xác nhận sẽ nhận đơn');
    expect(wrapper.text()).not.toContain('tuần tự');
    expect(wrapper.text()).not.toContain('30 phút');
    wrapper.unmount();
  });
});
