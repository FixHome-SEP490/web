import type { SupportCaseType } from '../api/support-cases.api';

/** Mirrors the Backend policy for UX only; the Backend stays authoritative. */
export const COMPLAINT_WINDOW_DAYS = 7;

export const complaintTypeLabels: Record<SupportCaseType, string> = {
  matching_exhausted: 'Không tìm được kỹ thuật viên',
  arrival_abnormal: 'Kỹ thuật viên không đến hoặc đến trễ',
  cancellation_review: 'Tranh chấp về việc hủy đơn',
  parts_dispute: 'Tranh chấp về linh kiện',
  mid_job_interruption: 'Công việc bị gián đoạn giữa chừng',
  pricing_dispute: 'Tranh chấp về chi phí',
  property_damage: 'Hư hại hoặc mất tài sản',
  quality: 'Chất lượng sửa chữa chưa đạt',
  cash_mismatch: 'Số tiền mặt không khớp',
  conduct: 'Thái độ hoặc hành vi của kỹ thuật viên',
  other: 'Vấn đề khác',
  cash_non_response: 'Không phản hồi xác nhận tiền mặt',
  warranty_dispute: 'Tranh chấp bảo hành',
};

const CUSTOMER_TYPES: Record<string, SupportCaseType[]> = {
  ACCEPTED: ['arrival_abnormal', 'cancellation_review', 'conduct', 'other'],
  EN_ROUTE: ['arrival_abnormal', 'cancellation_review', 'conduct', 'other'],
  UNDER_REPAIR: [
    'mid_job_interruption',
    'parts_dispute',
    'pricing_dispute',
    'property_damage',
    'quality',
    'conduct',
    'other',
  ],
  COMPLETED: ['quality', 'property_damage', 'pricing_dispute', 'parts_dispute', 'cash_mismatch', 'conduct', 'other'],
  CANCELLED: ['cancellation_review', 'other'],
};

const TECHNICIAN_TYPES: Record<string, SupportCaseType[]> = {
  ACCEPTED: ['arrival_abnormal', 'conduct', 'other'],
  EN_ROUTE: ['arrival_abnormal', 'conduct', 'other'],
  UNDER_REPAIR: ['mid_job_interruption', 'parts_dispute', 'pricing_dispute', 'property_damage', 'conduct', 'other'],
  COMPLETED: ['cash_mismatch', 'conduct', 'other'],
  CANCELLED: ['cancellation_review', 'other'],
};

export type ComplaintRole = 'customer' | 'technician';

/** The technician describes the same case types from the other side of the job. */
const technicianLabelOverrides: Partial<Record<SupportCaseType, string>> = {
  arrival_abnormal: 'Khách hàng vắng mặt hoặc không thể tiếp cận',
  conduct: 'Thái độ hoặc hành vi của khách hàng',
};

export function complaintTypeLabel(type: SupportCaseType, role: ComplaintRole = 'customer'): string {
  return (role === 'technician' && technicianLabelOverrides[type]) || complaintTypeLabels[type];
}

export const ACTIVE_ORDER_STATUSES = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'];

export function isComplaintWindowOpen(
  orderStatus: string,
  completedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (orderStatus !== 'COMPLETED' || !completedAt) return true;
  const completed = new Date(completedAt).getTime();
  if (Number.isNaN(completed)) return true;
  return now.getTime() - completed <= COMPLAINT_WINDOW_DAYS * 86_400_000;
}

export function allowedComplaintTypes(
  orderStatus: string,
  completedAt?: string | null,
  now: Date = new Date(),
  role: ComplaintRole = 'customer',
): SupportCaseType[] {
  const status = orderStatus.toUpperCase();
  if (!isComplaintWindowOpen(status, completedAt, now)) return [];
  return (role === 'technician' ? TECHNICIAN_TYPES : CUSTOMER_TYPES)[status] ?? [];
}
