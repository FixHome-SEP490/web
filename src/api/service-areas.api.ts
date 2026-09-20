// src/api/service-areas.api.ts
import apiClient from './client';

export interface ServiceArea {
  id: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const serviceAreasApi = {
  async getServiceAreas(params?: {
    provinceCode?: string;
    isActive?: boolean;
  }): Promise<ServiceArea[]> {
    const res = await apiClient.get<{ data: ServiceArea[] }>('/service-areas', { params });
    return res.data.data;
  },

  async getServiceArea(id: string): Promise<ServiceArea> {
    const res = await apiClient.get<{ data: ServiceArea }>(`/service-areas/${id}`);
    return res.data.data;
  },

  async createServiceArea(dto: {
    provinceCode: string;
    provinceName: string;
    districtCode: string;
    districtName: string;
    isActive?: boolean;
  }): Promise<ServiceArea> {
    const res = await apiClient.post<{ data: ServiceArea }>('/service-areas', dto);
    return res.data.data;
  },

  async updateServiceArea(
    id: string,
    dto: Partial<{
      provinceCode: string;
      provinceName: string;
      districtCode: string;
      districtName: string;
      isActive: boolean;
    }>,
  ): Promise<ServiceArea> {
    const res = await apiClient.patch<{ data: ServiceArea }>(`/service-areas/${id}`, dto);
    return res.data.data;
  },

  async toggleStatus(id: string, isActive: boolean): Promise<ServiceArea> {
    const res = await apiClient.patch<{ data: ServiceArea }>(`/service-areas/${id}/status`, { isActive });
    return res.data.data;
  },

  async deleteServiceArea(id: string): Promise<void> {
    await apiClient.delete(`/service-areas/${id}`);
  },
};
