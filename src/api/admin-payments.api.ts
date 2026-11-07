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

export interface ConfirmManualBankPayload {
  amount: number;
  bankReference: string;
}

export interface ManualBankConfirmationResult {
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: 'verified';
}

/** Same rule as `ConfirmManualBankTransferDto` in Backend. */
const MANUAL_BANK_REFERENCE = /^[A-Z0-9][A-Z0-9._:/-]{5,127}$/;

export function normalizeBankReference(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isValidBankReference(value: unknown): boolean {
  return MANUAL_BANK_REFERENCE.test(normalizeBankReference(value));
}

export function isValidManualBankAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Admin: every payment attempt (PO 09/10/2026), manual bank confirmation (W3). */
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

  async confirmManualBank(invoiceId: string, payload: ConfirmManualBankPayload): Promise<ManualBankConfirmationResult> {
    const amount = payload.amount;
    const bankReference = normalizeBankReference(payload.bankReference);
    if (!invoiceId || !isValidManualBankAmount(amount) || !isValidBankReference(bankReference)) {
      throw new Error('Số tiền hoặc mã tham chiếu ngân hàng không hợp lệ.');
    }
    const res = await apiClient.post<{ data?: unknown }>(
      `/admin/payments/manual-bank/${encodeURIComponent(invoiceId)}/confirm`,
      { amount, bankReference },
    );
    const result = res.data?.data;
    if (!isRecord(result) || typeof result.paymentId !== 'string' || !result.paymentId.trim()
      || result.invoiceId !== invoiceId || result.status !== 'verified'
      || !isValidManualBankAmount(result.amount) || result.amount !== amount) {
      throw new Error('Máy chủ chưa xác nhận khoản chuyển khoản này.');
    }
    return {
      paymentId: result.paymentId.trim(),
      invoiceId,
      amount: result.amount,
      status: 'verified',
    };
  },
};
