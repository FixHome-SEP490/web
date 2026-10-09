import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { partRequestsApi, partsCatalogApi } = vi.hoisted(() => ({
  partRequestsApi: { getByOrderId: vi.fn(), createPreRepair: vi.fn(), receiveByQr: vi.fn(), updateItemUsage: vi.fn() },
  partsCatalogApi: { getCatalog: vi.fn() },
}));
vi.mock('../src/api/part-requests.api', () => ({ partRequestsApi }));
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
