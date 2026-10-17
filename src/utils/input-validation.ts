// src/utils/input-validation.ts
//
// Bản sao phía client của luật ký tự trong
// `backend/src/shared/validation/text.validators.ts`.
//
// Backend vẫn là nơi quyết định cuối cùng; phần này chỉ để người dùng nhận được
// lời nhắc bằng tiếng Việt ngay khi gõ, thay vì bấm gửi rồi mới nhận một câu
// tiếng Anh từ server. Sửa luật ở backend thì sửa cả ở đây và ở bản mobile
// tương ứng.

import { userFacingError } from './user-facing-error';
import { vnParts } from './vn-time';

/** Ký tự điều khiển C0/C1. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** Ký tự vô hình và ký tự đảo chiều viết. */
const INVISIBLE_CHARS =
  /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

/** Chữ cái mọi hệ chữ, dấu phụ, khoảng trắng, nháy đơn, gạch nối, dấu chấm. */
const PERSON_NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;

export function containsUnsafeText(value: string): boolean {
  return CONTROL_CHARS.test(value) || INVISIBLE_CHARS.test(value);
}

/** Trả về thông báo lỗi tiếng Việt, hoặc chuỗi rỗng nếu hợp lệ. */
export function validateFullName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Họ tên không được bỏ trống';
  if (trimmed.length < 2) return 'Họ tên tối thiểu 2 ký tự';
  if (trimmed.length > 200) return 'Họ tên tối đa 200 ký tự';
  if (containsUnsafeText(trimmed))
    return 'Họ tên chứa ký tự ẩn không hợp lệ, vui lòng gõ lại';
  if (!PERSON_NAME_ALLOWED.test(trimmed))
    return 'Họ tên chỉ gồm chữ cái, khoảng trắng, dấu nháy, gạch nối và dấu chấm';
  return '';
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Email không được bỏ trống';
  if (trimmed.length > 254) return 'Email tối đa 254 ký tự';
  if (containsUnsafeText(trimmed))
    return 'Email chứa ký tự ẩn không hợp lệ, vui lòng gõ lại';
  if (!EMAIL_SHAPE.test(trimmed)) return 'Email sai định dạng';
  return '';
}

/** Giữ giống hệt bản mobile để hai client không lệch nhau. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * bcrypt chỉ đọc 72 byte đầu của mật khẩu, nên phần vượt quá không có tác dụng
 * bảo vệ gì. Đếm theo byte UTF-8 chứ không theo ký tự, vì một chữ có dấu chiếm
 * nhiều byte.
 */
export function validatePassword(value: string): string {
  if (!value) return 'Mật khẩu không được bỏ trống';
  if (value.length < 8) return 'Mật khẩu tối thiểu 8 ký tự';
  if (utf8ByteLength(value) > 72) return 'Mật khẩu quá dài, tối đa 72 byte';
  if (containsUnsafeText(value))
    return 'Mật khẩu chứa ký tự điều khiển không hợp lệ';
  return '';
}

const PHONE_SHAPE = /^0[35789][0-9]{8}$/;

export function validatePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!PHONE_SHAPE.test(trimmed)) return 'SĐT không hợp lệ (VD: 0901234567)';
  return '';
}

/** Số CCCD gồm đúng 12 chữ số (luật `citizenIdNumber` của backend). */
export function validateCitizenId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Vui lòng nhập số CCCD';
  if (!/^\d{12}$/.test(trimmed)) return 'Số CCCD phải gồm đúng 12 chữ số';
  return '';
}

/**
 * Bản sao của `IsAddressText` ở backend: chữ cái có dấu, chữ số, khoảng trắng
 * và các dấu thường gặp trong địa chỉ; không emoji, ký hiệu hay thẻ HTML.
 */
const ADDRESS_ALLOWED = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ,./'’()#&:;-]*$/u;

export function validateAddressText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Vui lòng nhập địa chỉ';
  if (trimmed.length < 5) return 'Địa chỉ tối thiểu 5 ký tự';
  if (trimmed.length > 500) return 'Địa chỉ tối đa 500 ký tự';
  if (containsUnsafeText(trimmed)) return 'Địa chỉ chứa ký tự ẩn không hợp lệ, vui lòng gõ lại';
  if (!ADDRESS_ALLOWED.test(trimmed))
    return 'Địa chỉ chỉ gồm chữ, số, khoảng trắng và các dấu , . / - ( ) # : ;';
  return '';
}

/** Tuổi tròn theo ngày hôm nay ở Việt Nam (giống `ageInYearsOnVnToday` của backend). */
export function ageOnVnToday(dateOfBirth: string, now: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim());
  if (!match) return Number.NaN;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return Number.NaN;
  const today = vnParts(now);
  const hadBirthday = today.month > month || (today.month === month && today.day >= day);
  return today.year - year - (hadBirthday ? 0 : 1);
}

/** Ngày sinh YYYY-MM-DD, có thật, không ở tương lai và đủ `minAge` tuổi. */
export function validateBirthDate(value: string, minAge = 18, now: Date = new Date()): string {
  if (!value.trim()) return 'Vui lòng chọn ngày sinh';
  const age = ageOnVnToday(value, now);
  if (Number.isNaN(age)) return 'Ngày sinh không hợp lệ';
  if (age < 0) return 'Ngày sinh không được ở tương lai';
  if (age > 120) return 'Ngày sinh không hợp lệ';
  if (age < minAge) return `Bạn cần đủ ${minAge} tuổi trở lên`;
  return '';
}

/**
 * Lấy thông báo lỗi dễ đọc từ phản hồi của backend.
 *
 * Backend bọc lỗi trong `{ error: { code, message, details } }`. Khi
 * ValidationPipe chặn thì `message` chỉ là "Validation failed" còn lý do thật
 * nằm trong mảng `details`, nên phải đọc `details` trước.
 */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  // Validation details, then the server sentence, then the screen fallback;
  // codes and library wording never reach the person (user-facing-error.ts).
  return userFacingError(err, fallback);
}
