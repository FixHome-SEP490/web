// src/api/catalog-pricing.api.ts
//
// Catalog V2 device-fact pricing preview (P012, owner contract 19/10/2026).
//
// The Backend owns every binding price. `GET /services/:id/catalog-v2-pricing`
// is advisory: it tells the wizard which customer-reported facts the server
// still misses and which owner-approved scopes it can prove, with a grounded
// NONBINDING min-max when facts are incomplete. `POST /bookings` re-resolves
// the same facts under transaction locks before anything is bound. This
// adapter only forwards facts; it never computes or adjusts money.
import apiClient, { getHttpStatus } from './client';

/**
 * Customer-reported facts. `unknown` never travels as a value: an unanswered
 * fact is simply omitted, which the server treats the same way.
 */
export interface BookingDeviceAttributes {
  brand?: string;
  acMounting?: 'wall' | 'ceiling';
  acHorsepower?: 'up_to_1_5' | '2_to_2_5';
  washerLoadingStyle?: 'top' | 'front';
  washerCapacityKg?: number;
}

export interface CatalogPricingQuery extends BookingDeviceAttributes {
  /** Approved variant code; only sent after the server showed it as confirmed. */
  selectedVariantCode?: string;
}

export interface CatalogPricingVariant {
  variantId: string;
  variantCode: string;
  scopeVi: string;
  laborPriceVnd: number;
}

export interface CatalogPricingPreview {
  serviceId: string;
  serviceCode: string;
  status: 'FIXED_PRICE' | 'INSPECTION_REQUIRED';
  bindingReady: boolean;
  selectedVariant: CatalogPricingVariant | null;
  possibleVariants: CatalogPricingVariant[];
  missingAttributes: string[];
  /** Grounded only; never rendered as a binding price. */
  priceRange: { minLaborVnd: number; maxLaborVnd: number } | null;
  messageVi: string;
}

const VARIANT_CODE = /^[A-Z]{2}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(): never {
  throw new Error('Backend returned an invalid catalog pricing preview response.');
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeVariant(value: unknown): CatalogPricingVariant {
  if (!isRecord(value)) invalid();
  const { variantId, variantCode, scopeVi, laborPriceVnd } = value;
  const price = positiveInt(laborPriceVnd);
  if (
    typeof variantId !== 'string' || !variantId.trim()
    || typeof variantCode !== 'string' || !VARIANT_CODE.test(variantCode)
    || typeof scopeVi !== 'string' || !scopeVi.trim()
    || price === null
  ) {
    invalid();
  }
  return { variantId, variantCode, scopeVi, laborPriceVnd: price };
}

/**
 * Strict local normalization of the shared envelope
 * `{ success, statusCode, message, data }`. Anything else is a malformed
 * response and is surfaced as an error, never as an invented price.
 */
export function normalizePricingPreview(payload: unknown): CatalogPricingPreview {
  if (
    !isRecord(payload) || payload.success !== true
    || typeof payload.statusCode !== 'number' || !Number.isInteger(payload.statusCode)
    || typeof payload.message !== 'string'
  ) {
    invalid();
  }
  const data = payload.data;
  if (!isRecord(data)) invalid();

  const status = data.status;
  if (status !== 'FIXED_PRICE' && status !== 'INSPECTION_REQUIRED') invalid();
  if (
    typeof data.serviceId !== 'string' || !data.serviceId.trim()
    || typeof data.serviceCode !== 'string' || !data.serviceCode.trim()
    || typeof data.bindingReady !== 'boolean'
    || !Array.isArray(data.possibleVariants)
    || !Array.isArray(data.missingAttributes)
    || !data.missingAttributes.every((key) => typeof key === 'string')
  ) {
    invalid();
  }

  const possibleVariants = data.possibleVariants.map(normalizeVariant);
  const selectedVariant = data.selectedVariant == null ? null : normalizeVariant(data.selectedVariant);
  if ((status === 'FIXED_PRICE') !== (selectedVariant !== null)) invalid();

  let priceRange: CatalogPricingPreview['priceRange'] = null;
  if (data.priceRange != null) {
    if (!isRecord(data.priceRange)) invalid();
    const min = positiveInt(data.priceRange.minLaborVnd);
    const max = positiveInt(data.priceRange.maxLaborVnd);
    if (min === null || max === null || min > max) invalid();
    priceRange = { minLaborVnd: min, maxLaborVnd: max };
  }

  return {
    serviceId: data.serviceId,
    serviceCode: data.serviceCode,
    status,
    bindingReady: data.bindingReady,
    selectedVariant,
    possibleVariants,
    missingAttributes: data.missingAttributes as string[],
    priceRange,
    messageVi: typeof data.messageVi === 'string' ? data.messageVi : '',
  };
}

/**
 * The preview route is gated with the feature: absent (404), not allowed for
 * this account (403), not enabled in this environment (501) or not available
 * yet (503). Screens then hide the section and keep the legacy booking flow.
 */
export function isCatalogV2PricingUnavailableError(err: unknown): boolean {
  const status = getHttpStatus(err);
  return status === 403 || status === 404 || status === 501 || status === 503;
}

function previewParams(query: CatalogPricingQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.acMounting) params.acMounting = query.acMounting;
  if (query.acHorsepower) params.acHorsepower = query.acHorsepower;
  if (query.washerLoadingStyle) params.washerLoadingStyle = query.washerLoadingStyle;
  if (typeof query.washerCapacityKg === 'number') params.washerCapacityKg = query.washerCapacityKg;
  if (query.brand) params.brand = query.brand;
  if (query.selectedVariantCode) params.selectedVariantCode = query.selectedVariantCode;
  return params;
}

export const catalogPricingApi = {
  /** Advisory preview; a real binding happens only inside POST /bookings. */
  async getPreview(
    serviceId: string,
    query: CatalogPricingQuery = {},
    signal?: AbortSignal,
  ): Promise<CatalogPricingPreview> {
    const res = await apiClient.get<unknown>(`/services/${encodeURIComponent(serviceId)}/catalog-v2-pricing`, {
      params: previewParams(query),
      signal,
    });
    return normalizePricingPreview(res.data);
  },
};
