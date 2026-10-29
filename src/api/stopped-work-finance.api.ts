import apiClient from './client';
import type { FailedWorkFinance } from './orders.api';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = () => new Error('Chưa đọc được thông tin đối soát công việc gián đoạn.');
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
export function readFailedWorkFinance(value: unknown): FailedWorkFinance {
  if (!record(value) || value.version !== 1 || !['VERIFIED_WORK_STOPPED_UNBILLED', 'FINANCIAL_REVIEW_REQUIRED'].includes(String(value.state))
    || value.customerPayableVnd !== null || value.newCollectionAllowed !== false || value.historicalQuoteOnly !== true
    || value.reviewRequired !== true || value.refundState !== 'NOT_DETERMINED' || typeof value.message !== 'string') throw invalid();
  return { version: 1, state: value.state as FailedWorkFinance['state'], customerPayableVnd: null,
    newCollectionAllowed: false, historicalQuoteOnly: true, reviewRequired: true, refundState: 'NOT_DETERMINED', message: value.message };
}
const evidenceKinds = ['invoices', 'payments', 'cashSettlements', 'cashIntents', 'visitPayments', 'voucherReservations', 'voucherClaims', 'voucherLinks', 'voucherFunding', 'partRequests', 'partCustodies'] as const;
export interface StoppedWorkFinance {
  customer: FailedWorkFinance;
  reasonCodes: string[];
  evidence: Partial<Record<typeof evidenceKinds[number], { id: string }[]>>;
}
export const stoppedWorkFinanceApi = {
  async get(orderId: string): Promise<StoppedWorkFinance | null> {
    if (!uuid(orderId)) throw invalid();
    const response = await apiClient.get<{ data: unknown }>(`/service-orders/${orderId}/stopped-work-finance`);
    const body = response.data?.data;
    if (body === null) return null;
    if (!record(body) || !Array.isArray(body.reasonCodes) || !body.reasonCodes.every(code => typeof code === 'string' && /^[A-Z_]{1,100}$/.test(code)) || !record(body.evidence)) throw invalid();
    const evidence: StoppedWorkFinance['evidence'] = {};
    for (const kind of evidenceKinds) {
      if (!(kind in body.evidence)) continue;
      const rows = body.evidence[kind];
      if (!Array.isArray(rows)) throw invalid();
      evidence[kind] = rows.map(row => { if (!record(row) || !uuid(row.id)) throw invalid(); return { id: row.id }; });
    }
    return { customer: readFailedWorkFinance(body.customer), reasonCodes: [...body.reasonCodes], evidence };
  },
};
