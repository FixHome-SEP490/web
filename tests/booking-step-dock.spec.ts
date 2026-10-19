// The step-1 action dock. While the customer scrolls the finder it floats a
// Previous/Next pill over the page; the moment the real footer is on screen the
// dock leaves and the footer becomes the one action set again (and while the
// dock is up, the footer is inert). happy-dom never fires IntersectionObserver
// callbacks, so this spec drives a fake observer: the page must arm it on the
// step-1 footer and only trust a footer that is genuinely below the viewport.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

const { createBooking, getCategories, getService, getAddresses, push, back, route } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getService: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  route: { query: {} as Record<string, string>, meta: {} as Record<string, unknown> },
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { uploadBookingPhoto: vi.fn() },
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { createBooking } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories, getService } }));
// P012: the plain form asks the catalog-v2 pricing preview per selected
// service; this dock suite keeps it feature-off so no test reaches a backend.
vi.mock('../src/api/catalog-pricing.api', () => ({
  catalogPricingApi: { getPreview: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { response: { status: 404 } })) },
  isCatalogV2PricingUnavailableError: (error: unknown) => (error as { response?: { status?: number } } | undefined)?.response?.status === 404,
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back }), useRoute: () => route }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';
import BookingStepDock from '../src/components/booking/BookingStepDock.vue';

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
};

/** A stand-in for the observer happy-dom only stubs: it records its target and can be told what to report. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  callback: IntersectionObserverCallback;
  elements: Element[] = [];
  disconnected = false;
  options?: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.push(element);
  }

  unobserve(element: Element) {
    this.elements = this.elements.filter((item) => item !== element);
  }

  disconnect() {
    this.disconnected = true;
    this.elements = [];
  }

  takeRecords() {
    return [];
  }

  /** The observer the page is currently listening to. */
  static live(): FakeIntersectionObserver {
    const live = FakeIntersectionObserver.instances.filter((instance) => !instance.disconnected).at(-1);
    if (!live) throw new Error('no armed IntersectionObserver');
    return live;
  }

  /** Report the footer position the page asked about. */
  reportFooter({ belowViewport, top = 900, ratio = belowViewport ? 0 : 1 }: { belowViewport: boolean; top?: number; ratio?: number }) {
    const target = this.elements[0] ?? null;
    this.callback(
      [{
        target,
        isIntersecting: !belowViewport,
        intersectionRatio: ratio,
        boundingClientRect: { top } as DOMRectReadOnly,
      } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

const sampleCategories = [
  {
    id: 'cat-refrig',
    name: 'Điện lạnh',
    services: [
      {
        id: 'svc-ac-clean',
        name: 'Vệ sinh điều hòa treo tường',
        pricingMode: 'fixed_price',
        fixedPrice: 200000,
        unit: 'máy',
        estimatedMinutes: 45,
      },
    ],
  },
];

async function renderWizard() {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

const dock = (wrapper: ReturnType<typeof mount>) => wrapper.get('[data-testid="booking-step-dock"]');
const dockNext = (wrapper: ReturnType<typeof mount>) => wrapper.get('[data-testid="booking-step-dock-next"]');
const footer = (wrapper: ReturnType<typeof mount>) => wrapper.get('[data-testid="booking-step1-footer"]');

describe('NewBookingWizardPage step-1 action dock', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    FakeIntersectionObserver.instances = [];
    createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
    getService.mockReset();
    getCategories.mockReset().mockResolvedValue(sampleCategories);
    getAddresses.mockReset().mockResolvedValue([{
      id: 'addr-1', label: 'Nhà riêng', line1: '123 Test', district: 'Q1', province: 'TPHCM', isDefault: true,
    }]);
    push.mockReset();
    back.mockReset();
    route.query = {};
    route.meta = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('watches the step-1 footer and shows no dock until that footer is below the viewport', async () => {
    const wrapper = await renderWizard();

    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(false);
    const observer = FakeIntersectionObserver.live();
    expect(observer.elements).toHaveLength(1);
    expect((observer.elements[0] as HTMLElement).getAttribute('data-testid')).toBe('booking-step1-footer');
    expect(footer(wrapper).attributes('inert')).toBeUndefined();
  });

  it('floats the dock once the footer is scrolled out of view, leaving one tabbable action set', async () => {
    route.query = { serviceId: 'svc-ac-clean' };
    const wrapper = await renderWizard();

    FakeIntersectionObserver.live().reportFooter({ belowViewport: true });
    await nextTick();

    const dockEl = dock(wrapper);
    expect(dockEl.find('[data-testid="booking-step-dock-hint"]').text()).toContain('Vệ sinh điều hòa treo tường');
    expect(dockNext(wrapper).text()).toContain('Tiếp tục');
    expect(dockNext(wrapper).attributes('disabled')).toBeUndefined();

    // The real footer steps aside while the dock is the action set on screen.
    expect(footer(wrapper).attributes('inert')).toBeDefined();
    expect(wrapper.get('[data-testid="step1-next"]').attributes('tabindex')).toBe('-1');
    expect(dockNext(wrapper).attributes('tabindex')).toBeUndefined();
    expect(wrapper.findAll('[data-testid="step1-next"]')).toHaveLength(1);

    // Same advance as the footer button, and the dock leaves with step 1.
    await dockNext(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(false);
  });

  it('takes the dock away and hands the actions back when the footer is on screen again', async () => {
    route.query = { serviceId: 'svc-ac-clean' };
    const wrapper = await renderWizard();
    const observer = FakeIntersectionObserver.live();

    observer.reportFooter({ belowViewport: true });
    await nextTick();
    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(true);

    observer.reportFooter({ belowViewport: false, top: 120 });
    await nextTick();
    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(false);
    expect(footer(wrapper).attributes('inert')).toBeUndefined();
    expect(wrapper.get('[data-testid="step1-next"]').attributes('tabindex')).toBeUndefined();
  });

  it('never shows the dock for an answer without a footer position below the viewport', async () => {
    const wrapper = await renderWizard();

    FakeIntersectionObserver.live().reportFooter({ belowViewport: true, top: 0 });
    await nextTick();
    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(false);

    FakeIntersectionObserver.live().reportFooter({ belowViewport: false, top: 900 });
    await nextTick();
    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(false);
  });

  it('offers the back action to the dock and keeps the footer reachable for the keyboard', async () => {
    route.query = { serviceId: 'svc-ac-clean' };
    const wrapper = await renderWizard();

    FakeIntersectionObserver.live().reportFooter({ belowViewport: true });
    await nextTick();

    expect(wrapper.get('[data-testid="booking-step-dock-back"]').attributes('aria-label')).toBe('Quay lại');
    await wrapper.get('[data-testid="booking-step-dock-back"]').trigger('click');
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the dock until the footer actions are fully visible, not just one intersecting pixel', async () => {
    const wrapper = await renderWizard();
    const observer = FakeIntersectionObserver.live();
    expect(observer.options?.threshold).toEqual([0, 1]);
    observer.reportFooter({ belowViewport: false, top: 790, ratio: 0.01 });
    await nextTick();
    expect(wrapper.find('[data-testid="booking-step-dock"]').exists()).toBe(true);
    expect(footer(wrapper).attributes('inert')).toBeDefined();
    observer.reportFooter({ belowViewport: false, top: 600, ratio: 1 });
    await nextTick();
    expect(footer(wrapper).attributes('inert')).toBeUndefined();
  });

  it('makes leaving dock actions inert immediately, even before the visual transition finishes', async () => {
    const wrapper = mount(BookingStepDock, { props: { show: true }, global: { stubs: { transition: false } } });
    const leaving = wrapper.get('[data-testid="booking-step-dock"]').element;
    await wrapper.setProps({ show: false });
    expect(leaving.hasAttribute('inert')).toBe(true);
    expect(leaving.getAttribute('aria-hidden')).toBe('true');
    expect(leaving.querySelector('button')?.tabIndex).toBe(-1);
    wrapper.unmount();
  });

  it('transfers keyboard focus between footer and dock when their visibility changes', async () => {
    route.query = { serviceId: 'svc-ac-clean' };
    const wrapper = mount(NewBookingWizardPage, { attachTo: document.body, global: { stubs } });
    await flushPromises();
    const observer = FakeIntersectionObserver.live();
    wrapper.get('[data-testid="step1-next"]').element.focus();
    observer.reportFooter({ belowViewport: true });
    await flushPromises();
    expect(document.activeElement).toBe(dockNext(wrapper).element);
    observer.reportFooter({ belowViewport: false, top: 120 });
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('[data-testid="step1-next"]').element);
    wrapper.unmount();
  });

  it('gives the AI form its own dock label and refuses to continue without a description', async () => {
    route.meta = { bookingFlow: 'ai' };
    const wrapper = await renderWizard();

    FakeIntersectionObserver.live().reportFooter({ belowViewport: true });
    await nextTick();

    const next = dockNext(wrapper);
    expect(next.text()).toContain('Phân tích cùng AI');
    expect(next.attributes('disabled')).toBeDefined();
    expect(dock(wrapper).get('[data-testid="booking-step-dock-hint"]').text()).toContain('Mô tả sự cố');

    await wrapper.find('textarea').setValue('Máy lạnh chảy nước');
    await nextTick();
    expect(dockNext(wrapper).attributes('disabled')).toBeUndefined();
  });
});
