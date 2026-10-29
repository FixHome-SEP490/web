import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { fundedCheckoutApi, NoActiveFundedCashReservationError, type FundedScope } from '../src/api/funded-checkout.api';
vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const id = '11111111-1111-4111-8111-111111111111';
const claim = '22222222-2222-4222-8222-222222222222';
const scopeId = '33333333-3333-4333-8333-333333333333';
const attempt = '44444444-4444-4444-8444-444444444444';
const scopes: FundedScope[] = [
  { kind: 'SOLO', serviceOrderId: scopeId, invoiceId: id },
  { kind: 'VISIT_GROUP', id: scopeId },
];
function reply(payload: unknown) {
  vi.mocked(apiClient.post).mockResolvedValue({ data: { success: true, data: payload } } as never);
}
function getReply(payload: unknown) {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: payload } } as never);
}
beforeEach(() => vi.clearAllMocks());
describe('funded checkout server-only transaction APIs', () => {
  it('reserves with only identifiers, verifies owner scope and server expiry', async () => {
    const dto = { id, claimId: claim, scopeId, attemptId: attempt,
      state: 'RESERVED', reservedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:15:00Z' };
    reply(dto);
    await expect(fundedCheckoutApi.reserve(claim, scopeId, attempt)).resolves.toEqual(dto);
    expect(apiClient.post).toHaveBeenCalledWith('/vouchers/apply',
      { claimId: claim, scopeId, attemptId: attempt });
    reply({ ...dto, scopeId: id });
    await expect(fundedCheckoutApi.reserve(claim, scopeId, attempt)).rejects.toThrow();
  });
  it('treats an expired idempotent reservation as expired and keeps wrong-role errors visible', async () => {
    reply({ id, claimId: claim, scopeId, attemptId: attempt, state: 'EXPIRED',
      reservedAt: '2026-10-27T00:00:00Z', expiresAt: '2026-10-27T00:15:00Z' });
    await expect(fundedCheckoutApi.reserve(claim, scopeId, attempt))
      .rejects.toMatchObject({ code: 'VOUCHER_RESERVATION_EXPIRED' });

    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 403 } });
    await expect(fundedCheckoutApi.reserve(claim, scopeId, attempt)).rejects.toMatchObject({ response: { status: 403 } });
  });
  it.each(scopes)('uses only opaque reservation in wallet for %o', async (scope) => {
    reply({ paid: true, amount: 89000, balance: 21000,
      ...(scope.kind === 'SOLO' ? { invoiceId: scope.invoiceId } : { visitGroupId: scope.id }) });
    await expect(fundedCheckoutApi.wallet(scope, id)).resolves.toEqual({ paid: true, amount: 89000, balance: 21000 });
    expect(apiClient.post).toHaveBeenCalledWith(
      `/finance/funded/${scope.kind === 'SOLO' ? `solo/${scope.invoiceId}` : `visit-groups/${scope.id}`}/wallet`,
      { voucherReservationId: id },
    );
  });
  it.each(scopes)('requires verified zero due response for %o', async (scope) => {
    reply({ paid: true, amount: 0, settlementId: id });
    await expect(fundedCheckoutApi.zero(scope, id)).resolves.toEqual({ paid: true, amount: 0, settlementId: id });
    reply({ paid: true, amount: 10, settlementId: id });
    await expect(fundedCheckoutApi.zero(scope, id)).rejects.toThrow();
  });
  it('rejects a non-https provider link and never sends a client amount', async () => {
    reply({ paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html' });
    await expect(fundedCheckoutApi.vnpay(scopes[0]!, id)).resolves.toContain('sandbox.vnpayment.vn');
    expect(apiClient.post).toHaveBeenCalledWith(`/finance/funded/solo/${scopes[0]!.invoiceId}/vnpay`, { voucherReservationId: id });
    reply({ paymentUrl: 'javascript:alert(1)' });
    await expect(fundedCheckoutApi.vnpay(scopes[0]!, id)).rejects.toThrow();
  });
  it('settles ZERO through the verified server closeout for the invoice or whole visit', async () => {
    for (const scope of scopes) {
      reply({ paid: true, amount: 0, settlementId: id });
      await expect(fundedCheckoutApi.zero(scope, id)).resolves.toEqual({ paid: true, amount: 0, settlementId: id });
      const route = scope.kind === 'SOLO' ? `/finance/funded/solo/${scope.invoiceId}` : `/finance/funded/visit-groups/${scope.id}`;
      expect(apiClient.post).toHaveBeenLastCalledWith(`${route}/zero-closeout`, { voucherReservationId: id });
    }
  });
  it('binds cash declaration to service order and customer confirmation to the same reservation', async () => {
    const solo = scopes[0]!;
    reply({ id, status: 'pending_confirmation', declaredAmount: 200000 });
    await expect(fundedCheckoutApi.declareCash(solo, id, { declaredAmount: 200000 })).resolves.toBeUndefined();
    expect(apiClient.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${solo.serviceOrderId}/cash/declare`, {
      declaredAmount: 200000, voucherReservationId: id,
    });

    reply({ id, status: 'confirmed', confirmedAmount: 200000 });
    await expect(fundedCheckoutApi.confirmCash(solo, id, { agreed: true })).resolves.toBeUndefined();
    expect(apiClient.post).toHaveBeenLastCalledWith(`/finance/funded/solo/${solo.serviceOrderId}/cash/confirm`, {
      agreed: true, voucherReservationId: id,
    });

    reply({ id, status: 'disputed' });
    await fundedCheckoutApi.confirmCash(scopes[1]!, id, { agreed: false, disputeReason: 'Chưa trả đủ' });
    expect(apiClient.post).toHaveBeenLastCalledWith(`/finance/funded/visit-groups/${scopeId}/cash/confirm`, {
      agreed: false, disputeReason: 'Chưa trả đủ', voucherReservationId: id,
    });

    reply({ id, status: 'verified', amount: 200000 });
    await expect(fundedCheckoutApi.confirmCash(scopes[1]!, id, { agreed: true })).resolves.toBeUndefined();
    expect(apiClient.post).toHaveBeenLastCalledWith(`/finance/funded/visit-groups/${scopeId}/cash/confirm`, {
      agreed: true, voucherReservationId: id,
    });
  });
  it.each([
    [scopes[0]!, `/finance/funded/solo/${scopeId}/cash/reservation`],
    [scopes[1]!, `/finance/funded/visit-groups/${scopeId}/cash/reservation`],
  ] as const)('reads only the assigned cash reservation context for %o', async (scope, route) => {
    getReply({ voucherReservationId: id, customerDueVnd: 175000 });
    await expect(fundedCheckoutApi.cashReservation(scope)).resolves.toEqual({
      voucherReservationId: id, customerDueVnd: 175000,
    });
    expect(apiClient.get).toHaveBeenCalledWith(route);
  });
  it.each(scopes)('maps only the explicit nullable sentinel to no funded hold for %o', async (scope) => {
    getReply({ voucherReservationId: null, customerDueVnd: null });
    await expect(fundedCheckoutApi.cashReservation(scope)).rejects.toBeInstanceOf(NoActiveFundedCashReservationError);
  });
  it('rejects malformed or ambiguous funded cash context and preserves authorization errors', async () => {
    getReply({ voucherReservationId: id, customerDueVnd: '175000' });
    await expect(fundedCheckoutApi.cashReservation(scopes[0]!)).rejects.toThrow();
    getReply({ voucherReservationId: null, customerDueVnd: 175000 });
    await expect(fundedCheckoutApi.cashReservation(scopes[0]!)).rejects.not.toBeInstanceOf(NoActiveFundedCashReservationError);
    vi.mocked(apiClient.get).mockRejectedValueOnce({ response: { status: 403 } });
    await expect(fundedCheckoutApi.cashReservation(scopes[1]!)).rejects.toMatchObject({ response: { status: 403 } });
  });
  it.each([409, 503])('preserves HTTP %i lookup failures for fail-closed handling', async (status) => {
    vi.mocked(apiClient.get).mockRejectedValueOnce({ response: { status } });
    await expect(fundedCheckoutApi.cashReservation(scopes[0]!)).rejects.toMatchObject({ response: { status } });
  });
  it('rejects invalid reservation IDs before making a network call', async () => {
    await expect(fundedCheckoutApi.wallet(scopes[0]!, 'invalid')).rejects.toThrow();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
