// Labels of a customer identity check in the console (PO 14/10/2026).
import type { CustomerVerificationRecordStatus } from '../../api/customer-verification.api';

const PILLS: Record<CustomerVerificationRecordStatus, { status: string; label: string }> = {
  pending: { status: 'PENDING_APPROVAL', label: 'Đang chờ duyệt' },
  verified: { status: 'VERIFIED', label: 'Đã duyệt' },
  rejected: { status: 'REJECTED', label: 'Đã từ chối' },
};

/** Status for `FhStatusPill`; an unknown value reads "Trạng thái chưa xác định". */
export function verificationStatusPill(status: string | null | undefined): { status: string; label: string } {
  return PILLS[status as CustomerVerificationRecordStatus] ?? { status: 'UNKNOWN', label: 'Trạng thái chưa xác định' };
}
