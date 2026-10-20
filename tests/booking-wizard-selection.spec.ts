// The P2 V4 selection and pricing contracts of the customer booking wizard:
// an incoming ?serviceId= selects exactly that service (or explains why it
// cannot), filters never change the choice, the Backend pricing mode is the
// only price authority, and the create request is sent once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';

const { createBooking, getService, getCategories, getAddresses, push, routeState } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getService: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
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
// P012: the plain form now asks the catalog-v2 pricing preview per selected
// service. These suites cover the legacy catalog; the preview is unimplemented
// there, so it stays mocked and no test reaches a real backend.
vi.mock('../src/api/catalog-pricing.api', () => ({
  catalogPricingApi: { getPreview: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { response: { status: 404 } })) },
  isCatalogV2PricingUnavailableError: (error: unknown) => (error as { response?: { status?: number } } | undefined)?.response?.status === 404,
}));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn(), go: vi.fn() }), useRoute: () => route }));
vi.mock('vue-sonner', () => ({ toast: toastMock }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';
import { resetSharedAiConversation, useSharedAiConversation } from '../src/composables/useAiConversation';

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

const serviceA = {
  id: 'svc-a', categoryId: 'cat-a', name: 'Dịch vụ A', code: 'A',
  pricingMode: 'fixed_price', fixedPrice: 100000, basePrice: 100000, unit: 'máy', estimatedMinutes: 30,
};
const serviceB = {
  id: 'svc-b', categoryId: 'cat-a', name: 'Dịch vụ B', code: 'B',
  pricingMode: 'inspection_required', fixedPrice: null, basePrice: null, unit: null, estimatedMinutes: 60,
};
const categoryA = { id: 'cat-a', name: 'Điện lạnh', code: 'dl', services: [serviceA, serviceB] };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

const recap = (wrapper: ReturnType<typeof mount>) => wrapper.get('[data-testid="selected-service-recap"]');
const cardByText = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('[data-testid="booking-service-card"]').find((card) => card.text().includes(text))!;

async function renderWizard() {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

async function reachConfirm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="step1-next"]').trigger('click');
  await flushPromises();
  const session = wrapper.find('button[data-testid^="session-2"]');
  if (session.exists()) await session.trigger('click');
  await wrapper.findAll('button').find((button) => button.text().includes('Xác nhận'))!.trigger('click');
  await flushPromises();
}

describe('booking service selection & pricing contracts', () => {
  beforeEach(() => {
    createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
    getService.mockReset();
    getCategories.mockReset().mockResolvedValue([categoryA]);
    getAddresses.mockReset().mockResolvedValue([{
      id: 'addr-1', label: 'Nhà riêng', line1: '123 Test', district: 'Q1', province: 'TP.HCM', isDefault: true,
    }]);
    push.mockReset();
    toastMock.warning.mockReset();
    route.query = {};
    route.meta = {};
    resetSharedAiConversation();
  });

  it('selects exactly the service in ?serviceId= from the loaded catalog', async () => {
    route.query = { serviceId: 'svc-a' };
    const wrapper = await renderWizard();

    expect(recap(wrapper).text()).toContain('Dịch vụ A');
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="booking-deeplink-error"]').exists()).toBe(false);
    expect(getService).not.toHaveBeenCalled();
    // The description starts empty (PO 20/10/2026); no "Yêu cầu dịch vụ: …" prefill.
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('explains an unusable ?serviceId= instead of silently booking another service', async () => {
    getService.mockRejectedValue(new Error('not found'));
    route.query = { serviceId: 'svc-gone' };
    const wrapper = await renderWizard();

    expect(wrapper.get('[data-testid="booking-deeplink-error"]').text()).toContain('không còn khả dụng');
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="booking-service-card"][aria-pressed="true"]').exists()).toBe(false);
  });

  it('hydrates a ?serviceId= that is not inside the loaded catalog', async () => {
    getService.mockResolvedValue({
      id: 'svc-x', categoryId: 'cat-a', name: 'Dịch vụ ngoài danh mục', code: 'X',
      pricingMode: 'fixed_price', fixedPrice: 500000, unit: 'bộ', estimatedMinutes: 30, isActive: true,
    });
    route.query = { serviceId: 'svc-x' };
    const wrapper = await renderWizard();

    expect(getService).toHaveBeenCalledWith('svc-x');
    expect(recap(wrapper).text()).toContain('Dịch vụ ngoài danh mục');
    expect(recap(wrapper).find('[data-money="500000"]').exists()).toBe(true);
  });

  it('reveals the recap when the selected deep-link service has no catalog row', async () => {
    getService.mockResolvedValue({
      ...serviceA, id: 'svc-x', name: 'Dịch vụ từ liên kết', isActive: true,
    });
    route.query = { serviceId: 'svc-x' };
    const wrapper = await renderWizard();
    // The list folds on a linked choice, so the recap is on screen without a "show" link.
    expect(wrapper.find('[data-testid="selected-outside-filter-show"]').exists()).toBe(false);
    expect(recap(wrapper).attributes('tabindex')).toBe('-1');
    expect(recap(wrapper).text()).toContain('Dịch vụ từ liên kết');
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
  });

  it('invalidates A immediately while a new invalid B link is loading and after it fails', async () => {
    route.query = { serviceId: 'svc-a' };
    const wrapper = await renderWizard();
    const pending = deferred<unknown>();
    getService.mockReturnValue(pending.promise);
    route.query = { serviceId: 'svc-gone' };
    await flushPromises();
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    pending.resolve({ ...serviceB, id: 'svc-gone', isActive: false });
    await flushPromises();
    expect(wrapper.get('[data-testid="booking-deeplink-error"]').text()).toContain('không còn khả dụng');
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(false);
  });

  it('returns from schedule to selection when a replacement link fails', async () => {
    route.query = { serviceId: 'svc-a' };
    const wrapper = await renderWizard();
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    getService.mockRejectedValue(new Error('not found'));
    route.query = { serviceId: 'svc-gone' };
    await flushPromises();
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="booking-deeplink-error"]').exists()).toBe(true);
  });

  it('replaces A with a valid B from the changed URL', async () => {
    route.query = { serviceId: 'svc-a' };
    const wrapper = await renderWizard();
    route.query = { serviceId: 'svc-b' };
    await flushPromises();
    expect(recap(wrapper).text()).toContain('Dịch vụ B');
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeUndefined();
  });

  it('drops an older reply arriving after the newest link has already selected B', async () => {
    const older = deferred<unknown>();
    getService.mockReturnValue(older.promise);
    route.query = { serviceId: 'svc-old' };
    const wrapper = await renderWizard();
    route.query = { serviceId: 'svc-b' };
    await flushPromises();
    older.resolve({ ...serviceA, id: 'svc-old', isActive: true });
    await flushPromises();
    expect(recap(wrapper).text()).toContain('Dịch vụ B');
    expect(wrapper.text()).not.toContain('Đang tải dịch vụ từ liên kết');
  });

  it('does not reapply the initial link on catalog retry after the customer clears it', async () => {
    getCategories.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([categoryA]);
    getService.mockResolvedValue({ ...serviceA, isActive: true });
    const wrapper = await renderWizard();
    route.query = { serviceId: 'svc-a' };
    await flushPromises();
    await wrapper.get('[data-testid="recap-clear"]').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="step1-next"]').attributes('disabled')).toBeDefined();
  });

  it('does not let a pending catalog retry override an explicit choice', async () => {
    const retry = deferred<unknown>();
    getCategories.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retry.promise);
    getService.mockResolvedValue({ ...serviceA, isActive: true });
    const wrapper = await renderWizard();
    route.query = { serviceId: 'svc-a' };
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Thử lại')!.trigger('click');
    getService.mockResolvedValue({ ...serviceB, isActive: true });
    route.query = { serviceId: 'svc-b' };
    await flushPromises();
    await wrapper.get('[data-testid="recap-clear"]').trigger('click');
    retry.resolve([categoryA]);
    await flushPromises();
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
  });

  it('keeps the AI manual choice when a pending deep link responds later', async () => {
    route.meta = { bookingFlow: 'ai' };
    route.query = { aiSession: 'session-polish', desc: 'Máy lạnh cần kiểm tra' };
    const conversation = useSharedAiConversation();
    conversation.sessionId.value = 'session-polish';
    conversation.turnCount.value = 1;
    const wrapper = await renderWizard();
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    const pending = deferred<unknown>();
    getService.mockReturnValue(pending.promise);
    route.query = { ...route.query, serviceId: 'svc-late' };
    await flushPromises();
    await wrapper.get('[data-testid="ai-manual-service"]').setValue('svc-b');
    pending.resolve({ ...serviceA, id: 'svc-late', isActive: true });
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-current-service"] > div').text()).toContain('Dịch vụ B');
    expect(wrapper.get('[data-testid="ai-current-service"] > div').text()).not.toContain('Dịch vụ A');
  });

  it('keeps an explicit AI suggestion acceptance ahead of a pending link', async () => {
    route.meta = { bookingFlow: 'ai' };
    route.query = { aiSession: 'session-polish', desc: 'Máy lạnh cần kiểm tra' };
    const conversation = useSharedAiConversation();
    conversation.sessionId.value = 'session-polish';
    conversation.turnCount.value = 1;
    const wrapper = await renderWizard();
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    const pending = deferred<unknown>();
    getService.mockReturnValue(pending.promise);
    route.query = { ...route.query, serviceId: 'svc-late' };
    await flushPromises();
    await wrapper.get('[data-testid="ai-manual-service"]').setValue('svc-a');
    conversation.pinnedService.value = { serviceId: 'svc-b', serviceCode: 'B', nameVi: 'Dịch vụ B' };
    await flushPromises();
    await wrapper.get('[data-testid="ai-use-suggested"]').trigger('click');
    pending.resolve({ ...serviceA, id: 'svc-late', isActive: true });
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-current-service"] > div').text()).toContain('Dịch vụ B');
  });

  it('does not replace the AI manual choice with the URL service when the catalog retry handler runs', async () => {
    route.meta = { bookingFlow: 'ai' };
    route.query = { aiSession: 'session-polish', desc: 'Máy lạnh cần kiểm tra' };
    const conversation = useSharedAiConversation();
    conversation.sessionId.value = 'session-polish';
    conversation.turnCount.value = 1;
    const wrapper = await renderWizard();
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    route.query = { ...route.query, serviceId: 'svc-a' };
    await flushPromises();
    await wrapper.get('[data-testid="ai-manual-service"]').setValue('svc-b');
    // Invoke the retry callback directly: the successful catalog is already
    // cached, so no network/error UI is fabricated just to exercise a retry.
    await (wrapper.vm as unknown as { loadCategories: () => Promise<void> }).loadCategories();
    await flushPromises();
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-current-service"] > div').text()).toContain('Dịch vụ B');
  });

  it('keeps an invalid link blocked when a late AI recommendation arrives, until an explicit replacement', async () => {
    route.meta = { bookingFlow: 'ai' };
    route.query = { aiSession: 'session-polish', desc: 'Máy lạnh cần kiểm tra' };
    const conversation = useSharedAiConversation();
    conversation.sessionId.value = 'session-polish';
    conversation.turnCount.value = 1;
    const wrapper = await renderWizard();
    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    getService.mockRejectedValue(new Error('not found'));
    route.query = { ...route.query, serviceId: 'svc-gone' };
    await flushPromises();
    conversation.pinnedService.value = { serviceId: 'svc-a', serviceCode: 'A', nameVi: 'Dịch vụ A' };
    await flushPromises();
    expect(wrapper.get('[data-testid="booking-deeplink-error"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-continue"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="ai-manual-service"]').setValue('svc-b');
    expect(wrapper.find('[data-testid="booking-deeplink-error"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-continue"]').attributes('disabled')).toBeUndefined();
  });

  it('drops a late link reply that arrives after an explicit choice', async () => {
    const lateLink = deferred<unknown>();
    getService.mockReturnValue(lateLink.promise);
    const wrapper = await renderWizard();

    route.query = { serviceId: 'svc-late' };
    await flushPromises();
    expect(getService).toHaveBeenCalledWith('svc-late');

    await cardByText(wrapper, 'Dịch vụ A').trigger('click');
    expect(recap(wrapper).text()).toContain('Dịch vụ A');

    lateLink.resolve({
      id: 'svc-late', categoryId: 'cat-a', name: 'Dịch vụ đến muộn', code: 'L',
      pricingMode: 'inspection_required', isActive: true,
    });
    await flushPromises();

    expect(recap(wrapper).text()).toContain('Dịch vụ A');
    expect(recap(wrapper).text()).not.toContain('Dịch vụ đến muộn');
  });

  it('applies only the newest ?serviceId= when the link changes quickly', async () => {
    const firstLink = deferred<unknown>();
    const secondLink = deferred<unknown>();
    getService.mockImplementation((id: string) => (id === 'svc-late-a' ? firstLink.promise : secondLink.promise));
    const wrapper = await renderWizard();

    route.query = { serviceId: 'svc-late-a' };
    await flushPromises();
    route.query = { serviceId: 'svc-late-b' };
    await flushPromises();

    firstLink.resolve({
      id: 'svc-late-a', categoryId: 'cat-a', name: 'Dịch vụ A đến sau', code: 'LA',
      pricingMode: 'inspection_required', isActive: true,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-deeplink-error"]').exists()).toBe(false);

    secondLink.resolve({
      id: 'svc-late-b', categoryId: 'cat-a', name: 'Dịch vụ B đến sau', code: 'LB',
      pricingMode: 'inspection_required', isActive: true,
    });
    await flushPromises();
    expect(recap(wrapper).text()).toContain('Dịch vụ B đến sau');
  });

  it('ignores ?fixed=true: the Backend pricing mode is the only price authority', async () => {
    getCategories.mockResolvedValue([{
      id: 'cat-a', name: 'Điện lạnh', code: 'dl',
      services: [
        { id: 'svc-i', categoryId: 'cat-a', name: 'Dịch vụ khảo sát', code: 'I', pricingMode: 'inspection_required', fixedPrice: 0, basePrice: 300000, estimatedMinutes: 45 },
        { id: 'svc-legacy', categoryId: 'cat-a', name: 'Dịch vụ giá cũ', code: 'LEG', pricingMode: 'FIXED_PRICE', fixedPrice: 250000, unit: 'máy', estimatedMinutes: 30 },
      ],
    }]);
    route.query = { fixed: 'true' };
    const wrapper = await renderWizard();

    // Nothing is preselected by a query flag.
    expect(wrapper.find('[data-testid="selected-service-recap"]').exists()).toBe(false);

    const inspectionCard = cardByText(wrapper, 'Dịch vụ khảo sát');
    expect(inspectionCard.text()).toContain('Khảo sát, báo giá');
    expect(inspectionCard.find('[data-money]').exists()).toBe(false);

    const legacyCard = cardByText(wrapper, 'Dịch vụ giá cũ');
    expect(legacyCard.get('[data-testid="booking-service-price"]').text()).toBe('250k');

    await inspectionCard.trigger('click');
    expect(recap(wrapper).text()).toContain('Khảo sát, báo giá');
    expect(recap(wrapper).find('[data-money]').exists()).toBe(false);
  });

  it('fails closed on an invalid fixed price and an unknown mode, and blocks the next step', async () => {
    getCategories.mockResolvedValue([{
      id: 'cat-a', name: 'Điện lạnh', code: 'dl',
      services: [
        { id: 'svc-noprice', categoryId: 'cat-a', name: 'Dịch vụ thiếu giá', code: 'NP', pricingMode: 'fixed_price', fixedPrice: 0, estimatedMinutes: 30 },
        { id: 'svc-unknown', categoryId: 'cat-a', name: 'Dịch vụ chưa rõ giá', code: 'UN', pricingMode: 'mystery_mode', estimatedMinutes: 30 },
      ],
    }]);
    const wrapper = await renderWizard();

    const noPriceCard = cardByText(wrapper, 'Dịch vụ thiếu giá');
    expect(noPriceCard.text()).toContain('Tạm chưa đặt được');
    expect(noPriceCard.find('[data-money]').exists()).toBe(false);

    const unknownCard = cardByText(wrapper, 'Dịch vụ chưa rõ giá');
    expect(unknownCard.text()).toContain('Tạm chưa đặt được');

    await noPriceCard.trigger('click');
    expect(wrapper.get('[data-testid="recap-unavailable"]').exists()).toBe(true);

    await wrapper.get('[data-testid="step1-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="step2-next"]').exists()).toBe(false);
    expect(toastMock.warning).toHaveBeenCalled();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it('creates the booking once while the first request is still in flight', async () => {
    route.query = { serviceId: 'svc-a' };
    const booking = deferred<{ id: string }>();
    createBooking.mockReturnValue(booking.promise);
    const wrapper = await renderWizard();
    expect(wrapper.find('[data-testid="urgency-slider"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Mức độ khẩn cấp');
    await reachConfirm(wrapper);
    expect(wrapper.text()).not.toContain('Mức độ khẩn cấp');

    await wrapper.get('[data-testid="booking-submit"]').trigger('click');
    await wrapper.get('[data-testid="booking-submit"]').trigger('click');
    await flushPromises();

    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 'svc-a',
      quantity: 1,
      urgency: 'NORMAL',
      photoUploadIds: [],
    }));

    booking.resolve({ id: 'booking-id' });
    await flushPromises();
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-id/candidates');
  });

  it('never resends the booking after an ambiguous network failure', async () => {
    route.query = { serviceId: 'svc-a' };
    createBooking.mockRejectedValue(new Error('Network Error'));
    const wrapper = await renderWizard();
    await reachConfirm(wrapper);

    await wrapper.get('[data-testid="booking-submit"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="booking-submit-unknown"]').exists()).toBe(true);
    // Steps push their own history entries (PO 21/10/2026); the page never goes on to the candidates.
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/candidates'));

    await wrapper.get('[data-testid="booking-submit"]').trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledTimes(1);
  });

  it('lets the customer retry after the server answered with an error', async () => {
    route.query = { serviceId: 'svc-a' };
    createBooking
      .mockRejectedValueOnce({ response: { data: { message: 'Lỗi máy chủ, vui lòng thử lại.' } } })
      .mockResolvedValueOnce({ id: 'booking-id' });
    const wrapper = await renderWizard();
    await reachConfirm(wrapper);

    await wrapper.get('[data-testid="booking-submit"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-submit-unknown"]').exists()).toBe(false);

    await wrapper.get('[data-testid="booking-submit"]').trigger('click');
    await flushPromises();
    expect(createBooking).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-id/candidates');
  });
});
