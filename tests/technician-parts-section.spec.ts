import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const live = vi.hoisted(() => ({
  listeners: new Map<string, (event: { kinds?: string[] }) => void>(),
  stopOffline: vi.fn(),
  whileOffline: vi.fn(),
}));
vi.mock('../src/services/live-updates', () => ({
  onOrderChange: (id: string, fn: (event: { kinds?: string[] }) => void) => { live.listeners.set(id, fn); return () => live.listeners.delete(id); },
  whileOffline: live.whileOffline,
}));

const { partRequestsApi, partsCatalogApi } = vi.hoisted(() => ({
  partRequestsApi: {
    getByOrderId: vi.fn(),
    createPreRepair: vi.fn(),
    receiveByQr: vi.fn(),
    updateItemUsage: vi.fn(),
    declareReturn: vi.fn(),
    getReturnsByOrderId: vi.fn(),
  },
  partsCatalogApi: { getCatalog: vi.fn() },
}));
vi.mock('../src/api/part-requests.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/part-requests.api')>();
  // Keep the real helpers (idempotency key, unavailable-error mapping).
  return { ...actual, partRequestsApi };
});
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi }));

import TechnicianPartsSection from '../src/components/TechnicianPartsSection.vue';

const request = (status: string, usageStatus = 'pending') => ({
  id: 'pr-1',
  serviceOrderId: 'so-1',
  technicianId: 't-1',
  requestType: 'pre_repair',
  fulfillmentMethod: 'pickup',
  status,
  shippingFee: 0,
  createdAt: '2026-10-09T03:00:00Z',
  updatedAt: '2026-10-09T03:00:00Z',
  items: [{ id: 'i-1', partRequestId: 'pr-1', partSource: 'fixhome', partNameSnapshot: 'Van xả', quantity: 1, unitPriceSnapshot: 50000, usageStatus, createdAt: '', updatedAt: '' }],
});

const stubs = { FhButton: { template: '<button><slot /></button>' }, FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' } };

describe('TechnicianPartsSection inside the job page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.listeners.clear();
    live.whileOffline.mockReturnValue(live.stopOffline);
    partsCatalogApi.getCatalog.mockResolvedValue({ data: [] });
    // P1 return feature idle by default in these tests.
    partRequestsApi.getReturnsByOrderId.mockResolvedValue([]);
  });

  it('pages the real catalog and retries server search without a partial local fallback', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([]);
    const part = (id: string) => ({ id, name: `Linh kiện ${id}`, sku: id, sellingPrice: 50000 });
    partsCatalogApi.getCatalog.mockResolvedValueOnce({ data: [part('first')], meta: { total: 792 } })
      .mockResolvedValueOnce({ data: [part('last')], meta: { total: 792 } });
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'ACCEPTED' }, global: { stubs } });
    await flushPromises();
    await wrapper.findAll('button').find(b => b.text().includes('Tạo yêu cầu linh kiện'))!.trigger('click');
    const input = wrapper.get('input[placeholder="Tên linh kiện, mã hoặc hãng"]');
    await input.trigger('focus');
    expect(wrapper.text()).toContain('792 linh kiện');
    await wrapper.get('[data-testid="catalog-load-more"]').trigger('click');
    await flushPromises();
    expect(partsCatalogApi.getCatalog).toHaveBeenLastCalledWith({ page: 2, limit: 50 });
    expect(wrapper.text()).toContain('Linh kiện last');
    partsCatalogApi.getCatalog.mockRejectedValueOnce(new Error('offline'));
    await input.setValue('last');
    await new Promise(resolve => setTimeout(resolve, 300));
    await flushPromises();
    expect(wrapper.text()).toContain('Chưa tải được danh mục linh kiện.');
    expect(wrapper.find('[data-testid="catalog-result"]').exists()).toBe(false);
    partsCatalogApi.getCatalog.mockResolvedValueOnce({ data: [part('last')], meta: { total: 1 } });
    await wrapper.get('[data-testid="catalog-retry"]').trigger('click');
    await flushPromises();
    expect(partsCatalogApi.getCatalog).toHaveBeenLastCalledWith({ page: 1, limit: 50, search: 'last' });
    expect(wrapper.text()).toContain('1 linh kiện');
    wrapper.unmount();
  });

  it('tells the page when a request waits for the technician (parts ready to pick up)', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('ready')]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'EN_ROUTE' }, global: { stubs } });
    await flushPromises();

    expect(wrapper.emitted('summary')?.at(-1)).toEqual([{ count: 1, needsAction: true }]);
    // No rule banner and no card chrome: the page gives the heading.
    expect(wrapper.text()).not.toContain('Quy tắc quản lý linh kiện');
    wrapper.unmount();
  });

  it('refreshes only relevant order changes, follows the new order, and unsubscribes on leave', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('requested')]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'EN_ROUTE' }, global: { stubs } });
    await flushPromises();
    expect(live.whileOffline).toHaveBeenCalledWith(expect.any(Function), 20000);
    live.listeners.get('so-1')!({ kinds: ['evidence'] });
    await flushPromises();
    expect(partRequestsApi.getByOrderId).toHaveBeenCalledTimes(1);
    partRequestsApi.getByOrderId.mockResolvedValue([request('ready')]);
    live.listeners.get('so-1')!({ kinds: ['part'] });
    await flushPromises();
    expect(wrapper.text()).toContain('Linh kiện đã sẵn sàng bàn giao!');
    partRequestsApi.getByOrderId.mockResolvedValue([request('received', 'used')]);
    live.listeners.get('so-1')!({ kinds: ['quotation', 'invoice'] });
    await flushPromises();
    expect(wrapper.emitted('pending-usage')?.at(-1)).toEqual([0]);
    await wrapper.setProps({ orderId: 'so-2' });
    await flushPromises();
    expect(live.listeners.has('so-1')).toBe(false);
    expect(partRequestsApi.getByOrderId).toHaveBeenLastCalledWith('so-2');
    wrapper.unmount();
    expect(live.listeners.size).toBe(0);
    expect(live.stopOffline).toHaveBeenCalledOnce();
  });

  it('discards old catalog search replies after a new search', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([]);
    let resolveOld!: (value: unknown) => void;
    partsCatalogApi.getCatalog.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'ACCEPTED' }, global: { stubs }, attachTo: document.body });
    await wrapper.findAll('button').find(b => b.text().includes('Tạo yêu cầu linh kiện'))!.trigger('click');
    partsCatalogApi.getCatalog.mockResolvedValueOnce({ data: [{ id: 'new', name: 'Kết quả mới', sellingPrice: 1 }], meta: { total: 1 } });
    await wrapper.get('input[placeholder="Tên linh kiện, mã hoặc hãng"]').setValue('mới');
    await new Promise(resolve => setTimeout(resolve, 300));
    await flushPromises();
    resolveOld({ data: [{ id: 'old', name: 'Kết quả cũ', sellingPrice: 1 }], meta: { total: 792 } });
    await flushPromises();
    expect(wrapper.text()).toContain('Kết quả mới');
    expect(wrapper.text()).not.toContain('Kết quả cũ');
    expect(wrapper.text()).not.toContain('792 linh kiện');
    wrapper.unmount();
  });

  it('reports nothing to do once the parts are received before the repair starts', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('received')]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'EN_ROUTE' }, global: { stubs } });
    await flushPromises();

    expect(wrapper.emitted('summary')?.at(-1)).toEqual([{ count: 1, needsAction: false }]);
    wrapper.unmount();
  });

  it('asks for used/returned marks during the repair', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('received')]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();

    expect(wrapper.emitted('summary')?.at(-1)).toEqual([{ count: 1, needsAction: true }]);
    wrapper.unmount();
  });

  it('updates only the saved usage row without reloading the full request list or parent order', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('received')]);
    partRequestsApi.updateItemUsage.mockResolvedValue({ ...request('received', 'used').items[0] });
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();
    expect(partRequestsApi.getByOrderId).toHaveBeenCalledTimes(1);
    const button = wrapper.findAll('button').find(b => b.text() === 'Đã dùng');
    expect(button).toBeDefined();
    await button!.trigger('click');
    await flushPromises();
    expect(partRequestsApi.updateItemUsage).toHaveBeenCalledWith('pr-1', 'i-1', { usageStatus: 'used' });
    expect(partRequestsApi.getByOrderId).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('parts-updated')).toBeUndefined();
    expect(wrapper.emitted('requests')?.at(-1)?.[0][0].items[0].usageStatus).toBe('used');
    wrapper.unmount();
  });

  it('separates pending return declaration from manager acceptance', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('completed', 'returned')]);
    partRequestsApi.getReturnsByOrderId.mockResolvedValue([{
      partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả',
      issuedQty: 3, usedQty: 0, declaredQty: 2, managerAcceptedQty: 0, outstandingQty: 3, version: 3,
    }]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'COMPLETED' }, global: { stubs } });
    await flushPromises();
    expect(wrapper.emitted('return-summary')?.at(-1)).toEqual([{ needDeclare: 1, awaitingManager: 2 }]);
    expect(wrapper.get('[data-testid="parts-group-action"]').text()).toContain('Cần thao tác');
    wrapper.unmount();
  });

  it('groups requests by the next technician action and renders compact part cards', async () => {
    const ready = { ...request('ready'), id: 'pr-ready' };
    const waiting = { ...request('requested'), id: 'pr-waiting' };
    const needsUsage = { ...request('received'), id: 'pr-usage' };
    const resolved = { ...request('received', 'used'), id: 'pr-resolved' };
    partRequestsApi.getByOrderId.mockResolvedValue([ready, waiting, needsUsage, resolved]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();

    expect(wrapper.get('[data-testid="parts-group-action"]').text()).toContain('Cần thao tác');
    expect(wrapper.get('[data-testid="parts-group-action"]').text()).toContain('2');
    expect(wrapper.get('[data-testid="parts-group-waiting"]').text()).toContain('Đang chờ');
    expect(wrapper.get('[data-testid="parts-group-resolved"]').text()).toContain('Đã xử lý');
    expect(wrapper.get('[data-testid="part-item-i-1"]').text()).toContain('Số lượng');
    expect(wrapper.html()).not.toContain('overflow-x-auto');
    wrapper.unmount();
  });

  it('shows the new return obligation immediately after QR receipt', async () => {
    partRequestsApi.getByOrderId
      .mockResolvedValueOnce([request('ready')])
      .mockResolvedValue([request('received')]);
    partRequestsApi.receiveByQr.mockResolvedValue(null);
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([])
      .mockResolvedValue([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả',
        issuedQty: 1, usedQty: 0, declaredQty: 0, managerAcceptedQty: 0,
        outstandingQty: 1, version: 1,
      }]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'EN_ROUTE' }, global: { stubs } });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text().includes('Nhập mã bàn giao'))!.trigger('click');
    await wrapper.get('input[placeholder*="Nhập mã"]').setValue('qr-test-only');
    await wrapper.findAll('button').find((button) => button.text().includes('Xác nhận đã nhận'))!.trigger('click');
    await flushPromises();

    expect(partRequestsApi.receiveByQr).toHaveBeenCalledWith('pr-1', { qrToken: 'qr-test-only' });
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain('Cấp 1 · Dùng 0 · Cần trả kho 1');
    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(false);
    expect(wrapper.findAll('button').some(button => button.text() === 'Đã dùng')).toBe(false);
    wrapper.unmount();
  });

  it.each([
    { usedQty: 1, status: 'used', declaredQty: 0, outstandingQty: 0, expected: 'Cấp 1 · Dùng 1 · Cần trả kho 0' },
    { usedQty: 0, status: 'returned', declaredQty: 1, outstandingQty: 1, expected: 'Đang chờ quản lý xác nhận' },
  ])('records exact usage quantity $usedQty for an enrolled warehouse item', async ({ usedQty, status, declaredQty, outstandingQty, expected }) => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('received')]);
    partRequestsApi.updateItemUsage.mockResolvedValue({ usageStatus: status });
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả',
        issuedQty: 1, usedQty: 0, declaredQty: 0, managerAcceptedQty: 0,
        outstandingQty: 1, version: 1, trackingOnly: true,
      }])
      .mockResolvedValue([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả',
        issuedQty: 1, usedQty, declaredQty, managerAcceptedQty: 0,
        outstandingQty, version: 2, trackingOnly: true,
      }]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="edit-part-usage"]').trigger('click');
    const editor = wrapper.get('[data-testid="partial-usage-editor"]');
    await editor.get('input[type="number"]').setValue(usedQty);
    await editor.findAll('button').find(button => button.text().includes('Lưu số lượng'))!.trigger('click');
    await flushPromises();
    expect(partRequestsApi.updateItemUsage).toHaveBeenCalledWith('pr-1', 'i-1',
      expect.objectContaining({ usageStatus: status, usedQty, expectedVersion: 1,
        idempotencyKey: expect.stringMatching(/^parts-used-/) }));
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain(expected);
    expect(partRequestsApi.getByOrderId).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('records received 3 / used 1 / due 2 with one versioned command and no page reload', async () => {
    const stocked = request('received');
    stocked.items[0].quantity = 3;
    stocked.items[0].unitPriceSnapshot = 5000;
    partRequestsApi.getByOrderId.mockResolvedValue([stocked]);
    partRequestsApi.updateItemUsage.mockResolvedValue({ usageStatus: 'used' });
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', issuedQty: 3, usedQty: 0,
        declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 3, version: 0, trackingOnly: true,
      }])
      .mockResolvedValue([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', issuedQty: 3, usedQty: 1,
        declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 2, version: 1, trackingOnly: true, usageRecorded: true,
      }]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="edit-part-usage"]').trigger('click');
    await wrapper.get('[data-testid="partial-usage-editor"] input').setValue('1');
    expect(wrapper.get('[data-testid="partial-usage-editor"]').text()).toContain('Dự kiến cần trả: 2');
    await wrapper.get('[data-testid="partial-usage-editor"]').findAll('button')
      .find(b => b.text().includes('Lưu số lượng'))!.trigger('click');
    await flushPromises();
    expect(partRequestsApi.updateItemUsage).toHaveBeenCalledWith('pr-1', 'i-1',
      expect.objectContaining({ usageStatus: 'used', usedQty: 1, expectedVersion: 0 }));
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain('Cấp 3 · Dùng 1 · Cần trả kho 2');
    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(true);
    expect(partRequestsApi.getByOrderId).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('never leaves skeleton stuck when a newer realtime refresh supersedes initial loading', async () => {
    let resolveInitial!: (rows: unknown[]) => void;
    partRequestsApi.getByOrderId.mockReturnValueOnce(new Promise(resolve => { resolveInitial = resolve; }))
      .mockResolvedValueOnce([request('received')]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'EN_ROUTE' }, global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[aria-label="Đang tải linh kiện"]').exists()).toBe(true);
    live.listeners.get('so-1')!({ kinds: ['part'] });
    await flushPromises();
    expect(wrapper.find('[aria-label="Đang tải linh kiện"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đã nhận bàn giao');
    resolveInitial([request('requested')]);
    await flushPromises();
    expect(wrapper.find('[aria-label="Đang tải linh kiện"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đã nhận bàn giao');
    wrapper.unmount();
  });

  it('only allows physical return declaration after unused decision or end of logistics', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([request('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId.mockResolvedValue([{
      partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả', issuedQty: 1,
      usedQty: 0, declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 1, version: 1,
    }]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(true);
    await wrapper.setProps({ orderStatus: 'COMPLETED' });
    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(true);
    expect(wrapper.findAll('button').some(button => button.text() === 'Đã dùng')).toBe(false);
    wrapper.unmount();
  });

  it('shows a friendly sentence instead of a raw server error', async () => {
    partRequestsApi.getByOrderId.mockRejectedValue({
      response: { status: 500, data: { message: 'QueryFailedError: relation "part_requests" does not exist' } },
    });
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'ACCEPTED' }, global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Không thể tải danh sách yêu cầu linh kiện.');
    expect(wrapper.text()).not.toMatch(/QueryFailedError|part_requests|500/);
    wrapper.unmount();
  });
});
