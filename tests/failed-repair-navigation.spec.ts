import { afterEach, expect, it } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import FailedRepairBookingForm from '../src/components/customer/FailedRepairBookingForm.vue';
import { blockedFailedRepair, failedRepairKey } from '../src/api/failed-repair.api';
enableAutoUnmount(afterEach);
it('browser Back returns review to step 2 with the chosen slot retained', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/wizard', component: { template: '<div />' } }] });
  await router.push('/wizard?repairFailure=B');
  const w = mount(FailedRepairBookingForm, { props: { sourceBookingIds: ['B'], customerId: 'customer' }, global: {
    plugins: [router], provide: { [failedRepairKey as symbol]: { ...blockedFailedRepair, available: true, readDraft: async () => ({
      id: 'draft', customerId: 'customer', expiresAt: '2099-01-01', address: { id: 'address', userId: 'customer', line1: 'Fixture', district: 'Fixture', province: 'Fixture', isDefault: true },
      items: [{ sourceBookingId: 'B', outcome: 'failed', active: true, serviceId: 'service', serviceName: 'Máy B', description: 'Fixture', deviceAttributes: {}, media: [] }],
    }) } },
    stubs: { BookingSessionPicker: { emits: ['update:modelValue'], template: '<button data-testid="choose" @click="$emit(\'update:modelValue\', {date:\'2090-01-01\',slot:\'morning\'})">Chọn</button>' } },
  } });
  await flushPromises();
  await w.get('[data-testid="choose"]').trigger('click');
  await w.get('[data-testid="failed-next"]').trigger('click');
  await flushPromises();
  expect(router.currentRoute.value.query.step).toBe('4');
  router.back();
  await flushPromises();
  expect(w.find('[data-testid="failed-next"]').exists()).toBe(true);
  expect(w.get('[data-testid="failed-next"]').attributes('disabled')).toBeUndefined();
});
