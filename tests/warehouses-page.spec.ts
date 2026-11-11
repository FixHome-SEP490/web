import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { warehouses, parts, users, auth } = vi.hoisted(() => ({
  warehouses: {
    list: vi.fn(), getStock: vi.fn(), getMovements: vi.fn(), adjustStock: vi.fn(),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  },
  parts: { getCatalog: vi.fn() },
  users: { getUsers: vi.fn() },
  auth: { userRole: 'SERVICE_MANAGER', user: { id: 'sm-1' }, hasRole: vi.fn(() => true) },
}));
vi.mock('../src/api/warehouses.api', () => ({ warehousesApi: warehouses }));
vi.mock('../src/api/parts-catalog.api', () => ({ partsCatalogApi: parts }));
vi.mock('../src/api/admin-users.api', () => ({ adminUsersApi: users }));
vi.mock('../src/stores/auth.store', () => ({ useAuthStore: () => auth }));

import ConsoleWarehousesPage from '../src/pages/console/ConsoleWarehousesPage.vue';

const A = { id: 'wh-a', name: 'Kho A', status: 'active', responsibleUserId: 'sm-1' };
const B = { id: 'wh-b', name: 'Kho B', status: 'active', responsibleUserId: 'sm-1' };
const row = (warehouseId: string) => ({ warehouseId, partId: 'part-1', onHand: warehouseId === 'wh-a' ? 5 : 9, reserved: 0, available: warehouseId === 'wh-a' ? 5 : 9 });
const page = (data: unknown[]) => ({ data, meta: { total: data.length, limit: 50, offset: 0 } });

describe('warehouse console page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warehouses.list.mockResolvedValue([A, B]);
    warehouses.getMovements.mockResolvedValue(page([]));
    parts.getCatalog.mockResolvedValue({ data: [{ id: 'part-1', name: 'Tụ điện', sku: 'TD-1', isActive: true }], meta: { totalPages: 1 } });
    users.getUsers.mockResolvedValue({ data: [], meta: { totalPages: 1 } });
  });

  it('never lets a slower answer for warehouse A replace the rows of warehouse B (BUG DETECTOR 78)', async () => {
    let answerA!: (value: unknown) => void;
    warehouses.getStock.mockImplementation((id: string) => id === 'wh-a'
      ? new Promise((resolve) => { answerA = resolve; })
      : Promise.resolve(page([row('wh-b')])));
    const wrapper = mount(ConsoleWarehousesPage, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    await wrapper.get('select').setValue('wh-b');
    await flushPromises();
    expect(wrapper.text()).toContain('9');
    answerA(page([row('wh-a')]));
    await flushPromises();
    const cells = wrapper.findAll('td').map((cell) => cell.text());
    expect(cells).toContain('9');
    expect(cells).not.toContain('5');
  });

  it('retries a timed-out adjustment with the same key only at the same warehouse (BUG DETECTOR 79)', async () => {
    warehouses.getStock.mockResolvedValue(page([]));
    warehouses.adjustStock.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({});
    const wrapper = mount(ConsoleWarehousesPage, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    const form = wrapper.get('form');
    const selects = form.findAll('select');
    await selects[0]!.setValue('part-1');
    await form.find('input[type="number"]').setValue('3');
    await form.findAll('input').at(-1)!.setValue('Nhập hàng');
    await form.trigger('submit');
    await flushPromises();
    const [firstWarehouse, firstPayload] = warehouses.adjustStock.mock.calls[0]!;
    expect(firstWarehouse).toBe('wh-a');
    expect(firstPayload).not.toHaveProperty('warehouseId');

    // Same command at another warehouse: a new key, sent to that warehouse.
    await wrapper.get('select').setValue('wh-b');
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const [secondWarehouse, secondPayload] = warehouses.adjustStock.mock.calls[1]!;
    expect(secondWarehouse).toBe('wh-b');
    expect(secondPayload.idempotencyKey).not.toBe(firstPayload.idempotencyKey);
  });

  it('names part request movements in the log (BUG DETECTOR 80)', async () => {
    warehouses.getStock.mockResolvedValue(page([]));
    warehouses.getMovements.mockResolvedValue(page([
      { id: 'm1', warehouseId: 'wh-a', partId: 'part-1', actorUserId: 'sm-1', kind: 'issue', delta: -2, reason: 'Phiếu PR-1A2B3C4D', idempotencyKey: 'k', onHandAfter: 3, reservedAfter: 0, createdAt: new Date().toISOString(), partRequestId: 'pr-1' },
      { id: 'm2', warehouseId: 'wh-a', partId: 'part-1', actorUserId: 'sm-1', kind: 'reserve', delta: 0, reason: 'Phiếu PR-1A2B3C4D', idempotencyKey: 'k2', onHandAfter: 5, reservedAfter: 2, createdAt: new Date().toISOString(), partRequestId: 'pr-1' },
    ]));
    const wrapper = mount(ConsoleWarehousesPage, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    await wrapper.findAll('button[role="tab"]')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Xuất giao thợ');
    expect(wrapper.text()).toContain('Giữ cho yêu cầu');
    expect(wrapper.text()).toContain('Phiếu PR-1A2B3C4D');
  });
});
