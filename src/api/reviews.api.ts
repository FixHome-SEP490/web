// src/api/reviews.api.ts
import apiClient from './client';

export interface Review {
  id: string;
  serviceOrderId: string;
  customerId: string;
  technicianId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  customerName?: string;
}

export const reviewsApi = {
  async getByOrder(orderId: string): Promise<Review | null> {
    const res = await apiClient.get<{ data: Review | null }>(`/service-orders/${orderId}/reviews`);
    return res.data.data;
  },

  async createReview(orderId: string, body: { rating: number; comment?: string }): Promise<Review> {
    const res = await apiClient.post<{ data: Review }>(`/service-orders/${orderId}/reviews`, body);
    return res.data.data;
  },

  async getByTechnician(technicianId: string, page = 1, pageSize = 20): Promise<{ data: Review[]; total: number }> {
    const res = await apiClient.get<{ data: Review[]; meta?: { total?: number } }>(`/technicians/${technicianId}/reviews`, {
      params: { page, pageSize },
    });
    return {
      data: res.data.data || [],
      total: res.data.meta?.total ?? (res.data.data?.length ?? 0),
    };
  },
};
