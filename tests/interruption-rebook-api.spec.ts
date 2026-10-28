import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), getBooking: vi.fn(), getOrder: vi.fn(),
  getMine: vi.fn(), getService: vi.fn(), getPreview: vi.fn(), getAddresses: vi.fn(),
}));
vi.mock('../src/api/client', () => ({ default: { get: mocks.get, post: mocks.post } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: mocks.getBooking } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getOrder: mocks.getOrder } }));
vi.mock('../src/api/support-cases.api', () => ({ supportCasesApi: { getMine: mocks.getMine } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getService: mocks.getService } }));
vi.mock('../src/api/catalog-pricing.api', () => ({ catalogPricingApi: { getPreview: mocks.getPreview } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses: mocks.getAddresses } }));

import { interruptionRebookApi } from '../src/api/interruption-rebook.api';

const ids = {
  booking: '11111111-1111-4111-8111-111111111111',
  second: '22222222-2222-4222-8222-222222222222',
  order: '33333333-3333-4333-8333-333333333333',
  case: '44444444-4444-4444-8444-444444444444',
  service: '55555555-5555-4555-8555-555555555555',
  address: '66666666-6666-4666-8666-666666666666',
  group: '77777777-7777-4777-8777-777777777777',
};
const rawDraft = (count = 1) => ({
  sourceVisitGroupId: count > 1 ? ids.group : null,
  targetKind: count > 1 ? 'visit_group' : 'booking',
  address: { id: ids.address, text: 'Test address' },
  customerNote: 'Ghi chú cũ',
  items: Array.from({ length: count }, (_, index) => ({
    sourceBookingId: index ? ids.second : ids.booking,
    sourceOrderId: ids.order,
    sourceCaseId: ids.case,
    serviceId: ids.service,
    deviceLabel: 'Thiết bị',
    selectedVariantCode: 'AC-01-01',
    description: 'Mô tả cũ',
    deviceAttributes: { brand: 'A' },
    quantity: 1,
    photos: [],
    previousTechnicianId: '88888888-8888-4888-8888-888888888888',
  })),
  requiresNewSchedule: true,
  requiresPricingRevalidation: true,
  confirmation: { available: true, path: '/api/v1/bookings/' + ids.booking + '/interruption-rebook' },
});
const ok = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'OK', data } });

describe('interruptionRebookApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(ok(rawDraft()));
    mocks.getBooking.mockImplementation(async (id: string) => ({ id, customerId: 'customer', serviceId: ids.service, status: 'CANCELLED', visitGroupId: null }));
    mocks.getOrder.mockResolvedValue({ id: ids.order, bookingId: ids.booking, status: 'CANCELLED' });
    mocks.getMine.mockResolvedValue({ id: ids.case, bookingId: ids.booking, serviceOrderId: ids.order, caseType: 'mid_job_interruption', status: 'resolved', resolutionCode: 'interrupted_for_rebook' });
    mocks.getService.mockResolvedValue({ id: ids.service, code: 'AC', name: 'Điều hòa', isActive: true });
    mocks.getPreview.mockResolvedValue({
      serviceId: ids.service, serviceCode: 'AC', status: 'FIXED_PRICE', bindingReady: true,
      selectedVariant: { variantId: 'v1', variantCode: 'AC-01-01', scopeVi: 'Vệ sinh', laborPriceVnd: 200000 },
      possibleVariants: [{ variantId: 'v1', variantCode: 'AC-01-01', scopeVi: 'Vệ sinh', laborPriceVnd: 200000 }],
      missingAttributes: [], priceRange: null, messageVi: 'Giá hiện tại',
    });
    mocks.getAddresses.mockResolvedValue([{ id: ids.address, userId: 'customer', line1: 'Test', district: 'D', province: 'P', isDefault: true }]);
  });

  it('loads linked cancelled sources with verified interruption cases and a fresh server price preview', async () => {
    const draft = await interruptionRebookApi.readDraft(ids.booking, 'customer');
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]?.pricing.possibleVariants[0]?.laborPriceVnd).toBe(200000);
    expect(draft.items[0]?.selectedVariantCode).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith('/bookings/' + ids.booking + '/interruption-draft');
    expect(mocks.getMine).toHaveBeenCalledWith(ids.case);
  });

  it('rejects a draft whose case does not belong to its linked source order and booking', async () => {
    mocks.getMine.mockResolvedValueOnce({ id: ids.case, bookingId: ids.second, serviceOrderId: ids.order, caseType: 'mid_job_interruption', status: 'resolved', resolutionCode: 'interrupted_for_rebook' });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).rejects.toThrow();
  });

  it.each(['mid_job_interruption', 'technician_replacement'])('accepts a server-attested %s interruption source', async caseType => {
    mocks.getMine.mockResolvedValueOnce({ id: ids.case, bookingId: ids.booking, serviceOrderId: ids.order, caseType, status: 'resolved', resolutionCode: 'interrupted_for_rebook' });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).resolves.toMatchObject({ items: [{ sourceCaseId: ids.case }] });
  });

  it('accepts a technician replacement case with null bookingId when its order link is exact', async () => {
    mocks.getMine.mockResolvedValueOnce({ id: ids.case, bookingId: null, serviceOrderId: ids.order, caseType: 'technician_replacement', status: 'resolved', resolutionCode: 'interrupted_for_rebook' });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).resolves.toMatchObject({ items: [{ sourceCaseId: ids.case }] });
  });

  it.each([
    { caseType: 'technician_replacement', bookingId: ids.second },
    { caseType: 'mid_job_interruption', bookingId: null },
  ])('rejects a null or mismatching booking link outside the technician-case exception: %o', async sourceCase => {
    mocks.getMine.mockResolvedValueOnce({ id: ids.case, serviceOrderId: ids.order, status: 'resolved', resolutionCode: 'interrupted_for_rebook', ...sourceCase });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).rejects.toThrow();
  });

  it('rejects an unrelated case type even when its status and resolution code look terminal', async () => {
    mocks.getMine.mockResolvedValueOnce({ id: ids.case, bookingId: ids.booking, serviceOrderId: ids.order, caseType: 'quality', status: 'resolved', resolutionCode: 'interrupted_for_rebook' });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).rejects.toThrow();
  });

  it('rejects a wrong owner, active source order, or unavailable confirmation path', async () => {
    mocks.getBooking.mockResolvedValueOnce({ id: ids.booking, customerId: 'other', serviceId: ids.service, status: 'CANCELLED', visitGroupId: null });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).rejects.toThrow();
    mocks.getBooking.mockResolvedValueOnce({ id: ids.booking, customerId: 'customer', serviceId: ids.service, status: 'UNDER_REPAIR', visitGroupId: null });
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).rejects.toThrow();
    mocks.get.mockResolvedValueOnce(ok({ ...rawDraft(), confirmation: { available: false } }));
    await expect(interruptionRebookApi.readDraft(ids.booking, 'customer')).rejects.toThrow();
  });

  it('submits customer-selected schedule, address, variant and intent with an idempotency key', async () => {
    const loaded = await interruptionRebookApi.readDraft(ids.booking, 'customer');
    expect(loaded.addresses.map(address => address.id)).toContain(ids.address);
    expect(loaded.items.map(item => [item.sourceBookingId, item.sourceCaseId])).toEqual([[ids.booking, ids.case]]);
    mocks.post.mockResolvedValueOnce(ok({ targetKind: 'booking', bookingId: ids.second, visitGroupId: null, items: [{ sourceBookingId: ids.booking, sourceCaseId: ids.case, bookingId: ids.second }] }));
    const input = {
      idempotencyKey: 'stable-key-001', addressId: ids.address, date: '2090-01-02', slot: 'morning' as const,
      customerNote: 'Xin kiểm tra trước khi sửa',
      items: [{ sourceBookingId: ids.booking, sourceCaseId: ids.case, selectedVariantCode: 'AC-01-01', description: 'Mô tả mới', deviceAttributes: { brand: 'A' } }],
    };
    await expect(interruptionRebookApi.confirm(ids.booking, 'customer', input)).resolves.toEqual({ kind: 'booking', id: ids.second });
    expect(mocks.post).toHaveBeenCalledWith('/bookings/' + ids.booking + '/interruption-rebook', input);
  });

  it('rejects malformed receipt data', async () => {
    await interruptionRebookApi.readDraft(ids.booking, 'customer');
    mocks.post.mockResolvedValueOnce(ok({ targetKind: 'booking', bookingId: ids.second, visitGroupId: null, items: [{ sourceBookingId: ids.booking, sourceCaseId: ids.second, bookingId: ids.second }] }));
    await expect(interruptionRebookApi.confirm(ids.booking, 'customer', {
      idempotencyKey: 'stable-key-002', addressId: ids.address, date: '2090-01-02', slot: 'morning',
      items: [{ sourceBookingId: ids.booking, sourceCaseId: ids.case }],
    })).rejects.toThrow();
  });

  it('rejects duplicate source items before sending a confirmation', async () => {
    await interruptionRebookApi.readDraft(ids.booking, 'customer');
    const item = { sourceBookingId: ids.booking, sourceCaseId: ids.case, selectedVariantCode: 'AC-01-01' };
    await expect(interruptionRebookApi.confirm(ids.booking, 'customer', {
      idempotencyKey: 'stable-key-003', addressId: ids.address, date: '2090-01-02', slot: 'morning', items: [item, item],
    })).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
