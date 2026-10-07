import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

// BRX-032: a cancellation becomes a strike only when staff confirm it was a
// violation. The page asks first, then sends exactly { confirmViolation: true }
// and reloads the list so the strike shows.
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
  ...overrides,
});

const mountPage = async (): Promise<VueWrapper> => {
  const wrapper = mount(ConsoleCancellationsPage, { global: { stubs: { teleport: true } } });
  await flushPromises();
  return wrapper;
};

const buttonWithText = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').filter((b) => b.text().includes(text));

describe('Xác nhận vi phạm huỷ đơn (console)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
  });

  it('asks first, then sends only { confirmViolation: true } and reloads the list', async () => {
    getCancellations
      .mockResolvedValueOnce([cancellation()])
      .mockResolvedValueOnce([cancellation({ strikeApplied: true, reviewedByUserId: 'sm-1' })]);
    reviewCancellation.mockResolvedValue(cancellation({ strikeApplied: true, reviewedByUserId: 'sm-1' }));
    const wrapper = await mountPage();

    await wrapper.get('[data-testid="confirm-violation"]').trigger('click');
    await flushPromises();
    // Nothing is sent before the manager confirms in the dialog.
    expect(reviewCancellation).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Ghi 1 Strike cho khách hàng Khách Hàng 1');

    const [, dialogConfirm] = buttonWithText(wrapper, 'Xác nhận vi phạm');
    await dialogConfirm!.trigger('click');
    await flushPromises();

    expect(reviewCancellation).toHaveBeenCalledTimes(1);
    expect(reviewCancellation).toHaveBeenCalledWith('c1', { confirmViolation: true });
    expect(getCancellations).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('+1 Strike vi phạm');
    expect(wrapper.find('[data-testid="confirm-violation"]').exists()).toBe(false);
  });

  it('sends nothing when the manager backs out', async () => {
    getCancellations.mockResolvedValue([cancellation({ actor: 'technician' })]);
    const wrapper = await mountPage();

    await wrapper.get('[data-testid="confirm-violation"]').trigger('click');
    await flushPromises();
    await buttonWithText(wrapper, 'Quay lại')[0]!.trigger('click');
    await flushPromises();

    expect(reviewCancellation).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Ghi 1 Strike');
  });

  it('offers no violation for staff cancellations or ones already reviewed or struck', async () => {
    getCancellations.mockResolvedValue([
      cancellation({ id: 'staff', actor: 'service_manager' }),
      cancellation({ id: 'reviewed', reviewedByUserId: 'sm-1' }),
      cancellation({ id: 'struck', strikeApplied: true }),
    ]);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="confirm-violation"]').exists()).toBe(false);
    // The existing actions stay.
    expect(buttonWithText(wrapper, 'Cấp Boost').length).toBeGreaterThan(0);
    expect(buttonWithText(wrapper, 'Miễn Strike').length).toBeGreaterThan(0);
  });

  it('shows the server reason when the confirmation is refused', async () => {
    getCancellations.mockResolvedValue([cancellation()]);
    reviewCancellation.mockRejectedValue(new Error('Đơn này đã được xử lý trước đó.'));
    const wrapper = await mountPage();

    await wrapper.get('[data-testid="confirm-violation"]').trigger('click');
    await flushPromises();
    const [, dialogConfirm] = buttonWithText(wrapper, 'Xác nhận vi phạm');
    await dialogConfirm!.trigger('click');
    await flushPromises();

    expect(window.alert).toHaveBeenCalledWith('Đơn này đã được xử lý trước đó.');
  });
});
