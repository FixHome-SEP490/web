import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { getOrder, getInvoice, cashGet, cashCreate } = vi.hoisted(() => ({
  getOrder: vi.fn(), getInvoice: vi.fn(), cashGet: vi.fn(), cashCreate: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: new Proxy({ getOrder, getInvoice } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? (key === 'getAdditionalCosts'
      ? vi.fn().mockResolvedValue([]) : vi.fn().mockRejectedValue(new Error('not needed'))),
  }),
}));
vi.mock('../src/api/part-requests.api', () => ({ partRequestsApi: { getByOrderId: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: vi.fn().mockRejectedValue(new Error('not needed')) } }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: vi.fn().mockResolvedValue(null) } }));
vi.mock('../src/api/cash-intents.api', () => ({
  cashIntentsApi: { get: cashGet, create: cashCreate, cancel: vi.fn() },
}));
vi.mock('../src/api/customer-wallet.api', () => ({ customerWalletApi: { summary: vi.fn().mockResolvedValue({ balance: 0 }) } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'o1' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));
import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';

const mountPage = async () => {
  const wrapper = mount(CustomerOrderDetailPage, { global: { stubs: {
    RouterLink: true, 'router-link': true, CustomerStopReplaceRequest: true,
    CustomerCancelledRebookAction: true, OrderComplaintPanel: true, WarrantyClaimCard: true,
    WarrantyClaimModal: true, RebookDialog: true, ChatThread: true, VoucherCheckoutChooser: true,
  } } });
  await flushPromises();
  return wrapper;
};

describe('BUG #39 — customer cash intent pending conflict UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    getOrder.mockResolvedValue({
      id: 'o1', code: 'FH-1', status: 'UNDER_REPAIR', paymentStatus: 'UNPAID', grandTotal: 400000,
      completionRequestedAt: '2026-10-09T10:00:00Z', customerConfirmed: false, bookingId: null,
    });
    getInvoice.mockResolvedValue({ id: 'inv-1', grandTotal: 400000 });
    cashGet.mockResolvedValue({ cashFirstEnabled: true, intent: null });
  });

  it('shows the backend pending-payment 409 without suggesting cash or claiming cancellation', async () => {
    cashCreate.mockRejectedValue({ response: { status: 409, data: { message: 'Có giao dịch thanh toán đang xử lý.' } } });
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Đơn đang có giao dịch thanh toán cần đối soát.');
    expect(wrapper.text()).not.toContain('Đã hủy giao dịch');
    expect(wrapper.text()).not.toContain('Bạn có thể trả tiền mặt ngay');
    expect(cashGet).toHaveBeenCalled();
  });

  it('keeps an unrelated backend 409 on the ordinary error path', async () => {
    cashCreate.mockRejectedValue({ response: { status: 409, data: { message: 'Mã thao tác đã được dùng.' } } });
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('cần đối soát');
    expect(wrapper.text()).toContain('Mã thao tác đã được dùng.');
  });

  it('does not label a network or 503 failure as a pending payment conflict', async () => {
    cashCreate.mockRejectedValue({ response: { status: 503, data: { message: 'unavailable' } } });
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('cần đối soát');
    expect(wrapper.text()).toContain('Chưa tạo được yêu cầu tiền mặt.');
  });

  it('disables the cash action while the create request is pending', async () => {
    let finish!: (value: unknown) => void;
    cashCreate.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    const button = wrapper.get('[data-testid="pay-cash-ok"]');
    await button.trigger('click');
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    await button.trigger('click');
    expect(cashCreate).toHaveBeenCalledTimes(1);
    finish({ id: 'cash-intent-1', status: 'pending', scopeId: 'o1', customerDueVnd: 400000 });
    await flushPromises();
  });
});
