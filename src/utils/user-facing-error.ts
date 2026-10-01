/**
 * Turn any failure into a sentence a customer or technician can act on.
 *
 * Customers and technicians are not technical: they never see HTTP statuses,
 * error codes, partner codes ("607: ..."), stack traces or the English
 * sentences our libraries produce. A clear Vietnamese message from the server
 * is kept (minus any code prefix); anything else becomes the screen's own
 * fallback, or a plain sentence for the few cases every screen shares.
 */

export const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại.';
export const NETWORK_ERROR = 'Không có kết nối mạng. Kiểm tra kết nối rồi thử lại.';
export const TIMEOUT_ERROR = 'Kết nối đang chậm. Vui lòng thử lại.';
export const SESSION_EXPIRED = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
export const FORBIDDEN = 'Bạn không có quyền thực hiện thao tác này.';

const VIETNAMESE_LETTER = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Library, transport and framework wording that must never reach the screen. */
const TECHNICAL = [
  /status code/i,
  /network error/i,
  /timeout of \d+/i,
  /\bECONN[A-Z]+\b/,
  /internal server error/i,
  /service unavailable/i,
  /bad request/i,
  /validation failed/i,
  /malformed request/i,
  /request payload/i,
  /unsupported request/i,
  /already exists/i,
  /violates/i,
  /\b(undefined|null|NaN)\b/,
  /\b(TypeError|SyntaxError|ReferenceError|QueryFailedError)\b/,
  /\bat \S+ \(/, // stack frame
  /[{}[\]<>]/, // JSON or markup
  /\b(POST|GET|PUT|PATCH|DELETE)\b/,
  /\b(backend|frontend|api|endpoint|token|jwt|payload|socket|uuid|enum|sql)\b/i,
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/, // BOOKING_NOT_FOUND
  /\bHTTP\s*\d{3}\b/i,
];

/**
 * English sentences the backend still returns that tell the person something
 * they can act on. Everything else in English falls back to the screen's own
 * message; the lookup ignores case and a trailing full stop.
 */
const TRANSLATIONS: Record<string, string> = {
  'email is already registered': 'Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.',
  'phone number is already registered': 'Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.',
  'invalid email or password': 'Email, số điện thoại hoặc mật khẩu không đúng.',
  'account is locked or suspended': 'Tài khoản đang bị khoá hoặc tạm ngưng. Vui lòng liên hệ FixHome để được hỗ trợ.',
  'technician account is inactive': 'Tài khoản kỹ thuật viên đang tạm ngưng hoạt động.',
  'select an image up to 10 mb': 'Vui lòng chọn ảnh dung lượng tối đa 10 MB.',
  'only jpeg, png and webp image files are accepted': 'Chỉ nhận ảnh định dạng JPEG, PNG hoặc WebP.',
  'a face photo is required for verification': 'Vui lòng tải ảnh chân dung để xác minh.',
  'your technician account is already verified': 'Tài khoản kỹ thuật viên của bạn đã được xác minh.',
  'rejection reason is required': 'Vui lòng nhập lý do từ chối.',
  'invalid date range for time off. endat must be after startat': 'Ngày kết thúc nghỉ phải sau ngày bắt đầu.',
  'cash settlement is already confirmed': 'Khoản tiền mặt này đã được xác nhận trước đó.',
  'support case is already terminal': 'Yêu cầu hỗ trợ này đã được xử lý xong.',
  'address lookup is temporarily unavailable': 'Chưa tìm được địa chỉ lúc này. Vui lòng thử lại sau ít phút.',
  'booking not found': 'Không tìm thấy yêu cầu đặt lịch này.',
  'order not found or access denied': 'Không tìm thấy đơn sửa chữa này.',
  'request payload is too large': 'Tệp hoặc nội dung quá lớn. Vui lòng chọn tệp nhỏ hơn.',
};

function translate(message: string): string | null {
  return TRANSLATIONS[message.trim().replace(/\.$/, '').toLowerCase()] ?? null;
}

/** "607: ...", "[ABC_DEF] ...", "E1001 - ...", "(Lỗi 400)" and similar decorations. */
function stripCodes(message: string): string {
  return message
    .replace(/^\s*\[[A-Z0-9_.-]+\]\s*[:-]?\s*/, '')
    .replace(/^\s*[A-Z]{0,3}\d{2,6}\s*[:\-–]\s*/, '')
    .replace(/^\s*[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\s*[:\-–]\s*/, '')
    .replace(/\s*\((?:lỗi|mã lỗi|error|code|http)\s*:?\s*[A-Z0-9_]+\)/gi, '')
    .replace(/\s*(?:mã lỗi|error code)\s*:?\s*[A-Z0-9_]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove partner and system codes from text that is otherwise fine to show,
 * such as a wallet line "Hoàn tiền rút không thành công - 607: Tài khoản đích
 * không hợp lệ". Unlike toUserFacingMessage it never replaces the text.
 */
export function withoutCodes(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/(^|[\s(\-–:])\d{2,6}\s*:\s+/g, '$1')
    .replace(/(^|[\s(])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\s*:\s*/g, '$1')
    .replace(/\s*\((?:lỗi|mã lỗi|error|code|http)\s*:?\s*[A-Z0-9_]+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean one message. Returns the fallback when what is left is not a plain
 * Vietnamese sentence.
 */
export function toUserFacingMessage(message: unknown, fallback: string = GENERIC_ERROR): string {
  if (typeof message !== 'string') return fallback;
  const cleaned = stripCodes(message);
  if (!cleaned) return fallback;
  const translated = translate(cleaned);
  if (translated) return translated;
  if (!VIETNAMESE_LETTER.test(cleaned)) return fallback;
  if (TECHNICAL.some((pattern) => pattern.test(cleaned))) return fallback;
  return cleaned;
}

interface ErrorBody {
  message?: unknown;
  error?: unknown;
}

function serverMessages(data: unknown): unknown[] {
  if (typeof data !== 'object' || data === null) return [];
  const body = data as ErrorBody;
  const found: unknown[] = [];
  const error = body.error;
  if (typeof error === 'object' && error !== null) {
    const details = (error as { details?: unknown }).details;
    if (Array.isArray(details) && details.every((d) => typeof d === 'string')) {
      found.push(details.join('. '));
    }
    found.push((error as { message?: unknown }).message);
  } else if (typeof error === 'string') {
    found.push(error);
  }
  if (Array.isArray(body.message)) found.push(body.message.join('. '));
  else found.push(body.message);
  return found;
}

/**
 * What a failed request can tell the person by itself, or '' when only the
 * screen knows what to say. The API client stores this as `error.message`, so
 * screens that show `err.message || 'Không thể …'` never print library text.
 */
export function transportMessage(err: unknown): string {
  return userFacingError(err, '');
}

/**
 * The message to show for a failed request or any thrown value.
 *
 * `fallback` names what failed on this screen ("Không thể duyệt báo giá. Vui
 * lòng thử lại."); it is used whenever the server gave nothing a person can use.
 */
export function userFacingError(err: unknown, fallback: string = GENERIC_ERROR): string {
  if (typeof err !== 'object' || err === null) {
    return toUserFacingMessage(err, fallback);
  }

  const axiosLike = err as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: unknown };
    request?: unknown;
    isAxiosError?: boolean;
  };
  const status = typeof axiosLike.response?.status === 'number' ? axiosLike.response.status : undefined;

  for (const candidate of serverMessages(axiosLike.response?.data)) {
    const message = toUserFacingMessage(candidate, '');
    if (message) return message;
  }

  if (status === 401) return SESSION_EXPIRED;
  if (status === 403) return FORBIDDEN;
  if (status === 404) return fallback === GENERIC_ERROR ? 'Không tìm thấy nội dung này. Có thể nó đã bị xoá.' : fallback;
  if (status === 409) return fallback === GENERIC_ERROR ? 'Thông tin này đã tồn tại.' : fallback;
  if (status === 413) return 'Tệp hoặc nội dung quá lớn. Vui lòng chọn tệp nhỏ hơn.';

  if (status === undefined && (axiosLike.isAxiosError || axiosLike.request !== undefined)) {
    if (axiosLike.code === 'ECONNABORTED' || axiosLike.code === 'ETIMEDOUT') return TIMEOUT_ERROR;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return NETWORK_ERROR;
    if (axiosLike.code === 'ERR_NETWORK') return NETWORK_ERROR;
  }

  // Errors thrown by our own code carry Vietnamese validation sentences.
  return toUserFacingMessage(axiosLike.message, fallback);
}
