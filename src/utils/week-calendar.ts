import { addDaysToKey, parseDayKey, vnDayKey, vnKeyAndClockToDate, vnParts, weekdayOfKey } from './vn-time';

/**
 * Layout of the technician's week calendar (PO 12/10/2026): days as columns,
 * hours as rows, like Google Calendar.
 *
 * Every day is a Vietnam calendar day ('yyyy-MM-dd' key) and every position is
 * minutes after Vietnam midnight, whatever zone the browser is in. Weeks start
 * on Monday, as calendars in Vietnam do.
 */

export const DAY_MINUTES = 24 * 60;
const MINUTE_MS = 60 * 1000;
const DAY_MS = DAY_MINUTES * MINUTE_MS;

/** Whole hours shown, `startHour` inclusive to `endHour` exclusive. */
export interface HourRange {
  startHour: number;
  endHour: number;
}

/** Hours shown when nothing in the week falls outside them. */
export const DEFAULT_HOUR_RANGE: HourRange = { startHour: 6, endHour: 22 };

const SHORT_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const pad = (n: number) => String(n).padStart(2, '0');

export interface CalendarDay {
  key: string;
  /** 0 = Sunday, as the weekly schedule stores it. */
  weekday: number;
  /** "T2" … "CN". */
  shortName: string;
  /** "13/10". */
  dateLabel: string;
  isToday: boolean;
}

/** The Monday (Vietnam day key) of the week the instant falls in. */
export function weekStartKey(input: Date | string | number = new Date()): string {
  const key = vnDayKey(input);
  return addDaysToKey(key, -((weekdayOfKey(key) + 6) % 7));
}

/** The seven days of the week starting at `startKey`, Monday first. */
export function weekDays(startKey: string, now: Date = new Date()): CalendarDay[] {
  const today = vnDayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToKey(startKey, i);
    const d = parseDayKey(key);
    const weekday = weekdayOfKey(key);
    return {
      key,
      weekday,
      shortName: SHORT_WEEKDAYS[weekday] ?? '',
      dateLabel: d ? `${pad(d.day)}/${pad(d.month)}` : '',
      isToday: key === today,
    };
  });
}

/** "13/10 – 19/10/2026", or both years when the week crosses New Year. */
export function weekRangeLabel(startKey: string): string {
  const s = parseDayKey(startKey);
  const e = parseDayKey(addDaysToKey(startKey, 6));
  if (!s || !e) return '';
  const short = (d: { day: number; month: number }) => `${pad(d.day)}/${pad(d.month)}`;
  return s.year === e.year
    ? `${short(s)} – ${short(e)}/${e.year}`
    : `${short(s)}/${s.year} – ${short(e)}/${e.year}`;
}

/**
 * Minutes after midnight of a stored "HH:mm" (seconds ignored). The schedule
 * stores the end of the day as "23:59"; as an end time that is 24:00.
 */
export function clockToMinutes(value: string, kind: 'start' | 'end' = 'start'): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;
  const total = hour * 60 + minute;
  return kind === 'end' && total === DAY_MINUTES - 1 ? DAY_MINUTES : total;
}

/** "HH:mm" of minutes after midnight; the end of the day reads "24:00". */
export function minutesToClock(minutes: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** One weekday of the schedule editor (index 0 = Sunday). */
export interface ScheduleDraftSlot {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface SavedScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** True when the editor shows something other than what the server holds. */
export function scheduleDiffers(draft: readonly ScheduleDraftSlot[], saved: readonly SavedScheduleSlot[]): boolean {
  const byDay = new Map<number, SavedScheduleSlot>();
  for (const s of saved) if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, s);
  for (let day = 0; day < 7; day++) {
    const stored = byDay.get(day);
    const slot = draft[day];
    const on = Boolean(slot?.enabled);
    if (on !== Boolean(stored)) return true;
    if (stored && slot && (stored.startTime !== slot.startTime || stored.endTime !== slot.endTime)) return true;
  }
  return false;
}

export interface TimeBlock {
  id: string;
  dayKey: string;
  startMin: number;
  endMin: number;
}

export interface TimeOffEntry {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

/** The part of one time-off entry that falls on one day. */
export interface OffSegment extends TimeBlock {
  /** The whole day is off. */
  fullDay: boolean;
  reason: string | null;
}

/** Cuts each time-off entry into the days of the week it covers. */
export function timeOffSegments(dayKeys: readonly string[], entries: readonly TimeOffEntry[]): OffSegment[] {
  const segments: OffSegment[] = [];
  for (const entry of entries) {
    const start = Date.parse(entry.startAt);
    const end = Date.parse(entry.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    for (const key of dayKeys) {
      const dayStart = vnKeyAndClockToDate(key, 0, 0).getTime();
      const from = Math.max(start, dayStart);
      const to = Math.min(end, dayStart + DAY_MS);
      if (to <= from) continue;
      const startMin = Math.floor((from - dayStart) / MINUTE_MS);
      // An entry saved to 23:59:59 covers the rest of the day.
      const endMin = Math.min(DAY_MINUTES, Math.ceil((to - dayStart) / MINUTE_MS));
      segments.push({
        id: `${entry.id}:${key}`,
        dayKey: key,
        startMin,
        endMin,
        fullDay: startMin === 0 && endMin >= DAY_MINUTES,
        reason: entry.reason?.trim() || null,
      });
    }
  }
  return segments;
}

export interface WorkBlock extends TimeBlock {
  /** Time off falls in these hours, so no job comes in then. */
  cancelled: boolean;
}

/** The working hours of each day of the week, from the editor (enabled and valid days only). */
export function workBlocks(
  days: readonly Pick<CalendarDay, 'key' | 'weekday'>[],
  draft: readonly ScheduleDraftSlot[],
  off: readonly OffSegment[] = [],
): WorkBlock[] {
  const blocks: WorkBlock[] = [];
  for (const day of days) {
    const slot = draft[day.weekday];
    if (!slot?.enabled) continue;
    const startMin = clockToMinutes(slot.startTime, 'start');
    const endMin = clockToMinutes(slot.endTime, 'end');
    if (startMin === null || endMin === null || endMin <= startMin) continue;
    const cancelled = off.some((o) => o.dayKey === day.key && o.startMin < endMin && o.endMin > startMin);
    blocks.push({ id: `work:${day.key}`, dayKey: day.key, startMin, endMin, cancelled });
  }
  return blocks;
}

/** What the calendar needs of a service order. */
export interface CalendarJobInput {
  id: string;
  code?: string;
  serviceName: string;
  status: string;
  /** The appointment start (the booking's preferred start). */
  scheduledAt: string | null | undefined;
  bookingMode?: string | null;
  slot?: string | null;
}

export interface JobBlock extends TimeBlock {
  jobId: string;
  code: string;
  title: string;
  /** "08:00–12:00", "Tới ngay 09:15" or "14:00". */
  timeLabel: string;
  completed: boolean;
}

/** Session ends (backend `booking-slots.ts`), Vietnam time. */
const SLOT_END_HOUR: Record<string, number> = { morning: 12, afternoon: 18, evening: 23 };
/** Height given to a job whose end is not known (urgent or older bookings): one hour. */
export const OPEN_JOB_MINUTES = 60;

/** Booked jobs whose appointment starts on one of the days; cancelled ones are left out. */
export function jobBlocks(dayKeys: readonly string[], jobs: readonly CalendarJobInput[]): JobBlock[] {
  const inWeek = new Set(dayKeys);
  const blocks: JobBlock[] = [];
  for (const job of jobs) {
    const status = String(job.status ?? '').toUpperCase();
    if (status === 'CANCELLED' || !job.scheduledAt) continue;
    const at = Date.parse(job.scheduledAt);
    if (!Number.isFinite(at)) continue;
    const dayKey = vnDayKey(at);
    if (!inWeek.has(dayKey)) continue;
    const p = vnParts(at);
    const startMin = p.hour * 60 + p.minute;
    const urgent = job.bookingMode === 'urgent';
    const slotEnd = !urgent && job.slot ? SLOT_END_HOUR[job.slot] : undefined;
    let endMin = slotEnd !== undefined ? slotEnd * 60 : startMin + OPEN_JOB_MINUTES;
    if (endMin <= startMin) endMin = startMin + OPEN_JOB_MINUTES;
    endMin = Math.min(endMin, DAY_MINUTES);
    const timeLabel =
      slotEnd !== undefined
        ? `${minutesToClock(startMin)}–${minutesToClock(endMin)}`
        : urgent
          ? `Tới ngay ${minutesToClock(startMin)}`
          : minutesToClock(startMin);
    blocks.push({
      id: `job:${job.id}`,
      jobId: job.id,
      code: job.code ?? '',
      title: job.serviceName?.trim() || 'Đơn sửa chữa',
      dayKey,
      startMin,
      endMin,
      timeLabel,
      completed: status === 'COMPLETED',
    });
  }
  return blocks;
}

export interface PlacedBlock<T> {
  block: T;
  /** 0-based lane from the left. */
  lane: number;
  /** Lanes the overlapping group shares the column with. */
  lanes: number;
}

/**
 * Side-by-side layout of one day's blocks: blocks that overlap (directly or
 * through a chain) share the column in lanes; one that only touches another
 * (ends when the next starts) does not overlap it.
 */
export function layoutOverlaps<T extends TimeBlock>(blocks: readonly T[]): PlacedBlock<T>[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: PlacedBlock<T>[] = [];
  let group: PlacedBlock<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    for (const p of group) p.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const block of sorted) {
    if (block.startMin >= groupEnd) {
      closeGroup();
      groupEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    const p = { block, lane, lanes: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, block.endMin);
  }
  closeGroup();
  return placed;
}

/**
 * Hours to show: the default range, widened to whole hours so that every
 * block given (working hours, jobs, part-day time off) is fully visible.
 */
export function visibleHourRange(
  blocks: readonly Pick<TimeBlock, 'startMin' | 'endMin'>[],
  base: HourRange = DEFAULT_HOUR_RANGE,
): HourRange {
  let start = base.startHour * 60;
  let end = base.endHour * 60;
  for (const b of blocks) {
    start = Math.min(start, b.startMin);
    end = Math.max(end, b.endMin);
  }
  return { startHour: Math.max(0, Math.floor(start / 60)), endHour: Math.min(24, Math.ceil(end / 60)) };
}

/** Top and height in percent of the visible range; null when the block is outside it. */
export function blockPosition(
  startMin: number,
  endMin: number,
  range: HourRange,
): { topPct: number; heightPct: number } | null {
  const from = range.startHour * 60;
  const to = range.endHour * 60;
  const s = Math.max(startMin, from);
  const e = Math.min(endMin, to);
  if (e <= s) return null;
  const span = to - from;
  return { topPct: ((s - from) / span) * 100, heightPct: ((e - s) / span) * 100 };
}

/** Where the red "now" line goes: today's column and percent from the top, or null. */
export function nowLinePosition(
  now: Date,
  dayKeys: readonly string[],
  range: HourRange,
): { dayKey: string; topPct: number } | null {
  const dayKey = vnDayKey(now);
  if (!dayKeys.includes(dayKey)) return null;
  const p = vnParts(now);
  const minutes = p.hour * 60 + p.minute;
  const from = range.startHour * 60;
  const to = range.endHour * 60;
  if (minutes < from || minutes > to) return null;
  return { dayKey, topPct: ((minutes - from) / (to - from)) * 100 };
}
