import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'job-test-101' } }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    openConversationForBooking: vi.fn(),
    toggleWidget: vi.fn(),
    conversations: [],
  }),
}));

import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';

const activeOrder = {
  id: 'job-test-101',
  code: 'SO-101',
  bookingId: 'booking-101',
  serviceName: 'Sửa điều hòa rò rỉ gas',
  status: 'ACCEPTED',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  addressSummary: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
  scheduledAt: '2026-10-01T08:00:00Z',
  laborTotal: 150000,
  partsTotal: 0,
  grandTotal: 150000,
  paymentStatus: 'UNPAID',
  createdAt: '2026-09-26T00:00:00Z',
  destination: { lat: 10.7769, lng: 106.7009 },
};

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant'],
    template: '<button :disabled="disabled" :data-variant="variant"><slot /></button>',
  },
  FhCard: { props: ['title'], template: '<section class="fh-card"><h4>{{ title }}</h4><slot /></section>' },
  FhStatusPill: { props: ['status'], template: '<span class="status-pill">{{ status }}</span>' },
  FhMoney: { props: ['amount'], template: '<span>{{ amount }} đ</span>' },
  FhCostBreakdown: { template: '<div>Cost breakdown</div>' },
  BookingMediaViewer: { template: '<div data-testid="booking-media-viewer">Media</div>' },
  TechnicianPartsSection: { template: '<div data-testid="parts-section">Parts</div>' },
};

/** Opens the "Thêm" overflow menu, where the rare actions of the job page live. */
async function openMoreMenu(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="job-more-button"]').trigger('click');
  await flushPromises();
}

const menuItems = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[role="menuitem"]').map((item) => item.text());

describe('Technician Order Receiving & Execution Workspace', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('renders Hero Action Bar with correct initial action for ACCEPTED status', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      if (path === '/bookings/booking-101') return { data: { data: { id: 'booking-101', media: [] } } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    // The current step and its one primary action
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Xuất phát đến nhà khách');
    expect(wrapper.text()).toContain('Bắt đầu di chuyển');

    // Call, message and directions appear exactly once, next to the customer
    const mapLinks = wrapper.findAll('a[href*="google.com/maps"]');
    expect(mapLinks).toHaveLength(1);
    expect(mapLinks[0].attributes('href')).toContain('destination=10.7769,106.7009');
    expect(wrapper.findAll('a[href^="tel:"]')).toHaveLength(1);
    expect(wrapper.findAll('button').filter((b) => b.text().trim() === 'Nhắn tin')).toHaveLength(1);

    // Cancelling is available before check-in, from the overflow menu, under its new name
    expect(wrapper.text()).not.toContain('Rút khỏi đơn');
    await openMoreMenu(wrapper);
    expect(menuItems(wrapper)).toContain('Huỷ đơn');

    wrapper.unmount();
  });

  it('updates Hero Action Bar to GPS Check-in when status is EN_ROUTE and not yet checked in', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: false } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Đang đến nhà khách');
    expect(wrapper.text()).toContain('Check-in và chụp ảnh sản phẩm');

    wrapper.unmount();
  });

  it('offers "Cần thay đổi thợ" only after check-in and sends it to the manager', async () => {
    let arrived = false;
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: arrived } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    const before = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await openMoreMenu(before);
    expect(menuItems(before)).not.toContain('Cần thay đổi thợ');
    expect(before.find('[data-testid="replacement-card"]').exists()).toBe(false);
    before.unmount();

    arrived = true;
    mockPost.mockResolvedValue({ data: { success: true, statusCode: 201, message: 'Created', data: {
      id: 'case-1', caseType: 'technician_replacement', status: 'open', bookingId: null, serviceOrderId: 'job-test-101',
      reason: 'x', description: null, resolutionCode: null, resolutionReason: null, resolvedAt: null, isUrgent: true,
      respondBy: null, holdCompletion: false, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
    } } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="replacement-card"]').exists()).toBe(false);
    await openMoreMenu(wrapper);
    // After check-in the order can no longer be cancelled by the technician.
    expect(menuItems(wrapper)).not.toContain('Huỷ đơn');
    await wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('Cần thay đổi thợ'))!.trigger('click');
    const card = wrapper.get('[data-testid="replacement-card"]');
    await card.get('textarea').setValue('Máy là loại công nghiệp, ngoài kỹ năng');
    await card.findAll('button').find((b) => b.text().includes('Gửi cho quản lý'))!.trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/support/cases', expect.objectContaining({ caseType: 'technician_replacement', serviceOrderId: 'job-test-101', isUrgent: true }));
    expect(wrapper.text()).toContain('Đã báo quản lý dịch vụ');
    expect(wrapper.find('[data-testid="replacement-card"]').exists()).toBe(false);
    await openMoreMenu(wrapper);
    expect(menuItems(wrapper)).not.toContain('Cần thay đổi thợ');
    wrapper.unmount();
  });

  it('updates Hero Action Bar to BEFORE evidence photo gating after GPS check-in', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: true, beforeEvidenceCount: 0 } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Chụp ảnh máy trước khi sửa');
    expect(wrapper.text()).toContain('Chụp ảnh máy');

    wrapper.unmount();
  });

  it('allows technician to open withdrawal modal and cancel order with reason', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    // "Huỷ đơn" in the overflow menu opens the confirmation
    await openMoreMenu(wrapper);
    const withdrawBtn = wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('Huỷ đơn'));
    expect(withdrawBtn).toBeDefined();
    await withdrawBtn!.trigger('click');

    const dialog = wrapper.get('[data-testid="cancel-order-dialog"]');
    expect(dialog.text()).toContain('Huỷ đơn sửa chữa?');
    expect(dialog.text()).toContain('Giữ lại đơn');
    expect(dialog.text()).not.toContain('Rút');

    // Confirm the cancellation
    const confirmBtn = dialog.findAll('button').find((b) => b.text().includes('Huỷ đơn sửa chữa'));
    expect(confirmBtn).toBeDefined();
    await confirmBtn!.trigger('click');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-test-101/cancel', expect.objectContaining({
      reason: expect.any(String),
    }));

    wrapper.unmount();
  });

  it('shows only the current step until "Xem thêm" lists all five, then folds back', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: false } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="job-steps"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Bước 2/5');
    const toggle = wrapper.get('[data-testid="steps-toggle"]');
    expect(toggle.text()).toContain('Xem thêm');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    const list = wrapper.get('[data-testid="job-steps"]');
    expect(list.findAll('li')).toHaveLength(5);
    expect(list.text()).toContain('Xuất phát');
    expect(list.text()).toContain('Thu tiền');
    expect(list.text()).toContain('Đang làm');
    expect(toggle.text()).toContain('Thu gọn');
    expect(toggle.attributes('aria-expanded')).toBe('true');

    await toggle.trigger('click');
    expect(wrapper.find('[data-testid="job-steps"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps one primary action: the same button in the card and in the phone action bar', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    const bar = wrapper.get('[data-testid="job-action-bar"]');
    expect(bar.classes()).toContain('sm:hidden');
    expect(bar.text()).toContain('Bắt đầu di chuyển');
    const inCard = wrapper.get('[data-testid="job-now"]').findAll('button').filter((b) => b.text().includes('Bắt đầu di chuyển'));
    expect(inCard).toHaveLength(1);
    expect(inCard[0].element.parentElement?.className).toContain('hidden sm:flex');
    // No long rule paragraphs on the page any more
    expect(wrapper.text()).not.toMatch(/Quy chuẩn/);
    wrapper.unmount();
  });

  it('asks how the customer pays after completion and declares the cash amount', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', arrivalVerified: true, beforeEvidenceCount: 1, afterEvidenceCount: 1, completionRequestedAt: '2026-10-01T10:00:00Z' } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValueOnce({ data: { data: { status: 'pending_confirmation' } } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    const now = wrapper.get('[data-testid="job-now"]');
    expect(now.text()).toContain('Thu tiền');
    expect(wrapper.find('[data-testid="job-action-bar"]').exists()).toBe(false);
    await now.findAll('button').find((b) => b.text().includes('Có thu tiền mặt'))!.trigger('click');
    const declare = wrapper.get('[data-testid="job-now"]').findAll('button').find((b) => b.text().includes('Khai báo đã thu tiền mặt'));
    expect(declare).toBeDefined();
    await declare!.trigger('click');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith(expect.stringContaining('/service-orders/job-test-101/cash'), expect.objectContaining({ declaredAmount: 150000 }));
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Chờ khách xác nhận tiền mặt');
    wrapper.unmount();
  });

  it('shows a friendly retry when the job cannot be loaded, never a raw error', async () => {
    mockGet.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'QueryFailedError: relation does not exist' } } } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa tải được công việc. Vui lòng thử lại.');
    expect(wrapper.text()).not.toMatch(/INTERNAL_ERROR|QueryFailedError|500/);
    expect(wrapper.findAll('button').some((b) => b.text().includes('Thử lại'))).toBe(true);
    wrapper.unmount();
  });

  it('renders Google Maps navigation and direct phone button on TechnicianJobsPage', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [activeOrder] } });

    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();

    const mapLink = wrapper.find('a[href*="google.com/maps"]');
    expect(mapLink.exists()).toBe(true);
    expect(mapLink.attributes('href')).toContain('10.7769,106.7009');

    const phoneLink = wrapper.find('a[href^="tel:"]');
    expect(phoneLink.exists()).toBe(true);
    expect(phoneLink.attributes('href')).toBe('tel:0901234567');

    wrapper.unmount();
  });
});
