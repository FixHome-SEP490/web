// Labels of a technician check-in face review in the console (PO 20/11/2026).
import type { CheckinFaceReviewStatus } from '../../api/checkin-face-reviews.api';

const PILLS: Record<CheckinFaceReviewStatus, { status: string; label: string }> = {
  pending: { status: 'PENDING_APPROVAL', label: 'Chờ xác nhận' },
  approved: { status: 'VERIFIED', label: 'Đã xác nhận' },
  rejected: { status: 'REJECTED', label: 'Đã từ chối' },
};

/** Status for `FhStatusPill`; an unknown value reads "Trạng thái chưa xác định". */
export function checkinFaceStatusPill(status: string | null | undefined): { status: string; label: string } {
  return PILLS[status as CheckinFaceReviewStatus] ?? { status: 'UNKNOWN', label: 'Trạng thái chưa xác định' };
}
