import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repairFailureWizardLocation, resolveCancelledRebookAction } from '../src/utils/customer-rebook-routing';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get } }));
import { readRepairFailureSources } from '../src/api/failed-repair.api';

describe('customer rebook routing', () => {
  beforeEach(() => get.mockReset());

  it('keeps completed and ordinary cancelled bookings on the existing rebook flow', () => {
    expect(resolveCancelledRebookAction('COMPLETED', 'checking')).toBe('legacy');
    expect(resolveCancelledRebookAction('CANCELLED', 'ordinary')).toBe('legacy');
  });

  it('routes a verified failed repair to the dedicated wizard and keeps unknown outcomes unavailable', () => {
    expect(resolveCancelledRebookAction('CANCELLED', 'repair-failure')).toBe('repair-failure');
    expect(resolveCancelledRebookAction('CANCELLED', 'checking')).toBe('checking');
    expect(resolveCancelledRebookAction('CANCELLED', 'idle')).toBe('unavailable');
    expect(resolveCancelledRebookAction('CANCELLED', 'error')).toBe('unavailable');
  });

  it('preserves all server-confirmed failed source bookings in the deep link', () => {
    expect(repairFailureWizardLocation(['booking-1', 'booking-2'])).toEqual({
      path: '/app/bookings/new',
      query: { repairFailure: 'booking-1,booking-2' },
    });
  });

  it('uses the authenticated server draft as the source of failed-repair evidence', async () => {
    get.mockResolvedValue({ data: { data: {
      sourceVisitGroupId: 'visit-1', targetKind: 'visit_group',
      address: { id: 'address-1', text: 'Khu vực đã lưu' }, customerNote: null,
      requiresNewSchedule: true, requiresPricingRevalidation: true,
      confirmation: { available: true, path: '/api/v1/bookings/booking-1/repair-failure-rebook' },
      items: ['booking-1', 'booking-2'].map((sourceBookingId, index) => ({
        sourceBookingId, sourceIncidentId: `incident-${index + 1}`, sourceOrderId: `order-${index + 1}`,
        serviceId: `service-${index + 1}`, deviceLabel: null, selectedVariantCode: null,
        description: 'Mô tả thiết bị', deviceAttributes: null, quantity: 1, photos: [],
      })),
    } } });

    await expect(readRepairFailureSources('booking-1')).resolves.toEqual(['booking-1', 'booking-2']);
    expect(get).toHaveBeenCalledWith('/bookings/booking-1/repair-failure-draft');
  });

});
