// PO 12/10/2026: order and address screens repeated the ward and showed the postcode and country.
import { describe, expect, it } from 'vitest';
import { composeAddressText, tidyAddressText } from '../src/utils/address-text';

describe('address text', () => {
  it('tidies a line saved the old way', () => {
    expect(tidyAddressText('Đường Vành Đai KTX Khu B, 700000 Phường Đông Hòa, Việt Nam, Phường Đông Hòa, Phường Đông Hòa, TP. Hồ Chí Minh'))
      .toBe('Đường Vành Đai KTX Khu B, Phường Đông Hòa, TP. Hồ Chí Minh');
  });

  it('leaves a normal address as it was and keeps places that only share a number', () => {
    const text = '5 Nguyễn Trãi, Phường 1, Quận 1, TP. Hồ Chí Minh';
    expect(tidyAddressText(text)).toBe(text);
    expect(composeAddressText(['5 Nguyễn Trãi', 'Phường 1', 'Quận 1', 'TP. Hồ Chí Minh'])).toBe(text);
  });

  it('cleans a picked map result but keeps the ward and city the user reads', () => {
    expect(tidyAddressText('Đường Vành Đai KTX Khu B, 700000 Phường Đông Hòa, Việt Nam')).toBe('Đường Vành Đai KTX Khu B, Phường Đông Hòa');
    expect(tidyAddressText('5 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh')).toBe('5 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh');
  });

  it('keeps short house numbers and drops six-digit postcodes', () => {
    expect(tidyAddressText('12345 Đường Số 7, 700000, Bình Tân')).toBe('12345 Đường Số 7, Bình Tân');
    expect(tidyAddressText(null)).toBe('');
  });
});
