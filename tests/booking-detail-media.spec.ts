import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { BookingItem } from '../src/api/bookings.api';

const { getBooking, getBookingMediaContent } = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getBookingMediaContent: vi.fn(),
}));

vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking } }));
vi.mock('../src/api/media.api', () => ({ mediaApi: { getBookingMediaContent } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-owner-id' } }),
  useRouter: () => ({ push: vi.fn() }),
}));

import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';

function booking(): BookingItem {
  return {
    id: 'booking-owner-id',
    customerId: 'customer-id',
    serviceId: 'service-id',
    addressId: 'address-id',
    serviceName: 'Sửa điều hoà',
    addressSummary: 'Quận 1, TP.HCM',
    description: 'Máy không lạnh',
    preferredAt: '2026-09-23T08:00:00.000Z',
    urgency: 'NORMAL',
    status: 'SUBMITTED',
    createdAt: '2026-09-22T08:00:00.000Z',
    media: [
      { id: 'private-media-id', url: null, isPrivate: true, legacyInsecure: false, mimeType: 'image/jpeg', sizeBytes: 20 },
      { id: 'legacy-media-id', url: 'https://cdn.example.test/legacy.jpg', isPrivate: false, legacyInsecure: true, mimeType: 'image/jpeg', sizeBytes: 21 },
    ],
  };
}

beforeEach(() => {
  getBooking.mockReset().mockResolvedValue(booking());
  getBookingMediaContent.mockReset().mockResolvedValue(new Blob(['private'], { type: 'image/jpeg' }));
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:booking-detail-preview'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BookingDetailPage media screen', () => {
  it('renders owner Booking private and legacy media without changing existing detail actions', async () => {
    const wrapper = mount(BookingDetailPage, {
      global: { stubs: { FhDatePicker: true, FhTimeScrollPicker: true } },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="booking-media-viewer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="booking-media-private-media-id"] img').attributes('src'))
      .toBe('blob:booking-detail-preview');
    expect(wrapper.text()).toContain('Ảnh cũ / liên kết công khai');
    expect(getBookingMediaContent).toHaveBeenCalledWith('booking-owner-id', 'private-media-id');
    expect(wrapper.find('[data-testid="booking-start-cancel"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
