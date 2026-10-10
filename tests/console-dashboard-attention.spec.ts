import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Manager overview (PO 09/10/2026): "Cần thay đổi thợ" reports still waiting and
// orders the system cancelled because the technician never set out, each a link.
// Calm layout (PO 10/10/2026): a KPI row and one "Cần xử lý" list, no raw error text.
const { getOperational, getConsoleOrders } = vi.hoisted(() => ({ getOperational: vi.fn(), getConsoleOrders: vi.fn() }));
vi.mock('../src/api/dashboard.api', () => ({ dashboardApi: { getOperational } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getConsoleOrders } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import ConsoleDashboard from '../src/pages/console/ConsoleDashboard.vue';
import { useAuthStore } from '../src/stores/auth.store';

const ops = (extra: Record<string, unknown> = {}) => ({
  ordersByStatus: [{ status: 'accepted', count: '2' }], activeOrders: 2, matchingBookings: 0, pendingCancellations: 0, ...extra,
});
const asRole = (role: string) => {
  useAuthStore().setAuth('token', { id: 'u1', fullName: 'Quản lý', email: 'sm@test.vn', role } as never);
};
const mountPage = async () => {
  const w = mount(ConsoleDashboard, { global: { stubs: { RouterLink: RouterLinkStub, 'router-link': RouterLinkStub } } });
  await flushPromises();
  return w;
};

describe('Manager overview: what needs the manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    asRole('service_manager');
    getConsoleOrders.mockResolvedValue([]);
  });

  it('shows both counts and links to the filtered lists', async () => {
    getOperational.mockResolvedValue(ops({ openReplacementCases: 3, noDepartureCancellations7d: 2 }));
    const w = await mountPage();
    const replacements = w.get('[data-testid="ops-replacements"]');
    expect(replacements.text()).toContain('Cần thay đổi thợ');
    expect(replacements.text()).toContain('3');
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toEqual(
      expect.arrayContaining(['/console/support?caseType=technician_replacement&status=open', '/console/cancellations']),
    );
    expect(w.get('[data-testid="ops-no-departure"]').text()).toContain('2');
  });

  it('shows zero when the server does not send the counts yet', async () => {
    getOperational.mockResolvedValue(ops());
    const w = await mountPage();
    expect(w.get('[data-testid="ops-replacements"]').text()).toContain('0');
    expect(w.get('[data-testid="ops-no-departure"]').text()).toContain('0');
  });

  it('keeps the bookings waiting for a technician in the same list, once', async () => {
    getOperational.mockResolvedValue(ops({ matchingBookings: 4 }));
    const w = await mountPage();
    const attention = w.get('[data-testid="ops-attention"]');
    expect(attention.text()).toContain('Yêu cầu chờ ghép thợ');
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'));
    expect(links.filter((to) => to === '/console/bookings')).toHaveLength(1);
    expect(w.text()).not.toContain('Kanban');
  });

  it('gives the admin the counts without links to manager-only pages', async () => {
    setActivePinia(createPinia());
    asRole('admin');
    getOperational.mockResolvedValue(ops({ openReplacementCases: 1, noDepartureCancellations7d: 1 }));
    const w = await mountPage();
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'));
    expect(links).not.toContain('/console/cancellations');
    expect(links.some((to) => String(to).startsWith('/console/support'))).toBe(false);
    expect(w.get('[data-testid="ops-replacements"]').text()).toContain('1');
  });

  it('says only that it did not load, with a retry, when the server fails', async () => {
    getOperational.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }));
    const w = await mountPage();
    expect(w.text()).toContain('Chưa tải được, vui lòng thử lại.');
    expect(w.text()).not.toContain('500');
    getOperational.mockResolvedValueOnce(ops());
    await w.findAll('button').find((b) => b.text() === 'Thử lại')!.trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="ops-attention"]').exists()).toBe(true);
  });
});
