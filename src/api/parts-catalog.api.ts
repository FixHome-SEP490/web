// src/api/parts-catalog.api.ts
import apiClient from './client';
import type { FixHomePart, AdminPartsResponse } from './admin-parts.api';

export interface CatalogPartsQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export const partsCatalogApi = {
  async getCatalog(query: CatalogPartsQuery = {}): Promise<AdminPartsResponse> {
    const response = await apiClient.get<{ data: FixHomePart[]; meta: Record<string, unknown> }>(
      '/parts/catalog',
      { params: query },
    );
    const data = response.data?.data || (Array.isArray(response.data) ? response.data : []);
    const meta = (response.data?.meta as { page: number; limit: number; total: number; totalPages: number }) || {
      page: 1,
      limit: data.length,
      total: data.length,
      totalPages: 1,
    };
    return { data, meta };
  },

  async getPartById(id: string): Promise<FixHomePart> {
    const response = await apiClient.get<{ data: FixHomePart }>(
      `/parts/catalog/${id}`,
    );
    return response.data.data;
  },
};
