import type { SupportCaseStatus, SupportCaseType } from '../../api/support-cases.api';
import { userFacingError } from '../../utils/user-facing-error';
import { vnDateTimeString } from '../../utils/vn-time';

export const supportCaseTypeLabels: Record<SupportCaseType, string> = {
  matching_exhausted: 'Cạn ứng viên matching',
  arrival_abnormal: 'Bất thường khi đến nơi',
  cash_non_response: 'Không phản hồi tiền mặt',
  cash_mismatch: 'Lệch đối soát tiền mặt',
  cancellation_review: 'Rà soát huỷ đơn',
  parts_dispute: 'Tranh chấp phụ tùng',
  warranty_dispute: 'Tranh chấp bảo hành',
  mid_job_interruption: 'Gián đoạn giữa ca sửa',
  property_damage: 'Hư hại hoặc mất tài sản',
  quality: 'Chất lượng sửa chữa',
  pricing_dispute: 'Tranh chấp chi phí',
  conduct: 'Thái độ hoặc hành vi',
  other: 'Trường hợp khác',
};

export const supportCaseStatusLabels: Record<SupportCaseStatus, string> = {
  open: 'Mở',
  in_review: 'Đang rà soát',
  resolved: 'Đã giải quyết',
  rejected: 'Đã từ chối',
};

export const resolutionCodeLabels: Record<string, string> = {
  no_action: 'Không cần xử lý thêm',
  warning_issued: 'Cảnh cáo',
  worker_reassigned: 'Đổi kỹ thuật viên',
  order_cancelled_no_fee: 'Hủy đơn không thu phí',
  price_adjusted: 'Điều chỉnh chi phí',
  refund_recorded: 'Ghi nhận hoàn tiền',
  escalate_admin: 'Chuyển quản trị viên',
  warranty_upheld: 'Giữ nguyên kết luận bảo hành',
  warranty_overturned: 'Đảo kết luận bảo hành',
};

export const RESOLUTION_CODES = Object.keys(resolutionCodeLabels);

/**
 * Cash disputes: the backend settles the cash (invoice paid, platform fee,
 * order completion) only for this exact code; any other code just closes the
 * case. Keep it a choice, never free text.
 */
export const CASH_CONFIRMED_BY_MANAGER = 'CASH_SETTLEMENT_CONFIRMED_BY_MANAGER';
export const cashResolutionCodeLabels: Record<string, string> = {
  [CASH_CONFIRMED_BY_MANAGER]: 'Xác nhận khách đã trả đủ tiền mặt theo hoá đơn',
  no_action: 'Đóng case, không chốt tiền mặt',
};

export const liablePartyLabels: Record<string, string> = {
  technician: 'Kỹ thuật viên',
  customer: 'Khách hàng',
  platform: 'Nền tảng',
  shared: 'Chia sẻ trách nhiệm',
};

/** A case still waiting for the manager after the promised response time. */
export function isResponseOverdue(
  status: SupportCaseStatus,
  respondBy: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!respondBy || (status !== 'open' && status !== 'in_review')) return false;
  const deadline = new Date(respondBy).getTime();
  return !Number.isNaN(deadline) && deadline < now.getTime();
}

export function isCashCase(caseType: SupportCaseType): boolean {
  return caseType === 'cash_non_response' || caseType === 'cash_mismatch';
}

export function formatSupportDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : vnDateTimeString(date);
}

export function getSupportErrorMessage(reason: unknown, fallback: string): string {
  return userFacingError(reason, fallback);
}

export function isSafeEvidenceLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
