import { describe, expect, it } from 'vitest';
import { isLandPlace } from '../src/utils/place-check';

/** A pin is an address only when the lookup found land (PO 12/10/2026). */
describe('isLandPlace', () => {
  it('accepts a street address', () => {
    expect(isLandPlace({
      formattedAddress: '12 Lê Lợi, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh',
      ward: 'Phường Bến Nghé',
      district: 'Quận 1',
      province: 'Thành phố Hồ Chí Minh',
    })).toBe(true);
  });

  it('rejects the sea, even when a province came back', () => {
    expect(isLandPlace({ formattedAddress: 'Biển Đông', ward: 'Biển Đông', province: 'Tỉnh Lâm Đồng' })).toBe(false);
    expect(isLandPlace({ formattedAddress: 'Biển Đông, Tỉnh Lâm Đồng', province: 'Tỉnh Lâm Đồng' })).toBe(false);
    expect(isLandPlace({ formattedAddress: 'South China Sea', province: 'Lâm Đồng' })).toBe(false);
    expect(isLandPlace({ formattedAddress: 'Vịnh Bắc Bộ', province: 'Quảng Ninh' })).toBe(false);
  });

  it('rejects a point with no ward, district or province', () => {
    expect(isLandPlace({ formattedAddress: '10.5, 107.9' })).toBe(false);
    expect(isLandPlace(null)).toBe(false);
  });

  it('does not mistake look-alike place names for the sea', () => {
    expect(isLandPlace({ formattedAddress: 'Phường 1, Vĩnh Long', ward: 'Phường 1', province: 'Tỉnh Vĩnh Long' })).toBe(true);
    expect(isLandPlace({ formattedAddress: 'Biên Hòa, Đồng Nai', district: 'Thành phố Biên Hòa', province: 'Tỉnh Đồng Nai' })).toBe(true);
    expect(isLandPlace({ formattedAddress: 'Đường Biển Đông Hải, Phường Rạch Giá', ward: 'Phường Rạch Giá', province: 'Tỉnh An Giang' })).toBe(true);
  });
});
