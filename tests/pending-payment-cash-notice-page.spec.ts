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

// The global exception filter of the backend puts the reason in error.message.
const conflict = (message: string, status = 409) => ({
  response: { status, data: { success: false, statusCode: status, error: { code: status === 409 ? 'CONFLICT' : 'PAYMENT_PROVIDER_UNAVAILABLE', message }, timestamp: '2026-11-01T10:00:00.000Z', path: '/api/v1/finance/cash-intents/SOLO/o1' } },
});

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
    cashCreate.mockRejectedValue(conflict('Có giao dịch thanh toán đang xử lý. Vui lòng kiểm tra lại.'));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();

    const dialog = wrapper.get('[role="dialog"][aria-label="Thanh toán đơn"]');
    const notice = dialog.get('[data-testid="pay-dialog-error"]');
    expect(notice.attributes('role')).toBe('alert');
    expect(notice.text()).toContain('Đơn đang có giao dịch thanh toán cần đối soát.');
    expect(notice.text()).toContain('tránh trả hai lần');
    // The button that cannot succeed is not left active under the message.
    expect((dialog.get('[data-testid="pay-cash-ok"]').element as HTMLButtonElement).disabled).toBe(true);
    await dialog.get('[data-testid="pay-cash-ok"]').trigger('click');
    expect(cashCreate).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('Đã hủy giao dịch');
    expect(wrapper.text()).not.toContain('Bạn có thể trả tiền mặt ngay');
    expect(cashGet).toHaveBeenCalled();
  });

  it('keeps an unrelated backend 409 on the ordinary error path', async () => {
    cashCreate.mockRejectedValue(conflict('Mã thao tác đã được dùng.'));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('cần đối soát');
    expect(wrapper.get('[data-testid="pay-dialog-error"]').text()).toContain('Mã thao tác đã được dùng.');
    expect((wrapper.get('[data-testid="pay-cash-ok"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not label a network or 503 failure as a pending payment conflict', async () => {
    cashCreate.mockRejectedValue(conflict('unavailable', 503));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('cần đối soát');
    expect(wrapper.get('[data-testid="pay-dialog-error"]').text()).toContain('Chưa tạo được yêu cầu tiền mặt.');
  });

  it('clears the dialog message when the customer picks another way to pay and on reopening', async () => {
    cashCreate.mockRejectedValue(conflict('Có giao dịch thanh toán đang xử lý. Vui lòng kiểm tra lại.'));
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    await wrapper.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="pay-dialog-error"]').exists()).toBe(true);
    await wrapper.get('[data-testid="pay-method-vnpay"]').trigger('click');
    expect(wrapper.find('[data-testid="pay-dialog-error"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Đóng"]').trigger('click');
    await wrapper.get('[data-testid="pay-after-completion"] button').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="pay-method-cash"]').trigger('click');
    expect(wrapper.find('[data-testid="pay-dialog-error"]').exists()).toBe(false);
    expect((wrapper.get('[data-testid="pay-cash-ok"]').element as HTMLButtonElement).disabled).toBe(false);
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
