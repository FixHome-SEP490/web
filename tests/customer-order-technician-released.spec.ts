import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// PO 20/10/2026: the technician released the order because their previous job ran over.
// The customer sees why and picks another technician; once invited, the page says so.
const { getOrder, getBooking, push } = vi.hoisted(() => ({ getOrder: vi.fn(), getBooking: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: new Proxy({ getOrder } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? vi.fn().mockRejectedValue(new Error('not needed')),
  }),
}));
vi.mock('../src/api/part-requests.api', () => ({ partRequestsApi: { getByOrderId: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking } }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: vi.fn().mockResolvedValue(null) } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'o1' }, query: {} }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));
import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', code: 'FH-1', status: 'ACCEPTED', paymentStatus: 'UNPAID', grandTotal: 199000, bookingId: 'b1', technician: null, ...extra,
});
const mountPage = async () => {
  const w = mount(CustomerOrderDetailPage, { global: { stubs: { RouterLink: true, 'router-link': true, OrderComplaintPanel: true, WarrantyClaimCard: true, WarrantyClaimModal: true, RebookDialog: true, ChatThread: true } } });
  await flushPromises();
  return w;
};

describe('Customer order whose technician could not make it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('offers choosing another technician for the same request', async () => {
    getOrder.mockResolvedValue(order());
    getBooking.mockResolvedValue({ id: 'b1', invitations: [{ id: 'i1', status: 'CANCELLED' }] });
    const w = await mountPage();
    const banner = w.get('[data-testid="order-awaiting-technician"]');
    expect(banner.text()).toContain('Thợ không kịp tới buổi hẹn');
    expect(banner.text()).toContain('giá và lịch hẹn giữ nguyên');
    await w.get('[data-testid="order-choose-another-technician"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/app/bookings/b1/candidates?released=1');
  });

  it('says a new technician was invited instead of offering the choice again', async () => {
    getOrder.mockResolvedValue(order());
    getBooking.mockResolvedValue({ id: 'b1', invitations: [{ id: 'i2', status: 'PENDING' }] });
    const w = await mountPage();
    expect(w.get('[data-testid="order-awaiting-technician"]').text()).toContain('Đang chờ thợ mới nhận đơn');
    expect(w.find('[data-testid="order-choose-another-technician"]').exists()).toBe(false);
  });

  it('shows nothing when a technician holds the order', async () => {
    getOrder.mockResolvedValue(order({ technician: { id: 't1', fullName: 'Thợ A' } }));
    getBooking.mockResolvedValue({ id: 'b1', invitations: [] });
    const w = await mountPage();
    expect(w.find('[data-testid="order-awaiting-technician"]').exists()).toBe(false);
  });
});
