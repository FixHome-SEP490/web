// P012 (owner contract 19/10/2026): the device-fact / pricing-scope section
// inside step 1 of the plain booking form. It must reveal exactly the facts the
// server still misses, show a fixed price only with its named approved scope,
// ground the nonbinding range in the approved tiers, never preselect a tier and
// never submit a variant code the server did not confirm. All APIs are mocked:
// the shared dev catalog only carries legacy prices, so no test depends on it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';

const { createBooking, getService, getCategories, getAddresses, getPreview, push, routeState } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getService: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  getPreview: vi.fn(),
  push: vi.fn(),
  routeState: { query: {} as Record<string, string>, meta: {} as Record<string, unknown> },
}));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() }));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { uploadBookingPhoto: vi.fn() },
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { createBooking } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories, getService } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('../src/api/catalog-pricing.api', () => ({
  catalogPricingApi: { getPreview },
  isCatalogV2PricingUnavailableError: (error: unknown) =>
    [403, 404, 501, 503].includes((error as { response?: { status?: number } } | undefined)?.response?.status ?? 0),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));
vi.mock('vue-sonner', () => ({ toast: toastMock }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';
import type { CatalogPricingPreview, CatalogPricingVariant } from '../src/api/catalog-pricing.api';

enableAutoUnmount(afterEach);

const route = reactive(routeState);

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
const MoneyStub = defineComponent({
  props: { amount: { type: [Number, String], default: null } },
  setup(props) {
    return () => h('span', { 'data-money': String(props.amount ?? '') });
  },
});
const stubs = { FhButton: ActionButton, FhMoney: MoneyStub, RouterLink: true };

const acService = {
  id: 'ac-02', categoryId: 'cat-ac', name: 'Vệ sinh máy lạnh', code: 'AC-02',
  pricingMode: 'inspection_required', fixedPrice: null, unit: null, estimatedMinutes: 45,
};
const wmService = {
  id: 'wm-02', categoryId: 'cat-ac', name: 'Vệ sinh máy giặt', code: 'WM-02',
  pricingMode: 'inspection_required', fixedPrice: null, unit: null, estimatedMinutes: 60,
};
const genService = {
  id: 'gen-01', categoryId: 'cat-ac', name: 'Vệ sinh dàn lạnh', code: 'GEN-01',
  pricingMode: 'inspection_required', fixedPrice: null, unit: null, estimatedMinutes: 60,
};
const plainService = {
  id: 'plain-01', categoryId: 'cat-ac', name: 'Vệ sinh tủ lạnh', code: 'PLAIN-01',
  pricingMode: 'inspection_required', fixedPrice: null, unit: null, estimatedMinutes: 60,
};
const legacyService = {
  id: 'legacy-1', categoryId: 'cat-ac', name: 'Thay siphon lavabo', code: 'LEG',
  pricingMode: 'fixed_price', fixedPrice: 150000, unit: 'bộ', estimatedMinutes: 30,
};
const categoryA = { id: 'cat-ac', name: 'Điện lạnh', code: 'dl', services: [acService, wmService, genService, plainService, legacyService] };

const variant = (variantId: string, variantCode: string, scopeVi: string, laborPriceVnd: number): CatalogPricingVariant =>
  ({ variantId, variantCode, scopeVi, laborPriceVnd });

const AC_WALL_15 = variant('v-ac-01', 'AC-02-01', 'Treo tường <=1.5 HP', 199000);
const AC_WALL_225 = variant('v-ac-02', 'AC-02-02', 'Treo tường 2-2.5 HP', 219000);
const AC_CASSETTE = variant('v-ac-03', 'AC-02-03', 'Âm trần cassette tiêu chuẩn', 449000);
const WM_TOP_LE9 = variant('v-wm-05', 'WM-02-05', 'Máy giặt cửa trên <=9 kg', 399000);
const WM_TOP_GT9 = variant('v-wm-06', 'WM-02-06', 'Máy giặt cửa trên >9 kg', 449000);
const WM_FRONT_LE9 = variant('v-wm-07', 'WM-02-07', 'Máy giặt cửa ngang <=9 kg', 599000);
const WM_FRONT_GT9 = variant('v-wm-08', 'WM-02-08', 'Máy giặt cửa ngang >9 kg', 699000);
const GEN_ONE = variant('v-gen-01', 'GEN-01-01', 'Vệ sinh dàn lạnh', 250000);
const GEN_TWO = variant('v-gen-02', 'GEN-01-02', 'Vệ sinh dàn lạnh và dàn nóng', 350000);

function fixed(serviceId: string, serviceCode: string, selected: CatalogPricingVariant): CatalogPricingPreview {
  return {
    serviceId, serviceCode, status: 'FIXED_PRICE', bindingReady: true,
    selectedVariant: selected, possibleVariants: [selected], missingAttributes: [],
    priceRange: null, messageVi: 'Tiền công theo phạm vi đã chọn, chưa gồm linh kiện và vật tư',
  };
}

function inspection(serviceId: string, serviceCode: string, missingAttributes: string[], possibleVariants: CatalogPricingVariant[]): CatalogPricingPreview {
  const prices = possibleVariants.map((item) => item.laborPriceVnd);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    serviceId, serviceCode, status: 'INSPECTION_REQUIRED', bindingReady: false,
    selectedVariant: null, possibleVariants, missingAttributes,
    priceRange: prices.length > 1 && min < max ? { minLaborVnd: min, maxLaborVnd: max } : null,
    messageVi: 'Cần khảo sát để báo giá',
  };
}

function acPreview(query: Record<string, unknown>): CatalogPricingPreview {
  if (query.acMounting === 'ceiling') {
    return query.selectedVariantCode === 'AC-02-03'
      ? fixed('ac-02', 'AC-02', AC_CASSETTE)
      : inspection('ac-02', 'AC-02', ['service-specific-scope-confirmation'], [AC_CASSETTE]);
  }
  if (!query.acMounting) return inspection('ac-02', 'AC-02', ['acMounting', 'acHorsepower'], [AC_WALL_15, AC_WALL_225, AC_CASSETTE]);
  if (!query.acHorsepower) return inspection('ac-02', 'AC-02', ['acHorsepower'], [AC_WALL_15, AC_WALL_225]);
  return fixed('ac-02', 'AC-02', query.acHorsepower === 'up_to_1_5' ? AC_WALL_15 : AC_WALL_225);
}

function wmPreview(query: Record<string, unknown>): CatalogPricingPreview {
  const style = query.washerLoadingStyle;
  const capacity = typeof query.washerCapacityKg === 'number' ? query.washerCapacityKg : null;
  const missing: string[] = [];
  if (!style) missing.push('washerLoadingStyle');
  if (capacity === null) missing.push('washerCapacityKg');
  if (missing.length > 0) return inspection('wm-02', 'WM-02', missing, [WM_TOP_LE9, WM_TOP_GT9, WM_FRONT_LE9, WM_FRONT_GT9]);
  const chosen = style === 'top'
    ? (capacity <= 9 ? WM_TOP_LE9 : WM_TOP_GT9)
    : (capacity <= 9 ? WM_FRONT_LE9 : WM_FRONT_GT9);
  return fixed('wm-02', 'WM-02', chosen);
}

function defaultPreviewImpl(serviceId: string, query: Record<string, unknown>): CatalogPricingPreview {
  if (serviceId === 'ac-02') return acPreview(query);
  if (serviceId === 'wm-02') return wmPreview(query);
  if (serviceId === 'gen-01') {
    return query.selectedVariantCode === 'GEN-01-02'
      ? fixed('gen-01', 'GEN-01', GEN_TWO)
      : inspection('gen-01', 'GEN-01', ['service-specific-scope-confirmation'], [GEN_ONE, GEN_TWO]);
  }
  if (serviceId === 'plain-01') return inspection('plain-01', 'PLAIN-01', ['service-specific-scope-confirmation'], []);
  throw { response: { status: 404 } };
}

const cardByText = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('[data-testid="booking-service-card"]').find((card) => card.text().includes(text))!;

async function renderWizard() {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

async function reachConfirm(wrapper: ReturnType<typeof mount>) {
  // A job without one firm price needs a few words about the fault (PO 20/10/2026).
  const fault = wrapper.find('textarea');
  if (fault.exists() && !(fault.element as HTMLTextAreaElement).value) await fault.setValue('Máy cần kiểm tra');
  await wrapper.get('[data-testid="step1-next"]').trigger('click');
  await flushPromises();
  const session = wrapper.find('button[data-testid^="session-2"]');
  if (session.exists()) await session.trigger('click');
  await wrapper.findAll('button').find((button) => button.text().includes('Xác nhận'))!.trigger('click');
  await flushPromises();
}

async function submitBooking(wrapper: ReturnType<typeof mount>) {
  await reachConfirm(wrapper);
  await wrapper.get('[data-testid="booking-submit"]').trigger('click');
  await flushPromises();
}

const section = (wrapper: ReturnType<typeof mount>) => wrapper.get('[data-testid="booking-device-details"]');
const lastPreviewQuery = () => getPreview.mock.calls.at(-1)![1] as Record<string, unknown>;

describe('P012 device facts and pricing scope in step 1', () => {
  beforeEach(() => {
    createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
    getService.mockReset();
    getCategories.mockReset().mockResolvedValue([categoryA]);
    getAddresses.mockReset().mockResolvedValue([{
      id: 'addr-1', label: 'Nhà riêng', line1: '123 Test', district: 'Q1', province: 'TP.HCM', isDefault: true,
    }]);
    getPreview.mockReset().mockImplementation(async (serviceId: string, query: Record<string, unknown>) => defaultPreviewImpl(serviceId, query));
    push.mockReset();
    toastMock.warning.mockReset();
    route.query = {};
    route.meta = {};
  });

  it('walks an air-conditioner wall unit to its confirmed tier and submits only server-confirmed values', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();

    // Inside step 1, not a new step.
    expect(wrapper.get('[data-testid="booking-stepper-compact"]').text()).toContain('Bước 1/3');
    expect(section(wrapper).get('[data-testid="pricing-reference-range"]').text()).toContain('Giá tham khảo');
    expect(section(wrapper).find('[data-testid="pricing-confirmed"]').exists()).toBe(false);
    expect(getPreview).toHaveBeenCalledWith('ac-02', {}, expect.anything());

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="wall"]').setValue();
    await flushPromises();
    expect(lastPreviewQuery()).toEqual({ acMounting: 'wall' });
    expect(section(wrapper).text()).toContain('Giá tham khảo');

    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="up_to_1_5"]').setValue();
    await flushPromises();
    expect(lastPreviewQuery()).toEqual({ acMounting: 'wall', acHorsepower: 'up_to_1_5' });

    const confirmed = wrapper.get('[data-testid="pricing-confirmed"]');
    expect(confirmed.text()).toContain('Treo tường ≤1.5 HP');
    expect(confirmed.find('[data-money="199000"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pricing-reference-range"]').exists()).toBe(false);

    await submitBooking(wrapper);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 'ac-02',
      deviceAttributes: { acMounting: 'wall', acHorsepower: 'up_to_1_5' },
      selectedVariantCode: 'AC-02-01',
    }));
  });

  it('hides stale confirmed S immediately while changed facts are waiting for the server', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();
    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="wall"]').setValue();
    await flushPromises();
    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="up_to_1_5"]').setValue();
    await flushPromises();
    expect(wrapper.get('[data-testid="pricing-confirmed"]').find('[data-money="199000"]').exists()).toBe(true);

    let finish!: (value: CatalogPricingPreview) => void;
    const pending = new Promise<CatalogPricingPreview>((resolve) => { finish = resolve; });
    getPreview.mockImplementation((serviceId: string, query: Record<string, unknown>) =>
      query.acHorsepower === '2_to_2_5' ? pending : Promise.resolve(defaultPreviewImpl(serviceId, query)));

    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="2_to_2_5"]').setValue();
    expect(wrapper.find('[data-testid="pricing-confirmed"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pricing-reference-range"]').exists()).toBe(false);
    // Reviewer gate: facts alone must NOT let the customer advance before seeing the server's price.
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    finish(fixed('ac-02', 'AC-02', AC_WALL_225));
    await flushPromises();
    expect(wrapper.get('[data-testid="pricing-confirmed"]').find('[data-money="219000"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
  });

  it('never derives the cassette scope from HP and never submits an unconfirmed code', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="wall"]').setValue();
    await flushPromises();
    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="2_to_2_5"]').setValue();
    await flushPromises();
    expect(wrapper.get('[data-testid="pricing-confirmed"]').text()).toContain('2-2.5 HP');

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="ceiling"]').setValue();
    await flushPromises();

    // HP is dropped with the wall mounting; cassette is priced by its own approved scope.
    expect(lastPreviewQuery()).toEqual({ acMounting: 'ceiling' });
    expect(wrapper.find('[data-testid="device-fact-ac-horsepower"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pricing-confirmed"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="pricing-inspection"]').text()).toContain('Cần khảo sát để báo giá');

    await submitBooking(wrapper);
    const payload = createBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.deviceAttributes).toEqual({ acMounting: 'ceiling' });
    expect(payload).not.toHaveProperty('selectedVariantCode');
  });

  it('submits the cassette variant only after the explicit scope confirmation', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="ceiling"]').setValue();
    await flushPromises();

    const scopeOption = wrapper.get('[data-testid="device-scope-option-AC-02-03"]');
    expect(scopeOption.text()).toContain('Âm trần cassette tiêu chuẩn');
    expect(scopeOption.find('input').element.checked).toBe(false);

    await scopeOption.find('input').setValue();
    await flushPromises();
    expect(lastPreviewQuery()).toEqual({ acMounting: 'ceiling', selectedVariantCode: 'AC-02-03' });

    const confirmed = wrapper.get('[data-testid="pricing-confirmed"]');
    expect(confirmed.text()).toContain('Âm trần cassette tiêu chuẩn');
    expect(confirmed.find('[data-money="449000"]').exists()).toBe(true);

    await submitBooking(wrapper);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      deviceAttributes: { acMounting: 'ceiling' },
      selectedVariantCode: 'AC-02-03',
    }));
  });

  it('walks a washing machine to its top-loading >9 kg tier', async () => {
    route.query = { serviceId: 'wm-02' };
    const wrapper = await renderWizard();

    await wrapper.get('[data-testid="device-fact-washer-style"] input[value="top"]').setValue();
    await flushPromises();
    await wrapper.get('[data-testid="device-fact-washer-capacity"] input[value="10"]').setValue();
    await flushPromises();

    expect(lastPreviewQuery()).toEqual({ washerLoadingStyle: 'top', washerCapacityKg: 10 });
    const confirmed = wrapper.get('[data-testid="pricing-confirmed"]');
    expect(confirmed.text()).toContain('Máy giặt cửa trên >9 kg');
    expect(confirmed.find('[data-money="449000"]').exists()).toBe(true);

    await submitBooking(wrapper);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      deviceAttributes: { washerLoadingStyle: 'top', washerCapacityKg: 10 },
      selectedVariantCode: 'WM-02-06',
    }));
  });

  it('shows every approved scope without preselecting a tier and submits none unconfirmed', async () => {
    route.query = { serviceId: 'gen-01' };
    const wrapper = await renderWizard();

    const options = wrapper.get('[data-testid="device-scope-options"]');
    expect(options.text()).toContain('Vệ sinh dàn lạnh và dàn nóng');
    expect(options.findAll('input').every((input) => !(input.element as HTMLInputElement).checked)).toBe(true);
    expect(wrapper.get('[data-testid="pricing-reference-range"]').text()).toContain('Giá tham khảo');
    expect(wrapper.find('[data-testid="pricing-confirmed"]').exists()).toBe(false);

    await submitBooking(wrapper);
    const payload = createBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('deviceAttributes');
    expect(payload).not.toHaveProperty('selectedVariantCode');
  });

  it('falls back to the inspection label when no approved tier is grounded', async () => {
    route.query = { serviceId: 'plain-01' };
    const wrapper = await renderWizard();

    // Survey-only services have no selectable device facts or scope; the server
    // preview still runs, but this redundant information card stays hidden.
    expect(wrapper.find('[data-testid="booking-device-details"]').exists()).toBe(false);

    await submitBooking(wrapper);
    const payload = createBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('deviceAttributes');
    expect(payload).not.toHaveProperty('selectedVariantCode');
  });

  it('hides the section while the feature is off and keeps the legacy booking flow intact', async () => {
    route.query = { serviceId: 'legacy-1' };
    getPreview.mockReset().mockRejectedValue({ response: { status: 404 } });
    const wrapper = await renderWizard();

    expect(wrapper.find('[data-testid="booking-device-details"]').exists()).toBe(false);

    await submitBooking(wrapper);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ serviceId: 'legacy-1' }));
    const payload = createBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('deviceAttributes');
    expect(payload).not.toHaveProperty('selectedVariantCode');
  });

  it('recovers from a failed preview through retry without inventing a price', async () => {
    route.query = { serviceId: 'ac-02' };
    getPreview.mockReset()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockImplementation(async (serviceId: string, query: Record<string, unknown>) => defaultPreviewImpl(serviceId, query));
    const wrapper = await renderWizard();

    expect(wrapper.get('[data-testid="pricing-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pricing-confirmed"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="pricing-retry"]').trigger('click');
    await flushPromises();

    expect(getPreview).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="pricing-load-error"]').exists()).toBe(false);
    expect(section(wrapper).text()).toContain('Giá tham khảo');
    // Confirmed inspection result can progress without silently converting to a fixed tier.
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
  });

  it('clears reported facts and the confirmed code when the customer changes service', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="wall"]').setValue();
    await flushPromises();
    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="up_to_1_5"]').setValue();
    await flushPromises();
    expect(wrapper.get('[data-testid="pricing-confirmed"]').find('[data-money="199000"]').exists()).toBe(true);

    await wrapper.get('[data-testid="recap-change"]').trigger('click');
    await flushPromises();
    await cardByText(wrapper, 'Vệ sinh máy giặt').trigger('click');
    await flushPromises();

    expect(getPreview).toHaveBeenLastCalledWith('wm-02', {}, expect.anything());
    expect(wrapper.find('[data-testid="device-fact-ac-mounting"]').exists()).toBe(false);

    await submitBooking(wrapper);
    const payload = createBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.serviceId).toBe('wm-02');
    expect(payload).not.toHaveProperty('deviceAttributes');
    expect(payload).not.toHaveProperty('selectedVariantCode');
  });

  it('repeats the server-confirmed tier with its scope in the step-4 recap', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="wall"]').setValue();
    await flushPromises();
    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="up_to_1_5"]').setValue();
    await flushPromises();

    await reachConfirm(wrapper);

    expect(wrapper.get('[data-testid="confirm-v2-scope"]').text()).toBe('Treo tường · ≤ 1,5 HP');
    expect(wrapper.get('[data-testid="confirm-v2-price"]').find('[data-money="199000"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="confirm-v2-price-note"]').find('[data-money="199000"]').exists()).toBe(true);
    // The legacy flat-price promise must not appear for a V2 tier.
    expect(wrapper.text()).not.toContain('Giá niêm yết trọn gói');
    expect(wrapper.find('[data-testid="confirm-v2-range"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="confirm-v2-range-note"]').exists()).toBe(false);
  });

  it('shows only the nonbinding reference range in the recap while facts are missing', async () => {
    route.query = { serviceId: 'wm-02' };
    const wrapper = await renderWizard();

    await reachConfirm(wrapper);

    const rangeRow = wrapper.get('[data-testid="confirm-v2-range"]');
    expect(rangeRow.find('[data-money="399000"]').exists()).toBe(true);
    expect(rangeRow.find('[data-money="699000"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="confirm-v2-range-note"]').text()).toContain('báo giá để bạn duyệt trước khi sửa');
    expect(wrapper.find('[data-testid="confirm-v2-price"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="confirm-v2-price-note"]').exists()).toBe(false);
  });

  it('drops the confirmed tier from the recap after a service switch', async () => {
    route.query = { serviceId: 'ac-02' };
    const wrapper = await renderWizard();

    await wrapper.get('[data-testid="device-fact-ac-mounting"] input[value="wall"]').setValue();
    await flushPromises();
    await wrapper.get('[data-testid="device-fact-ac-horsepower"] input[value="up_to_1_5"]').setValue();
    await flushPromises();

    await wrapper.get('[data-testid="recap-change"]').trigger('click');
    await flushPromises();
    await cardByText(wrapper, 'Vệ sinh máy giặt').trigger('click');
    await flushPromises();
    await reachConfirm(wrapper);

    expect(wrapper.find('[data-testid="confirm-v2-scope"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="confirm-v2-price"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Treo tường');
    // The new service's own grounded range took its place.
    expect(wrapper.get('[data-testid="confirm-v2-range"]').find('[data-money="399000"]').exists()).toBe(true);
  });
});
