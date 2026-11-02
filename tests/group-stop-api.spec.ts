import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: mocks, getHttpStatus: (e: { response?: { status: number } }) => e.response?.status }));
import { createGroupStopPort, groupStopApi } from '../src/api/group-stop.api';
import { interruptionRebookApi } from '../src/api/interruption-rebook.api';
const group = '11111111-1111-4111-8111-111111111111';
const order = '22222222-2222-4222-8222-222222222222';
const booking = '33333333-3333-4333-8333-333333333333';
const incident = '44444444-4444-4444-8444-444444444444';
const input = { selectedOrderId: order, reasonClass: 'non_technician_exception' as const,
  reasonCode: 'customer_absent' as const, reason: 'Khách không có mặt tại địa chỉ', photoEvidenceIds: [] };
const receipt = (commandId: string) => ({ version: 1, groupId: group, commandId,
  stopped: [{ bookingId: booking, orderId: order, incidentId: incident, workStopped: true, assignmentReleased: true, operationalDisposition: 'STOPPED', financialFollowupRequired: true }],
  preserved: [], oldObligationsPreserved: true, financialFollowupRequired: true, automaticLiabilityApplied: false });
describe('atomic group stop', () => {
  beforeEach(() => vi.resetAllMocks());
  it('keeps one command across uncertain ack, dialog reopen and reconciliation; never posts children', async () => {
    const port = createGroupStopPort();
    mocks.post.mockRejectedValueOnce(new Error('network'));
    await expect(port.send(group, input)).rejects.toThrow();
    const command = port.pending(group)!;
    expect(command.commandId).toBeTruthy();
    await expect(port.send(group, { ...input, reason: 'Nội dung khác hoàn toàn' })).rejects.toThrow();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    mocks.post.mockImplementation(async (_path, body) => ({ data: { data: receipt(body.commandId) } }));
    expect((await port.send(group, input)).stopped).toHaveLength(1);
    expect(mocks.post.mock.calls.map(call => call[0])).toEqual([`/visit-groups/${group}/cannot-continue`, `/visit-groups/${group}/cannot-continue`]);
    expect(mocks.post.mock.calls[1]![1]).toEqual(command);
  });
  it('rejects malformed readiness and never treats elapsed client time as ready', async () => {
    mocks.get.mockResolvedValue({ data: { data: { ready: true } } });
    await expect(groupStopApi.readiness(group, order)).rejects.toThrow();
    expect(mocks.get).toHaveBeenCalledWith(`/visit-groups/${group}/contact-readiness`, { params: { selectedOrderId: order } });
  });
  it('locks forbidden retries', async () => {
    const port = createGroupStopPort();
    mocks.post.mockRejectedValue({ response: { status: 403 } });
    await expect(port.send(group, input)).rejects.toThrow();
    await expect(port.send(group, input)).rejects.toThrow();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign receipts and keeps the original command for reconciliation', async () => {
    const port = createGroupStopPort();
    mocks.post.mockImplementation(async (_path, body) => ({ data: { data: { ...receipt(body.commandId), groupId: order } } }));
    await expect(port.send(group, input)).rejects.toThrow();
    expect(port.pending(group)?.commandId).toBe(mocks.post.mock.calls[0]![1].commandId);
    expect(port.retryAllowed(group)).toBe(true);
  });
  it('blocks concurrent group submissions and invalidates a late response after logout reset', async () => {
    const port = createGroupStopPort();
    let finish!: (value: unknown) => void;
    mocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = port.send(group, input);
    await expect(port.send(group, input)).rejects.toThrow();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const commandId = port.pending(group)!.commandId;
    port.reset();
    finish({ data: { data: receipt(commandId) } });
    await expect(first).rejects.toThrow();
    expect(port.pending(group)).toBeNull();
  });
  it('validates reason, scope and evidence before sending', async () => {
    const port = createGroupStopPort();
    await expect(port.send(group, { ...input, reason: 'short' })).rejects.toThrow();
    await expect(port.send(group, { ...input, photoEvidenceIds: ['bad'] })).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe('read-only source availability for stopped visit devices', () => {
  beforeEach(() => vi.resetAllMocks());
  const secondBooking = '55555555-5555-4555-8555-555555555555';
  const draft = (anchor: string, ids: string[]) => ({ data: { success: true, statusCode: 200, data: {
    sourceVisitGroupId: group, confirmation: { available: true },
    items: ids.map(sourceBookingId => ({ sourceBookingId })),
  } } });
  it('skips a consumed anchor and only returns server-confirmed remaining machines', async () => {
    mocks.get.mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValueOnce(draft(secondBooking, [secondBooking]));
    expect(await interruptionRebookApi.listAvailableStoppedSources(group, [booking, secondBooking])).toEqual([secondBooking]);
    expect(mocks.get.mock.calls.map(([url]) => url)).toEqual([
      `/bookings/${booking}/interruption-draft`, `/bookings/${secondBooking}/interruption-draft`,
    ]);
  });
  it('fails closed for network/malformed responses and never claims unsupported source IDs', async () => {
    mocks.get.mockRejectedValueOnce(new Error('network'));
    await expect(interruptionRebookApi.listAvailableStoppedSources(group, [booking])).rejects.toThrow();
    mocks.get.mockResolvedValueOnce(draft(booking, [booking, secondBooking]));
    await expect(interruptionRebookApi.listAvailableStoppedSources(group, [booking])).rejects.toThrow();
    mocks.get.mockResolvedValueOnce(draft(booking, [order]));
    await expect(interruptionRebookApi.listAvailableStoppedSources(group, [booking])).rejects.toThrow();
  });
  it('returns an empty selection only when every candidate is denied by the server', async () => {
    mocks.get.mockRejectedValue({ response: { status: 403 } });
    expect(await interruptionRebookApi.listAvailableStoppedSources(group, [booking])).toEqual([]);
  });
});
