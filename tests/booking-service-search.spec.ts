import { describe, expect, it } from 'vitest';
import { serviceMatchesSearch } from '../src/components/booking/booking-service-catalog';

// PO 20/10/2026: customers type the names they use at home, in any order and
// without accents; the catalog uses the formal names.
const ac = { name: 'Vệ sinh điều hòa', categoryName: 'Điều hòa', description: null, scopeDescription: null };
const heater = { name: 'Vệ sinh bình nóng lạnh', categoryName: 'Bình nóng lạnh', description: null, scopeDescription: null };
const tv = { name: 'Lắp TV/giá treo', categoryName: 'Tivi & màn hình', description: null, scopeDescription: null };
const fridge = { name: 'Sửa tủ lạnh', categoryName: 'Tủ lạnh', description: null, scopeDescription: null };

describe('booking service search', () => {
  it('finds the air conditioner by its southern name, with or without accents', () => {
    expect(serviceMatchesSearch(ac, 'vệ sinh máy lạnh')).toBe(true);
    expect(serviceMatchesSearch(ac, 've sinh may lanh')).toBe(true);
    expect(serviceMatchesSearch(ac, 'máy điều hoà')).toBe(true);
    expect(serviceMatchesSearch(fridge, 'máy lạnh')).toBe(false);
  });

  it('finds the water heater by "máy nước nóng" and the TV by "tivi" or "tv"', () => {
    expect(serviceMatchesSearch(heater, 'máy nước nóng')).toBe(true);
    expect(serviceMatchesSearch(tv, 'tivi')).toBe(true);
    expect(serviceMatchesSearch(tv, 'treo tv')).toBe(true);
  });

  it('matches every word in any order, also against the category name', () => {
    expect(serviceMatchesSearch(ac, 'điều hòa vệ sinh')).toBe(true);
    expect(serviceMatchesSearch(fridge, 'tu lanh sua')).toBe(true);
    expect(serviceMatchesSearch(ac, 'vệ sinh tủ lạnh')).toBe(false);
    expect(serviceMatchesSearch(ac, '   ')).toBe(true);
  });
});
