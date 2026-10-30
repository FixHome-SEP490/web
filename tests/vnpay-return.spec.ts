import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, reactive } from 'vue';

const { routeState, router, getOrder, authState } = vi.hoisted(() => ({
  routeState: {
    current: undefined as { query: Record<string, unknown>; params: Record<string, unknown> } | undefined,
  },
  router: { push: vi.fn() },
  getOrder: vi.fn(),
  authState: { user: { role: 'CUSTOMER' } as { role: string } | null },
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeState.current,
  useRouter: () => router,
}));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getOrder } }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => authState }));

import VnpayReturnPage from '../src/pages/public/VnpayReturnPage.vue';

const ButtonStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.());
  },
});

const stubs = { FhButton: ButtonStub, FhSkeleton: true };

function setRoute(query: Record<string, unknown>, params: Record<string, unknown> = {}) {
  routeState.current = reactive({ query, params });
}

function mountPage() {
  return mount(VnpayReturnPage, { global: { stubs } });
}

beforeEach(() => {
  vi.useRealTimers();
  routeState.current = reactive({ query: {}, params: {} });
  router.push.mockReset();
  getOrder.mockReset();
  authState.user = { role: 'CUSTOMER' };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VNPay return status', () => {
  it('never treats a success query without orderId as paid', async () => {
    setRoute({ payment: 'success' });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa xác nhận được kết quả thanh toán');
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(getOrder).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not use an orderId route param as a fallback for the missing query id', async () => {
    setRoute({ payment: 'success' }, { orderId: 'param-order' });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(getOrder).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps an unpaid order unconfirmed and pending after polling expires', async () => {
    vi.useFakeTimers();
    setRoute({ payment: 'success', orderId: 'unpaid-order' });
    getOrder.mockResolvedValue({ paymentStatus: 'UNPAID' });

    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="vnpay-checking"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(getOrder).toHaveBeenCalledWith('unpaid-order');

    await vi.runAllTimersAsync();
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa xác nhận được kết quả thanh toán');
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not claim paid after the payment endpoint times out', async () => {
    vi.useFakeTimers();
    setRoute({ payment: 'success', orderId: 'order-timeout' });
    getOrder.mockRejectedValue(new Error('network timeout'));

    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');

    await vi.runAllTimersAsync();
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa xác nhận được kết quả thanh toán');
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps a failed provider return failed without treating it as paid', async () => {
    setRoute({ payment: 'failed', orderId: 'order-failed' });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Thanh toán chưa hoàn tất');
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(getOrder).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores a paid response from an old query after local route query replacement', async () => {
    let resolveOrder!: (order: { paymentStatus: string }) => void;
    setRoute({ payment: 'success', orderId: 'old-order' });
    getOrder.mockReturnValueOnce(new Promise((resolve) => { resolveOrder = resolve; }));

    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="vnpay-checking"]').exists()).toBe(true);

    routeState.current!.query = { payment: 'success' };
    await nextTick();
    resolveOrder({ paymentStatus: 'PAID' });
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa xác nhận được kết quả thanh toán');
    expect(wrapper.text()).not.toContain('Thanh toán thành công!');
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows and redirects to the customer order only after the server confirms PAID', async () => {
    vi.useFakeTimers();
    setRoute({ payment: 'success', orderId: 'paid-order' });
    getOrder.mockResolvedValue({ paymentStatus: 'PAID' });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Thanh toán thành công!');
    expect(getOrder).toHaveBeenCalledWith('paid-order');
    expect(router.push).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(router.push).toHaveBeenCalledWith('/app/orders/paid-order?autoReview=true');
    wrapper.unmount();
  });
});
