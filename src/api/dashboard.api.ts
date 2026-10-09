// src/api/dashboard.api.ts
import apiClient from './client';

export interface OperationalDashboard {
  ordersByStatus: { status: string; count: string }[];
  activeOrders: number;
  matchingBookings: number;
  pendingCancellations: number;
  /** "Cần thay đổi thợ" reports still waiting for a manager (PO 09/10/2026). */
  openReplacementCases?: number;
  /** Orders the system cancelled in the last 7 days because the technician never set out. */
  noDepartureCancellations7d?: number;
}

export const dashboardApi = {
  async getOperational(): Promise<OperationalDashboard> {
    const res = await apiClient.get<{ data: OperationalDashboard }>('/dashboard/operations');
    return res.data.data;
  },
};
