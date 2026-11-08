import { afterEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { w3DeliveryOperationsApi } from '../src/api/w3-delivery-operations.api';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const warehouseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const quote = {
  quoteVersion: 1,
  fingerprint: 'a'.repeat(64),
  policyVersion: 'W3_70_30_V1',
  totalShippingFee: 0,
  customerShippingShare: 0,
  technicianShippingShare: 0,
  laborBudget: 'UNVERIFIED',
};
const read = {
  version: 3,
  quote,
  invalidated: false,
  customerConsented: false,
  technicianConsented: false,
  actual: null,
  physical: null,
  financialExecution: 'BLOCKED',
  financialBlocker: 'FINANCE_LEDGER_SOURCE_REQUIRED',
};
const envelope = (data: unknown, statusCode = 200) => ({ data: { success: true, statusCode, message: 'Success', data } });
afterEach(() => vi.restoreAllMocks());

describe('W3 delivery operations API boundary', () => {
  it('reads only the request-scoped delivery operations endpoint and accepts explicit zero shares', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(read));
    await expect(w3DeliveryOperationsApi.read(requestId)).resolves.toEqual(read);
    expect(get.mock.calls).toEqual([[`/part-requests/${requestId}/delivery`]]);
  });

  it('accepts a positive 70/30 quote and an actual fee that does not exceed it', async () => {
    const positiveQuote = { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 };
    const positiveRead = { ...read, quote: positiveQuote, customerConsented: true, technicianConsented: true,
      actual: { totalShippingFee: 101, quoteVersion: 1 } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(positiveRead));
    await expect(w3DeliveryOperationsApi.read(requestId)).resolves.toEqual(positiveRead);
  });

  it('accepts a zero actual fee on a positive quote without deriving shares on the client', async () => {
    const positiveQuote = { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 };
    const positiveRead = { ...read, quote: positiveQuote, customerConsented: true, technicianConsented: true,
      actual: { totalShippingFee: 0, quoteVersion: 1 } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(positiveRead));
    await expect(w3DeliveryOperationsApi.read(requestId)).resolves.toMatchObject({ actual: { totalShippingFee: 0 } });
  });

  it.each([
    { quote: { ...quote, totalShippingFee: 101, customerShippingShare: 70, technicianShippingShare: 31 } },
    { quote: { ...quote, totalShippingFee: 101, customerShippingShare: 72, technicianShippingShare: 29 } },
    { quote: { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 31 } },
    { quote: { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 }, actual: { totalShippingFee: 102, quoteVersion: 1 } },
    { quote: { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 }, actual: { totalShippingFee: 101, quoteVersion: 2 } },
  ])('rejects a positive operations projection that violates 70/30 or actual bounds %#', async change => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...read, ...change }));
    await expect(w3DeliveryOperationsApi.read(requestId)).rejects.toThrow();
  });

  it.each([404, 503])('preserves HTTP %s so the UI can fail closed', async status => {
    const failure = { response: { status } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(failure);
    await expect(w3DeliveryOperationsApi.read(requestId)).rejects.toBe(failure);
  });

  it.each([
    { ...read, requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    { ...read, quote: { ...quote, totalShippingFee: 1500 } },
    { ...read, quote: { ...quote, customerShippingShare: 1 } },
    { ...read, quote: { ...quote, policyVersion: 'LEGACY_100_0' } },
    { ...read, actual: { totalShippingFee: 1, quoteVersion: 1 } },
    { ...read, physicalExecution: 'ENABLED' },
    { ...read, financialExecution: 'ENABLED' },
    { ...read, unknown: true },
  ])('rejects an invalid or financially enabled operations projection %#', async body => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(body));
    await expect(w3DeliveryOperationsApi.read(requestId)).rejects.toThrow();
  });

  it('sends consent bound to the exact quote fingerprint and zero share', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({
      version: 4, quote, customerConsented: true, technicianConsented: false,
      replayed: false, financialExecution: 'BLOCKED',
    }, 201));
    const body = {
      commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 3,
      quoteVersion: 1, quoteFingerprint: quote.fingerprint, totalShippingFee: 0,
      shippingShare: 0, accepted: true as const,
    };
    await w3DeliveryOperationsApi.consent(requestId, body);
    expect(post.mock.calls[0]?.[0]).toBe(`/part-requests/${requestId}/delivery/consent`);
    expect(post.mock.calls[0]?.[1]).toEqual(body);
  });

  it('rejects a Nest POST envelope with statusCode 200 instead of 201', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({
      version: 4, quote, customerConsented: true, technicianConsented: false,
      replayed: false, financialExecution: 'BLOCKED',
    }, 200));
    await expect(w3DeliveryOperationsApi.consent(requestId, {
      commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 3,
      quoteVersion: 1, quoteFingerprint: quote.fingerprint, totalShippingFee: 0, shippingShare: 0, accepted: true,
    })).rejects.toThrow();
  });

  it('rejects a consent acknowledgement for a different quote fingerprint', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({
      version: 4, quote: { ...quote, fingerprint: 'b'.repeat(64) }, customerConsented: true,
      technicianConsented: false, replayed: false, financialExecution: 'BLOCKED',
    }, 201));
    await expect(w3DeliveryOperationsApi.consent(requestId, {
      commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 3,
      quoteVersion: 1, quoteFingerprint: quote.fingerprint, totalShippingFee: 0, shippingShare: 0, accepted: true,
    })).rejects.toThrow();
  });

  it('rejects non-zero amount locally before any mutation', async () => {
    const post = vi.spyOn(apiClient, 'post');
    await expect(w3DeliveryOperationsApi.propose(requestId, {
      commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 0,
      warehouseId, evidenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      courierReference: 'SHIP-1', totalShippingFee: 100,
    })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('accepts a physical journal response only as recorded state, with exact warehouse quantities', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope({
      state: { status: 'RESERVED', reason: null, warehouseId, responsibleUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        quantities: [{ partId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', quantity: 2 }], version: 1, courierReference: null, evidence: [] },
      replayed: false,
    }, 201));
    await expect(w3DeliveryOperationsApi.physical(requestId, 'reserve', {
      commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 0,
    })).resolves.toMatchObject({ state: { status: 'RESERVED', version: 1 }, replayed: false });
    expect(post.mock.calls[0]?.[0]).toBe(`/part-requests/${requestId}/delivery/reserve`);
  });

  it('enforces evidence MIME and size limits before multipart upload', async () => {
    const post = vi.spyOn(apiClient, 'post');
    await expect(w3DeliveryOperationsApi.uploadEvidence(requestId, {
      warehouseId, purpose: 'QUOTE', quoteVersion: 1, file: new File(['bad'], 'proof.txt', { type: 'text/plain' }),
    })).rejects.toThrow();
    await expect(w3DeliveryOperationsApi.uploadEvidence(requestId, {
      warehouseId, purpose: 'QUOTE', quoteVersion: 1, file: new File(['x'.repeat(10 * 1024 * 1024 + 1)], 'proof.png', { type: 'image/png' }),
    })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
