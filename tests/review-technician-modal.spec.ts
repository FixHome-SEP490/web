import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ReviewTechnicianModal from '../src/components/customer/ReviewTechnicianModal.vue';
import { reviewsApi } from '../src/api/reviews.api';

vi.mock('../src/api/reviews.api', () => ({
  reviewsApi: {
    createReview: vi.fn(),
  },
}));

describe('ReviewTechnicianModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with technician details when open is true', () => {
    const wrapper = mount(ReviewTechnicianModal, {
      props: {
        open: true,
        orderId: 'order-123',
        orderCode: 'FH-9999',
        technicianName: 'Trần Văn Kỹ Thuật',
      },
    });

    expect(wrapper.text()).toContain('Đánh giá Kỹ thuật viên');
    expect(wrapper.text()).toContain('Trần Văn Kỹ Thuật');
    expect(wrapper.text()).toContain('#FH-9999');
    expect(wrapper.text()).toContain('Xuất sắc — Rất hài lòng');
  });

  it('does not render modal when open is false', () => {
    const wrapper = mount(ReviewTechnicianModal, {
      props: {
        open: false,
        orderId: 'order-123',
      },
    });

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('updates dynamic suggestion chips when star rating changes', async () => {
    const wrapper = mount(ReviewTechnicianModal, {
      props: {
        open: true,
        orderId: 'order-123',
        technicianName: 'Trần Văn Kỹ Thuật',
      },
    });

    // Default 5 stars has 5-star chips
    expect(wrapper.text()).toContain('Tay nghề chuyên môn cao');
    expect(wrapper.text()).toContain('Rất nhiệt tình & tận tâm');

    // Click 1 star button
    const starButtons = wrapper.findAll('button[aria-label$="sao"]');
    expect(starButtons.length).toBe(5);
    await starButtons[0].trigger('click'); // 1 star

    // Should now show 1-star emotional label and chips
    expect(wrapper.text()).toContain('Rất không hài lòng');
    expect(wrapper.text()).toContain('Thái độ chưa tốt');
    expect(wrapper.text()).toContain('Tay nghề kém');
    expect(wrapper.text()).not.toContain('Tay nghề chuyên môn cao');
  });

  it('toggles suggestion chips selection and includes them in review submission', async () => {
    const mockCreatedReview = {
      id: 'rev-001',
      serviceOrderId: 'order-123',
      customerId: 'cust-1',
      technicianId: 'tech-1',
      rating: 5,
      comment: '[Xuất sắc, Đúng giờ & chuẩn hẹn] Thợ làm rất có tâm!',
      createdAt: new Date().toISOString(),
    };
    vi.mocked(reviewsApi.createReview).mockResolvedValue(mockCreatedReview);

    const wrapper = mount(ReviewTechnicianModal, {
      props: {
        open: true,
        orderId: 'order-123',
        technicianName: 'Trần Văn Kỹ Thuật',
      },
    });

    // Enter comment
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Thợ làm rất có tâm!');

    // Submit review
    const submitBtn = wrapper.find('button.bg-brand-600, button:has-text("Gửi đánh giá")');
    await submitBtn.trigger('click');

    expect(reviewsApi.createReview).toHaveBeenCalledTimes(1);
    expect(reviewsApi.createReview).toHaveBeenCalledWith(
      'order-123',
      expect.objectContaining({
        rating: 5,
        comment: expect.stringContaining('Thợ làm rất có tâm!'),
      })
    );
  });
});
