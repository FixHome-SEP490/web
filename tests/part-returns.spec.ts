import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { partRequestsApi, partsCatalogApi, apiClientMock, auth } = vi.hoisted(() => ({
  partRequestsApi: {
    getByOrderId: vi.fn(),
    createPreRepair: vi.fn(),
    receiveByQr: vi.fn(),
    updateItemUsage: vi.fn(),
    getAll: vi.fn(),
    getReturnsByOrderId: vi.fn(),
    getPendingReturns: vi.fn(),
    getLegacyManualReview: vi.fn(),
    declareReturn: vi.fn(),
    acceptReturn: vi.fn(),
  },
  partsCatalogApi: { getCatalog: vi.fn() },
  apiClientMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  auth: { hasRole: vi.fn(() => true) },
}));

// Real helpers (idempotency key, unavailable-error mapping) with a mocked transport.
vi.mock('../src/api/part-requests.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/part-requests.api')>();
  return { ...actual, partRequestsApi };
});
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi }));
vi.mock('../src/api/client', () => ({
  default: apiClientMock,
  getHttpStatus: (err: unknown) =>
    (err as { response?: { status?: number } } | null)?.response?.status,
}));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => auth }));

import TechnicianPartsSection from '../src/components/TechnicianPartsSection.vue';
import ConsolePartRequestsPage from '../src/pages/console/ConsolePartRequestsPage.vue';
import ConsolePartReturnsPage from '../src/pages/console/ConsolePartReturnsPage.vue';
import { createIdempotencyKey } from '../src/api/part-requests.api';

const loadActualApi = () =>
  vi.importActual<typeof import('../src/api/part-requests.api')>('../src/api/part-requests.api');

const stubs = {
  FhButton: { template: '<button><slot /></button>' },
  FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' },
};

const normalized = (wrapper: { text: () => string }) => wrapper.text().replace(/\s+/g, ' ');

const partRequest = (status: string, usageStatus = 'pending') => ({
  id: 'pr-1',
  serviceOrderId: 'so-1',
  technicianId: 't-1',
  requestType: 'pre_repair',
  fulfillmentMethod: 'pickup',
  status,
  shippingFee: 0,
  createdAt: '2026-10-09T03:00:00Z',
  updatedAt: '2026-10-09T03:00:00Z',
  items: [
    {
      id: 'i-1',
      partRequestId: 'pr-1',
      partSource: 'fixhome',
      partNameSnapshot: 'Van xả',
      quantity: 3,
      unitPriceSnapshot: 50000,
      usageStatus,
      createdAt: '',
      updatedAt: '',
    },
  ],
});

const returnRecord = (overrides: Record<string, unknown> = {}) => ({
  partRequestId: 'pr-1',
  partRequestItemId: 'i-1',
  partNameSnapshot: 'Van xả',
  issuedQty: 3,
  usedQty: 1,
  declaredQty: 0,
  managerAcceptedQty: 0,
  outstandingQty: 2,
  version: 4,
  ...overrides,
});

const legacyRecord = (overrides: Record<string, unknown> = {}) => ({
  kind: 'legacy_manual_review',
  receiptState: 'UNKNOWN',
  orderId: '11111111-1111-4111-8111-111111111111',
  partRequestId: '22222222-2222-4222-8222-222222222222',
  partRequestItemId: '33333333-3333-4333-8333-333333333333',
  technicianId: '44444444-4444-4444-8444-444444444444',
  requestType: 'pre_repair',
  requestStatus: 'received',
  handedOverAt: '2026-10-01T03:00:00.000Z',
  partCatalogId: '55555555-5555-4555-8555-555555555555',
  partNameSnapshot: 'Van xả cũ',
  issuedQty: 2,
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.hasRole.mockReturnValue(true);
  partsCatalogApi.getCatalog.mockResolvedValue({ data: [] });
  partRequestsApi.getByOrderId.mockResolvedValue([]);
  partRequestsApi.getReturnsByOrderId.mockResolvedValue([]);
  partRequestsApi.getPendingReturns.mockResolvedValue([]);
  partRequestsApi.getLegacyManualReview.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });
  partRequestsApi.getAll.mockResolvedValue({ data: [], total: 0 });
});

describe('Technician khai trả linh kiện (P1 custody)', () => {
  it('shows issued / used / still-to-return and declares a return that waits for the manager', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([returnRecord()])
      .mockResolvedValueOnce([returnRecord({ declaredQty: 2, version: 5 })]);
    partRequestsApi.declareReturn.mockResolvedValue(null);

    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' },
      global: { stubs },
    });
    await flushPromises();

    expect(normalized(wrapper)).toContain('Cấp 3 · Dùng 1 · Cần trả kho 2');

    await wrapper.get('[data-testid="open-declare-return"]').trigger('click');
    await wrapper.get('input[type="number"]').setValue('2');
    await wrapper.get('[data-testid="submit-declare-return"]').trigger('click');
    await flushPromises();

    expect(partRequestsApi.declareReturn).toHaveBeenCalledTimes(1);
    const [, , payload] = partRequestsApi.declareReturn.mock.calls[0];
    expect(payload.quantity).toBe(2);
    expect(payload.expectedVersion).toBe(4);
    expect(payload.idempotencyKey).toMatch(/^declare-[A-Za-z0-9._:-]{8,128}$/);

    // A declaration is never a completed return: the manager still has to accept it.
    const text = normalized(wrapper);
    expect(text).toContain('Đang chờ quản lý xác nhận');
    expect(text).toContain('Đã gửi khai trả linh kiện');
    expect(text).not.toContain('Đã hoàn trả');
    expect(text.toLowerCase()).not.toContain('đã thanh toán');
    wrapper.unmount();
  });

  it('never lets a double click send the declaration twice', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId.mockResolvedValue([returnRecord()]);
    const pending = deferred<{ data: { data: null } }>();
    partRequestsApi.declareReturn.mockReturnValue(pending.promise);

    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' },
      global: { stubs },
    });
    await flushPromises();

    await wrapper.get('[data-testid="open-declare-return"]').trigger('click');
    await wrapper.get('input[type="number"]').setValue('1');
    const submit = wrapper.get('[data-testid="submit-declare-return"]');
    await submit.trigger('click');
    await submit.trigger('click');

    expect(partRequestsApi.declareReturn).toHaveBeenCalledTimes(1);

    pending.resolve({ data: { data: null } });
    await flushPromises();
    wrapper.unmount();
  });

  it('offers only the quantity not declared yet', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId.mockResolvedValue([
      returnRecord({ declaredQty: 2, outstandingQty: 2 }),
    ]);

    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' },
      global: { stubs },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(false);
    expect(normalized(wrapper)).toContain('Đang chờ quản lý xác nhận');
    wrapper.unmount();
  });

  it.each([1, 2])('refreshes the open declaration after 409 and permits an explicit retry (draft %i)', async (draftQty) => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([returnRecord()])
      .mockResolvedValue([returnRecord({ usedQty: 2, outstandingQty: 1, version: 5 })]);
    partRequestsApi.declareReturn
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValue(null);
    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs },
    });
    await flushPromises();

    await wrapper.get('[data-testid="open-declare-return"]').trigger('click');
    await wrapper.get('input[type="number"]').setValue(draftQty);
    await wrapper.get('[data-testid="submit-declare-return"]').trigger('click');
    await flushPromises();

    expect(partRequestsApi.declareReturn).toHaveBeenCalledTimes(1);
    expect(wrapper.get('input[type="number"]').attributes('max')).toBe('1');
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe(String(draftQty));
    if (draftQty > 1) {
      expect(wrapper.get('[data-testid="submit-declare-return"]').attributes('disabled')).toBeDefined();
      await wrapper.get('input[type="number"]').setValue(1);
    }
    await wrapper.get('[data-testid="submit-declare-return"]').trigger('click');
    await flushPromises();

    expect(partRequestsApi.declareReturn).toHaveBeenCalledTimes(2);
    expect(partRequestsApi.declareReturn.mock.calls[1]).toEqual([
      'pr-1', 'i-1', expect.objectContaining({ quantity: 1, expectedVersion: 5 }),
    ]);
    expect(normalized(wrapper)).toContain('Đã gửi khai trả linh kiện');
    wrapper.unmount();
  });

  it('removes the stale declaration form when a 409 refresh leaves nothing to declare', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([returnRecord()])
      .mockResolvedValue([returnRecord({ declaredQty: 2, version: 5 })]);
    partRequestsApi.declareReturn.mockRejectedValueOnce({ response: { status: 409 } });
    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs },
    });
    await flushPromises();
    await wrapper.get('[data-testid="open-declare-return"]').trigger('click');
    await wrapper.get('[data-testid="submit-declare-return"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="submit-declare-return"]').exists()).toBe(false);
    expect(normalized(wrapper)).toContain('Đang chờ quản lý xác nhận');
    expect(partRequestsApi.declareReturn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('prevents a stale declaration retry when the 409 refresh fails', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([returnRecord()])
      .mockRejectedValue(new Error('network unavailable'));
    partRequestsApi.declareReturn.mockRejectedValueOnce({ response: { status: 409 } });
    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs },
    });
    await flushPromises();
    await wrapper.get('[data-testid="open-declare-return"]').trigger('click');
    await wrapper.get('[data-testid="submit-declare-return"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="submit-declare-return"]').exists()).toBe(false);
    expect(normalized(wrapper)).toContain('Chưa tải được thông tin hoàn trả linh kiện.');
    expect(partRequestsApi.declareReturn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('hides the return UI when the feature is off (404) and keeps usage working', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId.mockRejectedValue({ response: { status: 404 } });

    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' },
      global: { stubs },
    });
    await flushPromises();

    const text = normalized(wrapper);
    expect(text).toContain('Van xả');
    expect(text).toContain('Đã dùng');
    expect(text).not.toContain('Khai trả');
    expect(text).not.toContain('Chưa tải được thông tin hoàn trả linh kiện.');
    wrapper.unmount();
  });

  it('keeps the QR handover action when the feature is off (404)', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('ready')]);
    partRequestsApi.getReturnsByOrderId.mockRejectedValue({ response: { status: 404 } });

    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'EN_ROUTE' },
      global: { stubs },
    });
    await flushPromises();

    expect(normalized(wrapper)).toContain('Nhập mã bàn giao');
    wrapper.unmount();
  });

  it('shows a retry line on a real load failure without blocking the parts list', async () => {
    partRequestsApi.getByOrderId.mockResolvedValue([partRequest('received', 'returned')]);
    partRequestsApi.getReturnsByOrderId.mockRejectedValue(new Error('mạng lỗi'));

    const wrapper = mount(TechnicianPartsSection, {
      props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' },
      global: { stubs },
    });
    await flushPromises();

    const text = normalized(wrapper);
    expect(text).toContain('Chưa tải được thông tin hoàn trả linh kiện.');
    expect(text).toContain('Van xả');
    wrapper.unmount();
  });
});

describe('Service Manager nhận hoàn trả (P1 custody)', () => {
  it('loads the pending queue with declared numbers and the maximum accepted quantity', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const text = normalized(wrapper);
    expect(text).toContain('Chờ nhận linh kiện hoàn trả');
    expect(text).toContain('Van xả');
    expect(text).toContain('Cấp 3 · Dùng 1 · Khai trả 2 · Đã nhận 0');
    expect(text).toContain('tối đa 2');
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe('2');
    expect(wrapper.get('[data-testid="accept-return"]').text()).toBe('Xác nhận đã nhận');
    expect(wrapper.get('[data-testid="accept-return"]').attributes('aria-label')).toBe('Xác nhận đã nhận Van xả');
    const quantity = wrapper.get('input[type="number"]');
    const hintId = quantity.attributes('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(wrapper.findAll('[id]').find(node => node.attributes('id') === hintId)?.text()).toContain('tối đa 2');
    wrapper.unmount();
  });

  it('accepts a partial quantity, keeps the remainder pending and never claims payment', async () => {
    partRequestsApi.getPendingReturns
      .mockResolvedValueOnce([returnRecord({ declaredQty: 2 })])
      .mockResolvedValueOnce([returnRecord({ declaredQty: 2, managerAcceptedQty: 1, version: 5 })]);
    partRequestsApi.acceptReturn.mockResolvedValue(null);

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    await wrapper.get('input[type="number"]').setValue('1');
    await wrapper.get('[data-testid="accept-return"]').trigger('click');
    await flushPromises();

    expect(partRequestsApi.acceptReturn).toHaveBeenCalledTimes(1);
    const [requestId, itemId, payload] = partRequestsApi.acceptReturn.mock.calls[0];
    expect(requestId).toBe('pr-1');
    expect(itemId).toBe('i-1');
    expect(payload.quantity).toBe(1);
    expect(payload.expectedVersion).toBe(4);
    expect(payload.idempotencyKey).toMatch(/^accept-[A-Za-z0-9._:-]{8,128}$/);

    // The queue is re-read and the remainder is still waiting.
    expect(partRequestsApi.getPendingReturns).toHaveBeenCalledTimes(2);
    const text = normalized(wrapper);
    expect(text).toContain('Phần còn lại vẫn chờ nhận.');
    expect(text).toContain('Khai trả 2 · Đã nhận 1');
    expect(text.toLowerCase()).not.toContain('đã thanh toán');
    wrapper.unmount();
  });

  it('prevents a double submit while the acceptance is in flight', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);
    const pending = deferred<null>();
    partRequestsApi.acceptReturn.mockReturnValue(pending.promise);

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    const button = wrapper.get('[data-testid="accept-return"]');
    await button.trigger('click');
    await button.trigger('click');

    expect(partRequestsApi.acceptReturn).toHaveBeenCalledTimes(1);

    pending.resolve(null);
    await flushPromises();
    wrapper.unmount();
  });

  it('rejects a non-positive or too large accepted quantity without calling the API', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    await wrapper.get('input[type="number"]').setValue('9');
    await wrapper.get('[data-testid="accept-return"]').trigger('click');
    await flushPromises();

    expect(partRequestsApi.acceptReturn).not.toHaveBeenCalled();
    expect(normalized(wrapper)).toContain('từ 1 đến 2');
    wrapper.unmount();
  });

  it('hides the whole return section when the backend has not enabled the feature (404)', async () => {
    partRequestsApi.getPendingReturns.mockRejectedValue({ response: { status: 404 } });

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="part-returns-queue"]').exists()).toBe(false);
    expect(normalized(wrapper)).not.toContain('Chưa tải được danh sách chờ nhận.');
    wrapper.unmount();
    // The existing requests page still works, without a link to returns.
    const requests = mount(ConsolePartRequestsPage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    expect(normalized(requests)).toContain('Không có yêu cầu linh kiện nào phù hợp.');
    expect(requests.find('[data-testid="part-returns-link"]').exists()).toBe(false);
    requests.unmount();
  });

  it('shows a retry line on a real failure and recovers when retried', async () => {
    partRequestsApi.getPendingReturns
      .mockRejectedValueOnce(new Error('mạng lỗi'))
      .mockResolvedValueOnce([returnRecord({ declaredQty: 2 })]);

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(normalized(wrapper)).toContain('Chưa tải được danh sách chờ nhận.');
    // The retry button is the one inside the returns section.
    const retry = wrapper.findAll('button').find((btn) => btn.text() === 'Thử lại');
    expect(retry).toBeTruthy();
    await retry!.trigger('click');
    await flushPromises();

    expect(normalized(wrapper)).toContain('Van xả');
    expect(partRequestsApi.getPendingReturns).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('shows the queue read-only when the account cannot operate', async () => {
    auth.hasRole.mockReturnValue(false);
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);

    const wrapper = mount(ConsolePartReturnsPage, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    await flushPromises();

    expect(normalized(wrapper)).toContain('Van xả');
    expect(wrapper.find('[data-testid="accept-return"]').exists()).toBe(false);
    expect(normalized(wrapper)).toContain('Chỉ quản lý dịch vụ xác nhận được số linh kiện đã nhận.');
    wrapper.unmount();
  });
});

describe('part-requests.api P1 return contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats 503 pending activation as unavailable without hiding actual network errors', async () => {
    const { isPartReturnsUnavailableError } = await loadActualApi();
    expect(isPartReturnsUnavailableError({ response: { status: 503 } })).toBe(true);
    expect(isPartReturnsUnavailableError({ response: { status: 500 } })).toBe(false);
  });

  it('GET /part-returns/pending maps the list and tolerates an empty envelope', async () => {
    const { partRequestsApi: api } = await loadActualApi();
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [returnRecord({ declaredQty: 2 })] } });
    const rows = await api.getPendingReturns();
    expect(apiClientMock.get).toHaveBeenCalledWith('/part-returns/pending');
    expect(rows).toHaveLength(1);
    expect(rows[0].outstandingQty).toBe(2);

    apiClientMock.get.mockResolvedValueOnce({ data: {} });
    await expect(api.getPendingReturns()).resolves.toEqual([]);
  });

  it('GET /service-orders/:id/part-returns maps the order custody list', async () => {
    const { partRequestsApi: api } = await loadActualApi();
    apiClientMock.get.mockResolvedValueOnce({ data: { data: [returnRecord()] } });
    const rows = await api.getReturnsByOrderId('so-1');
    expect(apiClientMock.get).toHaveBeenCalledWith('/service-orders/so-1/part-returns');
    expect(rows[0].partRequestItemId).toBe('i-1');
  });

  it('POST declare-return and accept-return send quantity, expectedVersion and idempotencyKey', async () => {
    const { partRequestsApi: api } = await loadActualApi();
    apiClientMock.post.mockResolvedValue({ data: { data: null } });

    await api.declareReturn('pr-1', 'i-1', {
      quantity: 2,
      expectedVersion: 4,
      idempotencyKey: 'declare-test-key',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/part-requests/pr-1/items/i-1/declare-return', {
      quantity: 2,
      expectedVersion: 4,
      idempotencyKey: 'declare-test-key',
    });

    await api.acceptReturn('pr-1', 'i-1', {
      quantity: 1,
      expectedVersion: 5,
      idempotencyKey: 'accept-test-key',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/part-requests/pr-1/items/i-1/accept-return', {
      quantity: 1,
      expectedVersion: 5,
      idempotencyKey: 'accept-test-key',
    });
  });

  it('creates unique idempotency keys the backend accepts', () => {
    const first = createIdempotencyKey('declare');
    const second = createIdempotencyKey('declare');
    expect(first).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(second).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(first).not.toBe(second);
  });
});

describe('Hoàn trả linh kiện (BUG DETECTOR 10)', () => {
  it('gives a receive form only to what technicians declared and the manager has not received, one card per part request', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([
      returnRecord({ partRequestItemId: 'i-1', declaredQty: 2 }),
      returnRecord({ partRequestItemId: 'i-2', partNameSnapshot: 'Tụ điện', declaredQty: 0 }),
      returnRecord({ partRequestItemId: 'i-3', partNameSnapshot: 'Dây nguồn', declaredQty: 1, managerAcceptedQty: 1, outstandingQty: 1 }),
    ]);
    const wrapper = mount(ConsolePartReturnsPage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    const text = normalized(wrapper);
    expect(text).toContain('Van xả');
    expect(text).not.toContain('tối đa 0');
    expect(wrapper.findAll('[data-testid="part-return-group"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="accept-return"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="part-returns-count"]').text()).toBe('1');
    // Parts still held without a declaration are listed to follow up, never with a receive form.
    const held = wrapper.get('[data-testid="part-returns-held"]').text();
    expect(held).toContain('Tụ điện');
    expect(held).toContain('Dây nguồn');
    expect(held).toContain('Còn giữ 1');
    wrapper.unmount();
  });

  it('points the part requests page at the returns waiting to be received', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 }), returnRecord({ partRequestItemId: 'i-2', declaredQty: 0 })]);
    const wrapper = mount(ConsolePartRequestsPage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await flushPromises();
    expect(wrapper.get('[data-testid="part-returns-link"]').text()).toContain('1 dòng linh kiện đã khai trả đang chờ nhận');
    expect(wrapper.find('[data-testid="part-returns-queue"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Linh kiện lịch sử cần xác minh (T3c, SM-only)', () => {
  const mountReturns = (routerLink = { template: '<a><slot /></a>' }) =>
    mount(ConsolePartReturnsPage, { global: { stubs: { RouterLink: routerLink } } });

  it('shows a separate legacy group with the unknown state and no accepted/remaining quantities', async () => {
    const legacy = legacyRecord();
    partRequestsApi.getLegacyManualReview.mockResolvedValue({ data: [legacy], total: 1, page: 1, pageSize: 20 });

    const wrapper = mountReturns({ props: ['to'], template: '<a :href="to"><slot /></a>' });
    await flushPromises();

    const group = wrapper.get('[data-testid="legacy-part-returns"]');
    const text = normalized(group);
    expect(text).toContain('Linh kiện lịch sử cần xác minh');
    expect(text).toContain('Chưa có chứng từ custody');
    expect(text).toContain('xác minh thủ công');
    expect(text).toContain('Van xả cũ');
    expect(group.get('[data-testid="legacy-receipt-state"]').text()).toBe('Chưa xác định (UNKNOWN)');

    const row = group.get('[data-testid="legacy-part-return"]');
    expect(normalized(row)).toContain('Số lượng đã cấp theo lịch sử');
    expect(row.get('[data-testid="legacy-issued-qty"]').text()).toBe('2');
    expect(row.get('a').attributes('href')).toBe(`/console/orders/${legacy.orderId}`);
    expect(normalized(row)).toContain('PR-22222222');
    // Legacy rows are evidence to review by hand: no return, acceptance or discrepancy command.
    expect(normalized(row)).not.toContain('Đã nhận');
    expect(normalized(row)).not.toContain('Khai trả');
    expect(normalized(row)).not.toContain('Còn lại');
    expect(row.find('[data-testid="accept-return"]').exists()).toBe(false);
    expect(row.findAll('button')).toHaveLength(0);

    // The tracked queue keeps its own empty state and never claims everything was returned.
    expect(wrapper.get('[data-testid="part-returns-queue"]').exists()).toBe(true);
    expect(normalized(wrapper)).toContain('trống không có nghĩa là mọi linh kiện đã được trả đủ');
    wrapper.unmount();
  });

  it('shows an honest empty state when no legacy handover needs manual review', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);

    const wrapper = mountReturns();
    await flushPromises();

    expect(wrapper.get('[data-testid="legacy-part-returns-empty"]').text()).toContain('Không có linh kiện lịch sử nào cần xác minh');
    expect(wrapper.find('[data-testid="legacy-part-return"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="accept-return"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([403, 503])('hides only the legacy group when that read is unavailable (%i) and keeps the tracked queue', async (status) => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);
    partRequestsApi.getLegacyManualReview.mockRejectedValue({ response: { status } });

    const wrapper = mountReturns();
    await flushPromises();

    expect(wrapper.get('[data-testid="part-returns-queue"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="part-return-group"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="accept-return"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="legacy-part-returns"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="legacy-part-returns-alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="legacy-part-returns-error"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the tracked queue usable after a legacy failure and recovers on retry', async () => {
    partRequestsApi.getPendingReturns.mockResolvedValue([returnRecord({ declaredQty: 2 })]);
    partRequestsApi.getLegacyManualReview
      .mockRejectedValueOnce(new Error('mạng lỗi'))
      .mockResolvedValueOnce({ data: [legacyRecord()], total: 1, page: 1, pageSize: 20 });

    const wrapper = mountReturns();
    await flushPromises();

    expect(wrapper.get('[data-testid="part-returns-queue"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="part-return-group"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="legacy-part-returns-error"]').text()).toContain('Chưa tải được linh kiện lịch sử cần xác minh.');

    await wrapper.get('[data-testid="legacy-part-returns-error"] button').trigger('click');
    await flushPromises();

    expect(partRequestsApi.getLegacyManualReview).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="legacy-part-return"]').text()).toContain('Van xả cũ');
    expect(wrapper.get('[data-testid="accept-return"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('pages the legacy list on the server and states how many rows remain', async () => {
    partRequestsApi.getLegacyManualReview
      .mockResolvedValueOnce({ data: [legacyRecord()], total: 25, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({
        data: [legacyRecord({ partRequestItemId: '66666666-6666-4666-8666-666666666666', partNameSnapshot: 'Tụ điện' })],
        total: 25,
        page: 2,
        pageSize: 20,
      });

    const wrapper = mountReturns();
    await flushPromises();

    expect(normalized(wrapper)).toContain('Trang 1/2');
    expect(normalized(wrapper)).toContain('Còn 5 dòng ở trang sau.');

    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();

    expect(partRequestsApi.getLegacyManualReview).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(normalized(wrapper)).toContain('Trang 2/2');
    expect(normalized(wrapper)).toContain('Tụ điện');
    expect(normalized(wrapper)).not.toContain('Còn 5 dòng ở trang sau.');
    wrapper.unmount();
  });

  it('never queries legacy records for an account that cannot operate returns', async () => {
    auth.hasRole.mockReturnValue(false);

    const wrapper = mountReturns();
    await flushPromises();

    expect(partRequestsApi.getLegacyManualReview).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="legacy-part-returns"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="part-returns-queue"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('part-requests.api legacy manual review contract (T3b/T3c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /part-returns/legacy-manual-review maps the T3b page with bounded pagination', async () => {
    const { partRequestsApi: api } = await loadActualApi();
    apiClientMock.get.mockResolvedValueOnce({
      data: { data: [legacyRecord()], meta: { total: 1, page: 1, pageSize: 20 } },
    });

    const page = await api.getLegacyManualReview();

    expect(apiClientMock.get).toHaveBeenCalledWith('/part-returns/legacy-manual-review', {
      params: { page: 1, pageSize: 20 },
    });
    expect(page).toEqual({ data: [legacyRecord()], total: 1, page: 1, pageSize: 20 });
  });

  it('clamps page and pageSize to the Backend bounds and never changes the endpoint', async () => {
    const { partRequestsApi: api } = await loadActualApi();
    apiClientMock.get.mockResolvedValueOnce({
      data: { data: [], meta: { total: 0, page: 1_000_000, pageSize: 100 } },
    });

    await api.getLegacyManualReview({ page: 1_000_001, pageSize: 500 });

    expect(apiClientMock.get).toHaveBeenCalledWith('/part-returns/legacy-manual-review', {
      params: { page: 1_000_000, pageSize: 100 },
    });
  });

  it('accepts an empty page', async () => {
    const { partRequestsApi: api } = await loadActualApi();
    apiClientMock.get.mockResolvedValueOnce({
      data: { data: [], meta: { total: 0, page: 1, pageSize: 20 } },
    });

    await expect(api.getLegacyManualReview()).resolves.toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
  });

  it.each([
    ['the wrong kind', { data: [legacyRecord({ kind: 'tracked_return' })], meta: { total: 1, page: 1, pageSize: 20 } }],
    ['an accepted receipt state', { data: [legacyRecord({ receiptState: 'ACCEPTED' })], meta: { total: 1, page: 1, pageSize: 20 } }],
    ['a non-positive issued quantity', { data: [legacyRecord({ issuedQty: 0 })], meta: { total: 1, page: 1, pageSize: 20 } }],
    ['an invalid handover time', { data: [legacyRecord({ handedOverAt: 'not-a-date' })], meta: { total: 1, page: 1, pageSize: 20 } }],
    ['pagination that does not match the request', { data: [legacyRecord()], meta: { total: 1, page: 2, pageSize: 20 } }],
    ['a total smaller than the page', { data: [legacyRecord()], meta: { total: 0, page: 1, pageSize: 20 } }],
  ])('rejects a payload with %s', async (_label, body) => {
    const { partRequestsApi: api, LegacyManualReviewPayloadError } = await loadActualApi();
    apiClientMock.get.mockResolvedValueOnce({ data: body });

    await expect(api.getLegacyManualReview()).rejects.toBeInstanceOf(LegacyManualReviewPayloadError);
  });
});
