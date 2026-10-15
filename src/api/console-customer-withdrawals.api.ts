// Service Manager and Admin: customers' withdrawals to the bank (PO 16/10/2026).
// Kept apart from the technicians' withdrawals in `wallet.api.ts`: other list,
// other totals. The payOS source balance is the one payout channel both share.
import apiClient from './client';
import { readPage, type PageResult } from './paging';
import type { CustomerWithdrawalStatus } from './customer-wallet.api';
import type { PayoutOverview } from './wallet.api';

/** One customer withdrawal as staff see it: who asked, where the money went, how it ended. */
export interface CustomerStaffWithdrawal {
  id: string;
  amount: number;
  status: CustomerWithdrawalStatus;
  bankName: string;
  /** Already masked by the server ("••••1234"). */
  bankAccountNumber: string | null;
  bankAccountName: string;
  requestedAt: string;
  payoutAttemptedAt: string | null;
  payoutBankReference: string | null;
  /** Why it failed; staff may also see the payout provider's note while it is still PROCESSING. */
  failureReason: string | null;
  /** Set when the money went back to the customer's wallet. */
  refundTransactionId: string | null;
  updatedAt: string;
  customer: { id: string; fullName: string; email: string | null; phoneNumber: string | null };
}

/** What the re-check answers: the withdrawal plus a sentence for the screen. */
export type CustomerStaffWithdrawalResult = CustomerStaffWithdrawal & { message: string };

export interface CustomerWithdrawalListQuery {
  page: number;
  limit: number;
  status?: CustomerWithdrawalStatus;
  /** Customer name (accents ignored), email or phone. */
  search?: string;
}

const toWithdrawal = <T extends CustomerStaffWithdrawal>(w: T): T => ({ ...w, amount: Number(w.amount) });

const toTotal = (t: { count: number; amount: number } | undefined) => ({
  count: Number(t?.count ?? 0),
  amount: Number(t?.amount ?? 0),
});

export const consoleCustomerWithdrawalsApi = {
  async list(query: CustomerWithdrawalListQuery): Promise<PageResult<CustomerStaffWithdrawal>> {
    const params: Record<string, string | number> = { page: query.page, limit: query.limit };
    if (query.status) params.status = query.status;
    const search = query.search?.trim();
    if (search) params.search = search;
    const res = await apiClient.get<unknown>('/service-manager/customer-withdrawals', { params });
    return readPage<CustomerStaffWithdrawal, CustomerStaffWithdrawal>(
      res.data,
      { page: query.page, pageSize: query.limit },
      toWithdrawal,
    );
  },

  /** Customer totals only; `sourceBalance` is the payout channel shared with technicians. */
  async payoutOverview(): Promise<PayoutOverview> {
    const res = await apiClient.get<{ data: PayoutOverview }>('/service-manager/customer-withdrawals/payout-overview');
    const o = res.data.data;
    return {
      provider: o.provider,
      sourceBalance: o.sourceBalance === null || o.sourceBalance === undefined ? null : Number(o.sourceBalance),
      paidOut: toTotal(o.paidOut),
      processing: toTotal(o.processing),
      pending: toTotal(o.pending),
      failed: toTotal(o.failed),
    };
  },

  /** Ask payOS again about a payout that is still PROCESSING. */
  async reconcile(id: string): Promise<CustomerStaffWithdrawalResult> {
    const res = await apiClient.post<{ data: CustomerStaffWithdrawalResult }>(
      `/service-manager/customer-withdrawals/${id}/reconcile`,
    );
    return toWithdrawal(res.data.data);
  },
};
