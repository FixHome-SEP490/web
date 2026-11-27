import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Reputation points (PO 08/10/2026): both profiles show the score, a running
// ban and the history; the Service Manager lists, reads and adjusts scores.
const { mine, list, events, adjust } = vi.hoisted(() => ({ mine: vi.fn(), list: vi.fn(), events: vi.fn(), adjust: vi.fn() }));
vi.mock('../src/api/reputation.api', () => ({ reputationApi: { mine, list, events, adjust } }));

import ReputationCard from '../src/components/account/ReputationCard.vue';
import ConsoleReputationPage from '../src/pages/console/ConsoleReputationPage.vue';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types/auth.types';

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
    { id: 'c1', fullName: 'Khách Hàng 2', email: 'customer2@fixhome.vn', phoneNumber: '0904000002', role: 'customer' as const, status: 'active', reputationPoints: 60, bookingSuspendedUntil: future, workSuspendedUntil: null },
    { id: 't1', fullName: 'Thợ Điện 1', email: 'tech1@fixhome.vn', phoneNumber: null, role: 'technician' as const, status: 'active', reputationPoints: 100, bookingSuspendedUntil: null, workSuspendedUntil: null },
  ];

  let pinia: ReturnType<typeof createPinia>;
  const mountPage = () => mount(ConsoleReputationPage, { global: { plugins: [pinia], stubs: { teleport: true, 'router-link': true } } });

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).setAuth('token', {
      id: 'sm-1',
      fullName: 'Quản lý dịch vụ',
      email: 'sm@fixhome.vn',
      role: UserRole.SERVICE_MANAGER,
      status: 'ACTIVE',
      permissions: ['strike:read_all', 'strike:waive'],
    });
    list.mockResolvedValue({ data: rows.map((r) => ({ ...r })), meta: { page: 1, limit: 20, total: 2, totalPages: 1 }, summary: null });
  });

  it('lists names, roles in words, official rule tiers, points and running bans, and searches from page 1', async () => {
    const w = mountPage();
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Khách Hàng 2');
    expect(text).toContain('Khách hàng');
    expect(text).toContain('Kỹ thuật viên');
    expect(text).toContain('Cần theo dõi');
    expect(text).toContain('Đạt ngưỡng');
    expect(text).toContain('Tới ');
    expect(text).toContain('Chưa có API thống kê');

    await button(w, 'Quy tắc điểm').trigger('click');
    expect(w.text()).toContain('Dưới 70 điểm tạm khoá 72 giờ');

    await w.get('input[type="search"]').setValue('  0904  ');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ role: undefined, search: '0904', page: 1, pageSize: 20 });
  });

  it('shows the history drawer for one account and prevents stale responses when switching quickly', async () => {
    let resolveFirst!: (val: unknown[]) => void;
    const firstPromise = new Promise<unknown[]>((resolve) => { resolveFirst = resolve; });
    events.mockReturnValueOnce(firstPromise);
    events.mockResolvedValueOnce([
      { id: 'e2', kind: 'reset', delta: 20, pointsAfter: 100, reason: 'Làm mới điểm định kỳ 2 tháng', penalty: null, createdAt: '2026-10-10T03:00:00Z' },
    ]);

    const w = mountPage();
    await flushPromises();

    const historyButtons = w.findAll('button').filter((b) => b.text() === 'Lịch sử');
    await historyButtons[0].trigger('click');
    await historyButtons[1].trigger('click');
    await flushPromises();

    // Resolve the slower first request AFTER switching to the second account
    resolveFirst([
      { id: 'e1', kind: 'adjustment', delta: 20, pointsAfter: 80, reason: 'Thợ đến trễ nên khách huỷ', penalty: 'Gỡ tạm khoá.', createdAt: '2026-10-09T03:00:00Z' },
    ]);
    await flushPromises();

    expect(events).toHaveBeenCalledWith('c1');
    expect(events).toHaveBeenCalledWith('t1');
    const drawerText = w.get('[data-testid="reputation-history-drawer"]').text();
    expect(drawerText).toContain('Thợ Điện 1');
    expect(drawerText).toContain('Làm mới điểm định kỳ 2 tháng');
    expect(drawerText).not.toContain('Thợ đến trễ');
  });

  it('needs a whole number and a reason before adjusting, prevents double submit, then refreshes data', async () => {
    let resolveAdjust!: (val: { points: number }) => void;
    adjust.mockReturnValueOnce(new Promise<{ points: number }>((resolve) => { resolveAdjust = resolve; }));

    const w = mountPage();
    await flushPromises();

    await w.findAll('button').filter((b) => b.text() === 'Điều chỉnh')[0].trigger('click');
    await w.get('[data-testid="adjust-reason"]').setValue('ab');
    await w.get('[role="dialog"] form').trigger('submit');
    expect(w.text()).toContain('tối thiểu 5 ký tự');

    await w.get('[data-testid="adjust-amount"]').setValue('2.5');
    await w.get('[data-testid="adjust-reason"]').setValue('Bỏ đơn không báo trước');
    await w.get('[role="dialog"] form').trigger('submit');
    expect(w.text()).toContain('số nguyên từ 1 đến 100');
    expect(adjust).not.toHaveBeenCalled();

    await w.findAll('input[type="radio"]')[1].setValue(true);
    await w.get('[data-testid="adjust-amount"]').setValue('10');
    expect(w.get('[data-testid="adjust-preview"]').text().replace(/\s+/g, '')).toContain('60→50');

    // Submit once and trigger again while in-flight -> only one API request
    await w.get('[role="dialog"] form').trigger('submit');
    await w.get('[role="dialog"] form').trigger('submit');
    expect(adjust).toHaveBeenCalledTimes(1);
    expect(adjust).toHaveBeenCalledWith('c1', -10, 'Bỏ đơn không báo trước');

    resolveAdjust({ points: 50 });
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('hides the adjust action when the account lacks strike:waive permission', async () => {
    useAuthStore(pinia).setAuth('token', {
      id: 'sm-read-only',
      fullName: 'Quản lý chỉ đọc',
      email: 'readonly@fixhome.vn',
      role: UserRole.SERVICE_MANAGER,
      status: 'ACTIVE',
      permissions: ['strike:read_all'],
    });
    const w = mountPage();
    await flushPromises();
    expect(w.findAll('button').filter((b) => b.text() === 'Điều chỉnh')).toHaveLength(0);
    expect(w.findAll('button').filter((b) => b.text() === 'Lịch sử')).toHaveLength(2);
  });
});
