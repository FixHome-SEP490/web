import type { VisitCheckout } from '../api/visit-groups.api';

export interface VisitInvoiceSummaryRow {
  sequence: number;
  name: string;
  state: VisitCheckout['devices'][number]['state'];
  amount: number | null;
  paid: boolean;
}
export interface TechnicianVisitInvoiceSummary {
  rows: VisitInvoiceSummaryRow[];
  confirmedGross: number | null;
  pending: number;
  unpaidGross: number | null;
}
type InvoiceRecord = { id?: unknown; serviceOrderId?: unknown; grandTotal?: unknown };

/**
 * Display-only, never used to collect payments or apply vouchers.
 * A settled/completed child needs an invoice matching the immutable VisitGroup
 * envelope before its amount may contribute to a historical all-machine total.
 */
export function summarizeTechnicianVisitInvoices(
  checkout: VisitCheckout | null,
  invoiceFor: (serviceOrderId: string) => InvoiceRecord | null,
): TechnicianVisitInvoiceSummary | null {
  if (!checkout || !checkout.visitGroupId || !checkout.devices.length || checkout.devices.length > 3) return null;
  const ids = new Set<string>();
  const invoices = new Set<string>();
  const rows = [...checkout.devices].sort((a, b) => a.sequence - b.sequence).map((d) => {
    const name = d.serviceName?.trim() || d.deviceLabel?.trim() || 'Thiết bị';
    let amount: number | null = null;
    if (d.serviceOrderId && ids.has(d.serviceOrderId)) return { sequence: d.sequence, name, state: d.state, amount, paid: d.paid };
    if (d.serviceOrderId) ids.add(d.serviceOrderId);
    const zeroResult = ['failed', 'quote_declined', 'cancelled'].includes(d.state);
    if (zeroResult && !d.invoiceId && d.amount === 0) amount = 0;
    else if (d.state === 'succeeded' && d.serviceOrderId && d.invoiceId && !invoices.has(d.invoiceId)) {
      invoices.add(d.invoiceId);
      const invoice = invoiceFor(d.serviceOrderId);
      if (invoice && invoice.id === d.invoiceId && invoice.serviceOrderId === d.serviceOrderId
        && typeof invoice.grandTotal === 'number' && Number.isSafeInteger(invoice.grandTotal)
        && invoice.grandTotal >= 0 && invoice.grandTotal === d.amount) amount = invoice.grandTotal;
    }
    return { sequence: d.sequence, name, state: d.state, amount, paid: d.paid };
  });
  const pending = rows.filter((r) => r.amount === null).length;
  const confirmedGross = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return {
    rows, pending,
    confirmedGross: rows.length > pending && Number.isSafeInteger(confirmedGross) ? confirmedGross : null,
    unpaidGross: Number.isSafeInteger(checkout.total) && checkout.total >= 0 ? checkout.total : null,
  };
}
