// src/components/booking/booking-service-catalog.ts
//
// Pure helpers for the customer booking wizard's service finder.
//
// Rules frozen by the P2 V4 booking spec (docs 03/10):
// - The Backend pricing mode is authority. The wire values are lowercase
//   `fixed_price` / `inspection_required`; legacy uppercase is accepted; any
//   other value (or a missing one) is unknown and fails closed.
// - `fixedPrice` is never used to guess the mode, and `?fixed=true` never
//   overrides the catalog.
// - Search runs over everything already loaded from the catalog and ignores
//   Vietnamese diacritics, so "dieu hoa" finds "điều hòa".
//
// No server paging is claimed here: `GET /categories` returns the nested
// catalog and this module filters that loaded set only.
import type { ServiceCategory, ServiceItem } from '../../api/catalog.api';

export type BookingPriceMode = 'fixed_price' | 'inspection_required';
export type BookingPriceFilter = 'all' | BookingPriceMode;

/** Map the pricing mode exactly as the wire carries it; unknown values are `null`, never a guess. */
export function normalizePricingMode(mode: string | null | undefined): BookingPriceMode | null {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'fixed_price') return 'fixed_price';
  if (normalized === 'inspection_required') return 'inspection_required';
  return null;
}

/**
 * The approved fixed price, or `null` when the mode is not fixed or the price
 * is missing/zero/negative/not finite. A service in fixed mode without a valid
 * price simply cannot be booked; it is never shown as a fake `0 ₫`.
 */
export function fixedPriceValue(
  service: Pick<ServiceItem, 'pricingMode' | 'fixedPrice'> | null | undefined,
): number | null {
  if (!service) return null;
  if (normalizePricingMode(service.pricingMode) !== 'fixed_price') return null;
  const raw = service.fixedPrice;
  const price = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

/** A service can be submitted only with a known mode and, for fixed mode, a valid positive price. */
export function isServiceBookable(service: ServiceItem | null | undefined): boolean {
  if (!service) return false;
  const mode = normalizePricingMode(service.pricingMode);
  if (mode === 'fixed_price') return fixedPriceValue(service) !== null;
  return mode === 'inspection_required';
}

/** Accent-insensitive normalization: "Điều hòa" → "dieu hoa". */
export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

/**
 * Everyday names for the same device (PO 20/10/2026): customers in the south say
 * "máy lạnh" for an air conditioner and "máy nước nóng" for a water heater. Applied
 * to both sides on the folded text, so either name finds the service.
 */
const SEARCH_SYNONYMS: ReadonlyArray<[RegExp, string]> = [
  [/\bmay lanh\b/g, 'dieu hoa'],
  [/\bmay dieu hoa\b/g, 'dieu hoa'],
  [/\bmay nuoc nong\b/g, 'binh nong lanh'],
  [/\btv\b/g, 'tivi'],
];

function foldForSearch(value: string): string {
  return SEARCH_SYNONYMS.reduce((text, [pattern, canonical]) => text.replace(pattern, canonical), normalizeCatalogSearch(value));
}

/** Every word of the query must appear somewhere in the service or its category, in any order. */
export function serviceMatchesSearch(
  service: Pick<ServiceItem, 'name' | 'description' | 'scopeDescription'> & { categoryName?: string },
  query: string,
): boolean {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = foldForSearch(
    [service.name, service.categoryName ?? '', service.description ?? '', service.scopeDescription ?? ''].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

/** A service flattened out of the nested `/categories` payload, always knowing its category. */
export interface BookingCatalogService extends ServiceItem {
  categoryId: string;
  categoryName: string;
}

export function flattenServiceCatalog(categories: ServiceCategory[]): BookingCatalogService[] {
  return categories.flatMap((category) =>
    (category.services ?? []).map((service) => ({
      ...service,
      categoryId: service.categoryId || category.id,
      categoryName: category.name,
    })),
  );
}

export interface CatalogFilters {
  categoryId?: string | null;
  query?: string;
  priceFilter?: BookingPriceFilter;
}

/**
 * Category and price chips are filters only: they never change the selected
 * service and never select a first result. The search runs across the whole
 * loaded catalog unless a category filter is applied.
 */
export function filterCatalogServices(
  services: BookingCatalogService[],
  filters: CatalogFilters = {},
): BookingCatalogService[] {
  const categoryId = filters.categoryId ?? '';
  const query = filters.query ?? '';
  const priceFilter = filters.priceFilter ?? 'all';
  return services.filter((service) => {
    if (categoryId && service.categoryId !== categoryId) return false;
    if (!serviceMatchesSearch(service, query)) return false;
    if (priceFilter !== 'all' && normalizePricingMode(service.pricingMode) !== priceFilter) return false;
    return true;
  });
}
