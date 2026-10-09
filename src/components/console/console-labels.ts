// Words for the codes the console receives, so no raw enum reaches the screen
// (PO 10/10/2026). Unknown values fall back to a neutral phrase, never the code.

const lookup = (table: Record<string, string>, fallback: string) => (value: unknown): string =>
  table[String(value ?? '').trim().toLowerCase()] ?? fallback;

export const roleLabel = lookup(
  {
    customer: 'Khách hàng',
    technician: 'Kỹ thuật viên',
    service_manager: 'Quản lý dịch vụ',
    admin: 'Quản trị viên',
    system: 'Hệ thống',
  },
  'Không rõ',
);

export const paymentStatusLabel = lookup(
  {
    unpaid: 'Chưa thanh toán',
    paid: 'Đã thanh toán',
    refunded: 'Đã hoàn tiền',
  },
  'Chưa rõ thanh toán',
);

export const orderStatusLabel = lookup(
  {
    accepted: 'Đã nhận đơn',
    en_route: 'Đang di chuyển',
    under_repair: 'Đang sửa chữa',
    completed: 'Hoàn thành',
    cancelled: 'Đã huỷ',
  },
  'Cập nhật trạng thái',
);

export const bookingStatusLabel = lookup(
  {
    submitted: 'Đã gửi yêu cầu',
    matching: 'Đang tìm kỹ thuật viên',
    matched: 'Đã ghép kỹ thuật viên',
    cancelled: 'Đã huỷ',
    closed: 'Hết lượt tìm kỹ thuật viên',
  },
  'Trạng thái chưa xác định',
);

/** Text with a code inside ("ORDER_CANCELLED", "abc_def") is not shown as is. */
export function looksLikeCode(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text) || /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text);
}

export const cashSettlementLabel = lookup(
  {
    pending_confirmation: 'Chờ khách xác nhận',
    confirmed: 'Đã xác nhận',
    disputed: 'Khách báo sai lệch',
  },
  'Trạng thái chưa xác định',
);

/** Badge tone (an `FhStatusPill` status) for a payment or cash status, always shown with a label. */
export function moneyTone(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'paid' || v === 'confirmed' || v === 'verified' || v === 'completed') return 'COMPLETED';
  if (v === 'disputed' || v === 'failed' || v === 'rejected') return 'REJECTED';
  if (v === 'refunded' || v === 'cancelled') return 'CANCELLED';
  return 'PENDING';
}
