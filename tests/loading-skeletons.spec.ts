// Screens that showed a spinner, a bare "Đang tải…" or a browser alert while
// their data loaded now show grey shapes of what is coming (PO 12/10/2026).
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';

const { route, getCategories, getAddresses, trackOrder, getOrder, chat } = vi.hoisted(() => ({
  route: { query: {} as Record<string, string>, params: {} },
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  trackOrder: vi.fn(),
  getOrder: vi.fn(),
  chat: { value: null as unknown },
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), useRoute: () => route }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { uploadBookingPhoto: vi.fn() },
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { createBooking: vi.fn() } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { trackOrder, getOrder } }));
vi.mock('../src/composables/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => chat.value }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { role: 'CUSTOMER' } }) }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';
import MessagesPage from '../src/pages/chat/MessagesPage.vue';
import TrackOrderPage from '../src/pages/public/TrackOrderPage.vue';
import VnpayReturnPage from '../src/pages/public/VnpayReturnPage.vue';

const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', { ...attrs, type: 'button', disabled: props.disabled || props.loading, onClick: (e: MouseEvent) => emit('click', e) }, slots.default?.());
  },
});
const Slot = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const stubs = { FhButton: Button, FhMoney: Slot, FhDatePicker: Slot, FhTimeScrollPicker: Slot, RouterLink: true, MapTilerMap: true, ChatThread: true };

describe('Booking form', () => {
  it('shows service and category shapes while loading, then a retry line instead of an alert', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    let fail!: (reason: unknown) => void;
    getCategories.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    getAddresses.mockResolvedValue([]);
    const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-categories-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Đang tải dịch vụ"]').exists()).toBe(true);

    fail(new Error('Network Error'));
    await flushPromises();
    expect(alert).not.toHaveBeenCalled();
    const error = wrapper.get('[data-testid="booking-catalog-error"]');
    expect(error.text()).toContain('Thử lại');
    expect(wrapper.text()).not.toContain('Network Error');

    getCategories.mockResolvedValueOnce([{ id: 'c1', name: 'Điện lạnh', code: 'dl', services: [{ id: 's1', name: 'Vệ sinh máy lạnh', estimatedMinutes: 30 }] }]);
    await error.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-catalog-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="booking-categories-skeleton"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Vệ sinh máy lạnh');
    vi.unstubAllGlobals();
  });
});

describe('Messages', () => {
  it('shows conversation shapes, not a loading sentence, until the list arrives', async () => {
    chat.value = reactive({
      conversations: [], loadingConversations: true, activeConversationId: null, isSocketConnected: false,
      fetchConversations: vi.fn(() => new Promise(() => undefined)), selectConversation: vi.fn(), openConversationForBooking: vi.fn(),
    });
    const wrapper = mount(MessagesPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="conversations-skeleton"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Đang tải');
  });
});

describe('Order lookup', () => {
  it('shows the shape of the result card while looking up', async () => {
    let answer!: (value: unknown) => void;
    trackOrder.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const wrapper = mount(TrackOrderPage, { global: { stubs } });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('FH-1');
    await inputs[1].setValue('0901234567');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.find('[data-testid="track-skeleton"]').exists()).toBe(true);

    answer({ code: 'FH-1', status: 'COMPLETED', serviceName: 'Sửa máy giặt', timeline: [] });
    await flushPromises();
    expect(wrapper.find('[data-testid="track-skeleton"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Sửa máy giặt');
  });
});

describe('VNPay return', () => {
  it('shows grey shapes, not a spinner, while the payment is being confirmed', async () => {
    route.query = { payment: 'success', orderId: 'o1' };
    getOrder.mockReturnValue(new Promise(() => undefined));
    const wrapper = mount(VnpayReturnPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="vnpay-checking"]').exists()).toBe(true);
    expect(wrapper.find('.animate-spin').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đang xác nhận thanh toán');
    wrapper.unmount();
    route.query = {};
  });
});
