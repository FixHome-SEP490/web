import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

// Admin: every payment attempt (PO 09/10/2026), filtered and summed, read only.
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../src/api/admin-payments.api', () => ({ adminPaymentsApi: { list } }));
import AdminPaymentsPage from '../src/pages/console/admin/AdminPaymentsPage.vue';

const row = {
  id: 'p1', purpose: 'invoice', amount: 400000, currency: 'VND', mode: 'LIVE', provider: 'wallet', status: 'verified',
  providerReference: null, failureCode: null, requestedAt: '2026-10-09T03:00:00Z', verifiedAt: '2026-10-09T03:00:01Z', invoiceId: 'i1',
  payerId: 'c1', payerName: 'Khach Hang 1', payerEmail: 'customer1@fixhome.vn', payerRole: 'customer', orderId: 'o1', orderCode: 'FH-1',
};
const failed = { ...row, id: 'p2', provider: 'vnpay', status: 'failed', failureCode: '24', providerReference: '1234', verifiedAt: null };
const result = (data: unknown[]) => ({ data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1, summary: { verifiedAmount: 400000, verified: 1, pending: 0, failed: 1 } } });
const mountPage = async () => {
  const w = mount(AdminPaymentsPage, { global: { stubs: { RouterLink: RouterLinkStub, 'router-link': RouterLinkStub } } });
  await flushPromises();
  return w;
};

describe('Admin payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(result([row, failed]));
  });

  it('lists payments with payer, order, provider and the verified total', async () => {
    const w = await mountPage();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20, status: '', purpose: '' }));
    const summary = w.get('[data-testid="payments-summary"]').text().replace(/\s+/g, ' ');
    expect(summary).toContain('2 lần thanh toán');
    expect(summary).toContain('400.000');
    const first = w.get('[data-testid="payment-p1"]').text();
    for (const piece of ['Thanh toán hoá đơn', 'FH-1', 'Khach Hang 1 (Khách)', 'Ví khách', 'Đã xác nhận']) expect(first).toContain(piece);
    expect(w.findAllComponents(RouterLinkStub)[0].props('to')).toBe('/console/orders/o1');
    const second = w.get('[data-testid="payment-p2"]');
    expect(second.text()).toContain('Thất bại');
    expect(second.text()).toContain('Mã tham chiếu 1234');
    expect(second.find('.text-danger-700').exists()).toBe(true);
  });

  it('sends the filters and refuses a start day after the end day', async () => {
    const w = await mountPage();
    await w.get('[data-testid="payments-search"]').setValue('  FH-1 ');
    await w.get('[data-testid="payments-status"]').setValue('verified');
    await w.get('[data-testid="payments-purpose"]').setValue('wallet_top_up');
    await w.get('[data-testid="payments-provider"]').setValue('vnpay');
    await w.get('[data-testid="payments-from"]').setValue('2026-10-09');
    await w.get('[data-testid="payments-to"]').setValue('2026-10-01');
    await w.get('[data-testid="payments-filters"]').trigger('submit');
    expect(w.text()).toContain('Ngày bắt đầu phải trước ngày kết thúc');
    expect(list).toHaveBeenCalledTimes(1);
    await w.get('[data-testid="payments-to"]').setValue('2026-10-10');
    await w.get('[data-testid="payments-filters"]').trigger('submit');
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith({ search: 'FH-1', status: 'verified', purpose: 'wallet_top_up', provider: 'vnpay', from: '2026-10-09', to: '2026-10-10', page: 1, pageSize: 20 });
  });

  it('says so when nothing matches', async () => {
    list.mockResolvedValue(result([]));
    const w = await mountPage();
    expect(w.text()).toContain('Không có thanh toán nào');
  });
});
