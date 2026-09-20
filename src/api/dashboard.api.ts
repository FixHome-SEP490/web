// src/api/dashboard.api.ts
import apiClient from './client';

export interface OperationalDashboard {
  ordersByStatus: { status: string; count: string }[];
  activeOrders: number;
  matchingBookings: number;
  pendingCancellations: number;
}

export const dashboardApi = {
  async getOperational(): Promise<OperationalDashboard> {
    const res = await apiClient.get<{ data: OperationalDashboard }>('/dashboard/operations');
    return res.data.data;
  },
};
