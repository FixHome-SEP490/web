import type { FaultyPartStatus } from '../api/part-requests.api';
import { formatDateTimeVN } from './formatters';

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

/**
 * The same states told from the technician's side: what the customer sees as "sent" is, for the
 * technician, a claim waiting for them to take it.
 */
const technicianLabels: Partial<Record<WarrantyClaimStatus, { label: string; tone: ClaimTone }>> = {
  submitted: { label: 'Chờ bạn nhận', tone: 'warning' },
  accepted: { label: 'Bạn đã nhận', tone: 'info' },
  inspected: { label: 'Chờ quản lý dịch vụ duyệt', tone: 'warning' },
  awaiting_customer: { label: 'Chờ khách phản hồi', tone: 'warning' },
};

export function technicianClaimDisplayMeta(claim: {
  status: string;
  customerResponse?: 'agreed' | 'disputed' | null;
}): { label: string; tone: ClaimTone } {
  // An agreed claim keeps its own label: it waits for the manager, not for the customer.
  if (claim.status === 'awaiting_customer' && claim.customerResponse === 'agreed') return claimDisplayMeta(claim);
  return (isKnownClaimStatus(claim.status) && technicianLabels[claim.status]) || claimDisplayMeta(claim);
}

/**
 * One label for the service manager: what the claim is waiting for, which is also what they can do
 * about it. "Sent" is the customer's word; for a manager it is waiting for a technician.
 */
export function managerClaimDisplayMeta(claim: {
  status: string;
  customerResponse?: 'agreed' | 'disputed' | null;
  technician?: unknown;
  declineReview?: 'pending' | 'valid' | 'invalid' | null;
  noShowFlaggedAt?: string | null;
  outcomeCode?: 'fixed' | 'unfixed' | 'rejected' | null;
}): { label: string; tone: ClaimTone } {
  if (claim.declineReview === 'pending') return { label: claim.noShowFlaggedAt ? 'Chờ xét không đến' : 'Chờ xét không phản hồi', tone: 'warning' };
  if (claim.outcomeCode === 'unfixed') return { label: 'Không khắc phục được, đã hoàn tiền', tone: 'neutral' };
  switch (claim.status) {
    case 'submitted': return claim.technician ? { label: 'Chờ kỹ thuật viên nhận', tone: 'info' } : { label: 'Kỹ thuật viên không còn hoạt động', tone: 'warning' };
    case 'accepted': return { label: 'Kỹ thuật viên đã nhận', tone: 'info' };
    case 'inspected': return { label: 'Chờ duyệt kết luận', tone: 'warning' };
    case 'awaiting_customer':
      return claim.customerResponse === 'agreed' ? { label: 'Khách đồng ý, chờ đóng', tone: 'info' } : { label: 'Chờ khách phản hồi', tone: 'warning' };
    case 'disputed': return { label: 'Khách phản đối, chờ xem xét', tone: 'warning' };
    default: return claimDisplayMeta(claim);
  }
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
  | 'third_party_repair'
  | 'force_majeure'
  | 'transport_damage'
  | 'other';

export const notCoveredReasonLabels: Record<NotCoveredReason, string> = {
  customer_misuse: 'Khách sử dụng sai cách',
  normal_wear: 'Hao mòn thông thường',
  other_component: 'Lỗi ở bộ phận khác, không phải linh kiện đã thay',
  not_workmanship_related: 'Không liên quan phần việc đã làm',
  expired: 'Đã hết hạn bảo hành',
  cannot_reproduce: 'Không tái hiện được lỗi',
  customer_unavailable: 'Khách vắng mặt hoặc không cho kiểm tra',
  third_party_repair: 'Người khác đã sửa hoặc vệ sinh sau đó',
  force_majeure: 'Thiên tai, cháy nổ, sét đánh',
  transport_damage: 'Hỏng khi vận chuyển',
  other: 'Lý do khác',
};

export type DeclineReason = 'busy' | 'on_leave' | 'out_of_area' | 'other';

export const declineReasonLabels: Record<DeclineReason, string> = {
  busy: 'Đang bận (quản lý dịch vụ xác nhận)',
  on_leave: 'Đang nghỉ (hệ thống kiểm tra)',
  out_of_area: 'Ngoài khu vực nhận việc (hệ thống kiểm tra)',
  other: 'Lý do khác (quản lý dịch vụ xác nhận)',
};

/** One faulty part line: where its units are. The same words everywhere a manager or technician reads it. */
export const faultyPartStatusLabels: Record<FaultyPartStatus, string> = {
  awaiting: 'Chờ nộp về kho',
  partial: 'Đã nhận một phần',
  received: 'Đã nhận, chờ gửi hãng',
  sent_to_manufacturer: 'Đã gửi hãng',
  manufacturer_accepted: 'Hãng chấp nhận, lỗi nhà sản xuất',
  manufacturer_rejected: 'Hãng từ chối, lỗi lắp đặt',
};

export type FaultyTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';
export const faultyPartStatusTones: Record<FaultyPartStatus, FaultyTone> = {
  awaiting: 'neutral', partial: 'warning', received: 'warning', sent_to_manufacturer: 'info',
  manufacturer_accepted: 'success', manufacturer_rejected: 'danger',
};

export const faultyToneClasses: Record<FaultyTone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  warning: 'bg-warning-50 text-warning-800',
  info: 'bg-info-50 text-info-600',
  success: 'bg-success-50 text-success-800',
  danger: 'bg-danger-50 text-danger-800',
};

type FaultyLine = { quantity: number; faultyStatus?: FaultyPartStatus | null; faultyReceivedQty?: number };

/** "Đã nhận 1/2": how many faulty units the warehouse counted in against what was handed out. */
export const faultyReceivedText = (line: FaultyLine) => `Đã nhận ${line.faultyReceivedQty ?? 0}/${line.quantity}`;

/** Lines the manager still has something to do with, for the stat tiles and the list filter. */
export const faultyBucket = (lines: FaultyLine[]): 'waiting' | 'partial' | 'to_ship' | 'at_manufacturer' | 'done' => {
  const statuses = lines.map((line) => line.faultyStatus ?? 'awaiting');
  if (statuses.some((status) => status === 'awaiting')) return 'waiting';
  if (statuses.some((status) => status === 'partial')) return 'partial';
  if (statuses.some((status) => status === 'received')) return 'to_ship';
  if (statuses.some((status) => status === 'sent_to_manufacturer')) return 'at_manufacturer';
  return 'done';
};

export const faultyInspectionLabels = {
  manufacturer: 'Lỗi nhà sản xuất, FixHome chịu',
  installation: 'Do lắp đặt, kỹ thuật viên trả tiền',
  undetermined: 'Không xác định, FixHome chịu',
} as const;

export const invoiceLineTypeLabels: Record<string, string> = { labor: 'Tiền công', parts_equipment: 'Linh kiện, vật tư' };
export const paymentStatusLabels: Record<string, string> = { paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán', refunded: 'Đã hoàn tiền' };
export const coverageStatusLabels: Record<string, string> = { active: 'Còn hạn', expired: 'Hết hạn', voided: 'Đã huỷ', pending: 'Chưa bắt đầu' };
export const visitStatusLabels: Record<string, string> = {
  scheduled: 'Đã hẹn', checked_in: 'Đã có mặt', inspected: 'Đã gửi kết luận', completed: 'Đã sửa xong', cancelled: 'Đã huỷ',
};

/** A decline or missed response a manager judges before it costs the technician reputation. */
export type DeclineReview = 'pending' | 'valid' | 'invalid';

export const declineReviewLabels: Record<DeclineReview, string> = {
  pending: 'Chờ quản lý dịch vụ xét',
  valid: 'Đã xét: hợp lệ',
  invalid: 'Đã xét: không hợp lệ',
};

export type ClaimOutcome = 'fixed' | 'unfixed' | 'rejected';

export const claimOutcomeLabels: Record<ClaimOutcome, string> = {
  fixed: 'Đã khắc phục',
  unfixed: 'Không khắc phục được, đã hoàn tiền',
  rejected: 'Không được bảo hành',
};

export type NextStep = { title: string; text: string; tone: ClaimTone; urgent: boolean };

/** What the customer should expect or do next, in one place for the card and the order summary. */
export function customerNextStep(claim: {
  status: string;
  customerResponse?: 'agreed' | 'disputed' | null;
  awaitingPrompt?: 'conclusion' | 'completion' | null;
  inspectionScheduledAt?: string | null;
}): NextStep {
  const step = (title: string, text: string, tone: ClaimTone, urgent = false): NextStep => ({ title, text, tone, urgent });
  switch (claim.status) {
    case 'submitted':
      return step('Chờ kỹ thuật viên nhận', 'Kỹ thuật viên sẽ nhận yêu cầu và hẹn lịch kiểm tra với bạn.', 'info');
    case 'accepted':
      return step(
        'Chờ kỹ thuật viên đến kiểm tra',
        claim.inspectionScheduledAt ? `Lịch kiểm tra: ${formatDateTimeVN(claim.inspectionScheduledAt)}.` : 'Kỹ thuật viên sẽ liên hệ để hẹn lịch.',
        'info',
      );
    case 'inspected':
      return step('Chờ quản lý dịch vụ duyệt kết luận', 'Bạn sẽ được báo khi có kết luận.', 'warning');
    case 'in_progress':
      return step('Kỹ thuật viên đang bảo hành', 'Bạn sẽ được hỏi xác nhận khi kỹ thuật viên báo xong.', 'repair');
    case 'awaiting_customer':
      if (claim.customerResponse === 'agreed') return step('Chờ quản lý dịch vụ đóng yêu cầu', 'Bạn đã xác nhận, không cần làm thêm.', 'info');
      return claim.awaitingPrompt === 'completion'
        ? step('Cần bạn xác nhận lỗi đã khắc phục chưa', 'Kỹ thuật viên báo đã xử lý xong. Hãy kiểm tra và phản hồi.', 'warning', true)
        : step('Cần bạn phản hồi kết luận', 'Hãy xem kết luận kiểm tra bên dưới rồi đồng ý hoặc phản đối.', 'warning', true);
    case 'disputed':
      return step('Đang xem xét phản đối của bạn', 'Quản lý dịch vụ sẽ liên hệ khi có hướng xử lý.', 'info');
    case 'resolved':
      return step('Đã hoàn tất bảo hành', '', 'success');
    case 'rejected':
      return step('Yêu cầu không được bảo hành', '', 'neutral');
    default:
      return step('Trạng thái chưa xác định', '', 'neutral');
  }
}

type PartRequestLike = { status?: string | null; items?: { usageStatus?: string | null }[] | null } | null;

/** The free replacement part is still to be received, or received but not yet declared fitted or returned. */
export function claimPartsPending(claim: { partRequest?: PartRequestLike }): boolean {
  const request = claim.partRequest;
  if (!request || String(request.status).toLowerCase() === 'cancelled') return false;
  const received = ['received', 'completed'].includes(String(request.status).toLowerCase());
  return !received || !!request.items?.some((item) => item.usageStatus === 'pending');
}

/** What the technician should do next, or who the claim is waiting for. */
export function technicianNextStep(claim: {
  status: string;
  customerResponse?: 'agreed' | 'disputed' | null;
  visit?: { scheduledAt?: string | null; status?: string } | null;
  partRequest?: PartRequestLike;
}): NextStep {
  const step = (title: string, text: string, tone: ClaimTone, urgent = false): NextStep => ({ title, text, tone, urgent });
  switch (claim.status) {
    case 'submitted':
      return step('Nhận yêu cầu và hẹn lịch kiểm tra', 'Khách đang chờ bạn nhận.', 'warning', true);
    case 'accepted': {
      const when = claim.visit?.scheduledAt ? formatDateTimeVN(claim.visit.scheduledAt) : '';
      return claim.visit?.status === 'checked_in'
        ? step('Gửi kết luận kiểm tra', 'Bạn đã có mặt. Ghi kết quả kiểm tra để quản lý dịch vụ duyệt.', 'info', true)
        : step('Đến kiểm tra đúng lịch', when ? `Lịch kiểm tra: ${when}.` : 'Chưa có lịch kiểm tra.', 'info', true);
    }
    case 'in_progress':
      return claimPartsPending(claim)
        ? step('Nhận linh kiện thay thế', 'Nhận linh kiện, khai đã lắp hoặc trả lại, rồi mới báo xong.', 'warning', true)
        : step('Báo đã bảo hành xong', 'Sửa lại cho khách rồi báo để khách xác nhận.', 'repair', true);
    case 'inspected':
      return step('Chờ quản lý dịch vụ duyệt', 'Bạn chưa cần làm gì.', 'neutral');
    case 'awaiting_customer':
      return claim.customerResponse === 'agreed'
        ? step('Chờ quản lý dịch vụ đóng', 'Khách đã đồng ý.', 'neutral')
        : step('Chờ khách phản hồi', 'Bạn chưa cần làm gì.', 'neutral');
    case 'disputed':
      return step('Khách phản đối, chờ quản lý xem xét', 'Bạn chưa cần làm gì.', 'neutral');
    default:
      return step(technicianClaimDisplayMeta(claim).label, '', 'neutral');
  }
}
