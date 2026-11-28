import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
enableAutoUnmount(afterEach);

const { api, auth } = vi.hoisted(() => ({
  api: {
    getAll: vi.fn(), getWarehouseTasks: vi.fn(), getWarehouseAllocation: vi.fn(), getPendingReturns: vi.fn(), getLegacyManualReview: vi.fn(), getReturnsByOrderId: vi.fn(),
    markReady: vi.fn(), markDelivering: vi.fn(), receiveFaultyParts: vi.fn(), sendFaultyToManufacturer: vi.fn(), recordFaultyResult: vi.fn(), prepareWarehouseQr: vi.fn(), confirmWarehouseHandover: vi.fn(), getById: vi.fn(),
  },
  auth: { hasRole: vi.fn(() => true), user: { id: 'sm-1' }, userRole: 'SERVICE_MANAGER' },
}));
vi.mock('../src/api/part-requests.api', async (original) => ({ ...await original<typeof import('../src/api/part-requests.api')>(), partRequestsApi: api }));
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi: { getCatalog: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('../src/api/media.api', () => ({ mediaApi: { upload: vi.fn() }, ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg'], MAX_MEDIA_SIZE_BYTES: 10_000_000 }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../src/services/live-updates', () => ({
  onOrderChange: () => () => undefined, whileOffline: () => () => undefined, onResync: () => () => undefined,
}));
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: { subscribe: () => () => undefined } }));

import ConsolePartRequestsPage from '../src/pages/console/ConsolePartRequestsPage.vue';
import FaultyPartsBoard from '../src/components/console/FaultyPartsBoard.vue';
import ManufacturerResultModal from '../src/components/console/ManufacturerResultModal.vue';

const warranty = (overrides: Record<string, unknown> = {}) => ({
  id: 'pr-w', serviceOrderId: 'so-1', technicianId: 't1', requestType: 'warranty', fulfillmentMethod: 'pickup',
  status: 'requested', shippingFee: 0, createdAt: '2026-11-04T08:00:00Z', updatedAt: '2026-11-04T08:00:00Z',
  items: [{ id: 'i-1', partRequestId: 'pr-w', partSource: 'fixhome', partNameSnapshot: 'Bo mạch', quantity: 1, unitPriceSnapshot: 400000, usageStatus: 'pending' }],
  ...overrides,
});
const stubs = {
  FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
};
const text = (w: { text: () => string }) => w.text().replace(/\s+/g, ' ');

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  auth.hasRole.mockReturnValue(true);
  auth.user = { id: 'sm-1' };
  auth.userRole = 'SERVICE_MANAGER';
  api.getWarehouseTasks.mockResolvedValue({ data: [], total: 0 });
  api.getWarehouseAllocation.mockResolvedValue({ partRequestId: 'pr-w', mode: 'legacy', status: null });
  api.getPendingReturns.mockResolvedValue([]);
  api.getLegacyManualReview.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
  api.getReturnsByOrderId.mockResolvedValue([]);
});

describe('faulty part inspection on the manager page', () => {
  const mountPage = async (requests: unknown[]) => {
    api.getAll.mockResolvedValue({ data: requests, total: requests.length });
    api.getWarehouseTasks.mockResolvedValue({ data: requests, total: requests.length });
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    return wrapper;
  };
  const button = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll('button').find((b) => b.text() === label);

  it('offers READY without waiting for the faulty part; counting it in belongs to the returns page', async () => {
    const wrapper = await mountPage([warranty()]);
    expect(button(wrapper, 'Chuẩn bị xong')).toBeTruthy();
    expect(text(wrapper)).toContain('Bảo hành');
  });

  it('offers READY once inspected, and an ordinary request is unaffected', async () => {
    const wrapper = await mountPage([
      warranty({ id: 'a', faultyInspectionResult: 'manufacturer' }),
      { ...warranty({ id: 'b' }), requestType: 'additional' },
    ]);
    // BUG DETECTOR 258: actions sit in the pane of the chosen request; each request offers READY.
    for (const id of ['a', 'b']) {
      await wrapper.get(`[data-testid="part-request-detail-${id}"]`).trigger('click');
      expect(wrapper.get(`[data-testid="part-request-pane-${id}"]`).findAll('button').filter((b) => b.text() === 'Chuẩn bị xong')).toHaveLength(1);
    }
  });

  it('uses the assigned warehouse queue and keeps the W2 QR, handover, and technician receipt on the main row', async () => {
    const request = warranty({ id: 'pr-w2', requestType: 'pre_repair' });
    const allocation = { partRequestId: request.id, mode: 'warehouse', status: 'reserved', warehouseId: 'wh-20', warehouseName: 'Kho 20', responsibleUserId: 'sm-1', estimatedStraightLineKm: 1.4, distanceReference: 'booking_snapshot', reviewRequired: true };
    api.getWarehouseTasks.mockResolvedValue({ data: [request], total: 1 });
    api.getWarehouseAllocation.mockResolvedValue(allocation);
    api.prepareWarehouseQr.mockResolvedValue({ allocation: { ...allocation, status: 'ready' }, qrToken: 'pickup-token' });
    api.confirmWarehouseHandover.mockResolvedValue({ allocation: { ...allocation, status: 'handed_over' }, qrToken: 'receipt-token' });

    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();

    expect(api.getWarehouseTasks).toHaveBeenCalledOnce();
    expect(api.getAll).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid^="part-request-pane-"]').text()).toContain('Chuẩn bị mã kho');
    expect(wrapper.text()).toContain('Khoảng cách đường thẳng ước tính từ vị trí đặt lịch: ~1.4 km; chưa xác minh đường đi/ETA');
    expect(wrapper.findAll('button').some((button) => button.text() === 'Chuẩn bị xong')).toBe(false);

    await wrapper.findAll('button').find((button) => button.text() === 'Chuẩn bị mã kho')!.trigger('click');
    await flushPromises();
    expect(api.prepareWarehouseQr).toHaveBeenCalledWith(request.id, expect.objectContaining({ idempotencyKey: expect.any(String) }));
    const inlineHandover = wrapper.get('[data-testid^="part-request-pane-"]').findAll('button').find((button) => button.text() === 'Xác nhận đã giao trực tiếp');
    expect(inlineHandover).toBeTruthy();
    expect(api.markReady).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Mã lấy hàng một lần · hết hạn trong 15 phút');
  });

  it('updates the status column right after preparing the code and after the handover, without a reload (BUG DETECTOR 208)', async () => {
    const request = warranty({ id: 'pr-live', requestType: 'pre_repair' });
    const allocation = { partRequestId: request.id, mode: 'warehouse', status: 'reserved', warehouseId: 'wh-20', warehouseName: 'Kho 20', responsibleUserId: 'sm-1' };
    api.getWarehouseTasks.mockResolvedValue({ data: [request], total: 1 });
    api.getWarehouseAllocation.mockResolvedValue(allocation);
    api.prepareWarehouseQr.mockResolvedValue({ allocation: { ...allocation, status: 'ready' }, qrToken: 'pickup-token' });
    api.confirmWarehouseHandover.mockResolvedValue({ allocation: { ...allocation, status: 'handed_over' }, qrToken: 'receipt-token' });
    api.getById.mockResolvedValueOnce({ ...request, status: 'ready' }).mockResolvedValueOnce({ ...request, status: 'received' });
    const QRCode = (await import('qrcode')).default as unknown as { toDataURL: (...args: unknown[]) => Promise<string> };
    const draw = vi.spyOn(QRCode, 'toDataURL').mockResolvedValue('data:image/png;base64,AA==');

    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs: { ...stubs, teleport: true } } });
    await flushPromises();
    expect(wrapper.get('[data-testid^="part-request-pane-"]').text()).toContain('Chờ chuẩn bị');

    await wrapper.findAll('button').find((b) => b.text() === 'Chuẩn bị mã kho')!.trigger('click');
    await flushPromises();
    expect(api.getById).toHaveBeenCalledWith(request.id);
    expect(wrapper.get('[data-testid^="part-request-pane-"]').text()).toContain('Sẵn sàng giao');
    expect(api.getWarehouseTasks).toHaveBeenCalledOnce();

    await wrapper.get('[data-testid^="part-request-pane-"]').findAll('button').find((b) => b.text() === 'Xác nhận đã giao trực tiếp')!.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Đã giao thực tế')!.trigger('click');
    await flushPromises();
    expect(api.confirmWarehouseHandover).toHaveBeenCalledOnce();
    expect(api.getById).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid^="part-request-pane-"]').text()).toContain('Đã nhận / Đang dùng');
    expect(api.getWarehouseTasks).toHaveBeenCalledOnce();
    draw.mockRestore();
  });

  it('moves the summary cards with the row after preparing the code, without a reload (BUG DETECTOR 212)', async () => {
    const request = warranty({ id: 'pr-count', requestType: 'pre_repair' });
    const allocation = { partRequestId: request.id, mode: 'warehouse', status: 'reserved', warehouseId: 'wh-20', warehouseName: 'Kho 20', responsibleUserId: 'sm-1' };
    api.getWarehouseTasks.mockResolvedValue({ data: [request], total: 9, statusCounts: { requested: 9, ready: 0 } });
    api.getWarehouseAllocation.mockResolvedValue(allocation);
    api.prepareWarehouseQr.mockResolvedValue({ allocation: { ...allocation, status: 'ready' }, qrToken: 'pickup-token' });
    api.getById.mockResolvedValueOnce({ ...request, status: 'ready' });
    const QRCode = (await import('qrcode')).default as unknown as { toDataURL: (...args: unknown[]) => Promise<string> };
    const draw = vi.spyOn(QRCode, 'toDataURL').mockResolvedValue('data:image/png;base64,AA==');

    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs: { ...stubs, teleport: true } } });
    await flushPromises();
    const card = (label: string) => wrapper.findAll('[data-stat-card]').find((d) => d.text().startsWith(label))!.text();
    expect(card('Chờ chuẩn bị')).toContain('9');
    await wrapper.findAll('button').find((b) => b.text() === 'Chuẩn bị mã kho')!.trigger('click');
    await flushPromises();
    expect(card('Chờ chuẩn bị')).toBe('Chờ chuẩn bị8');
    expect(card('Sẵn sàng')).toBe('Sẵn sàng1');
    expect(api.getWarehouseTasks).toHaveBeenCalledOnce();
    draw.mockRestore();
  });

  it('moves the summary cards when a delivery request is marked ready and then delivering', async () => {
    const request = { ...warranty({ id: 'pr-ship', requestType: 'pre_repair' }), fulfillmentMethod: 'delivery', status: 'requested' };
    api.getWarehouseTasks.mockResolvedValue({ data: [request], total: 3, statusCounts: { requested: 3, ready: 0, delivering: 0 } });
    api.markReady.mockResolvedValue({ ...request, status: 'ready', qrToken: 'FH-PR-x' });
    api.markDelivering.mockResolvedValue({ ...request, status: 'delivering', qrToken: 'FH-PR-x' });
    const QRCode = (await import('qrcode')).default as unknown as { toDataURL: (...args: unknown[]) => Promise<string> };
    const draw = vi.spyOn(QRCode, 'toDataURL').mockResolvedValue('data:image/png;base64,AA==');
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs: { ...stubs, teleport: true } } });
    await flushPromises();
    const card = (label: string) => wrapper.findAll('[data-stat-card]').find((d) => d.text().startsWith(label))!.text();
    await wrapper.findAll('button').find((b) => b.text() === 'Chuẩn bị xong')!.trigger('click');
    await flushPromises();
    expect(card('Chờ chuẩn bị')).toBe('Chờ chuẩn bị2');
    expect(card('Sẵn sàng')).toBe('Sẵn sàng1');
    await wrapper.findAll('button').find((b) => b.text() === 'Giao hàng')!.trigger('click');
    await flushPromises();
    expect(card('Sẵn sàng')).toBe('Sẵn sàng0');
    expect(card('Đang giao')).toBe('Đang giao1');
    draw.mockRestore();
  });

  it('shows a reissued code after handover as the technician receipt, without a dead handover button', async () => {
    const request = warranty({ id: 'pr-done', requestType: 'quotation' });
    const allocation = { partRequestId: request.id, mode: 'warehouse', status: 'handed_over', warehouseId: 'wh-20', warehouseName: 'Kho 20', responsibleUserId: 'sm-1' };
    api.getWarehouseTasks.mockResolvedValue({ data: [request], total: 1 });
    api.getWarehouseAllocation.mockResolvedValue(allocation);
    api.prepareWarehouseQr.mockResolvedValue({ allocation, qrToken: 'receipt-again' });

    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Cấp lại mã nhận')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Đưa mã nhận hàng riêng này cho kỹ thuật viên');
    expect(wrapper.text()).not.toContain('Mã lấy hàng một lần');
    expect(wrapper.findAll('button').some((button) => button.text() === 'Xác nhận đã giao trực tiếp')).toBe(false);
    expect(api.confirmWarehouseHandover).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'completed'])('offers no warehouse code on a %s request, so the manager cannot hit the server refusal', async (status) => {
    const request = warranty({ id: `pr-${status}`, requestType: 'pre_repair', status });
    const allocation = { partRequestId: request.id, mode: 'warehouse', status: 'handed_over', warehouseId: 'wh-20', warehouseName: 'Kho 20', responsibleUserId: 'sm-1' };
    api.getWarehouseTasks.mockResolvedValue({ data: [{ ...request, warehouseAllocation: allocation }], total: 1 });

    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll('button').some((button) => ['Cấp lại mã nhận', 'Chuẩn bị mã kho'].includes(button.text()))).toBe(false);
    expect(api.prepareWarehouseQr).not.toHaveBeenCalled();
  });

  it('keeps Admin on the existing global part request list', async () => {
    auth.hasRole.mockReturnValue(false);
    api.getAll.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    expect(api.getAll).toHaveBeenCalledOnce();
    expect(api.getWarehouseTasks).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('faulty part board on the manager page', () => {
  const button = (wrapper: ReturnType<typeof mount>, label: string) => wrapper.findAll('button').find((b) => b.text().replace(/\s+/g, ' ').trim() === label);
  const line = (overrides: Record<string, unknown> = {}) => ({
    id: 'i-1', partRequestId: 'pr-w', partSource: 'fixhome', partNameSnapshot: 'Bo mạch', quantity: 2, unitPriceSnapshot: 400000,
    usageStatus: 'pending', faultyStatus: 'awaiting', faultyReceivedQty: 0, ...overrides,
  });
  const faulty = (items: unknown[] = [line()], overrides: Record<string, unknown> = {}) => warranty({
    status: 'received', faultyReturnDueAt: '2099-01-01T00:00:00Z', items, ...overrides,
  });
  const mountBoard = async (requests: unknown[]) => {
    api.getAll.mockResolvedValue({ data: requests, total: requests.length });
    const wrapper = mount(FaultyPartsBoard, { global: { stubs } });
    await flushPromises();
    return wrapper;
  };

  it('lists each request with how many units the warehouse counted in', async () => {
    const wrapper = await mountBoard([faulty([line({ faultyStatus: 'partial', faultyReceivedQty: 1 })])]);
    expect(text(wrapper)).toContain('Bo mạch × 2');
    expect(text(wrapper)).toContain('1/2');
    expect(text(wrapper)).toContain('Nhận thiếu');
  });

  it('counts units in per line and updates the row', async () => {
    const wrapper = await mountBoard([faulty()]);
    api.receiveFaultyParts.mockResolvedValueOnce(faulty([line({ faultyStatus: 'partial', faultyReceivedQty: 1 })]));

    await wrapper.get('li button').trigger('click');
    await button(wrapper, 'Xác nhận đã nhận')!.trigger('click');
    await wrapper.get('input[type="number"]').setValue('1');
    await button(wrapper, 'Xác nhận đã nhận 1')!.trigger('click');
    await flushPromises();

    expect(api.receiveFaultyParts).toHaveBeenCalledWith('pr-w', { items: [{ itemId: 'i-1', quantity: 1 }] });
    expect(text(wrapper)).toContain('Đã nhận 1/2');
  });

  it('sends only ticked, counted-in lines to the manufacturer, and a rejection needs a note and a photo', async () => {
    const received = line({ faultyStatus: 'received', faultyReceivedQty: 2 });
    api.getAll.mockResolvedValue({ data: [faulty([received])], total: 1 });
    const wrapper = mount(FaultyPartsBoard, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    api.sendFaultyToManufacturer.mockResolvedValueOnce(faulty([line({ faultyStatus: 'sent_to_manufacturer', faultyReceivedQty: 2 })]));

    await wrapper.get('li button').trigger('click');
    expect(button(wrapper, 'Gửi hãng')!.attributes('disabled')).toBeDefined();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button(wrapper, 'Gửi hãng')!.trigger('click');
    await flushPromises();
    const confirm = Array.from(document.body.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Gửi hãng').at(-1)!;
    confirm.click();
    await flushPromises();
    expect(api.sendFaultyToManufacturer).toHaveBeenCalledWith('pr-w', { itemIds: ['i-1'] });
    expect(text(wrapper)).toContain('Đã gửi hãng');
  });
});

describe('ManufacturerResultModal', () => {
  const items = [{ id: 'i-1', partNameSnapshot: 'Bo mạch', quantity: 2, unitPriceSnapshot: 400000, faultyReceivedQty: 2 }];
  const mountModal = () => mount(ManufacturerResultModal, { props: { request: warranty() as never, items: items as never }, global: { stubs } });

  it('shows who pays for each result and how much the technician loses on a rejection', async () => {
    const wrapper = mountModal();
    expect(text(wrapper)).toContain('hãng bảo hành');
    await wrapper.get('input[value="rejected"]').setValue();
    expect(text(wrapper)).toContain('Ví kỹ thuật viên sẽ bị trừ');
  });

  it('demands a note and a photo for a rejection before calling the server', async () => {
    const wrapper = mountModal();
    await wrapper.get('input[value="rejected"]').setValue();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    expect(api.recordFaultyResult).not.toHaveBeenCalled();
    expect(text(wrapper)).toContain('ít nhất một ảnh');
  });

  it('records an acceptance without a note', async () => {
    api.recordFaultyResult.mockResolvedValueOnce(warranty());
    const wrapper = mountModal();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    await flushPromises();
    expect(api.recordFaultyResult).toHaveBeenCalledWith('pr-w', { itemIds: ['i-1'], result: 'accepted' });
    expect(wrapper.emitted('done')).toHaveLength(1);
  });

  it('shows the server refusal and stays open', async () => {
    api.recordFaultyResult.mockRejectedValueOnce({ response: { data: { message: 'Đã có kết quả của hãng cho linh kiện này.' } } });
    const wrapper = mountModal();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    await flushPromises();
    expect(text(wrapper)).toContain('Đã có kết quả');
    expect(wrapper.emitted('done')).toBeUndefined();
  });
});

describe('warehouse handover on the manager page (BUG DETECTOR 83, 84, 85, 89, 90)', () => {
  const pickupRow = (allocation: Record<string, unknown> | undefined) => ({
    ...warranty({ id: 'pr-h', requestType: 'quotation', status: 'ready',
      items: [{ id: 'i-h', partRequestId: 'pr-h', partSource: 'fixhome', partNameSnapshot: 'Tụ quạt 2uF', quantity: 2, unitPriceSnapshot: 50000, usageStatus: 'pending' }] }),
    ...(allocation === undefined ? {} : { warehouseAllocation: allocation }),
  });
  const ready = { partRequestId: 'pr-h', mode: 'warehouse', status: 'ready', warehouseId: 'wh-1', warehouseName: 'Kho Quận 1', responsibleUserId: 'sm-1' };
  // jsdom has no canvas; the page's QR drawing is replaced so the flow can be clicked through.
  let draw: { mockRejectedValueOnce: (error: Error) => unknown; mockRestore: () => void };
  beforeEach(async () => {
    const QRCode = (await import('qrcode')).default as unknown as { toDataURL: (...args: unknown[]) => Promise<string> };
    draw = vi.spyOn(QRCode, 'toDataURL').mockResolvedValue('data:image/png;base64,AA==') as never;
  });
  afterEach(() => draw.mockRestore());
  const openDialog = async () => {
    api.getWarehouseTasks.mockResolvedValue({ data: [pickupRow(ready)], total: 1, statusCounts: { ready: 1 } });
    api.prepareWarehouseQr.mockResolvedValue({ allocation: ready, qrToken: 'pickup-1' });
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs: { ...stubs, teleport: true } } });
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Chuẩn bị mã kho')!.trigger('click');
    await flushPromises();
    await wrapper.findAll('button').find((b) => b.text() === 'Xác nhận đã giao trực tiếp')!.trigger('click');
    await flushPromises();
    return wrapper;
  };
  const confirm = async (wrapper: ReturnType<typeof mount>) => {
    await wrapper.findAll('button').find((b) => b.text() === 'Đã giao thực tế')!.trigger('click');
    await flushPromises();
  };

  it('uses the allocation sent with the queue and the server status totals', async () => {
    api.getWarehouseTasks.mockResolvedValue({ data: [pickupRow(ready)], total: 31, statusCounts: { requested: 12, ready: 7, completed: 9 } });
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs: { ...stubs, teleport: true } } });
    await flushPromises();
    expect(api.getWarehouseAllocation).not.toHaveBeenCalled();
    const tiles = text(wrapper);
    expect(tiles).toMatch(/Chờ chuẩn bị\s*12/);
    expect(tiles).toMatch(/Sẵn sàng\s*7/);
    expect(tiles).toMatch(/Hoàn tất\s*9/);
  });

  it('shows what is handed over in a plain, not destructive, dialog', async () => {
    const wrapper = await openDialog();
    const summary = wrapper.get('[data-testid="handover-summary"]').text().replace(/\s+/g, ' ');
    expect(summary).toContain('PR-PR-H');
    expect(summary).toContain('Kho Quận 1');
    expect(summary).toContain('Tụ quạt 2uF');
    expect(summary).toContain('x 2');
    const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'Đã giao thực tế')!;
    expect(confirmButton.classes().join(' ')).not.toMatch(/danger/);
  });

  it('reports a saved handover as done even when drawing the QR fails', async () => {
    const wrapper = await openDialog();
    draw.mockRejectedValueOnce(new Error('canvas unavailable'));
    api.confirmWarehouseHandover.mockResolvedValue({ allocation: { ...ready, status: 'handed_over' }, qrToken: 'receipt-1' });
    await confirm(wrapper);
    expect(text(wrapper)).toContain('Đã xác nhận bàn giao thực tế');
    expect(text(wrapper)).not.toContain('Chưa xác nhận được bàn giao');
    expect(text(wrapper)).toContain('receipt-1');
    expect(wrapper.text()).not.toContain('Xác nhận đã giao linh kiện cho kỹ thuật viên?');
  });

  it('after a lost answer, reads the warehouse back and says the parts are already handed over', async () => {
    const wrapper = await openDialog();
    api.confirmWarehouseHandover.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
    api.getWarehouseAllocation.mockResolvedValue({ ...ready, status: 'handed_over' });
    await confirm(wrapper);
    expect(api.getWarehouseAllocation).toHaveBeenCalledWith('pr-h');
    expect(text(wrapper)).toContain('Kho đã ghi nhận bàn giao trước đó');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Xác nhận đã giao trực tiếp')).toBe(false);
  });

  it('after a refusal with nothing handed over, says the stock was not issued', async () => {
    const wrapper = await openDialog();
    api.confirmWarehouseHandover.mockRejectedValue(new Error('409'));
    api.getWarehouseAllocation.mockResolvedValue(ready);
    await confirm(wrapper);
    expect(text(wrapper)).toContain('Linh kiện chưa được xuất kho');
  });
});
