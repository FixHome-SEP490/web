import { describe, expect, it } from 'vitest';
import {
  canShowPersonalVoucher,
  filterCustomerVoucherOffers,
  formatVoucherDate,
  formatVoucherCountdown,
  getVoucherClaimGate,
  remainingReservationSeconds,
  validateVoucherCampaignDraft,
  type VoucherOffer,
} from '../src/components/vouchers/voucher-model';

const offer: VoucherOffer = {
  id: 'offer-1',
  code: 'FIXHOME10',
  title: 'Ưu đãi sửa chữa',
  description: 'Áp dụng cho dịch vụ đủ điều kiện.',
  kind: 'PERSONAL',
  status: 'ACTIVE',
  discount: { type: 'PERCENT', value: 10, capVnd: 100000 },
  minSpendVnd: 200000,
  scope: ['LABOR', 'PARTS'],
  categoryNames: ['Điện lạnh'],
  serviceNames: ['Sửa máy lạnh'],
  startsAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-11-01T00:00:00.000Z',
  perCustomerLimit: 1,
  successfulRedemptionLimit: 100,
  remainingSuccessfulRedemptions: 42,
  ownerCustomerId: 'customer-1',
  walletStatus: 'AVAILABLE',
  eligibility: { eligible: true, reasons: [] },
};

describe('voucher UI policy helpers', () => {
  it('shows a personal voucher only to its authenticated owner', () => {
    expect(canShowPersonalVoucher(offer, 'customer-1')).toBe(true);
    expect(canShowPersonalVoucher(offer, 'customer-2')).toBe(false);
    expect(canShowPersonalVoucher(offer, null)).toBe(false);
  });

  it('keeps claimed GENERAL vouchers in the authenticated owner’s wallet only', () => {
    const ownedGeneral = { ...offer, kind: 'GENERAL' as const, ownerCustomerId: 'customer-1' };
    const foreignGeneral = { ...ownedGeneral, id: 'offer-foreign', ownerCustomerId: 'customer-2' };
    const foreignPersonal = { ...offer, id: 'personal-foreign', ownerCustomerId: 'customer-2' };

    expect(filterCustomerVoucherOffers([ownedGeneral, foreignGeneral, offer, foreignPersonal], 'customer-1'))
      .toEqual([ownedGeneral, offer]);
    expect(filterCustomerVoucherOffers([ownedGeneral, foreignGeneral, offer, foreignPersonal], 'customer-2'))
      .toEqual([foreignGeneral, foreignPersonal]);
  });

  it('does not expose wallet vouchers to a guest without an authenticated customer ID', () => {
    expect(filterCustomerVoucherOffers([offer], null)).toEqual([]);
  });

  it('derives a reservation countdown from the server timestamps and monotonic elapsed time', () => {
    expect(
      remainingReservationSeconds(
        { expiresAt: '2026-10-26T10:15:00.000Z', serverTimeAtResponse: '2026-10-26T10:00:00.000Z' },
        1000,
      ),
    ).toBe(899);
    expect(formatVoucherCountdown(899)).toBe('14:59');
  });

  it('formats voucher dates for Vietnam local time', () => {
    expect(formatVoucherDate('2026-11-01T00:00:00+07:00')).toBe('01/11/2026');
  });

  it('keeps claim disabled when the voucher adapter is not connected', () => {
    expect(getVoucherClaimGate(offer, { connected: false, customerId: 'customer-1' })).toEqual({
      enabled: false,
      reason: 'Ưu đãi chưa thể sử dụng vì dịch vụ voucher chưa được kết nối.',
    });
  });

  it('preserves a server eligibility reason instead of enabling a claim', () => {
    const ineligible = { ...offer, kind: 'GENERAL' as const, ownerCustomerId: null, walletStatus: null, eligibility: { eligible: false, reasons: ['Đơn chưa đạt mức tối thiểu.'] } };
    expect(getVoucherClaimGate(ineligible, { connected: true, customerId: 'customer-1' })).toEqual({
      enabled: false,
      reason: 'Đơn chưa đạt mức tối thiểu.',
    });
  });

  it('rejects campaign drafts that omit either labor or parts from the approved scope', () => {
    const errors = validateVoucherCampaignDraft({
      title: 'Ưu đãi tháng 11',
      code: 'THANG11',
      discountType: 'PERCENT',
      discountValue: 10,
      capVnd: 100000,
      minSpendVnd: 200000,
      startsOn: '2026-11-01',
      endsOn: '2026-11-30',
      successfulRedemptionLimit: 100,
      perCustomerLimit: 1,
      scope: ['LABOR'],
    });
    expect(errors).toContain('Voucher phải áp dụng cho cả tiền công và linh kiện.');
  });

  it('rejects an invalid quota instead of inventing a successful-redemption allowance', () => {
    const errors = validateVoucherCampaignDraft({
      title: 'Ưu đãi tháng 11',
      code: 'THANG11',
      discountType: 'PERCENT',
      discountValue: 10,
      capVnd: 100000,
      minSpendVnd: 200000,
      startsOn: '2026-11-01',
      endsOn: '2026-11-30',
      successfulRedemptionLimit: 0,
      perCustomerLimit: 1,
      scope: ['LABOR', 'PARTS'],
    });
    expect(errors).toContain('Hạn mức chiến dịch phải là số nguyên dương không quá 2.147.483.647.');
  });
});
