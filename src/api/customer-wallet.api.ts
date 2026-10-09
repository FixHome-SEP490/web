import apiClient from './client';

export type CustomerWalletTransactionType = 'top_up' | 'invoice_payment' | 'refund' | 'adjustment_credit' | 'adjustment_debit';

/** One change of the customer's wallet: money in (top-up, refund, admin credit) or out (an invoice, admin debit). */
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
};

export const isIncomingWalletTransaction = (t: Pick<CustomerWalletTransaction, 'type'>) =>
  t.type !== 'invoice_payment' && t.type !== 'adjustment_debit';

export interface CustomerWalletSummary {
  balance: number;
  transactions: CustomerWalletTransaction[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Customer wallet (PO 08/10/2026): top up, pay invoices, receive refunds; no withdrawal. */
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
};
