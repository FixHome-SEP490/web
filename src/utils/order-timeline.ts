import type { TimelineStep } from '../components/FhTimeline.vue';
import { toUserFacingMessage } from './user-facing-error';
import { vnDateTimeString } from './vn-time';

/**
 * Timeline entries come from the order's status history: the new status, the
 * reason the system recorded (often an English log line such as "Technician
 * en route"), when, and who. Customers and technicians see the status in the
 * shared Vietnamese wording, the time in Vietnam time and the actor as a role.
 */

/** Service Order labels from FIXHOME-DESIGN-SYSTEM.md §8.2. */
const STATUS_LABELS: Record<string, string> = {
  accepted: 'Đã nhận đơn',
  en_route: 'Đang di chuyển',
  under_repair: 'Đang sửa chữa',
  in_progress: 'Đang sửa chữa',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const ACTOR_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  technician: 'Kỹ thuật viên',
  service_manager: 'Quản lý dịch vụ',
  admin: 'Quản trị viên',
  system: 'Hệ thống',
};

export interface TimelineEntry {
  status?: string | null;
  title?: string | null;
  timestamp?: string | null;
  actor?: string | null;
}

export function timelineStatusLabel(status?: string | null): string {
  return STATUS_LABELS[String(status ?? '').toLowerCase()] ?? 'Cập nhật trạng thái';
}

export function timelineActorLabel(actor?: string | null): string | undefined {
  if (!actor) return undefined;
  return ACTOR_LABELS[actor.toLowerCase()];
}

function formatWhen(value?: string | null): string | undefined {
  if (!value) return undefined;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? undefined : vnDateTimeString(time);
}

export function toTimelineSteps(entries: TimelineEntry[]): TimelineStep[] {
  return entries.map((entry, index) => {
    const label = timelineStatusLabel(entry.status);
    // Keep a recorded reason only when it is a sentence a person wrote for people.
    const reason = toUserFacingMessage(entry.title ?? '', '');
    return {
      key: `${entry.status}-${index}`,
      label,
      timestamp: formatWhen(entry.timestamp),
      actor: timelineActorLabel(entry.actor),
      note: reason && reason !== label ? reason : undefined,
      completed: index < entries.length - 1,
      current: index === entries.length - 1,
    };
  });
}
