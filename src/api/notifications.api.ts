import apiClient from './client';
import { unwrap } from './response';

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

export const notificationsApi = {
  async getNotifications(page = 1, limit = 20): Promise<{ data: NotificationItem[]; total: number }> {
    const res = await apiClient.get('/notifications', { params: { page, limit } });
    return unwrap(res.data);
  },

  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get('/notifications/unread-count');
    const data = unwrap<{ count: number }>(res.data);
    return data.count ?? 0;
  },

  async markAsRead(id: string): Promise<NotificationItem> {
    const res = await apiClient.patch(`/notifications/${id}/read`);
    return unwrap<NotificationItem>(res.data);
  },

  async markAllAsRead(): Promise<{ affected: number }> {
    const res = await apiClient.patch('/notifications/read-all');
    return unwrap<{ affected: number }>(res.data);
  },
};
