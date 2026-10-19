import type { ServiceItem } from '../api/catalog.api';
import { formatCurrencyVND } from './formatters';

/** Catalog discovery copy only: never used for booking eligibility or totals. */
export function getServicePriceSummaryDisplay(service: Pick<ServiceItem, 'priceSummary'>):
  { label: string; caption: string } | null {
  const summary = service.priceSummary;
  if (!summary) return null;
  const min = summary.minLaborVnd;
  const max = summary.maxLaborVnd;
  const validAmount = (value: number | null): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  // Keep the requested compact catalog notation while reusing the VND formatter.
  const amount = (value: number) => formatCurrencyVND(value).replace(' ₫', '');
  if (summary.kind === 'fixed_range' && validAmount(min) && validAmount(max) && max >= min) {
    return {
      label: min === max ? `${amount(min)}đ` : `${amount(min)} – ${amount(max)}đ`,
      caption: 'Giá công theo thiết bị/phạm vi',
    };
  }
  const inspectionEstimate = summary.suggestedLaborVnd ?? min;
  if (summary.kind === 'inspection_reference' && validAmount(inspectionEstimate)) {
    return {
      label: `Tham khảo ${amount(inspectionEstimate)}đ`,
      caption: 'Thợ khảo sát, báo giá để khách duyệt',
    };
  }
  return { label: 'Khảo sát & báo giá', caption: '' };
}

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
