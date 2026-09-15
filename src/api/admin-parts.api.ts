import apiClient from './client';
import type { PaginationMeta } from '../types';

export interface FixHomePart {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  sellingPrice: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPartsQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface AdminPartsResponse {
  data: FixHomePart[];
  meta: PaginationMeta;
}

export interface CreatePartPayload {
  sku?: string | null;
  name: string;
  description?: string | null;
  sellingPrice: number;
  warrantyDays?: number | null;
  warrantyPolicy?: string | null;
}

export interface UpdatePartPayload {
  sku?: string | null;
  name?: string;
  description?: string | null;
  sellingPrice?: number;
  warrantyDays?: number | null;
  warrantyPolicy?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePart(payload: unknown): FixHomePart {
  if (!isRecord(payload)) {
    throw new Error('Backend returned an invalid part response.');
  }
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const sellingPrice = Number(payload.sellingPrice);
  const warrantyDays = payload.warrantyDays == null ? null : Number(payload.warrantyDays);
  if (
    !id ||
    !name ||
    !Number.isFinite(sellingPrice) ||
    typeof payload.isActive !== 'boolean' ||
    (warrantyDays !== null && !Number.isFinite(warrantyDays))
  ) {
    throw new Error('Backend returned an invalid part response.');
  }
  return {
    id,
    sku: payload.sku == null ? null : String(payload.sku),
    name,
    description: payload.description == null ? null : String(payload.description),
    sellingPrice,
    warrantyDays,
    warrantyPolicy: payload.warrantyPolicy == null ? null : String(payload.warrantyPolicy),
    isActive: payload.isActive,
    createdAt: String(payload.createdAt ?? ''),
    updatedAt: String(payload.updatedAt ?? ''),
  };
}

function unwrapPartList(payload: unknown): AdminPartsResponse {
  const outer = isRecord(payload) ? payload : {};
  const candidate = Array.isArray(payload) ? payload : outer.data;
  const dataSource = Array.isArray(candidate)
    ? candidate
    : isRecord(candidate) && Array.isArray(candidate.data)
      ? candidate.data
      : null;
  if (!dataSource) throw new Error('Backend returned an invalid part list response.');
  const metaSource =
    isRecord(candidate) && isRecord(candidate.meta) ? candidate.meta : outer.meta;

  const meta: PaginationMeta = {
    page: Number(metaSource && isRecord(metaSource) ? metaSource.page : 1) || 1,
    limit:
      Number(metaSource && isRecord(metaSource) ? metaSource.limit : dataSource.length) ||
      dataSource.length,
    total:
      Number(metaSource && isRecord(metaSource) ? metaSource.total : dataSource.length) || 0,
    totalPages: Number(metaSource && isRecord(metaSource) ? metaSource.totalPages : 1) || 1,
  };

  return { data: dataSource.map(normalizePart), meta };
}

function unwrapPart(payload: unknown): FixHomePart {
  const outer = isRecord(payload) ? payload : {};
  return normalizePart(outer.data && isRecord(outer.data) ? outer.data : payload);
}

export const adminPartsApi = {
  async getParts(query: AdminPartsQuery = {}): Promise<AdminPartsResponse> {
    const response = await apiClient.get<unknown>('/admin/parts', { params: query });
    return unwrapPartList(response.data);
  },

  async getPart(id: string): Promise<FixHomePart> {
    const response = await apiClient.get<unknown>(`/admin/parts/${id}`);
    return unwrapPart(response.data);
  },

  async createPart(payload: CreatePartPayload): Promise<FixHomePart> {
    const response = await apiClient.post<unknown>('/admin/parts', payload);
    return unwrapPart(response.data);
  },

  async updatePart(id: string, payload: UpdatePartPayload): Promise<FixHomePart> {
    const response = await apiClient.patch<unknown>(`/admin/parts/${id}`, payload);
    return unwrapPart(response.data);
  },

  async setPartStatus(id: string, isActive: boolean): Promise<FixHomePart> {
    const response = await apiClient.patch<unknown>(`/admin/parts/${id}/status`, { isActive });
    return unwrapPart(response.data);
  },
};
