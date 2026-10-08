import { describe, expect, it } from 'vitest';
import { canDepartNow, sessionLabel } from '../src/utils/booking-session';

describe('booking sessions on the technician pages', () => {
  it('names the session, urgent bookings and older bookings', () => {
    expect(sessionLabel({ bookingMode: 'scheduled', slot: 'morning', start: '2026-10-12T01:00:00Z' })).toBe('Buổi sáng (8:00 - 12:00), 12/10/2026');
    expect(sessionLabel({ bookingMode: 'scheduled', slot: 'afternoon', start: '2026-10-12T06:00:00Z' })).toContain('Buổi chiều (13:00 - 18:00)');
    expect(sessionLabel({ bookingMode: 'urgent', start: '2026-10-12T06:00:00Z' })).toBe('Tới ngay');
    expect(sessionLabel({ start: null })).toBe('Chưa có lịch hẹn');
  });

  it('opens the depart button at departAvailableAt', () => {
    const at = '2026-10-12T00:00:00Z';
    expect(canDepartNow(at, Date.parse('2026-10-11T23:59:00Z'))).toBe(false);
    expect(canDepartNow(at, Date.parse('2026-10-12T00:00:00Z'))).toBe(true);
    expect(canDepartNow(null)).toBe(true);
  });
});
