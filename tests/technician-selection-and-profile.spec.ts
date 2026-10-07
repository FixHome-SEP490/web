import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BookingCandidatesPage from '../src/pages/customer/BookingCandidatesPage.vue';
import TechnicianProfileModal from '../src/components/customer/TechnicianProfileModal.vue';
import { bookingsApi, type TechnicianCandidate } from '../src/api/bookings.api';
import { reviewsApi } from '../src/api/reviews.api';

// Mock router and route
const mockBack = vi.fn();
const mockPush = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-test-123' } }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: {
    getCandidates: vi.fn(),
    sendShortlist: vi.fn(),
  },
}));

vi.mock('../src/api/reviews.api', () => ({
  reviewsApi: {
    getByTechnician: vi.fn(),
  },
}));

const mockCandidates: TechnicianCandidate[] = [
  {
    id: 'user-tech-1',
    technicianId: 'profile-tech-1',
    userId: 'user-tech-1',
    fullName: 'Thợ Điện Lạnh 4',
    averageRating: 4.9,
    ratingCount: 31,
    yearsExperience: 7,
    reliabilityScore: 100,
    distanceKm: 0.4,
    isAvailable: true,
    listedLaborPrice: 180000,
    typicalWarrantyDays: 30,
  },
  {
    id: 'user-tech-2',
    technicianId: 'profile-tech-2',
    userId: 'user-tech-2',
    fullName: 'Thợ Điện Lạnh 9',
    averageRating: 4.8,
    ratingCount: 51,
    yearsExperience: 12,
    reliabilityScore: 100,
    distanceKm: 2.6,
    isAvailable: true,
    listedLaborPrice: 200000,
    typicalWarrantyDays: 60,
  },
];

describe('Technician Selection and Profile Modal Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bookingsApi.getCandidates).mockResolvedValue(mockCandidates);
    vi.mocked(reviewsApi.getByTechnician).mockResolvedValue({
      data: [
        {
          id: 'rev-1',
          serviceOrderId: 'order-1',
          customerId: 'cust-1',
          technicianId: 'user-tech-1',
          rating: 5,
          comment: 'Rất đúng giờ và tận tâm, sửa máy xong chạy cực êm!',
          createdAt: '2026-09-20T10:00:00.000Z',
        },
      ],
      total: 1,
    });
  });

  it('selects and deselects candidate when clicking directly on the card', async () => {
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();

    const cards = wrapper.findAll('[role="button"]');
    expect(cards.length).toBe(2);

    // Clicking anywhere on card 1 selects it as priority #1
    await cards[0].trigger('click');
    expect(wrapper.text()).toMatch(/Đã chọn:\s*1\s*\/\s*2/);
    expect(cards[0].classes()).toContain('border-brand-600');
    expect(cards[0].text()).toContain('#1');

    // Clicking anywhere on card 2 selects it as priority #2
    await cards[1].trigger('click');
    expect(wrapper.text()).toMatch(/Đã chọn:\s*2\s*\/\s*2/);
    expect(cards[1].text()).toContain('#2');

    // Clicking card 1 again unselects it
    await cards[0].trigger('click');
    expect(wrapper.text()).toMatch(/Đã chọn:\s*1\s*\/\s*2/);

    wrapper.unmount();
  });

  it('opens technician profile modal when clicking "Xem hồ sơ"', async () => {
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();

    const viewProfileButtons = wrapper.findAll('[data-testid="view-profile-btn"]');
    expect(viewProfileButtons.length).toBe(2);

    // Clicking "Xem hồ sơ" does not select the card
    await viewProfileButtons[0].trigger('click');
    expect(wrapper.text()).toMatch(/Đã chọn:\s*0\s*\/\s*2/);

    // Modal is opened with technician info
    const modal = wrapper.findComponent(TechnicianProfileModal);
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain('Thợ Điện Lạnh 4');
    expect(modal.text()).toContain('Tỷ lệ hoàn thành');
    // Response time was guessed from distance; only recorded figures are shown.
    expect(modal.text()).not.toContain('Thời gian phản hồi');
    expect(modal.text()).toContain('Đơn đã thực hiện');
    expect(modal.text()).toContain('Độ tin cậy');
    expect(modal.text()).toContain('Giới thiệu');

    // Check API was called with technician id
    expect(reviewsApi.getByTechnician).toHaveBeenCalledWith('user-tech-1');

    wrapper.unmount();
  });

  it('can toggle technician selection from inside the profile modal', async () => {
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();

    // Open modal for technician 1
    const viewProfileButtons = wrapper.findAll('[data-testid="view-profile-btn"]');
    await viewProfileButtons[0].trigger('click');

    const modal = wrapper.findComponent(TechnicianProfileModal);
    expect(modal.exists()).toBe(true);

    // Click "Chọn thợ này" in modal footer
    const selectInModalBtn = modal.findAll('button').find((b) => b.text().includes('Chọn thợ này'));
    expect(selectInModalBtn?.exists()).toBe(true);
    await selectInModalBtn!.trigger('click');

    // Selection synchronizes with parent state
    expect(wrapper.text()).toMatch(/Đã chọn:\s*1\s*\/\s*2/);

    wrapper.unmount();
  });

  it('closes profile modal when close button is clicked', async () => {
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();

    const viewProfileButtons = wrapper.findAll('[data-testid="view-profile-btn"]');
    await viewProfileButtons[0].trigger('click');

    let modal = wrapper.findComponent(TechnicianProfileModal);
    expect(modal.exists()).toBe(true);

    // Click close in modal
    const closeBtn = modal.find('button[aria-label="Đóng"]');
    await closeBtn.trigger('click');

    modal = wrapper.findComponent(TechnicianProfileModal);
    expect(modal.exists()).toBe(false);

    wrapper.unmount();
  });

  it('shows "Chưa có đánh giá" for a technician the backend reports as unrated', async () => {
    vi.mocked(bookingsApi.getCandidates).mockResolvedValue([
      { ...mockCandidates[0], averageRating: null, ratingCount: 0, reliabilityScore: null },
    ]);
    vi.mocked(reviewsApi.getByTechnician).mockResolvedValue({ data: [], total: 0 });
    const wrapper = mount(BookingCandidatesPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa có đánh giá');
    expect(wrapper.text()).not.toMatch(/null|NaN|undefined/);
    expect(wrapper.text()).not.toContain('5.0');

    await wrapper.get('[data-testid="view-profile-btn"]').trigger('click');
    const modal = wrapper.findComponent(TechnicianProfileModal);
    expect(modal.text()).toContain('Chưa có đánh giá');
    expect(modal.text()).not.toMatch(/null|NaN|undefined/);

    wrapper.unmount();
  });
});
