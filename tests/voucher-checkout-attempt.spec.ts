import { describe, expect, it } from 'vitest';
import {
  acceptVoucherQuote,
  beginVoucherAttempt,
  classifyAuthoritativeDue,
  remainingHoldSeconds,
  type VoucherAttemptKey,
} from '../src/components/vouchers/voucher-checkout-attempt';

const scopes: VoucherAttemptKey['scope'][] = [
  { type: 'SOLO', id: 'order-1' },
  { type: 'VISIT_GROUP', id: 'visit-1' },
];
const methods: VoucherAttemptKey['method'][] = ['WALLET', 'VNPAY', 'CASH'];

describe('voucher checkout attempt plumbing', () => {
  it.each(scopes.flatMap((scope) => methods.map((method) => [scope, method] as const)))(
    'binds selected claim, scope and %s method before any settlement',
    (scope, method) => {
      const key: VoucherAttemptKey = { claimId: 'claim-1', scope, method };
      const pending = beginVoucherAttempt(key, true, 'request-1');
      expect(pending).toEqual({ status: 'reserving', key, requestId: 'request-1' });

      const pendingQuote = { opaque: 'server-owned quote' };
      const awaitingSettlement = acceptVoucherQuote(pending, {
        requestId: 'request-1', key, quote: pendingQuote, expiresAtMs: 1_900_000,
      }, 1_000_000);
      expect(awaitingSettlement).toEqual({
        status: 'awaiting_settlement', key, requestId: 'request-1', quote: pendingQuote, expiresAtMs: 1_900_000,
      });
      expect(awaitingSettlement).not.toHaveProperty('paymentSucceeded');
      expect(awaitingSettlement).not.toHaveProperty('amountToCharge');
    },
  );

  it('stays disabled while the signed backend attempt contract is unavailable', () => {
    const key: VoucherAttemptKey = { claimId: 'claim-1', scope: scopes[0]!, method: 'WALLET' };
    expect(beginVoucherAttempt(key, false, 'request-1')).toEqual({ status: 'disabled', reason: 'backend_unavailable' });
  });

  it('rejects a quote for a stale request, claim, scope or payment method', () => {
    const key: VoucherAttemptKey = { claimId: 'claim-1', scope: scopes[0]!, method: 'VNPAY' };
    const pending = beginVoucherAttempt(key, true, 'request-current');
    const candidate = { requestId: 'request-current', key, quote: {}, expiresAtMs: 1_900_000 };
    expect(acceptVoucherQuote(pending, { ...candidate, requestId: 'request-old' }, 1_000_000)).toBeNull();
    expect(acceptVoucherQuote(pending, { ...candidate, key: { ...key, claimId: 'claim-old' } }, 1_000_000)).toBeNull();
    expect(acceptVoucherQuote(pending, { ...candidate, key: { ...key, scope: scopes[1]! } }, 1_000_000)).toBeNull();
    expect(acceptVoucherQuote(pending, { ...candidate, key: { ...key, method: 'CASH' } }, 1_000_000)).toBeNull();
    expect(acceptVoucherQuote(pending, { ...candidate, expiresAtMs: Number.NaN }, 1_000_000)).toBeNull();
    expect(acceptVoucherQuote(pending, { ...candidate, expiresAtMs: 999_999 }, 1_000_000)).toBeNull();
  });

  it('counts down the server supplied 15 minute hold and never extends an expired hold', () => {
    const nowMs = 1_000_000;
    expect(remainingHoldSeconds(nowMs + 15 * 60 * 1000, nowMs)).toBe(900);
    expect(remainingHoldSeconds(nowMs + 14_999, nowMs)).toBe(15);
    expect(remainingHoldSeconds(nowMs - 1, nowMs)).toBe(0);
  });

  it('treats authoritative zero due as awaiting backend finalization, never as a paid result', () => {
    expect(classifyAuthoritativeDue(0)).toBe('zero_due_requires_server_finalization');
    expect(classifyAuthoritativeDue(1)).toBe('customer_payment_required');
    expect(classifyAuthoritativeDue(-1)).toBe('invalid');
    expect(classifyAuthoritativeDue(Number.NaN)).toBe('invalid');
  });
});
