// PO 22/11/2026: the paid bill showed 445.000 while the customer paid 422.750 after a voucher.
import { describe, expect, it } from 'vitest';
import { invoiceVoucherLines } from '../src/utils/order-billing';

describe('invoiceVoucherLines', () => {
  it('reads the voucher discount and the amount actually paid from the server', () => {
    expect(invoiceVoucherLines({ grandTotal: 445000, voucherDiscount: 22250, amountDue: 422750 }))
      .toEqual({ discount: 22250, due: 422750 });
  });
  it('shows nothing when there is no voucher or the server sent nothing usable', () => {
    expect(invoiceVoucherLines(null)).toBeNull();
    expect(invoiceVoucherLines({ grandTotal: 1000 })).toBeNull();
    expect(invoiceVoucherLines({ voucherDiscount: 0, amountDue: 1000 })).toBeNull();
    expect(invoiceVoucherLines({ voucherDiscount: 'x', amountDue: 1000 })).toBeNull();
    expect(invoiceVoucherLines({ voucherDiscount: 10, amountDue: -1 })).toBeNull();
  });
});
