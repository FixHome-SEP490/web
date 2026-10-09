import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

// Manager overview (PO 09/10/2026): "Cần thay đổi thợ" reports still waiting and
// orders the system cancelled because the technician never set out, each a link.
const { getOperational, getConsoleOrders } = vi.hoisted(() => ({ getOperational: vi.fn(), getConsoleOrders: vi.fn() }));
vi.mock('../src/api/dashboard.api', () => ({ dashboardApi: { getOperational } }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getConsoleOrders } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import ConsoleDashboard from '../src/pages/console/ConsoleDashboard.vue';

const ops = (extra: Record<string, unknown> = {}) => ({
  ordersByStatus: [{ status: 'accepted', count: '2' }], activeOrders: 2, matchingBookings: 0, pendingCancellations: 0, ...extra,
});
const mountPage = async () => {
  const w = mount(ConsoleDashboard, { global: { stubs: { RouterLink: RouterLinkStub, 'router-link': RouterLinkStub } } });
  await flushPromises();
  return w;
};

describe('Manager overview: what needs the manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
