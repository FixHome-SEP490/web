import { describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../src/api/client', () => ({ default: { get: (...a: unknown[]) => get(...a), put: vi.fn(), post: vi.fn() }, getHttpStatus: () => null }));

import { technicianProfileApi } from '../src/api/technician-profile.api';

// QA 22/11/2026: tech5 có lịch cũ 00:00-24:00; trang gửi lại nguyên "24:00" nên máy chủ từ chối, thợ không lưu được lịch.
describe('weekly schedule read from the server', () => {
  it('reads an old whole-day end "24:00" as "23:59", the value the server accepts', async () => {
    get.mockResolvedValue({ data: { data: [
      { dayOfWeek: 1, startTime: '00:00', endTime: '24:00' },
      { dayOfWeek: 2, startTime: '08:00:00', endTime: '17:30:00' },
    ] } });
    expect(await technicianProfileApi.getMySchedule()).toEqual([
      { dayOfWeek: 1, startTime: '00:00', endTime: '23:59' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '17:30' },
    ]);
  });
});
