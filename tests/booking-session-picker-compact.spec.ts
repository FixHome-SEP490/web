import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BookingSessionPicker from '../src/components/customer/BookingSessionPicker.vue';
import { upcomingSessions } from '../src/utils/booking-session';

describe('compact booking session picker', () => {
  it.each([true, false])('keeps three equal session columns, icons, selection and availability (compact=%s)', async (compact) => {
    const date = '2030-01-03';
    const sessions = [
      { date, slot: 'morning' as const, available: true, reason: null },
      { date, slot: 'afternoon' as const, available: false, reason: 'Buổi này đã kín' },
      { date, slot: 'evening' as const, available: true, reason: null },
    ];
    const wrapper = mount(BookingSessionPicker, { props: { sessions, compact, modelValue: { date, slot: 'evening' } } });
    const columns = wrapper.get('[data-testid="session-time-columns"]');
    expect(columns.classes()).toContain('grid-cols-3');
    const buttons = columns.findAll('button');
    expect(buttons).toHaveLength(3);
    for (const [index, icon] of ['sunrise', 'sun', 'moon'].entries()) {
      expect(buttons[index]!.find(`.lucide-${icon}`).exists()).toBe(true);
    }
    expect(buttons[0]!.text()).toContain('08:00–12:00');
    expect(buttons[1]!.attributes('disabled')).toBeDefined();
    expect(buttons[1]!.attributes('aria-label')).toContain('Buổi này đã kín');
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(buttons[2]!.attributes('aria-pressed')).toBe('true');
    await buttons[0]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ date, slot: 'morning' }]]);
    await wrapper.setProps({ allowBusy: true, busyHint: 'Chọn thợ khác' });
    expect(buttons[1]!.attributes('disabled')).toBeUndefined();
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([{ date, slot: 'afternoon' }]);
    wrapper.unmount();
  });
  it('shows four mobile or five desktop dates and selects a farther allowed session without losing the model value', async () => {
    const allSessions = upcomingSessions(14);
    const dates = [...new Set(allSessions.map((session) => session.date))];
    const unavailableDate = dates[6];
    const farDate = dates[9];
    const sessions = allSessions
      .filter((session) => session.date !== unavailableDate)
      .map((session) => session.date === farDate && session.slot === 'morning'
        ? { ...session, available: false, reason: 'Buổi này đã kín' }
        : session);
    const farAfternoon = sessions.find((session) => session.date === farDate && session.slot === 'afternoon')!;
    const wrapper = mount(BookingSessionPicker, {
      props: { sessions, modelValue: null, compact: true },
    });

    expect(wrapper.get('[data-testid="session-days-mobile"]').findAll('[data-testid^="session-day-"]')).toHaveLength(4);
    expect(wrapper.get('[data-testid="session-days-desktop"]').findAll('[data-testid^="session-day-"]')).toHaveLength(5);
    expect(wrapper.find(`[data-testid="session-days-desktop"] [data-testid="session-day-${farDate}"]`).exists()).toBe(false);

    const calendarToggle = wrapper.get('[data-testid="session-calendar-toggle"]');
    expect(calendarToggle.attributes('aria-label')).toContain('Chọn ngày');
    await calendarToggle.trigger('click');
    const calendar = wrapper.get('[data-testid="session-calendar-popover"]');
    expect(calendar.attributes('role')).toBe('dialog');

    const monthLabel = (date: string) => `Tháng ${date.slice(5, 7)}, ${date.slice(0, 4)}`;
    while (!calendar.text().includes(monthLabel(farDate))) {
      await calendar.get('button[title="Tháng sau"]').trigger('click');
    }

    const unavailableDay = calendar.get(`[data-testid="fh-date-${unavailableDate}"]`);
    expect(unavailableDay.attributes('disabled')).toBeDefined();
    const farDay = calendar.get(`[data-testid="fh-date-${farDate}"]`);
    expect(farDay.attributes('disabled')).toBeUndefined();
    await farDay.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="session-selected-distant"]').text()).toContain(`${farDate.slice(-2)}/${farDate.slice(5, 7)}`);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    const busy = wrapper.get(`[data-testid="session-${farDate}-morning"]`);
    expect(busy.attributes('disabled')).toBeDefined();
    expect(busy.text()).toContain('Buổi này đã kín');
    await wrapper.get(`[data-testid="session-${farDate}-${farAfternoon.slot}"]`).trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ date: farDate, slot: farAfternoon.slot }]]);
  });

  it('keeps the existing long picker as the default for rebooking', () => {
    const sessions = [
      { date: '2030-01-03', slot: 'morning' as const, available: true, reason: null },
      { date: '2030-01-04', slot: 'morning' as const, available: true, reason: null },
    ];
    const wrapper = mount(BookingSessionPicker, { props: { sessions, modelValue: null } });

    expect(wrapper.find('[data-testid="session-calendar-toggle"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="session-days-mobile"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="session-day-2030-01-04"]').exists()).toBe(true);
  });
});
