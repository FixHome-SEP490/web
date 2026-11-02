type ErrorBody = { message?: unknown; error?: { message?: unknown } };

const asText = (message: unknown): string =>
  Array.isArray(message) ? message.filter((part) => typeof part === 'string').join(' ')
    : typeof message === 'string' ? message : '';

/** Never offer a cash fallback while an existing payment may still settle. */
export function pendingPaymentCashNotice(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: ErrorBody } } | null)?.response;
  if (response?.status !== 409) return null;
  // The API puts the reason in data.error.message (global exception filter); an older
  // shape kept it in data.message, so both are read.
  const reason = asText(response.data?.error?.message) || asText(response.data?.message);
  const mentionsPayment = /(giao dịch|thanh toán|payment)/i.test(reason);
  const indicatesPending = /(pending|đang\s+(?:được\s+)?xử lý|chờ\s+(?:xử lý|xác nhận)|đối soát)/i.test(reason);
  if (!mentionsPayment || !indicatesPending) return null;
  return 'Đơn đang có giao dịch thanh toán cần đối soát. Chưa thể chuyển sang tiền mặt lúc này. Hãy kiểm tra trạng thái giao dịch trước khi thanh toán lại để tránh trả hai lần.';
}
