import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ incidents: vi.fn(), getOrder: vi.fn() }));
const auth = reactive({ userRole: 'ADMIN', hasPermission: () => true });
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../src/api/group-stop.api', () => ({ groupStopApi: { incidents: mocks.incidents } }));
vi.mock('../src/api/console-order-context.api', () => ({ consoleOrderContextApi: { getConsoleOrderContext: mocks.getOrder } }));
import GroupStopIncidentsPanel from '../src/components/console/GroupStopIncidentsPanel.vue';
enableAutoUnmount(afterEach);
const groupId = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks(); auth.userRole = 'ADMIN'; auth.hasPermission = () => true;
  mocks.incidents.mockResolvedValue([{ commandId: 'command', recordedAt: '2026-11-01T00:10:00Z',
    result: { stopped: [{ orderId: 'order' }], preserved: [{ orderId: 'completed' }] },
    contactEvidence: [{ id: 'proof', createdAt: '2026-11-01T00:00:00Z', after: { kind: 'CALL_ATTEMPT' } }],
    children: [{ bookingId: 'booking', orderId: 'order', orderStatus: 'under_repair', paymentStatus: 'unpaid', cases: [{ id: 'case' }] },
      { bookingId: 'done', orderId: 'completed', orderStatus: 'completed', paymentStatus: 'paid', cases: [] }],
  }]);
});
const mountPanel = () => mount(GroupStopIncidentsPanel, { props: { orderId: 'order', groupId }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
it('shows one logical incident with protected child, call attempts and child links to Admin without manager actions', async () => {
  const w = mountPanel(); await flushPromises();
  expect(mocks.incidents).toHaveBeenCalledWith(groupId);
  expect(w.findAll('[data-testid="group-stop-incident"]')).toHaveLength(1);
  expect(w.text()).toContain('Giữ nguyên kết quả');
  expect(w.text()).toContain('chưa xác minh kết nối');
  expect(w.find('a[href="/console/support/case"]').exists()).toBe(true);
  expect(w.find('a[href="/console/orders/completed"]').exists()).toBe(true);
  expect(w.find('a[href="/console/part-returns"]').exists()).toBe(false);
});
it('keeps management links scoped to SM and rejects unsupported roles before reading', async () => {
  auth.userRole = 'SERVICE_MANAGER';
  const w = mountPanel(); await flushPromises();
  expect(w.find('a[href="/console/part-returns"]').exists()).toBe(true);
  auth.userRole = 'CUSTOMER'; await flushPromises();
  expect(w.find('[data-testid="group-stop-incidents"]').exists()).toBe(false);
});
it('clears previous incident data on scope switch and never treats a failed GET as no incidents', async () => {
  const w = mountPanel(); await flushPromises();
  mocks.incidents.mockRejectedValue(new Error('offline'));
  await w.setProps({ groupId: 'other-group' }); await flushPromises();
  expect(w.findAll('[data-testid="group-stop-incident"]')).toHaveLength(0);
  expect(w.text()).toContain('Chưa đọc được hồ sơ lượt');
  expect(w.text()).not.toContain('Chưa có biên nhận');
});
