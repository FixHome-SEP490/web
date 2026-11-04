import type { WarehouseAllocation } from '../api/part-requests.api';

export function canAccessWarehouseConsole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SERVICE_MANAGER';
}

export function canAdministerWarehouse(role: string | null | undefined): boolean {
  return role === 'ADMIN';
}

export function canTechnicianAcknowledgeWarehousePickup(allocation: WarehouseAllocation | null | undefined): boolean {
  return allocation?.mode === 'warehouse' && allocation.status === 'handed_over';
}

export function canConfirmWarehouseHandover(
  role: string | null | undefined,
  userId: string | null | undefined,
  allocation: WarehouseAllocation | null | undefined,
): boolean {
  return role === 'SERVICE_MANAGER'
    && !!userId
    && allocation?.mode === 'warehouse'
    && allocation.status === 'ready'
    && allocation.responsibleUserId === userId;
}

export function warehouseQrAction(status: WarehouseAllocation['status']): 'prepare' | 'reissue' | null {
  if (status === 'reserved' || status === 'ready') return 'prepare';
  if (status === 'handed_over') return 'reissue';
  return null;
}

export function warehouseReturnAccepted(mode: string | null | undefined, managerAcceptedQty: number): boolean {
  return mode === 'warehouse' && Number.isInteger(managerAcceptedQty) && managerAcceptedQty > 0;
}
