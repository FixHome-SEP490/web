import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Customer area layout rules (PO 10/10/2026): each action once per screen, rare and
// destructive ones in a "⋯" menu, skeletons while loading, and a short retry line
// instead of any technical error text.
const api = vi.hoisted(() => ({
  getCustomerOrders: vi.fn(),
  getOrder: vi.fn(),
  getInvoice: vi.fn(),
  getOrderWarrantiesGrouped: vi.fn(),
  getAddresses: vi.fn(),
  getServices: vi.fn(),
  getByOrder: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: new Proxy(
    {
      getCustomerOrders: api.getCustomerOrders,
      getOrder: api.getOrder,
      getInvoice: api.getInvoice,
      getOrderWarrantiesGrouped: api.getOrderWarrantiesGrouped,
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? vi.fn().mockRejectedValue(new Error('not needed')) },
  ),
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses: api.getAddresses } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getServices: api.getServices } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: vi.fn().mockRejectedValue(new Error('x')) } }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: api.getByOrder } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'o1' }, query: {} }),
  useRouter: () => ({ push: api.push, replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));

import CustomerDashboard from '../src/pages/customer/CustomerDashboard.vue';
import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';
import CustomerWarrantiesPage from '../src/pages/customer/CustomerWarrantiesPage.vue';

const stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  'router-link': { template: '<a><slot /></a>' },
  OrderComplaintPanel: true,
  WarrantyClaimCard: true,
  WarrantyClaimModal: true,
  RebookDialog: true,
  ReviewTechnicianModal: true,
  MapTilerMap: true,
};

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', code: 'FH-1', bookingId: 'b1', serviceName: 'Sửa máy lạnh', status: 'ACCEPTED', paymentStatus: 'UNPAID',
  addressSummary: '1 Lê Lợi, Quận 1', scheduledAt: '2026-10-11T06:00:00Z', createdAt: '2026-10-10T01:00:00Z',
  laborTotal: 0, partsTotal: 0, grandTotal: 0, timeline: [],
  technician: { id: 't1', fullName: 'Nguyễn Văn A', phoneNumber: '0900000000', averageRating: null },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  api.getAddresses.mockResolvedValue([]);
  api.getServices.mockResolvedValue({ data: [] });
  api.getInvoice.mockRejectedValue(new Error('no invoice'));
  api.getByOrder.mockResolvedValue(null);
});

describe('Customer home', () => {
  it('does not repeat the booking actions of the top bar, nor the slogan', async () => {
    api.getCustomerOrders.mockResolvedValue([order()]);
    const w = mount(CustomerDashboard, { global: { stubs } });
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Cần sửa gì hôm nay?');
    expect(text).not.toContain('Chẩn đoán hỏng hóc bằng AI');
    expect(text).not.toContain('AI Chẩn đoán hỏng hóc');
    expect(text).not.toContain('Tin tưởng - Nhanh chóng - Hiệu quả');
    expect(text.match(/Bảo hành điện tử/g) ?? []).toHaveLength(0);
    expect(w.findAll('button').filter((b) => b.text().trim() === 'Đặt thợ')).toHaveLength(0);
    expect(w.find('[data-testid="dashboard-active-order"]').exists()).toBe(true);
  });

  it('shows skeletons while loading, then a retry line when orders fail', async () => {
    let fail!: (reason: unknown) => void;
    api.getCustomerOrders.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    const w = mount(CustomerDashboard, { global: { stubs } });
    await flushPromises();
    expect(w.find('[aria-label="Đang tải đơn"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Đang tải');
    fail(new Error('Request failed with status code 500'));
    await flushPromises();
    const error = w.get('[data-testid="dashboard-orders-error"]');
    expect(error.text()).toContain('Thử lại');
    expect(w.text()).not.toMatch(/status code|500/);
  });
});

describe('Customer order detail', () => {
  it('keeps cancel in the "⋯" menu, out of sight until opened', async () => {
    api.getOrder.mockResolvedValue(order());
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="order-cancel"]').exists()).toBe(false);
    await w.get('[data-testid="order-more"]').trigger('click');
    expect(w.get('[data-testid="order-cancel"]').text()).toBe('Huỷ đơn');
  });

  it('says nothing is quoted yet instead of listing zero amounts', async () => {
    api.getOrder.mockResolvedValue(order());
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-testid="order-not-quoted"]').exists()).toBe(true);
    expect(w.find('[data-testid="order-costs"]').text()).not.toContain('Tổng cộng');
  });

  it('offers to review once on a completed order', async () => {
    api.getOrder.mockResolvedValue(order({ status: 'COMPLETED', paymentStatus: 'PAID', grandTotal: 300000, laborTotal: 300000 }));
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    const reviewButtons = w.findAll('button').filter((b) => b.text().includes('Đánh giá'));
    expect(reviewButtons).toHaveLength(1);
    expect(w.findAll('[data-testid="order-rebook"]')).toHaveLength(1);
  });

  it('shows a retry line, not the server text, when the order cannot be read', async () => {
    api.getOrder.mockRejectedValueOnce(new Error('Internal server error at QueryFailedError'));
    const w = mount(CustomerOrderDetailPage, { global: { stubs } });
    await flushPromises();
    expect(w.get('[data-testid="order-load-error"]').text()).toContain('Thử lại');
    expect(w.text()).not.toMatch(/Internal|QueryFailedError/);
    api.getOrder.mockResolvedValueOnce(order());
    await w.get('[data-testid="order-load-error"] button').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="order-load-error"]').exists()).toBe(false);
    expect(w.text()).toContain('Sửa máy lạnh');
  });
});

describe('Customer warranties', () => {
  it('shows a retry line when warranties cannot be read', async () => {
    api.getOrderWarrantiesGrouped.mockRejectedValueOnce(new Error('timeout of 15000ms exceeded'));
    const w = mount(CustomerWarrantiesPage, { global: { stubs } });
    await flushPromises();
    expect(w.get('[data-testid="warranties-load-error"]').text()).toContain('Thử lại');
    expect(w.text()).not.toContain('timeout');
    expect(w.text()).not.toContain('Chưa có đơn nào đang được bảo hành');
  });
});
