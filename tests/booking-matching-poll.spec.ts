import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getBooking, push } = vi.hoisted(() => ({ getBooking: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking, updateBooking: vi.fn(), cancelBooking: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-from-route' } }),
  useRouter: () => ({ push }),
}));
import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';
const booking = (status: string, serviceOrderId?: string | null) => ({
  id: 'booking-from-route', status, serviceOrderId, description: 'Synthetic repair',
  preferredAt: '2030-01-01T09:00:00.000Z', urgency: 'normal',
  addressId: 'synthetic-address', serviceId: 'synthetic-service', customerId: 'synthetic-customer',
});
const global = { stubs: { FhDatePicker: true, FhTimeScrollPicker: true, FhConfirmDialog: true } };
let wrapper: ReturnType<typeof mount> | null = null;
beforeEach(() => { getBooking.mockReset(); push.mockReset(); vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers(); });
async function render() { wrapper = mount(BookingDetailPage, { global }); await flushPromises(); return wrapper; }

describe('WEB-WIZARD-TECH live Booking matching poll', () => {
  it('refreshes owner-checked Booking while MATCHING, reveals real SO and stops polling after match', async () => {
    getBooking.mockResolvedValueOnce(booking('MATCHING'))
      .mockResolvedValueOnce(booking('MATCHED', 'service-order-from-backend'));
    const page = await render();
    expect(getBooking).toHaveBeenCalledTimes(1);
    expect(page.find('[data-testid="booking-open-service-order"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await flushPromises();
    expect(getBooking).toHaveBeenCalledTimes(2);
    expect(page.find('[data-testid="booking-open-service-order"]').exists()).toBe(true);
    await page.find('[data-testid="booking-open-service-order"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'service-order-from-backend' } });
    await vi.advanceTimersByTimeAsync(15000);
    expect(getBooking).toHaveBeenCalledTimes(2);
  });
  it('does not issue overlapping polls while a previous request is still pending', async () => {
    let resolvePoll!: (value: ReturnType<typeof booking>) => void;
    getBooking.mockResolvedValueOnce(booking('MATCHING'))
      .mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; }));
    await render();
    await vi.advanceTimersByTimeAsync(5000);
    expect(getBooking).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(getBooking).toHaveBeenCalledTimes(2);
    resolvePoll(booking('CLOSED'));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(15000);
    expect(getBooking).toHaveBeenCalledTimes(2);
  });
  it('never polls SUBMITTED, CLOSED or CANCELLED Booking', async () => {
    getBooking.mockResolvedValueOnce(booking('CLOSED'));
    await render();
    await vi.advanceTimersByTimeAsync(15000);
    expect(getBooking).toHaveBeenCalledTimes(1);
  });
});