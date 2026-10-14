import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Customer wallet (PO 08/10/2026): balance, VNPay top-up, history. Since PO 14/10/2026 the
// balance can also be withdrawn (tests/customer-withdrawal.spec.ts covers that flow).
const { summary, topUp, route } = vi.hoisted(() => ({ summary: vi.fn(), topUp: vi.fn(), route: { query: {} as Record<string, string> } }));
vi.mock('../src/api/customer-wallet.api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/api/customer-wallet.api')>()), customerWalletApi: { summary, topUp } }));
vi.mock('vue-router', () => ({ useRoute: () => route }));
import CustomerWalletPage from '../src/pages/customer/CustomerWalletPage.vue';

const wallet = {
  balance: 750000,
  transactions: [
    { id: 't3', type: 'refund', amount: 150000, balanceAfter: 750000, description: 'Hoàn tiền khiếu nại đơn #FH-1', createdAt: '2026-10-09T10:00:00Z' },
    { id: 't2', type: 'invoice_payment', amount: 400000, balanceAfter: 600000, description: 'Thanh toán đơn #FH-1', createdAt: '2026-10-09T09:00:00Z' },
    { id: 't1', type: 'top_up', amount: 1000000, balanceAfter: 1000000, description: 'Nạp ví qua VNPay', createdAt: '2026-10-09T08:00:00Z' },
  ],
  meta: { page: 1, limit: 20, total: 3, totalPages: 1 },
};

describe('Customer wallet page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    route.query = {};
    summary.mockResolvedValue(wallet);
  });

  it('shows the balance, offers top-up and withdrawal, and lists money in and out', async () => {
    const w = mount(CustomerWalletPage);
    await flushPromises();
    expect(w.get('[data-testid="wallet-balance"]').text().replace(/\s/g, '')).toContain('750.000');
    expect(w.text()).toContain('rút về tài khoản ngân hàng');
    expect(w.text()).not.toContain('không rút ra được');
    // Top-up is open by default; the withdrawal opens on its own button.
    expect(w.get('[data-testid="wallet-action-topup"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="wallet-action-withdraw"]').text()).toContain('Rút tiền');
    expect(w.find('[data-testid="withdraw-panel"]').exists()).toBe(false);
    const rows = w.get('[data-testid="wallet-transactions"]').findAll('li').map((li) => li.text().replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Hoàn tiền');
    expect(rows[0]).toContain('+');
    expect(rows[1]).toContain('Thanh toán đơn');
    expect(rows[1]).toContain('−');
    expect(rows[2]).toContain('Nạp ví');
  });

  it('labels a withdrawal as money out and its refund as money in', async () => {
    summary.mockResolvedValue({
      ...wallet,
      transactions: [
        { id: 'w2', type: 'withdrawal_refund', amount: 300000, balanceAfter: 750000, description: null, createdAt: '2026-10-14T10:00:00Z' },
        { id: 'w1', type: 'withdrawal', amount: 300000, balanceAfter: 450000, description: null, createdAt: '2026-10-14T09:00:00Z' },
      ],
    });
    const w = mount(CustomerWalletPage);
    await flushPromises();
    const rows = w.get('[data-testid="wallet-transactions"]').findAll('li').map((li) => li.text().replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Hoàn tiền rút không thành công');
    expect(rows[0]).toContain('+300.000');
    expect(rows[1]).toContain('Rút về ngân hàng');
    expect(rows[1]).toContain('−300.000');
  });

  it('pages the history with numbers instead of "Xem thêm"', async () => {
    const page = (n: number, count: number) => ({
      balance: 750000,
      transactions: Array.from({ length: count }, (_, i) => ({ ...wallet.transactions[0], id: `p${n}-${i}` })),
      meta: { page: n, limit: 20, total: 23, totalPages: 2 },
    });
    summary.mockReset().mockResolvedValueOnce(page(1, 20)).mockResolvedValueOnce(page(2, 3));
    const w = mount(CustomerWalletPage);
    await flushPromises();
    expect(summary).toHaveBeenCalledWith(1, 20);
    expect(w.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 23');
    expect(w.text()).not.toContain('Xem thêm');
    await w.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(summary).toHaveBeenLastCalledWith(2, 20);
    expect(w.get('[data-testid="wallet-transactions"]').findAll('li')).toHaveLength(3);
    expect(w.get('[data-testid="wallet-balance"]').text().replace(/\s/g, '')).toContain('750.000');
  });

  it('checks the amount before opening VNPay', async () => {
    const w = mount(CustomerWalletPage);
    await flushPromises();
    await w.get('[data-testid="topup-amount"]').setValue('5000');
    await w.get('[data-testid="topup-submit"]').trigger('click');
    expect(topUp).not.toHaveBeenCalled();
    expect(w.text()).toContain('từ 10.000 ₫ đến 50.000.000 ₫');
  });

  it('starts a VNPay top-up for a preset amount', async () => {
    topUp.mockRejectedValue(new Error('Nạp tiền chưa mở vì cổng thanh toán chưa bật.'));
    const w = mount(CustomerWalletPage);
    await flushPromises();
    await w.findAll('button').find((b) => b.text().replace(/\s/g, '').startsWith('200.000'))!.trigger('click');
    await w.get('[data-testid="topup-submit"]').trigger('click');
    await flushPromises();
    expect(topUp).toHaveBeenCalledWith(200000);
    expect(w.text()).toContain('chưa mở');
  });

  it('tells the customer how the VNPay top-up ended', async () => {
    route.query = { payment: 'failed' };
    const failed = mount(CustomerWalletPage);
    await flushPromises();
    expect(failed.get('[data-testid="topup-result"]').text()).toContain('chưa thành công');
    route.query = { payment: 'success', amount: '200000' };
    const ok = mount(CustomerWalletPage);
    await flushPromises();
    expect(ok.get('[data-testid="topup-result"]').text().replace(/\s/g, '')).toContain('200.000');
  });
});
