export type WarrantyClaimStatus =
  | 'submitted'
  | 'accepted'
  | 'inspected'
  | 'in_progress'
  | 'awaiting_customer'
  | 'disputed'
  | 'resolved'
  | 'rejected';

export type ClaimTone = 'info' | 'warning' | 'repair' | 'success' | 'neutral';

/** One label/tone per claim status, shared by every screen that shows a claim. */
export const warrantyClaimStatusMeta: Record<WarrantyClaimStatus, { label: string; tone: ClaimTone }> = {
  submitted: { label: 'Đã gửi yêu cầu', tone: 'info' },
  accepted: { label: 'Kỹ thuật viên đã nhận', tone: 'info' },
  // Same label for everyone: the customer never sees the raw result before the manager approves it.
  inspected: { label: 'Chờ quản lý dịch vụ duyệt', tone: 'warning' },
  in_progress: { label: 'Đang bảo hành', tone: 'repair' },
  awaiting_customer: { label: 'Chờ khách hàng phản hồi', tone: 'warning' },
  disputed: { label: 'Đang xem xét phản đối', tone: 'info' },
  resolved: { label: 'Đã hoàn tất bảo hành', tone: 'success' },
  rejected: { label: 'Không được bảo hành', tone: 'neutral' },
};

export const warrantyClaimToneClasses: Record<ClaimTone, string> = {
  info: 'bg-info-50 text-info-600',
  warning: 'bg-warning-50 text-warning-600',
  repair: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-600',
  neutral: 'bg-ink-100 text-ink-600',
};

const CLOSED_STATUSES: WarrantyClaimStatus[] = ['resolved', 'rejected'];

export function isKnownClaimStatus(value: string): value is WarrantyClaimStatus {
  return value in warrantyClaimStatusMeta;
}

export function isOpenClaim(status: string): boolean {
  return isKnownClaimStatus(status) && !CLOSED_STATUSES.includes(status);
}

export function claimStatusMeta(status: string): { label: string; tone: ClaimTone } {
  return isKnownClaimStatus(status)
    ? warrantyClaimStatusMeta[status]
    : { label: 'Trạng thái chưa xác định', tone: 'neutral' };
}

/** One label per claim: once the customer agreed, "waiting for the customer" would contradict the facts. */
export function claimDisplayMeta(claim: {
  status: string;
  customerResponse?: 'agreed' | 'disputed' | null;
}): { label: string; tone: ClaimTone } {
  if (claim.status === 'awaiting_customer' && claim.customerResponse === 'agreed') {
    return { label: 'Đã đồng ý, chờ quản lý dịch vụ đóng', tone: 'info' };
  }
  return claimStatusMeta(claim.status);
}

export type InspectionResult = 'covered_workmanship' | 'covered_part' | 'not_covered';

export const inspectionResultLabels: Record<InspectionResult, string> = {
  covered_workmanship: 'Được bảo hành: lỗi do công sửa chữa',
  covered_part: 'Được bảo hành: lỗi do linh kiện đã thay',
  not_covered: 'Không được bảo hành',
};

export type NotCoveredReason =
  | 'customer_misuse'
  | 'normal_wear'
  | 'other_component'
  | 'not_workmanship_related'
  | 'expired'
  | 'cannot_reproduce'
  | 'customer_unavailable'
  | 'other';

export const notCoveredReasonLabels: Record<NotCoveredReason, string> = {
  customer_misuse: 'Khách sử dụng sai cách',
  normal_wear: 'Hao mòn thông thường',
  other_component: 'Lỗi ở bộ phận khác, không phải linh kiện đã thay',
  not_workmanship_related: 'Không liên quan phần việc đã làm',
  expired: 'Đã hết hạn bảo hành',
  cannot_reproduce: 'Không tái hiện được lỗi',
  customer_unavailable: 'Khách vắng mặt hoặc không cho kiểm tra',
  other: 'Lý do khác',
};

export type DeclineReason = 'busy' | 'on_leave' | 'out_of_area' | 'other';

export const declineReasonLabels: Record<DeclineReason, string> = {
  busy: 'Đang bận',
  on_leave: 'Đang nghỉ',
  out_of_area: 'Ngoài khu vực nhận việc',
  other: 'Lý do khác',
};
