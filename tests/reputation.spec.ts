import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Reputation points (PO 08/10/2026): both profiles show the score, a running
// ban and the history; the Service Manager lists, reads and adjusts scores.
const { mine, list, events, adjust } = vi.hoisted(() => ({ mine: vi.fn(), list: vi.fn(), events: vi.fn(), adjust: vi.fn() }));
vi.mock('../src/api/reputation.api', () => ({ reputationApi: { mine, list, events, adjust } }));

import ReputationCard from '../src/components/account/ReputationCard.vue';
import ConsoleReputationPage from '../src/pages/console/ConsoleReputationPage.vue';

const future = new Date(Date.now() + 72 * 3600_000).toISOString();
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!;

describe('Reputation card on the profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the score, the rules and when it goes back to 100', async () => {
    mine.mockResolvedValue({ points: 100, periodStart: '2026-10-09T00:00:00Z', resetsAt: '2026-12-09T00:00:00Z', suspendedUntil: null, locked: false, events: [] });
    const w = mount(ReputationCard, { props: { role: 'customer' } });
    await flushPromises();
    expect(w.get('[data-testid="reputation-points"]').text()).toBe('100');
    expect(w.text()).toContain('đã có thợ nhận bị trừ 10 điểm');
    expect(w.text()).toContain('09/12/2026');
    expect(w.find('[data-testid="reputation-ban"]').exists()).toBe(false);
  });

  it('tells a customer when booking opens again and why points moved', async () => {
    mine.mockResolvedValue({
      points: 60, periodStart: null, resetsAt: '2026-12-09T00:00:00Z', suspendedUntil: future, locked: false,
      events: [{ id: 'e1', kind: 'violation', delta: -10, pointsAfter: 60, reason: 'Huỷ đơn #FH-1 đã có thợ nhận: Đổi ý', penalty: 'Tạm khoá đặt lịch 72 giờ.', createdAt: '2026-10-09T03:00:00Z' }],
    });
    const w = mount(ReputationCard, { props: { role: 'customer' } });
    await flushPromises();
    expect(w.get('[data-testid="reputation-ban"]').text()).toContain('không thể đặt lịch đến');
    await button(w, 'Xem lịch sử điểm').trigger('click');
    const history = w.get('[data-testid="reputation-history"]').text();
    expect(history).toContain('Trừ điểm');
    expect(history).toContain('Huỷ đơn #FH-1');
    expect(history).toContain('Đổi ý Tạm khoá đặt lịch 72 giờ.');
    expect(history).toContain('-10');
  });

  it('speaks of taking jobs to a technician, and offers a retry when loading fails', async () => {
    mine.mockRejectedValueOnce(new Error('network'));
    const w = mount(ReputationCard, { props: { role: 'technician' } });
    await flushPromises();
    expect(w.text()).toContain('Chưa tải được điểm uy tín');
    mine.mockResolvedValue({ points: 30, periodStart: null, resetsAt: '2026-12-09T00:00:00Z', suspendedUntil: future, locked: false, events: [] });
    await button(w, 'Thử lại').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="reputation-ban"]').text()).toContain('không thể nhận đơn');
    expect(w.text()).toContain('đã có khách đặt');
  });

  it('says the account is locked at 0 points', async () => {
    mine.mockResolvedValue({ points: 0, periodStart: null, resetsAt: '2026-12-09T00:00:00Z', suspendedUntil: null, locked: true, events: [] });
    const w = mount(ReputationCard, { props: { role: 'customer' } });
    await flushPromises();
    expect(w.text()).toContain('Tài khoản đã bị khoá vì hết điểm uy tín');
  });
});

describe('Service Manager reputation page', () => {
  const rows = [
    { id: 'c1', fullName: 'Khách Hàng 2', email: 'customer2@fixhome.vn', phoneNumber: '0904000002', role: 'customer', status: 'active', reputationPoints: 60, bookingSuspendedUntil: future, workSuspendedUntil: null },
    { id: 't1', fullName: 'Thợ Điện 1', email: 'tech1@fixhome.vn', phoneNumber: null, role: 'technician', status: 'active', reputationPoints: 100, bookingSuspendedUntil: null, workSuspendedUntil: null },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ data: rows.map((r) => ({ ...r })), meta: { page: 1, limit: 20, total: 2, totalPages: 1 } });
  });

  it('lists names, roles in words, points and running bans, and searches from page 1', async () => {
    const w = mount(ConsoleReputationPage, { global: { stubs: { teleport: true } } });
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Khách Hàng 2');
    expect(text).toContain('Khách hàng');
    expect(text).toContain('Kỹ thuật viên');
    expect(text).toContain('Tới ');
    await w.get('input[type="search"]').setValue('  0904  ');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ role: undefined, search: '0904', page: 1, pageSize: 20 });
  });

  it('shows the history of one account', async () => {
    events.mockResolvedValue([{ id: 'e1', kind: 'adjustment', delta: 20, pointsAfter: 80, reason: 'Thợ đến trễ nên khách huỷ', penalty: 'Gỡ tạm khoá.', createdAt: '2026-10-09T03:00:00Z' }]);
    const w = mount(ConsoleReputationPage, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await w.findAll('button').filter((b) => b.text() === 'Lịch sử')[0].trigger('click');
    await flushPromises();
    expect(events).toHaveBeenCalledWith('c1');
    expect(w.get('[data-testid="reputation-events"]').text()).toContain('Thợ đến trễ');
  });

  it('needs a whole number and a reason before adjusting, then sends the signed change', async () => {
    adjust.mockResolvedValue({ points: 50 });
    const w = mount(ConsoleReputationPage, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await w.findAll('button').filter((b) => b.text() === 'Điều chỉnh')[0].trigger('click');
    await w.get('[data-testid="adjust-reason"]').setValue('ab');
    await button(w, 'Lưu điều chỉnh').trigger('click');
    expect(w.text()).toContain('tối thiểu 5 ký tự');
    await w.get('[data-testid="adjust-amount"]').setValue('2.5');
    await w.get('[data-testid="adjust-reason"]').setValue('Bỏ đơn không báo trước');
    await button(w, 'Lưu điều chỉnh').trigger('click');
    expect(w.text()).toContain('số nguyên từ 1 đến 100');
    expect(adjust).not.toHaveBeenCalled();
    await w.findAll('input[type="radio"]')[1].setValue(true);
    await w.get('[data-testid="adjust-amount"]').setValue('10');
    expect(w.text()).toContain('60 → 50');
    await button(w, 'Lưu điều chỉnh').trigger('click');
    await flushPromises();
    expect(adjust).toHaveBeenCalledWith('c1', -10, 'Bỏ đơn không báo trước');
    expect(list).toHaveBeenCalledTimes(2);
  });
});
