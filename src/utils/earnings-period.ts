// Periods for the technician's earnings page: a day, a Monday-to-Sunday week,
// a calendar month or all time, always in Vietnam time and passed around as
// 'yyyy-MM-dd' keys so no step moves a day across a time-zone boundary.
import { addDaysToKey, parseDayKey, vnDayKey, weekdayOfKey } from './vn-time';

export type PeriodKind = 'day' | 'week' | 'month' | 'all';

export const PERIOD_KINDS: readonly PeriodKind[] = ['day', 'week', 'month', 'all'];

export interface EarningsPeriod {
  kind: PeriodKind;
  /** First day, inclusive; null for all time. */
  from: string | null;
  /** Last day, inclusive; null for all time. */
  to: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The period of the given kind that contains the day `anchor` (default: today in Vietnam). */
export function periodContaining(kind: PeriodKind, anchor: string = vnDayKey()): EarningsPeriod {
  const day = parseDayKey(anchor) ? anchor : vnDayKey();
  if (kind === 'all') return { kind, from: null, to: null };
  if (kind === 'day') return { kind, from: day, to: day };
  if (kind === 'week') {
    // Weeks start on Monday: Sunday (0) is the 7th day.
    const back = (weekdayOfKey(day) + 6) % 7;
    const monday = addDaysToKey(day, -back);
    return { kind, from: monday, to: addDaysToKey(monday, 6) };
  }
  const d = parseDayKey(day)!;
  return { kind, from: keyOf(d.year, d.month, 1), to: keyOf(d.year, d.month, lastDayOfMonth(d.year, d.month)) };
}

/** The period `steps` periods before (negative) or after (positive) this one. */
export function shiftPeriod(period: EarningsPeriod, steps: number): EarningsPeriod {
  if (period.kind === 'all' || !period.from) return period;
  if (period.kind === 'day') return periodContaining('day', addDaysToKey(period.from, steps));
  if (period.kind === 'week') return periodContaining('week', addDaysToKey(period.from, steps * 7));
  const d = parseDayKey(period.from)!;
  const index = d.year * 12 + (d.month - 1) + steps;
  return periodContaining('month', keyOf(Math.floor(index / 12), (index % 12) + 1, 1));
}

/** True when the period already reaches today, so there is no "next" one to show yet. */
export function reachesToday(period: EarningsPeriod, today: string = vnDayKey()): boolean {
  return period.kind === 'all' || !period.to || period.to >= today;
}

const ddmm = (key: string) => {
  const d = parseDayKey(key)!;
  return `${pad(d.day)}/${pad(d.month)}`;
};
const ddmmyyyy = (key: string) => `${ddmm(key)}/${parseDayKey(key)!.year}`;

/** "12/10/2026", "Tuần 06/10 – 12/10/2026", "Tháng 10/2026", "Tất cả". */
export function periodLabel(period: EarningsPeriod): string {
  if (period.kind === 'all' || !period.from || !period.to) return 'Tất cả';
  if (period.kind === 'day') return ddmmyyyy(period.from);
  if (period.kind === 'week') {
    const sameYear = parseDayKey(period.from)!.year === parseDayKey(period.to)!.year;
    return `Tuần ${sameYear ? ddmm(period.from) : ddmmyyyy(period.from)} – ${ddmmyyyy(period.to)}`;
  }
  const d = parseDayKey(period.from)!;
  return `Tháng ${d.month}/${d.year}`;
}
