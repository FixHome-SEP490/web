import { describe, expect, it } from 'vitest';
import { defineComponent, h, onMounted } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { bookingFormKey } from '../src/utils/booking-form-key';

// "Đặt thợ ngay" and "Chẩn đoán bằng AI" share one page: switching between them must load the other form (PO 10/10/2026).
describe('switching between the two booking forms', () => {
  it('keys only the two booking forms', () => {
    expect(bookingFormKey({ name: 'new-booking' })).toBe('new-booking');
    expect(bookingFormKey({ name: 'ai-booking' })).toBe('ai-booking');
    expect(bookingFormKey({ name: 'customer-dashboard' })).toBeUndefined();
    expect(bookingFormKey({ name: undefined })).toBeUndefined();
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
