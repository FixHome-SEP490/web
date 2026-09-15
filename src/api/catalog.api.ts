// src/api/catalog.api.ts
import apiClient from './client';
import type { PaginationMeta } from '../types';

export interface ServiceCategory {
  id: string;
  name: string;
  code: string;
  slug?: string | null;
  iconKey?: string | null;
  sortOrder: number;
  description?: string | null;
  isActive: boolean;
  services?: ServiceItem[];
}

export interface ServiceItem {
  id: string;
  categoryId: string;
  category?: ServiceCategory;
  name: string;
  code: string;
  slug?: string | null;
  description?: string | null;
  pricingMode?: 'FIXED_PRICE' | 'INSPECTION_REQUIRED' | 'fixed_price' | 'inspection_required';
  unit?: string | null;
  fixedPrice?: number | null;
  scopeDescription?: string | null;
  basePrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  basePriceMin?: number;
  basePriceMax?: number;
  estimatedMinutes: number;
  isActive: boolean;
}

export interface ServiceListResponse {
  data: ServiceItem[];
  meta: PaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new Error(message);
}

// Strict local envelope normalization following the known runtime contract
// `{ success: true, statusCode: number, message: string, data, meta? }`.
// Local to this adapter: the shared Axios client is unchanged and no mock
// fallback is invented here.
function unwrapEnvelope(payload: unknown, message: string): { data: unknown; meta?: unknown } {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    typeof payload.statusCode !== 'number' ||
    !Number.isInteger(payload.statusCode) ||
    typeof payload.message !== 'string' ||
    !('data' in payload)
  ) {
    invalid(message);
  }
  return { data: payload.data, meta: payload.meta };
}

function normalizePagination(payload: unknown, message: string): PaginationMeta {
  if (!isRecord(payload)) invalid(message);
  const { page, limit, total, totalPages } = payload;
  if (
    ![page, limit, total, totalPages].every(
      (value) => typeof value === 'number' && Number.isInteger(value),
    ) ||
    (page as number) < 1 ||
    (limit as number) < 1 ||
    (total as number) < 0 ||
    (totalPages as number) < 0
  ) {
    invalid(message);
  }
  return { page, limit, total, totalPages } as PaginationMeta;
}

function unwrapCategoryList(payload: unknown, message: string): ServiceCategory[] {
  const envelope = unwrapEnvelope(payload, message);
  if (!Array.isArray(envelope.data)) invalid(message);
  return envelope.data as ServiceCategory[];
}

function unwrapCategory(payload: unknown, message: string): ServiceCategory {
  const envelope = unwrapEnvelope(payload, message);
  if (!isRecord(envelope.data)) invalid(message);
  return envelope.data as unknown as ServiceCategory;
}

function unwrapServiceList(payload: unknown, message: string): ServiceListResponse {
  const envelope = unwrapEnvelope(payload, message);
  if (!Array.isArray(envelope.data) || envelope.meta === undefined) invalid(message);
  return {
    data: envelope.data as ServiceItem[],
    meta: normalizePagination(envelope.meta, message),
  };
}

function unwrapService(payload: unknown, message: string): ServiceItem {
  const envelope = unwrapEnvelope(payload, message);
  if (!isRecord(envelope.data)) invalid(message);
  return envelope.data as unknown as ServiceItem;
}

export const catalogApi = {
  // Public Category endpoints
  async getCategories(onlyActive = true): Promise<ServiceCategory[]> {
    const res = await apiClient.get<unknown>('/categories');
    const data = unwrapCategoryList(res.data, 'Backend returned an invalid category list response.');
    return onlyActive ? data.filter((c) => c.isActive) : data;
  },

  async getCategory(idOrSlug: string): Promise<ServiceCategory> {
    const res = await apiClient.get<unknown>(`/categories/${idOrSlug}`);
    return unwrapCategory(res.data, 'Backend returned an invalid category response.');
  },

  // Admin Category endpoints
  async getAdminCategories(): Promise<ServiceCategory[]> {
    const res = await apiClient.get<unknown>('/admin/categories');
    return unwrapCategoryList(res.data, 'Backend returned an invalid category list response.');
  },

  async createCategory(dto: Partial<ServiceCategory>): Promise<ServiceCategory> {
    const res = await apiClient.post<unknown>('/admin/categories', dto);
    return unwrapCategory(res.data, 'Backend returned an invalid category response.');
  },

  async updateCategory(id: string, dto: Partial<ServiceCategory>): Promise<ServiceCategory> {
    const res = await apiClient.patch<unknown>(`/admin/categories/${id}`, dto);
    return unwrapCategory(res.data, 'Backend returned an invalid category response.');
  },

  async toggleCategoryStatus(id: string, isActive: boolean): Promise<ServiceCategory> {
    const res = await apiClient.patch<unknown>(`/admin/categories/${id}/status`, { isActive });
    return unwrapCategory(res.data, 'Backend returned an invalid category response.');
  },

  // Public Service endpoints
  async getServices(params?: {
    categoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ServiceListResponse> {
    const res = await apiClient.get<unknown>('/services', { params });
    return unwrapServiceList(res.data, 'Backend returned an invalid service list response.');
  },

  async getService(idOrSlug: string): Promise<ServiceItem> {
    const res = await apiClient.get<unknown>(`/services/${idOrSlug}`);
    return unwrapService(res.data, 'Backend returned an invalid service response.');
  },

  // Admin Service endpoints
  async getAdminServices(params?: {
    categoryId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<ServiceListResponse> {
    const res = await apiClient.get<unknown>('/admin/services', { params });
    return unwrapServiceList(res.data, 'Backend returned an invalid service list response.');
  },

  async createService(dto: Partial<ServiceItem>): Promise<ServiceItem> {
    const res = await apiClient.post<unknown>('/admin/services', dto);
    return unwrapService(res.data, 'Backend returned an invalid service response.');
  },

  async updateService(id: string, dto: Partial<ServiceItem>): Promise<ServiceItem> {
    const res = await apiClient.patch<unknown>(`/admin/services/${id}`, dto);
    return unwrapService(res.data, 'Backend returned an invalid service response.');
  },

  async toggleServiceStatus(id: string, isActive: boolean): Promise<ServiceItem> {
    const res = await apiClient.patch<unknown>(`/admin/services/${id}/status`, { isActive });
    return unwrapService(res.data, 'Backend returned an invalid service response.');
  },
};
