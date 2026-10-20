import { describe, expect, it } from 'vitest';
import { canDepartNow, sessionLabel, upcomingSessions } from '../src/utils/booking-session';
import { jobBlocks, visibleHourRange } from '../src/utils/week-calendar';

describe('booking sessions on the technician pages', () => {
  it('names the session, urgent bookings and older bookings', () => {
    expect(sessionLabel({ bookingMode: 'scheduled', slot: 'morning', start: '2026-10-12T01:00:00Z' })).toBe('Buổi sáng (8:00 - 12:00), 12/10/2026');
    expect(sessionLabel({ bookingMode: 'scheduled', slot: 'afternoon', start: '2026-10-12T06:00:00Z' })).toContain('Buổi chiều (13:00 - 18:00)');
    expect(sessionLabel({ bookingMode: 'scheduled', slot: 'evening', start: '2026-10-12T11:00:00Z' })).toBe('Buổi tối (18:00 - 23:00), 12/10/2026');
    expect(sessionLabel({ bookingMode: 'urgent', start: '2026-10-12T06:00:00Z' })).toBe('Tới ngay');
    expect(sessionLabel({ start: null })).toBe('Chưa có lịch hẹn');
  });

  it.each([
    ['2026-10-12T10:59:00Z', true],
    ['2026-10-12T11:00:00Z', true],
    ['2026-10-12T15:59:59Z', true],
    ['2026-10-12T16:00:00Z', false],
    ['2026-10-12T16:30:00Z', false],
  ])('offers today evening only before 23:00 Vietnam time at %s', (now, available) => {
    expect(upcomingSessions(1, new Date(now)).some((s) => s.slot === 'evening')).toBe(available);
  });

  it('draws the evening appointment through 23:00 in the week calendar', () => {
    const blocks = jobBlocks(['2026-10-12'], [{ id: 'evening-job', serviceName: 'Sửa máy lạnh', status: 'ACCEPTED', bookingMode: 'scheduled', slot: 'evening', scheduledAt: '2026-10-12T11:00:00Z' }]);
    expect(blocks[0]).toMatchObject({ startMin: 1080, endMin: 1380, timeLabel: '18:00–23:00' });
    expect(visibleHourRange(blocks).endHour).toBe(23);
  });

  it('opens the depart button at departAvailableAt', () => {
    const at = '2026-10-12T00:00:00Z';
    expect(canDepartNow(at, Date.parse('2026-10-11T23:59:00Z'))).toBe(false);
    expect(canDepartNow(at, Date.parse('2026-10-12T00:00:00Z'))).toBe(true);
    expect(canDepartNow(null)).toBe(true);
  });
});
