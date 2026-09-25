// src/api/notifications.api.ts
import apiClient from './client';

export type NotificationSenderRole = 'TECHNICIAN' | 'SERVICE_MANAGER' | 'ADMIN' | 'SYSTEM';

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  referenceId?: string | null;
  referenceType?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsListResponse {
  data: NotificationItem[];
  total: number;
}

export interface UnreadCountResponse {
  count: number;
}

/**
 * Determine the visual sender category for a notification
 */
export function getNotificationCategory(item: NotificationItem): {
  category: NotificationSenderRole;
  label: string;
  badgeClass: string;
  iconName: 'wrench' | 'shield' | 'sparkles' | 'bell';
} {
  const t = (item.type || '').toUpperCase();
  const m = (item.message || '').toLowerCase();
  const title = (item.title || '').toLowerCase();

  // 1. Admin / System announcements take highest priority
  if (
    t.includes('ADMIN') ||
    t.includes('SYSTEM') ||
    t.includes('POLICY') ||
    t.includes('PROMOTION') ||
    title.includes('hệ thống') ||
    title.includes('admin') ||
    title.includes('ban quản trị')
  ) {
    return {
      category: 'ADMIN',
      label: 'Quản trị viên FixHome',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      iconName: 'sparkles',
    };
  }

  // 2. Service Manager (SM) triggers (checked before technician because SM often discusses assigning thợ)
  if (
    t.includes('SM') ||
    t.includes('MANAGER') ||
    t.includes('SUPPORT') ||
    title.includes('quản lý') ||
    title.includes('điều phối') ||
    title.includes('khiếu nại') ||
    m.includes('quản lý dịch vụ') ||
    m.includes('điều phối viên')
  ) {
    return {
      category: 'SERVICE_MANAGER',
      label: 'Quản lý dịch vụ (SM)',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      iconName: 'shield',
    };
  }

  // 3. Technician triggers
  if (
    t.includes('TECHNICIAN') ||
    t.includes('TECH') ||
    t === 'QUOTATION_SUBMITTED' ||
    t === 'COMPLETION_REQUESTED' ||
    t === 'ADDITIONAL_COST_REQUESTED' ||
    title.includes('kỹ thuật viên') ||
    title.includes('thợ') ||
    m.includes('kỹ thuật viên') ||
    m.includes('thợ')
  ) {
    return {
      category: 'TECHNICIAN',
      label: 'Kỹ thuật viên',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      iconName: 'wrench',
    };
  }

  // Default to system
  return {
    category: 'SYSTEM',
    label: 'Thông báo',
    badgeClass: 'bg-ink-100 text-ink-700 border-ink-200',
    iconName: 'bell',
  };
}

export const notificationsApi = {
  async getMyNotifications(page = 1, limit = 20): Promise<NotificationsListResponse> {
    const res = await apiClient.get<NotificationsListResponse>('/notifications', {
      params: { page, limit },
    });
    return res.data;
  },

  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get<UnreadCountResponse>('/notifications/unread-count');
    return res.data?.count ?? 0;
  },

  async markAsRead(id: string): Promise<NotificationItem> {
    const res = await apiClient.patch<NotificationItem>(`/notifications/${id}/read`);
    return res.data;
  },

  async markAllAsRead(): Promise<{ affected: number }> {
    const res = await apiClient.patch<{ affected: number }>('/notifications/read-all');
    return res.data;
  },
};
