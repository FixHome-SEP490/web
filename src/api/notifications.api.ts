// src/api/notifications.api.ts
import apiClient from './client';
import { readPage } from './paging';
import { partRequestsApi } from './part-requests.api';

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

  if (t === 'PART_RETURN_DECLARED') {
    return {
      category: 'TECHNICIAN', severity: 'warning', label: 'Kỹ thuật viên',
      eventLabel: 'Chờ nhận hoàn trả',
      badgeClass: 'bg-warning-50 text-warning-800 border-warning-200',
      ...toneOf('warning'), iconName: 'package',
    };
  }

  // 0. Types the backend names exactly, matched before any wording guess.
  // The technician has not left by the appointment time; the order cancels
  // itself if they still do not: a warning, so red.
  if (t === 'ORDER_DEPARTURE_WARNING') {
    return {
      category: 'SYSTEM',
      severity: 'error',
      label: 'Thông báo',
      eventLabel: 'Chưa xuất phát',
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf('error'),
      iconName: 'alert',
    };
  }
  // Every chosen technician declined or let the invitation lapse: the customer
  // has to pick others, so it needs the reader.
  if (t === 'BOOKING_MATCHING_EXHAUSTED') {
    return {
      category: 'SYSTEM',
      severity: 'warning',
      label: 'Thông báo',
      eventLabel: 'Chọn kỹ thuật viên khác',
      badgeClass: 'bg-ink-100 text-ink-600 border-ink-200',
      ...toneOf('warning'),
      iconName: 'clock',
    };
  }

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

/**
 * Where a customer lands from a notification, or null when it points nowhere.
 * A booking nobody accepted opens the technician list, so the customer can
 * pick others; visit groups open the parent visit, other bookings open the
 * booking, and the remaining references keep their existing order fallback.
 */
export function customerNotificationPath(item: NotificationItem): string | null {
  if (!item.referenceId) return null;
  const type = (item.type || '').toUpperCase();
  const refType = (item.referenceType || '').toUpperCase();
  // PART_REQUEST_READY points to a PartRequest, not a ServiceOrder. Resolve
  // its assigned order through the customer-authorized detail endpoint first.
  if (type === 'PART_REQUEST_READY') return null;
  if (type === 'BOOKING_MATCHING_EXHAUSTED') return `/app/bookings/${item.referenceId}/candidates`;
  // The technician could not make it (PO 20/10/2026): straight to choosing another one.
  if (type === 'TECHNICIAN_RELEASED') return `/app/bookings/${item.referenceId}/candidates?released=1`;
  if (refType === 'VISIT_GROUP') return `/app/visits/${encodeURIComponent(item.referenceId)}`;
  if (refType.includes('BOOKING')) return `/app/bookings/${item.referenceId}`;
  return `/app/orders/${item.referenceId}`;
}

/** Reads the order link from a PartRequest through its role-authorized detail API. */
export async function resolvePartRequestServiceOrderId(item: NotificationItem): Promise<string | null> {
  const type = (item.type || '').toUpperCase();
  if (type !== 'PART_REQUEST_READY' || !item.referenceId) return null;
  try {
    const orderId = (await partRequestsApi.getById(item.referenceId)).serviceOrderId?.trim();
    return orderId || null;
  } catch {
    // The detail endpoint enforces order ownership/assignment for the caller.
    return null;
  }
}

/** Resolves notification targets that need their server-owned parent reference. */
export async function resolveCustomerNotificationPath(item: NotificationItem): Promise<string | null> {
  const type = (item.type || '').toUpperCase();
  if (type === 'PART_REQUEST_READY') {
    const orderId = await resolvePartRequestServiceOrderId(item);
    return orderId ? `/app/orders/${encodeURIComponent(orderId)}` : null;
  }
  return customerNotificationPath(item);
}

export interface NotificationApiEnvelope<T> {
  success?: boolean;
  statusCode?: number;
  message?: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  total?: number;
  count?: number;
}

export const notificationsApi = {
  /** One page of my notifications, newest first; the total comes from `meta.total`. */
  async getMyNotifications(page = 1, limit = 20): Promise<NotificationsListResponse> {
    const res = await apiClient.get<unknown>('/notifications', {
      params: { page, limit },
    });
    const result = readPage<NotificationItem>(res.data, { page, pageSize: limit });
    return { data: result.items, total: result.total };
  },

  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get<NotificationApiEnvelope<{ count: number } | number> | { count: number } | number>('/notifications/unread-count');
    const raw = res.data;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'object' && raw !== null) {
      if ('count' in raw && typeof raw.count === 'number') return raw.count;
      if ('data' in raw) {
        if (typeof raw.data === 'number') return raw.data;
        if (typeof raw.data === 'object' && raw.data !== null && 'count' in raw.data && typeof raw.data.count === 'number') {
          return raw.data.count;
        }
      }
    }
    return 0;
  },

  async markAsRead(id: string): Promise<NotificationItem> {
    const res = await apiClient.patch<NotificationApiEnvelope<NotificationItem> | NotificationItem>(`/notifications/${id}/read`);
    const body = res.data;
    if (typeof body === 'object' && body !== null && 'data' in body && body.data) {
      return body.data as NotificationItem;
    }
    return body as NotificationItem;
  },

  async markAllAsRead(): Promise<{ affected: number }> {
    const res = await apiClient.patch<NotificationApiEnvelope<{ affected: number }> | { affected: number }>('/notifications/read-all');
    const body = res.data;
    if (typeof body === 'object' && body !== null && 'data' in body && body.data) {
      return body.data as { affected: number };
    }
    return body as { affected: number };
  },
};
