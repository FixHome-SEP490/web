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

/**
 * The backend writes an English log line plus a Vietnamese tag when a
 * technician's auto-accept took the job ("Technician accepted invitation (tự
 * nhận việc)"). The tag alone made the whole line pass as Vietnamese, so the
 * English half reached customers. Show only what it means.
 */
const AUTO_ACCEPT_TAG = ' (tự nhận việc)';
const NON_ASCII = /[^ -~]/;
function readableReason(title: string): string {
  if (title.endsWith(AUTO_ACCEPT_TAG) && !NON_ASCII.test(title.slice(0, -AUTO_ACCEPT_TAG.length))) {
    return 'Kỹ thuật viên bật tự nhận việc nên đơn được nhận tự động';
  }
  return toUserFacingMessage(title, '');
}

export function toTimelineSteps(entries: TimelineEntry[]): TimelineStep[] {
  return entries.map((entry, index) => {
    const label = timelineStatusLabel(entry.status);
    // Keep a recorded reason only when it is a sentence a person wrote for people.
    const reason = readableReason(entry.title ?? '');
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
