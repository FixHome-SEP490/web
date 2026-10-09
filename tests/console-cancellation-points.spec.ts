import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

// PO 09/10/2026: cancelling costs reputation points by itself, so the page no
// longer asks the manager to confirm or waive a violation. It shows what each
// cancellation cost and keeps the Priority Boost for the technician.
const { getCancellations, reviewCancellation } = vi.hoisted(() => ({
  getCancellations: vi.fn(),
  reviewCancellation: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getCancellations, reviewCancellation } }));

import ConsoleCancellationsPage from '../src/pages/console/ConsoleCancellationsPage.vue';

const cancellation = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  serviceOrderId: 'order-1',
  actor: 'customer',
  actorUserId: 'user-1',
  reason: 'Đổi ý',
  stateAtCancel: 'accepted',
  strikeApplied: false,
  compensationStatus: 'pending_review',
  reviewedByUserId: null,
  createdAt: '2026-10-01T10:00:00Z',
  actorName: 'Khách Hàng 1',
  orderCode: 'FH-20261001-AAAA0001',
  reputationDelta: -10,
  ...overrides,
});

const mountPage = async (): Promise<VueWrapper> => {
  const wrapper = mount(ConsoleCancellationsPage, { global: { stubs: { teleport: true } } });
  await flushPromises();
  return wrapper;
};

describe('Cancellations cost points by themselves (console)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
  });

  it('shows what each cancellation cost and offers no manual violation', async () => {
    getCancellations.mockResolvedValue([
      cancellation(),
      cancellation({ id: 'staff', actor: 'service_manager', actorName: 'Quản lý', reputationDelta: null }),
    ]);
    const wrapper = await mountPage();
    const labels = wrapper.findAll('[data-testid="cancellation-points"]').map((cell) => cell.text());
    expect(labels).toEqual(['Trừ 10 điểm uy tín', 'Không trừ điểm']);
    expect(wrapper.text()).not.toContain('Xác nhận vi phạm');
    expect(wrapper.text()).not.toContain('Miễn Strike');
    expect(wrapper.text()).not.toContain('Strike vi phạm');
  });

  it('treats a missing amount as nothing deducted', async () => {
    getCancellations.mockResolvedValue([cancellation({ reputationDelta: undefined })]);
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="cancellation-points"]').text()).toBe('Không trừ điểm');
  });

  it('still grants a Priority Boost, sending only that decision', async () => {
    getCancellations.mockResolvedValue([cancellation()]);
    reviewCancellation.mockResolvedValue(cancellation({ reviewedByUserId: 'sm-1' }));
    const wrapper = await mountPage();
    await wrapper.findAll('button').find((b) => b.text().includes('Cấp Boost'))!.trigger('click');
    await flushPromises();
    expect(reviewCancellation).toHaveBeenCalledWith('c1', { grantPriorityBoost: true });
    expect(wrapper.text()).toContain('Đã xử lý');
  });
});
