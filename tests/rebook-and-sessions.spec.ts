import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { upcomingSessions, sessionDayLabel } from '../src/utils/booking-session';

// "Đặt lại thợ" (PO 08/10/2026): same service and address, a new day and
// session; the same technician is invited when free, otherwise the customer
// chooses another one.
const { availableSessions, rebook, push } = vi.hoisted(() => ({ availableSessions: vi.fn(), rebook: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { availableSessions, rebook } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
import RebookDialog from '../src/components/customer/RebookDialog.vue';
import BookingSessionPicker from '../src/components/customer/BookingSessionPicker.vue';

describe('upcoming sessions (Vietnam time)', () => {
  it('skips sessions that already started and offers both sessions of later days', () => {
    // 10:00 in Vietnam on 05/10/2026: the morning has started, the afternoon has not.
    const now = new Date('2026-10-05T03:00:00Z');
    const list = upcomingSessions(2, now);
    expect(list.map((s) => `${s.date} ${s.slot}`)).toEqual([
      '2026-10-05 afternoon', '2026-10-05 evening', '2026-10-06 morning', '2026-10-06 afternoon', '2026-10-06 evening',
    ]);
    expect(list.every((s) => s.available)).toBe(true);
  });

  it('names the day in Vietnamese', () => {
    expect(sessionDayLabel('2026-10-05')).toBe('Thứ 2, 05/10');
    expect(sessionDayLabel('2026-10-11')).toBe('Chủ nhật, 11/10');
  });
});

const sessions = [
  { date: '2030-01-03', slot: 'morning', available: false, reason: 'Thợ đã có lịch buổi này' },
  { date: '2030-01-03', slot: 'afternoon', available: true, reason: null },
  { date: '2030-01-03', slot: 'evening', available: true, reason: null },
];
const mountDialog = async () => {
  const wrapper = mount(RebookDialog, {
    props: { open: true, bookingId: 'old-booking', serviceName: 'Vệ sinh máy lạnh' },
    global: { stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
};
const confirm = (wrapper: Awaited<ReturnType<typeof mountDialog>>) => wrapper.findAll('button').find((b) => b.text() === 'Đặt lại')!;

describe('Rebook dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availableSessions.mockResolvedValue({ technicianId: 'tech-1', sessions });
  });

  it('picks and submits the evening session from server availability', async () => {
    rebook.mockResolvedValue({ booking: { id: 'evening-booking' }, previousTechnicianInvited: true });
    const wrapper = await mountDialog();
    const evening = wrapper.get('[data-testid="session-2030-01-03-evening"]');
    expect(evening.text()).toContain('Tối 18:00 - 23:00');
    await evening.trigger('click');
    await confirm(wrapper).trigger('click');
    await flushPromises();
    expect(rebook).toHaveBeenCalledWith('old-booking', { date: '2030-01-03', slot: 'evening' });
    wrapper.unmount();
  });

  it("reads the former technician's sessions and asks for a session first", async () => {
    const wrapper = await mountDialog();
    expect(availableSessions).toHaveBeenCalledWith('old-booking', true);
    await confirm(wrapper).trigger('click');
    expect(rebook).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Vui lòng chọn ngày và buổi');
  });

  it('invites the same technician when free and opens the new booking', async () => {
    rebook.mockResolvedValue({ booking: { id: 'new-booking' }, previousTechnicianInvited: true });
    const wrapper = await mountDialog();
    await wrapper.get('[data-testid="session-2030-01-03-afternoon"]').trigger('click');
    await wrapper.get('[data-testid="rebook-note"]').setValue('  Gọi trước  ');
    await confirm(wrapper).trigger('click');
    await flushPromises();
    expect(rebook).toHaveBeenCalledWith('old-booking', { date: '2030-01-03', slot: 'afternoon', customerNote: 'Gọi trước' });
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new-booking', query: { rebooked: 'invited' } });
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('lets a busy session be picked and sends the customer to choose another technician', async () => {
    rebook.mockResolvedValue({ booking: { id: 'new-booking' }, previousTechnicianInvited: false });
    const wrapper = await mountDialog();
    const busy = wrapper.get('[data-testid="session-2030-01-03-morning"]');
    expect(busy.attributes('disabled')).toBeUndefined();
    expect(busy.text()).toContain('chọn thợ khác');
    await busy.trigger('click');
    await confirm(wrapper).trigger('click');
    await flushPromises();
    expect(rebook).toHaveBeenCalledWith('old-booking', { date: '2030-01-03', slot: 'morning' });
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new-booking/candidates', query: { rebooked: 'choose' } });
  });

  it('keeps the dialog open with the reason when the server refuses', async () => {
    rebook.mockRejectedValue(new Error('Chỉ đặt lại được đơn đã hoàn thành hoặc đã huỷ'));
    const wrapper = await mountDialog();
    await wrapper.get('[data-testid="session-2030-01-03-afternoon"]').trigger('click');
    await confirm(wrapper).trigger('click');
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBeTruthy();
  });
});

describe('Session picker', () => {
  const twoDays = [
    { date: '2030-01-03', slot: 'morning', available: false, reason: 'Thợ nghỉ buổi này' },
    { date: '2030-01-03', slot: 'afternoon', available: false, reason: 'Thợ đã có lịch buổi này' },
    { date: '2030-01-04', slot: 'morning', available: true, reason: null },
    { date: '2030-01-04', slot: 'afternoon', available: true, reason: null },
  ];

  it('opens on the first day with a free session and switches day by chip', async () => {
    const wrapper = mount(BookingSessionPicker, { props: { sessions: twoDays, modelValue: null } });
    expect(wrapper.find('[data-testid="session-2030-01-04-morning"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="session-2030-01-03-morning"]').exists()).toBe(false);
    await wrapper.get('[data-testid="session-day-2030-01-03"]').trigger('click');
    const busy = wrapper.get('[data-testid="session-2030-01-03-afternoon"]');
    expect(busy.attributes('disabled')).toBeDefined();
    expect(busy.text()).toContain('Thợ đã có lịch buổi này');
    await busy.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.get('[data-testid="session-day-2030-01-04"]').trigger('click');
    await wrapper.get('[data-testid="session-2030-01-04-afternoon"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ date: '2030-01-04', slot: 'afternoon' }]]);
  });

  it('lays the days out as a Monday-first calendar and names each day in Vietnamese (PO 18/10/2026)', () => {
    const wrapper = mount(BookingSessionPicker, { props: { sessions: twoDays, modelValue: null } });
    const calendar = wrapper.get('[data-testid="session-calendar"]');
    expect(calendar.text().startsWith('T2T3T4T5T6T7CN')).toBe(true);
    // 3/1/2030 is a Thursday: the week starts on Monday 31/12, shown but not pickable.
    const cells = calendar.findAll('[role="gridcell"]');
    expect(cells).toHaveLength(7);
    expect(cells.map((c) => c.text())).toEqual(['31', '1', '2', '3', '4', '5', '6']);
    expect(cells[0].element.tagName).toBe('SPAN');
    const day = wrapper.get('[data-testid="session-day-2030-01-03"]');
    expect(day.text()).toBe('3');
    expect(day.attributes('aria-label')).toBe('Thứ 5, 03/01, đã kín');
    expect(wrapper.get('[data-testid="session-day-2030-01-04"]').attributes('aria-label')).toBe('Thứ 6, 04/01');
    expect(wrapper.text()).toContain('Tháng 1/2030');
  });

  it('asks for the day first, then the time, and ticks both once chosen', async () => {
    const wrapper = mount(BookingSessionPicker, { props: { sessions: twoDays, modelValue: null } });
    const steps = wrapper.findAll('h4').map((h) => h.text());
    expect(steps).toEqual(['Chọn ngày', 'Chọn giờ']);
    expect(wrapper.get('[data-testid="session-active-day"]').text()).toBe('Thứ 6, 04/01');
    expect(wrapper.find('[data-testid="session-day-tick"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: { date: '2030-01-04', slot: 'afternoon' } });
    expect(wrapper.get('[data-testid="session-day-2030-01-04"]').find('[data-testid="session-day-tick"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="session-2030-01-04-afternoon"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="session-2030-01-04-morning"]').attributes('aria-pressed')).toBe('false');
    // Looking at another day keeps the choice ticked where it is.
    await wrapper.get('[data-testid="session-day-2030-01-03"]').trigger('click');
    expect(wrapper.get('[data-testid="session-active-day"]').text()).toBe('Thứ 5, 03/01');
    expect(wrapper.get('[data-testid="session-day-2030-01-04"]').find('[data-testid="session-day-tick"]').exists()).toBe(true);
  });

  it('spans a month boundary and greys days outside the bookable window', () => {
    const across = [
      { date: '2030-01-30', slot: 'morning', available: true, reason: null },
      { date: '2030-02-02', slot: 'afternoon', available: true, reason: null },
    ];
    const wrapper = mount(BookingSessionPicker, { props: { sessions: across, modelValue: null } });
    expect(wrapper.text()).toContain('Tháng 1 - 2/2030');
    // 31/01 and 01/02 have no session in the list: plain text, not a button.
    expect(wrapper.find('[data-testid="session-day-2030-01-31"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="session-day-2030"]')).toHaveLength(2);
  });
});
