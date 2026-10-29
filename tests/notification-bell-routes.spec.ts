import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import NotificationBellDropdown from '../src/components/notifications/NotificationBellDropdown.vue';
import { useAuthStore } from '../src/stores/auth';
import { useNotificationsStore } from '../src/stores/notifications.store';
import apiClient from '../src/api/client';
import type { NotificationItem } from '../src/api/notifications.api';

afterEach(() => vi.restoreAllMocks());

const notification = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'notice-1', userId: 'user-1', type: 'SUPPORT_CASE_URGENT', title: 'Test support notice',
  message: 'Test support message', referenceType: 'SUPPORT_CASE', referenceId: 'case-1',
  isRead: true, createdAt: '2026-10-29T01:00:00Z', ...overrides,
});

async function clickNotice(role: string | null, item: NotificationItem, expected: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.spyOn(useAuthStore(), 'userRole', 'get').mockReturnValue(role);
  const store = useNotificationsStore();
  vi.spyOn(store, 'startPolling').mockImplementation(() => undefined);
  vi.spyOn(store, 'fetchNotifications').mockResolvedValue(undefined);
  store.notifications = [item];
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] });
  await router.push('/');
  const wrapper = mount(NotificationBellDropdown, { global: { plugins: [pinia, router] } });
  try {
    await wrapper.get('#fixhome-global-bell-btn').trigger('click');
    await flushPromises();
    await wrapper.findAll('#fixhome-notifications-panel button').find(button => button.text().includes(item.title!))!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(expected);
  } finally { wrapper.unmount(); }
}

describe('Notification bell role-safe references', () => {
  it.each([
    ['SERVICE_MANAGER', '/console/support/case-1'], ['ADMIN', '/console/support/case-1'],
    ['TECHNICIAN', '/tech/jobs'], ['CUSTOMER', '/app/notifications'],
    [null, '/403'],
  ])('routes SUPPORT_CASE for %s without fetching private context', async (role, expected) => {
    const get = vi.spyOn(apiClient, 'get');
    await clickNotice(role, notification({}), expected);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['CASH_DISPUTE', 'BOOKING_CANCELLED', 'PART_REQUEST_READY', 'CHAT_MESSAGE'])(
    'gives the SUPPORT_CASE reference precedence over %s', async type => {
      const get = vi.spyOn(apiClient, 'get');
      await clickNotice('ADMIN', notification({ type, referenceType: 'support_case', referenceId: 'case/other?x=1#detail' }),
        '/console/support/case%2Fother%3Fx%3D1%23detail');
      expect(get).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['SERVICE_MANAGER', '/console/support'], ['ADMIN', '/console/support'],
    ['TECHNICIAN', '/tech/jobs'], ['CUSTOMER', '/app/notifications'],
  ])('uses a safe fallback for a case without ID for %s', async (role, expected) => {
    await clickNotice(role, notification({ referenceId: null }), expected);
  });

  it.each([
    ['SERVICE_MANAGER', 'PART_RETURN_DECLARED', 'PART_REQUEST', 'part-1', '/console/part-returns'],
    ['ADMIN', 'PART_RETURN_DECLARED', 'PART_REQUEST', 'part-1', '/console/part-requests'],
    ['SERVICE_MANAGER', 'PART_REQUEST_READY', 'PART_REQUEST', 'part-1', '/console/part-requests'],
    ['ADMIN', 'BOOKING_CREATED', 'BOOKING', 'booking-1', '/console/bookings'],
    ['SERVICE_MANAGER', 'ORDER_CANCELLED', 'SERVICE_ORDER', 'order-1', '/console/cancellations'],
    ['ADMIN', 'ORDER_CANCELLED', 'SERVICE_ORDER', 'order-1', '/console/orders/order-1'],
    ['ADMIN', 'ORDER_COMPLETED', 'SERVICE_ORDER', 'order-1', '/console/orders/order-1'],
    ['TECHNICIAN', 'INVITATION_CREATED', 'BOOKING', 'booking-1', '/tech/invitations'],
    ['TECHNICIAN', 'ORDER_COMPLETED', 'SERVICE_ORDER', 'order-1', '/tech/jobs/order-1'],
    ['TECHNICIAN', 'VISIT_CASH_DECLARED', 'VISIT_GROUP', 'visit-1', '/tech/jobs'],
    ['TECHNICIAN', 'CHAT_MESSAGE', 'CONVERSATION', 'conversation-1', '/tech/messages'],
    ['CUSTOMER', 'CHAT_MESSAGE', 'CONVERSATION', 'conversation-1', '/app/messages'],
    ['CUSTOMER', 'BOOKING_CREATED', 'BOOKING', 'booking-1', '/app/bookings/booking-1'],
    ['CUSTOMER', 'ORDER_COMPLETED', 'SERVICE_ORDER', 'order-1', '/app/orders/order-1'],
    ['CUSTOMER', 'VISIT_CASH_DECLARED', 'VISIT_GROUP', 'visit-1', '/app/visits/visit-1'],
    ['CUSTOMER', 'BOOKING_MATCHING_EXHAUSTED', 'BOOKING', 'booking-1', '/app/bookings/booking-1/candidates'],
    ['CUSTOMER', 'TECHNICIAN_RELEASED', 'BOOKING', 'booking-1', '/app/bookings/booking-1/candidates?released=1'],
  ])('keeps %s %s %s on an accessible target', async (role, type, referenceType, referenceId, expected) => {
    await clickNotice(role, notification({ type, referenceType, referenceId }), expected);
  });

  it.each(['TECHNICIAN', 'CUSTOMER'])('resolves PART_REQUEST_READY through its authorized parent for %s', async role => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: { id: 'part-1', serviceOrderId: 'order-1' } } });
    await clickNotice(role, notification({ type: 'PART_REQUEST_READY', referenceType: 'PART_REQUEST', referenceId: 'part-1' }),
      role === 'TECHNICIAN' ? '/tech/jobs/order-1' : '/app/orders/order-1');
    expect(get).toHaveBeenCalledWith('/part-requests/part-1');
  });
});
