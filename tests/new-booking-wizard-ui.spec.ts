import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const {
  uploadBookingPhoto,
  createBooking,
  getService,
  getCategories,
  getAddresses,
  push,
  route,
} = vi.hoisted(() => ({
  uploadBookingPhoto: vi.fn(),
  createBooking: vi.fn(),
  getService: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string> },
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { uploadBookingPhoto },
}));
vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { createBooking },
}));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories, getService } }));
// P012: the plain form asks the catalog-v2 pricing preview per selected
// service; this finder suite keeps it feature-off so no test reaches a backend.
vi.mock('../src/api/catalog-pricing.api', () => ({
  catalogPricingApi: { getPreview: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { response: { status: 404 } })) },
  isCatalogV2PricingUnavailableError: (error: unknown) => (error as { response?: { status?: number } } | undefined)?.response?.status === 404,
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      disabled: props.disabled || props.loading,
      onClick: (event: MouseEvent) => emit('click', event),
    }, slots.default?.());
  },
});

const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
// Renders the amount it was given, so a wrong price (e.g. a fake 0) is visible in the DOM.
const MoneyStub = defineComponent({
  props: { amount: { type: [Number, String], default: null } },
  setup(props) {
    return () => h('span', { 'data-money': String(props.amount ?? '') });
  },
});
const stubs = {
  FhButton: ActionButton,
  FhMoney: MoneyStub,
  FhDatePicker: SlotStub,
  FhTimeScrollPicker: SlotStub,
  RouterLink: true,
  teleport: true,
};

const sampleCategories = [
  {
    id: 'cat-refrig',
    name: 'Điện lạnh',
    code: 'dien_lanh',
    services: [
      {
        id: 'svc-ac-clean',
        name: 'Vệ sinh điều hòa treo tường',
        pricingMode: 'fixed_price',
        fixedPrice: 200000,
        basePrice: 200000,
        unit: 'máy',
        estimatedMinutes: 45,
        description: 'Vệ sinh xịt rửa dàn nóng và dàn lạnh',
      },
      {
        id: 'svc-ac-repair',
        name: 'Sửa chữa điều hòa mất lạnh',
        pricingMode: 'inspection_required',
        fixedPrice: null,
        basePrice: null,
        unit: null,
        estimatedMinutes: 60,
        description: 'Khảo sát và nạp gas nếu cần',
      },
    ],
  },
  {
    id: 'cat-plumb',
    name: 'Điện & Nước',
    code: 'dien_nuoc',
    services: [
      {
        id: 'svc-siphon',
        name: 'Thay siphon lavabo',
        pricingMode: 'fixed_price',
        fixedPrice: 150000,
        basePrice: 150000,
        unit: 'bộ',
        estimatedMinutes: 30,
        description: 'Chống rò rỉ lavabo',
      },
    ],
  },
];

const cardByText = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('[data-testid="booking-service-card"]').find((card) => card.text().includes(text))!;
const detailsButton = (wrapper: ReturnType<typeof mount>, serviceName: string) =>
  wrapper.findAll('[data-testid="booking-service-details"]')
    .find((button) => (button.attributes('aria-label') ?? '').includes(serviceName))!;
const categoryChip = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('[data-testid="booking-category-filter"]').find((chip) => chip.text().includes(text))!;
const textareaValue = (wrapper: ReturnType<typeof mount>) =>
  (wrapper.get('textarea').element as HTMLTextAreaElement).value;

async function renderWizard(options: { provide?: Record<string, unknown> } = {}) {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs, provide: options.provide } });
  await flushPromises();
  return wrapper;
}

describe('NewBookingWizardPage A+ service finder', () => {
  it('rechecks evening at submit and refuses it when the clock reaches 23:00', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T15:59:00Z'));
    let wrapper: Awaited<ReturnType<typeof renderWizard>> | undefined;
    try {
      wrapper = await renderWizard();
      await cardByText(wrapper, 'Vệ sinh điều hòa treo tường').trigger('click');
      await wrapper.get('[data-testid="step1-next"]').trigger('click');
      await wrapper.get('[data-testid="session-2026-10-12-evening"]').trigger('click');
      await wrapper.get('[data-testid="step2-next"]').trigger('click');
      vi.setSystemTime(new Date('2026-10-12T16:00:00Z'));
      await wrapper.get('[data-testid="booking-submit"]').trigger('click');
      await flushPromises();
      expect(createBooking).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="session-2026-10-12-evening"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="mode-urgent"]').exists()).toBe(true);
    } finally { wrapper?.unmount(); vi.useRealTimers(); }
  });
  it.each([
    ['2026-10-12T11:30:00Z', 'scheduled'],
    ['2026-10-12T16:00:00Z', 'urgent'],
  ])('submits %s with mode %s and never offers 23:00 as a start', async (now, mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    let wrapper: Awaited<ReturnType<typeof renderWizard>> | undefined;
    try {
      wrapper = await renderWizard();
      await cardByText(wrapper, 'Vệ sinh điều hòa treo tường').trigger('click');
      await wrapper.get('[data-testid="step1-next"]').trigger('click');
      await flushPromises();
      if (mode === 'scheduled') {
        await wrapper.get('[data-testid="session-2026-10-12-evening"]').trigger('click');
      } else {
        expect(wrapper.find('[data-testid="session-2026-10-12-evening"]').exists()).toBe(false);
        await wrapper.get('[data-testid="mode-urgent"]').trigger('click');
      }
      await wrapper.get('[data-testid="step2-next"]').trigger('click');
      await wrapper.get('[data-testid="booking-submit"]').trigger('click');
      await flushPromises();
      expect(createBooking).toHaveBeenCalledWith(expect.objectContaining(mode === 'scheduled'
        ? { mode: 'scheduled', date: '2026-10-12', slot: 'evening' }
        : { mode: 'urgent' }));
      const payload = createBooking.mock.calls[0][0];
      expect(payload).not.toHaveProperty('preferredStartAt');
      if (mode === 'urgent') expect(payload).not.toHaveProperty('slot');
    } finally { wrapper?.unmount(); vi.useRealTimers(); }
  });
  beforeEach(() => {
    createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
    getService.mockReset();
    getCategories.mockReset().mockResolvedValue(sampleCategories);
    getAddresses.mockReset().mockResolvedValue([{
      id: 'addr-1', label: 'Nhà riêng', line1: '123 Test', district: 'Q1', province: 'TP.HCM', isDefault: true,
    }]);
    route.query = {};
  });

  it('shows compact categories and selects nothing by default', async () => {
    const wrapper = await renderWizard();

    expect(categoryChip(wrapper, 'Điện lạnh').text()).toBe('Điện lạnh');
    expect(categoryChip(wrapper, 'Điện & Nước').text()).toBe('Điện & Nước');

    const cards = wrapper.findAll('[data-testid="booking-service-card"]');
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.attributes('aria-pressed') === 'false')).toBe(true);

    // No first-item auto-selection: recap empty, CTA off, description untouched.
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="booking-summary-service"]').text()).toBe('Chưa chọn');
    // The fault description belongs to a chosen service; nothing is asked before that.
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('keeps clearance for the summary bar through address and time, not on the final check', async () => {
    const wrapper = await renderWizard();
    const root = wrapper.get('[data-testid="booking-stepper"]').element.parentElement as HTMLElement;
    expect(root.className).toContain('pb-[calc(8.5rem_+_env(safe-area-inset-bottom))]');
    expect(root.className).toContain('lg:pb-24');
    await cardByText(wrapper, 'Vệ sinh điều hòa treo tường').trigger('click');
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(true);
    expect(root.className).toContain('pb-[calc(8.5rem_+_env(safe-area-inset-bottom))]');
    await wrapper.get('button[data-testid^="session-2"]').trigger('click');
    await wrapper.get('[data-testid="step2-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-submit"]').exists()).toBe(true);
    expect(root.className).toContain('pb-16');
    expect(root.className).not.toContain('8.5rem');
  });

  it('keeps the wide two-column width through address and time, and releases it on leaving the page', async () => {
    const setCustomerBookingWidth = vi.fn();
    const wrapper = await renderWizard({ provide: { 'customer-booking-layout-width': setCustomerBookingWidth } });

    expect(setCustomerBookingWidth).toHaveBeenLastCalledWith(true);
    await cardByText(wrapper, 'Vệ sinh điều hòa treo tường').trigger('click');
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(true);
    expect(setCustomerBookingWidth).toHaveBeenLastCalledWith(true);
    wrapper.unmount();
    expect(setCustomerBookingWidth).toHaveBeenLastCalledWith(false);
  });

  it('limits the default catalog to eight, expands it, and shows every match when filtering', async () => {
    const services = Array.from({ length: 12 }, (_, i) => ({ ...sampleCategories[0]!.services[0]!, id: `svc-${i}`, name: `Dịch vụ thử ${i}` }));
    getCategories.mockResolvedValue([{ ...sampleCategories[0], services }]);
    const wrapper = await renderWizard();
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(8);
    const expand = wrapper.get('[data-testid="booking-services-expand"]');
    expect(expand.attributes('aria-expanded')).toBe('false');
    await expand.trigger('click');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(12);
    await wrapper.get('[data-testid="booking-services-expand"]').trigger('click');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(8);
    await wrapper.get('[data-testid="booking-service-search"]').setValue('Dịch vụ thử');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(12);
    expect(wrapper.find('[data-testid="booking-services-expand"]').exists()).toBe(false);
    await wrapper.get('[data-testid="booking-service-search"]').setValue('');
    await categoryChip(wrapper, 'Điện lạnh').trigger('click');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(12);
  });

  it('searches across the loaded catalog, ignores diacritics and can reset the filters', async () => {
    const wrapper = await renderWizard();
    const search = wrapper.get('[data-testid="booking-service-search"]');

    await search.setValue('Vệ sinh');
    expect(wrapper.text()).toContain('Vệ sinh điều hòa treo tường');
    expect(wrapper.text()).not.toContain('Thay siphon lavabo');

    await search.setValue('dieu hoa');
    expect(wrapper.text()).toContain('Sửa chữa điều hòa mất lạnh');
    expect(wrapper.text()).toContain('Vệ sinh điều hòa treo tường');

    await search.setValue('khong co dich vu nao');
    const empty = wrapper.get('[data-testid="booking-services-empty"]');
    expect(empty.text()).toContain('Xóa bộ lọc');

    await empty.get('button').trigger('click');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(3);
  });

  it('narrows the list with search and category only, no price-mode chips (PO 20/10/2026)', async () => {
    const wrapper = await renderWizard();

    expect(wrapper.find('[data-testid="booking-price-filter-inspection"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-price-filter-fixed"]').exists()).toBe(false);
    await categoryChip(wrapper, 'Điện lạnh').trigger('click');
    expect(wrapper.text()).toContain('Sửa chữa điều hòa mất lạnh');
    expect(wrapper.text()).not.toContain('Thay siphon lavabo');
  });

  it('avoids redundant price filters when every service has the same catalog mode', async () => {
    getCategories.mockResolvedValue([sampleCategories[1]]);
    const wrapper = await renderWizard();
    expect(wrapper.find('[aria-label="Lọc theo cách tính giá"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="booking-service-result-count"]').text()).toBe('Đã hiển thị 1 dịch vụ');
    expect(wrapper.text()).not.toContain('1 / 1 dịch vụ');
    const list = wrapper.get('[data-testid="booking-service-list"]').element;
    const count = wrapper.get('[data-testid="booking-service-result-count"]').element;
    expect(list.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('uses the short chips without losing selection or custom description', async () => {
    getCategories.mockResolvedValue([...sampleCategories, ...Array.from({ length: 11 }, (_, i) => ({
      id: `extra-${i}`, name: `Nhóm ${i + 3}`, code: `extra-${i}`, services: [],
    }))]);
    const wrapper = await renderWizard();
    await categoryChip(wrapper, 'Nước').trigger('click');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(1);
    await cardByText(wrapper, 'Thay siphon lavabo').trigger('click');
    await wrapper.get('textarea').setValue('Giữ ghi chú này');
    await wrapper.get('[data-testid="recap-change"]').trigger('click');
    await flushPromises();
    await categoryChip(wrapper, 'Điện lạnh').trigger('click');
    await wrapper.get('[data-testid="booking-service-search"]').setValue('dieu hoa');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="booking-summary-service"]').text()).toBe('Thay siphon lavabo');
    expect(textareaValue(wrapper)).toBe('Giữ ghi chú này');
    await wrapper.get('[data-testid="selected-outside-filter-show"]').trigger('click');
    expect(categoryChip(wrapper, 'Tất cả').attributes('aria-pressed')).toBe('true');
    expect(cardByText(wrapper, 'Thay siphon lavabo').attributes('aria-pressed')).toBe('true');
  });

  it('announces a linked selection without an automatic mobile scroll', async () => {
    route.query = { serviceId: 'svc-ac-clean' };
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      const wrapper = await renderWizard();
      expect(wrapper.get('[data-testid="selected-service-recap"]').attributes('aria-live')).toBe('polite');
      expect(wrapper.get('[data-testid="recap-service-name"]').text()).toBe('Vệ sinh điều hòa treo tường');
      expect(scroll).not.toHaveBeenCalled();
      wrapper.unmount();
    } finally { scroll.mockRestore(); }
  });

  it('keeps the selected service when filters hide it, with a way back', async () => {
    const wrapper = await renderWizard();

    await cardByText(wrapper, 'Vệ sinh điều hòa treo tường').trigger('click');
    const recap = wrapper.get('[data-testid="selected-service-recap"]');
    expect(recap.text()).toContain('Vệ sinh điều hòa treo tường');
    expect(recap.text()).toContain('/ máy');
    expect(recap.find('[data-money="200000"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();

    // The quantity stepper updates the total in the summary; the description stays the customer's.
    await recap.get('[data-testid="booking-quantity-increase"]').trigger('click');
    expect(recap.get('[data-testid="booking-quantity"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="booking-summary-price"]').find('[data-money="400000"]').exists()).toBe(true);
    expect(textareaValue(wrapper)).toBe('');

    // Filtering to another category hides the card but never drops the choice.
    await wrapper.get('[data-testid="recap-change"]').trigger('click');
    await flushPromises();
    await categoryChip(wrapper, 'Điện & Nước').trigger('click');
    expect(wrapper.get('[data-testid="booking-summary-service"]').text()).toContain('Vệ sinh điều hòa treo tường');
    expect(wrapper.get('[data-testid="selected-outside-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="booking-service-card"][aria-pressed="true"]').exists()).toBe(false);

    await wrapper.get('[data-testid="selected-outside-filter-show"]').trigger('click');
    expect(wrapper.find('[data-testid="selected-outside-filter"]').exists()).toBe(false);
    expect(cardByText(wrapper, 'Vệ sinh điều hòa treo tường').attributes('aria-pressed')).toBe('true');
  });

  it('shows an inspection service as a quote-first visit, never as a fixed 0 ₫', async () => {
    const wrapper = await renderWizard();

    const card = cardByText(wrapper, 'Sửa chữa điều hòa mất lạnh');
    expect(card.text()).toContain('Khảo sát, báo giá');
    expect(card.find('[data-money]').exists()).toBe(false);

    await card.trigger('click');
    const recap = wrapper.get('[data-testid="selected-service-recap"]');
    expect(recap.text()).toContain('Khảo sát, báo giá');
    expect(recap.find('[data-money]').exists()).toBe(false);

    // A survey visit needs a few words about the fault before going on.
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(false);
    await wrapper.get('textarea').setValue('Máy chạy nhưng không lạnh');
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(true);
  });

  it('suggests symptoms for the chosen category and toggles them in the description', async () => {
    const wrapper = await renderWizard();

    await cardByText(wrapper, 'Sửa chữa điều hòa mất lạnh').trigger('click');
    await flushPromises();
    const chip = wrapper.findAll('button').find((button) => button.text().includes('Chảy nước dàn lạnh'));
    expect(chip).toBeDefined();
    await chip?.trigger('click');
    expect(textareaValue(wrapper)).toContain('Chảy nước dàn lạnh');

    await chip?.trigger('click');
    expect(textareaValue(wrapper)).not.toContain('Chảy nước dàn lạnh');
  });

  it('does not expose a customer-facing urgency control', async () => {
    const wrapper = await renderWizard();

    expect(wrapper.find('[data-testid="urgency-slider"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Mức độ khẩn cấp');
  });

  it('keeps every row to the name, one short price and a details button (PO 20/10/2026)', async () => {
    const wrapper = await renderWizard();
    const card = cardByText(wrapper, 'Vệ sinh điều hòa treo tường');

    expect(card.text()).toContain('Vệ sinh điều hòa treo tường');
    expect(card.get('[data-testid="booking-service-price"]').text()).toBe('200k');
    expect(card.text()).not.toContain('phút');

    // The description belongs to the details dialog, never to the scannable list.
    expect(card.text()).not.toContain('Vệ sinh xịt rửa dàn nóng và dàn lạnh');
    expect(wrapper.findAll('[data-testid="booking-service-details"]')).toHaveLength(3);
    expect(detailsButton(wrapper, 'Vệ sinh điều hòa treo tường').attributes('aria-label')).toContain('Xem chi tiết');
  });

  it('opens the full details without choosing the service, and only confirm selects it', async () => {
    const wrapper = await renderWizard();

    await detailsButton(wrapper, 'Vệ sinh điều hòa treo tường').trigger('click');

    const dialog = wrapper.get('[data-testid="booking-service-details-dialog"]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.text()).toContain('Vệ sinh xịt rửa dàn nóng và dàn lạnh');
    expect(dialog.text()).toContain('~45 phút');

    // Reading the details changes nothing: the recap is still empty and the CTA off.
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="booking-service-card"][aria-pressed="true"]').exists()).toBe(false);

    await dialog.get('[data-testid="booking-service-details-confirm"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="booking-service-details-dialog"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="selected-service-recap"]').text()).toContain('Vệ sinh điều hòa treo tường');
    expect(wrapper.find('[data-testid="booking-service-card"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
  });

  it('closes the details with Escape and with Đóng alone, choosing nothing', async () => {
    const wrapper = await renderWizard();
    const trigger = detailsButton(wrapper, 'Thay siphon lavabo');

    await trigger.trigger('click');
    await wrapper.get('[data-testid="booking-service-details-dialog"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-service-details-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();

    await trigger.trigger('click');
    await wrapper.get('[data-testid="booking-service-details-dismiss"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-service-details-dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
  });

  it.each([false, true])('guides mobile selection to configuration with reduced motion=%s', async (reduced) => {
    const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('max-width') || (query.includes('prefers-reduced-motion') && reduced),
      media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => true,
    }));
    const wrapper = await renderWizard();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      await cardByText(wrapper, 'Thay siphon lavabo').trigger('click');
      await flushPromises();
      expect(scroll).toHaveBeenCalledWith({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      expect(scroll.mock.instances[0]).toBe(wrapper.get('[data-testid="booking-request-configuration"]').element);
      expect(wrapper.find('[data-testid="booking-mini-summary"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="recap-service-name"]').text()).toContain('Thay siphon lavabo');
      await wrapper.get('[data-testid="recap-change"]').trigger('click');
      await flushPromises();
      scroll.mockClear();
      await categoryChip(wrapper, 'Điện lạnh').trigger('click');
      await wrapper.get('[data-testid="booking-service-search"]').setValue('khong co');
      expect(scroll).not.toHaveBeenCalled();
    } finally { scroll.mockRestore(); media.mockRestore(); wrapper.unmount(); }
  });

  it('changes service by returning focus to search while preserving the current request', async () => {
    const wrapper = await renderWizard();
    await cardByText(wrapper, 'Thay siphon lavabo').trigger('click');
    await wrapper.get('textarea').setValue('Ghi chú riêng của khách');
    // The list folded after the choice; "Đổi" brings it back with the search focused.
    expect(wrapper.find('[data-testid="booking-service-search"]').exists()).toBe(false);
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    try {
      await wrapper.get('[data-testid="recap-change"]').trigger('click');
      await flushPromises();
      expect(focus.mock.instances[0]).toBe(wrapper.get('[data-testid="booking-service-search"]').element);
    } finally { focus.mockRestore(); }
    expect(wrapper.get('[data-testid="booking-summary-service"]').text()).toContain('Thay siphon lavabo');
    expect(cardByText(wrapper, 'Thay siphon lavabo').attributes('aria-pressed')).toBe('true');
    expect(textareaValue(wrapper)).toBe('Ghi chú riêng của khách');
  });

  it('combines category and search predictably and shows one non-warning selection hint', async () => {
    const wrapper = await renderWizard();
    await cardByText(wrapper, 'Thay siphon lavabo').trigger('click');
    await wrapper.get('[data-testid="recap-change"]').trigger('click');
    await flushPromises();
    await categoryChip(wrapper, 'Điện lạnh').trigger('click');
    await wrapper.get('[data-testid="booking-service-search"]').setValue('dieu hoa');
    expect(wrapper.findAll('[data-testid="booking-service-card"]')).toHaveLength(2);
    const hint = wrapper.get('[data-testid="selected-outside-filter"]');
    expect(hint.text()).toContain('Dịch vụ đã chọn vẫn được giữ.');
    expect(hint.attributes('role')).toBe('status');
    expect(hint.classes().join(' ')).not.toContain('warning');
    expect(wrapper.find('[data-testid="recap-outside-filter"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
    await hint.get('button').trigger('click');
    expect((wrapper.get('[data-testid="booking-service-search"]').element as HTMLInputElement).value).toBe('');
    expect(cardByText(wrapper, 'Thay siphon lavabo').attributes('aria-pressed')).toBe('true');
  });

  it('has no urgency slider in the first step (PO 18/10/2026)', async () => {
    const wrapper = await renderWizard();
    expect(wrapper.find('[data-testid="urgency-slider"]').exists()).toBe(false);
    expect(wrapper.find('#urgency-range').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Mức độ khẩn cấp');
    expect(wrapper.text()).not.toContain('Cực khẩn');
  });

});
