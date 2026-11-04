import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
enableAutoUnmount(afterEach);

const { api, auth } = vi.hoisted(() => ({
  api: {
    getAll: vi.fn(), getWarehouseAllocation: vi.fn(), getPendingReturns: vi.fn(), getLegacyManualReview: vi.fn(), getReturnsByOrderId: vi.fn(),
    markReady: vi.fn(), recordFaultyInspection: vi.fn(),
  },
  auth: { hasRole: vi.fn(() => true) },
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
  api.getWarehouseAllocation.mockResolvedValue({ partRequestId: 'pr-w', mode: 'legacy', status: null });
  api.getPendingReturns.mockResolvedValue([]);
  api.getLegacyManualReview.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
  api.getReturnsByOrderId.mockResolvedValue([]);
});

describe('faulty part inspection on the manager page', () => {
  const mountPage = async (requests: unknown[]) => {
    api.getAll.mockResolvedValue({ data: requests, total: requests.length });
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
