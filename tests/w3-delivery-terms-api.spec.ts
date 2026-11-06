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
  aggregateBudgetVerified: false, recordedConditionalCeilings: { count: 1, shipping: '101', customer: '71', technician: '30' },
  blockers: ['COMMISSION_NOT_FROZEN', 'DEDUCTIONS_LEDGER_SOURCE_REQUIRED', 'SELLER_TAX_PAYMENT_POLICY_REQUIRED'] };
const envelope = (data: unknown, statusCode = 200) => ({ data: { success: true, statusCode, message: 'Success', data } });
afterEach(() => vi.restoreAllMocks());

describe('W3 conditional delivery terms API boundary', () => {
  it('strictly reads conditional terms and server recorded totals', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(read));
    await expect(w3DeliveryTermsApi.read(requestId)).resolves.toEqual(read);
    expect(get).toHaveBeenCalledWith(`/part-requests/${requestId}/delivery/terms`);
  });

  it('accepts the Backend four-field ceilings and preserves every authoritative total', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(read));
    await expect(w3DeliveryTermsApi.read(requestId)).resolves.toMatchObject({
      recordedConditionalCeilings: { count: 1, shipping: '101', customer: '71', technician: '30' },
    });
    expect(BigInt(read.recordedConditionalCeilings.customer) + BigInt(read.recordedConditionalCeilings.technician))
      .toBe(BigInt(read.recordedConditionalCeilings.shipping));
  });

  it.each([
    { ...read, recordedConditionalCeilings: { count: 1, shipping: '101', technician: '30' } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, extra: '0' } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, customer: '70' } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, customer: '-1' } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, customer: '071' } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, technician: '3.0' } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, count: -1 } },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, count: Number.MAX_SAFE_INTEGER + 1 } },
  ])('rejects malformed four-field Backend ceilings %#', async body => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(body));
    await expect(w3DeliveryTermsApi.read(requestId)).rejects.toThrow();
  });

  it.each([
    { ...read, financialExecution: 'ENABLED' },
    { ...read, recordedConditionalCeilings: { ...read.recordedConditionalCeilings, payable: '30' } },
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

  it('uploads positive-fee quote evidence only through the terms evidence route', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({
      evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', purpose: 'QUOTE', quoteVersion: 1,
      verification: 'UPLOADED_BYTES_NOT_COURIER_VERIFIED',
    }, 201));
    const file = new File(['quote'], 'quote.png', { type: 'image/png' });
    await expect(w3DeliveryTermsApi.uploadEvidence(requestId, {
      warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'QUOTE', quoteVersion: 1, file,
    })).resolves.toEqual({ evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', purpose: 'QUOTE', quoteVersion: 1 });
    expect(post.mock.calls[0]?.[0]).toBe(`/part-requests/${requestId}/delivery/terms/evidence`);
  });

  it('records a positive quote through the terms proposal contract', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({ state, replayed: false }, 201));
    const body = { commandId, expectedVersion: 0, warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', courierReference: 'SHIP-101', totalShippingFee: 101 };
    await expect(w3DeliveryTermsApi.propose(requestId, body)).resolves.toMatchObject({ state, replayed: false });
    expect(post).toHaveBeenCalledWith(`/part-requests/${requestId}/delivery/terms/proposal`, body);
  });

  it('records the actual fee after both consents and verifies the returned final shares', async () => {
    const actual = { quoteVersion: 1, totalShippingFee: 4, customerShippingShare: 3,
      technicianShippingShare: 1, verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' as const };
    const actualState = { ...state, version: 2, customerConsented: true, technicianConsented: true, actual };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({ state: actualState, replayed: false }, 201));
    const body = { commandId, expectedVersion: 1, quoteVersion: 1, totalShippingFee: 4,
      evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
    await expect(w3DeliveryTermsApi.actual(requestId, body)).resolves.toMatchObject({ state: actualState });
    expect(post).toHaveBeenCalledWith(`/part-requests/${requestId}/delivery/terms/actual`, body);
  });

  it.each([
    { totalShippingFee: 0, label: 'zero is not a positive terms quote' },
    { totalShippingFee: 102, label: 'a different server quote' },
  ])('rejects a terms proposal that does not match the requested positive fee: $label', async ({ totalShippingFee }) => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({ state, replayed: false }, 201));
    await expect(w3DeliveryTermsApi.propose(requestId, {
      commandId, expectedVersion: 0, warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', courierReference: 'SHIP-101', totalShippingFee,
    })).rejects.toThrow();
  });

  it('rejects an actual acknowledgement whose final fee differs from the command', async () => {
    const actual = { quoteVersion: 1, totalShippingFee: 4, customerShippingShare: 3,
      technicianShippingShare: 1, verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' as const };
    vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({
      state: { ...state, version: 2, customerConsented: true, technicianConsented: true, actual }, replayed: false,
    }, 201));
    await expect(w3DeliveryTermsApi.actual(requestId, {
      commandId, expectedVersion: 1, quoteVersion: 1, totalShippingFee: 5,
      evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    })).rejects.toThrow();
  });

  it('rejects non-image terms evidence before any multipart upload', async () => {
    const post = vi.spyOn(apiClient, 'post');
    await expect(w3DeliveryTermsApi.uploadEvidence(requestId, {
      warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'ACTUAL', quoteVersion: 1,
      file: new File(['bad'], 'proof.txt', { type: 'text/plain' }),
    })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
