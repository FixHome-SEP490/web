// Màn trạng thái sau khi thợ nộp hồ sơ, theo `reviewStage` backend tính (cùng chữ với bản mobile).
import type { OnboardingStatusResponse } from '../../types/technician-onboarding.types';

export interface StageView {
  title: string;
  body: string;
  tone: 'warning' | 'primary' | 'success' | 'danger';
  /** `visit`: mở trang đặt lịch; `call`: gọi số hỗ trợ; `edit`: mở lại form để cập nhật. */
  action: 'visit' | 'call' | 'edit' | null;
  actionLabel: string;
}

const vn = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', ...opts }).format(new Date(iso));
/** `09:00 ngày 01/12/2026`, giờ Việt Nam (cùng bản mobile). */
export const formatVisitTime = (iso: string) =>
  `${vn(iso, { hour: '2-digit', minute: '2-digit', hour12: false })} ngày ${vn(iso, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

/** KYC bị từ chối (chỉ tính khi đã nộp): mở lại bước 1 và 2. */
export const isKycRejected = (s: Pick<OnboardingStatusResponse, 'kycSubmitted' | 'verificationStatus'> | null | undefined) =>
  !!s?.kycSubmitted && s.verificationStatus?.toLowerCase() === 'rejected';

/** Nhãn KYC theo trạng thái thật, không ghi "Đã sẵn sàng" cho mọi trường hợp. */
export function kycSummaryLabel(s: Pick<OnboardingStatusResponse, 'kycSubmitted' | 'verificationStatus'> | null | undefined): string {
  if (!s?.kycSubmitted) return 'Chưa nộp hồ sơ';
  switch (s.verificationStatus?.toLowerCase()) {
    case 'rejected': return 'Cần cập nhật';
    case 'verified': return 'Đã xác minh danh tính';
    case 'pending': return 'Đang chờ duyệt';
    default: return 'Đã nộp hồ sơ';
  }
}

/** Nội dung màn trạng thái; null khi backend cũ chưa trả `reviewStage` (giữ màn chờ chung). */
export function stageView(s: OnboardingStatusResponse | null | undefined): StageView | null {
  if (!s) return null;
  if (isKycRejected(s)) {
    return {
      title: 'Hồ sơ xác minh cần cập nhật',
      body: s.rejectionReason || 'Trạng thái xác minh đã bị từ chối. Vui lòng cập nhật ảnh xác minh và gửi lại.',
      tone: 'danger', action: 'edit', actionLabel: 'Cập nhật hồ sơ xác minh',
    };
  }
  switch (s.reviewStage) {
    case 'visit_required':
      return {
        title: 'Đặt lịch lên trụ sở',
        body: 'Danh tính của bạn đã được xác nhận. Hãy chọn trụ sở và giờ lên gặp, nhớ mang bản công chứng bằng cấp để FixHome duyệt hồ sơ.',
        tone: 'primary', action: 'visit', actionLabel: 'Chọn trụ sở và giờ hẹn',
      };
    case 'visit_scheduled': {
      const v = s.officeVisit;
      return {
        title: 'Bạn đã có lịch hẹn',
        body: v
          ? `${formatVisitTime(v.scheduledAt)} tại ${v.officeName} (${v.officeAddress}). Vui lòng mang bản công chứng bằng cấp.`
          : 'Vui lòng đến trụ sở đúng giờ hẹn và mang bản công chứng bằng cấp.',
        tone: 'success', action: 'visit', actionLabel: 'Xem hoặc đổi lịch hẹn',
      };
    }
    case 'visit_blocked':
      return {
        title: 'Cần liên hệ quản lý dịch vụ',
        body: s.supportPhone
          ? `Bạn đã vắng buổi hẹn nhiều lần. Vui lòng liên hệ quản lý dịch vụ qua số ${s.supportPhone} để được hỗ trợ.`
          : 'Bạn đã vắng buổi hẹn nhiều lần. Vui lòng liên hệ quản lý dịch vụ để được hỗ trợ.',
        tone: 'danger', action: s.supportPhone ? 'call' : null, actionLabel: s.supportPhone ? `Gọi ${s.supportPhone}` : '',
      };
    case 'profile_rejected':
      return {
        title: 'Hồ sơ chưa được duyệt',
        body: s.profileRejectionReason || 'FixHome chưa duyệt hồ sơ của bạn. Vui lòng liên hệ trụ sở để biết thêm chi tiết.',
        tone: 'danger', action: 'edit', actionLabel: 'Cập nhật hồ sơ',
      };
    case 'profile_review':
      return {
        title: 'Đang chờ xét duyệt',
        body: 'Bạn đã gặp FixHome. Hồ sơ và bằng cấp đang được duyệt, bạn sẽ nhận thông báo khi có kết quả.',
        tone: 'warning', action: null, actionLabel: '',
      };
    case 'identity_review':
      return {
        title: 'Đang chờ xét duyệt',
        body: 'Hồ sơ của bạn đã được tiếp nhận. FixHome đang xác nhận danh tính, bạn sẽ nhận thông báo để đặt lịch lên trụ sở.',
        tone: 'warning', action: null, actionLabel: '',
      };
    default:
      return null;
  }
}
