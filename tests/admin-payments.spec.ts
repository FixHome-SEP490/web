import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import apiClient from '../src/api/client';

// Admin: every payment attempt (PO 09/10/2026), filtered and summed, manual bank confirmation (W3).
const { list, confirmManualBank } = vi.hoisted(() => ({ list: vi.fn(), confirmManualBank: vi.fn() }));
vi.mock('../src/api/admin-payments.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/admin-payments.api')>()),
  adminPaymentsApi: { list, confirmManualBank },
}));
import AdminPaymentsPage from '../src/pages/console/admin/AdminPaymentsPage.vue';

const row = {
  id: 'p1', purpose: 'invoice', amount: 400000, currency: 'VND', mode: 'LIVE', provider: 'wallet', status: 'verified',
  providerReference: null, failureCode: null, requestedAt: '2026-10-09T03:00:00Z', verifiedAt: '2026-10-09T03:00:01Z', invoiceId: 'i1',
  payerId: 'c1', payerName: 'Khach Hang 1', payerEmail: 'customer1@fixhome.vn', payerRole: 'customer', orderId: 'o1', orderCode: 'FH-1',
};
const failed = { ...row, id: 'p2', provider: 'vnpay', status: 'failed', failureCode: '24', providerReference: '1234', verifiedAt: null };
const manualBankRow = {
  ...row,
  id: 'p3',
  provider: 'manual_bank',
  status: 'pending' as const,
  amount: 350000,
  invoiceId: 'inv-3',
  orderId: 'o3',
  orderCode: 'FH-3',
  verifiedAt: null,
};
const result = (data: unknown[]) => ({ data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1, summary: { verifiedAmount: 400000, verified: 1, pending: 1, failed: 1 } } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const mountPage = async () => {
  const w = mount(AdminPaymentsPage, { global: { stubs: { RouterLink: RouterLinkStub, 'router-link': RouterLinkStub } } });
  await flushPromises();
  return w;
};

describe('Admin payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(result([row, failed]));
  });

  it('lists payments with payer, order, provider and the verified total', async () => {
    const w = await mountPage();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, status: '', purpose: '' }));
    const summary = w.get('[data-testid="payments-summary"]').text().replace(/\s+/g, ' ');
    expect(summary).toContain('2 lần thanh toán');
    expect(summary).toContain('400.000');
    const first = w.get('[data-testid="payment-p1"]').text();
    for (const piece of ['Thanh toán hoá đơn', 'FH-1', 'Khach Hang 1 (Khách)', 'Ví khách', 'Đã xác nhận']) expect(first).toContain(piece);
    expect(w.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/console/orders/o1');
    const second = w.get('[data-testid="payment-p2"]');
    expect(second.text()).toContain('Thất bại');
    expect(second.text()).toContain('Mã tham chiếu 1234');
    expect(second.find('.text-danger-700').exists()).toBe(true);
  });

  it('sends the filters and refuses a start day after the end day', async () => {
    const w = await mountPage();
    await w.get('[data-testid="payments-search"]').setValue('  FH-1 ');
    await w.get('[data-testid="payments-status"]').setValue('verified');
    await w.get('[data-testid="payments-purpose"]').setValue('wallet_top_up');
    await w.get('[data-testid="payments-provider"]').setValue('vnpay');
    await w.get('[data-testid="payments-from"]').setValue('2026-10-09');
    await w.get('[data-testid="payments-to"]').setValue('2026-10-01');
    await w.get('[data-testid="payments-filters"]').trigger('submit');
    expect(w.text()).toContain('Ngày bắt đầu phải trước ngày kết thúc');
    expect(list).toHaveBeenCalledTimes(1);
    await w.get('[data-testid="payments-to"]').setValue('2026-10-10');
    await w.get('[data-testid="payments-filters"]').trigger('submit');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ search: 'FH-1', status: 'verified', purpose: 'wallet_top_up', provider: 'vnpay', from: '2026-10-09', to: '2026-10-10', page: 1, pageSize: 20 });
  });

  it('says so when nothing matches', async () => {
    list.mockResolvedValue(result([]));
    const w = await mountPage();
    expect(w.text()).toContain('Không có thanh toán nào');
  });

  it('renders pending manual_bank row with an accessible confirm form and validates the backend reference rule', async () => {
    list.mockResolvedValue(result([row, manualBankRow]));
    const w = await mountPage();

    const p3Row = w.get('[data-testid="payment-p3"]');
    expect(p3Row.text()).toContain('Chuyển khoản');
    expect(p3Row.text()).toContain('Đang chờ');
    expect(p3Row.text()).toContain('350.000');

    const form = p3Row.get('[data-testid="manual-bank-confirm-form"]');
    expect(form.get('[data-testid="manual-bank-amount"]').text()).toContain('350.000');
    const label = form.get('label[for="mb-ref-p3"]');
    expect(label.text()).toContain('Mã tham chiếu ngân hàng');
    expect(form.text()).toContain('6–128 ký tự');
    expect(form.text()).toContain('Đã kiểm tra tiền nổi độc lập');

    const refInput = form.get('[data-testid="manual-bank-ref"]');
    const ackCheckbox = form.get('[data-testid="manual-bank-ack"]');
    const confirmBtn = form.get('[data-testid="manual-bank-confirm-btn"]');

    // 1. Initial state: both empty -> disabled
    expect(confirmBtn.attributes('disabled')).toBeDefined();

    // 2. Whitespace only for ref -> disabled
    await refInput.setValue('   ');
    expect(confirmBtn.attributes('disabled')).toBeDefined();

    // 3. Too short / invalid characters -> disabled with a visible explanation
    await refInput.setValue('abc');
    await ackCheckbox.setValue(true);
    expect(confirmBtn.attributes('disabled')).toBeDefined();
    expect(form.get('[data-testid="manual-bank-ref-invalid"]').text()).toContain('chưa đúng định dạng');
    expect(refInput.attributes('aria-invalid')).toBe('true');

    await refInput.setValue('FT 261107');
    expect(confirmBtn.attributes('disabled')).toBeDefined();

    // 4. Valid ref but checkbox unchecked -> disabled
    await refInput.setValue('FT261107123456');
    await ackCheckbox.setValue(false);
    expect(confirmBtn.attributes('disabled')).toBeDefined();

    // 5. Valid ref and checkbox checked -> ENABLED
    await ackCheckbox.setValue(true);
    expect(confirmBtn.attributes('disabled')).toBeUndefined();
    expect(form.find('[data-testid="manual-bank-ref-invalid"]').exists()).toBe(false);
  });

  it('confirms manual_bank payment using exact amount from row and reloads table without premature verification', async () => {
    const verifiedRow = { ...manualBankRow, status: 'verified' as const, providerReference: 'FT261107123456', verifiedAt: '2026-11-07T04:00:00Z' };
    list
      .mockResolvedValueOnce(result([manualBankRow]))
      .mockResolvedValueOnce(result([verifiedRow]));
    confirmManualBank.mockResolvedValueOnce({
      paymentId: 'p3',
      invoiceId: 'inv-3',
      amount: 350000,
      status: 'verified',
    });

    const w = await mountPage();
    const p3Row = w.get('[data-testid="payment-p3"]');
    const form = p3Row.get('[data-testid="manual-bank-confirm-form"]');

    await form.get('[data-testid="manual-bank-ref"]').setValue('  ft261107123456  ');
    await form.get('[data-testid="manual-bank-ack"]').setValue(true);

    await form.get('[data-testid="manual-bank-confirm-btn"]').trigger('click');
    await flushPromises();

    // Checked exact endpoint payload; the client normalizes like Backend does.
    expect(confirmManualBank).toHaveBeenCalledWith('inv-3', {
      amount: 350000,
      bankReference: 'FT261107123456',
    });
    expect(confirmManualBank).toHaveBeenCalledTimes(1);

    // Re-fetched list
    expect(list).toHaveBeenCalledTimes(2);

    // Now verifies through reloaded state
    const updatedRow = w.get('[data-testid="payment-p3"]');
    expect(updatedRow.text()).toContain('Đã xác nhận');
    expect(updatedRow.text()).toContain('FT261107123456');
    expect(updatedRow.find('[data-testid="manual-bank-confirm-form"]').exists()).toBe(false);
  });

  it('displays user-facing error on conflict without leaking secrets or PII', async () => {
    list.mockResolvedValue(result([manualBankRow]));
    confirmManualBank.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: 'Invoice already settled or conflict detected on bank reference' },
      },
    });

    const w = await mountPage();
    const form = w.get('[data-testid="payment-p3"] [data-testid="manual-bank-confirm-form"]');

    await form.get('[data-testid="manual-bank-ref"]').setValue('REF-CONFLICT');
    await form.get('[data-testid="manual-bank-ack"]').setValue(true);

    await form.get('[data-testid="manual-bank-confirm-btn"]').trigger('click');
    await flushPromises();

    const errAlert = form.get('[data-testid="manual-bank-error"]');
    expect(errAlert.text()).toBeTruthy();
    // Safe error without raw leak
    expect(errAlert.text()).not.toMatch(/\b(secret|token|password|sql|stack|undefined)\b/i);

    // Row status still remains pending
    expect(w.get('[data-testid="payment-p3"]').text()).toContain('Đang chờ');
  });

  it('sends only one confirmation when the button is clicked twice while the first request is in flight', async () => {
    list.mockResolvedValue(result([manualBankRow]));
    const request = deferred<unknown>();
    confirmManualBank.mockReturnValueOnce(request.promise);

    const w = await mountPage();
    const form = w.get('[data-testid="payment-p3"] [data-testid="manual-bank-confirm-form"]');
    await form.get('[data-testid="manual-bank-ref"]').setValue('FT261107123456');
    await form.get('[data-testid="manual-bank-ack"]').setValue(true);

    const button = form.get('[data-testid="manual-bank-confirm-btn"]');
    await button.trigger('click');
    await button.trigger('click');
    await flushPromises();

    expect(confirmManualBank).toHaveBeenCalledTimes(1);
    expect(button.attributes('disabled')).toBeDefined();

    request.resolve({
      paymentId: 'p3',
      invoiceId: 'inv-3',
      amount: 350000,
      status: 'verified',
    });
    await flushPromises();
    expect(confirmManualBank).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow older filter response that arrives after the newest one', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const w = await mountPage();
    await w.get('[data-testid="payments-search"]').setValue('FH-3');
    await w.get('[data-testid="payments-filters"]').trigger('submit');

    second.resolve(result([manualBankRow]));
    await flushPromises();
    expect(w.find('[data-testid="payment-p3"]').exists()).toBe(true);

    first.resolve(result([row]));
    await flushPromises();
    expect(w.find('[data-testid="payment-p3"]').exists()).toBe(true);
    expect(w.find('[data-testid="payment-p1"]').exists()).toBe(false);
  });

  it('matches the Backend bank-reference contract before sending a confirmation', async () => {
    const actual = await vi.importActual<typeof import('../src/api/admin-payments.api')>('../src/api/admin-payments.api');
    expect(actual.normalizeBankReference('  ft261107123456  ')).toBe('FT261107123456');
    for (const value of ['FT261107123456', 'abc123', 'BANK.REF:1/2-3']) {
      expect(actual.isValidBankReference(value)).toBe(true);
    }
    for (const value of ['', '   ', 'abc', 'FT 261107', 'FT@261107']) {
      expect(actual.isValidBankReference(value)).toBe(false);
    }
    expect(actual.isValidManualBankAmount(350000)).toBe(true);
    expect(actual.isValidManualBankAmount(0)).toBe(false);
    expect(actual.isValidManualBankAmount(1.5)).toBe(false);
    expect(actual.isValidManualBankAmount('350000' as never)).toBe(false);

    await expect(actual.adminPaymentsApi.confirmManualBank('inv-3', {
      amount: 350000,
      bankReference: 'abc',
    })).rejects.toThrow('Số tiền hoặc mã tham chiếu ngân hàng không hợp lệ.');
    await expect(actual.adminPaymentsApi.confirmManualBank('inv-3', {
      amount: 0,
      bankReference: 'FT261107123456',
    })).rejects.toThrow('Số tiền hoặc mã tham chiếu ngân hàng không hợp lệ.');
  });

  it('accepts only the exact confirmation envelope from the real adapter', async () => {
    const actual = await vi.importActual<typeof import('../src/api/admin-payments.api')>('../src/api/admin-payments.api');
    const postSpy = vi.spyOn(apiClient, 'post');
    const payload = { amount: 350000, bankReference: 'ft261107123456' };

    postSpy.mockResolvedValueOnce({
      data: { data: { paymentId: 'pay-3', invoiceId: 'inv-3', amount: 350000, status: 'verified' } },
    } as never);
    await expect(actual.adminPaymentsApi.confirmManualBank('inv-3', payload)).resolves.toEqual({
      paymentId: 'pay-3',
      invoiceId: 'inv-3',
      amount: 350000,
      status: 'verified',
    });
    expect(postSpy).toHaveBeenCalledWith('/admin/payments/manual-bank/inv-3/confirm', {
      amount: 350000,
      bankReference: 'FT261107123456',
    });

    for (const data of [
      { paymentId: 'pay-3', invoiceId: 'inv-other', amount: 350000, status: 'verified' },
      { paymentId: 'pay-3', invoiceId: 'inv-3', amount: 349999, status: 'verified' },
      { paymentId: 'pay-3', invoiceId: 'inv-3', amount: 350000, status: 'pending' },
      { paymentId: '', invoiceId: 'inv-3', amount: 350000, status: 'verified' },
    ]) {
      postSpy.mockResolvedValueOnce({ data: { data } } as never);
      await expect(actual.adminPaymentsApi.confirmManualBank('inv-3', payload))
        .rejects.toThrow('Máy chủ chưa xác nhận khoản chuyển khoản này.');
    }
    expect(postSpy).toHaveBeenCalledTimes(5);
    postSpy.mockRestore();
  });
});
