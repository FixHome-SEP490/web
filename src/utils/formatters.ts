/**
 * Authoritative formatters per FIXHOME-DESIGN-SYSTEM.md
 */

/**
 * Format currency in VND with dots as thousands separator and ₫ symbol.
 * Zero is '0 ₫', negative is '-50.000 ₫'.
 */
export function formatCurrencyVND(amount: number | string | bigint | null | undefined): string {
  if (amount === null || amount === undefined) return '0 ₫';
  const num = typeof amount === 'bigint' ? Number(amount) : Number(amount);
  if (isNaN(num)) return '0 ₫';
  const absFormatted = Math.abs(Math.round(num)).toLocaleString('vi-VN');
  return num < 0 ? `-${absFormatted} ₫` : `${absFormatted} ₫`;
}

/**
 * Format date time in Asia/Ho_Chi_Minh timezone: 'HH:mm, dd/MM/yyyy'
 */
export function formatDateTimeVN(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('hour')}:${get('minute')}, ${get('day')}/${get('month')}/${get('year')}`;
}

/**
 * Format date only in Asia/Ho_Chi_Minh: 'dd/MM/yyyy'
 */
export function formatDateVN(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/**
 * Pure Vietnamese friendly label for wallet transaction types. An admin
 * adjustment can go either way, so its direction comes from the balances.
 */
export function formatWalletTxType(
  type: string,
  balances?: { balanceBefore: number; balanceAfter: number },
): { label: string; isCredit: boolean } {
  switch (type) {
    case 'TOP_UP':
      return { label: 'Nạp tiền vào ví', isCredit: true };
    case 'ONLINE_EARNING':
      return { label: 'Thu nhập ròng (Đơn online)', isCredit: true };
    case 'PLATFORM_FEE':
      return { label: 'Khấu trừ phí nền tảng (Đơn tiền mặt)', isCredit: false };
    case 'WITHDRAW':
      return { label: 'Rút tiền về ngân hàng', isCredit: false };
    case 'WITHDRAW_REFUND':
      return { label: 'Hoàn tiền rút không thành công', isCredit: true };
    case 'ADJUSTMENT':
      return {
        label: 'Điều chỉnh bởi Admin',
        isCredit: balances ? Number(balances.balanceAfter) >= Number(balances.balanceBefore) : false,
      };
    default:
      return { label: type, isCredit: false };
  }
}

/**
 * Status tone and label for withdrawal requests
 */
export function formatWithdrawalStatus(status: string): { label: string; color: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Chờ duyệt', color: 'amber' };
    case 'PROCESSING':
      return { label: 'Đang chuyển tiền', color: 'blue' };
    case 'SUCCESS':
      return { label: 'Đã chi tiền', color: 'emerald' };
    case 'REJECTED':
      return { label: 'Đã từ chối', color: 'rose' };
    case 'FAILED':
      return { label: 'Chuyển thất bại', color: 'rose' };
    default:
      return { label: status, color: 'gray' };
  }
}

/**
 * A rating as the server reports it, one decimal, or null when there is none
 * yet. Screens show "Chưa có đánh giá" for null rather than inventing a score.
 */
export function formatRating(value: number | string | null | undefined): string | null {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : null;
}

export const NO_RATING_LABEL = 'Chưa có đánh giá';

/**
 * Rating ready to show: one decimal when the technician has been rated, or
 * "Chưa có đánh giá" when the server sends null or no review exists yet.
 */
export function ratingLabel(
  value: number | string | null | undefined,
  ratingCount?: number | string | null,
): string {
  if (ratingCount != null && !(Number(ratingCount) > 0)) return NO_RATING_LABEL;
  return formatRating(value) ?? NO_RATING_LABEL;
}

/** True when there is a real rating to show next to a star. */
export function hasRating(
  value: number | string | null | undefined,
  ratingCount?: number | string | null,
): boolean {
  return ratingLabel(value, ratingCount) !== NO_RATING_LABEL;
}
