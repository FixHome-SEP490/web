/**
 * A pin dropped on the map is only accepted as an address when the reverse
 * lookup found a place on land (PO 12/10/2026: a pin in the sea came back as
 * "Biển Đông, Quận 1, Tỉnh Lâm Đồng" and was nearly saved).
 */
export interface ReversePlace {
  formattedAddress?: string;
  description?: string;
  ward?: string;
  district?: string;
  province?: string;
}

/**
 * Matched on lower-case text with its accents kept: folded, "Vịnh" would equal
 * the province "Vĩnh Long" and "Biển" the city "Biên Hòa". A sea name only
 * counts as a whole part of the address, so a street called "Biển Đông Hải" is land.
 */
const SEA = [
  /(^|,)\s*biển đông\s*($|,)/,
  /(^|,)\s*vịnh (bắc bộ|thái lan)\s*($|,)/,
  /^(biển|vịnh) /,
  /\b(east sea|south china sea|gulf of)\b/,
];

export function isLandPlace(place: ReversePlace | null | undefined): boolean {
  if (!place) return false;
  const admin = [place.ward, place.district, place.province].map((v) => (v ?? '').trim()).filter(Boolean);
  if (admin.length === 0) return false;
  const names = [place.formattedAddress, place.description, ...admin]
    .map((v) => (v ?? '').normalize('NFC').trim().toLowerCase())
    .filter(Boolean);
  return !names.some((name) => SEA.some((re) => re.test(name)));
}

export const NOT_AN_ADDRESS = 'Vị trí này chưa có địa chỉ, hãy kéo ghim vào đúng nhà.';
