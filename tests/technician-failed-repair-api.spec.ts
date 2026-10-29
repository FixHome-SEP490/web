import { beforeEach, describe, expect, it, vi } from 'vitest';
const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { post, get }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
import { createTechnicianFailedRepairPort } from '../src/api/technician-failed-repair.api';

const input = () => ({ reason: 'no_part' as const, photoEvidenceIds: ['photo-B'], parts: [{ partRequestId: 'part-B', outcome: 'returned' as const }] });
const receipt = () => ({ data: { data: { id: 'order-B', status: 'cancelled', laborTotal: 0, partsTotal: 0, grandTotal: 0 } } });
describe('technician failed repair concrete adapter', () => {
  beforeEach(() => { post.mockReset(); get.mockReset(); });
  it('reports only selected child with private IDs and leaves financial/stock authority on server', async () => {
    post.mockResolvedValue(receipt());
    const api = createTechnicianFailedRepairPort();
    await expect(api.report('order-B', input())).resolves.toBeUndefined();
    expect(post.mock.calls).toEqual([['/service-orders/order-B/repair-failed', input()]]);
    expect(api.available).toBe(true);
    expect(api.evidenceAvailable).toBe(true);
    await expect(api.readDraft(['B'])).rejects.toThrow();
  });
  it.each([401, 403, 409, 422])('preserves a definite HTTP %s rejection, never claims success', async status => {
    post.mockRejectedValue({ response: { status } });
    await expect(createTechnicianFailedRepairPort().report('order-B', input())).rejects.toMatchObject({ uncertain: false });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('reads back and replays the immutable request after a timeout, even with historical cancelled GET', async () => {
    post.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(receipt());
    get.mockResolvedValue({ data: { data: { id: 'order-B', historical: true, status: 'cancelled' } } });
    const api = createTechnicianFailedRepairPort();
    const body = input();
    await expect(api.report('order-B', body)).rejects.toMatchObject({ uncertain: true });
    body.parts[0]!.outcome = 'installed' as 'returned';
    await expect(api.report('order-B', body)).rejects.toThrow();
    await expect(api.reconcileReport!('order-B')).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith('/service-orders/order-B');
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
    expect(post.mock.calls[1]![1].parts[0].outcome).toBe('returned');
  });
  it.each([
    { id: 'order-C', status: 'cancelled', laborTotal: 0, partsTotal: 0, grandTotal: 0 },
    { id: 'order-B', status: 'under_repair', laborTotal: 0, partsTotal: 0, grandTotal: 0 },
    { id: 'order-B', status: 'cancelled', laborTotal: 0, partsTotal: 0, grandTotal: 100 },
    { id: 'order-B', status: 'cancelled' },
  ])('rejects an unconfirmed result %j', async data => {
    post.mockResolvedValue({ data: { data } });
    await expect(createTechnicianFailedRepairPort().report('order-B', input())).rejects.toMatchObject({ uncertain: true });
  });
  it('never treats unrelated cancellation or 409 conflict as confirmed replay', async () => {
    post.mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce({ response: { status: 409, data: { error: { code: 'CONFLICT', message: 'Báo cáo đã được ghi nhận với nội dung khác.' } } } });
    get.mockResolvedValue({ data: { data: { id: 'order-B', status: 'cancelled', historical: true } } });
    const api = createTechnicianFailedRepairPort();
    await expect(api.report('order-B', input())).rejects.toThrow();
    await expect(api.reconcileReport!('order-B')).rejects.toMatchObject({ uncertain: false, locked: true });
  });
  it('uploads to technician evidence route and never customer/public upload', async () => {
    post.mockResolvedValue({ data: { data: { id: 'photo-B' } } });
    const file = new File(['image'], 'fixture.webp', { type: 'image/webp' });
    await expect(createTechnicianFailedRepairPort().uploadEvidence('order-B', file)).resolves.toEqual({ evidenceId: 'photo-B' });
    expect(post.mock.calls[0]![0]).toBe('/service-orders/order-B/evidence');
    expect(post.mock.calls[0]![1].get('type')).toBe('additional');
    expect(post.mock.calls[0]![1].get('file')).toBe(file);
  });
  it.each(['image/gif', 'application/pdf'])('rejects unsupported %s before upload', async type => {
    await expect(createTechnicianFailedRepairPort().uploadEvidence('order-B', new File(['x'], 'fixture', { type }))).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('rejects invalid reason, duplicate photos and more than 3 photos without POST', async () => {
    const api = createTechnicianFailedRepairPort();
    for (const bad of [{ ...input(), reason: '' }, { ...input(), photoEvidenceIds: ['p', 'p'] }, { ...input(), photoEvidenceIds: ['a', 'b', 'c', 'd'] }]) {
      await expect(api.report('order-B', bad as ReturnType<typeof input>)).rejects.toThrow();
    }
    expect(post).not.toHaveBeenCalled();
  });
});
