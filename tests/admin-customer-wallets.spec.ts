import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Admin: customer wallets (PO 09/10/2026): balances, history and a correction
// with a reason, confirmed first, never more than the balance.
const { list, detail, adjust } = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), adjust: vi.fn() }));
vi.mock('../src/api/admin-customer-wallets.api', () => ({ adminCustomerWalletsApi: { list, detail, adjust } }));
import AdminCustomerWalletsPage from '../src/pages/console/admin/AdminCustomerWalletsPage.vue';

const row = { userId: 'c1', fullName: 'Trần Thị Khách', email: 'khach@fixhome.vn', phoneNumber: '0901111222', status: 'active', balance: 150000, updatedAt: null };
const wallet = (balance: number, extra: unknown[] = []) => ({
  customer: { id: 'c1', fullName: 'Trần Thị Khách', email: 'khach@fixhome.vn', phoneNumber: '0901111222', status: 'active' },
  balance,
  transactions: [
    ...extra,
    { id: 't2', type: 'refund', amount: 50000, balanceAfter: 150000, description: 'Hoàn tiền khiếu nại', createdAt: '2026-10-09T03:00:00Z' },
    { id: 't1', type: 'top_up', amount: 100000, balanceAfter: 100000, description: null, createdAt: '2026-10-08T03:00:00Z' },
  ],
});
const confirmButton = () => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Điều chỉnh' && !b.closest('form'));

describe('Admin customer wallets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    list.mockResolvedValue({ data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1, totalBalance: 150000 } });
    detail.mockResolvedValue(wallet(150000));
  });

  it('lists customers with their balance and the total FixHome holds', async () => {
    const w = mount(AdminCustomerWalletsPage);
    await flushPromises();
    expect(list).toHaveBeenCalledWith({ search: undefined, withBalance: undefined, page: 1, pageSize: 20 });
    expect(w.get('[data-testid="wallets-total"]').text()).toContain('150.000');
    expect(w.get('[data-testid="wallet-rows"]').text()).toContain('Trần Thị Khách');
    await w.get('[data-testid="wallet-with-balance"]').setValue(true);
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ search: undefined, withBalance: true, page: 1, pageSize: 20 });
  });

  it('opens the history with the direction of each change', async () => {
    const w = mount(AdminCustomerWalletsPage);
    await flushPromises();
    await w.get('[data-testid="wallet-row-c1"]').trigger('click');
    await flushPromises();
    expect(detail).toHaveBeenCalledWith('c1');
    const history = w.get('[data-testid="wallet-history"]').text().replace(/\s+/g, ' ');
    expect(history).toContain('Hoàn tiền');
    expect(history).toContain('+50.000');
    expect(history).toContain('Nạp ví');
  });

  it('refuses a short reason and a debit above the balance before asking', async () => {
    const w = mount(AdminCustomerWalletsPage, { attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="wallet-row-c1"]').trigger('click');
    await flushPromises();
    // Any whole amount: a step of 1000 from min 1 made the browser silently refuse 50.000 ₫ (jsdom does not check it).
    expect(w.get('[data-testid="adjust-amount"]').attributes()).toMatchObject({ min: '1', step: '1' });
    await w.get('[data-testid="adjust-amount"]').setValue('20000');
    await w.get('[data-testid="adjust-reason"]').setValue('ngắn');
    await w.get('[data-testid="adjust-form"]').trigger('submit');
    expect(w.text()).toContain('tối thiểu 10 ký tự');
    await w.get('[data-testid="adjust-debit"]').setValue(true);
    await w.get('[data-testid="adjust-amount"]').setValue('150001');
    await w.get('[data-testid="adjust-reason"]').setValue('Thu lại khoản cộng nhầm');
    await w.get('[data-testid="adjust-form"]').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Không trừ quá số dư');
    expect(adjust).not.toHaveBeenCalled();
    w.unmount();
  });

  it('credits after confirmation and shows the new balance', async () => {
    adjust.mockResolvedValue({ balanceAfter: 170000 });
    const w = mount(AdminCustomerWalletsPage, { attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="wallet-row-c1"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="adjust-amount"]').setValue('20000');
    await w.get('[data-testid="adjust-reason"]').setValue('Bù khoản hoàn ghi thiếu cho đơn');
    detail.mockResolvedValue(wallet(170000, [{ id: 't3', type: 'adjustment_credit', amount: 20000, balanceAfter: 170000, description: 'Quản trị viên điều chỉnh', createdAt: '2026-10-09T05:00:00Z' }]));
    await w.get('[data-testid="adjust-form"]').trigger('submit');
    await flushPromises();
    expect(adjust).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Khách nhận thông báo kèm lý do');
    confirmButton()!.click();
    await flushPromises();
    expect(adjust).toHaveBeenCalledWith('c1', { type: 'CREDIT', amount: 20000, reason: 'Bù khoản hoàn ghi thiếu cho đơn' });
    expect(w.get('[data-testid="adjust-saved"]').text()).toContain('170.000');
    expect(w.get('[data-testid="wallet-history"]').text()).toContain('FixHome cộng tiền');
    w.unmount();
  });
});
