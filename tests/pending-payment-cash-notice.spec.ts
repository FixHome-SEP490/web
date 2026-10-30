import { describe, expect, it } from 'vitest';
import { pendingPaymentCashNotice } from '../src/utils/pending-payment-cash-notice';

describe('BUG #39 — VNPay pending cannot be assumed NOT_SETTLED', () => {
  it('explains 409 pending payment without encouraging a second cash payment', () => {
    const result = pendingPaymentCashNotice({
      response: { status: 409, data: { message: 'Có giao dịch thanh toán đang xử lý. Vui lòng kiểm tra lại.' } },
    });
    expect(result).toContain('đối soát');
    expect(result).toContain('tránh trả hai lần');
    expect(result).not.toContain('đã hủy giao dịch');
  });
  it('does not turn unrelated 409 into a false VNPay claim', () => {
    expect(pendingPaymentCashNotice({ response: { status: 409, data: { message: 'Mã thao tác đã được dùng.' } } })).toBeNull();
  });
  it('does not label a non-pending payment conflict as an unsettled transaction', () => {
    expect(pendingPaymentCashNotice({ response: { status: 409, data: { message: 'Invoice payment amount does not match.' } } })).toBeNull();
  });
  it('does not substitute a payment notice for transport or server errors', () => {
    expect(pendingPaymentCashNotice({ response: { status: 503, data: { message: 'unavailable' } } })).toBeNull();
    expect(pendingPaymentCashNotice(new Error('offline'))).toBeNull();
  });
  it('recognizes multiple safe server response messages', () => {
    expect(pendingPaymentCashNotice({ response: { status: 409, data: { message: ['payment pending', 'check again'] } } })).toContain('đối soát');
  });
});
