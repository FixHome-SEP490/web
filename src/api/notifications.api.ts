// src/api/notifications.api.ts
import apiClient from './client';

export type NotificationSenderRole = 'TECHNICIAN' | 'SERVICE_MANAGER' | 'ADMIN' | 'SYSTEM';
export type NotificationSeverity = 'error' | 'warning' | 'success' | 'info';

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

export interface NotificationCategoryMeta {
  category: NotificationSenderRole;
  severity: NotificationSeverity;
  label: string;
  eventLabel: string;
  badgeClass: string;
  iconBgClass: string;
  iconColorClass: string;
  iconName: 'wrench' | 'shield' | 'sparkles' | 'bell' | 'dollar' | 'check' | 'x' | 'truck' | 'package' | 'clock' | 'alert';
}

export interface NotificationsListResponse {
  data: NotificationItem[];
  total: number;
}

export interface UnreadCountResponse {
  count: number;
}

/**
 * Determine the visual sender category, severity and badge styling for a notification
 */
export function getNotificationCategory(item: NotificationItem): NotificationCategoryMeta {
  const t = (item.type || '').toUpperCase();
  const title = (item.title || '').toLowerCase();
  const m = (item.message || '').toLowerCase();

  // 1. Admin / System announcements
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
      severity: 'info',
      label: 'Quản trị viên FixHome',
      eventLabel: 'Ban Quản Trị',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      iconBgClass: 'bg-amber-100',
      iconColorClass: 'text-amber-700',
      iconName: 'sparkles',
    };
  }

  // 2. Service Manager (SM) triggers
  if (
    t.includes('SM') ||
    t.includes('MANAGER') ||
    t.includes('SUPPORT') ||
    t.startsWith('PART_REQUEST') ||
    title.includes('quản lý') ||
    title.includes('điều phối') ||
    title.includes('khiếu nại') ||
    m.includes('quản lý dịch vụ') ||
    m.includes('điều phối viên')
  ) {
    return {
      category: 'SERVICE_MANAGER',
      severity: t.includes('DISPUTE') || t.includes('CANCEL') ? 'error' : 'info',
      label: 'Quản lý dịch vụ (SM)',
      eventLabel: t.startsWith('PART_REQUEST') ? 'Linh kiện' : 'Quản lý (SM)',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      iconBgClass: 'bg-purple-100',
      iconColorClass: 'text-purple-700',
      iconName: t.startsWith('PART_REQUEST') ? 'package' : 'shield',
    };
  }

  // 3. Technician triggers & event specifics
  if (
    t.includes('TECHNICIAN') ||
    t.includes('TECH') ||
    t.includes('QUOTATION') ||
    t.includes('COMPLETION') ||
    t.includes('ADDITIONAL_COST') ||
    title.includes('kỹ thuật viên') ||
    title.includes('thợ') ||
    title.includes('báo giá') ||
    title.includes('phí phát sinh') ||
    title.includes('chi phí') ||
    title.includes('nghiệm thu') ||
    m.includes('kỹ thuật viên') ||
    m.includes('thợ')
  ) {
    let iconName: NotificationCategoryMeta['iconName'] = 'wrench';
    let iconBgClass = 'bg-blue-100';
    let iconColorClass = 'text-blue-700';
    let severity: NotificationSeverity = 'info';
    let eventLabel = 'Kỹ thuật viên';

    if (t.includes('ADDITIONAL_COST') || title.includes('phí phát sinh') || title.includes('chi phí')) {
      if (t === 'ADDITIONAL_COST_APPROVED' || (title.includes('duyệt') && title.includes('chi phí'))) {
        iconName = 'check';
        iconBgClass = 'bg-emerald-100';
        iconColorClass = 'text-emerald-700';
        severity = 'success';
        eventLabel = 'Duyệt phát sinh';
      } else if (t === 'ADDITIONAL_COST_REJECTED' || (title.includes('từ chối') && title.includes('chi phí'))) {
        iconName = 'x';
        iconBgClass = 'bg-rose-100';
        iconColorClass = 'text-rose-700';
        severity = 'error';
        eventLabel = 'Từ chối phát sinh';
      } else {
        iconName = 'dollar';
        iconBgClass = 'bg-amber-100';
        iconColorClass = 'text-amber-700';
        severity = 'warning';
        eventLabel = 'Phí phát sinh';
      }
    } else if (t.includes('QUOTATION') || title.includes('báo giá')) {
      if (t === 'QUOTATION_APPROVED' || (title.includes('duyệt') && title.includes('báo giá'))) {
        iconName = 'check';
        iconBgClass = 'bg-emerald-100';
        iconColorClass = 'text-emerald-700';
        severity = 'success';
        eventLabel = 'Duyệt báo giá';
      } else if (t === 'QUOTATION_REJECTED' || (title.includes('từ chối') && title.includes('báo giá'))) {
        iconName = 'x';
        iconBgClass = 'bg-rose-100';
        iconColorClass = 'text-rose-700';
        severity = 'error';
        eventLabel = 'Từ chối báo giá';
      } else {
        iconName = 'dollar';
        iconBgClass = 'bg-amber-100';
        iconColorClass = 'text-amber-700';
        severity = 'warning';
        eventLabel = 'Báo giá mới';
      }
    } else if (t === 'TECHNICIAN_ARRIVED' || title.includes('đã đến nơi') || title.includes('bắt đầu sửa chữa')) {
      iconName = 'check';
      iconBgClass = 'bg-emerald-100';
      iconColorClass = 'text-emerald-700';
      severity = 'success';
      eventLabel = 'Thợ đã đến';
    } else if (t === 'TECHNICIAN_EN_ROUTE' || title.includes('đang di chuyển')) {
      iconName = 'truck';
      iconBgClass = 'bg-blue-100';
      iconColorClass = 'text-blue-700';
      severity = 'info';
      eventLabel = 'Đang di chuyển';
    } else if (t === 'COMPLETION_REQUESTED' || title.includes('yêu cầu nghiệm thu')) {
      iconName = 'clock';
      iconBgClass = 'bg-purple-100';
      iconColorClass = 'text-purple-700';
      severity = 'warning';
      eventLabel = 'Nghiệm thu';
    } else if (t === 'COMPLETION_CONFIRMED' || title.includes('đã nghiệm thu')) {
      iconName = 'sparkles';
      iconBgClass = 'bg-emerald-100';
      iconColorClass = 'text-emerald-700';
      severity = 'success';
      eventLabel = 'Đã nghiệm thu';
    }

    return {
      category: 'TECHNICIAN',
      severity,
      label: 'Kỹ thuật viên',
      eventLabel,
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      iconBgClass,
      iconColorClass,
      iconName,
    };
  }

  // 4. Default / Order completed / Cancelled / Invitations
  if (t.includes('CANCEL') || title.includes('huỷ') || title.includes('hủy')) {
    return {
      category: 'SYSTEM',
      severity: 'error',
      label: 'Thông báo',
      eventLabel: 'Đã huỷ đơn',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      iconBgClass: 'bg-rose-100',
      iconColorClass: 'text-rose-700',
      iconName: 'x',
    };
  }
  if (t === 'ORDER_COMPLETED' || title.includes('hoàn thành')) {
    return {
      category: 'SYSTEM',
      severity: 'success',
      label: 'Thông báo',
      eventLabel: 'Hoàn thành',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconBgClass: 'bg-emerald-100',
      iconColorClass: 'text-emerald-700',
      iconName: 'check',
    };
  }
  if (t === 'BOOKING_INVITATION' || title.includes('thư mời') || title.includes('lời mời')) {
    return {
      category: 'SYSTEM',
      severity: 'info',
      label: 'Thông báo',
      eventLabel: 'Thư mời mới',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      iconBgClass: 'bg-indigo-100',
      iconColorClass: 'text-indigo-700',
      iconName: 'bell',
    };
  }

  return {
    category: 'SYSTEM',
    severity: 'info',
    label: 'Thông báo',
    eventLabel: 'Hệ thống',
    badgeClass: 'bg-ink-100 text-ink-700 border-ink-200',
    iconBgClass: 'bg-ink-100',
    iconColorClass: 'text-ink-600',
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
