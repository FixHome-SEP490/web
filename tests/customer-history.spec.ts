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

    expect(getRepairHistory).toHaveBeenCalledWith(1, 20, undefined, undefined);
    const text = wrapper.text();
    expect(text).toContain('Lịch sử sửa chữa');
    expect(text).not.toMatch(/Read Model|D-20|Trần Đình Trọng|Nguyễn Văn Hùng/);
    expect(text).toContain('Dịch vụ a');
    expect(text).toContain('250.000');
    // 17:30 UTC on 29/09 is already 30/09 in Vietnam
    expect(text).toContain('30/09/2026');
    // Everything fits on one page: no pager.
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);

    await wrapper.get('[data-testid="history-item-a"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/app/orders/a');
  });

  it('filters on the server and pages with numbered pages', async () => {
    getRepairHistory.mockResolvedValueOnce({ data: [row('a', 'completed')], total: 3 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();

    getRepairHistory.mockResolvedValueOnce({ data: [row('c', 'cancelled')], total: 1 });
    await wrapper.get('[data-testid="history-filter-cancelled"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(1, 20, 'cancelled', undefined);
    expect(wrapper.find('[data-testid="history-item-a"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="history-item-c"]').exists()).toBe(true);

    const firstPage = Array.from({ length: 20 }, (_, i) => row(`p${i}`, 'completed'));
    getRepairHistory.mockResolvedValueOnce({ data: firstPage, total: 45 });
    await wrapper.get('[data-testid="history-filter-all"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(1, 20, undefined, undefined);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 45');
    expect(wrapper.get('[data-testid="pagination-page-1"]').attributes('aria-current')).toBe('page');
    expect(wrapper.find('[data-testid="pagination-page-3"]').exists()).toBe(true);

    getRepairHistory.mockResolvedValueOnce({ data: [row('e', 'completed')], total: 45 });
    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(2, 20, undefined, undefined);
    // The page replaces the rows instead of adding to them.
    expect(wrapper.findAll('[data-testid^="history-item-"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('21–40 / 45');
    expect(wrapper.find('[data-testid="history-load-more"]').exists()).toBe(false);

    // A new filter starts again from page 1.
    getRepairHistory.mockResolvedValueOnce({ data: [row('f', 'completed')], total: 1 });
    await wrapper.get('[data-testid="history-filter-completed"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(1, 20, 'completed', undefined);
  });

  it('searches on the server a moment after typing, from page 1', async () => {
    getRepairHistory.mockResolvedValue({ data: [row('a', 'completed')], total: 30 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();
    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    getRepairHistory.mockClear();
    getRepairHistory.mockResolvedValue({ data: [], total: 0 });
    await wrapper.get('[data-testid="history-search"]').setValue(' dieu hoa ');
    expect(getRepairHistory).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(getRepairHistory).toHaveBeenCalledTimes(1);
    expect(getRepairHistory).toHaveBeenLastCalledWith(1, 20, undefined, 'dieu hoa');
    expect(wrapper.get('[data-testid="history-empty"]').text()).toContain('Không có đơn phù hợp');
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
