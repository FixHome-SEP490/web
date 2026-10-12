import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUR_RANGE,
  blockPosition,
  clockToMinutes,
  jobBlocks,
  layoutOverlaps,
  minutesToClock,
  nowLinePosition,
  scheduleDiffers,
  timeOffSegments,
  visibleHourRange,
  weekDays,
  weekRangeLabel,
  weekStartKey,
  workBlocks,
  type ScheduleDraftSlot,
  type TimeBlock,
} from '../src/utils/week-calendar';

/**
 * Week calendar of the technician schedule tab (PO 12/10/2026): weeks start on
 * Monday in Vietnam, blocks sit at their Vietnam clock time, overlapping jobs
 * share the column side by side.
 */

const WEEK = '2026-10-12'; // Monday 12/10/2026
const KEYS = Array.from({ length: 7 }, (_, i) => `2026-10-${String(12 + i).padStart(2, '0')}`);
const ZONES = ['UTC', 'America/New_York', 'Asia/Ho_Chi_Minh', 'Pacific/Kiritimati'];
const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const draft = (days: Partial<Record<number, [string, string]>>): ScheduleDraftSlot[] =>
  Array.from({ length: 7 }, (_, day) => {
    const slot = days[day];
    return slot ? { enabled: true, startTime: slot[0], endTime: slot[1] } : { enabled: false, startTime: '08:00', endTime: '18:00' };
  });

describe('week start and labels in Vietnam time', () => {
  it('starts the week on the Vietnam Monday whatever the browser zone', () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      // 23:59 Sunday 11/10 in Vietnam still belongs to the week of 05/10.
      expect(weekStartKey('2026-10-11T16:59:00Z')).toBe('2026-10-05');
      // 00:00 Monday 12/10 in Vietnam is Sunday afternoon in New York.
      expect(weekStartKey('2026-10-11T17:00:00Z')).toBe(WEEK);
      // 23:00 Sunday 18/10 in Vietnam is still this week.
      expect(weekStartKey('2026-10-18T16:00:00Z')).toBe(WEEK);
      expect(weekStartKey('2026-10-14T03:00:00Z')).toBe(WEEK);
    }
  });

  it('lists Monday to Sunday with short names, dates and today', () => {
    const days = weekDays(WEEK, new Date('2026-10-13T20:00:00Z')); // 03:00 Wed 14/10 in Vietnam
    expect(days.map((d) => `${d.shortName} ${d.dateLabel}`)).toEqual([
      'T2 12/10', 'T3 13/10', 'T4 14/10', 'T5 15/10', 'T6 16/10', 'T7 17/10', 'CN 18/10',
    ]);
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(days.filter((d) => d.isToday).map((d) => d.key)).toEqual(['2026-10-14']);
  });

  it('labels the week range, with both years across New Year', () => {
    expect(weekRangeLabel(WEEK)).toBe('12/10 – 18/10/2026');
    expect(weekRangeLabel('2026-12-28')).toBe('28/12/2026 – 03/01/2027');
  });
});

describe('clock times', () => {
  it('reads stored times, the end of day "23:59" ending at 24:00', () => {
    expect(clockToMinutes('08:00')).toBe(480);
    expect(clockToMinutes('08:15:00')).toBe(495);
    expect(clockToMinutes('23:59', 'start')).toBe(1439);
    expect(clockToMinutes('23:59', 'end')).toBe(1440);
    expect(clockToMinutes('')).toBeNull();
    expect(clockToMinutes('25:00')).toBeNull();
    expect(minutesToClock(1440)).toBe('24:00');
    expect(minutesToClock(5)).toBe('00:05');
  });
});

describe('block position', () => {
  const range = DEFAULT_HOUR_RANGE; // 06:00-22:00, 960 minutes

  it('places a block by its start and length inside the visible hours', () => {
    expect(blockPosition(480, 720, range)).toEqual({ topPct: 12.5, heightPct: 25 });
    expect(blockPosition(360, 1320, range)).toEqual({ topPct: 0, heightPct: 100 });
  });

  it('clips a block that runs past the visible hours and drops one outside them', () => {
    expect(blockPosition(300, 420, range)).toEqual({ topPct: 0, heightPct: 6.25 });
    expect(blockPosition(1320, 1380, range)).toBeNull();
  });

  it('widens the default 06:00-22:00 to whole hours around what the week holds', () => {
    expect(visibleHourRange([])).toEqual({ startHour: 6, endHour: 22 });
    expect(visibleHourRange([{ startMin: 330, endMin: 1440 }])).toEqual({ startHour: 5, endHour: 24 });
    expect(visibleHourRange([{ startMin: 480, endMin: 1350 }])).toEqual({ startHour: 6, endHour: 23 });
  });
});

describe('overlapping blocks', () => {
  const b = (id: string, startMin: number, endMin: number): TimeBlock => ({ id, dayKey: WEEK, startMin, endMin });

  it('puts overlapping blocks side by side and leaves a lone block full width', () => {
    const placed = layoutOverlaps([b('d', 780, 840), b('a', 480, 720), b('b', 540, 600), b('c', 600, 660)]);
    const by = Object.fromEntries(placed.map((p) => [p.block.id, [p.lane, p.lanes]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2], d: [0, 1] });
  });

  it('does not treat blocks that only touch as overlapping', () => {
    const placed = layoutOverlaps([b('x', 480, 720), b('y', 720, 780)]);
    expect(placed.map((p) => p.lanes)).toEqual([1, 1]);
  });

  it('opens a third lane when three blocks overlap at once', () => {
    const placed = layoutOverlaps([b('a', 480, 720), b('b', 480, 600), b('c', 540, 600)]);
    expect(placed.map((p) => [p.block.id, p.lane, p.lanes])).toEqual([
      ['a', 0, 3],
      ['b', 1, 3],
      ['c', 2, 3],
    ]);
  });
});

describe('time off', () => {
  it('covers each whole day of a one-day and a multi-day entry', () => {
    const segments = timeOffSegments(KEYS, [
      { id: 't1', startAt: '2026-10-12T17:00:00.000Z', endAt: '2026-10-13T16:59:59.000Z', reason: ' Việc gia đình ' },
      { id: 't2', startAt: '2026-10-14T00:00:00+07:00', endAt: '2026-10-16T23:59:59+07:00', reason: null },
    ]);
    expect(segments.map((s) => [s.dayKey, s.startMin, s.endMin, s.fullDay])).toEqual([
      ['2026-10-13', 0, 1440, true],
      ['2026-10-14', 0, 1440, true],
      ['2026-10-15', 0, 1440, true],
      ['2026-10-16', 0, 1440, true],
    ]);
    expect(segments[0].reason).toBe('Việc gia đình');
  });

  it('keeps the hours of a part-day entry and the in-week part of a longer one', () => {
    const segments = timeOffSegments(KEYS, [
      { id: 'p', startAt: '2026-10-17T13:00:00+07:00', endAt: '2026-10-17T17:00:00+07:00', reason: null },
      { id: 'before', startAt: '2026-10-08T00:00:00+07:00', endAt: '2026-10-12T12:00:00+07:00', reason: null },
      { id: 'after', startAt: '2026-10-18T20:00:00+07:00', endAt: '2026-10-20T23:59:59+07:00', reason: null },
      { id: 'outside', startAt: '2026-10-20T00:00:00+07:00', endAt: '2026-10-21T23:59:59+07:00', reason: null },
      { id: 'bad', startAt: 'not a date', endAt: '2026-10-21T23:59:59+07:00', reason: null },
      { id: 'reversed', startAt: '2026-10-15T10:00:00+07:00', endAt: '2026-10-15T09:00:00+07:00', reason: null },
    ]);
    expect(segments.map((s) => [s.id, s.startMin, s.endMin, s.fullDay])).toEqual([
      ['p:2026-10-17', 780, 1020, false],
      ['before:2026-10-12', 0, 720, false],
      ['after:2026-10-18', 1200, 1440, false],
    ]);
  });

  it('marks working hours that time off falls in as cancelled', () => {
    const days = weekDays(WEEK);
    const off = timeOffSegments(KEYS, [
      { id: 't', startAt: '2026-10-13T00:00:00+07:00', endAt: '2026-10-13T23:59:59+07:00', reason: null },
      { id: 'evening', startAt: '2026-10-14T19:00:00+07:00', endAt: '2026-10-14T21:00:00+07:00', reason: null },
    ]);
    const blocks = workBlocks(days, draft({ 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'] }), off);
    expect(blocks.map((w) => [w.dayKey, w.cancelled])).toEqual([
      ['2026-10-12', false],
      ['2026-10-13', true],
      ['2026-10-14', false],
    ]);
  });
});

describe('working hours from the editor', () => {
  it('draws enabled days at their hours, Sunday (index 0) on the last column', () => {
    const blocks = workBlocks(weekDays(WEEK), draft({ 0: ['09:00', '23:59'], 1: ['08:15', '17:45'] }));
    expect(blocks.map((w) => [w.dayKey, w.startMin, w.endMin])).toEqual([
      ['2026-10-12', 495, 1065],
      ['2026-10-18', 540, 1440],
    ]);
  });

  it('skips days that are off or not valid yet', () => {
    const slots = draft({ 2: ['18:00', '08:00'], 3: ['', '10:00'] });
    slots[4] = { enabled: false, startTime: '08:00', endTime: '18:00' };
    expect(workBlocks(weekDays(WEEK), slots)).toEqual([]);
  });

  it('tells an unsaved edit from the saved schedule', () => {
    const saved = [
      { dayOfWeek: 1, startTime: '08:00', endTime: '18:00' },
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
    ];
    expect(scheduleDiffers(draft({ 1: ['08:00', '18:00'] }), saved)).toBe(false);
    expect(scheduleDiffers(draft({ 1: ['08:00', '17:00'] }), saved)).toBe(true);
    expect(scheduleDiffers(draft({ 1: ['08:00', '18:00'], 2: ['08:00', '18:00'] }), saved)).toBe(true);
    expect(scheduleDiffers(draft({}), saved)).toBe(true);
  });
});

describe('booked jobs', () => {
  const job = (id: string, scheduledAt: string | null, extra: Record<string, unknown> = {}) => ({
    id,
    code: `SO-${id}`,
    serviceName: 'Sửa điều hoà',
    status: 'ACCEPTED',
    scheduledAt,
    bookingMode: 'scheduled',
    slot: null,
    ...extra,
  });

  it('draws a session job over its morning or afternoon window', () => {
    const blocks = jobBlocks(KEYS, [
      job('m', '2026-10-13T01:00:00Z', { slot: 'morning' }),
      job('a', '2026-10-13T06:00:00Z', { slot: 'afternoon', status: 'COMPLETED' }),
    ]);
    expect(blocks.map((b) => [b.jobId, b.dayKey, b.startMin, b.endMin, b.timeLabel, b.completed])).toEqual([
      ['m', '2026-10-13', 480, 720, '08:00–12:00', false],
      ['a', '2026-10-13', 780, 1080, '13:00–18:00', true],
    ]);
  });

  it('marks an urgent or older job at its start time, one hour tall', () => {
    const blocks = jobBlocks(KEYS, [
      job('u', '2026-10-15T02:15:00Z', { bookingMode: 'urgent', slot: 'morning' }),
      job('o', '2026-10-16T07:00:00Z'),
      job('late', '2026-10-18T16:30:00Z'),
    ]);
    expect(blocks.map((b) => [b.jobId, b.dayKey, b.startMin, b.endMin, b.timeLabel])).toEqual([
      ['u', '2026-10-15', 555, 615, 'Tới ngay 09:15'],
      ['o', '2026-10-16', 840, 900, '14:00'],
      ['late', '2026-10-18', 1410, 1440, '23:30'],
    ]);
  });

  it('leaves out jobs outside the week, cancelled jobs and jobs without an appointment', () => {
    const blocks = jobBlocks(KEYS, [
      job('prev-sunday', '2026-10-11T16:30:00Z'), // 23:30 Sunday 11/10 in Vietnam
      job('next-monday', '2026-10-18T17:00:00Z'), // 00:00 Monday 19/10 in Vietnam
      job('cancelled', '2026-10-13T01:00:00Z', { status: 'cancelled' }),
      job('none', null),
      job('bad', 'soon'),
      job('first-minute', '2026-10-11T17:00:00Z'), // 00:00 Monday 12/10 in Vietnam
    ]);
    expect(blocks.map((b) => b.jobId)).toEqual(['first-minute']);
  });

  it('gives a job without a service name a plain title', () => {
    expect(jobBlocks(KEYS, [job('n', '2026-10-13T01:00:00Z', { serviceName: '  ' })])[0].title).toBe('Đơn sửa chữa');
  });
});

describe('now line', () => {
  it('sits on today at the Vietnam clock time whatever the browser zone', () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      // 10:00 Wednesday 14/10 in Vietnam: 4 of the 16 hours from 06:00.
      expect(nowLinePosition(new Date('2026-10-14T03:00:00Z'), KEYS, DEFAULT_HOUR_RANGE)).toEqual({
        dayKey: '2026-10-14',
        topPct: 25,
      });
    }
  });

  it('is hidden in another week and outside the visible hours', () => {
    expect(nowLinePosition(new Date('2026-10-20T03:00:00Z'), KEYS, DEFAULT_HOUR_RANGE)).toBeNull();
    expect(nowLinePosition(new Date('2026-10-14T16:00:00Z'), KEYS, DEFAULT_HOUR_RANGE)).toBeNull(); // 23:00
    expect(nowLinePosition(new Date('2026-10-14T16:00:00Z'), KEYS, { startHour: 6, endHour: 24 })?.topPct).toBeCloseTo(94.44, 2);
  });
});
