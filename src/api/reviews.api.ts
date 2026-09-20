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
};
