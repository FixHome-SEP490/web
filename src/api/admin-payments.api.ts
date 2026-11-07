import apiClient from './client';

export type PaymentStatus = 'pending' | 'verified' | 'failed' | 'refunded' | 'cancelled';
export type PaymentPurpose = 'invoice' | 'commission_due' | 'wallet_top_up';

export interface AdminPaymentRow {
  id: string;
  purpose: PaymentPurpose;
  amount: number;
  currency: string;
  mode: string;
  provider: string | null;
  status: PaymentStatus;
  providerReference: string | null;
  failureCode: string | null;
  requestedAt: string;
  verifiedAt: string | null;
  invoiceId: string | null;
  payerId: string;
  payerName: string;
  payerEmail: string;
  payerRole: string;
  orderId: string | null;
  orderCode: string | null;
}

export interface AdminPaymentFilters {
  search?: string;
  status?: PaymentStatus | '';
  purpose?: PaymentPurpose | '';
  provider?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminPaymentSummary { verifiedAmount: number; verified: number; pending: number; failed: number }
type Meta = { page: number; limit: number; total: number; totalPages: number; summary: AdminPaymentSummary };

const EMPTY_SUMMARY: AdminPaymentSummary = { verifiedAmount: 0, verified: 0, pending: 0, failed: 0 };

/** Admin: every payment attempt (PO 09/10/2026). Read only. */
export const adminPaymentsApi = {
  async list(filters: AdminPaymentFilters) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined));
    const res = await apiClient.get<{ data: AdminPaymentRow[]; meta: Meta }>('/admin/payments', { params });
    const meta = res.data.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0, summary: EMPTY_SUMMARY };
    return {
      data: (res.data.data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })),
      meta: { ...meta, summary: { ...EMPTY_SUMMARY, ...meta.summary, verifiedAmount: Number(meta.summary?.verifiedAmount ?? 0) } },
    };
  },
};
