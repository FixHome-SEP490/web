// P012 (owner contract 19/10/2026): the Catalog V2 pricing preview adapter.
// The server owns every binding price, so this adapter must stay strict: a
// malformed envelope is an error (never an invented price), the fact query
// carries only answered facts, and only the feature-off status codes hide the
// section. The HTTP client is mocked; no test touches a real catalog or DB.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/client')>()),
  default: { get },
}));

import {
  catalogPricingApi,
  isCatalogV2PricingUnavailableError,
  normalizePricingPreview,
} from '../src/api/catalog-pricing.api';

const variant = {
  variantId: 'v-ac-01',
  variantCode: 'AC-02-01',
  scopeVi: 'Treo tường <=1.5 HP',
  laborPriceVnd: 199000,
};

const envelope = (data: unknown) => ({ success: true, statusCode: 200, message: 'Success', data });

const inspectionData = (overrides: Record<string, unknown> = {}) => ({
  serviceId: 'svc-1',
  serviceCode: 'AC-02',
  status: 'INSPECTION_REQUIRED',
  bindingReady: false,
  selectedVariant: null,
  possibleVariants: [variant],
  missingAttributes: ['acHorsepower'],
  priceRange: null,
  messageVi: 'Cần khảo sát để báo giá',
  ...overrides,
});

describe('catalog-v2 pricing preview adapter', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('normalizes a confirmed fixed price together with its approved scope', () => {
    const preview = normalizePricingPreview(envelope({
      ...inspectionData(),
      status: 'FIXED_PRICE',
      bindingReady: true,
      selectedVariant: variant,
      missingAttributes: [],
      messageVi: 'Tiền công theo phạm vi đã chọn, chưa gồm linh kiện và vật tư',
    }));

    expect(preview.status).toBe('FIXED_PRICE');
    expect(preview.selectedVariant).toEqual(variant);
    expect(preview.possibleVariants).toEqual([variant]);
    expect(preview.priceRange).toBeNull();
  });

  it('keeps the nonbinding range exactly as the server grounded it', () => {
    const preview = normalizePricingPreview(envelope(inspectionData({
      possibleVariants: [variant, { ...variant, variantId: 'v-ac-02', variantCode: 'AC-02-02', laborPriceVnd: 219000 }],
      priceRange: { minLaborVnd: 199000, maxLaborVnd: 219000 },
    })));

    expect(preview.status).toBe('INSPECTION_REQUIRED');
    expect(preview.selectedVariant).toBeNull();
    expect(preview.priceRange).toEqual({ minLaborVnd: 199000, maxLaborVnd: 219000 });
    expect(preview.missingAttributes).toEqual(['acHorsepower']);
  });

  it('rejects a FIXED_PRICE without a selected variant and an inspection with one', () => {
    expect(() => normalizePricingPreview(envelope(inspectionData({ status: 'FIXED_PRICE', bindingReady: true }))))
      .toThrow(/invalid catalog pricing preview/);
    expect(() => normalizePricingPreview(envelope(inspectionData({ selectedVariant: variant }))))
      .toThrow(/invalid catalog pricing preview/);
  });

  it('rejects malformed variants, prices and ranges instead of guessing', () => {
    expect(() => normalizePricingPreview(envelope(inspectionData({ possibleVariants: [{ ...variant, variantCode: 'TREO-TUONG' }] })))).toThrow();
    expect(() => normalizePricingPreview(envelope(inspectionData({ possibleVariants: [{ ...variant, laborPriceVnd: 0 }] })))).toThrow();
    expect(() => normalizePricingPreview(envelope(inspectionData({ possibleVariants: [{ ...variant, laborPriceVnd: 199000.5 }] })))).toThrow();
    expect(() => normalizePricingPreview(envelope(inspectionData({ possibleVariants: [{ ...variant, scopeVi: '  ' }] })))).toThrow();
    expect(() => normalizePricingPreview(envelope(inspectionData({ priceRange: { minLaborVnd: 219000, maxLaborVnd: 199000 } })))).toThrow();
  });

  it('rejects payloads that are not the shared success envelope', () => {
    expect(() => normalizePricingPreview(null)).toThrow();
    expect(() => normalizePricingPreview({ success: false, statusCode: 500, message: 'boom', data: inspectionData() })).toThrow();
    expect(() => normalizePricingPreview({ success: true, statusCode: 200, data: inspectionData() })).toThrow();
  });

  it('sends only the answered facts and a confirmed variant code', async () => {
    get.mockResolvedValue({ data: envelope(inspectionData()) });

    await catalogPricingApi.getPreview('svc/1', {
      acMounting: 'wall',
      acHorsepower: undefined,
      washerCapacityKg: 9,
      brand: '',
      selectedVariantCode: 'WM-02-05',
    });

    expect(get).toHaveBeenCalledWith('/services/svc%2F1/catalog-v2-pricing', {
      params: { acMounting: 'wall', washerCapacityKg: 9, selectedVariantCode: 'WM-02-05' },
      signal: undefined,
    });
  });

  it('treats only the gated status codes as feature-off', () => {
    for (const status of [403, 404, 501, 503]) {
      expect(isCatalogV2PricingUnavailableError({ response: { status } })).toBe(true);
    }
    for (const status of [400, 409, 500, 502]) {
      expect(isCatalogV2PricingUnavailableError({ response: { status } })).toBe(false);
    }
    expect(isCatalogV2PricingUnavailableError(new Error('Network Error'))).toBe(false);
    expect(isCatalogV2PricingUnavailableError(undefined)).toBe(false);
  });
});
