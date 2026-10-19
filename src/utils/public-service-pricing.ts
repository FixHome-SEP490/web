import type { ServiceItem } from '../api/catalog.api';

export type PublicServicePricing =
  | { kind: 'fixed'; amount: number }
  | { kind: 'fixed-unavailable' }
  | { kind: 'inspection'; referenceRange?: { min: number; max: number } }
  | { kind: 'unknown' };

type PricingFields = Pick<ServiceItem, 'pricingMode' | 'fixedPrice' | 'minPrice' | 'maxPrice'>;

function positiveAmount(value: unknown): number | null {
  // PostgreSQL decimals may arrive as strings. Accept the whole decimal only;
  // Number/parseFloat alone also accept exponent/hex or trailing garbage.
  if (typeof value === 'string') {
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return null;
    value = Number(value);
  }
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Uses only the catalog mode; amounts never decide whether work is fixed-price. */
export function getPublicServicePricing(service: PricingFields): PublicServicePricing {
  const mode = typeof service.pricingMode === 'string' ? service.pricingMode.trim().toLowerCase() : '';

  if (mode === 'fixed_price') {
    const amount = positiveAmount(service.fixedPrice);
    return amount === null ? { kind: 'fixed-unavailable' } : { kind: 'fixed', amount };
  }

  if (mode === 'inspection_required') {
    const min = positiveAmount(service.minPrice);
    const max = positiveAmount(service.maxPrice);
    return min !== null && max !== null && max > min
      ? { kind: 'inspection', referenceRange: { min, max } }
      : { kind: 'inspection' };
  }

  return { kind: 'unknown' };
}
