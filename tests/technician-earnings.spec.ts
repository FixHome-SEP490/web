import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { getTechnicianJobs, getMyWallet, push } = vi.hoisted(() => ({
  getTechnicianJobs: vi.fn(),
  getMyWallet: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: { getTechnicianJobs },
  isHistoricalOrder: (o: { historical?: boolean }) => o.historical === true,
}));
vi.mock('../src/api/wallet.api', () => ({ walletApi: { getMyWallet } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

import TechnicianEarningsPage from '../src/pages/technician/TechnicianEarningsPage.vue';

const order = (id: string, status: string, labor: number, grand: number, paid: boolean, completedAt: string | null) => ({
  id, code: `FH-${id}`, status, serviceName: `Dịch vụ ${id}`, laborTotal: labor, partsTotal: grand - labor,
  grandTotal: grand, paymentStatus: paid ? 'PAID' : 'UNPAID', createdAt: '2026-09-20T02:00:00Z', completedAt,
});

describe('Technician earnings show only real records', () => {
  beforeEach(() => {
    getTechnicianJobs.mockReset(); getMyWallet.mockReset(); push.mockReset();
  });

  it('totals the completed orders the server returned and links each to its job', async () => {
    getTechnicianJobs.mockResolvedValue([
      order('a', 'COMPLETED', 220000, 2420000, true, '2026-09-29T07:00:00Z'),
      order('b', 'completed', 150000, 150000, false, '2026-09-21T03:00:00Z'),
      order('c', 'EN_ROUTE', 999000, 999000, false, null),
      { id: 'old', code: 'OLD', historical: true },
    ]);
    getMyWallet.mockResolvedValue({ balance: 11493000 });
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();

    const text = wrapper.text();
    expect(text).not.toMatch(/DEMO|minh họa|Khách demo/);
    expect(wrapper.get('[data-testid="earnings-totals"]').text()).toContain('2');
    expect(text).toContain('370.000'); // 220.000 + 150.000 labour
    expect(text).toContain('2.570.000'); // order value
    expect(text).toContain('1/2'); // paid
    expect(text).toContain('11.493.000');
    expect(text).not.toContain('Dịch vụ c'); // not completed
    // newest first, and the row opens the job
    const rows = wrapper.findAll('[data-testid^="earning-row-"]');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual(['earning-row-a', 'earning-row-b']);
    await rows[0].trigger('click');
    expect(push).toHaveBeenCalledWith('/tech/jobs/a');
  });

  it('says so plainly when nothing is completed yet', async () => {
    getTechnicianJobs.mockResolvedValue([order('c', 'EN_ROUTE', 1, 1, false, null)]);
    getMyWallet.mockResolvedValue(null);
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();
    expect(wrapper.find('[data-testid="earnings-empty"]').exists()).toBe(true);
  });

  it('shows a plain error, not the server wording, when loading fails', async () => {
    getTechnicianJobs.mockRejectedValue({ response: { status: 500, data: { error: { message: 'Internal server error' } } } });
    getMyWallet.mockResolvedValue(null);
    const wrapper = mount(TechnicianEarningsPage);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Không thể tải thu nhập');
    expect(wrapper.text()).not.toContain('Internal');
  });
});
