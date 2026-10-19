import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { partRequestsApi, partsCatalogApi } = vi.hoisted(() => ({
  partRequestsApi: {
    getByOrderId: vi.fn(),
    createPreRepair: vi.fn(),
    receiveByQr: vi.fn(),
    updateItemUsage: vi.fn(),
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
    partsCatalogApi.getCatalog.mockResolvedValue({ data: [] });
    // P1 return feature idle by default in these tests.
    partRequestsApi.getReturnsByOrderId.mockResolvedValue([]);
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

    await wrapper.findAll('button').find((button) => button.text().includes('Nhận linh kiện (Quét QR)'))!.trigger('click');
    await wrapper.get('input[placeholder*="Nhập mã"]').setValue('qr-test-only');
    await wrapper.findAll('button').find((button) => button.text().includes('Xác nhận đã nhận'))!.trigger('click');
    await flushPromises();

    expect(partRequestsApi.receiveByQr).toHaveBeenCalledWith('pr-1', { qrToken: 'qr-test-only' });
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain('Cấp 1 · Dùng 0 · Cần trả 1');
    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([
    { status: 'used', label: 'Đã dùng', usedQty: 1, declaredQty: 0, outstandingQty: 0, expected: 'Cấp 1 · Dùng 1 · Cần trả 0' },
    { status: 'returned', label: 'Hoàn trả', usedQty: 0, declaredQty: 1, outstandingQty: 1, expected: 'Đang chờ quản lý xác nhận' },
  ])('refreshes the return snapshot after marking an item $status', async ({ status, label, usedQty, declaredQty, outstandingQty, expected }) => {
    partRequestsApi.getByOrderId
      .mockResolvedValueOnce([request('received')])
      .mockResolvedValue([request('received', status)]);
    partRequestsApi.updateItemUsage.mockResolvedValue(null);
    partRequestsApi.getReturnsByOrderId
      .mockResolvedValueOnce([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả',
        issuedQty: 1, usedQty: 0, declaredQty: 0, managerAcceptedQty: 0,
        outstandingQty: 1, version: 1,
      }])
      .mockResolvedValue([{
        partRequestId: 'pr-1', partRequestItemId: 'i-1', partNameSnapshot: 'Van xả',
        issuedQty: 1, usedQty, declaredQty, managerAcceptedQty: 0,
        outstandingQty, version: 2,
      }]);
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'so-1', orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === label)!.trigger('click');
    await flushPromises();

    expect(partRequestsApi.updateItemUsage).toHaveBeenCalledWith('pr-1', 'i-1', { usageStatus: status });
    expect(wrapper.text().replace(/\s+/g, ' ')).toContain(expected);
    expect(wrapper.find('[data-testid="open-declare-return"]').exists()).toBe(false);
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
