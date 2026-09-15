import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import { bookingsApi } from '../src/api/bookings.api';
import { ordersApi } from '../src/api/orders.api';
import { catalogApi } from '../src/api/catalog.api';

vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe('DEV1 client contracts', () => {
  beforeEach(() => vi.resetAllMocks());
  it('uses the canonical booking DTO and unwraps the shared response', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { data: { id: 'booking', status: 'submitted', urgency: 'medium' } } } });
    const body = { serviceId: 'service', addressId: 'address', description: 'Repair', preferredStartAt: '2027-01-01T01:00:00Z', preferredEndAt: '2027-01-01T02:00:00Z', urgency: 'NORMAL' as const };
    const result = await bookingsApi.createBooking(body);
    expect(apiClient.post).toHaveBeenCalledWith('/bookings', { ...body, urgency: 'medium' });
    expect(result.status).toBe('SUBMITTED');
  });
  it('surfaces API failures instead of returning mock bookings', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Service unavailable'));
    await expect(bookingsApi.getMyBookings()).rejects.toThrow('Service unavailable');
  });
  it('keeps paginated catalog metadata for DEV2 consumers', async () => {
    const response = { data: [{ id: 'service' }], meta: { total: 42 } };
    vi.mocked(apiClient.get).mockResolvedValue({ data: response });
    expect(await catalogApi.getAdminServices()).toEqual(response);
  });
  it('calls the canonical start route and sends explicit paid warranty selections', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    await ordersApi.startRepair('order');
    expect(apiClient.post).toHaveBeenCalledWith('/service-orders/order/start-repair', {});
    await ordersApi.approveQuotation('quote', ['item']);
    expect(apiClient.post).toHaveBeenLastCalledWith('/quotations/quote/decision', { action: 'APPROVE', paidWarrantyItemIds: ['item'] });
  });
  it('sends the selected file as multipart evidence, without a user-supplied URL', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } });
    const file = new File(['image bytes'], 'evidence.png', { type: 'image/png' });
    await ordersApi.uploadEvidence('order', { phase: 'BEFORE', file });
    const [, body] = vi.mocked(apiClient.post).mock.calls[0]!;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('type')).toBe('before');
    expect((body as FormData).has('mediaUrl')).toBe(false);
  });
});
