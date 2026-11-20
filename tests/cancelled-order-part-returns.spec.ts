import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { partRequestsApi } = vi.hoisted(() => ({
  partRequestsApi: { getReturnsByOrderId: vi.fn(), declareReturn: vi.fn() },
}));

vi.mock('../src/api/part-requests.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/part-requests.api')>();
  return { ...actual, partRequestsApi };
});
vi.mock('../src/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  getHttpStatus: (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status,
}));

import CancelledOrderPartReturns from '../src/components/CancelledOrderPartReturns.vue';

const stubs = { FhButton: { template: '<button v-bind="$attrs"><slot /></button>' } };
const row = (over: Record<string, unknown> = {}) => ({
  partRequestId: 'r1', partRequestItemId: 'i1', partNameSnapshot: 'Adapter', issuedQty: 2, usedQty: 0,
  declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 2, version: 3, ...over,
});

describe('BUG DETECTOR 184: returning parts of a cancelled device', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows what the technician still owes and declares the full remainder', async () => {
    partRequestsApi.getReturnsByOrderId.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row({ declaredQty: 2, version: 4 })]);
    partRequestsApi.declareReturn.mockResolvedValue(null);
    const wrapper = mount(CancelledOrderPartReturns, { props: { orderId: 'o1' }, global: { stubs } });
    await flushPromises();
    expect(partRequestsApi.getReturnsByOrderId).toHaveBeenCalledWith('o1');
    expect(wrapper.text()).toContain('Adapter');
    await wrapper.get('[data-testid="cancelled-part-return-declare-i1"]').trigger('click');
    await flushPromises();
    expect(partRequestsApi.declareReturn).toHaveBeenCalledWith('r1', 'i1', expect.objectContaining({ quantity: 2, expectedVersion: 3 }));
    expect(wrapper.text()).toContain('chờ quản lý nhận');
    expect(wrapper.find('[data-testid="cancelled-part-return-declare-i1"]').exists()).toBe(false);
  });

  it('renders nothing when nothing is owed or returns are unavailable', async () => {
    partRequestsApi.getReturnsByOrderId.mockResolvedValueOnce([row({ outstandingQty: 0 })]);
    const empty = mount(CancelledOrderPartReturns, { props: { orderId: 'o1' }, global: { stubs } });
    await flushPromises();
    expect(empty.find('[data-testid="cancelled-part-returns"]').exists()).toBe(false);
    partRequestsApi.getReturnsByOrderId.mockRejectedValueOnce({ response: { status: 403 } });
    const denied = mount(CancelledOrderPartReturns, { props: { orderId: 'o2' }, global: { stubs } });
    await flushPromises();
    expect(denied.find('[data-testid="cancelled-part-returns"]').exists()).toBe(false);
  });
});
