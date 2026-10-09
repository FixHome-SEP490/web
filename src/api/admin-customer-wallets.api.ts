import apiClient from './client';
import type { CustomerWalletTransaction } from './customer-wallet.api';

export interface AdminCustomerWalletRow {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  status: string;
  balance: number;
  updatedAt: string | null;
}

export interface AdminCustomerWalletDetail {
  customer: { id: string; fullName: string; email: string; phoneNumber: string | null; status: string };
  balance: number;
  transactions: CustomerWalletTransaction[];
}

type Meta = { page: number; limit: number; total: number; totalPages: number; totalBalance: number };

/** Admin: customer wallets (PO 09/10/2026): balances, history and a correction with a reason. */
export const adminCustomerWalletsApi = {
  async list(params: { search?: string; withBalance?: boolean; page?: number; pageSize?: number }) {
    const res = await apiClient.get<{ data: AdminCustomerWalletRow[]; meta: Meta }>('/admin/customer-wallets', { params });
    return {
      data: (res.data.data ?? []).map((r) => ({ ...r, balance: Number(r.balance) })),
      meta: res.data.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0, totalBalance: 0 },
    };
  },
  async detail(userId: string): Promise<AdminCustomerWalletDetail> {
    const res = await apiClient.get<{ data: AdminCustomerWalletDetail }>(`/admin/customer-wallets/${userId}`, { params: { pageSize: 50 } });
    const data = res.data.data;
    return {
      customer: data.customer,
      balance: Number(data.balance ?? 0),
      transactions: (data.transactions ?? []).map((t) => ({ ...t, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter) })),
    };
  },
  async adjust(userId: string, body: { type: 'CREDIT' | 'DEBIT'; amount: number; reason: string }) {
    const res = await apiClient.post<{ data: { balanceAfter: number } }>(`/admin/customer-wallets/${userId}/adjustments`, body);
    return { balanceAfter: Number(res.data.data.balanceAfter) };
  },
};
