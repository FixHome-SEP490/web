import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getMyEarnings, getMyWallet, push } = vi.hoisted(() => ({
  getMyEarnings: vi.fn(),
  getMyWallet: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../src/api/technician-earnings.api', () => ({ technicianEarningsApi: { getMyEarnings } }));
vi.mock('../src/api/wallet.api', () => ({ walletApi: { getMyWallet } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import TechnicianEarningsPage from '../src/pages/technician/TechnicianEarningsPage.vue';
import { periodContaining, periodLabel, reachesToday, shiftPeriod } from '../src/utils/earnings-period';

const payout = (id: string, extra: Record<string, unknown> = {}) => ({
  orderId: id, orderCode: `FH-${id}`, date: '29/09/2026', completedAt: '2026-09-29T07:00:00Z', customer: 'Khách A',
  serviceName: `Dịch vụ ${id}`, gross: 220000, platformFee: 22000, net: 198000, orderValue: 2420000, paid: true,
  status: 'completed', ...extra,
});

const summary = (extra: Record<string, unknown> = {}) => ({
  from: null, to: null, totalCompletedOrders: 2, totalGross: 370000, totalCommission: 37000, totalNet: 333000,
  totalOrderValue: 2570000, paidOrders: 1, pendingDueCount: 0, pendingDueAmount: 0, rating: null, ratingCount: 0,
  reliability: null, commissionRatePercent: 10,
  payouts: [payout('a'), payout('b', { gross: 150000, net: 135000, orderValue: 150000, paid: false })],
  page: 1, pageSize: 20, total: 2, ...extra,
});

// Sunday 11/10/2026 23:30 in Vietnam (16:30 UTC).
const SUNDAY_LATE = new Date('2026-10-11T16:30:00Z');

describe('Earnings periods in Vietnam time', () => {
  it('starts weeks on Monday and keeps Sunday 23:30 in the week it ends', () => {
    const week = periodContaining('week', '2026-10-11');
    expect(week).toEqual({ kind: 'week', from: '2026-10-05', to: '2026-10-11' });
    expect(periodLabel(week)).toBe('Tuần 05/10 – 11/10/2026');
    // A Monday opens a new week.
    expect(periodContaining('week', '2026-10-12')).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('follows the Vietnam calendar day, not the browser one', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(SUNDAY_LATE);
      expect(periodContaining('day')).toMatchObject({ from: '2026-10-11', to: '2026-10-11' });
      expect(periodContaining('week')).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
      // 23:59 on 31/10 in Vietnam is still October; one minute later is November.
      vi.setSystemTime(new Date('2026-10-31T16:59:00Z'));
      expect(periodContaining('month')).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
      vi.setSystemTime(new Date('2026-10-31T17:00:00Z'));
      expect(periodContaining('month')).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves by whole days, weeks and months, across month and year ends', () => {
    expect(shiftPeriod(periodContaining('day', '2026-03-01'), -1)).toMatchObject({ from: '2026-02-28', to: '2026-02-28' });
    expect(shiftPeriod(periodContaining('week', '2026-01-02'), -1)).toMatchObject({ from: '2025-12-22', to: '2025-12-28' });
    expect(periodLabel(periodContaining('week', '2026-01-02'))).toBe('Tuần 29/12/2025 – 04/01/2026');
    expect(shiftPeriod(periodContaining('month', '2026-01-15'), -1)).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(shiftPeriod(periodContaining('month', '2024-01-31'), 1)).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(periodLabel(periodContaining('month', '2026-10-05'))).toBe('Tháng 10/2026');
    expect(periodLabel(periodContaining('day', '2026-10-05'))).toBe('05/10/2026');
    expect(periodContaining('all')).toEqual({ kind: 'all', from: null, to: null });
    expect(reachesToday(periodContaining('week', '2026-10-11'), '2026-10-11')).toBe(true);
    expect(reachesToday(periodContaining('week', '2026-10-04'), '2026-10-11')).toBe(false);
  });
});

describe('Technician earnings page', () => {
  beforeEach(() => {
    getMyEarnings.mockReset(); getMyWallet.mockReset(); push.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SUNDAY_LATE);
  });
  afterEach(() => vi.useRealTimers());

  it('totals this month from the server and links each completed order to its job', async () => {
    getMyEarnings.mockResolvedValue(summary());
    getMyWallet.mockResolvedValue({ balance: 11493000 });
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();

    expect(getMyEarnings).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31', page: 1, pageSize: 20 });
    expect(wrapper.get('[data-testid="earnings-period-label"]').text()).toBe('Tháng 10/2026');
    expect(wrapper.get('[data-testid="earnings-count"]').text()).toBe('2');
    expect(wrapper.get('[data-testid="earnings-paid"]').text()).toBe('1/2');
    expect(wrapper.get('[data-testid="earnings-gross"]').text()).toContain('370.000');
    expect(wrapper.get('[data-testid="earnings-net"]').text()).toContain('333.000');
    expect(wrapper.get('[data-testid="earnings-order-value"]').text()).toContain('2.570.000');
    expect(wrapper.text()).toContain('11.493.000');
    expect(wrapper.text()).not.toMatch(/DEMO|minh họa|Khách demo/);

    const rows = wrapper.findAll('[data-testid^="earning-row-"]');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual(['earning-row-a', 'earning-row-b']);
    expect(rows[1].text()).toContain('Chưa thanh toán');
    await rows[0].trigger('click');
    expect(push).toHaveBeenCalledWith('/tech/jobs/a');
    // Two orders fit on one page.
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });

  it('switches between today, this week and all time, and steps back a week', async () => {
    getMyEarnings.mockResolvedValue(summary());
    getMyWallet.mockResolvedValue(null);
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();

    await wrapper.get('[data-testid="earnings-period-day"]').trigger('click');
    await flushPromises();
    expect(getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-11', to: '2026-10-11', page: 1, pageSize: 20 });
    expect(wrapper.get('[data-testid="earnings-period-label"]').text()).toBe('11/10/2026');

    await wrapper.get('[data-testid="earnings-period-week"]').trigger('click');
    await flushPromises();
    expect(getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-05', to: '2026-10-11', page: 1, pageSize: 20 });
    expect(wrapper.get('[data-testid="earnings-period-label"]').text()).toBe('Tuần 05/10 – 11/10/2026');
    // No future week to move to.
    expect(wrapper.get('[data-testid="earnings-period-next"]').attributes('disabled')).toBeDefined();

    await wrapper.get('[data-testid="earnings-period-prev"]').trigger('click');
    await flushPromises();
    expect(getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-09-28', to: '2026-10-04', page: 1, pageSize: 20 });
    expect(wrapper.get('[data-testid="earnings-period-label"]').text()).toBe('Tuần 28/09 – 04/10/2026');
    expect(wrapper.get('[data-testid="earnings-period-next"]').attributes('disabled')).toBeUndefined();

    await wrapper.get('[data-testid="earnings-period-all"]').trigger('click');
    await flushPromises();
    expect(getMyEarnings).toHaveBeenLastCalledWith({ from: null, to: null, page: 1, pageSize: 20 });
    expect(wrapper.find('[data-testid="earnings-period-label"]').exists()).toBe(false);
  });

  it('pages the completed orders of the period and keeps the period totals', async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => payout(`p${i}`));
    getMyEarnings.mockResolvedValueOnce(summary({ totalCompletedOrders: 23, paidOrders: 20, payouts: firstPage, total: 23 }));
    getMyWallet.mockResolvedValue(null);
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 23');

    getMyEarnings.mockResolvedValueOnce(summary({ totalCompletedOrders: 23, paidOrders: 20, payouts: [payout('last')], page: 2, total: 23 }));
    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-31', page: 2, pageSize: 20 });
    expect(wrapper.findAll('[data-testid^="earning-row-"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="earnings-count"]').text()).toBe('23');
    expect(wrapper.get('[data-testid="earnings-paid"]').text()).toBe('20/23');

    // A new period starts again from the first page.
    getMyEarnings.mockResolvedValueOnce(summary());
    await wrapper.get('[data-testid="earnings-period-prev"]').trigger('click');
    await flushPromises();
    expect(getMyEarnings).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30', page: 1, pageSize: 20 });
  });

  it('says so plainly when the period has no completed order', async () => {
    getMyEarnings.mockResolvedValue(summary({ totalCompletedOrders: 0, totalGross: 0, totalNet: 0, totalOrderValue: 0, paidOrders: 0, payouts: [], total: 0 }));
    getMyWallet.mockResolvedValue(null);
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();
    expect(wrapper.get('[data-testid="earnings-empty"]').text()).toBe('Không có đơn hoàn thành trong tháng này.');
    expect(wrapper.get('[data-testid="earnings-paid"]').text()).toBe('0/0');
  });

  it('shows a plain error, not the server wording, when loading fails', async () => {
    getMyEarnings.mockRejectedValue({ response: { status: 500, data: { error: { message: 'Internal server error' } } } });
    getMyWallet.mockResolvedValue(null);
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Không thể tải thu nhập');
    expect(wrapper.text()).not.toContain('Internal');
    expect(wrapper.find('[data-testid="earnings-totals"]').exists()).toBe(false);
  });
});
