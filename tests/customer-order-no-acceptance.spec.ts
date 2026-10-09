import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// No customer acceptance (PO 09/10/2026): once the technician completed with the after photo,
// the customer sees the payment straight away and never a "Xác nhận nghiệm thu" button.
const { getOrder, getInvoice } = vi.hoisted(() => ({ getOrder: vi.fn(), getInvoice: vi.fn() }));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: new Proxy({ getOrder, getInvoice } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? vi.fn().mockRejectedValue(new Error('not needed')),
  }),
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: vi.fn().mockRejectedValue(new Error('x')) } }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: vi.fn().mockResolvedValue(null) } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'o1' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));
import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'o1', code: 'FH-1', status: 'UNDER_REPAIR', paymentStatus: 'UNPAID', grandTotal: 400000,
  completionRequestedAt: '2026-10-09T10:00:00Z', customerConfirmed: false, bookingId: null, ...extra,
});
const mountPage = async () => {
  const w = mount(CustomerOrderDetailPage, { global: { stubs: { RouterLink: true, 'router-link': true, OrderComplaintPanel: true, WarrantyClaimCard: true, WarrantyClaimModal: true, RebookDialog: true, ChatThread: true } } });
  await flushPromises();
  return w;
};

describe('Customer order after the technician completed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    getInvoice.mockResolvedValue({ id: 'inv-1', grandTotal: 400000 });
  });

  it('asks to pay right away, with no acceptance step', async () => {
    getOrder.mockResolvedValue(order());
    const w = await mountPage();
    expect(w.find('[data-testid="pay-after-completion"]').exists()).toBe(true);
    expect(w.text()).toContain('Kỹ thuật viên đã hoàn thành, mời bạn thanh toán');
    expect(w.text()).not.toContain('Xác nhận nghiệm thu');
    expect(w.text()).not.toContain('Cần xác nhận nghiệm thu');
  });

  it('does not ask to pay before the technician completed or once paid', async () => {
    getOrder.mockResolvedValue(order({ completionRequestedAt: null }));
    expect((await mountPage()).find('[data-testid="pay-after-completion"]').exists()).toBe(false);
    getOrder.mockResolvedValue(order({ paymentStatus: 'PAID' }));
    expect((await mountPage()).find('[data-testid="pay-after-completion"]').exists()).toBe(false);
  });
});
