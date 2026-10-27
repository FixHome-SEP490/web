import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';

const { api } = vi.hoisted(() => ({ api: {
  getByOrderId: vi.fn(), getReturnsByOrderId: vi.fn(), getPendingReturns: vi.fn(),
  declareReturn: vi.fn(), acceptReturn: vi.fn(),
} }));
vi.mock('../src/api/part-requests.api', async original => ({
  ...await original<typeof import('../src/api/part-requests.api')>(), partRequestsApi: api,
}));
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi: { getCatalog: async () => ({ data: [] }) } }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ hasRole: () => true }) }));
vi.mock('../src/services/live-updates', () => ({ onOrderChange: () => () => undefined, whileOffline: () => () => undefined }));
vi.mock('../src/composables/usePartReturnsRefresh', () => ({ usePartReturnsRefresh: () => undefined }));

import TechnicianPartsSection from '../src/components/TechnicianPartsSection.vue';
import PartReturnsQueue from '../src/components/console/PartReturnsQueue.vue';

enableAutoUnmount(afterEach);
const ledger = {
  partRequestId: 'pr1', partRequestItemId: 'i1', partNameSnapshot: 'Van xả',
  issuedQty: 4, usedQty: 1, declaredQty: 1, managerAcceptedQty: 0,
  outstandingQty: 3, usageRecorded: true, version: 3,
};
beforeEach(() => {
  vi.resetAllMocks();
  api.getByOrderId.mockResolvedValue([{
    id: 'pr1', serviceOrderId: 'o1', technicianId: 't1', requestType: 'pre_repair',
    fulfillmentMethod: 'pickup', status: 'received', shippingFee: 0, createdAt: '',
    items: [{ id: 'i1', partRequestId: 'pr1', partCatalogId: 'sku', partSource: 'fixhome',
      partNameSnapshot: 'Van xả', quantity: 4, unitPriceSnapshot: 50000, usageStatus: 'used' }],
  }]);
  api.getReturnsByOrderId.mockResolvedValue([{ ...ledger }]);
  api.getPendingReturns.mockResolvedValue([{ ...ledger }]);
});

describe('T1 parts declaration accessibility', () => {
  it('links the declaration control and quantity to their explanation without claiming warehouse acceptance', async () => {
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'o1', orderStatus: 'UNDER_REPAIR', approvedPartQuantities: { sku: 2 } } });
    await flushPromises();
    const button = wrapper.get('[data-testid="open-declare-return"]');
    expect(button.attributes('aria-expanded')).toBe('false');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    const panel = wrapper.get(`[id="${button.attributes('aria-controls')}"]`);
    const input = panel.get('input');
    const hint = wrapper.get(`[id="${input.attributes('aria-describedby')}"]`);
    expect(hint.text()).toContain('chưa phải là đã trả xong');
    expect(input.attributes('max')).toBe('2');
    expect(wrapper.find('[data-testid="part-used-value"]').text()).toContain('50.000');
    expect(api.declareReturn).not.toHaveBeenCalled();
  });

  it('announces failed declaration and retains its form for an explicit retry', async () => {
    api.declareReturn.mockRejectedValue(new Error('offline'));
    const wrapper = mount(TechnicianPartsSection, { props: { orderId: 'o1', orderStatus: 'UNDER_REPAIR' } });
    await flushPromises();
    await wrapper.get('[data-testid="open-declare-return"]').trigger('click');
    await wrapper.get('[data-testid="submit-declare-return"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Không gửi được khai trả');
    expect(wrapper.find('[data-testid="submit-declare-return"]').exists()).toBe(true);
  });

  it('names each manager quantity group and keeps pending receipt distinct from accepted stock', async () => {
    const wrapper = mount(PartReturnsQueue, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    const quantities = wrapper.get('dl[aria-label="Số lượng Van xả"]');
    expect(quantities.text()).toContain('Cấp');
    expect(quantities.text()).toContain('Khai trả');
    expect(quantities.text()).toContain('Đã nhận');
    expect(wrapper.get('[data-testid="part-return-pending-i1"]').text()).toContain('Chờ nhận 1');
    expect(wrapper.get('input').attributes('max')).toBe('1');
    expect(api.acceptReturn).not.toHaveBeenCalled();
  });
});
