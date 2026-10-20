import type { AdditionalCostRecord, ServiceOrderItem } from '../api/orders.api';
import type { PartRequest } from '../api/part-requests.api';

export interface BillingLine {
  type: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  warrantyDays?: number;
  partSource?: string | null;
  partCatalogId?: string | null;
}

/** Missing and malformed money must never become a free invoice. */
export function billingAmount(value: unknown): number | null {
  if (value == null || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

const approved = (status?: string) => ['approved', 'accepted'].includes(String(status).toLowerCase());
const isLabor = (line: { type: string }) => line.type.toLowerCase() === 'labor';
const sum = (lines: BillingLine[]) => lines.reduce((total, item) => total + Number(item.lineTotal), 0);

function invoiceLines(value: unknown): BillingLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object' || typeof row.description !== 'string') return [];
    return [{ ...row, type: isLabor({ type: String(row.type) }) ? 'LABOR' : 'PARTS', quantity: Number(row.quantity),
      unitPrice: billingAmount(row.unitPrice) ?? 0, lineTotal: billingAmount(row.lineTotal) ?? 0,
      warrantyDays: row.warrantyDays ?? row.warrantyDaysSnapshot }];
  });
}

/** Display-only guard. Backend remains responsible for full financial reconciliation. */
export function orderBilling(
  order: ServiceOrderItem | null,
  invoice: Record<string, unknown> | null,
  costs: AdditionalCostRecord[] = [],
  requests: PartRequest[] = [],
): { final: boolean; labor: number | null; parts: number | null; total: number | null; items: BillingLine[]; mismatch: boolean } {
  const quote = order?.quotation;
  const approvedCosts = costs.filter(cost => approved(cost.status));
  const base = approved(quote?.status) ? quote?.items ?? [] : [];
  const approvedLines = [...base, ...approvedCosts.flatMap(cost => cost.items)];
  const approvedTotal = sum(approvedLines) + approvedCosts.reduce((total, cost) => total + Number(cost.shippingFee ?? 0), 0);
  if (invoice) {
    const total = billingAmount(invoice.grandTotal);
    const labor = billingAmount(invoice.laborTotal);
    const parts = billingAmount(invoice.partsTotal);
    const invalidApproved = approvedLines.some(line => billingAmount(line.lineTotal) === null || billingAmount(line.unitPrice) === null ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 1) ||
      (approved(quote?.status) && [quote?.laborTotal, quote?.partsTotal].some(amount => amount !== undefined && billingAmount(amount) === null));
    const totalsDisagree = (lines: BillingLine[], labor: unknown, parts: unknown) =>
      (labor !== undefined && billingAmount(labor) !== sum(lines.filter(isLabor))) ||
      (parts !== undefined && billingAmount(parts) !== sum(lines.filter(line => !isLabor(line))));
    const missingApprovedLines = (approved(quote?.status) && totalsDisagree(base, quote?.laborTotal, quote?.partsTotal)) ||
      approvedCosts.some(cost => totalsDisagree(cost.items, cost.totalLaborDelta, cost.totalPartsDelta));
    const invalidInvoice = labor === null || parts === null || !Array.isArray(invoice.items) ||
      (total === 0 && (labor !== 0 || parts !== 0 || invoice.items.some(line => billingAmount(line?.lineTotal) !== 0)));
    const fixedCharge = order?.pricingMode?.toLowerCase() === 'fixed_price' &&
      (Number(order.fixedUnitPrice) > 0 || Number(order.laborTotal) > 0);
    // Returned quantities belong to their own approved source; consume them once,
    // so duplicate SKU lines cannot reuse the same proof.
    const returned = new Map<string, number>();
    for (const request of requests) {
      if (!request.receivedAt || !['received', 'completed'].includes(request.status)) continue;
      const source = request.requestType === 'pre_repair' || (request.requestType === 'quotation' && request.quotationId === quote?.id)
        ? 'base' : request.requestType === 'additional' ? request.additionalCostId : null;
      if (!source) continue;
      for (const item of request.items) {
        if (item.partSource !== 'fixhome' || item.usageStatus !== 'returned' || !item.partCatalogId ||
          !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0) continue;
        const key = `${source}:${item.partCatalogId}`;
        returned.set(key, (returned.get(key) ?? 0) + Number(item.quantity));
      }
    }
    let unjustified = approvedCosts.some(cost => Number(cost.shippingFee) > 0);
    const check = (lines: BillingLine[], source: string) => {
      for (const line of lines) {
        if (!(line.lineTotal > 0)) continue;
        const key = `${source}:${line.partCatalogId}`;
        const quantity = returned.get(key) ?? 0;
        if (isLabor(line) || line.partSource !== 'fixhome' || !line.partCatalogId || quantity < line.quantity) unjustified = true;
        else returned.set(key, quantity - line.quantity);
      }
    };
    check(base, 'base');
    for (const cost of approvedCosts) check(cost.items, cost.id);
    return { final: true, labor, parts, total,
      items: invoiceLines(invoice.items), mismatch: total === 0 && (fixedCharge || invalidApproved || missingApprovedLines || invalidInvoice || (approvedTotal > 0 && unjustified)) };
  }
  const proposed: BillingLine[] = String(quote?.status).toLowerCase() === 'sent' ? quote?.items ?? [] : base;
  const parts = sum(proposed.filter(item => !isLabor(item))) + approvedCosts.reduce((total, cost) => total + Number(cost.totalPartsDelta), 0);
  const labor = sum(proposed.filter(isLabor)) + approvedCosts.reduce((total, cost) => total + Number(cost.totalLaborDelta), 0);
  const fixedLabor = order?.pricingMode?.toLowerCase() === 'fixed_price' ? billingAmount(order.laborTotal) : null;
  const known = proposed.length > 0 || fixedLabor !== null || approvedCosts.length > 0;
  return { final: false, labor: known ? labor + (proposed.length ? 0 : fixedLabor ?? 0) : null, parts: known ? parts : null,
    total: known ? labor + parts + (proposed.length ? 0 : fixedLabor ?? 0) + approvedCosts.reduce((total, cost) => total + Number(cost.shippingFee ?? 0), 0) : null,
    items: proposed, mismatch: false };
}

export function paymentChannels(amount: number | null, blocked = false): Array<'no-charge' | 'wallet' | 'cash' | 'vnpay'> {
  if (blocked || billingAmount(amount) === null) return [];
  if (amount === 0) return ['no-charge'];
  return amount! < 5000 ? ['wallet', 'cash'] : ['wallet', 'cash', 'vnpay'];
}
