import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const { api, funded } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  funded: { reserve: vi.fn(), wallet: vi.fn(), vnpay: vi.fn(), zero: vi.fn(), confirmCash: vi.fn() },
}));
vi.mock('../src/api/client', () => ({ default: api, getHttpStatus: () => undefined, registerAuthSessionInvalidator: vi.fn(), registerTokenRefreshed: vi.fn() }));
const recoveryRoute = vi.hoisted(() => ({ id: 'o1' }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { get id() { return recoveryRoute.id; } }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ conversations: [] }) }));
vi.mock('../src/api/funded-checkout.api', async importOriginal => ({ ...await importOriginal<typeof import('../src/api/funded-checkout.api')>(), fundedCheckoutApi: funded }));
import { vouchersApi } from '../src/api/vouchers.api';
import { useAuthStore } from '../src/stores/auth.store';
import { queryClient } from '../src/lib/query-client';
import { queryKeys } from '../src/lib/query-keys';
import { installQueryClient } from './support/query-client';
import { authApi } from '../src/api/auth.api';
import { UserRole } from '../src/types';
import Page from '../src/pages/customer/CustomerOrderDetailPage.vue';
const state = { invoice: {} as Record<string, unknown>, quote: undefined as Record<string, unknown> | undefined, cash: null as Record<string, unknown> | null, balance: 999999, cashFirstEnabled: false as boolean | null, cashIntent: null as Record<string, unknown> | null };
const reservationEvent = {
  reservation: { id: 'reservation-1', claimId: 'claim-1', scopeId: 'o1', attemptId: 'attempt-1', state: 'RESERVED', reservedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:15:00.000Z' },
  preview: { scopeId: 'o1', claimId: 'claim-1', previewOnly: true, paymentAvailable: true, reason: 'server-ready', originalGrossVnd: 300000, eligibleBaseVnd: 250000, fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 250000, reasonCodes: ['DISCOUNT_APPLIED'] },
};
const zeroReservationEvent = { ...reservationEvent, preview: { ...reservationEvent.preview, customerDueVnd: 0, fixHomeDiscountSubsidyVnd: 300000 } };
const mountPage = async (realChooser = false) => {
  api.get.mockImplementation(async (path: string) => {
    if (path === `/finance/cash-intents/SOLO/${recoveryRoute.id}`) return { data: { success: true, statusCode: 200, message: 'Success', data: state.cashIntent, ...(state.cashFirstEnabled !== null ? { meta: { cashFirstEnabled: state.cashFirstEnabled } } : {}) } };
    if (path === `/service-orders/${recoveryRoute.id}`) return { data: { data: { id: recoveryRoute.id, code: 'FH-TEST', status: 'under_repair', paymentStatus: 'unpaid', completionRequestedAt: '2026-10-20', laborTotal: 0, partsTotal: 0, grandTotal: 0, quotation: state.quote } } };
    if (path.endsWith('/invoice')) return { data: { data: state.invoice } };
    if (path.endsWith('/cash-settlement')) return { data: { data: state.cash } };
    if (path === '/customer/wallet') return { data: { data: { balance: state.balance } } };
    return { data: { data: [] } };
  });
  const w = mount(Page, { global: { stubs: { CustomerStopReplaceRequest: true, CustomerCancelledRebookAction: true, OrderComplaintPanel: true, WarrantyClaimModal: true, ReviewTechnicianModal: true, RebookDialog: true, RouterLink: true, Teleport: true, VoucherCheckoutChooser: realChooser ? false : { props: ['scopeId', 'scopeKind'], emits: ['applied', 'terminal'], template: '<div data-testid="solo-voucher-picker" :data-scope-id="scopeId"><button data-testid="apply-test-voucher" @click="$emit(\'applied\', voucher)">Apply</button><button data-testid="apply-zero-test-voucher" @click="$emit(\'applied\', zeroVoucher)">Apply zero</button></div>', data: () => ({ voucher: reservationEvent, zeroVoucher: zeroReservationEvent }) } } } });
  await flushPromises();
  return w;
};
describe('customer invoice payment UI', () => {
  beforeEach(() => { recoveryRoute.id = 'o1'; vi.clearAllMocks(); setActivePinia(createPinia()); state.quote = undefined; state.cash = null; state.balance = 999999; state.cashFirstEnabled = false; state.cashIntent = null; state.invoice = { id: 'i1', laborTotal: 0, partsTotal: 0, grandTotal: 0, items: [] }; });

  it.each(['RESERVED', 'EXPIRED', 'RELEASED', 'REDEEMED', 'REFUNDED'] as const)('blocks every parent money action through timeout/remount until authoritative %s', async terminalState => {
    recoveryRoute.id = '11111111-1111-4111-8111-111111111111';
    useAuthStore().setAuth('test-session', { id: 'customer-1', role: UserRole.CUSTOMER } as Parameters<ReturnType<typeof useAuthStore>['setAuth']>[1]);
    installQueryClient(queryClient);
    state.invoice = { id: 'i1', laborTotal: 300000, partsTotal: 0, grandTotal: 300000, items: [] };
    state.cashFirstEnabled = true;
    const claim = { id: '22222222-2222-4222-8222-222222222222', campaignId: 'campaign-recovery', status: 'CLAIMED', redeemedAt: null,
      policySnapshot: { discount: 'FIXED', value: 50000, capVnd: null, minimumVnd: 100000, categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] },
      campaign: { code: 'RECOVER', name: 'Recovery', kind: 'PERSONAL', active: true, startsAt: '2026-01-01T00:00:00Z', endsAt: '2035-12-31T23:59:59Z' } };
    const quote = { scopeId: recoveryRoute.id, claimId: claim.id, previewOnly: true, paymentAvailable: true, reason: null,
      originalGrossVnd: 300000, eligibleBaseVnd: 300000, fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 250000, reasonCodes: ['DISCOUNT_APPLIED'] };
    vi.spyOn(vouchersApi, 'wallet').mockResolvedValue([claim] as never);
    const freshPreview = vi.spyOn(vouchersApi, 'checkoutPreview').mockResolvedValue(quote as never);
    let reject!: (reason: unknown) => void;
    let committed: { claimId: string; scopeId: string; attemptId: string } | undefined;
    const { fundedCheckoutApi: transport } = await vi.importActual<typeof import('../src/api/funded-checkout.api')>('../src/api/funded-checkout.api');
    funded.reserve.mockImplementation(transport.reserve);
    api.post.mockImplementation((path, body) => {
      expect(path).toBe('/vouchers/apply');
      committed = body; // Server committed, transport has not answered.
      return new Promise((_resolve, fail) => { reject = fail; });
    });
    let w = await mountPage(true);
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    await w.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    const checkBlocked = async () => {
      expect(w.find('[data-testid="voucher-reservation-pending"]').exists()).toBe(true);
      const setup = w.vm.$.setupState as Record<string, (...args: unknown[]) => unknown>;
      for (const name of ['handleConfirmCashPayment', 'confirmZeroCheckout', 'confirmCashIntent', 'createCashIntent', 'payWithWallet', 'confirmPayment', 'completeNoCharge']) await setup[name](true);
      await flushPromises();
      for (const [method, testId] of [['wallet', 'pay-with-wallet'], ['vnpay', 'pay-with-vnpay'], ['cash', 'pay-cash-ok']]) {
        if (!w.find('[aria-label="Thanh toán đơn"]').exists()) continue;
        setup.choosePayMethod(method);
        await flushPromises();
        const action = w.get(`[data-testid="${testId}"]`);
        expect(action.attributes('disabled')).toBeDefined();
        await action.trigger('click');
      }
      expect(funded.wallet).not.toHaveBeenCalled();
      expect(funded.vnpay).not.toHaveBeenCalled();
      expect(funded.zero).not.toHaveBeenCalled();
      expect(funded.confirmCash).not.toHaveBeenCalled();
      expect(api.post.mock.calls.every(([path]) => path === '/vouchers/apply')).toBe(true);
    };
    await checkBlocked(); // BEFORE the pending request rejects.
    await w.get('[data-testid="voucher-selection-close"]').trigger('click');
    await w.get('[aria-label="Thanh toán đơn"] button[aria-label="Đóng"]').trigger('click');
    await checkBlocked();
    w.unmount();
    w = await mountPage(true);
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    await checkBlocked();
    expect(w.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    expect(funded.reserve).toHaveBeenCalledTimes(1);
    reject(new Error('timeout after server commit'));
    await flushPromises();
    freshPreview.mockRejectedValue({ response: { status: 409 } });
    await checkBlocked();
    await w.get('[data-testid="voucher-selection-close"]').trigger('click');
    await checkBlocked();
    w.unmount();
    w = await mountPage(true);
    await checkBlocked();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    await w.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeUndefined();
    expect(freshPreview).toHaveBeenCalledTimes(1);
    expect(funded.reserve).toHaveBeenCalledTimes(1);
    api.post.mockRejectedValue(new Error('still uncertain'));
    await w.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(funded.reserve).toHaveBeenCalledTimes(2);
    expect(funded.reserve.mock.calls[1]).toEqual([committed!.claimId, committed!.scopeId, committed!.attemptId]);
    expect(api.post.mock.calls).toEqual([['/vouchers/apply', committed], ['/vouchers/apply', committed]]);
    await checkBlocked();
    api.post.mockResolvedValue({ data: { success: true, data: { ...committed,
      id: '33333333-3333-4333-8333-333333333333', state: terminalState,
      reservedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:15:00Z' } } });
    await w.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="voucher-reservation-pending"]').exists()).toBe(false);
    expect(w.find('[data-testid="voucher-terminal-reconciliation"]').exists()).toBe(['REDEEMED', 'REFUNDED'].includes(terminalState));
    expect(api.post.mock.calls).toEqual(Array.from({ length: 3 }, () => ['/vouchers/apply', committed]));
    expect(funded.reserve.mock.calls.every(call => JSON.stringify(call) === JSON.stringify([committed!.claimId, committed!.scopeId, committed!.attemptId]))).toBe(true);
    expect(funded.wallet).not.toHaveBeenCalled();
    expect(funded.vnpay).not.toHaveBeenCalled();
    expect(funded.zero).not.toHaveBeenCalled();
    expect(funded.confirmCash).not.toHaveBeenCalled();
    // The mounted page must not collect the old invoice after an owner change.
    useAuthStore().setAuth('other-session', { id: 'other-customer', role: UserRole.CUSTOMER } as Parameters<ReturnType<typeof useAuthStore>['setAuth']>[1]);
    await flushPromises();
    const afterOwnerChange = api.post.mock.calls.length;
    const setup = w.vm.$.setupState as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ['handleConfirmCashPayment', 'confirmZeroCheckout', 'createCashIntent', 'payWithWallet', 'confirmPayment', 'completeNoCharge']) await setup[name](true);
    expect(api.post).toHaveBeenCalledTimes(afterOwnerChange);
    expect(queryClient.getQueryData(queryKeys.voucherAttempts.scope('customer-1', recoveryRoute.id))).toBeUndefined();
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    await useAuthStore().logout();
    for (const name of ['handleConfirmCashPayment', 'confirmZeroCheckout', 'createCashIntent', 'payWithWallet', 'confirmPayment', 'completeNoCharge']) await setup[name](true);
    expect(api.post).toHaveBeenCalledTimes(afterOwnerChange);
    vi.mocked(authApi.logout).mockRestore();
    w.unmount();
    freshPreview.mockRestore();
  }, 20000);

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

  it('requires explicit SOLO ZERO confirmation before funded server closeout', async () => {
    funded.zero.mockResolvedValueOnce({ paid: true, amount: 0, settlementId: 'settlement-1' });
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-zero-test-voucher"]').trigger('click');
    await flushPromises();
    expect(funded.zero).not.toHaveBeenCalled();
    expect(funded.wallet).not.toHaveBeenCalled();
    expect(funded.vnpay).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    await w.get('[data-testid="order-confirm-zero"]').trigger('click');
    await flushPromises();
    expect(funded.zero).toHaveBeenCalledWith({ kind: 'SOLO', serviceOrderId: 'o1', invoiceId: 'i1' }, 'reservation-1');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(false);
    expect(w.text()).toContain('Máy chủ đã xác nhận tất toán voucher với số tiền khách hàng cần trả là 0 ₫.');
    w.unmount();
  });

  it.each([403, 409, 503])('keeps the ZERO reservation on explicit rejection %s and retries only on click', async status => {
    funded.zero.mockReset().mockRejectedValueOnce({ response: { status } }).mockResolvedValueOnce({ paid: true, amount: 0, settlementId: 'settlement-1' });
    const w = await openPayment(300000);
    await w.get('[data-testid="apply-zero-test-voucher"]').trigger('click');
    await flushPromises();
    expect(funded.zero).not.toHaveBeenCalled();
    expect(funded.wallet).not.toHaveBeenCalled();
    expect(funded.vnpay).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    await w.get('[data-testid="order-confirm-zero"]').trigger('click');
    await flushPromises();
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Máy chủ đã xác nhận tất toán voucher');
    expect(w.text()).toContain(status === 403 ? 'không có quyền' : 'chưa xác nhận được tất toán 0 ₫');
    expect(funded.zero).toHaveBeenCalledTimes(1);
    await w.get('[data-testid="order-confirm-zero"]').trigger('click');
    await flushPromises();
    expect(funded.zero).toHaveBeenCalledTimes(2);
    expect(funded.zero.mock.calls[0]).toEqual(funded.zero.mock.calls[1]);
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

  it('hides the cash choice when the server capability is missing', async () => {
    state.cashFirstEnabled = null;
    const w = await openPayment(300000);
    expect(w.find('[data-testid="pay-method-cash"]').exists()).toBe(false);
    expect(w.get('[data-testid="pay-method-wallet"]').exists()).toBe(true);
    w.unmount();
  });

  it('creates a server-priced cash intent and lets the customer cancel the pending request', async () => {
    state.cashFirstEnabled = true;
    state.invoice = { ...state.invoice, laborTotal: 300000, grandTotal: 300000 };
    const created = { id: '11111111-1111-4111-8111-111111111111', scopeKind: 'SOLO', scopeId: 'o1', status: 'pending', grossVnd: 300000, customerDueVnd: 250000, technicianId: 'tech-1', createdAt: '2026-10-29T00:00:00.000Z', receivedAt: null, receiptId: null };
    api.post.mockImplementation(async (path: string) => {
      if (path === `/finance/cash-intents/SOLO/${recoveryRoute.id}`) {
        state.cashIntent = created;
        return { data: { success: true, statusCode: 200, message: 'Success', data: created } };
      }
      if (path === '/finance/cash-intents/SOLO/o1/cancel') {
        const cancelled = { ...created, status: 'cancelled' };
        state.cashIntent = cancelled;
        return { data: { success: true, statusCode: 200, message: 'Success', data: cancelled } };
      }
      throw new Error(`Unexpected POST ${path}`);
    });
    const w = await openPayment(300000);
    await w.get('[data-testid="pay-method-cash"]').trigger('click');
    await w.get('[data-testid="pay-cash-ok"]').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/finance/cash-intents/SOLO/o1', expect.objectContaining({ commandId: expect.stringMatching(/^[0-9a-f-]{36}$/i) }));
    expect(w.get('[data-testid="cash-intent-pending"]').text()).toContain('250.000');
    expect(w.get('[data-testid="cash-intent-pending"]').attributes('aria-labelledby')).toBe('cash-intent-pending-title');
    expect(w.get('#cash-intent-pending-title').text()).toBe('Chờ kỹ thuật viên xác nhận tiền mặt');
    expect(w.text()).not.toContain('Đã thanh toán');
    await w.get('[data-testid="cash-intent-cancel"]').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenLastCalledWith('/finance/cash-intents/SOLO/o1/cancel', { intentId: '11111111-1111-4111-8111-111111111111', commandId: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
    expect(w.get('[data-testid="cash-intent-cancelled"]').exists()).toBe(true);
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

 it('retains the funded receipt past local TTL without falling back or settling automatically', async () => {
   vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:10:00Z'));
   const w = await openPayment(300000);
   try {
     await w.get('[data-testid="apply-zero-test-voucher"]').trigger('click'); await flushPromises();
     await vi.advanceTimersByTimeAsync(6 * 60 * 1000); await flushPromises();
     expect(w.find('[data-testid="order-confirm-zero"]').exists()).toBe(true);
     expect(funded.zero).not.toHaveBeenCalled(); expect(funded.wallet).not.toHaveBeenCalled();
     funded.zero.mockRejectedValueOnce(new Error('server still reconciles'));
     await w.get('[data-testid="order-confirm-zero"]').trigger('click'); await flushPromises();
     expect(funded.zero).toHaveBeenCalledTimes(1);
     expect(w.find('[data-testid="order-confirm-zero"]').exists()).toBe(true);
   } finally { w.unmount(); vi.useRealTimers(); }
 });

  it.each(['REDEEMED', 'REFUNDED'])('blocks all collection on %s and requires a fresh invoice read before showing any final result', async terminalState => {
    const w = await openPayment(300000);
    try {
      const pay = w.get('[data-testid="pay-with-wallet"]');
      const invoiceReads = api.get.mock.calls.filter(([path]) => String(path).endsWith('/invoice')).length;
      const chooser = w.findComponent('[data-testid="solo-voucher-picker"]');
      chooser.vm.$emit('terminal', { ...reservationEvent.reservation, state: terminalState });
      await flushPromises();
      expect(api.get.mock.calls.filter(([path]) => String(path).endsWith('/invoice')).length).toBeGreaterThan(invoiceReads);
      expect(w.get('[data-testid="voucher-terminal-reconciliation"]').text()).toContain('đối chiếu');
      await pay.trigger('click'); await flushPromises();
      expect(funded.wallet).not.toHaveBeenCalled(); expect(funded.zero).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(w.find('[data-testid="pay-with-wallet"]').exists()).toBe(false);
    } finally { w.unmount(); }
  });

  it('keeps a redeemed checkout blocked when the fresh invoice read fails, then only reflects paid from a new backend read', async () => {
    const w = await openPayment(300000);
    try {
      const read = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (path: string) => {
        if (path.endsWith('/invoice')) throw new Error('unreadable invoice');
        return read(path);
      });
      w.findComponent('[data-testid="solo-voucher-picker"]').vm.$emit('terminal', { ...reservationEvent.reservation, state: 'REDEEMED' });
      await flushPromises();
      expect(w.find('[data-testid="voucher-terminal-reconciliation"]').exists()).toBe(true);
      expect(w.find('[data-testid="pay-with-wallet"]').exists()).toBe(false);
      api.get.mockImplementation(async (path: string) => {
        const response = await read(path);
        if (path === `/service-orders/${recoveryRoute.id}`) return { data: { data: { ...response.data.data, paymentStatus: 'paid', status: 'completed' } } };
        return response;
      });
      await w.get('[data-testid="voucher-terminal-reconciliation"] button').trigger('click'); await flushPromises();
      expect(w.find('[data-testid="voucher-terminal-reconciliation"]').exists()).toBe(false);
      expect(w.find('[data-testid="pay-with-wallet"]').exists()).toBe(false);
      expect(api.post).not.toHaveBeenCalled(); expect(funded.zero).not.toHaveBeenCalled(); expect(funded.wallet).not.toHaveBeenCalled();
    } finally { w.unmount(); }
  });
});
