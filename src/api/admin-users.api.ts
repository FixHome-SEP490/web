import apiClient from './client';
import type { PaginationMeta } from '../types';

export type AdminUserRole =
  | 'customer'
  | 'technician'
  | 'service_manager'
  | 'admin';

export type AdminUserStatus =
  | 'active'
  | 'suspended'
  | 'locked'
  | 'pending_verification';

export interface AdminUserRecord {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  isActive: boolean;
  avatarUrl?: string | null;
  bookingSuspendedUntil?: string | null;
  permissions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: AdminUserRole;
  status?: AdminUserStatus;
}

export interface AdminUsersResponse {
  data: AdminUserRecord[];
  meta: PaginationMeta;
}

interface UpdateUserStatusPayload {
  status: AdminUserStatus;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeUser(payload: unknown): AdminUserRecord {
  const user = isRecord(payload) ? payload : {};
  const role = String(user.role ?? '').toLowerCase();
  const status = String(user.status ?? '').toLowerCase();
  if (!['customer', 'technician', 'service_manager', 'admin'].includes(role)) {
    throw new Error('Backend returned an unsupported user role.');
  }
  if (!['active', 'suspended', 'locked', 'pending_verification'].includes(status)) {
    throw new Error('Backend returned an unsupported user status.');
  }
  return {
    id: String(user.id ?? ''),
    email: String(user.email ?? ''),
    fullName: String(user.fullName ?? ''),
    phoneNumber: user.phoneNumber == null ? null : String(user.phoneNumber),
    role: role as AdminUserRole,
    status: status as AdminUserStatus,
    isActive: Boolean(user.isActive),
    avatarUrl: user.avatarUrl == null ? null : String(user.avatarUrl),
    bookingSuspendedUntil:
      user.bookingSuspendedUntil == null ? null : String(user.bookingSuspendedUntil),
    permissions: Array.isArray(user.permissions)
      ? user.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [],
    createdAt: String(user.createdAt ?? ''),
    updatedAt: String(user.updatedAt ?? ''),
  };
}

function unwrapUsers(payload: unknown): AdminUsersResponse {
  const outer = isRecord(payload) ? payload : {};
  const candidate = Array.isArray(payload) ? payload : outer.data;
  const dataSource = Array.isArray(candidate)
    ? candidate
    : isRecord(candidate) && Array.isArray(candidate.data)
      ? candidate.data
      : null;
  if (!dataSource) throw new Error('Backend returned an invalid user list response.');
  const metaSource =
    isRecord(candidate) && isRecord(candidate.meta) ? candidate.meta : outer.meta;

  const meta: PaginationMeta = {
    page: Number(metaSource && isRecord(metaSource) ? metaSource.page : 1) || 1,
    limit: Number(metaSource && isRecord(metaSource) ? metaSource.limit : dataSource.length) || dataSource.length,
    total: Number(metaSource && isRecord(metaSource) ? metaSource.total : dataSource.length) || 0,
    totalPages:
      Number(metaSource && isRecord(metaSource) ? metaSource.totalPages : 1) || 1,
  };

  return { data: dataSource.map(normalizeUser), meta };
}

function unwrapUser(payload: unknown): AdminUserRecord {
  const outer = isRecord(payload) ? payload : {};
  return normalizeUser(outer.data && isRecord(outer.data) ? outer.data : payload);
}

export const adminUsersApi = {
  async getUsers(query: AdminUsersQuery = {}): Promise<AdminUsersResponse> {
    const response = await apiClient.get<unknown>('/admin/users', { params: query });
    return unwrapUsers(response.data);
  },

  async getUser(id: string): Promise<AdminUserRecord> {
    const response = await apiClient.get<unknown>(`/admin/users/${id}`);
    return unwrapUser(response.data);
  },

  async updateStatus(
    id: string,
    payload: UpdateUserStatusPayload,
  ): Promise<AdminUserRecord> {
    const response = await apiClient.patch<unknown>(`/admin/users/${id}/status`, payload);
    return unwrapUser(response.data);
  },
};

export type { UpdateUserStatusPayload };
