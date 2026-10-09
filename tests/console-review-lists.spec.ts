import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// The cancellation page is the Service Manager's. They must show
// names, roles and order codes from the list itself: a Service Manager may not
// read user records, so asking per row only produced 403s and raw ids.
const { getCancellations, getOrder } = vi.hoisted(() => ({
  getCancellations: vi.fn(),
  getOrder: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getCancellations, getOrder, reviewCancellation: vi.fn() } }));

import ConsoleCancellationsPage from '../src/pages/console/ConsoleCancellationsPage.vue';

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

});
