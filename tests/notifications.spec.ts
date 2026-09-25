// tests/notifications.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { getNotificationCategory, type NotificationItem } from '../src/api/notifications.api';
import { useNotificationsStore } from '../src/stores/notifications.store';
import apiClient from '../src/api/client';

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
    expect(cat.label).toBe('Quản lý dịch vụ (SM)');
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
    expect(cat.label).toBe('Quản trị viên FixHome');
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
