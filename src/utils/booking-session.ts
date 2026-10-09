import { addDaysToKey, vnDateString, vnDayKey, vnKeyAndClockToDate, vnTimeString, weekdayOfKey } from './vn-time';

/**
 * Booking sessions (PO 08/10/2026): a scheduled booking takes the morning
 * (08:00-12:00) or the afternoon (13:00-18:00) of one day, Vietnam time; an
 * urgent booking means "come now".
 */
export type BookingSlot = 'morning' | 'afternoon';
export type BookingMode = 'scheduled' | 'urgent';

export const SLOT_LABELS: Record<BookingSlot, string> = {
  morning: 'Buổi sáng (8:00 - 12:00)',
  afternoon: 'Buổi chiều (13:00 - 18:00)',
};

/** "Buổi sáng (8:00 - 12:00), 12/10/2026", "Tới ngay", or the plain start time for older bookings. */
export function sessionLabel(input: { bookingMode?: string | null; slot?: string | null; start?: string | Date | null }): string {
  if (input.bookingMode === 'urgent') return 'Tới ngay';
  const start = input.start ? new Date(input.start) : null;
  const day = start && Number.isFinite(start.getTime()) ? vnDateString(start) : '';
  if (input.slot === 'morning' || input.slot === 'afternoon') return day ? `${SLOT_LABELS[input.slot]}, ${day}` : SLOT_LABELS[input.slot];
  if (!start || !Number.isFinite(start.getTime())) return 'Chưa có lịch hẹn';
  return `${vnTimeString(start)} ${day}`;
}

/** One session a customer can pick, and whether the technician is free for it. */
export interface SessionOption {
  date: string;
  slot: BookingSlot;
  available: boolean;
  reason: string | null;
}

export const SLOT_SHORT: Record<BookingSlot, string> = { morning: 'Sáng 8:00 - 12:00', afternoon: 'Chiều 13:00 - 18:00' };
const SLOT_START_HOUR: Record<BookingSlot, number> = { morning: 8, afternoon: 13 };

/** Sessions of the next days that have not started yet, Vietnam time; nobody's availability is known here. */
export function upcomingSessions(days = 14, now: Date = new Date()): SessionOption[] {
  const today = vnDayKey(now);
  const sessions: SessionOption[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysToKey(today, i);
    for (const slot of ['morning', 'afternoon'] as BookingSlot[]) {
      if (vnKeyAndClockToDate(date, SLOT_START_HOUR[slot], 0).getTime() <= now.getTime()) continue;
      sessions.push({ date, slot, available: true, reason: null });
    }
  }
  return sessions;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** "Thứ 2, 13/10" for a Vietnam day key. */
export function sessionDayLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${WEEKDAYS[weekdayOfKey(date)]}, ${d}/${m}`;
}

/** True once the technician may set out (the server opens it one hour before the appointment). */
export function canDepartNow(departAvailableAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!departAvailableAt) return true;
  const at = Date.parse(departAvailableAt);
  return !Number.isFinite(at) || now >= at;
}
