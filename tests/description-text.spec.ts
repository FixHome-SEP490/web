// PO 22/11/2026: a warranty description made only of emoji was accepted.
import { describe, expect, it } from 'vitest';
import { validateDescriptionText } from '../src/utils/input-validation';

describe('validateDescriptionText', () => {
  it('rejects emoji or symbols only', () => {
    expect(validateDescriptionText('😀😀😀😀😀😀😀😀😀😀')).toContain('chữ hoặc số');
    expect(validateDescriptionText('!!!!????★★')).toContain('chữ hoặc số');
  });
  it('rejects invisible characters', () => {
    expect(validateDescriptionText('Máy kêu​ to')).toContain('vô hình');
  });
  it('accepts text, with emoji alongside', () => {
    expect(validateDescriptionText('Máy lạnh chảy nước')).toBe('');
    expect(validateDescriptionText('Máy lạnh chảy nước 😢')).toBe('');
    expect(validateDescriptionText('Lỗi E4')).toBe('');
  });
});
