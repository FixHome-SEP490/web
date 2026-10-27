import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('../src/api/admin-ai-quality.api', () => ({
  adminAiQualityApi: {
    get: vi.fn(async (days: number) => ({
      days,
      totals: { sessions: 40, turns: 130, signedIn: 25, markedWrong: 3, markedRight: 9, bookings: 12, bookingRate: 30, wrongRate: 7.5 },
      perDay: [
        { day: '2026-10-15', sessions: 18, bookings: 5, markedWrong: 1 },
        { day: '2026-10-16', sessions: 22, bookings: 7, markedWrong: 2 },
      ],
      recentWrong: [
        {
          sessionId: 's2',
          at: '2026-10-16T02:00:00Z',
          note: 'sai rồi, máy vẫn mát nhưng chảy nước',
          reply: 'Dạ khả năng cao là thiếu gas ạ.',
          customerText: 'máy lạnh không mát / sai rồi, máy vẫn mát nhưng chảy nước',
          deviceName: 'Máy lạnh',
          source: 'chat',
          kind: 'fault',
          said: 'máy lạnh không mát',
          rejected: ['Thiếu gas, xì gas'],
          settledOn: ['Nghẹt đường thoát nước ngưng'],
        },
        { sessionId: 's1', at: '2026-10-16T01:00:00Z', note: 'em đã nói vệ sinh rồi', reply: 'Dạ khả năng cao là bẩn lưới lọc.', customerText: 'máy lạnh không mát / mới vệ sinh rồi', deviceName: 'Máy lạnh', source: 'button', kind: null, said: null, rejected: [], settledOn: [] },
      ],
    })),
  },
}));

import AdminAiQualityPage from '../src/pages/console/admin/AdminAiQualityPage.vue';

describe('Admin AI quality page', () => {
  it('shows the totals, the times a customer said the assistant was wrong, and the days', async () => {
    const wrapper = mount(AdminAiQualityPage, { global: { stubs: { 'router-link': true } } });
    await flushPromises();
    const totals = wrapper.find('[data-testid="ai-quality-totals"]').text();
    expect(totals).toContain('40');
    expect(totals).toContain('30%');
    expect(totals).toContain('7,5%');
    expect(totals).not.toContain('đúng ý');
    const wrong = wrapper.find('[data-testid="ai-quality-wrong"]').text();
    expect(wrong).toContain('Đoán sai bệnh');
    expect(wrong).toContain('Khách kể: máy lạnh không mát');
    expect(wrong).toContain('Trợ lý đoán: Thiếu gas, xì gas');
    expect(wrong).toContain('Khách nói lại: sai rồi, máy vẫn mát nhưng chảy nước');
    expect(wrong).toContain('Cuối cuộc trò chuyện: Nghẹt đường thoát nước ngưng');
    expect(wrong).toContain('em đã nói vệ sinh rồi');
    expect(wrong).toContain('Máy lạnh');
    expect(wrapper.text()).toContain('16/10/2026');
    expect(wrapper.text()).not.toMatch(/sessionId|undefined|null|button/);
  });
});
