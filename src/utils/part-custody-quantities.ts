import type { PartCustodyReturnRecord } from '../api/part-requests.api';

/** Presentation of a server ledger row; declaring does not end physical custody. */
export function partCustodyQuantities(record: PartCustodyReturnRecord) {
  const awaitingManager = Math.max(0, record.declaredQty - record.managerAcceptedQty);
  return {
    awaitingManager,
    remainingToDeclare: Math.max(0, record.outstandingQty - awaitingManager),
  };
}
