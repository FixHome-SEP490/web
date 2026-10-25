// tests/notifications.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { customerNotificationPath, getNotificationCategory, resolveCustomerNotificationPath, resolvePartRequestServiceOrderId, type NotificationItem } from '../src/api/notifications.api';
import { useNotificationsStore } from '../src/stores/notifications.store';
import apiClient from '../src/api/client';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import NotificationBellDropdown from '../src/components/notifications/NotificationBellDropdown.vue';
import { useAuthStore } from '../src/stores/auth';

describe('Notification bell accessibility', () => {
  it('opens the manager returns queue for PART_RETURN_DECLARED, never the part request as an order', async () => {
    vi.restoreAllMocks();
    const pinia = createPinia(); setActivePinia(pinia);
    const auth = useAuthStore();
    vi.spyOn(auth, 'userRole', 'get').mockReturnValue('SERVICE_MANAGER');
    const store = useNotificationsStore();
    vi.spyOn(store, 'startPolling').mockImplementation(() => undefined);
    vi.spyOn(store, 'fetchNotifications').mockResolvedValue(undefined);
    const item: NotificationItem = { id: 'return-1', userId: 'sm-1', type: 'PART_RETURN_DECLARED', title: 'Linh kiện chờ nhận hoàn trả', message: 'Kỹ thuật viên đã khai trả 1 linh kiện', isRead: true, createdAt: '2026-10-23T10:00:00Z', referenceId: 'part-request-1', referenceType: 'PART_REQUEST' };
    store.notifications = [item]; store.unreadCount = 0;
    const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/console/part-returns', '/console/part-requests'].map(path => ({ path, component: { template: '<div />' } })) });
    await router.push('/'); await router.isReady();
    const w = mount(NotificationBellDropdown, { global: { plugins: [pinia, router] } });
    try {
      await w.get('#fixhome-global-bell-btn').trigger('click'); await flushPromises();
      await w.findAll('#fixhome-notifications-panel button').find(button => button.text().includes(item.title))!.trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/console/part-returns');
      expect(getNotificationCategory(item).eventLabel).toBe('Chờ nhận hoàn trả');
    } finally { w.unmount(); vi.restoreAllMocks(); }
  });

  it('exposes notification buttons and restores bell focus when dismissed with Escape', async () => {
    vi.restoreAllMocks();
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useNotificationsStore();
    vi.spyOn(store, 'startPolling').mockImplementation(() => undefined);
    vi.spyOn(store, 'fetchNotifications').mockResolvedValue(undefined);
    store.notifications = [{ id: 'ready', userId: 'u1', type: 'PART_REQUEST_READY', title: 'Máy 2 có linh kiện', message: 'Linh kiện sẵn sàng nhận', isRead: false, createdAt: '2026-10-23T10:00:00Z', referenceId: 'part-2', referenceType: 'part_request' }];
    store.unreadCount = 1;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    const wrapper = mount(NotificationBellDropdown, { attachTo: document.body, global: { plugins: [pinia, router] } });
    try {
      const bell = wrapper.get('#fixhome-global-bell-btn');
      expect(bell.attributes('aria-label')).toContain('1 chưa đọc');
      await bell.trigger('click');
      await flushPromises();
      expect(bell.attributes('aria-expanded')).toBe('true');
      const panel = wrapper.get('#fixhome-notifications-panel');
      expect(panel.attributes('role')).toBe('region');
      const item = panel.findAll('button').find((button) => button.text().includes('Máy 2 có linh kiện'))!;
      expect(item.text()).toContain('Xem máy và linh kiện');
      await item.trigger('keydown', { key: 'Escape' });
      expect(bell.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(bell.element);
    } finally {
      wrapper.unmount();
    }
  });
});

describe('Notification Categorization', () => {
  it('identifies technician notifications correctly', () => {
    const item: NotificationItem = {
      id: '1',
      userId: 'u1',
      title: 'Kỹ thuật viên đang di chuyển',
      message: 'Kỹ thuật viên đang trên đường đến nhà bạn',
      type: 'TECHNICIAN_EN_ROUTE',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const cat = getNotificationCategory(item);
    expect(cat.category).toBe('TECHNICIAN');
    expect(cat.label).toBe('Kỹ thuật viên');
  });

  it('identifies service manager notifications correctly', () => {
    const item: NotificationItem = {
      id: '2',
      userId: 'u1',
      title: 'Quản lý dịch vụ đã điều phối thợ',
      message: 'Đơn hàng của bạn đã có thợ phụ trách',
      type: 'SM_ORDER_UPDATE',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const cat = getNotificationCategory(item);
    expect(cat.category).toBe('SERVICE_MANAGER');
    expect(cat.label).toBe('Quản lý dịch vụ');
  });

  it('identifies admin notifications correctly', () => {
    const item: NotificationItem = {
      id: '3',
      userId: 'u1',
      title: 'Thông báo từ Ban Quản Trị FixHome',
      message: 'Hệ thống bảo trì định kỳ',
      type: 'ADMIN_ANNOUNCEMENT',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const cat = getNotificationCategory(item);
    expect(cat.category).toBe('ADMIN');
    expect(cat.label).toBe('FixHome');
  });
});

describe('useNotificationsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('updates unreadCount and marks notifications as read', async () => {
    const store = useNotificationsStore();
    store.notifications = [
      {
        id: 'n1',
        userId: 'u1',
        title: 'Thợ đã đến',
        message: 'Thợ đã có mặt',
        type: 'TECHNICIAN_ARRIVED',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'n2',
        userId: 'u1',
        title: 'Hoàn thành',
        message: 'Đã xong',
        type: 'COMPLETION_REQUESTED',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ];
    store.unreadCount = 2;

    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { id: 'n1', isRead: true },
    });

    await store.markAsRead('n1');
    expect(store.notifications[0].isRead).toBe(true);
    expect(store.unreadCount).toBe(1);

    vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { affected: 1 },
    });

    await store.markAllAsRead();
    expect(store.notifications[1].isRead).toBe(true);
    expect(store.unreadCount).toBe(0);
  });
});

describe('Departure warning and matching exhausted notifications', () => {
  const base = { userId: 'u1', isRead: false, createdAt: '2026-10-07T08:00:00Z' };

  it('shows a technician who has not left as a red warning that opens the order', () => {
    const item: NotificationItem = {
      ...base,
      id: 'n1',
      title: 'Kỹ thuật viên chưa xuất phát',
      message: 'Kỹ thuật viên của đơn #FH-1 chưa xuất phát.',
      type: 'ORDER_DEPARTURE_WARNING',
      referenceId: 'order-1',
      referenceType: 'SERVICE_ORDER',
    };
    const cat = getNotificationCategory(item);
    expect(cat.severity).toBe('error');
    expect(cat.eventLabel).toBe('Chưa xuất phát');
    expect(cat.iconColorClass).toContain('danger');
    expect(customerNotificationPath(item)).toBe('/app/orders/order-1');
  });

  it('sends the customer to pick other technicians when nobody accepted', () => {
    const item: NotificationItem = {
      ...base,
      id: 'n2',
      title: 'Chưa có kỹ thuật viên nhận lời mời',
      message: 'Các kỹ thuật viên bạn chọn đều chưa nhận lời mời.',
      type: 'BOOKING_MATCHING_EXHAUSTED',
      referenceId: 'booking-1',
      referenceType: 'BOOKING',
    };
    const cat = getNotificationCategory(item);
    expect(cat.eventLabel).toBe('Chọn kỹ thuật viên khác');
    expect(cat.severity).toBe('warning');
    expect(customerNotificationPath(item)).toBe('/app/bookings/booking-1/candidates');
  });

  it('sends the customer to choose another technician when theirs could not make it (PO 20/10/2026)', () => {
    const item: NotificationItem = { ...base, id: 'n-released', type: 'TECHNICIAN_RELEASED', referenceType: 'BOOKING', referenceId: 'booking-9' };
    expect(customerNotificationPath(item)).toBe('/app/bookings/booking-9/candidates?released=1');
  });

  it('keeps the usual destinations for other notifications', () => {
    const booking = { ...base, id: 'n3', title: 'x', message: 'x', type: 'BOOKING_CREATED', referenceId: 'b2', referenceType: 'BOOKING' };
    const order = { ...base, id: 'n4', title: 'x', message: 'x', type: 'ORDER_COMPLETED', referenceId: 'o2', referenceType: 'SERVICE_ORDER' };
    expect(customerNotificationPath(booking)).toBe('/app/bookings/b2');
    expect(customerNotificationPath(order)).toBe('/app/orders/o2');
    expect(customerNotificationPath({ ...order, referenceId: null })).toBeNull();
  });

  it('resolves PART_REQUEST_READY to its customer-owned service order instead of treating the part request as an order', async () => {
    const item: NotificationItem = {
      ...base,
      id: 'n-part-ready',
      type: 'PART_REQUEST_READY',
      referenceId: 'part-request-7',
      referenceType: 'part_request',
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: { id: 'part-request-7', serviceOrderId: 'service-order-3' } } } as never);

    expect(customerNotificationPath(item)).toBeNull();
    expect(customerNotificationPath({ ...item, referenceType: null })).toBeNull();
    await expect(resolvePartRequestServiceOrderId(item)).resolves.toBe('service-order-3');
    await expect(resolveCustomerNotificationPath(item)).resolves.toBe('/app/orders/service-order-3');
    await expect(resolveCustomerNotificationPath({ ...item, referenceType: null })).resolves.toBe('/app/orders/service-order-3');
    expect(apiClient.get).toHaveBeenCalledWith('/part-requests/part-request-7');

    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Forbidden'));
    await expect(resolvePartRequestServiceOrderId(item)).resolves.toBeNull();
  });
});
