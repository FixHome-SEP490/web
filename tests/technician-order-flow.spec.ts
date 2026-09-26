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

    // Hero title shows pending en-route
    expect(wrapper.text()).toContain('Đơn đã tiếp nhận — Hãy khởi hành đến nhà khách');
    expect(wrapper.text()).toContain('Bắt đầu di chuyển (En Route)');

    // Google Maps navigation link is present and correctly targets the destination
    const mapLinks = wrapper.findAll('a[href*="google.com/maps"]');
    expect(mapLinks.length).toBeGreaterThanOrEqual(1);
    expect(mapLinks[0].attributes('href')).toContain('destination=10.7769,106.7009');

    // Emergency withdrawal button is available before check-in
    expect(wrapper.text()).toContain('Rút khỏi đơn');

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

    expect(wrapper.text()).toContain('Bạn đang trên đường di chuyển tới nhà khách hàng');
    expect(wrapper.text()).toContain('Check-in GPS ngay khi đến nơi');

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

    expect(wrapper.text()).toContain('Đã check-in hiện trường — Chụp ảnh hiện trạng lỗi (BEFORE)');

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

    // Click 'Rút khỏi đơn' button
    const withdrawBtn = wrapper.findAll('button').find((b) => b.text().includes('Rút khỏi đơn'));
    expect(withdrawBtn).toBeDefined();
    await withdrawBtn!.trigger('click');

    // Modal opens
    expect(wrapper.text()).toContain('Rút khỏi đơn nhận việc');
    expect(wrapper.text()).toContain('Xác nhận rút đơn');

    // Confirm withdrawal
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('Xác nhận rút đơn'));
    expect(confirmBtn).toBeDefined();
    await confirmBtn!.trigger('click');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-test-101/cancel', expect.objectContaining({
      reason: expect.any(String),
    }));

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
