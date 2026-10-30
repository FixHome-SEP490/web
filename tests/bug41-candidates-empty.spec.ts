import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getDetailed, getVisit, push, route } = vi.hoisted(() => ({
  getDetailed: vi.fn(),
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
  bookingsApi: { getCandidatesWithDiagnostics: getDetailed, sendShortlist: vi.fn() },
}));
vi.mock('../src/api/visit-groups.api', () => ({
  visitGroupsApi: { candidates: getVisit, shortlist: vi.fn() },
}));

import BookingCandidatesPage from '../src/pages/customer/BookingCandidatesPage.vue';

describe('BUG #41 — empty candidates explains actual server evidence', () => {
  beforeEach(() => {
    getDetailed.mockReset();
    getVisit.mockReset();
    push.mockReset();
    route.meta.visit = false;
    getVisit.mockResolvedValue([]);
  });

  it.each([
    ['OUTSIDE_COVERAGE', 'Địa chỉ nằm ngoài khu vực phục vụ', 'Xem địa chỉ đặt lịch'],
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
    if (reason === 'OUTSIDE_COVERAGE') {
      expect(wrapper.text()).not.toContain('Hãy đổi sang buổi khác');
      expect(wrapper.text()).not.toContain('Đổi giờ hẹn');
    }
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
