import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
enableAutoUnmount(afterEach);

const { api, auth, socket, resync } = vi.hoisted(() => ({
  api: { getByOrderId: vi.fn(), getReturnsByOrderId: vi.fn(), getPendingReturns: vi.fn(), getAll: vi.fn(), acceptReturn: vi.fn(), updateItemUsage: vi.fn() },
  auth: { hasRole: vi.fn(() => true) },
  socket: new Set<{ onNotificationNew?: (event: { type: string }) => void }>(),
  resync: new Set<() => void>(),
}));
vi.mock('../src/api/part-requests.api', async (original) => ({ ...await original<typeof import('../src/api/part-requests.api')>(), partRequestsApi: api }));
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi: { getCatalog: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../src/services/live-updates', () => ({
  onOrderChange: () => () => undefined, whileOffline: () => () => undefined,
  onResync: (fn: () => void) => { resync.add(fn); return () => resync.delete(fn); },
}));
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: {
  subscribe: (handler: { onNotificationNew?: (event: { type: string }) => void }) => { socket.add(handler); return () => socket.delete(handler); },
} }));

import TechnicianPartsSection from '../src/components/TechnicianPartsSection.vue';
import ConsolePartRequestsPage from '../src/pages/console/ConsolePartRequestsPage.vue';
import PartReturnsQueue from '../src/components/console/PartReturnsQueue.vue';

const request = (id = 'pr-1', orderId = 'so-1') => ({
  id, serviceOrderId: orderId, technicianId: 't1', requestType: 'pre_repair', fulfillmentMethod: 'pickup',
  status: 'received', shippingFee: 0, createdAt: '2026-10-23T08:00:00Z',
  items: [{ id: `item-${id}`, partRequestId: id, partSource: 'fixhome', partNameSnapshot: 'Van xả', quantity: 2, unitPriceSnapshot: 50000, usageStatus: 'used' }],
});
const ledger = (extra = {}) => ({
  partRequestId: 'pr-1', partRequestItemId: 'item-pr-1', partNameSnapshot: 'Van xả',
  issuedQty: 2, usedQty: 1, declaredQty: 1, managerAcceptedQty: 0, outstandingQty: 1, usageRecorded: true, version: 3, ...extra,
});
const stubs = {
  FhMoney: { props: ['amount'], template: '<span :data-money="amount">{{ amount }}</span>' },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
};
const text = (w: { text: () => string }) => w.text().replace(/\s+/g, ' ');
const mountTech = () => mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
const mountManager = () => mount(ConsolePartRequestsPage, { global: { stubs } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
async function focusRefresh() {
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.values(api).forEach(fn => fn.mockReset());
  auth.hasRole.mockReturnValue(true);
  socket.clear(); resync.clear();
  api.getByOrderId.mockResolvedValue([request()]);
  api.getAll.mockResolvedValue({ data: [request()], total: 21 });
  api.getReturnsByOrderId.mockResolvedValue([ledger()]);
  api.getPendingReturns.mockResolvedValue([ledger()]);
});
afterEach(() => { vi.useRealTimers(); });

describe('Partial usage and physical return truth', () => {
  it.each([
    { accepted: 0, outstanding: 1, pending: 1 },
    { accepted: 1, outstanding: 0, pending: 0 },
  ])('separates issued/used/declared/accepted with accepted=$accepted', async ({ accepted, outstanding, pending }) => {
    api.getReturnsByOrderId.mockResolvedValue([ledger({ managerAcceptedQty: accepted, outstandingQty: outstanding })]);
    const w = mountTech();
    await flushPromises();
    // Waiting/resolved requests start collapsed; opening must not infer quantity from USED.
    await w.findAll('button').find(button => button.text().includes('Chi tiết'))!.trigger('click');
    const item = w.get('[data-testid="part-item-item-pr-1"]');
    expect(text(item)).toContain(`Cấp 2 · Dùng 1 · Cần trả kho ${outstanding}`);
    const fields = item.findAll('dl > div').map(field => [field.get('dt').text(), field.get('dd').text()]);
    expect(fields).toContainEqual(['Còn phải khai', '0']);
    expect(fields).toContainEqual(['Đã khai, chờ nhận', String(pending)]);
    expect(fields).toContainEqual(['Quản lý đã nhận', String(accepted)]);
    expect(item.get('[data-testid="part-used-value"]').attributes('data-money')).toBe('50000');
    expect(item.find('[data-money="100000"]').exists()).toBe(false);
    expect(item.find('[data-testid="open-declare-return"]').exists()).toBe(false);
    w.unmount();
  });

  it('keeps usage and declaration as balanced peer actions on the same item', async () => {
    api.getReturnsByOrderId.mockResolvedValue([ledger({ declaredQty: 0 })]);
    const w = mountTech(); await flushPromises();
    const actions = w.get('[data-testid="part-actions-item-pr-1"]');
    const buttons = actions.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.map(button => button.attributes('aria-label'))).toEqual(['Ghi số lượng thực dùng Van xả', 'Khai trả kho Van xả']);
    for (const button of buttons) { expect(button.classes()).toContain('min-h-11'); expect(button.findAll('svg')).toHaveLength(1); }
    await buttons[0].trigger('click');
    expect(w.get('[data-testid="partial-usage-editor"] input').attributes('max')).toBe('2');
    w.unmount();
  });

  it('does not invent actual consumed quantities or paid totals without custody', async () => {
    api.getReturnsByOrderId.mockResolvedValue([]);
    const w = mountTech(); await flushPromises();
    await w.findAll('button').find(button => button.text().includes('Chi tiết'))!.trigger('click');
    const item = w.get('[data-testid="part-item-item-pr-1"]');
    expect(text(item)).toContain('Số lượng yêu cầu/cấp 2');
    expect(text(item)).toContain('Chưa có số lượng thực dùng');
    expect(item.find('[data-testid="part-used-value"]').exists()).toBe(false);
    w.unmount();
  });

  it('does not claim already accepted stock is still due after recording more usage', async () => {
    api.getReturnsByOrderId.mockResolvedValueOnce([ledger({ usedQty: 0, managerAcceptedQty: 1, outstandingQty: 1 })])
      .mockResolvedValue([ledger({ managerAcceptedQty: 1, outstandingQty: 0, version: 4 })]);
    api.updateItemUsage.mockResolvedValue({ usageStatus: 'used' });
    const w = mountTech(); await flushPromises();
    await w.get('[data-testid="edit-part-usage"]').trigger('click');
    await w.get('[data-testid="partial-usage-editor"] input').setValue('1');
    await w.get('[data-testid="partial-usage-editor"] button').trigger('click'); await flushPromises();
    expect(text(w)).toContain('Cấp 2 · Dùng 1 · Cần trả kho 0');
    expect(text(w)).not.toContain('cần trả 1 linh kiện');
    expect(api.updateItemUsage).toHaveBeenCalledWith('pr-1', 'item-pr-1', expect.objectContaining({ usedQty: 1, expectedVersion: 3 }));
    w.unmount();
  });
});

describe('Manager custody projection and refresh', () => {
  it.each([{ accepted: 0, pending: 1 }, { accepted: 1, pending: 0 }])('shows actual used and returns in manager rows/detail after accepted=$accepted', async ({ accepted, pending }) => {
    api.getReturnsByOrderId.mockResolvedValue([ledger({ managerAcceptedQty: accepted, outstandingQty: pending })]);
    api.getPendingReturns.mockResolvedValue(pending ? [ledger()] : []);
    const w = mountManager(); await flushPromises();
    const row = w.get('[data-testid="manager-part-item-pr-1"]');
    expect(text(row)).toContain('Cấp 2 · Dùng 1');
    expect(text(row)).toContain(`Khai trả 1 · Đã nhận trả ${accepted}`);
    expect(text(row)).toContain(pending ? 'Chờ nhận 1' : 'Đã nhận trả 1');
    await w.get('[data-testid="part-request-detail-pr-1"]').trigger('click');
    const item = w.get('[data-testid="manager-part-detail-item-pr-1"]');
    expect(text(item)).toContain(`Khai trả 1 · Đã nhận ${accepted}`);
    if (pending) expect(text(item)).toContain('Chờ nhận 1');
    else expect(text(item)).not.toContain('Chờ nhận 1');
    expect(item.get('[data-testid="manager-part-used-value"]').attributes('data-money')).toBe('50000');
    if (pending) expect(w.get('[data-testid="part-returns-link"]').attributes('href')).toBe('/console/part-returns');
    else expect(w.find('[data-testid="part-returns-link"]').exists()).toBe(false);
    w.unmount();
  });

  it('does not hide a pending-count failure as an empty queue and recovers on focus', async () => {
    api.getPendingReturns.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([ledger()]);
    const w = mountManager(); await flushPromises();
    expect(w.get('[data-testid="part-returns-check-error"]').attributes('role')).toBe('alert');
    expect(w.find('[data-testid="part-returns-link"]').exists()).toBe(false);
    await focusRefresh();
    expect(w.find('[data-testid="part-returns-check-error"]').exists()).toBe(false);
    expect(text(w.get('[data-testid="part-returns-link"]'))).toContain('1');
    w.unmount();
    expect(socket.size).toBe(0); expect(resync.size).toBe(0);
  });

  it('keeps a late pending read from overwriting the refreshed count', async () => {
    const first = deferred<ReturnType<typeof ledger>[]>();
    api.getPendingReturns.mockReturnValueOnce(first.promise).mockResolvedValue([ledger()]);
    const w = mountManager(); await flushPromises();
    await focusRefresh();
    first.resolve([]); await flushPromises();
    expect(w.find('[data-testid="part-returns-link"]').exists()).toBe(true);
    w.unmount();
  });

  it('deduplicates ledger reads by order on the current server page and keeps the server count', async () => {
    api.getAll.mockResolvedValue({ data: [request('pr-1'), request('pr-2')], total: 121 });
    const w = mountManager(); await flushPromises();
    expect(api.getReturnsByOrderId.mock.calls).toEqual([['so-1']]);
    expect(text(w)).toContain('121');
    w.unmount();
  });

  it('keeps unavailable ledger data explicit instead of turning enum USED into two used units', async () => {
    api.getReturnsByOrderId.mockRejectedValue(new Error('offline'));
    const w = mountManager(); await flushPromises();
    expect(text(w.get('[data-testid="manager-part-item-pr-1"]'))).toContain('Chưa tải được số thực dùng');
    expect(text(w.get('[data-testid="manager-part-item-pr-1"]'))).not.toContain('Dùng 2');
    w.unmount();
  });

  it('bounds reads to twenty visible orders and three concurrent calls', async () => {
    const pending = deferred<ReturnType<typeof ledger>[]>();
    api.getAll.mockResolvedValue({ data: Array.from({ length: 25 }, (_, i) => request(`pr-${i}`, `so-${i}`)), total: 121 });
    api.getReturnsByOrderId.mockReturnValue(pending.promise);
    const w = mountManager(); await flushPromises();
    expect(api.getReturnsByOrderId).toHaveBeenCalledTimes(3);
    pending.resolve([]); await flushPromises();
    expect(api.getReturnsByOrderId).toHaveBeenCalledTimes(20);
    expect(api.getReturnsByOrderId).not.toHaveBeenCalledWith('so-20');
    w.unmount();
  });

  it('does not mix an old order ledger into the newly selected server page', async () => {
    const first = deferred<ReturnType<typeof ledger>[]>();
    api.getAll.mockResolvedValueOnce({ data: [request()], total: 21 })
      .mockResolvedValue({ data: [request('pr-2', 'so-2')], total: 21 });
    api.getReturnsByOrderId.mockReturnValueOnce(first.promise).mockResolvedValue([ledger({ partRequestId: 'pr-2', partRequestItemId: 'item-pr-2', usedQty: 0 })]);
    const w = mountManager(); await flushPromises();
    await w.get('[data-testid="pagination-next"]').trigger('click'); await flushPromises();
    first.resolve([ledger()]); await flushPromises();
    expect(text(w.get('[data-testid="manager-part-item-pr-2"]'))).toContain('Cấp 2 · Dùng 0');
    expect(w.find('[data-testid="manager-part-item-pr-1"]').exists()).toBe(false);
    expect(api.getAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }));
    w.unmount();
  });

  it('keeps the concurrency limit across page changes while old reads are still pending', async () => {
    const first = deferred<ReturnType<typeof ledger>[]>();
    api.getAll.mockResolvedValueOnce({ data: [request('a', 'a'), request('b', 'b'), request('c', 'c')], total: 21 })
      .mockResolvedValue({ data: [request('d', 'd'), request('e', 'e'), request('f', 'f')], total: 21 });
    api.getReturnsByOrderId.mockReturnValueOnce(first.promise).mockReturnValueOnce(first.promise).mockReturnValueOnce(first.promise).mockResolvedValue([]);
    const w = mountManager(); await flushPromises();
    expect(api.getReturnsByOrderId).toHaveBeenCalledTimes(3);
    await w.get('[data-testid="pagination-next"]').trigger('click'); await flushPromises();
    expect(api.getReturnsByOrderId).toHaveBeenCalledTimes(3);
    first.resolve([]); await flushPromises();
    expect(api.getReturnsByOrderId).toHaveBeenCalledTimes(6);
    expect(text(w.get('[data-testid="manager-part-item-d"]'))).toContain('Chưa có số lượng thực dùng chi tiết');
    w.unmount();
  });

  it('keeps a missing ledger honest in the manager detail', async () => {
    api.getReturnsByOrderId.mockResolvedValue([]);
    const w = mountManager(); await flushPromises();
    await w.get('[data-testid="part-request-detail-pr-1"]').trigger('click');
    const item = w.get('[data-testid="manager-part-detail-item-pr-1"]');
    expect(text(item)).toContain('Số lượng yêu cầu/cấp 2');
    expect(text(item)).toContain('Chưa có số lượng thực dùng chi tiết');
    expect(item.find('[data-testid="manager-part-used-value"]').exists()).toBe(false);
    w.unmount();
  });

  it('does not fetch manager custody for an account without the manager role', async () => {
    auth.hasRole.mockReturnValue(false);
    const w = mountManager(); await flushPromises();
    expect(api.getPendingReturns).not.toHaveBeenCalled();
    expect(api.getReturnsByOrderId).not.toHaveBeenCalled();
    w.unmount();
  });

  it('revalidates pending returns after the declared-return signal and focus, then cleans up', async () => {
    api.getPendingReturns.mockResolvedValueOnce([]).mockResolvedValue([ledger()]);
    const w = mount(PartReturnsQueue, { global: { stubs } }); await flushPromises();
    socket.forEach(handler => handler.onNotificationNew?.({ type: 'PART_RETURN_DECLARED' }));
    await vi.advanceTimersByTimeAsync(200); await flushPromises();
    expect(w.find('[data-testid="accept-return"]').exists()).toBe(true);
    expect(api.acceptReturn).not.toHaveBeenCalled();
    api.getPendingReturns.mockResolvedValue([]);
    await focusRefresh();
    expect(w.find('[data-testid="accept-return"]').exists()).toBe(false);
    w.unmount();
    expect(socket.size).toBe(0); expect(resync.size).toBe(0);
  });

  it('ignores a late queue read and preserves a valid draft on a same-version refresh', async () => {
    const first = deferred<ReturnType<typeof ledger>[]>();
    api.getPendingReturns.mockReturnValueOnce(first.promise).mockResolvedValue([ledger({ issuedQty: 3, declaredQty: 2, outstandingQty: 2 })]);
    const w = mount(PartReturnsQueue, { global: { stubs } }); await flushPromises();
    await focusRefresh();
    first.resolve([]); await flushPromises();
    expect(w.get('[data-testid="part-returns-count"]').text()).toBe('1');
    await w.get('input[type="number"]').setValue('1');
    resync.forEach(fn => fn());
    await vi.advanceTimersByTimeAsync(200); await flushPromises();
    expect((w.get('input[type="number"]').element as HTMLInputElement).value).toBe('1');
    w.unmount();
  });
});
