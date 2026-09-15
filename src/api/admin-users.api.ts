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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new Error(message);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(message);
  return (value as string).trim();
}

// Strict outer envelope following the known runtime contract
// `{ success: true, statusCode: number, message: string, data, meta? }`.
// Raw arrays/objects are never accepted as success.
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

function normalizePagination(payload: unknown): PaginationMeta {
  if (!isRecord(payload)) invalid('Backend returned an invalid user pagination meta.');
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
    invalid('Backend returned an invalid user pagination meta.');
  }
  return { page, limit, total, totalPages } as PaginationMeta;
}

function normalizeUser(payload: unknown): AdminUserRecord {
  if (!isRecord(payload)) invalid('Backend returned an invalid user response.');
  const user = payload;
  const role = typeof user.role === 'string' ? user.role.toLowerCase() : '';
  const status = typeof user.status === 'string' ? user.status.toLowerCase() : '';
  if (!['customer', 'technician', 'service_manager', 'admin'].includes(role)) {
    throw new Error('Backend returned an unsupported user role.');
  }
  if (!['active', 'suspended', 'locked', 'pending_verification'].includes(status)) {
    throw new Error('Backend returned an unsupported user status.');
  }
  return {
    id: requiredString(user.id, 'Backend returned a user without an id.'),
    email: requiredString(user.email, 'Backend returned a user without an email.'),
    fullName: requiredString(user.fullName, 'Backend returned a user without a full name.'),
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
  const envelope = unwrapEnvelope(payload, 'Backend returned an invalid user list response.');
  if (!Array.isArray(envelope.data) || envelope.meta === undefined) {
    invalid('Backend returned an invalid user list response.');
  }
  return {
    data: (envelope.data as unknown[]).map(normalizeUser),
    meta: normalizePagination(envelope.meta),
  };
}

function unwrapUser(payload: unknown, message: string): AdminUserRecord {
  const envelope = unwrapEnvelope(payload, message);
  return normalizeUser(envelope.data);
}

export const adminUsersApi = {
  async getUsers(query: AdminUsersQuery = {}): Promise<AdminUsersResponse> {
    const response = await apiClient.get<unknown>('/admin/users', { params: query });
    return unwrapUsers(response.data);
  },

  async getUser(id: string): Promise<AdminUserRecord> {
    const response = await apiClient.get<unknown>(`/admin/users/${id}`);
    return unwrapUser(response.data, 'Backend returned an invalid user detail response.');
  },

  async updateStatus(
    id: string,
    payload: UpdateUserStatusPayload,
  ): Promise<AdminUserRecord> {
    const response = await apiClient.patch<unknown>(`/admin/users/${id}/status`, payload);
    return unwrapUser(response.data, 'Backend returned an invalid user status response.');
  },
};

export type { UpdateUserStatusPayload };
