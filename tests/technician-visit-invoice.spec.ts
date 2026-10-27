import { describe, expect, it } from 'vitest';
import type { VisitCheckout } from '../src/api/visit-groups.api';
import { summarizeTechnicianVisitInvoices } from '../src/utils/technician-visit-invoice';

function checkout() {
  return {
    visitGroupId: 'visit-1', total: 585000, waiting: 0, ready: true, paid: false,
    pendingCash: null,
    devices: [16000, 30000, 539000].map((amount, i) => ({
      sequence: i + 1, deviceLabel: 'Máy ' + (i + 1),
      bookingId: 'booking-' + (i + 1),
      serviceName: i === 0 ? 'Sửa điều hòa' : 'Sửa máy sấy',
      serviceOrderId: 'order-' + (i + 1), orderCode: 'SO-' + (i + 1),
      state: 'succeeded', invoiceId: 'invoice-' + (i + 1), amount, paid: false,
    })),
  } as VisitCheckout;
}
const invoices = (values: Record<string, number>) => (orderId: string) => ({
  id: 'invoice-' + orderId.split('-')[1],
  serviceOrderId: orderId,
  grandTotal: values[orderId],
});

describe('technician visit invoices (display-only)', () => {
  it('sums all three verified child invoices and keeps payment source of truth distinct', () => {
    const visit = checkout();
    const summary = summarizeTechnicianVisitInvoices(visit, invoices({
      'order-1': 16000, 'order-2': 30000, 'order-3': 539000,
    }));
    expect(summary).toMatchObject({ pending: 0, confirmedGross: 585000, unpaidGross: 585000 });
    expect(summary?.rows.map(row => row.amount)).toEqual([16000, 30000, 539000]);
  });

  it('shows an individual failed machine as zero without suppressing sibling invoices', () => {
    const visit = checkout();
    visit.devices[1]!.state = 'failed';
    visit.devices[1]!.amount = 0;
    visit.devices[1]!.invoiceId = null;
    visit.total = 555000;
    const summary = summarizeTechnicianVisitInvoices(visit, invoices({
      'order-1': 16000, 'order-3': 539000,
    }));
    expect(summary).toMatchObject({ pending: 0, confirmedGross: 555000, unpaidGross: 555000 });
    expect(summary?.rows.map(row => row.amount)).toEqual([16000, 0, 539000]);
  });

  it('does not invent money when a child lacks proof or the ledger conflicts', () => {
    const visit = checkout();
    visit.devices[1]!.state = 'open';
    visit.devices[1]!.invoiceId = null;
    const summary = summarizeTechnicianVisitInvoices(visit, invoices({
      'order-1': 16000, 'order-2': 30000, 'order-3': 539000,
    }));
    expect(summary).toMatchObject({ pending: 1, confirmedGross: 555000 });
    expect(summary?.rows[1]?.amount).toBeNull();

    visit.devices[1]!.state = 'succeeded';
    visit.devices[1]!.invoiceId = 'invoice-2';
    const mismatch = summarizeTechnicianVisitInvoices(visit, invoices({
      'order-1': 16000, 'order-2': 31000, 'order-3': 539000,
    }));
    expect(mismatch?.pending).toBe(1);
    expect(mismatch?.rows[1]?.amount).toBeNull();
  });

  it('rejects inflated paid amounts, duplicate invoices and malformed totals', () => {
    const visit = checkout();
    visit.devices[2]!.invoiceId = 'invoice-1';
    visit.total = -1;
    const summary = summarizeTechnicianVisitInvoices(visit, invoices({
      'order-1': 16000, 'order-2': 30000, 'order-3': 539000,
    }));
    expect(summary?.unpaidGross).toBeNull();
    expect(summary?.rows[2]?.amount).toBeNull();
    expect(summary?.pending).toBe(1);
  });
});
