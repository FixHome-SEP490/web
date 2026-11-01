// src/utils/address-input.ts
//
// Bản sao phía client của luật địa chỉ trong
// `backend/src/shared/validation/address.validators.ts` (PO 01/11/2026, lỗi 29).
// Backend vẫn quyết định cuối cùng; phần này để người dùng thấy câu nhắc tiếng
// Việt ngay cạnh ô nhập thay vì bấm lưu rồi mới bị từ chối. Câu chữ giữ giống
// hệt backend. Sửa luật ở backend thì sửa cả ở đây.

const ADDRESS_FIELD_ALLOWED = /^[\p{L}\p{N}̀-ͯ ,./()#'’&:–-]+$/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const BLANK_LETTERS = /[ᅟᅠㅤﾠ]/u;
const STACKED_MARKS = /[̀-ͯ]{3,}/u;

export const ADDRESS_LOCATION_REQUIRED =
  'Vui lòng chọn vị trí trên bản đồ. Địa chỉ cần có đủ vĩ độ và kinh độ.';

/** NFC, khoảng trắng không ngắt thành khoảng trắng thường, gộp và cắt hai đầu như backend. */
export function normalizeAddressText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[  ]+/g, ' ')
    .replace(/^ | $/g, '');
}

export function isAddressFieldText(value: string): boolean {
  return (
    ADDRESS_FIELD_ALLOWED.test(value) &&
    HAS_LETTER_OR_DIGIT.test(value) &&
    !BLANK_LETTERS.test(value) &&
    !STACKED_MARKS.test(value)
  );
}

/**
 * Câu lỗi tiếng Việt cho một ô chữ của địa chỉ, hoặc '' khi hợp lệ.
 * `field` là tên ô như backend dùng (Tên gợi nhớ, Địa chỉ cụ thể...).
 */
export function addressFieldError(
  field: string,
  value: string | null | undefined,
  { max, required = false }: { max: number; required?: boolean },
): string {
  const text = normalizeAddressText(value ?? '');
  if (!text) return required ? `${field} không được để trống.` : '';
  if (text.length > max) return `${field} tối đa ${max} ký tự.`;
  if (!isAddressFieldText(text)) {
    return `${field} chỉ được chứa chữ, số, khoảng trắng và các dấu , . / - ( ) #, không chứa emoji, thẻ HTML hay ký tự đặc biệt.`;
  }
  return '';
}

/** Câu lỗi cho cặp toạ độ, hoặc '' khi đủ và đúng khoảng. */
export function addressLocationError(lat: number | '' | null | undefined, lng: number | '' | null | undefined): string {
  if (lat === '' || lat == null || lng === '' || lng == null) return ADDRESS_LOCATION_REQUIRED;
  if (!Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90) return 'Vĩ độ phải là số từ -90 đến 90.';
  if (!Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180) return 'Kinh độ phải là số từ -180 đến 180.';
  return '';
}
