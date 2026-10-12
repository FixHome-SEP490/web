import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * Week calendar on the technician schedule tab (PO 12/10/2026): "thêm cái bảng
 * theo ngày như google calendar hiển thị các ngày và giờ lên trên đó cho dễ
 * quan sát". Days are columns, hours are rows, Vietnam time; it previews the
 * hours being edited, shows time off and the booked jobs, and a failed read of
 * the jobs never hides the working hours.
 */

const { getTechnicianJobsPage } = vi.hoisted(() => ({ getTechnicianJobsPage: vi.fn() }));
vi.mock('../src/api/orders.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/orders.api')>()),
  ordersApi: { getTechnicianJobsPage },
}));

import TechnicianWeekCalendar from '../src/components/technician/TechnicianWeekCalendar.vue';

// 10:00 Wednesday 14/10/2026 in Vietnam.
const NOW = new Date('2026-10-14T03:00:00Z');

const slot = (enabled: boolean, startTime = '08:00', endTime = '18:00') => ({ enabled, startTime, endTime });
// Index 0 = Sunday. Monday to Friday 08:00-18:00.
const SCHEDULE = [slot(false), slot(true), slot(true), slot(true), slot(true), slot(true), slot(false)];
const SAVED = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: '08:00', endTime: '18:00' }));
const TIME_OFF = [{ id: 'off-1', startAt: '2026-10-16T00:00:00+07:00', endAt: '2026-10-16T23:59:59+07:00', reason: 'Việc gia đình' }];

const order = (id: string, scheduledAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  code: `SO-${id}`,
  bookingId: `b-${id}`,
  serviceName: `Dịch vụ ${id}`,
  status: 'ACCEPTED',
  scheduledAt,
  bookingMode: 'scheduled',
  slot: 'morning',
  customerName: 'Khách',
  customerPhone: '0900000000',
  addressSummary: 'Quận 1',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  paymentStatus: 'UNPAID',
  createdAt: '2026-10-01T00:00:00Z',
  ...extra,
});

const JOBS = [
  order('a', '2026-10-14T01:00:00Z'), // Wed 08:00-12:00
  order('b', '2026-10-14T02:00:00Z', { slot: null, status: 'COMPLETED' }), // Wed 09:00, overlaps a
  order('c', '2026-10-21T06:00:00Z', { slot: 'afternoon' }), // next week
  order('x', '2026-10-15T01:00:00Z', { status: 'CANCELLED' }),
  { id: 'h', code: 'SO-h', status: 'COMPLETED', createdAt: '2026-09-01T00:00:00Z', historical: true },
];

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 100 });

const stubs = {
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  FhSkeleton: { template: '<div data-testid="skeleton" />' },
};

function mountCalendar(props: Record<string, unknown> = {}): VueWrapper {
  return mount(TechnicianWeekCalendar, {
    props: { schedule: SCHEDULE, savedSchedule: SAVED, timeOff: TIME_OFF, now: NOW, ...props },
    global: { stubs },
  });
}

const day = (wrapper: VueWrapper, key: string) => wrapper.get(`[data-testid="calendar-day-${key}"]`);

describe('Lịch tuần của kỹ thuật viên', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTechnicianJobsPage.mockResolvedValue(page(JOBS));
  });

  it('shows Monday to Sunday of this week, today marked, hours in 24-hour time', async () => {
    const wrapper = mountCalendar();
    await flushPromises();

    expect(wrapper.get('[data-testid="calendar-range"]').text()).toBe('12/10 – 18/10/2026');
    const keys = wrapper.findAll('[data-testid^="calendar-day-2026"]').map((d) => d.attributes('data-testid'));
    expect(keys).toEqual([12, 13, 14, 15, 16, 17, 18].map((n) => `calendar-day-2026-10-${n}`));
    expect(day(wrapper, '2026-10-12').text()).toContain('T2');
    expect(day(wrapper, '2026-10-12').text()).toContain('12/10');
    expect(day(wrapper, '2026-10-18').text()).toContain('CN');
    expect(wrapper.find('[aria-current="date"]').text()).toBe('14/10');
    const text = wrapper.text();
    expect(text).toContain('06:00');
    expect(text).toContain('21:00');
    expect(text).not.toMatch(/\b(SA|CH|AM|PM)\b/);
  });

  it('reads only the orders that hold an appointment, through the cache', async () => {
    mountCalendar();
    await flushPromises();
    expect(getTechnicianJobsPage).toHaveBeenCalledTimes(1);
    expect(getTechnicianJobsPage).toHaveBeenCalledWith(1, 100, {
      statuses: ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED'],
    });
  });

  it('draws the working hours of each working day and mutes them on a day off', async () => {
    const wrapper = mountCalendar();
    await flushPromises();

    const work = wrapper.findAll('[data-testid="calendar-block-work"]');
    expect(work).toHaveLength(5);
    expect(work[0].text()).toBe('08:00–18:00');
    // 06:00-22:00 is 16 hours: 08:00 is 12.5% down and ten hours is 62.5% tall.
    expect(work[0].attributes('style')).toContain('top: 12.5%');
    expect(work[0].attributes('style')).toContain('height: 62.5%');

    const friday = day(wrapper, '2026-10-16');
    expect(friday.get('[data-testid="calendar-block-work"]').attributes('data-cancelled')).toBe('true');
    const off = friday.get('[data-testid="calendar-block-off"]');
    expect(off.text()).toBe('Nghỉ · Việc gia đình');
    expect(off.attributes('data-full-day')).toBe('true');
    expect(day(wrapper, '2026-10-12').get('[data-testid="calendar-block-work"]').attributes('data-cancelled')).toBe('false');
  });

  it('shows this week\'s jobs side by side when they overlap, each opening its job', async () => {
    const wrapper = mountCalendar();
    await flushPromises();

    const jobs = wrapper.findAll('[data-testid="calendar-block-job"]');
    expect(jobs).toHaveLength(2);
    const [a, b] = jobs;
    expect(a.text()).toContain('Dịch vụ a');
    expect(a.text()).toContain('08:00–12:00');
    expect(a.attributes('href')).toBe('/tech/jobs/a');
    expect(a.attributes('style')).toContain('left: 0%');
    expect(a.attributes('style')).toContain('width: 50%');
    expect(b.text()).toContain('09:00 · Đã xong');
    expect(a.text()).not.toContain('Đã xong');
    expect(b.attributes('href')).toBe('/tech/jobs/b');
    expect(b.attributes('style')).toContain('left: 50%');
    expect(b.attributes('aria-label')).toBe('Dịch vụ b, 09:00, Thứ Tư 14/10, đã xong. Mở chi tiết việc');
    expect(wrapper.text()).not.toContain('Dịch vụ x');
  });

  it('draws the red now line on today only, and not in another week', async () => {
    const wrapper = mountCalendar();
    await flushPromises();

    const line = wrapper.get('[data-testid="calendar-now-line"]');
    expect(day(wrapper, '2026-10-14').find('[data-testid="calendar-now-line"]').exists()).toBe(true);
    expect(line.attributes('style')).toContain('top: 25%');
    expect(line.attributes('aria-label')).toBe('Bây giờ 10:00');

    await wrapper.get('[data-testid="calendar-next"]').trigger('click');
    expect(wrapper.get('[data-testid="calendar-range"]').text()).toBe('19/10 – 25/10/2026');
    expect(wrapper.find('[data-testid="calendar-now-line"]').exists()).toBe(false);
    const jobs = wrapper.findAll('[data-testid="calendar-block-job"]');
    expect(jobs.map((j) => j.attributes('href'))).toEqual(['/tech/jobs/c']);
    expect(jobs[0].text()).toContain('13:00–18:00');
    expect(wrapper.find('[data-testid="calendar-block-off"]').exists()).toBe(false);

    await wrapper.get('[data-testid="calendar-today"]').trigger('click');
    expect(wrapper.get('[data-testid="calendar-range"]').text()).toBe('12/10 – 18/10/2026');
    await wrapper.get('[data-testid="calendar-prev"]').trigger('click');
    expect(wrapper.get('[data-testid="calendar-range"]').text()).toBe('05/10 – 11/10/2026');
  });

  it('notes in yellow when the hours shown are not saved yet', async () => {
    const wrapper = mountCalendar();
    await flushPromises();
    expect(wrapper.find('[data-testid="calendar-unsaved"]').exists()).toBe(false);

    const edited = SCHEDULE.map((s) => ({ ...s }));
    edited[1] = slot(true, '07:00', '23:59');
    await wrapper.setProps({ schedule: edited });
    const note = wrapper.get('[data-testid="calendar-unsaved"]');
    expect(note.text()).toBe('Chưa lưu');
    expect(note.classes()).toContain('bg-warning-50');
    expect(day(wrapper, '2026-10-12').get('[data-testid="calendar-block-work"]').text()).toBe('07:00–24:00');
    // The range grows to show the whole edited day.
    expect(wrapper.text()).toContain('23:00');
  });

  it('shows a skeleton while the jobs load', async () => {
    let resolve: (value: unknown) => void = () => {};
    getTechnicianJobsPage.mockReturnValue(new Promise((r) => (resolve = r)));
    const wrapper = mountCalendar();
    await flushPromises();

    expect(wrapper.find('[data-testid="calendar-jobs-loading"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="calendar-block-work"]')).toHaveLength(5);

    resolve(page(JOBS));
    await flushPromises();
    expect(wrapper.find('[data-testid="calendar-jobs-loading"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="calendar-block-job"]')).toHaveLength(2);
  });

  it('keeps the working hours when the jobs cannot be read, with a retry that works', async () => {
    getTechnicianJobsPage.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 500'), { code: 'ERR_BAD_RESPONSE' }));
    const wrapper = mountCalendar();
    await flushPromises();

    const alert = wrapper.get('[data-testid="calendar-jobs-error"]');
    expect(alert.text()).toContain('Chưa tải được lịch hẹn');
    expect(wrapper.text()).not.toMatch(/500|status code|Error/);
    expect(wrapper.findAll('[data-testid="calendar-block-work"]')).toHaveLength(5);

    await alert.get('button').trigger('click');
    await flushPromises();
    expect(getTechnicianJobsPage).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="calendar-jobs-error"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="calendar-block-job"]')).toHaveLength(2);
  });

  it('on a phone shows one day at a time, today first, picked from the day strip', async () => {
    const wrapper = mountCalendar();
    await flushPromises();

    const visibleOnPhone = () =>
      wrapper
        .findAll('[data-testid^="calendar-day-2026"]')
        .filter((d) => !d.classes().includes('hidden'))
        .map((d) => d.attributes('data-testid'));
    expect(visibleOnPhone()).toEqual(['calendar-day-2026-10-14']);

    const chip = wrapper.get('[data-testid="calendar-day-chip-2026-10-12"]');
    expect(chip.attributes('aria-label')).toBe('Thứ Hai 12/10');
    await chip.trigger('click');
    expect(visibleOnPhone()).toEqual(['calendar-day-2026-10-12']);
    expect(chip.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="calendar-day-chip-2026-10-14"]').attributes('aria-label')).toBe(
      'Thứ Tư 14/10, hôm nay, có lịch hẹn',
    );

    // Another week opens on its Monday.
    await wrapper.get('[data-testid="calendar-next"]').trigger('click');
    expect(visibleOnPhone()).toEqual(['calendar-day-2026-10-19']);
  });

  it('says so when the week shown holds nothing', async () => {
    getTechnicianJobsPage.mockResolvedValue(page([]));
    const wrapper = mountCalendar({ schedule: SCHEDULE.map(() => slot(false)), savedSchedule: [], timeOff: [] });
    await flushPromises();
    expect(wrapper.get('[data-testid="calendar-empty"]').text()).toContain('chưa có giờ nhận việc');
    expect(wrapper.find('[data-testid="calendar-block-work"]').exists()).toBe(false);
  });
});
