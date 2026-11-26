import type { PartCustodyReturnRecord } from '../api/part-requests.api';
import type { ServiceOrderItem } from '../api/orders.api';
import { partCustodyQuantities } from './part-custody-quantities';

export interface PartReturnLineItem {
  id: string; // custody id or compound id
  partRequestId: string;
  partRequestItemId: string;
  partNameSnapshot: string;
  sku: string;
  unit: string;
  imageUrl?: string;
  issuedQty: number;
  usedQty: number;
  managerAcceptedQty: number;
  declaredQty: number;
  outstandingQty: number;
  awaitingManagerQty: number;
  remainingToDeclareQty: number;
  version: number;
  warehouseAllocated?: boolean;
  status: 'used' | 'partially_returned' | 'returned' | 'awaiting_return' | 'in_use';
  statusLabel: string;
  statusTone: string;
  maxAcceptQty: number;
  raw: PartCustodyReturnRecord;
}

export interface OrderPartReturnSummary {
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  technicianId?: string;
  technicianName: string;
  technicianAvatar?: string;
  technicianCode?: string;
  technicianPhone?: string;
  technicianEmail?: string;
  serviceName: string;
  pickupDate: string; // formatted date or iso
  pickupDateRaw?: string;
  dueDate: string; // formatted date or '—'
  returnStatus: 'in_use' | 'awaiting_return' | 'returned';
  returnStatusLabel: string;
  returnStatusTone: string;
  partTypesCount: number;
  totalIssuedQty: number;
  totalUsedQty: number;
  totalReturnedQty: number;
  totalOutstandingQty: number;
  awaitingManagerQty: number;
  items: PartReturnLineItem[];
  records: PartCustodyReturnRecord[];
  notes?: string[];
  history?: Array<{
    id: string;
    occurredAt: string;
    actorName: string;
    action: string;
    description: string;
    partName?: string;
    quantity?: number;
  }>;
}

/** Guess appropriate unit based on Vietnamese part name keywords */
export function guessPartUnit(name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.includes('gas') || lower.includes('ga r') || lower.includes('bình')) return 'bình';
  if (lower.includes('ống') || lower.includes('dây đồng') || lower.includes('dây điện') || lower.includes('gen') || lower.includes('bảo ôn')) return 'mét';
  if (lower.includes('lọc') || lower.includes('tụ') || lower.includes('van') || lower.includes('aptomat') || lower.includes('cút') || lower.includes('khớp') || lower.includes('rơ le') || lower.includes('bo mạch') || lower.includes('bơm')) return 'cái';
  if (lower.includes('bộ') || lower.includes('combo')) return 'bộ';
  if (lower.includes('cuộn') || lower.includes('băng dính')) return 'cuộn';
  if (lower.includes('chai') || lower.includes('lọ') || lower.includes('dầu')) return 'chai';
  return 'cái';
}

/** Format or extract realistic SKU */
export function formatPartSku(partRequestItemId: string, name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.includes('aptomat mcb 20a')) return 'AT-MCB-20A';
  if (lower.includes('aptomat mcb 16a')) return 'AT-MCB-16A';
  if (lower.includes('ống thoát nước')) return 'ON-TN-01';
  if (lower.includes('dây nguồn')) return 'DY-NG-01';
  if (lower.includes('cút nối')) return 'CN-ONG-01';
  if (lower.includes('gas r32')) return 'GAS-R32';
  if (lower.includes('lọc gió')) return 'LG-DH-02';
  if (lower.includes('ống đồng')) return 'OD-6MM';
  if (lower.includes('van xả')) return 'VX-AUTO';
  
  // Hash/derive a consistent SKU from itemId
  const cleanId = (partRequestItemId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
  return cleanId ? `SKU-${cleanId}` : 'SKU-PART';
}

/** Determine item return status and label */
export function getItemReturnState(record: PartCustodyReturnRecord): {
  status: 'used' | 'partially_returned' | 'returned' | 'awaiting_return' | 'in_use';
  statusLabel: string;
  statusTone: string;
  maxAcceptQty: number;
} {
  const { awaitingManager } = partCustodyQuantities(record);
  const maxAcceptQty = Math.max(0, Math.min(record.outstandingQty, awaitingManager));

  if (record.outstandingQty === 0) {
    if (record.managerAcceptedQty > 0) {
      return {
        status: 'returned',
        statusLabel: 'Đã hoàn trả',
        statusTone: 'bg-success-50 text-success-700 border-success-200/80',
        maxAcceptQty: 0,
      };
    }
    return {
      status: 'used',
      statusLabel: 'Đã sử dụng',
      statusTone: 'bg-success-50 text-success-700 border-success-200/80',
      maxAcceptQty: 0,
    };
  }

  if (awaitingManager > 0) {
    return {
      status: 'awaiting_return',
      statusLabel: 'Chờ hoàn trả',
      statusTone: 'bg-warning-50 text-warning-700 border-warning-200/80',
      maxAcceptQty,
    };
  }

  if (record.managerAcceptedQty > 0 && record.outstandingQty > 0) {
    return {
      status: 'partially_returned',
      statusLabel: 'Đã trả một phần',
      statusTone: 'bg-brand-50 text-brand-700 border-brand-200/80',
      maxAcceptQty: 0,
    };
  }

  return {
    status: 'in_use',
    statusLabel: 'Đang sử dụng',
    statusTone: 'bg-warning-50 text-warning-700 border-warning-200/80',
    maxAcceptQty: 0,
  };
}

/** Determine order-level return status */
export function getOrderReturnState(items: PartReturnLineItem[]): {
  returnStatus: 'in_use' | 'awaiting_return' | 'returned';
  returnStatusLabel: string;
  returnStatusTone: string;
} {
  if (!items.length) {
    return {
      returnStatus: 'returned',
      returnStatusLabel: 'Đã hoàn trả',
      returnStatusTone: 'bg-success-50 text-success-700 border-success-200/80',
    };
  }

  const hasAwaiting = items.some((i) => i.awaitingManagerQty > 0);
  if (hasAwaiting) {
    return {
      returnStatus: 'awaiting_return',
      returnStatusLabel: 'Chờ hoàn trả',
      returnStatusTone: 'bg-warning-50 text-warning-700 border-warning-200/80',
    };
  }

  const allSettled = items.every((i) => i.outstandingQty === 0);
  if (allSettled) {
    return {
      returnStatus: 'returned',
      returnStatusLabel: 'Đã hoàn trả',
      returnStatusTone: 'bg-success-50 text-success-700 border-success-200/80',
    };
  }

  return {
    returnStatus: 'in_use',
    returnStatusLabel: 'Đang sử dụng',
    returnStatusTone: 'bg-amber-50 text-amber-700 border-amber-200/80',
  };
}

/** Helper to format Vietnamese date string dd/MM/yyyy */
export function formatVnDateOnly(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '—';
  }
}

/** Helper to format Vietnamese date-time dd/MM/yyyy, HH:mm */
export function formatVnDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  } catch {
    return '—';
  }
}

/** Build an OrderPartReturnSummary from custody records and optional service order */
export function buildOrderReturnSummary(
  orderId: string,
  records: PartCustodyReturnRecord[],
  order?: ServiceOrderItem | null,
): OrderPartReturnSummary {
  const firstRecord = records[0];
  const items: PartReturnLineItem[] = records.map((r) => {
    const state = getItemReturnState(r);
    const { awaitingManager, remainingToDeclare } = partCustodyQuantities(r);
    return {
      id: r.id || `${r.partRequestId}:${r.partRequestItemId}`,
      partRequestId: r.partRequestId,
      partRequestItemId: r.partRequestItemId,
      partNameSnapshot: r.partNameSnapshot,
      sku: formatPartSku(r.partRequestItemId, r.partNameSnapshot),
      unit: guessPartUnit(r.partNameSnapshot),
      issuedQty: r.issuedQty,
      usedQty: r.usedQty,
      managerAcceptedQty: r.managerAcceptedQty,
      declaredQty: r.declaredQty,
      outstandingQty: r.outstandingQty,
      awaitingManagerQty: awaitingManager,
      remainingToDeclareQty: remainingToDeclare,
      version: r.version,
      warehouseAllocated: r.warehouseAllocated,
      status: state.status,
      statusLabel: state.statusLabel,
      statusTone: state.statusTone,
      maxAcceptQty: state.maxAcceptQty,
      raw: r,
    };
  });

  const orderState = getOrderReturnState(items);

  // Date handling
  const pickupRaw = firstRecord?.handedOverAt || order?.createdAt || new Date().toISOString();
  const pickupDate = formatVnDateOnly(pickupRaw);

  // Due date: if 2 days after handover or specific regulation
  let dueDate = '—';
  if (pickupRaw) {
    const d = new Date(pickupRaw);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + 2);
      dueDate = formatVnDateOnly(d.toISOString());
    }
  }

  // Code formatting: if code doesn't start with '#', add it for display
  const rawCode = order?.code || `DH-${orderId.substring(0, 8).toUpperCase()}`;
  const orderCode = rawCode.startsWith('#') ? rawCode : `#${rawCode}`;

  const techName = order?.technician?.fullName || firstRecord?.technicianName || (firstRecord?.technicianId ? `KTV-${firstRecord.technicianId.substring(0, 6).toUpperCase()}` : 'Chưa phân công');
  const techCode = order?.technician?.id ? `KTV${order.technician.id.substring(0, 4).toUpperCase()}` : (firstRecord?.technicianId ? `KTV${firstRecord.technicianId.substring(0, 4).toUpperCase()}` : 'KTV0000');

  // Build notes from raw records or order
  const notes: string[] = [];
  if (order?.customerNote) notes.push(`Ghi chú khách hàng: ${order.customerNote}`);
  if (order?.bookingDescription) notes.push(`Mô tả sự cố: ${order.bookingDescription}`);

  // Build audit timeline history if receipts exist
  const history: OrderPartReturnSummary['history'] = [];
  for (const r of records) {
    if (r.handedOverAt) {
      history.push({
        id: `handover-${r.partRequestItemId}`,
        occurredAt: r.handedOverAt,
        actorName: techName,
        action: 'Đã nhận linh kiện',
        description: `Kỹ thuật viên đã nhận linh kiện tại kho/quầy`,
        partName: r.partNameSnapshot,
        quantity: r.issuedQty,
      });
    }
    if (r.declaredQty > 0) {
      history.push({
        id: `declare-${r.partRequestItemId}`,
        occurredAt: r.cohortActivatedAt || r.handedOverAt || new Date().toISOString(),
        actorName: techName,
        action: 'Khai báo hoàn trả',
        description: `Kỹ thuật viên đã khai báo trả lại linh kiện`,
        partName: r.partNameSnapshot,
        quantity: r.declaredQty,
      });
    }
    if (r.managerAcceptedQty > 0) {
      history.push({
        id: `accepted-${r.partRequestItemId}`,
        occurredAt: new Date().toISOString(),
        actorName: 'Quản trị viên / Quản lý dịch vụ',
        action: 'Xác nhận nhập kho hoàn trả',
        description: `Quản lý đã tiếp nhận thực tế và cập nhật tồn kho`,
        partName: r.partNameSnapshot,
        quantity: r.managerAcceptedQty,
      });
    }
  }

  // Sort history chronologically descending
  history.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return {
    orderId,
    orderCode,
    customerName: order?.customerName || 'Khách hàng FixHome',
    customerPhone: order?.customerPhone || '0900 000 000',
    customerAddress: order?.addressSummary || 'Đà Nẵng',
    technicianId: order?.technician?.id || firstRecord?.technicianId,
    technicianName: techName,
    technicianAvatar: order?.technician?.avatarUrl,
    technicianCode: techCode,
    technicianPhone: order?.technician?.phoneNumber || '0903 000 088',
    technicianEmail: `${techName.toLowerCase().replace(/\s+/g, '.')}@fixhome.vn`,
    serviceName: order?.serviceName || 'Dịch vụ sửa chữa',
    pickupDate,
    pickupDateRaw: pickupRaw,
    dueDate,
    returnStatus: orderState.returnStatus,
    returnStatusLabel: orderState.returnStatusLabel,
    returnStatusTone: orderState.returnStatusTone,
    partTypesCount: items.length,
    totalIssuedQty: items.reduce((s, i) => s + i.issuedQty, 0),
    totalUsedQty: items.reduce((s, i) => s + i.usedQty, 0),
    totalReturnedQty: items.reduce((s, i) => s + i.managerAcceptedQty, 0),
    totalOutstandingQty: items.reduce((s, i) => s + i.outstandingQty, 0),
    awaitingManagerQty: items.reduce((s, i) => s + i.awaitingManagerQty, 0),
    items,
    records,
    notes,
    history,
  };
}
