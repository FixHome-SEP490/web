import apiClient from './client';
import type { PaginationMeta } from '../types';

export interface PlatformDueRecord {
  id: string;
  invoiceId: string;
  serviceOrderId: string;
  laborTotalSnapshot: number;
  fixHomePartsTotalSnapshot: number;
  commissionRateSnapshot: number;
  commissionAmountSnapshot: number;
  dueAmount: number;
  status: string;
  settledAt: string | null;
}

export interface PlatformDueQuery {
  page?: number;
  limit?: number;
  status?: string;
}

export interface PlatformDueListResponse {
  data: PlatformDueRecord[];
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

function finiteNumber(value: unknown, message: string): number {
  const numberValue =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) invalid(message);
  return numberValue;
}

function normalizeDue(payload: unknown): PlatformDueRecord {
  if (!isRecord(payload)) invalid('Backend returned an invalid platform due response.');
  return {
    id: requiredString(payload.id, 'Backend returned an invalid platform due response.'),
    invoiceId: requiredString(payload.invoiceId, 'Backend returned an invalid platform due response.'),
    serviceOrderId: requiredString(
      payload.serviceOrderId,
      'Backend returned an invalid platform due response.',
    ),
    laborTotalSnapshot: finiteNumber(
      payload.laborTotalSnapshot,
      'Backend returned an invalid platform due response.',
    ),
    fixHomePartsTotalSnapshot: finiteNumber(
      payload.fixHomePartsTotalSnapshot,
      'Backend returned an invalid platform due response.',
    ),
    commissionRateSnapshot: finiteNumber(
      payload.commissionRateSnapshot,
      'Backend returned an invalid platform due response.',
    ),
    commissionAmountSnapshot: finiteNumber(
      payload.commissionAmountSnapshot,
      'Backend returned an invalid platform due response.',
    ),
    dueAmount: finiteNumber(payload.dueAmount, 'Backend returned an invalid platform due response.'),
    status: requiredString(payload.status, 'Backend returned an invalid platform due response.'),
    settledAt: optionalString(payload, 'settledAt', 'Backend returned an invalid platform due response.') ?? null,
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
  if (!isRecord(payload)) invalid('Backend returned an invalid platform due pagination meta.');
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
    invalid('Backend returned an invalid platform due pagination meta.');
  }
  return { page, limit, total, totalPages } as PaginationMeta;
}

function normalizeQuery(query: PlatformDueQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (query.page !== undefined) params.page = query.page;
  if (query.limit !== undefined) params.limit = query.limit;
  if (query.status !== undefined && query.status.trim() !== '') params.status = query.status.trim();
  return params;
}

export const platformDuesApi = {
  async listDues(query: PlatformDueQuery = {}): Promise<PlatformDueListResponse> {
    const response = await apiClient.get<unknown>('/finance/platform-dues', {
      params: normalizeQuery(query),
    });
    const envelope = unwrapEnvelope(
      response.data,
      'Backend returned an invalid platform due list response.',
    );
    if (!Array.isArray(envelope.data) || envelope.meta === undefined) {
      invalid('Backend returned an invalid platform due list response.');
    }
    return {
      data: envelope.data.map(normalizeDue),
      meta: normalizePagination(envelope.meta),
    };
  },
};
