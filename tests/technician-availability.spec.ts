import { describe, expect, it } from 'vitest';
import { availabilityText } from '../src/utils/availability';

// What the dashboard switch says (PO 08/10/2026): the weekly schedule switches
// receiving on and off by itself; the manual switch only pauses.
const now = new Date('2026-10-09T12:51:00Z'); // 19:51 Friday, Vietnam time

describe('availability text on the technician dashboard', () => {
  it('receiving shows until when', () => {
    expect(availabilityText({ state: 'receiving', receiving: true, until: '2026-10-09T10:00:00Z', nextStartAt: null }, true, now))
      .toEqual({ title: 'Đang nhận việc', detail: 'Theo lịch tới 17:00', receiving: true });
  });

  it('outside the schedule says when it switches back on', () => {
    const t = availabilityText({ state: 'off_hours', receiving: false, until: null, nextStartAt: '2026-10-10T00:00:00Z' }, true, now);
    expect(t).toEqual({ title: 'Ngoài giờ làm', detail: 'Tự nhận việc lại lúc 07:00 T7 10/10', receiving: false });
  });

  it('paused, on time off and without a schedule', () => {
    expect(availabilityText({ state: 'paused', receiving: false, until: null, nextStartAt: null }, false, now).title).toBe('Tạm nghỉ nhận đơn');
    expect(availabilityText({ state: 'time_off', receiving: false, until: '2026-10-11T17:00:00Z', nextStartAt: null }, true, now).detail).toBe('Tới 00:00 T2 12/10');
    expect(availabilityText({ state: 'no_schedule', receiving: false, until: null, nextStartAt: null }, true, now).detail).toContain('Đặt lịch tuần');
  });

  it('falls back to the manual switch until the status is known', () => {
    expect(availabilityText(null, null, now)).toMatchObject({ title: 'Chưa xác định trạng thái nhận đơn', receiving: false });
    expect(availabilityText(null, true, now)).toMatchObject({ title: 'Đang nhận việc', receiving: true });
  });
});
