import { describe, expect, it } from 'vitest';
import { defineComponent, h, onMounted } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router';
import { bookingFormKey, customerPageKey } from '../src/utils/booking-form-key';

// "Đặt thợ ngay" and "Chẩn đoán bằng AI" share one page: switching between them must load the other form (PO 10/10/2026).
describe('switching between the two booking forms', () => {
  it('keys only the two booking forms', () => {
    expect(bookingFormKey({ name: 'new-booking' })).toBe('new-booking');
    expect(bookingFormKey({ name: 'ai-booking' })).toBe('ai-booking');
    expect(bookingFormKey({ name: 'customer-dashboard' })).toBeUndefined();
    expect(bookingFormKey({ name: undefined })).toBeUndefined();
  });

  it('uses a distinct route key for each customer order, without changing other page keys', () => {
    expect(customerPageKey({ name: 'customer-order-detail', params: { id: 'order-a' } })).toBe('customer-order:order-a');
    expect(customerPageKey({ name: 'customer-order-detail', params: { id: 'order-b' } })).toBe('customer-order:order-b');
    expect(customerPageKey({ name: 'new-booking', params: {} })).toBe('new-booking');
    expect(customerPageKey({ name: 'customer-dashboard', params: {} })).toBeUndefined();
  });

  it('remounts customer order data on A -> B -> A navigation', async () => {
    const mounted: string[] = [];
    const Order = defineComponent({
      setup() {
        const route = useRoute();
        const frozenOrderId = String(route.params.id);
        onMounted(() => mounted.push(frozenOrderId));
        return () => h('p', `Invoice for ${frozenOrderId}`);
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/orders/:id', name: 'customer-order-detail', component: Order }],
    });
    const Shell = defineComponent({
      setup: () => () => h(RouterView, null, { default: ({ Component, route }: { Component: unknown; route: { name: string; params: { id?: string } } }) => h(Component as never, { key: customerPageKey(route) }) }),
    });
    await router.push('/app/orders/order-a');
    const wrapper = mount(Shell, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();
    expect(wrapper.text()).toBe('Invoice for order-a');
    await router.push('/app/orders/order-b');
    await flushPromises();
    expect(wrapper.text()).toBe('Invoice for order-b');
    await router.push('/app/orders/order-a');
    await flushPromises();
    expect(wrapper.text()).toBe('Invoice for order-a');
    expect(mounted).toEqual(['order-a', 'order-b', 'order-a']);
    wrapper.unmount();
  });

  it('mounts the page again when the customer goes from one form to the other', async () => {
    const mounted: string[] = [];
    const Wizard = defineComponent({
      setup() {
        const flow = router.currentRoute.value.meta.bookingFlow === 'ai' ? 'ai' : 'manual';
        onMounted(() => mounted.push(flow));
        return () => h('p', flow);
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/bookings/new', name: 'new-booking', component: Wizard },
        { path: '/app/bookings/ai', name: 'ai-booking', component: Wizard, meta: { bookingFlow: 'ai' } },
      ],
    });
    const Shell = defineComponent({
      setup: () => () => h(RouterView, null, { default: ({ Component, route }: { Component: unknown; route: { name: string } }) => h(Component as never, { key: bookingFormKey(route) }) }),
    });
    await router.push('/app/bookings/new');
    const w = mount(Shell, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();
    expect(w.text()).toBe('manual');
    await router.push('/app/bookings/ai');
    await flushPromises();
    expect(w.text()).toBe('ai');
    await router.push('/app/bookings/new');
    await flushPromises();
    expect(w.text()).toBe('manual');
    expect(mounted).toEqual(['manual', 'ai', 'manual']);
  });
});
