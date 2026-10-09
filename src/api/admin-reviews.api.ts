import apiClient from './client';

export interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  orderId: string | null;
  orderCode: string | null;
  technicianId: string;
  technicianName: string;
  technicianEmail: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
}

export interface AdminReviewFilters {
  search?: string;
  rating?: number;
  maxRating?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminReviewSummary { average: number | null; stars: Record<1 | 2 | 3 | 4 | 5, number> }
type Meta = { page: number; limit: number; total: number; totalPages: number; summary: AdminReviewSummary };

const EMPTY: AdminReviewSummary = { average: null, stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

/** Admin: customer reviews (PO 09/10/2026). Read only. */
export const adminReviewsApi = {
  async list(filters: AdminReviewFilters) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined));
    const res = await apiClient.get<{ data: AdminReviewRow[]; meta: Meta }>('/admin/reviews', { params });
    const meta = res.data.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0, summary: EMPTY };
    return {
      data: (res.data.data ?? []).map((r) => ({ ...r, rating: Number(r.rating) })),
      meta: { ...meta, summary: { average: meta.summary?.average ?? null, stars: { ...EMPTY.stars, ...meta.summary?.stars } } },
    };
  },
};
