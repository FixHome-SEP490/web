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

describe('WEB-WIZARD-TECH customer-ranked two-technician shortlist', () => {
  const two = [
    { ...candidate, userId: 'user-1', technicianId: 'profile-1', fullName: 'Synthetic Tech 1' },
    { ...candidate, userId: 'user-2', technicianId: 'profile-2', fullName: 'Synthetic Tech 2' },
  ];
  const sendButton = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('button').find(button => button.text().includes('Mời thợ ưu tiên số 1'))!;

  it('requires the customer to choose two and sends their chosen priority, never profile IDs', async () => {
    mockGet.mockResolvedValue({ data: { data: two } });
    mockPost.mockResolvedValue({ data: { data: [] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect(inputs).toHaveLength(2);
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined();
    await inputs[1].trigger('change');
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined();
    await inputs[0].trigger('change');
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined();
    await sendButton(wrapper).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-from-route/shortlist', {
      technicianIds: ['user-2', 'user-1'],
    });
    wrapper.unmount();
  });

  it('does not select a third technician or silently preselect anyone', async () => {
    const third = { ...candidate, userId: 'user-3', technicianId: 'profile-3', fullName: 'Synthetic Tech 3' };
    mockGet.mockResolvedValue({ data: { data: [...two, third] } });
    mockPost.mockResolvedValue({ data: { data: [] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect(inputs.every(input => (input.element as HTMLInputElement).checked === false)).toBe(true);
    await inputs[0].trigger('change');
    await inputs[1].trigger('change');
    await inputs[2].trigger('change');
    expect((inputs[2].element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.text()).toContain('Chỉ được chọn đúng 2');
    await sendButton(wrapper).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-from-route/shortlist', {
      technicianIds: ['user-1', 'user-2'],
    });
    wrapper.unmount();
  });

  it('restores native checkbox state when a third technician is rejected, then allows replacing a selected technician', async () => {
    const third = { ...candidate, userId: 'user-3', technicianId: 'profile-3', fullName: 'Synthetic Tech 3' };
    mockGet.mockResolvedValue({ data: { data: [...two, third] } });
    mockPost.mockResolvedValue({ data: { data: [] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    const inputs = wrapper.findAll('input[type="checkbox"]');
    for (const index of [0, 1]) {
      (inputs[index].element as HTMLInputElement).checked = true;
      await inputs[index].trigger('change');
    }
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined();
    // A real user interaction has already changed the native checked flag.
    (inputs[2].element as HTMLInputElement).checked = true;
    await inputs[2].trigger('change');
    expect((inputs[2].element as HTMLInputElement).checked).toBe(false);
    expect((inputs[0].element as HTMLInputElement).checked).toBe(true);
    expect((inputs[1].element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.text()).toContain('Chỉ được chọn đúng 2');
    (inputs[0].element as HTMLInputElement).checked = false;
    await inputs[0].trigger('change');
    (inputs[2].element as HTMLInputElement).checked = true;
    await inputs[2].trigger('change');
    expect((inputs[2].element as HTMLInputElement).checked).toBe(true);
    await sendButton(wrapper).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-from-route/shortlist', {
      technicianIds: ['user-2', 'user-3'],
    });
    wrapper.unmount();
  });

  it('disables send when fewer than two candidates are selected', async () => {
    mockGet.mockResolvedValue({ data: { data: [candidate] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').trigger('change');
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
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

  it('opens the exact Booking detail after sending the first invitation', async () => {
    mockGet.mockResolvedValue({ data: { data: two } });
    mockPost.mockResolvedValue({ data: { data: [{ id: 'invite-1', status: 'pending' }] } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    const inputs = wrapper.findAll('input[type="checkbox"]');
    await inputs[0].trigger('change');
    await inputs[1].trigger('change');
    await sendButton(wrapper).trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-from-route/shortlist', { technicianIds: ['user-1', 'user-2'] });
    expect(wrapper.text()).toContain('Đã gửi lời mời');
    await wrapper.find('[data-testid="view-matching-booking"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'booking-detail', params: { id: 'booking-from-route' } });
    wrapper.unmount();
  });

  it('explains technician #2 is only invited after #1 declines or expires', async () => {
    mockGet.mockResolvedValue({ data: { data: two } });
    const wrapper = mount(BookingCandidatesPage, { global });
    await flushPromises();
    expect(wrapper.text()).toContain('mời thợ số 1 trước');
    expect(wrapper.text()).toContain('thợ số 2 mới nhận lời mời');
    expect(wrapper.text()).not.toContain('gửi lời mời đến các thợ bạn chọn cùng lúc');
    wrapper.unmount();
  });
});