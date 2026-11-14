import { describe, expect, it } from 'vitest';
import { campaignOffer, validateVoucherCampaignDraft } from '../src/components/vouchers/voucher-model';

// BUG 62 (PO 13/11/2026): the admin sets how many times one customer may use a general voucher.
const draft = (perCustomerLimit: number) => ({
  title: 'Ưu đãi QA', code: 'QA_LIMIT', kind: 'GENERAL' as const, discountType: 'PERCENT' as const, discountValue: 10,
  capVnd: null, minSpendVnd: 0, startsOn: '2026-11-20T08:00', endsOn: '2026-11-30T20:00', successfulRedemptionLimit: 100,
  perCustomerLimit, scope: ['LABOR', 'PARTS'] as ('LABOR' | 'PARTS')[], categoryIds: [], serviceIds: [],
});

describe('voucher uses per customer (BUG 62)', () => {
  it('accepts 1 to 100 and refuses anything else', () => {
    expect(validateVoucherCampaignDraft(draft(1) as never)).toEqual([]);
    expect(validateVoucherCampaignDraft(draft(3) as never)).toEqual([]);
    expect(validateVoucherCampaignDraft(draft(100) as never)).toEqual([]);
    for (const bad of [0, 101, 1.5, Number.NaN]) {
      expect(validateVoucherCampaignDraft(draft(bad) as never).join(' ')).toContain('từ 1 đến 100');
    }
  });
  it('shows the campaign limit read from the server, 1 for an older campaign', () => {
    const base = { id: 'c1', code: 'QA', name: 'QA', kind: 'GENERAL', active: true, startsAt: '2026-11-20T01:00:00Z', endsAt: '2026-11-30T13:00:00Z',
      quota: 100, redeemed: 0, policy: { discount: 'PERCENT', value: 10, capVnd: null, minimumVnd: 0, categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] } };
    expect(campaignOffer({ ...base, perCustomerLimit: 3 } as never).perCustomerLimit).toBe(3);
    expect(campaignOffer(base as never).perCustomerLimit).toBe(1);
  });
});
