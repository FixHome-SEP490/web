interface PartLine {
  type: string;
  quantity: number;
  partSource?: string | null;
  partCatalogId?: string | null;
}
interface Approval { status: string; items: PartLine[] }

/** Display/input ceiling only. Backend remains authoritative for each use. */
export function technicianApprovedParts(base: Approval | null | undefined, extras: Approval[]): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const approval of [base, ...extras]) {
    if (!approval || !['APPROVED', 'ACCEPTED'].includes(approval.status.toUpperCase())) continue;
    for (const line of approval.items) {
      if (line.type.toUpperCase() === 'LABOR' || line.partSource !== 'fixhome' || !line.partCatalogId
        || !Number.isSafeInteger(line.quantity) || line.quantity < 1) continue;
      quantities[line.partCatalogId] = (quantities[line.partCatalogId] ?? 0) + line.quantity;
    }
  }
  return quantities;
}

interface StockItem { id: string; partCatalogId?: string | null; quantity: number }
interface Custody {
  partRequestItemId: string;
  issuedQty: number;
  usedQty: number;
  declaredQty: number;
  managerAcceptedQty: number;
}

export function technicianUsageLimit(item: StockItem, approvals: Record<string, number> | null,
  items: StockItem[], custody: Custody[]): number {
  if (!approvals || !item.partCatalogId) return 0;
  const record = custody.find(row => row.partRequestItemId === item.id);
  const sameSku = new Set(items.filter(row => row.id !== item.id && row.partCatalogId === item.partCatalogId).map(row => row.id));
  const otherUse = custody.filter(row => sameSku.has(row.partRequestItemId)).reduce((sum, row) => sum + row.usedQty, 0);
  // A declared return cannot subsequently be consumed; accepted is a subset of declared.
  const available = record ? record.issuedQty - Math.max(record.declaredQty, record.managerAcceptedQty) : item.quantity;
  return Math.max(0, Math.min(available, (approvals[item.partCatalogId] ?? 0) - otherUse));
}

export function technicianPreRepairLabel(requests: ReadonlyArray<{ requestType: string; status: string }> | null): string {
  if (requests === null) return 'Chưa kiểm tra được linh kiện';
  const active = requests.filter(row => row.requestType === 'pre_repair' && row.status !== 'cancelled');
  if (!active.length) return 'Chưa đặt linh kiện trước';
  const labels: Record<string, string> = { requested: 'Chờ kho chuẩn bị', ready: 'Sẵn sàng nhận', delivering: 'Đang giao', received: 'Đã nhận qua QR', completed: 'Đã xử lý' };
  return [...new Set(active.map(row => labels[row.status] ?? 'Chưa kiểm tra được linh kiện'))].join(' · ');
}
