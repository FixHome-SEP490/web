import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, useRoute, useRouter } from 'vue-router';
import { useStepHistory } from '../src/components/booking/use-step-history';

// PO 21/10/2026: "Quay lại" and the browser/phone back go to the step before,
// never out of the booking form.
async function setup(start = '/app/bookings/new') {
  const step = ref(1);
  const Wizard = defineComponent({
    setup() {
      useStepHistory(step, useRouter(), useRoute());
      return () => h('div', String(step.value));
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('p', 'home') } },
      { path: '/app/bookings/new', component: Wizard },
    ],
  });
  await router.push('/');
  await router.push(start);
  await router.isReady();
  const wrapper = mount(Wizard, { global: { plugins: [router] } });
  await flushPromises();
  const go = async (to: number) => { step.value = to; await nextTick(); await flushPromises(); };
  const back = async () => { router.back(); await flushPromises(); await nextTick(); };
  return { step, router, wrapper, go, back };
}

describe('booking steps in the browser history', () => {
  it('puts every step forward in the URL and walks back step by step, then leaves', async () => {
    const { step, router, go, back } = await setup();
    await go(2);
    expect(router.currentRoute.value.query.step).toBe('2');
    await go(4);
    expect(router.currentRoute.value.query.step).toBe('4');

    await back();
    expect(step.value).toBe(2);
    await back();
    expect(step.value).toBe(1);
    expect(router.currentRoute.value.query.step).toBeUndefined();
    await back();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('rewinds the history when the page itself goes back ("Quay lại", "Sửa")', async () => {
    const { step, router, go, back } = await setup();
    await go(2);
    await go(4);
    await go(1); // "Sửa" on the service line
    expect(router.currentRoute.value.query.step).toBeUndefined();
    expect(step.value).toBe(1);
    // No stale step-2 or step-4 entry is left behind it: one more back leaves the form.
    await back();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('follows the assistant order 1 → 3 → 2 → 4 back as 4 → 2 → 3 → 1', async () => {
    const { step, go, back } = await setup();
    await go(3);
    await go(2);
    await go(4);
    await back();
    expect(step.value).toBe(2);
    await back();
    expect(step.value).toBe(3);
    await back();
    expect(step.value).toBe(1);
  });

  it('does not let browser "forward" jump to a step left behind', async () => {
    const { step, router, go, back } = await setup();
    await go(2);
    await back();
    expect(step.value).toBe(1);
    router.forward();
    await flushPromises();
    await nextTick();
    await flushPromises();
    expect(step.value).toBe(1);
    expect(router.currentRoute.value.query.step).toBeUndefined();
  });

  it('starts a reloaded ?step=4 link at the first step, keeping the other query values', async () => {
    const { step, router } = await setup('/app/bookings/new?serviceId=svc-a&step=4');
    expect(step.value).toBe(1);
    expect(router.currentRoute.value.query).toEqual({ serviceId: 'svc-a' });
  });
});
