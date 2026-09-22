// WEB-H02: Booking detail may navigate only to the exact ServiceOrder ID from GET /bookings/:id.
// All responses are synthetic. The shared Axios client, auth, and real Backend are never called.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { BookingItem } from '../src/api/bookings.api';

const { getBooking, updateBooking, push } = vi.hoisted(() => ({
  getBooking: vi.fn(), updateBooking: vi.fn(), push: vi.fn(),
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking, updateBooking } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-real-id' } }),
  useRouter: () => ({ push }),
}));

import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';

function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'booking-real-id', customerId: 'mock-customer', serviceId: 'mock-service',
    addressId: 'mock-address', serviceName: 'Mock repair', addressSummary: 'Mock address',
    description: 'Mock description', preferredAt: '2026-10-01T09:00:00Z',
    urgency: 'NORMAL', status: 'MATCHING', createdAt: '2026-09-21T09:00:00Z',
    ...overrides,
  };
}
async function render() {
  const wrapper = mount(BookingDetailPage, {
    global: { stubs: { FhDatePicker: true, FhTimeScrollPicker: true } },
  });
  await flushPromises();
  return wrapper;
}
const link = '[data-testid="booking-open-service-order"]';
const refresh = '[data-testid="booking-refresh-order-link"]';

beforeEach(() => {
  getBooking.mockReset(); updateBooking.mockReset(); push.mockReset();
});

describe('WEB-H02 exact Booking -> ServiceOrder navigation', () => {
  it('routes through the named customer order detail only with the server-provided exact ID', async () => {
    getBooking.mockResolvedValue(booking({ status: 'MATCHED', serviceOrderId: 'actual-service-order-id' }));
    const wrapper = await render();
    expect(getBooking).toHaveBeenCalledWith('booking-real-id');
    expect(wrapper.find(link).exists()).toBe(true);
    await wrapper.find(link).trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'actual-service-order-id' } });
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('booking-real-id'));
    wrapper.unmount();
  });

  it('does not invent an order ID for MATCHED Booking; refresh reveals an actual linked order', async () => {
    getBooking.mockResolvedValueOnce(booking({ status: 'MATCHED', serviceOrderId: null }))
      .mockResolvedValueOnce(booking({ status: 'MATCHED', serviceOrderId: 'order-from-refresh' }));
    const wrapper = await render();
    expect(wrapper.find(link).exists()).toBe(false);
    expect(wrapper.find(refresh).exists()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    await wrapper.find(refresh).trigger('click');
    await flushPromises();
    expect(getBooking).toHaveBeenCalledTimes(2);
    expect(wrapper.find(link).exists()).toBe(true);
    await wrapper.find(link).trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'order-from-refresh' } });
    wrapper.unmount();
  });

  it('does not interpret whitespace or omitted serviceOrderId as a real order', async () => {
    getBooking.mockResolvedValueOnce(booking({ status: 'MATCHED', serviceOrderId: '   ' }))
      .mockResolvedValueOnce(booking({ status: 'MATCHED' }));
    const wrapper = await render();
    expect(wrapper.find(link).exists()).toBe(false);
    await wrapper.find(refresh).trigger('click');
    await flushPromises();
    expect(wrapper.find(link).exists()).toBe(false);
    expect(push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps a real historical order accessible even if Booking status is CANCELLED', async () => {
    getBooking.mockResolvedValue(booking({ status: 'CANCELLED', serviceOrderId: 'historical-order' }));
    const wrapper = await render();
    expect(wrapper.find(link).exists()).toBe(true);
    expect(wrapper.find(refresh).exists()).toBe(false);
    await wrapper.find(link).trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'historical-order' } });
    wrapper.unmount();
  });

  it('preserves current details and shows a safe retry on refresh failure without false navigation', async () => {
    getBooking.mockResolvedValueOnce(booking({ status: 'MATCHING' }))
      .mockRejectedValueOnce(new Error('synthetic private server error'))
      .mockResolvedValueOnce(booking({ status: 'MATCHED', serviceOrderId: 'recovered-order' }));
    const wrapper = await render();
    await wrapper.find(refresh).trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-link-error"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('synthetic private server error');
    expect(wrapper.find(link).exists()).toBe(false);
    expect(push).not.toHaveBeenCalled();
    await wrapper.find(refresh).trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-link-error"]').exists()).toBe(false);
    await wrapper.find(link).trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'customer-order-detail', params: { id: 'recovered-order' } });
    wrapper.unmount();
  });

  it('ignores rapid duplicate refresh clicks while the first request is still in flight', async () => {
    let release!: (value: BookingItem) => void;
    getBooking.mockResolvedValueOnce(booking({ status: 'MATCHED' }))
      .mockImplementationOnce(() => new Promise<BookingItem>(resolve => { release = resolve; }));
    const wrapper = await render();
    await wrapper.find(refresh).trigger('click');
    await wrapper.find(refresh).trigger('click');
    expect(getBooking).toHaveBeenCalledTimes(2);
    release(booking({ status: 'MATCHED', serviceOrderId: 'one-order' }));
    await flushPromises();
    expect(wrapper.find(link).exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows initial load error and retries without opening guessed service order', async () => {
    getBooking.mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce(booking({ status: 'MATCHED', serviceOrderId: 'resolved-order' }));
    const wrapper = await render();
    expect(wrapper.find(link).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('synthetic failure');
    expect(push).not.toHaveBeenCalled();
    const retry = wrapper.findAll('button').find(x => x.text().includes('Thử lại'));
    expect(retry).toBeDefined();
    await retry!.trigger('click');
    await flushPromises();
    expect(wrapper.find(link).exists()).toBe(true);
    wrapper.unmount();
  });
});