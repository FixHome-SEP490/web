import { afterEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { w3DeliveryTermsApi } from '../src/api/w3-delivery-terms.api';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const commandId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fingerprint = 'a'.repeat(64);
const quote = { quoteVersion: 1, policyVersion: 'W3_70_30_V1', totalShippingFee: 101,
  customerShippingShare: 71, technicianShippingShare: 30, fingerprint };
const state = { version: 1, scope: 'CONDITIONAL_TERMS_ONLY', quote, customerConsented: false,
  technicianConsented: false, actual: null, financialExecution: 'BLOCKED', laborBudget: null,
  aggregateBudgetVerified: false, paymentVerified: false };
const read = { state, invalidated: false, financialExecution: 'BLOCKED', laborBudget: null,
  aggregateBudgetVerified: false, recordedConditionalCeilings: { count: 1, shipping: '101', technician: '30' },
  blockers: ['COMMISSION_NOT_FROZEN', 'DEDUCTIONS_LEDGER_SOURCE_REQUIRED', 'SELLER_TAX_PAYMENT_POLICY_REQUIRED'] };
const envelope = (data: unknown, statusCode = 200) => ({ data: { success: true, statusCode, message: 'Success', data } });
afterEach(() => vi.restoreAllMocks());

describe('W3 conditional delivery terms API boundary', () => {
  it('strictly reads conditional terms and server recorded totals', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(read));
    await expect(w3DeliveryTermsApi.read(requestId)).resolves.toEqual(read);
    expect(get).toHaveBeenCalledWith(`/part-requests/${requestId}/delivery/terms`);
  });

  it.each([
    { ...read, financialExecution: 'ENABLED' },
    { ...read, recordedConditionalCeilings: { count: 1, shipping: '101', technician: '30', payable: '30' } },
    { ...read, state: { ...state, scope: 'FINANCE_APPROVED' } },
    { ...read, state: { ...state, quote: { ...quote, technicianShippingShare: 29 } } },
    { ...read, state: { ...state, paymentVerified: true } },
    { ...read, unknown: true },
  ])('fails closed on malformed or financially authoritative response %#', async body => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(body));
    await expect(w3DeliveryTermsApi.read(requestId)).rejects.toThrow();
  });

  it('binds each consent payload to the quote fingerprint and that party share', async () => {
    const consentState = { ...state, version: 2, customerConsented: true };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({ state: consentState, replayed: false }, 201));
    const body = { commandId, expectedVersion: 1, quoteVersion: 1, quoteFingerprint: fingerprint,
      totalShippingFee: 101, shippingShare: 71, accepted: true as const };
    await expect(w3DeliveryTermsApi.consent(requestId, body, 71)).resolves.toMatchObject({ state: consentState });
    expect(post).toHaveBeenCalledWith(`/part-requests/${requestId}/delivery/terms/consent`, body);
  });

  it('rejects a share that does not match either server-authoritative party share', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({ state: { ...state, version: 2 }, replayed: false }, 201));
    const consent = { commandId, expectedVersion: 1, quoteVersion: 1, quoteFingerprint: fingerprint,
      totalShippingFee: 101, shippingShare: 70, accepted: true as const };
    await expect(w3DeliveryTermsApi.consent(requestId, consent, 71)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
