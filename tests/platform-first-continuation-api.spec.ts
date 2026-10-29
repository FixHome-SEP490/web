import { beforeEach, describe, expect, it, vi } from 'vitest';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get, post }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
import { createCannotContinuePort, customerContinuationApi } from '../src/api/platform-continuation.api';

export const orderId = '10000000-0000-4000-8000-000000000001';
export const bookingId = '20000000-0000-4000-8000-000000000001';
export const incidentId = '30000000-0000-4000-8000-000000000001';
const envelope = (data: unknown) => ({ data: { data } });
function result() {
  return { version: 1, incidentId, serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED', serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
    oldObligations: { reviewRequired: true, quotePreserved: true, moneyPreserved: true, partsPreserved: true, physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' },
    customerContinuation: { eligible: true, independentNewBookingAllowed: true, prefilledRebookAvailable: false, requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true, source: { serviceOrderId: orderId, bookingId, incidentId, visitGroupId: null } } };
}
const input = () => ({ reasonClass: 'technician_skill_gap' as const, reasonCode: 'skill_gap' as const, reason: '  Chưa đủ kỹ năng sửa thiết bị này.  ', photoEvidenceIds: [] });
const t2 = (patch: Record<string, unknown> = {}) => {
  const data = result();
  data.customerContinuation.prefilledRebookAvailable = true;
  Object.assign(data.customerContinuation, {
    draftPath: `/api/v1/bookings/${bookingId}/interruption-draft`,
    confirmationPath: `/api/v1/bookings/${bookingId}/interruption-rebook`,
    targetKind: 'booking', sourceCount: 1,
  }, patch);
  return data;
};
beforeEach(() => { get.mockReset(); post.mockReset(); });

describe('T1 continuation boundary', () => {
  it('reads only the authenticated source and validates its links', async () => {
    get.mockResolvedValue(envelope(result()));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).resolves.toMatchObject(result());
    expect(get).toHaveBeenCalledWith(`/service-orders/${orderId}/customer-continuation`);
    const wrong = result(); wrong.customerContinuation.source.serviceOrderId = bookingId;
    get.mockResolvedValue(envelope(wrong));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).rejects.toThrow();
  });
  it.each(['eligible', 'independentNewBookingAllowed', 'requiresNewSchedule', 'requiresPricingRevalidation', 'requiresCustomerConfirmation'])('fails closed on malformed %s', async key => {
    const data = result(); Object.assign(data.customerContinuation, { [key]: 'true' });
    get.mockResolvedValue(envelope(data));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).rejects.toThrow();
  });
  it('does not infer cancellation or zero obligations from an unsupported result', async () => {
    post.mockResolvedValue(envelope({ ...result(), serviceOrderStatus: 'cancelled', terminalTransitionApplied: true }));
    await expect(createCannotContinuePort().send(orderId, bookingId, null, input())).rejects.toThrow();
  });
  it('retries an uncertain command with exactly the same UUID and normalized payload', async () => {
    post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(envelope(result()));
    const api = createCannotContinuePort();
    await expect(api.send(orderId, bookingId, null, input())).rejects.toThrow();
    await api.send(orderId, bookingId, null, input());
    expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
    const body = post.mock.calls[0]![1];
    expect(body.commandId).toMatch(/^[\da-f-]{14}4[\da-f-]{21}$/i);
    expect(body.reason).toBe(input().reason.trim());
    expect(body).not.toHaveProperty('evidenceRefs');
  });
  it('rejects changed payload while result is uncertain and suppresses double submit', async () => {
    let reject!: (e: unknown) => void;
    post.mockReturnValue(new Promise((_, no) => { reject = no; }));
    const api = createCannotContinuePort();
    const first = api.send(orderId, bookingId, null, input());
    await expect(api.send(orderId, bookingId, null, input())).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
    reject(new Error('network')); await expect(first).rejects.toThrow();
    await expect(api.send(orderId, bookingId, null, { ...input(), reason: 'Một nội dung hoàn toàn khác.' })).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it.each([
    { reasonCode: 'customer_absent' }, { reasonCode: 'customer_cancelled' }, { reasonCode: 'severe_damage' },
    { reason: 'ngắn' }, { photoEvidenceIds: ['https://example.test/photo.jpg'] },
    { photoEvidenceIds: [incidentId, incidentId] }, { photoEvidenceIds: [incidentId, bookingId, orderId, '40000000-0000-4000-8000-000000000001'] },
  ])('rejects invalid reason/evidence %j before HTTP', async patch => {
    await expect(createCannotContinuePort().send(orderId, bookingId, null, { ...input(), ...patch } as ReturnType<typeof input>)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('preserves the command through forbidden/conflict responses; no fallback cancel', async () => {
    const api = createCannotContinuePort(); post.mockRejectedValue({ response: { status: 403 } });
    await expect(api.send(orderId, bookingId, null, input())).rejects.toThrow();
    expect(post.mock.calls[0]![0]).toBe(`/service-orders/${orderId}/cannot-continue`);
    expect(api.pending(orderId)?.commandId).toBeTruthy();
  });
});

describe('T2 prefilled rebook metadata', () => {
  it('accepts the exact T2 draft/confirmation metadata for the viewed source', async () => {
    get.mockResolvedValue(envelope(t2()));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).resolves.toMatchObject({
      customerContinuation: {
        prefilledRebookAvailable: true,
        prefilledRebook: {
          draftPath: `/api/v1/bookings/${bookingId}/interruption-draft`,
          confirmationPath: `/api/v1/bookings/${bookingId}/interruption-rebook`,
          targetKind: 'booking', sourceCount: 1,
        },
        source: { serviceOrderId: orderId, bookingId },
      },
    });
  });
  it('accepts an exact multi-source group draft', async () => {
    const groupId = '40000000-0000-4000-8000-000000000001';
    const data = t2({ targetKind: 'visit_group', sourceCount: 2 });
    data.customerContinuation.source.visitGroupId = groupId;
    get.mockResolvedValue(envelope(data));
    await expect(customerContinuationApi.get(orderId, bookingId, groupId)).resolves.toMatchObject({
      customerContinuation: { prefilledRebook: { targetKind: 'visit_group', sourceCount: 2 } },
    });
  });
  it.each([
    { draftPath: 'https://example.test/interruption-draft' },
    { draftPath: `/api/v1/bookings/${orderId}/interruption-draft` },
    { confirmationPath: 'https://example.test/interruption-rebook' },
    { confirmationPath: `/api/v1/bookings/${orderId}/interruption-rebook` },
    { targetKind: 'visit_group' },
    { sourceCount: 0 }, { sourceCount: 4 }, { sourceCount: 1.5 }, { sourceCount: '1' },
    { draftPath: undefined }, { confirmationPath: undefined }, { targetKind: undefined }, { sourceCount: undefined },
  ])('fails closed on malformed or foreign T2 metadata %j', async patch => {
    get.mockResolvedValue(envelope(t2(patch)));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).rejects.toThrow();
  });
  it('requires metadata when prefill is available and rejects it when unavailable', async () => {
    const missing = result();
    missing.customerContinuation.prefilledRebookAvailable = true;
    get.mockResolvedValue(envelope(missing));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).rejects.toThrow();
    const t1WithMetadata = result();
    Object.assign(t1WithMetadata.customerContinuation, {
      draftPath: `/api/v1/bookings/${bookingId}/interruption-draft`,
      confirmationPath: `/api/v1/bookings/${bookingId}/interruption-rebook`,
      targetKind: 'booking', sourceCount: 1,
    });
    get.mockResolvedValue(envelope(t1WithMetadata));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).rejects.toThrow();
  });
  it('rejects T2 metadata whose source is outside the viewed booking/order', async () => {
    const data = t2();
    data.customerContinuation.source.bookingId = '40000000-0000-4000-8000-000000000001';
    get.mockResolvedValue(envelope(data));
    await expect(customerContinuationApi.get(orderId, bookingId, null)).rejects.toThrow();
  });
});
