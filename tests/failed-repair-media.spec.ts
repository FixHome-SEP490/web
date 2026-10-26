import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
const { post, get, getService, getPreview, getAddresses, getBooking } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), getService: vi.fn(), getPreview: vi.fn(), getAddresses: vi.fn(), getBooking: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { post, get } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getService } }));
vi.mock('../src/api/catalog-pricing.api', () => ({ catalogPricingApi: { getPreview } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking } }));
import { blockedFailedRepair, createFailedRepairPort, failedRepairKey, uploadFailedRepairEvidence } from '../src/api/failed-repair.api';
import FailedRepairDialog from '../src/components/technician/FailedRepairDialog.vue';
import FailedRepairBookingForm from '../src/components/customer/FailedRepairBookingForm.vue';
enableAutoUnmount(afterEach);
describe('failed repair uses existing authenticated order evidence media', () => {
  beforeEach(() => post.mockReset());
  it('uploads ADDITIONAL evidence scoped to the child, never public media', async () => {
    post.mockResolvedValue({ data: { data: { id: 'evidence-B' } } });
    const file = new File(['fixture'], 'fixture.jpg', { type: 'image/jpeg' });
    expect(await uploadFailedRepairEvidence('order-B', file)).toEqual({ evidenceId: 'evidence-B' });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0]!;
    expect(url).toBe('/service-orders/order-B/evidence');
    expect(body.get('type')).toBe('additional');
    expect(body.get('file')).toBe(file);
  });
  it('rejects a missing evidence ID rather than reusing a URL', async () => {
    post.mockResolvedValue({ data: { data: { mediaUrl: 'https://example.invalid/private' } } });
    await expect(uploadFailedRepairEvidence('B', new File(['x'], 'x.jpg', { type: 'image/jpeg' }))).rejects.toThrow();
  });
  it('returns only 3 evidence IDs even when the existing API returns private signed URLs', async () => {
    post.mockImplementation(async () => ({ data: { data: { id: `evidence-${post.mock.calls.length}`, mediaUrl: 'https://example.invalid/private?signature=fixture' } } }));
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await uploadFailedRepairEvidence('order-B', new File(['fixture'], `${i}.jpg`, { type: 'image/jpeg' })));
    expect(results).toEqual([{ evidenceId: 'evidence-1' }, { evidenceId: 'evidence-2' }, { evidenceId: 'evidence-3' }]);
    expect(JSON.stringify(results)).not.toContain('signature');
    expect(post.mock.calls.every(([url]) => url === '/service-orders/order-B/evidence')).toBe(true);
  });
  it('uses the existing HTTP upload adapter and reports 3 IDs without rendering or submitting signed URLs', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    post.mockImplementation(async () => ({ data: { data: { id: `evidence-${post.mock.calls.length}`, mediaUrl: 'https://example.invalid/private?signature=fixture' } } }));
    const report = vi.fn().mockResolvedValue(undefined);
    const w = mount(FailedRepairDialog, { props: { orderId: 'order-B', parts: [], partsReady: true }, global: {
      provide: { [failedRepairKey as symbol]: { ...blockedFailedRepair, available: true, evidenceAvailable: true, uploadEvidence: uploadFailedRepairEvidence, report } },
      stubs: { Teleport: true },
    } });
    const input = w.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: Array.from({ length: 3 }, (_, i) => new File(['fixture'], `${i}.jpg`, { type: 'image/jpeg' })) });
    await input.trigger('change');
    await flushPromises();
    await w.get('input[value="no_part"]').setValue(true);
    await w.get('[data-testid="repair-failed-confirm"]').trigger('click');
    await flushPromises();
    expect(report).toHaveBeenCalledWith('order-B', { reason: 'no_part', photoEvidenceIds: ['evidence-1', 'evidence-2', 'evidence-3'], parts: [] });
    expect(w.html()).not.toContain('signature');
    expect(JSON.stringify(report.mock.calls)).not.toContain('signature');
    expect(w.findAll('img').every(img => img.attributes('src') === 'blob:local-preview')).toBe(true);
  });
});

describe('live failed-repair rebook contract at the authenticated HTTP boundary', () => {
  const raw = (ids = ['B']) => ({ sourceVisitGroupId: ids.length > 1 ? 'visit' : null, targetKind: ids.length === 1 ? 'booking' : 'visit_group',
    address: { id: 'address', text: 'Fixture' }, customerNote: 'Ghi chú', requiresNewSchedule: true, requiresPricingRevalidation: true,
    items: ids.map(id => ({ sourceBookingId: id, sourceOrderId: `order-${id}`, sourceIncidentId: `incident-${id}`, serviceId: `service-${id}`, deviceLabel: `Máy ${id}`, selectedVariantCode: 'WM-01-02', description: `Mô tả ${id}`, deviceAttributes: { brand: 'Fixture' }, quantity: 1, photos: [] })),
    confirmation: { available: true, path: `/api/v1/bookings/${ids[0]}/repair-failure-rebook` },
  });
  beforeEach(() => {
    post.mockReset(); get.mockReset();
    getAddresses.mockReset().mockResolvedValue([{ id: 'address', userId: 'customer', line1: 'Fixture', district: 'Fixture', province: 'Fixture', isDefault: true }]);
    getBooking.mockReset().mockImplementation(async id => ({ id, customerId: 'customer', serviceId: `service-${id}`, media: [] }));
    getService.mockReset().mockImplementation(async id => ({ id, name: id, code: 'WM', isActive: true }));
    getPreview.mockReset().mockImplementation(async id => ({ serviceId: id, serviceCode: 'WM', status: 'FIXED_PRICE', bindingReady: true, selectedVariant: { variantCode: 'WM-01-02', variantId: 'variant', scopeVi: 'Fixture', laborPriceVnd: 150000 }, possibleVariants: [], missingAttributes: [], priceRange: null, messageVi: '' }));
  });
  it.each([['B'], ['B', 'C'], ['A', 'B', 'C']])('GET is read-only; final POST uses the exact server failed set %j', async (...ids) => {
    const data = raw(ids);
    get.mockResolvedValue({ data: { data } });
    post.mockResolvedValue({ data: { data: { targetKind: data.targetKind, bookingId: ids.length === 1 ? 'new-B' : null, visitGroupId: ids.length > 1 ? 'new-visit' : null, items: ids.map(id => ({ sourceBookingId: id, sourceIncidentId: `incident-${id}`, bookingId: `new-${id}` })) } } });
    const api = createFailedRepairPort(() => 'customer');
    const draft = await api.readDraft([ids[0]!]);
    expect(post).not.toHaveBeenCalled();
    expect(draft.items.map(item => item.sourceBookingId)).toEqual(ids);
    expect(draft.items.every(item => !item.serviceName.includes('succeeded'))).toBe(true);
    const input = { draftId: draft.id, sourceBookingIds: ids, kind: ids.length === 1 ? 'booking' as const : 'visit' as const, addressId: 'address', date: '2090-01-01', slot: 'morning' as const, idempotencyKey: 'stable-key' };
    await expect(api.confirm(input)).resolves.toEqual({ kind: input.kind, id: ids.length === 1 ? 'new-B' : 'new-visit' });
    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0]!;
    expect(path).toBe(`/bookings/${ids[0]}/repair-failure-rebook`);
    expect(body).toEqual({ idempotencyKey: 'stable-key', addressId: 'address', date: '2090-01-01', slot: 'morning', customerNote: 'Ghi chú', items: ids.map(id => ({ sourceBookingId: id, sourceIncidentId: `incident-${id}`, selectedVariantCode: 'WM-01-02', description: `Mô tả ${id}`, deviceAttributes: { brand: 'Fixture' } })) });
    expect(JSON.stringify(body)).not.toContain('technician');
    expect(JSON.stringify(body)).not.toContain('serviceId');
  });
  it.each(['false', 'missing', 'foreign_path'])('fails closed when confirmation readiness is %s', async state => {
    const data = raw();
    if (state === 'false') Object.assign(data.confirmation, { available: false });
    if (state === 'missing') Object.assign(data, { confirmation: undefined });
    if (state === 'foreign_path') data.confirmation.path = 'https://example.invalid/rebook';
    get.mockResolvedValue({ data: { data } });
    const api = createFailedRepairPort(() => 'customer');
    await expect(api.readDraft(['B'])).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('retries an ambiguous result with exactly the same body and stable key', async () => {
    get.mockResolvedValue({ data: { data: raw() } });
    post.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ data: { data: { targetKind: 'booking', bookingId: 'new-B', visitGroupId: null, items: [{ sourceBookingId: 'B', sourceIncidentId: 'incident-B', bookingId: 'new-B' }] } } });
    const api = createFailedRepairPort(() => 'customer'); const draft = await api.readDraft(['B']);
    const input = { draftId: draft.id, sourceBookingIds: ['B'], kind: 'booking' as const, addressId: 'address', date: '2090-01-01', slot: 'morning' as const, idempotencyKey: 'same-key' };
    await expect(api.confirm(input)).rejects.toThrow();
    await expect(api.confirm(input)).resolves.toEqual({ kind: 'booking', id: 'new-B' });
    expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
    await expect(api.confirm({ ...input, idempotencyKey: 'different-key' })).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('blocks stale pricing before any create POST', async () => {
    get.mockResolvedValue({ data: { data: raw() } });
    const api = createFailedRepairPort(() => 'customer'); const draft = await api.readDraft(['B']);
    getPreview.mockResolvedValue({ serviceId: 'service-B', serviceCode: 'WM', status: 'FIXED_PRICE', bindingReady: true, selectedVariant: { variantCode: 'WM-01-02', scopeVi: 'Fixture', laborPriceVnd: 250000 } });
    await expect(api.confirm({ draftId: draft.id, sourceBookingIds: ['B'], kind: 'booking', addressId: 'address', date: '2090-01-01', slot: 'morning', idempotencyKey: 'stable-key' })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('rechecks migration readiness immediately before create and fails closed if it is withdrawn', async () => {
    get.mockResolvedValueOnce({ data: { data: raw() } });
    const api = createFailedRepairPort(() => 'customer'); const draft = await api.readDraft(['B']);
    const notReady = raw(); Object.assign(notReady.confirmation, { available: false });
    get.mockResolvedValue({ data: { data: notReady } });
    await expect(api.confirm({ draftId: draft.id, sourceBookingIds: ['B'], kind: 'booking', addressId: 'address', date: '2090-01-01', slot: 'morning', idempotencyKey: 'stable-key' })).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('keeps inspection pricing unbound and never submits an old fixed variant', async () => {
    const data = raw(); data.items[0]!.selectedVariantCode = null;
    get.mockResolvedValue({ data: { data } });
    getPreview.mockResolvedValue({ serviceId: 'service-B', serviceCode: 'WM', status: 'INSPECTION_REQUIRED', bindingReady: false, selectedVariant: null, priceRange: { minLaborVnd: 100000, maxLaborVnd: 200000 } });
    const api = createFailedRepairPort(() => 'customer');
    const draft = await api.readDraft(['B']);
    expect(draft.items[0]!.selectedVariantCode).toBeUndefined();
  });
  it('copies original authorized media into new upload claims only on final confirmation', async () => {
    const data = raw();
    data.items[0]!.photos.push({ mediaId: 'old-media', sourceBookingId: 'B', contentPath: '/api/v1/bookings/B/media/old-media/content' });
    get.mockImplementation(async path => path.endsWith('/content') ? { data: new Blob(['private'], { type: 'image/jpeg' }) } : { data: { data } });
    getBooking.mockResolvedValue({ id: 'B', customerId: 'customer', serviceId: 'service-B', media: [{ id: 'old-media', isPrivate: true, url: null, legacyInsecure: false, mimeType: 'image/jpeg', sizeBytes: 7 }] });
    post.mockImplementation(async path => path === '/media/booking-photo-upload'
      ? { data: { data: { uploadId: 'new-claim', mimeType: 'image/jpeg', sizeBytes: 7 } } }
      : { data: { data: { targetKind: 'booking', bookingId: 'new-B', visitGroupId: null, items: [{ sourceBookingId: 'B', sourceIncidentId: 'incident-B', bookingId: 'new-B' }] } } });
    const api = createFailedRepairPort(() => 'customer'); const draft = await api.readDraft(['B']);
    expect(post).not.toHaveBeenCalled();
    await api.confirm({ draftId: draft.id, sourceBookingIds: ['B'], kind: 'booking', addressId: 'address', date: '2090-01-01', slot: 'morning', idempotencyKey: 'stable-key' });
    expect(get).toHaveBeenCalledWith('/bookings/B/media/old-media/content', { responseType: 'blob' });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]![1].items[0].photoUploadIds).toEqual(['new-claim']);
    expect(JSON.stringify(post.mock.calls[1])).not.toContain('old-media');
  });
  it('the production component defaults to the live adapter and never POSTs before final confirm', async () => {
    get.mockResolvedValue({ data: { data: raw() } });
    post.mockResolvedValue({ data: { data: { targetKind: 'booking', bookingId: 'new-B', visitGroupId: null, items: [{ sourceBookingId: 'B', sourceIncidentId: 'incident-B', bookingId: 'new-B' }] } } });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/wizard', component: { template: '<div />' } }] });
    await router.push('/wizard?repairFailure=B');
    const w = mount(FailedRepairBookingForm, { props: { customerId: 'customer', sourceBookingIds: ['B'] }, global: { plugins: [router], stubs: { BookingSessionPicker: { emits: ['update:modelValue'], template: '<button data-testid="choose" @click="$emit(\'update:modelValue\', {date:\'2090-01-01\',slot:\'morning\'})">Chọn</button>' } } } });
    await flushPromises();
    expect(w.get('[data-testid="failed-address"]').element).toHaveProperty('value', 'address');
    expect(w.get('[data-testid="failed-next"]').attributes('disabled')).toBeDefined();
    expect(post).not.toHaveBeenCalled();
    await w.get('[data-testid="choose"]').trigger('click');
    await w.get('[data-testid="failed-next"]').trigger('click'); await flushPromises();
    expect(post).not.toHaveBeenCalled();
    await w.get('[data-testid="failed-final-confirm"]').trigger('click'); await flushPromises();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toBe('/bookings/B/repair-failure-rebook');
    expect(w.emitted('created')).toEqual([[{ kind: 'booking', id: 'new-B' }]]);
  });
});
