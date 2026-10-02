import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getRepairHistory, push } = vi.hoisted(() => ({
  getRepairHistory: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getRepairHistory } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import CustomerHistoryPage from '../src/pages/customer/CustomerHistoryPage.vue';

const row = (orderId: string, status: 'completed' | 'cancelled', extra: Record<string, unknown> = {}) => ({
  orderId, bookingId: `b-${orderId}`, code: `FH-${orderId}`, status,
  serviceName: `Dịch vụ ${orderId}`, technicianName: 'Kỹ thuật viên A', addressSummary: 'Quận 1, TP.HCM',
  laborTotal: 200000, partsTotal: 50000, grandTotal: 250000,
  completedAt: status === 'completed' ? '2026-09-29T17:30:00Z' : null,
  cancelledAt: status === 'cancelled' ? '2026-09-20T02:00:00Z' : null,
  ...extra,
});

describe('Customer repair history shows only server records', () => {
  beforeEach(() => {
    getRepairHistory.mockReset(); push.mockReset();
  });

  it('lists the server rows with Vietnam dates and opens the order', async () => {
    getRepairHistory.mockResolvedValue({ data: [row('a', 'completed'), row('b', 'cancelled')], total: 2 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();

    expect(getRepairHistory).toHaveBeenCalledWith(1, 20, undefined);
    const text = wrapper.text();
    expect(text).toContain('Lịch sử sửa chữa');
    expect(text).not.toMatch(/Read Model|D-20|Trần Đình Trọng|Nguyễn Văn Hùng/);
    expect(text).toContain('Dịch vụ a');
    expect(text).toContain('250.000');
    // 17:30 UTC on 29/09 is already 30/09 in Vietnam
    expect(text).toContain('30/09/2026');
    expect(wrapper.find('[data-testid="history-load-more"]').exists()).toBe(false);

    await wrapper.get('[data-testid="history-item-a"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/app/orders/a');
  });

  it('filters on the server and loads the next page on request', async () => {
    getRepairHistory.mockResolvedValueOnce({ data: [row('a', 'completed')], total: 3 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();

    getRepairHistory.mockResolvedValueOnce({ data: [row('c', 'cancelled')], total: 1 });
    await wrapper.get('[data-testid="history-filter-cancelled"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(1, 20, 'cancelled');
    expect(wrapper.find('[data-testid="history-item-a"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="history-item-c"]').exists()).toBe(true);

    getRepairHistory.mockResolvedValueOnce({ data: [row('a', 'completed'), row('d', 'completed')], total: 3 });
    await wrapper.get('[data-testid="history-filter-all"]').trigger('click');
    await flushPromises();
    getRepairHistory.mockResolvedValueOnce({ data: [row('e', 'completed')], total: 3 });
    await wrapper.get('[data-testid="history-load-more"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(2, 20, undefined);
    expect(wrapper.findAll('[data-testid^="history-item-"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="history-load-more"]').exists()).toBe(false);
  });

  it('says so plainly when there is no history yet', async () => {
    getRepairHistory.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();
    expect(wrapper.find('[data-testid="history-empty"]').exists()).toBe(true);
  });

  it('shows a plain error, not the server wording, when loading fails', async () => {
    getRepairHistory.mockRejectedValue({ response: { status: 500, data: { error: { message: 'Internal server error' } } } });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Không thể tải lịch sử sửa chữa');
    expect(wrapper.text()).not.toContain('Internal');
  });
});
