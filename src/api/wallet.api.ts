import apiClient from './client';
import type { PaginationMeta } from '../types';

export interface WalletSummary {
  id: string;
  technicianId: string;
  balance: number;
  pendingWithdrawal: number;
  minimumBalance: number;
  availableBalance: number;
  withdrawableBalance: number;
  eligibleForJobs: boolean;
}

export type WalletTxType = 'TOP_UP' | 'WITHDRAW' | 'ONLINE_EARNING' | 'PLATFORM_FEE' | 'ADJUSTMENT';

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: WalletTxType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export type WithdrawalReqStatus = 'PENDING' | 'SUCCESS' | 'REJECTED' | 'FAILED';

export interface WithdrawalRequest {
  id: string;
  walletId: string;
  technicianId: string;
  amount: number;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  status: WithdrawalReqStatus;
  requestedAt: string;
  processedAt?: string | null;
  processedByUserId?: string | null;
  rejectReason?: string | null;
  technician?: {
    id: string;
    fullName: string;
    phoneNumber?: string;
    email?: string;
    avatarUrl?: string | null;
  } | null;
}

export interface WalletListItem {
  id: string;
  technicianId: string;
  balance: number;
  updatedAt: string;
  eligibleForJobs: boolean;
  technician: {
    id: string;
    fullName: string;
    phoneNumber: string;
    email: string;
    avatarUrl?: string | null;
  };
}

export interface WalletConfig {
  minimumWalletBalance: number;
  platformFeeRateBps: number;
  platformFeePercent: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export const walletApi = {
  // ---- TECHNICIAN ENDPOINTS ----
  async getMyWallet(): Promise<WalletSummary> {
    const res = await apiClient.get<{ data: WalletSummary }>('/technician/wallet');
    return res.data.data;
  },

  async getMyTransactions(query?: {
    page?: number;
    limit?: number;
    type?: string;
  }): Promise<PaginatedResult<WalletTransaction>> {
    const res = await apiClient.get<{
      data: WalletTransaction[];
      meta: PaginationMeta;
    }>('/technician/wallet/transactions', { params: query });
    return res.data;
  },

  async topUp(
    amount: number,
    idempotencyKey?: string,
  ): Promise<{ success: boolean; paymentId: string; balanceAfter: number | null; paymentUrl?: string | null; message: string }> {
    const key =
      idempotencyKey ||
      `TOPUP_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await apiClient.post<{
      data?: { success?: boolean; paymentId?: string; balanceAfter?: number | null; paymentUrl?: string | null; message?: string };
      paymentId?: string;
      balanceAfter?: number | null;
      paymentUrl?: string | null;
      message?: string;
    }>('/technician/wallet/top-up', { amount: Number(amount), idempotencyKey: key });
    const payload = res.data?.data || res.data;
    return {
      success: true,
      paymentId: payload?.paymentId || '',
      paymentUrl: payload?.paymentUrl || null,
      balanceAfter: payload?.balanceAfter !== undefined && payload?.balanceAfter !== null ? Number(payload.balanceAfter) : null,
      message: payload?.message || 'Nạp tiền vào ví thành công',
    };
  },

  async requestWithdrawal(dto: {
    amount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  }): Promise<WithdrawalRequest> {
    const res = await apiClient.post<{ data: WithdrawalRequest }>(
      '/technician/wallet/withdrawals',
      dto,
    );
    return res.data.data;
  },

  async getMyWithdrawals(query?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResult<WithdrawalRequest>> {
    const res = await apiClient.get<{
      data: WithdrawalRequest[];
      meta: PaginationMeta;
    }>('/technician/wallet/withdrawals', { params: query });
    return res.data;
  },

  // ---- SERVICE MANAGER & ADMIN ENDPOINTS ----
  async listWallets(query?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedResult<WalletListItem>> {
    const res = await apiClient.get<{
      data: WalletListItem[];
      meta: PaginationMeta;
    }>('/service-manager/wallets', { params: query });
    return res.data;
  },

  async getWalletDetail(technicianId: string): Promise<WalletSummary> {
    const res = await apiClient.get<{ data: WalletSummary }>(
      `/service-manager/wallets/${technicianId}`,
    );
    return res.data.data;
  },

  async getWalletTransactions(
    technicianId: string,
    query?: { page?: number; limit?: number; type?: string },
  ): Promise<PaginatedResult<WalletTransaction>> {
    const res = await apiClient.get<{
      data: WalletTransaction[];
      meta: PaginationMeta;
    }>(`/service-manager/wallets/${technicianId}/transactions`, { params: query });
    return res.data;
  },

  async listWithdrawals(query?: {
    page?: number;
    limit?: number;
    status?: string;
    technicianId?: string;
  }): Promise<PaginatedResult<WithdrawalRequest>> {
    const res = await apiClient.get<{
      data: WithdrawalRequest[];
      meta: PaginationMeta;
    }>('/service-manager/withdrawals', { params: query });
    return res.data;
  },

  async approveWithdrawal(
    id: string,
  ): Promise<{ success: boolean; id: string; status: string; message: string }> {
    const res = await apiClient.patch<{
      data: { success: boolean; id: string; status: string; message: string };
    }>(`/service-manager/withdrawals/${id}/approve`);
    return res.data.data;
  },

  async rejectWithdrawal(
    id: string,
    reason: string,
  ): Promise<{ success: boolean; id: string; status: string; rejectReason: string; message: string }> {
    const res = await apiClient.patch<{
      data: { success: boolean; id: string; status: string; rejectReason: string; message: string };
    }>(`/service-manager/withdrawals/${id}/reject`, { reason });
    return res.data.data;
  },

  // ---- ADMIN-ONLY ENDPOINTS ----
  async adminAdjustBalance(
    technicianId: string,
    dto: { type: 'CREDIT' | 'DEBIT'; amount: number; reason: string },
  ): Promise<{ success: boolean; balanceAfter: number; transactionId: string; message: string }> {
    const res = await apiClient.post<{
      data: { success: boolean; balanceAfter: number; transactionId: string; message: string };
    }>(`/admin/wallets/${technicianId}/adjustments`, dto);
    return res.data.data;
  },

  async getWalletConfig(): Promise<WalletConfig> {
    const res = await apiClient.get<{ data: WalletConfig }>('/admin/wallet-config');
    return res.data.data;
  },

  async updateWalletConfig(dto: {
    minimumWalletBalance?: number;
    platformFeeRateBps?: number;
  }): Promise<WalletConfig> {
    const res = await apiClient.patch<{ data: WalletConfig }>('/admin/wallet-config', dto);
    return res.data.data;
  },
};
