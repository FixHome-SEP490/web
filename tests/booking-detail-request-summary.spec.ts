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
    // The customer's words live in the "Mô tả" card, not in the price summary.
    expect(summary.find('[data-testid="booking-request-description"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="booking-description-card"]').get('[data-testid="booking-request-description"]').text()).toBe('Máy chảy nước ở dàn lạnh');
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

  it('lets a booking move its session once, then greys the button out with the reason (PO 21/10/2026)', async () => {
    const fresh = await render(booking({ status: 'SUBMITTED', rescheduleCount: 0 }));
    expect(fresh.get('[data-testid="booking-open-reschedule"]').attributes('disabled')).toBeUndefined();
    expect(fresh.find('[data-testid="booking-reschedule-used"]').exists()).toBe(false);
    fresh.unmount();

    const moved = await render(booking({ status: 'SUBMITTED', rescheduleCount: 1 }));
    const button = moved.get('[data-testid="booking-open-reschedule"]');
    expect(button.attributes('disabled')).toBeDefined();
    await button.trigger('click');
    expect(moved.find('[data-testid="session-picker"]').exists()).toBe(false);
    expect(moved.get('[data-testid="booking-reschedule-used"]').text()).toContain('một lần');
    moved.unmount();
  });

  it('shows no description card when the customer wrote nothing and sent no photo (PO 21/10/2026)', async () => {
    const wrapper = await render(booking({ description: '', pricingModeSnapshot: 'fixed_price', fixedUnitPriceSnapshot: 200000 }));
    expect(wrapper.find('[data-testid="booking-description-card"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Yêu cầu dịch vụ');
    wrapper.unmount();
  });

  it('puts the photos under the words in the same card, with no second heading', async () => {
    const wrapper = await render(booking({ description: '', media: [{ id: 'm1', url: 'https://cdn.example.test/a.jpg', isPrivate: false, legacyInsecure: true, mimeType: 'image/jpeg', sizeBytes: 1 }] }));
    const card = wrapper.get('[data-testid="booking-description-card"]');
    expect(card.get('h2').text()).toBe('Mô tả');
    expect(card.find('[data-testid="booking-request-description"]').exists()).toBe(false);
    expect(card.get('[data-testid="booking-media-viewer"]').find('h2').exists()).toBe(false);
    wrapper.unmount();
  });
});
