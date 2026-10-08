import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// The cancellation and strike pages are the Service Manager's. They must show
// names, roles and order codes from the list itself: a Service Manager may not
// read user records, so asking per row only produced 403s and raw ids.
const { getCancellations, getStrikes, getOrder } = vi.hoisted(() => ({
  getCancellations: vi.fn(),
  getStrikes: vi.fn(),
  getOrder: vi.fn(),
}));
const waiveStrike = vi.hoisted(() => vi.fn());
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getCancellations, getStrikes, getOrder, reviewCancellation: vi.fn(), waiveStrike } }));

import ConsoleCancellationsPage from '../src/pages/console/ConsoleCancellationsPage.vue';
import ConsoleStrikesPage from '../src/pages/console/ConsoleStrikesPage.vue';

describe('Service Manager review lists', () => {
  it('shows who cancelled, their role in words and the order code, with no lookup per row', async () => {
    getCancellations.mockResolvedValue([{
      id: 'c1', serviceOrderId: 'order-1', actor: 'customer', actorUserId: 'd0000000-0000-0000-0000-000000000001',
      reason: 'Đổi ý', stateAtCancel: 'accepted', strikeApplied: false, compensationStatus: 'pending_review',
      createdAt: '2026-10-01T10:00:00Z', actorName: 'Khách Hàng 1', actorRole: 'customer', orderCode: 'FH-20261001-AAAA0001',
    }]);
    const wrapper = mount(ConsoleCancellationsPage);
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Khách Hàng 1');
    expect(text).toContain('Khách hàng');
    expect(text).toContain('FH-20261001-AAAA0001');
    expect(text).not.toContain('d0000000-0000-0000-0000-000000000001');
    expect(text).not.toContain('CUSTOMER');
    expect(getOrder).not.toHaveBeenCalled();
  });

  it('says "Không rõ" rather than showing an id when a name is missing', async () => {
    getCancellations.mockResolvedValue([{
      id: 'c2', serviceOrderId: 'order-2', actor: 'technician', actorUserId: 'user-x', reason: 'x', stateAtCancel: 'accepted',
      strikeApplied: true, compensationStatus: 'pending_review', createdAt: '2026-10-01T10:00:00Z', actorName: null, orderCode: null,
    }]);
    const wrapper = mount(ConsoleCancellationsPage);
    await flushPromises();
    expect(wrapper.text()).toContain('Không rõ');
    expect(wrapper.text()).not.toContain('user-x');
  });

  it('shows whose strike, their role and the order on the strikes page', async () => {
    getStrikes.mockResolvedValue([{
      id: 's1', userId: 'tech-1', cancellationId: 'c9', status: 'active', createdAt: '2026-10-01T10:00:00Z',
      userName: 'Thợ Điện Lạnh 1', userRole: 'technician', orderCode: 'FH-20261001-AAAA0002', userSuspendedUntil: null,
    }]);
    const wrapper = mount(ConsoleStrikesPage);
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Thợ Điện Lạnh 1');
    expect(text).toContain('Kỹ thuật viên');
    expect(text).toContain('FH-20261001-AAAA0002');
    expect(getCancellations).toHaveBeenCalledTimes(2); // only by the cancellations tests above
  });

  it('asks for a reason before waiving a strike and sends what the manager wrote', async () => {
    getStrikes.mockResolvedValue([{
      id: 's2', userId: 'tech-2', cancellationId: 'c8', status: 'active', createdAt: '2026-10-01T10:00:00Z',
      userName: 'Thợ 2', userRole: 'technician', orderCode: 'FH-20261001-AAAA0003', userSuspendedUntil: null,
    }]);
    waiveStrike.mockResolvedValue({ id: 's2', status: 'waived', waiveReason: 'Khách xác nhận huỷ do mưa bão' });
    const wrapper = mount(ConsoleStrikesPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text().includes('Miễn trừ'))!.trigger('click');
    await flushPromises();
    const confirm = () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Xác nhận miễn trừ'))!;
    confirm().click();
    await flushPromises();
    expect(waiveStrike).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Ghi lý do miễn vi phạm');
    expect(document.body.textContent).not.toContain('mở khóa quyền đặt lịch');
    const area = document.body.querySelector('textarea')!;
    area.value = '  Khách xác nhận huỷ do mưa bão  ';
    area.dispatchEvent(new Event('input'));
    confirm().click();
    await flushPromises();
    expect(waiveStrike).toHaveBeenCalledWith('s2', 'Khách xác nhận huỷ do mưa bão');
    wrapper.unmount();
  });
});
