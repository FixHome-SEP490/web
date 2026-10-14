import apiClient from './client';
import { readPage, type PageResult } from './paging';
import type { BankAccount, BankOption } from './wallet.api';

export type CustomerWalletTransactionType =
  | 'top_up'
  | 'invoice_payment'
  | 'refund'
  | 'adjustment_credit'
  | 'adjustment_debit'
  /** Sent to the customer's bank (PO 14/10/2026). */
  | 'withdrawal'
  /** A withdrawal the bank did not take, returned to the wallet. */
  | 'withdrawal_refund';

/** One change of the customer's wallet: money in (top-up, refund, admin credit, failed withdrawal) or out (an invoice, admin debit, withdrawal). */
export interface CustomerWalletTransaction {
  id: string;
  type: CustomerWalletTransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export const customerWalletTypeLabels: Record<CustomerWalletTransactionType, string> = {
  top_up: 'Nạp ví',
  invoice_payment: 'Thanh toán đơn',
  refund: 'Hoàn tiền',
  adjustment_credit: 'FixHome cộng tiền',
  adjustment_debit: 'FixHome trừ tiền',
  withdrawal: 'Rút về ngân hàng',
  withdrawal_refund: 'Hoàn tiền rút không thành công',
};

const OUTGOING_TYPES: ReadonlySet<CustomerWalletTransactionType> = new Set(['invoice_payment', 'adjustment_debit', 'withdrawal']);

export const isIncomingWalletTransaction = (t: Pick<CustomerWalletTransaction, 'type'>) => !OUTGOING_TYPES.has(t.type);

export type CustomerKycStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type CustomerWithdrawalStatus = 'PROCESSING' | 'SUCCESS' | 'FAILED';

/** One withdrawal to the customer's bank; paid at once, no approval step. */
export interface CustomerWithdrawal {
  id: string;
  amount: number;
  status: CustomerWithdrawalStatus;
  bankName: string;
  /** Only the last four digits, already masked by the server ("••••1234"). */
  bankAccountNumber: string | null;
  bankAccountName: string;
  requestedAt: string;
  payoutAttemptedAt: string | null;
  payoutBankReference: string | null;
  /** Only when FAILED. */
  failureReason: string | null;
  refundTransactionId: string | null;
  updatedAt: string;
}

/** What the withdraw call answers: the withdrawal plus a sentence for the screen. */
export type CustomerWithdrawalResult = CustomerWithdrawal & { message: string };

/** Everything the wallet needs to decide which withdrawal step to show. */
export interface CustomerWithdrawalInfo {
  kycStatus: CustomerKycStatus;
  kycRejectionReason: string | null;
  hasBankAccount: boolean;
  bankAccount: BankAccount | null;
  minimumAmount: number;
  /** The whole balance, capped by the largest single payout. */
  maximumAmount: number;
  /** False when no payout provider is configured: nothing can be withdrawn. */
  payoutAvailable: boolean;
  openWithdrawal: CustomerWithdrawal | null;
  canWithdraw: boolean;
}

export interface CustomerWalletSummary {
  balance: number;
  transactions: CustomerWalletTransaction[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const toWithdrawal = <T extends CustomerWithdrawal>(w: T): T => ({ ...w, amount: Number(w.amount) });

function toInfo(info: CustomerWithdrawalInfo): CustomerWithdrawalInfo {
  return {
    ...info,
    minimumAmount: Number(info.minimumAmount ?? 10_000),
    maximumAmount: Number(info.maximumAmount ?? 0),
    openWithdrawal: info.openWithdrawal ? toWithdrawal(info.openWithdrawal) : null,
  };
}

/** Customer wallet: top up, pay invoices, receive refunds and (PO 14/10/2026) withdraw to the bank after an identity check. */
export const customerWalletApi = {
  async summary(page = 1, pageSize = 20): Promise<CustomerWalletSummary> {
    const res = await apiClient.get<{ data: CustomerWalletSummary }>('/customer/wallet', { params: { page, pageSize } });
    const data = res.data.data;
    return {
      balance: Number(data?.balance ?? 0),
      transactions: (data?.transactions ?? []).map((t) => ({ ...t, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter) })),
      meta: data?.meta ?? { page, limit: pageSize, total: 0, totalPages: 0 },
    };
  },

  /** A VNPay page to pay the top-up on; the wallet is credited when VNPay confirms. */
  async topUp(amount: number): Promise<string> {
    const res = await apiClient.post<{ data: { paymentUrl: string } }>('/customer/wallet/top-up', { amount });
    return res.data.data.paymentUrl;
  },

  async payInvoice(invoiceId: string): Promise<{ amount: number; balance: number }> {
    const res = await apiClient.post<{ data: { amount: number; balance: number } }>(`/invoices/${invoiceId}/pay-with-wallet`);
    return { amount: Number(res.data.data.amount), balance: Number(res.data.data.balance) };
  },

  async withdrawalInfo(): Promise<CustomerWithdrawalInfo> {
    const res = await apiClient.get<{ data: CustomerWithdrawalInfo }>('/customer/wallet/withdrawal-info');
    return toInfo(res.data.data);
  },

  async listBanks(): Promise<BankOption[]> {
    const res = await apiClient.get<{ data: BankOption[] }>('/customer/wallet/banks');
    return res.data.data ?? [];
  },

  async getBankAccount(): Promise<BankAccount | null> {
    const res = await apiClient.get<{ data: BankAccount | null }>('/customer/wallet/bank-account');
    return res.data.data ?? null;
  },

  /** The holder name must match the verified name; the server stores it upper case without accents. */
  async saveBankAccount(dto: { bankBin: string; accountNumber: string; accountName: string }): Promise<BankAccount> {
    const res = await apiClient.put<{ data: BankAccount }>('/customer/wallet/bank-account', dto);
    return res.data.data;
  },

  /** Pays out at once and says how it ended: SUCCESS, PROCESSING (bank still working) or FAILED (refunded). */
  async withdraw(amount: number): Promise<CustomerWithdrawalResult> {
    const res = await apiClient.post<{ data: CustomerWithdrawalResult }>('/customer/wallet/withdrawals', { amount });
    return toWithdrawal(res.data.data);
  },

  async listWithdrawals(page = 1, limit = 10): Promise<PageResult<CustomerWithdrawal>> {
    const res = await apiClient.get<unknown>('/customer/wallet/withdrawals', { params: { page, limit } });
    // A paged answer is `{ data: [...], meta }` at the top of the envelope.
    return readPage<CustomerWithdrawal, CustomerWithdrawal>(res.data, { page, pageSize: limit }, toWithdrawal);
  },
};
