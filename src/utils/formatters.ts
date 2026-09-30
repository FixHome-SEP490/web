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
 * Pure Vietnamese friendly label for wallet transaction types
 */
export function formatWalletTxType(type: string): { label: string; isCredit: boolean } {
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
      return { label: 'Điều chỉnh bởi Admin', isCredit: false };
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
