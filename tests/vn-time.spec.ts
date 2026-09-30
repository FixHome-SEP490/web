import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  isSameVnDay,
  vnDateString,
  vnDayKey,
  vnKeyAndClockToDate,
  vnParts,
  vnTimeString,
  weekdayOfKey,
} from '../src/utils/vn-time';
import { bookingSchedule, scheduleFieldsOf } from '../src/utils/booking-schedule';

// Every input is an absolute instant, so these pass whatever zone the machine
// is in. CI runs in UTC; run locally with TZ=America/New_York as well.

describe('Vietnam time on the web', () => {
  it('reads the Vietnam clock from an instant', () => {
    expect(vnParts('2026-09-30T17:30:00Z')).toMatchObject({ year: 2026, month: 10, day: 1, hour: 0, minute: 30 });
    expect(vnDayKey('2026-09-30T16:59:00Z')).toBe('2026-09-30');
    expect(vnDayKey('2026-09-30T17:00:00Z')).toBe('2026-10-01');
  });

  it('walks calendar keys without touching a zone', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOfKey('2026-10-03')).toBe(6);
  });

  it('shows Vietnam time, not the browser time', () => {
    expect(vnTimeString('2026-09-30T02:05:00Z', { hour: '2-digit', minute: '2-digit' })).toBe('09:05');
    expect(vnDateString('2026-09-30T20:00:00Z')).toMatch(/^0?1\D0?10\D2026$/);
    expect(isSameVnDay('2026-09-30T23:00:00Z', '2026-10-01T01:00:00Z')).toBe(true);
  });

  it('books tomorrow morning in Vietnam from a late-night UTC clock', () => {
    // 20:00 UTC on 30/09 is 03:00 on 01/10 in Vietnam, so "tomorrow" is 02/10.
    const now = new Date('2026-09-30T20:00:00Z');
    expect(bookingSchedule('TOMORROW', 'MORNING', now)).toEqual({
      preferredStartAt: '2026-10-02T01:00:00.000Z',
      preferredEndAt: '2026-10-02T05:00:00.000Z',
    });
    expect(bookingSchedule('TODAY', '14:30', now).preferredStartAt).toBe('2026-10-01T07:30:00.000Z');
    expect(bookingSchedule('2026-10-03', 'EVENING', now).preferredStartAt).toBe('2026-10-03T11:00:00.000Z');
  });

  it('treats the weekend and "earliest" by the Vietnam calendar', () => {
    // Friday 02/10 at 09:00 in Vietnam.
    const now = vnKeyAndClockToDate('2026-10-02', 9, 0);
    expect(bookingSchedule('WEEKEND', 'MORNING', now).preferredStartAt).toBe('2026-10-03T01:00:00.000Z');
    expect(bookingSchedule('TODAY', 'EARLIEST', now).preferredStartAt).toBe('2026-10-02T03:00:00.000Z');
    expect(bookingSchedule('2026-10-03', 'EARLIEST', now).preferredStartAt).toBe('2026-10-03T01:00:00.000Z');
  });

  it('refuses a slot that has already passed in Vietnam', () => {
    const now = vnKeyAndClockToDate('2026-10-02', 13, 0);
    expect(() => bookingSchedule('TODAY', 'MORNING', now)).toThrow('Khung giờ đã qua');
  });

  it('edits a stored start in Vietnam day and clock', () => {
    expect(scheduleFieldsOf('2026-10-01T18:30:00Z')).toEqual({ day: '2026-10-02', time: '01:30' });
  });
});
