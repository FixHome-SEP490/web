import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { BookingItem } from '../src/api/bookings.api';

// PO 20/10/2026: the booking page repeats what was asked for, as the server froze
// it: the device facts, the labour price basis and the customer's words, on every
// status (a cancelled booking too), never a price the browser made up.
const { getBooking } = vi.hoisted(() => ({ getBooking: vi.fn() }));

vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking } }));
vi.mock('../src/api/media.api', () => ({ mediaApi: { getBookingMediaContent: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'booking-id' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

import BookingDetailPage from '../src/pages/customer/BookingDetailPage.vue';

const MoneyStub = defineComponent({
  props: { amount: { type: [Number, String], default: null } },
  setup(props) { return () => h('span', { 'data-money': String(props.amount ?? '') }); },
});

function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'booking-id',
    customerId: 'customer-id',
    serviceId: 'service-id',
    addressId: 'address-id',
    serviceName: 'Vệ sinh điều hòa',
    addressSummary: 'Quận 1, TP.HCM',
    description: 'Máy chảy nước ở dàn lạnh',
    preferredAt: '2030-01-03T01:00:00.000Z',
    urgency: 'NORMAL',
    status: 'CANCELLED',
    createdAt: '2030-01-01T08:00:00.000Z',
    media: [],
    ...overrides,
  };
}

async function render(item: BookingItem) {
  getBooking.mockResolvedValue(item);
  const wrapper = mount(BookingDetailPage, {
    global: { stubs: { FhDatePicker: true, FhTimeScrollPicker: true, FhMoney: MoneyStub, RebookDialog: true } },
  });
  await flushPromises();
  return wrapper;
}

describe('BookingDetailPage request summary', () => {
  beforeEach(() => { getBooking.mockReset(); });

  it('shows the device facts, the confirmed tier and the description of a cancelled booking', async () => {
    const wrapper = await render(booking({
      deviceAttributesSnapshot: { acMounting: 'wall', acHorsepower: 'up_to_1_5' },
      catalogV2PricingSnapshot: { selectedVariant: { variantCode: 'AC-02-01', scopeVi: 'Treo tường <=1.5 HP', laborPriceVnd: 199000 }, priceRange: null },
      pricingModeSnapshot: 'fixed_price',
    }));
    const summary = wrapper.get('[data-testid="booking-request-summary"]');
    expect(summary.get('[data-testid="booking-request-device"]').text()).toBe('Treo tường · ≤ 1,5 HP');
    expect(summary.get('[data-testid="booking-request-price"]').find('[data-money="199000"]').exists()).toBe(true);
    expect(summary.get('[data-testid="booking-request-price"]').text()).toContain('Chưa gồm linh kiện');
    expect(summary.get('[data-testid="booking-request-description"]').text()).toBe('Máy chảy nước ở dàn lạnh');
    wrapper.unmount();
  });

  it('falls back to the frozen scope when no facts were given, and keeps a range nonbinding', async () => {
    const wrapper = await render(booking({
      catalogV2PricingSnapshot: { selectedVariant: null, priceRange: { minLaborVnd: 399000, maxLaborVnd: 699000 } },
      pricingModeSnapshot: 'inspection_required',
    }));
    const price = wrapper.get('[data-testid="booking-request-price"]');
    expect(price.find('[data-money="399000"]').exists()).toBe(true);
    expect(price.find('[data-money="699000"]').exists()).toBe(true);
    expect(price.text()).toContain('duyệt trước khi sửa');
    expect(wrapper.find('[data-testid="booking-request-device"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('multiplies a legacy fixed unit price sent as a numeric string by the quantity', async () => {
    const wrapper = await render(booking({ pricingModeSnapshot: 'fixed_price', fixedUnitPriceSnapshot: '150000.00', quantity: 2 }));
    expect(wrapper.get('[data-testid="booking-request-price"]').find('[data-money="300000"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('says the technician quotes on site for a survey job, and shows no price for an old booking without a basis', async () => {
    const survey = await render(booking({ pricingModeSnapshot: 'inspection_required' }));
    expect(survey.get('[data-testid="booking-request-price"]').text()).toContain('Thợ báo giá tại nhà');
    expect(survey.get('[data-testid="booking-request-price"]').find('[data-money]').exists()).toBe(false);
    survey.unmount();

    const legacy = await render(booking());
    expect(legacy.find('[data-testid="booking-request-price"]').exists()).toBe(false);
    expect(legacy.get('[data-testid="booking-request-description"]').exists()).toBe(true);
    legacy.unmount();
  });

  it('leaves the description to the edit box while the booking can still be changed', async () => {
    const wrapper = await render(booking({ status: 'SUBMITTED', pricingModeSnapshot: 'inspection_required' }));
    expect(wrapper.find('[data-testid="booking-request-description"]').exists()).toBe(false);
    expect((wrapper.get('#booking-description').element as HTMLTextAreaElement).value).toBe('Máy chảy nước ở dàn lạnh');
    wrapper.unmount();
  });
});
