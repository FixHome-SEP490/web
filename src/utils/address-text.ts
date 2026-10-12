// One readable address line (PO 12/10/2026). The map search returns the whole place
// ("…, 700000 Phường Đông Hòa, Việt Nam") and, since the 2025 merger, many addresses
// have no district, so a naive join repeated the ward and showed the postcode and
// country. Same rule as the backend's shared/utils/address-text.ts.

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/^tp\.?\s*/, 'thanh pho ');

/** Drops 6-digit postcodes, the country and any part already said, keeping order and the first spelling. */
export function tidyAddressText(text: string | null | undefined): string {
  if (!text) return '';
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of text.split(',')) {
    const part = raw.replace(/^\s*\d{6}\s+/, '').replace(/\s+\d{6}\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!part || /^\d{6}$/.test(part)) continue;
    const key = fold(part);
    if (key === 'viet nam' || key === 'vietnam' || seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(', ');
}

/** A saved address as one line. */
export function composeAddressText(parts: Array<string | null | undefined>): string {
  return tidyAddressText(parts.filter(Boolean).join(', '));
}
