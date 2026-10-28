import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const { api, funded } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  funded: { wallet: vi.fn(), vnpay: vi.fn(), zero: vi.fn(), confirmCash: vi.fn() },
}));
vi.mock('../src/api/client', () => ({ default: api, getHttpStatus: () => undefined, registerAuthSessionInvalidator: vi.fn(), registerTokenRefreshed: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'o1' }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ conversations: [] }) }));
vi.mock('../src/api/funded-checkout.api', () => ({ fundedCheckoutApi: funded }));
import Page from '../src/pages/customer/CustomerOrderDetailPage.vue';
const state = { invoice: {} as Record<string, unknown>, quote: undefined as Record<string, unknown> | undefined, cash: null as Record<string, unknown> | null, balance: 999999 };
const reservationEvent = {
  reservation: { id: 'reservation-1', claimId: 'claim-1', scopeId: 'o1', attemptId: 'attempt-1', state: 'RESERVED', reservedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:15:00.000Z' },
  preview: { scopeId: 'o1', claimId: 'claim-1', previewOnly: true, paymentAvailable: true, reason: 'server-ready', originalGrossVnd: 300000, eligibleBaseVnd: 250000, fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 250000, reasonCodes: ['DISCOUNT_APPLIED'] },
};
const zeroReservationEvent = { ...reservationEvent, preview: { ...reservationEvent.preview, customerDueVnd: 0, fixHomeDiscountSubsidyVnd: 300000 } };
const mountPage = async () => {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/service-orders/o1') return { data: { data: { id: 'o1', code: 'FH-TEST', status: 'under_repair', paymentStatus: 'unpaid', completionRequestedAt: '2026-10-20', laborTotal: 0, partsTotal: 0, grandTotal: 0, quotation: state.quote } } };
    if (path.endsWith('/invoice')) return { data: { data: state.invoice } };
    if (path.endsWith('/cash-settlement')) return { data: { data: state.cash } };
    if (path === '/customer/wallet') return { data: { data: { balance: state.balance } } };
    return { data: { data: [] } };
  });
  const w = mount(Page, { global: { stubs: { CustomerStopReplaceRequest: true, OrderComplaintPanel: true, WarrantyClaimModal: true, ReviewTechnicianModal: true, RebookDialog: true, RouterLink: true, VoucherCheckoutChooser: { props: ['scopeId', 'scopeKind'], emits: ['applied'], template: '<div data-testid="solo-voucher-picker" :data-scope-id="scopeId"><button data-testid="apply-test-voucher" @click="$emit(\'applied\', voucher)">Apply</button><button data-testid="apply-zero-test-voucher" @click="$emit(\'applied\', zeroVoucher)">Apply zero</button></div>', data: () => ({ voucher: reservationEvent, zeroVoucher: zeroReservationEvent }) } } } });
  await flushPromises();
  return w;
};
describe('customer invoice payment UI', () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); state.quote = undefined; state.cash = null; state.balance = 999999; state.invoice = { id: 'i1', laborTotal: 0, partsTotal: 0, grandTotal: 0, items: [] }; });
  it('blocks a misleading zero invoice and never shows approved parts as billed', async () => {
    state.quote = { id: 'q1', status: 'approved', items: [{ type: 'parts_equipment', quantity: 1, unitPrice: 550000, lineTotal: 550000, description: 'Van dự kiến', partSource: 'fixhome', partCatalogId: 'sku1' }] };
    const w = await mountPage();
    expect(w.get('[data-testid="billing-mismatch"]').text()).toContain('chưa khớp');
    expect(w.get('[data-testid="order-costs"]').text()).not.toContain('Van dự kiến');
    const pay = w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!;
    expect(pay.attributes('disabled')).toBeDefined();
    await pay.trigger('click');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    w.unmount();
  });
  it.each([0, 1, 4999, 5000])('shows eligible channels for invoice %s', async total => {
    state.invoice = { ...state.invoice, laborTotal: total, grandTotal: total };
    const w = await mountPage();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    const dialog = w.get('[aria-label="Thanh toán đơn"]');
    expect(dialog.text().includes('Hoàn tất miễn phí')).toBe(total === 0);
    expect(dialog.find('[data-testid="pay-method-wallet"]').exists()).toBe(total > 0);
    expect(dialog.find('[data-testid="pay-method-cash"]').exists()).toBe(total > 0);
    expect(dialog.find('[data-testid="pay-method-vnpay"]').exists()).toBe(total >= 5000);
    if (total > 0) expect(dialog.get('[data-testid="solo-voucher-picker"]').attributes('data-scope-id')).toBe('o1');
    w.unmount();
  });
  // PO 21/10/2026: wallet, VNPay and cash are one list with one action under it.
  const openPayment = async (total: number) => {
    state.invoice = { ...state.invoice, laborTotal: total, grandTotal: total };
    const w = await mountPage();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    return w;
  };

  it('starts on the wallet with its balance in small print and pays from it', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { amount: 300000, balance: 699999 } } });
    const w = await openPayment(300000);
    expect(w.get('[data-testid="pay-method-wallet"]').attributes('aria-checked')).toBe('true');
    expect(w.get('[data-testid="wallet-balance"]').find('[data-money]').exists() || w.get('[data-testid="wallet-balance"]').text().includes('999.999')).toBe(true);
    expect(w.findAll('[role="radio"]')).toHaveLength(3);
    expect(w.findAll('[data-testid^="pay-with-"], [data-testid="pay-cash-ok"]')).toHaveLength(1);
    await w.get('[data-testid="pay-with-wallet"]').trigger('click');
    await flushPromises();
    expect(api.post.mock.calls.map((call) => call[0])).toEqual(['/invoices/i1/pay-with-wallet']);
    w.unmount();
  });

  it('moves to VNPay when the wallet balance is short, and keeps a manual choice', async () => {
    state.balance = 1000;
    const w = await openPayment(300000);
    expect(w.get('[data-testid="pay-method-vnpay"]').attributes('aria-checked')).toBe('true');
    expect(w.get('[data-testid="wallet-balance"]').text()).toContain('không đủ');
    expect(w.get('[data-testid="pay-with-vnpay"]').text()).toBe('Thanh toán qua VNPay');

    await w.get('[data-testid="pay-method-wallet"]').trigger('click');
    expect(w.get('[data-testid="pay-with-wallet"]').attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Ví chưa đủ tiền');
    w.unmount();
  });

  it('opens VNPay only from its own action', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { paymentUrl: 'https://sandbox.vnpayment.vn/pay' } } });
    const location = { href: '' };
    vi.stubGlobal('location', location);
    const w = await openPayment(300000);
    await w.get('[data-testid="pay-method-vnpay"]').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
    await w.get('[data-testid="pay-with-vnpay"]').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/invoices/i1/vnpay-url');
    w.unmount();
    vi.unstubAllGlobals();
  });

  it('uses the funded wallet rail after reservation and never calls gross invoice payment', async () => {
    funded.wallet.mockResolvedValueOnce({ paid: true, amount: 250000, balance: 749999 });
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-test-voucher"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pay-with-wallet"]').trigger('click');
    await flushPromises();
    expect(funded.wallet).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'o1', invoiceId: 'i1' }, 'reservation-1');
    expect(api.post).not.toHaveBeenCalledWith('/invoices/i1/pay-with-wallet', expect.anything());
    expect(w.text()).toContain('Đã thanh toán 250.000 ₫ bằng ví');
    w.unmount();
  });

  it('marks SOLO ZERO as complete only after the funded server closeout succeeds', async () => {
    funded.zero.mockResolvedValueOnce({ paid: true, amount: 0, settlementId: 'settlement-1' });
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-zero-test-voucher"]').trigger('click');
    await flushPromises();
    expect(funded.zero).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'o1', invoiceId: 'i1' }, 'reservation-1');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(false);
    expect(w.text()).toContain('Máy chủ đã xác nhận tất toán voucher với số tiền khách hàng cần trả là 0 ₫.');
    w.unmount();
  });

  it('does not close or report success when SOLO ZERO closeout is rejected', async () => {
    funded.zero.mockRejectedValueOnce({ response: { status: 503 } });
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-zero-test-voucher"]').trigger('click');
    await flushPromises();
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Máy chủ đã xác nhận tất toán voucher');
    expect(w.text()).toContain('chưa xác nhận được tất toán 0 ₫');
    w.unmount();
  });

  it('allows cash instructions with a voucher for technician-side server due lookup', async () => {
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-test-voucher"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pay-method-cash"]').trigger('click');
    expect(w.get('[data-testid="pay-cash-note"]').exists()).toBe(true);
    expect(w.find('[data-testid="voucher-cash-unavailable"]').exists()).toBe(false);
    await w.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalledWith('/invoices/i1/pay-with-wallet', expect.anything());
    w.unmount();
  });

  it('opens VNPay only with the held reservation when a voucher is applied', async () => {
    funded.vnpay.mockResolvedValueOnce('https://sandbox.vnpayment.vn/pay');
    const location = { href: '' };
    vi.stubGlobal('location', location);
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-test-voucher"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pay-method-vnpay"]').trigger('click');
    await w.get('[data-testid="pay-with-vnpay"]').trigger('click');
    await flushPromises();
    expect(funded.vnpay).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'o1', invoiceId: 'i1' }, 'reservation-1');
    expect(api.post).not.toHaveBeenCalledWith('/invoices/i1/vnpay-url', expect.anything());
    expect(location.href).toBe('https://sandbox.vnpayment.vn/pay');
    w.unmount();
    vi.unstubAllGlobals();
  });

  it('does not fall back to gross payment when funded settlement fails', async () => {
    funded.wallet.mockRejectedValueOnce({ response: { status: 503 } });
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-test-voucher"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="pay-with-wallet"]').trigger('click');
    await flushPromises();
    expect(funded.wallet).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalledWith('/invoices/i1/pay-with-wallet', expect.anything());
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Đã thanh toán 250.000 ₫ bằng ví');
    w.unmount();
  });

  it('confirms cash with the funded reservation rather than the gross cash endpoint', async () => {
    state.invoice = { ...state.invoice, laborTotal: 300000, grandTotal: 300000 };
    state.cash = { id: 'cash-1', declaredAmount: 250000, confirmedAmount: undefined, status: 'pending_confirmation' };
    funded.confirmCash.mockResolvedValueOnce(undefined);
    const w = await mountPage();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    await w.get('[data-testid="apply-test-voucher"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="cash-confirmation"] button').trigger('click');
    await flushPromises();
    expect(funded.confirmCash).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'o1' }, 'reservation-1', { agreed: true });
    expect(api.post).not.toHaveBeenCalledWith('/service-orders/o1/cash-settlement/confirm', expect.anything());
    w.unmount();
  });

  it('explains cash and closes without calling any payment route', async () => {
    const w = await openPayment(300000);
    await w.get('[data-testid="pay-method-cash"]').trigger('click');
    expect(w.get('[data-testid="pay-cash-note"]').text()).toContain('Đưa tiền cho kỹ thuật viên');
    await w.get('[data-testid="pay-cash-ok"]').trigger('click');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    w.unmount();
  });

  it('calls only the free route and does not report success on backend rejection', async () => {
    const w = await mountPage();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    api.post.mockRejectedValueOnce(new Error('Không thể hoàn tất hóa đơn này.'));
    await w.get('[data-testid="complete-no-charge"]').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/invoices/i1/no-charge', {});
    expect(w.text()).not.toContain('Đã hoàn tất miễn phí');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(true);
    w.unmount();
  });
});
