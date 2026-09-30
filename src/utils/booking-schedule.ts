import { addDaysToKey, vnDayKey, vnKeyAndClockToDate, vnParts, weekdayOfKey } from './vn-time';

/**
 * The arrival window a customer picked, as instants.
 *
 * Days and clock times are Vietnam days and times whatever zone the browser is
 * in: "tomorrow morning" means tomorrow morning in Vietnam.
 */
export function bookingSchedule(day: string, period: string, now = new Date()) {
  const todayKey = vnDayKey(now);
  let dayKey = todayKey;
  if (day === 'TOMORROW') {
    dayKey = addDaysToKey(todayKey, 1);
  } else if (day === 'WEEKEND') {
    dayKey = addDaysToKey(todayKey, (6 - weekdayOfKey(todayKey) + 7) % 7);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    dayKey = day;
  }

  const windows: Record<string, [number, number, number, number]> = {
    MORNING: [8, 0, 12, 0],
    AFTERNOON: [13, 30, 17, 30],
    EVENING: [18, 0, 20, 30],
  };

  let start: Date;
  let end: Date;
  if (period === 'EARLIEST') {
    if (dayKey === todayKey) {
      start = new Date(now.getTime() + 60 * 60 * 1000);
    } else {
      start = vnKeyAndClockToDate(dayKey, 8, 0);
    }
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  } else if (/^\d{1,2}:\d{2}$/.test(period)) {
    const [h, min] = period.split(':').map(Number);
    start = vnKeyAndClockToDate(dayKey, h, min);
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  } else {
    const window = windows[period];
    if (!window) throw new Error('Vui lòng chọn khung giờ hợp lệ.');
    start = vnKeyAndClockToDate(dayKey, window[0], window[1]);
    end = vnKeyAndClockToDate(dayKey, window[2], window[3]);
  }

  if (start <= now) throw new Error('Khung giờ đã qua. Vui lòng chọn giờ hoặc ngày khác.');
  return { preferredStartAt: start.toISOString(), preferredEndAt: end.toISOString() };
}

/** Day key and 'HH:mm' of a stored start instant, as the booking form edits them. */
export function scheduleFieldsOf(startAt: string | Date): { day: string; time: string } {
  const p = vnParts(startAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: vnDayKey(startAt), time: `${pad(p.hour)}:${pad(p.minute)}` };
}
