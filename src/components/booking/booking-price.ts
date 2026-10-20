// Short price labels for the booking screens (PO 20/10/2026): a range stays grey until the
// server confirms one price; a survey service says "Tham khảo …" (a reference, never a floor). Display only:
// amounts come from the catalog or the server, never computed here.
import type { ServiceItem } from '../../api/catalog.api';
import type { BookingDeviceAttributes } from '../../api/catalog-pricing.api';
import { fixedPriceValue, normalizePricingMode } from './booking-service-catalog';

const FACT_LABELS = {
  acMounting: { wall: 'Treo tường', ceiling: 'Âm trần', floor: 'Tủ đứng' },
  acHorsepower: { up_to_1_5: '≤ 1,5 HP', '2_to_2_5': '2 – 2,5 HP' },
  washerLoadingStyle: { top: 'Cửa trên', front: 'Cửa ngang' },
} as const;

/** "Treo tường · ≤ 1,5 HP": the facts the customer gave, or null when none. */
export function deviceFactsText(attributes: BookingDeviceAttributes | null | undefined): string | null {
  if (!attributes) return null;
  const parts: string[] = [];
  if (attributes.acMounting && attributes.acMounting in FACT_LABELS.acMounting) parts.push(FACT_LABELS.acMounting[attributes.acMounting]);
  if (attributes.acHorsepower && attributes.acHorsepower in FACT_LABELS.acHorsepower) parts.push(FACT_LABELS.acHorsepower[attributes.acHorsepower]);
  if (attributes.washerLoadingStyle && attributes.washerLoadingStyle in FACT_LABELS.washerLoadingStyle) parts.push(FACT_LABELS.washerLoadingStyle[attributes.washerLoadingStyle]);
  if (typeof attributes.washerCapacityKg === 'number') parts.push(attributes.washerCapacityKg <= 9 ? '≤ 9 kg' : 'Trên 9 kg');
  if (attributes.washerHasDryer === true) parts.push('Có sấy');
  return parts.length ? parts.join(' · ') : null;
}

/** A server scope such as "Treo tường <=1.5 HP" with the signs a customer reads. */
export function readableScope(scope: string): string {
  return scope.replace(/<=/g, '≤').replace(/>=/g, '≥');
}

/** 199000 -> "199k", 1250000 -> "1,25tr". */
export function compactVnd(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = Math.round(amount / 10_000) / 100;
    return `${String(millions).replace('.', ',')}tr`;
  }
  return `${Math.round(amount / 1000)}k`;
}

export interface CatalogPriceLabel {
  text: string;
  /** 'fixed': a firm amount or range of firm tiers; 'survey': a technician quotes on site. */
  kind: 'fixed' | 'survey';
}

const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

/** The one short price a service row shows. */
export function catalogPriceLabel(service: Pick<ServiceItem, 'priceSummary' | 'pricingMode' | 'fixedPrice'>): CatalogPriceLabel {
  const summary = service.priceSummary;
  if (summary) {
    const min = amount(summary.minLaborVnd);
    const max = amount(summary.maxLaborVnd);
    if (summary.kind === 'fixed_range' && min !== null && max !== null && max >= min) {
      return { kind: 'fixed', text: min === max ? compactVnd(min) : `${compactVnd(min)} – ${compactVnd(max)}` };
    }
    const from = min ?? amount(summary.suggestedLaborVnd);
    if (summary.kind === 'inspection_reference' && from !== null) {
      return { kind: 'survey', text: `Tham khảo ${compactVnd(from)}` };
    }
    return { kind: 'survey', text: 'Khảo sát, báo giá' };
  }
  if (normalizePricingMode(service.pricingMode) === 'fixed_price') {
    const fixed = fixedPriceValue(service as ServiceItem);
    if (fixed !== null) return { kind: 'fixed', text: compactVnd(fixed) };
  }
  return { kind: 'survey', text: 'Khảo sát, báo giá' };
}
