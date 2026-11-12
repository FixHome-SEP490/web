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

/** Whether the request can still get a warehouse pickup or receipt code: not once it is closed or for warranty parts. */
export function warehouseQrOpen(status: string | null | undefined, requestType: string | null | undefined): boolean {
  const state = String(status ?? '').toLowerCase();
  return state !== 'cancelled' && state !== 'completed' && String(requestType ?? '').toLowerCase() !== 'warranty';
}

export function warehouseQrAction(status: WarehouseAllocation['status']): 'prepare' | 'reissue' | null {
  if (status === 'reserved' || status === 'ready') return 'prepare';
  if (status === 'handed_over') return 'reissue';
  return null;
}

export function warehouseReturnAccepted(mode: string | null | undefined, managerAcceptedQty: number): boolean {
  return mode === 'warehouse' && Number.isInteger(managerAcceptedQty) && managerAcceptedQty > 0;
}

/** Which on-screen slot a token from the warehouse-qr endpoint belongs to: after handover it is the technician's receipt code, never a pickup code. */
export function warehouseIssuedTokenSlot(status: WarehouseAllocation['status'] | null | undefined): 'pickup' | 'receipt' {
  return status === 'handed_over' ? 'receipt' : 'pickup';
}
