import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
enableAutoUnmount(afterEach);

// SM 46 (F11/F12): the server's answer decides what the manager sees; drawing the QR image
// or losing the answer never makes the page report the wrong thing or send the command twice.
const { api, auth, qr } = vi.hoisted(() => ({
  api: {
    getAll: vi.fn(), getWarehouseTasks: vi.fn(), getWarehouseAllocation: vi.fn(), getPendingReturns: vi.fn(), getLegacyManualReview: vi.fn(), getReturnsByOrderId: vi.fn(),
    markReady: vi.fn(), prepareWarehouseQr: vi.fn(), confirmWarehouseHandover: vi.fn(),
  },
  auth: { hasRole: vi.fn(() => true), user: { id: 'sm-1' }, userRole: 'SERVICE_MANAGER' },
  qr: { toDataURL: vi.fn() },
}));
vi.mock('qrcode', () => ({ default: qr }));
vi.mock('../src/api/part-requests.api', async (original) => ({ ...await original<typeof import('../src/api/part-requests.api')>(), partRequestsApi: api }));
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi: { getCatalog: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('../src/api/media.api', () => ({ mediaApi: { upload: vi.fn() }, ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg'], MAX_MEDIA_SIZE_BYTES: 10_000_000 }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../src/services/live-updates', () => ({
  onOrderChange: () => () => undefined, whileOffline: () => () => undefined, onResync: () => () => undefined,
}));
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: { subscribe: () => () => undefined } }));

import ConsolePartRequestsPage from '../src/pages/console/ConsolePartRequestsPage.vue';

const request = {
  id: 'pr-qr', serviceOrderId: 'so-1', technicianId: 't1', requestType: 'pre_repair', fulfillmentMethod: 'pickup',
  status: 'requested', shippingFee: 0, createdAt: '2026-11-12T08:00:00Z', updatedAt: '2026-11-12T08:00:00Z',
  items: [{ id: 'i-1', partRequestId: 'pr-qr', partSource: 'fixhome', partNameSnapshot: 'Tụ quạt', quantity: 1, unitPriceSnapshot: 50000, usageStatus: 'pending' }],
};
const reserved = { partRequestId: 'pr-qr', mode: 'warehouse', status: 'reserved', warehouseId: 'wh-1', warehouseName: 'Kho 1', responsibleUserId: 'sm-1', tokenVersion: 0 };
const stubs = {
  FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
};
const text = (w: { text: () => string }) => w.text().replace(/\s+/g, ' ');
const click = async (wrapper: ReturnType<typeof mount>, label: string) => {
  await wrapper.findAll('button').find((b) => b.text() === label)!.trigger('click');
  await flushPromises();
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  qr.toDataURL.mockReset();
  qr.toDataURL.mockResolvedValue('data:image/png;base64,AAAA');
  api.getWarehouseTasks.mockResolvedValue({ data: [{ ...request, warehouseAllocation: reserved }], total: 1 });
  api.getWarehouseAllocation.mockResolvedValue(reserved);
  api.getPendingReturns.mockResolvedValue([]);
  api.getLegacyManualReview.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
  api.getReturnsByOrderId.mockResolvedValue([]);
});

describe('warehouse code preparation follows the server answer', () => {
  it('keeps an issued code on screen with a copy button when the QR image cannot be drawn', async () => {
    api.prepareWarehouseQr.mockResolvedValue({ allocation: { ...reserved, status: 'ready', tokenVersion: 1 }, qrToken: 'pickup-code-1' });
    qr.toDataURL.mockRejectedValue(new Error('canvas unavailable'));
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    await click(wrapper, 'Chuẩn bị mã kho');

    expect(api.prepareWarehouseQr).toHaveBeenCalledTimes(1);
    expect(text(wrapper)).toContain('pickup-code-1');
    expect(text(wrapper)).toContain('Mã lấy hàng một lần');
    expect(text(wrapper)).not.toContain('Chưa tạo được mã QR');
    expect(wrapper.find('img[alt="QR lấy hàng dùng một lần"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="copy-pickup-code"]').exists()).toBe(true);
    expect(wrapper.findAll('button').some((b) => b.text() === 'Xác nhận đã giao trực tiếp')).toBe(true);
  });

  it('draws the QR image when it can', async () => {
    api.prepareWarehouseQr.mockResolvedValue({ allocation: { ...reserved, status: 'ready', tokenVersion: 1 }, qrToken: 'pickup-code-2' });
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    await click(wrapper, 'Chuẩn bị mã kho');
    expect(wrapper.get('img[alt="QR lấy hàng dùng một lần"]').attributes('src')).toBe('data:image/png;base64,AAAA');
  });

  it('reads the state back after a lost answer and does not send the command again', async () => {
    api.prepareWarehouseQr.mockRejectedValue(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }));
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    api.getWarehouseAllocation.mockClear();
    api.getWarehouseAllocation.mockResolvedValue({ ...reserved, status: 'ready', tokenVersion: 1 });
    await click(wrapper, 'Chuẩn bị mã kho');

    expect(api.prepareWarehouseQr).toHaveBeenCalledTimes(1);
    expect(api.getWarehouseAllocation).toHaveBeenCalledTimes(1);
    expect(text(wrapper)).toContain('Kho đã tạo mã mới nhưng câu trả lời không về tới trình duyệt');
    expect(text(wrapper)).not.toContain('Chưa tạo được mã QR');
  });

  it('says nothing was made when the server state did not change', async () => {
    api.prepareWarehouseQr.mockRejectedValue(new Error('Network Error'));
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    api.getWarehouseAllocation.mockResolvedValue(reserved);
    await click(wrapper, 'Chuẩn bị mã kho');

    expect(api.prepareWarehouseQr).toHaveBeenCalledTimes(1);
    expect(text(wrapper)).toContain('Chưa tạo được mã QR lấy hàng');
    expect(text(wrapper)).not.toContain('Kho đã tạo mã mới');
  });

  it('reports the refusal when the state cannot be read back either', async () => {
    api.prepareWarehouseQr.mockRejectedValue(new Error('Network Error'));
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs } });
    await flushPromises();
    api.getWarehouseAllocation.mockRejectedValue(new Error('Network Error'));
    await click(wrapper, 'Chuẩn bị mã kho');

    expect(api.prepareWarehouseQr).toHaveBeenCalledTimes(1);
    expect(text(wrapper)).toContain('Chưa tạo được mã QR lấy hàng');
  });
});
