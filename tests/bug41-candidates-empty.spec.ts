import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getDetailed, getBooking, getVisit, push, route } = vi.hoisted(() => ({
  getDetailed: vi.fn(),
  getBooking: vi.fn(),
  getVisit: vi.fn(),
  push: vi.fn(),
  route: {
    params: { id: 'booking-test' },
    query: {},
    meta: { visit: false },
  },
}));
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, back: vi.fn() }),
}));
vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { getCandidatesWithDiagnostics: getDetailed, getBooking, sendShortlist: vi.fn() },
}));
vi.mock('../src/api/visit-groups.api', () => ({
  visitGroupsApi: { candidates: getVisit, shortlist: vi.fn() },
}));

import BookingCandidatesPage from '../src/pages/customer/BookingCandidatesPage.vue';

describe('BUG #41 — empty candidates explains actual server evidence', () => {
  beforeEach(() => {
    getDetailed.mockReset();
    getBooking.mockReset();
    getVisit.mockReset();
    push.mockReset();
    route.meta.visit = false;
    getVisit.mockResolvedValue([]);
  });

  it.each([
    ['OUTSIDE_COVERAGE', 'Địa chỉ nằm ngoài khu vực phục vụ', 'Đặt lại với địa chỉ khác'],
    ['BOOKING_LOCATION_MISSING', 'Chưa xác định được vị trí đặt lịch', 'Xem yêu cầu'],
    ['TIME_UNAVAILABLE', 'Chưa có thợ rảnh trong giờ hẹn này', 'Xem lịch hẹn'],
    ['UNAVAILABLE', 'Chưa có kỹ thuật viên phù hợp', 'Xem yêu cầu'],
    [null, 'Chưa có kỹ thuật viên phù hợp', 'Xem yêu cầu'],
  ] as const)('renders %s without guessing another cause', async (reason, expected, action) => {
    getDetailed.mockResolvedValue({ candidates: [], emptyReason: reason });
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();
    expect(wrapper.text()).toContain(expected);
    expect(wrapper.text()).toContain(action);
    // No technician was found, so the page never claims one is ready.
    expect(wrapper.find('[data-testid="candidates-ready-badge"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Đang có thợ sẵn sàng nhận đơn');
    if (reason === 'OUTSIDE_COVERAGE') {
      expect(wrapper.text()).not.toContain('Hãy đổi sang buổi khác');
      expect(wrapper.text()).not.toContain('Đổi giờ hẹn');
    }
    wrapper.unmount();
  });

  it('offers a new request for the same service at another address when out of area', async () => {
    getDetailed.mockResolvedValue({ candidates: [], emptyReason: 'OUTSIDE_COVERAGE' });
    getBooking.mockResolvedValue({ id: 'booking-test', serviceId: 'service-ac', description: 'Máy lạnh không mát' });
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Đặt lại với địa chỉ khác')!.trigger('click');
    await flushPromises();
    expect(getBooking).toHaveBeenCalledWith('booking-test');
    expect(push).toHaveBeenCalledWith({ name: 'new-booking', query: { serviceId: 'service-ac', desc: 'Máy lạnh không mát' } });
    push.mockReset();
    await wrapper.findAll('button').find((button) => button.text() === 'Xem yêu cầu')!.trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'booking-detail', params: { id: 'booking-test' } });
    wrapper.unmount();
  });

  it('still opens the booking form when the request cannot be read', async () => {
    getDetailed.mockResolvedValue({ candidates: [], emptyReason: 'OUTSIDE_COVERAGE' });
    getBooking.mockRejectedValue(new Error('offline'));
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Đặt lại với địa chỉ khác')!.trigger('click');
    await flushPromises();
    expect(push).toHaveBeenCalledWith({ name: 'new-booking', query: {} });
    wrapper.unmount();
  });

  it('does not show any empty reason when technicians are available', async () => {
    getDetailed.mockResolvedValue({ candidates: [{
      id: 'tech-1', userId: 'tech-1', technicianId: 'profile-1', fullName: 'Thợ thử nghiệm',
      averageRating: 4.5, ratingCount: 10, reliabilityScore: 90, yearsExperience: 5,
    }], emptyReason: 'OUTSIDE_COVERAGE' });
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();
    expect(wrapper.text()).toContain('Thợ thử nghiệm');
    expect(wrapper.text()).not.toContain('Địa chỉ nằm ngoài khu vực phục vụ');
    expect(wrapper.find('[data-testid="candidates-ready-badge"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps transport errors distinct from empty search results', async () => {
    getDetailed.mockRejectedValue(new Error('offline'));
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();
    expect(wrapper.text()).toContain('Không thể tải danh sách kỹ thuật viên phù hợp');
    expect(wrapper.text()).not.toContain('Địa chỉ nằm ngoài khu vực phục vụ');
    wrapper.unmount();
  });

  it('does not invent a solo-booking reason for VisitGroup', async () => {
    route.meta.visit = true;
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();
    expect(getVisit).toHaveBeenCalledWith('booking-test');
    expect(getDetailed).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Chưa có kỹ thuật viên phù hợp');
    expect(wrapper.text()).not.toContain('Đổi giờ hẹn');
    wrapper.unmount();
  });
});
