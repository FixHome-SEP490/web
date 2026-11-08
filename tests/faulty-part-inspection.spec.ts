import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
enableAutoUnmount(afterEach);

const { api, auth } = vi.hoisted(() => ({
  api: {
    getAll: vi.fn(), getWarehouseTasks: vi.fn(), getWarehouseAllocation: vi.fn(), getPendingReturns: vi.fn(), getLegacyManualReview: vi.fn(), getReturnsByOrderId: vi.fn(),
    markReady: vi.fn(), recordFaultyInspection: vi.fn(), prepareWarehouseQr: vi.fn(), confirmWarehouseHandover: vi.fn(),
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
import FaultyPartInspectionModal from '../src/components/console/FaultyPartInspectionModal.vue';

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

  it('asks for the inspection instead of offering READY until the faulty part was looked at', async () => {
    const wrapper = await mountPage([warranty()]);
    expect(button(wrapper, 'Kiểm tra linh kiện hỏng')).toBeTruthy();
    expect(button(wrapper, 'Chuẩn bị xong')).toBeUndefined();
    expect(text(wrapper)).toContain('Bảo hành');
  });

  it('offers READY once inspected, and an ordinary request is unaffected', async () => {
    const wrapper = await mountPage([
      warranty({ id: 'a', faultyInspectionResult: 'manufacturer' }),
      { ...warranty({ id: 'b' }), requestType: 'additional' },
    ]);
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Chuẩn bị xong')).toHaveLength(2);
    expect(button(wrapper, 'Kiểm tra linh kiện hỏng')).toBeUndefined();
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
    expect(wrapper.get('table').text()).toContain('Chuẩn bị mã kho');
    expect(wrapper.text()).toContain('Khoảng cách đường thẳng ước tính từ vị trí đặt lịch: ~1.4 km; chưa xác minh đường đi/ETA');
    expect(wrapper.findAll('button').some((button) => button.text() === 'Chuẩn bị xong')).toBe(false);

    await wrapper.findAll('button').find((button) => button.text() === 'Chuẩn bị mã kho')!.trigger('click');
    await flushPromises();
    expect(api.prepareWarehouseQr).toHaveBeenCalledWith(request.id, expect.objectContaining({ idempotencyKey: expect.any(String) }));
    const inlineHandover = wrapper.get('table').findAll('button').find((button) => button.text() === 'Xác nhận đã giao trực tiếp');
    expect(inlineHandover).toBeTruthy();
    expect(api.markReady).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Mã lấy hàng một lần · hết hạn trong 15 phút');
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

  it('keeps Admin on the existing global part request list', async () => {
    auth.hasRole.mockReturnValue(false);
    api.getAll.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    expect(api.getAll).toHaveBeenCalledOnce();
    expect(api.getWarehouseTasks).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('saves the result from the modal and then offers READY for that request', async () => {
    const wrapper = await mountPage([warranty()]);
    api.recordFaultyInspection.mockResolvedValueOnce(warranty({ faultyInspectionResult: 'undetermined' }));

    await button(wrapper, 'Kiểm tra linh kiện hỏng')!.trigger('click');
    await wrapper.get('input[value="undetermined"]').setValue();
    await button(wrapper, 'Lưu kết quả')!.trigger('click');
    await flushPromises();

    expect(api.recordFaultyInspection).toHaveBeenCalledWith('pr-w', { result: 'undetermined' });
    expect(button(wrapper, 'Chuẩn bị xong')).toBeTruthy();
    expect(button(wrapper, 'Kiểm tra linh kiện hỏng')).toBeUndefined();
  });
});

describe('FaultyPartInspectionModal', () => {
  const mountModal = (request = warranty()) => mount(FaultyPartInspectionModal, { props: { request: request as never } });

  it('shows who pays for each result', () => {
    const wrapper = mountModal();
    expect(text(wrapper)).toContain('FixHome chịu; giữ linh kiện để đổi trả nhà cung cấp');
    expect(text(wrapper)).toContain('Thợ trả tiền linh kiện mới theo giá bán');
  });

  it('demands a note and a photo for an installation fault before calling the server', async () => {
    const wrapper = mountModal();
    await wrapper.get('input[value="installation"]').setValue();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    expect(api.recordFaultyInspection).not.toHaveBeenCalled();
    expect(text(wrapper)).toContain('ít nhất một ảnh');

    await wrapper.get('#faulty-note').setValue('Đấu sai cực dây nguồn, chân cắm cháy.');
    await wrapper.findAll('button').at(-1)!.trigger('click');
    expect(api.recordFaultyInspection).not.toHaveBeenCalled();
  });

  it('shows the server refusal and stays open', async () => {
    api.recordFaultyInspection.mockRejectedValueOnce({ response: { data: { message: 'Kỹ thuật viên đã nhận linh kiện nên không đổi được kết quả kiểm tra.' } } });
    const wrapper = mountModal();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    await flushPromises();
    expect(text(wrapper)).toContain('đã nhận linh kiện');
    expect(wrapper.emitted('done')).toBeUndefined();
  });

  it('starts from the saved result when correcting it', () => {
    const wrapper = mountModal(warranty({ faultyInspectionResult: 'installation', faultyInspectionNote: 'Đấu sai cực dây nguồn.' }) as never);
    expect((wrapper.get('input[value="installation"]').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.get('#faulty-note').element as HTMLTextAreaElement).value).toBe('Đấu sai cực dây nguồn.');
  });
});
