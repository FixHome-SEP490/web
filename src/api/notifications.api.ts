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
 * Icon tone follows severity only, so the list stays calm: red for something
 * that went wrong, yellow for something that needs the reader, brand blue for
 * good news and grey for everything else.
 */
function toneOf(severity: NotificationSeverity): Pick<NotificationCategoryMeta, 'iconBgClass' | 'iconColorClass'> {
  switch (severity) {
    case 'error':
      return { iconBgClass: 'bg-danger-50 border-danger-100', iconColorClass: 'text-danger-600' };
    case 'warning':
      return { iconBgClass: 'bg-warning-50 border-warning-100', iconColorClass: 'text-warning-700' };
    case 'success':
      return { iconBgClass: 'bg-brand-50 border-brand-100', iconColorClass: 'text-brand-600' };
    default:
      return { iconBgClass: 'bg-ink-100 border-ink-200', iconColorClass: 'text-ink-600' };
  }
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
      label: 'FixHome',
      eventLabel: 'FixHome',
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf('info'),
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
      label: 'Quản lý dịch vụ',
      eventLabel: t.startsWith('PART_REQUEST') ? 'Linh kiện' : 'Quản lý dịch vụ',
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf(t.includes('DISPUTE') || t.includes('CANCEL') ? 'error' : 'info'),
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
    let severity: NotificationSeverity = 'info';
    let eventLabel = 'Kỹ thuật viên';

    if (t.includes('ADDITIONAL_COST') || title.includes('phí phát sinh') || title.includes('chi phí')) {
      if (t === 'ADDITIONAL_COST_APPROVED' || (title.includes('duyệt') && title.includes('chi phí'))) {
        iconName = 'check';
        severity = 'success';
        eventLabel = 'Duyệt phát sinh';
      } else if (t === 'ADDITIONAL_COST_REJECTED' || (title.includes('từ chối') && title.includes('chi phí'))) {
        iconName = 'x';
        severity = 'error';
        eventLabel = 'Từ chối phát sinh';
      } else {
        iconName = 'dollar';
        severity = 'warning';
        eventLabel = 'Phí phát sinh';
      }
    } else if (t.includes('QUOTATION') || title.includes('báo giá')) {
      if (t === 'QUOTATION_APPROVED' || (title.includes('duyệt') && title.includes('báo giá'))) {
        iconName = 'check';
        severity = 'success';
        eventLabel = 'Duyệt báo giá';
      } else if (t === 'QUOTATION_REJECTED' || (title.includes('từ chối') && title.includes('báo giá'))) {
        iconName = 'x';
        severity = 'error';
        eventLabel = 'Từ chối báo giá';
      } else {
        iconName = 'dollar';
        severity = 'warning';
        eventLabel = 'Báo giá mới';
      }
    } else if (t === 'TECHNICIAN_ARRIVED' || title.includes('đã đến nơi') || title.includes('bắt đầu sửa chữa')) {
      iconName = 'check';
      severity = 'success';
      eventLabel = 'Kỹ thuật viên đã đến';
    } else if (t === 'TECHNICIAN_EN_ROUTE' || title.includes('đang di chuyển')) {
      iconName = 'truck';
      severity = 'info';
      eventLabel = 'Đang di chuyển';
    } else if (t === 'COMPLETION_REQUESTED' || title.includes('yêu cầu nghiệm thu')) {
      iconName = 'clock';
      severity = 'warning';
      eventLabel = 'Nghiệm thu';
    } else if (t === 'COMPLETION_CONFIRMED' || title.includes('đã nghiệm thu')) {
      iconName = 'sparkles';
      severity = 'success';
      eventLabel = 'Đã nghiệm thu';
    }

    return {
      category: 'TECHNICIAN',
      severity,
      label: 'Kỹ thuật viên',
      eventLabel,
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf(severity),
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
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf('error'),
      iconName: 'x',
    };
  }
  if (t === 'ORDER_COMPLETED' || title.includes('hoàn thành')) {
    return {
      category: 'SYSTEM',
      severity: 'success',
      label: 'Thông báo',
      eventLabel: 'Hoàn thành',
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf('success'),
      iconName: 'check',
    };
  }
  if (t === 'BOOKING_INVITATION' || title.includes('thư mời') || title.includes('lời mời')) {
    return {
      category: 'SYSTEM',
      severity: 'info',
      label: 'Thông báo',
      eventLabel: 'Thư mời mới',
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf('info'),
      iconName: 'bell',
    };
  }

  return {
    category: 'SYSTEM',
    severity: 'info',
    label: 'Thông báo',
    eventLabel: 'Hệ thống',
    badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
    ...toneOf('info'),
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
