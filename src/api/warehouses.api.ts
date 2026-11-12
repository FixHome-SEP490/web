import apiClient from './client';

export type WarehouseStatus = 'active' | 'inactive';
export type StockAdjustmentKind = 'stock_in' | 'correction';
/** Manual changes plus part request work (W2), read together since BUG DETECTOR 80. */
export type StockMovementKind = StockAdjustmentKind | 'reserve' | 'release' | 'issue' | 'return';
const MOVEMENT_KINDS: readonly StockMovementKind[] = ['stock_in', 'correction', 'reserve', 'release', 'issue', 'return'];

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  status: WarehouseStatus;
  responsibleUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehousePayload {
  name: string;
  address?: string;
  responsibleUserId: string;
}

export interface WarehouseUpdatePayload extends Partial<WarehousePayload> {
  status?: WarehouseStatus;
}

export interface WarehouseStockRow {
  warehouseId: string;
  partId: string;
  partName: string;
  sku: string | null;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
}

export interface StockMovement {
  id: string;
  warehouseId: string;
  partId: string;
  /** Null for a W2 movement the system made on its own. */
  actorUserId: string | null;
  kind: StockMovementKind;
  delta: number;
  reason: string;
  idempotencyKey: string;
  onHandAfter: number;
  reservedAfter: number;
  createdAt: string;
  /** The part request a W2 movement belongs to; null for manual changes. */
  partRequestId?: string | null;
}

export interface WarehousePage<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

export interface WarehousePageQuery {
  limit?: number;
  offset?: number;
  /** Stock of one SKU only (W-11), whatever page it sits on. */
  partId?: string;
}

export interface StockAdjustmentPayload {
  partId: string;
  delta: number;
  kind: StockAdjustmentKind;
  reason: string;
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseData(value: unknown): unknown {
  if (!isRecord(value) || value.success !== true || !('data' in value)) {
    throw new Error('Backend returned an invalid warehouse response envelope.');
  }
  return value.data;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Backend returned invalid warehouse ${field}.`);
  return value.trim();
}

function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Backend returned invalid warehouse ${field}.`);
  return parsed;
}

function normalizeWarehouse(value: unknown): Warehouse {
  if (!isRecord(value)) throw new Error('Backend returned an invalid warehouse response.');
  const status = value.status;
  if (status !== 'active' && status !== 'inactive') throw new Error('Backend returned an invalid warehouse status.');
  return {
    id: requiredString(value.id, 'id'),
    name: requiredString(value.name, 'name'),
    address: value.address == null ? null : String(value.address),
    status,
    responsibleUserId: requiredString(value.responsibleUserId, 'responsible user.'),
    createdAt: String(value.createdAt ?? ''),
    updatedAt: String(value.updatedAt ?? ''),
  };
}

function normalizeStock(value: unknown): WarehouseStockRow {
  if (!isRecord(value)) throw new Error('Backend returned an invalid warehouse stock response.');
  return {
    warehouseId: requiredString(value.warehouseId, 'stock warehouse id'),
    partId: requiredString(value.partId, 'stock part id'),
    partName: requiredString(value.partName, 'stock part name'),
    sku: value.sku == null ? null : String(value.sku),
    onHand: integer(value.onHand, 'on-hand quantity'),
    reserved: integer(value.reserved, 'reserved quantity'),
    available: integer(value.available, 'available quantity'),
    version: integer(value.version, 'stock version'),
  };
}

function normalizeMovement(value: unknown): StockMovement {
  if (!isRecord(value) || !MOVEMENT_KINDS.includes(value.kind as StockMovementKind)) {
    throw new Error('Backend returned an invalid stock movement response.');
  }
  return {
    id: requiredString(value.id, 'movement id'),
    warehouseId: requiredString(value.warehouseId, 'movement warehouse id'),
    partId: requiredString(value.partId, 'movement part id'),
    actorUserId: value.actorUserId == null ? null : requiredString(value.actorUserId, 'movement actor id'),
    kind: value.kind as StockMovementKind,
    delta: Number.isInteger(value.delta) ? Number(value.delta) : (() => { throw new Error('Backend returned an invalid stock movement delta.'); })(),
    reason: requiredString(value.reason, 'movement reason'),
    idempotencyKey: requiredString(value.idempotencyKey, 'movement idempotency key'),
    onHandAfter: integer(value.onHandAfter, 'movement on-hand quantity'),
    reservedAfter: integer(value.reservedAfter, 'movement reserved quantity'),
    createdAt: requiredString(value.createdAt, 'movement timestamp'),
    partRequestId: typeof value.partRequestId === 'string' ? value.partRequestId : null,
  };
}

function normalizePage<T>(value: unknown, normalize: (item: unknown) => T): WarehousePage<T> {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    throw new Error('Backend returned an invalid warehouse page.');
  }
  const { total, limit, offset } = value.meta;
  if (![total, limit, offset].every((item) => Number.isInteger(item) && Number(item) >= 0) || Number(limit) < 1) {
    throw new Error('Backend returned invalid warehouse pagination.');
  }
  return {
    data: value.data.map(normalize),
    meta: { total: Number(total), limit: Number(limit), offset: Number(offset) },
  };
}

export const warehousesApi = {
  async list(): Promise<Warehouse[]> {
    const response = await apiClient.get<unknown>('/warehouses');
    const data = responseData(response.data);
    if (!Array.isArray(data)) throw new Error('Backend returned an invalid warehouse list response.');
    return data.map(normalizeWarehouse);
  },

  async create(payload: WarehousePayload): Promise<Warehouse> {
    const response = await apiClient.post<unknown>('/warehouses', payload);
    return normalizeWarehouse(responseData(response.data));
  },

  async update(id: string, payload: WarehouseUpdatePayload): Promise<Warehouse> {
    const response = await apiClient.patch<unknown>(`/warehouses/${id}`, payload);
    return normalizeWarehouse(responseData(response.data));
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/warehouses/${id}`);
  },

  async getStock(id: string, query: WarehousePageQuery = {}): Promise<WarehousePage<WarehouseStockRow>> {
    const response = await apiClient.get<unknown>(`/warehouses/${id}/stock`, { params: query });
    return normalizePage(response.data, normalizeStock);
  },

  async getMovements(id: string, query: WarehousePageQuery = {}): Promise<WarehousePage<StockMovement>> {
    const response = await apiClient.get<unknown>(`/warehouses/${id}/movements`, { params: query });
    return normalizePage(response.data, normalizeMovement);
  },

  async adjustStock(id: string, payload: StockAdjustmentPayload): Promise<StockMovement> {
    if (!Number.isSafeInteger(payload.delta) || payload.delta === 0 || (payload.kind === 'stock_in' && payload.delta < 1)) {
      throw new Error('Số lượng điều chỉnh không hợp lệ.');
    }
    const response = await apiClient.post<unknown>(`/warehouses/${id}/stock-adjustments`, payload);
    return normalizeMovement(responseData(response.data));
  },
};
