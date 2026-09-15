import apiClient from './client';
import type { PaginationMeta } from '../types';

export interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  resourceType?: string;
  actorUserId?: string;
  action?: string;
}

export interface AuditLogListResponse {
  data: AuditLogRecord[];
  meta: PaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new Error(message);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(message);
  return value.trim();
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  message: string,
): string | null | undefined {
  if (!(key in source) || source[key] === undefined) return undefined;
  if (source[key] === null) return null;
  return requiredString(source[key], message);
}

function optionalJson(source: Record<string, unknown>, key: string): unknown {
  if (!(key in source) || source[key] === undefined) return undefined;
  return source[key] ?? null;
}

function normalizeLog(payload: unknown): AuditLogRecord {
  if (!isRecord(payload)) invalid('Backend returned an invalid audit log response.');
  return {
    id: requiredString(payload.id, 'Backend returned an invalid audit log response.'),
    actorUserId:
      optionalString(payload, 'actorUserId', 'Backend returned an invalid audit log response.') ?? null,
    actorRole:
      optionalString(payload, 'actorRole', 'Backend returned an invalid audit log response.') ?? null,
    action: requiredString(payload.action, 'Backend returned an invalid audit log response.'),
    resourceType: requiredString(
      payload.resourceType,
      'Backend returned an invalid audit log response.',
    ),
    resourceId:
      optionalString(payload, 'resourceId', 'Backend returned an invalid audit log response.') ?? null,
    before: optionalJson(payload, 'before') ?? null,
    after: optionalJson(payload, 'after') ?? null,
    ip: optionalString(payload, 'ip', 'Backend returned an invalid audit log response.') ?? null,
    userAgent:
      optionalString(payload, 'userAgent', 'Backend returned an invalid audit log response.') ?? null,
    createdAt: requiredString(payload.createdAt, 'Backend returned an invalid audit log response.'),
  };
}

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
  if (!isRecord(payload)) invalid('Backend returned an invalid audit log pagination meta.');
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
    invalid('Backend returned an invalid audit log pagination meta.');
  }
  return { page, limit, total, totalPages } as PaginationMeta;
}

function normalizeQuery(query: AuditLogQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (query.page !== undefined) params.page = query.page;
  if (query.limit !== undefined) params.limit = query.limit;
  if (query.resourceType !== undefined && query.resourceType.trim() !== '') {
    params.resourceType = query.resourceType.trim();
  }
  if (query.actorUserId !== undefined && query.actorUserId.trim() !== '') {
    params.actorUserId = query.actorUserId.trim();
  }
  if (query.action !== undefined && query.action.trim() !== '') {
    params.action = query.action.trim();
  }
  return params;
}

function assertId(id: string): string {
  return requiredString(id, 'An audit log id is required.');
}

export const auditLogsApi = {
  async listLogs(query: AuditLogQuery = {}): Promise<AuditLogListResponse> {
    const response = await apiClient.get<unknown>('/admin/audit-logs', {
      params: normalizeQuery(query),
    });
    const envelope = unwrapEnvelope(
      response.data,
      'Backend returned an invalid audit log list response.',
    );
    if (!Array.isArray(envelope.data) || envelope.meta === undefined) {
      invalid('Backend returned an invalid audit log list response.');
    }
    return {
      data: envelope.data.map(normalizeLog),
      meta: normalizePagination(envelope.meta),
    };
  },

  async getLog(id: string): Promise<AuditLogRecord> {
    const response = await apiClient.get<unknown>(
      `/admin/audit-logs/${encodeURIComponent(assertId(id))}`,
    );
    const envelope = unwrapEnvelope(
      response.data,
      'Backend returned an invalid audit log detail response.',
    );
    return normalizeLog(envelope.data);
  },
};
