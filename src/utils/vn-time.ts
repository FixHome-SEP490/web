/**
 * Vietnam time, whatever time zone the browser is set to.
 *
 * FixHome only operates in Vietnam, and Vietnam has kept a fixed UTC+07:00
 * offset with no daylight saving since 1975, so the wall clock is the instant
 * shifted by seven hours. Display goes through Intl with an explicit zone so
 * the wording stays exactly what the screens already showed.
 *
 * Calendar days are passed around as 'yyyy-MM-dd' keys, never as Date objects,
 * so no step can silently move a day across a zone boundary.
 */
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type DateInput = Date | string | number;

export interface VnParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function vnParts(input: DateInput = new Date()): VnParts {
  const shifted = new Date(new Date(input).getTime() + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant at which Vietnam clocks read the given date and time. */
export function vnWallClockToDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS);
}

/** 'yyyy-MM-dd' of the instant in Vietnam. */
export function vnDayKey(input: DateInput = new Date()): string {
  const p = vnParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 'HH:mm' of the instant in Vietnam. */
export function vnClock(input: DateInput): string {
  const p = vnParts(input);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** The day key `days` calendar days after `key`. */
export function addDaysToKey(key: string, days: number): string {
  const d = parseDayKey(key);
  if (!d) return key;
  const moved = new Date(Date.UTC(d.year, d.month - 1, d.day) + days * DAY_MS);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** Weekday of a calendar day key, 0 = Sunday. */
export function weekdayOfKey(key: string): number {
  const d = parseDayKey(key);
  return d ? new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() : Number.NaN;
}

/** The instant a Vietnam clock time on a calendar day key starts. */
export function vnKeyAndClockToDate(key: string, hour: number, minute: number): Date {
  const d = parseDayKey(key);
  if (!d) return new Date(Number.NaN);
  return vnWallClockToDate(d.year, d.month, d.day, hour, minute);
}

export function isSameVnDay(a: DateInput, b: DateInput): boolean {
  return vnDayKey(a) === vnDayKey(b);
}

const withZone = (options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({
  ...options,
  timeZone: VN_TIME_ZONE,
});

export function vnDateString(input: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleDateString('vi-VN', withZone(options));
}

export function vnTimeString(input: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleTimeString('vi-VN', withZone(options));
}

export function vnDateTimeString(input: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleString('vi-VN', withZone(options));
}
