import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: api, getHttpStatus: () => undefined }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'o1' }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ conversations: [] }) }));
import Page from '../src/pages/customer/CustomerOrderDetailPage.vue';
const state = { invoice: {} as Record<string, unknown>, quote: undefined as Record<string, unknown> | undefined };
const mountPage = async () => {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/service-orders/o1') return { data: { data: { id: 'o1', code: 'FH-TEST', status: 'under_repair', paymentStatus: 'unpaid', completionRequestedAt: '2026-10-20', laborTotal: 0, partsTotal: 0, grandTotal: 0, quotation: state.quote } } };
    if (path.endsWith('/invoice')) return { data: { data: state.invoice } };
    if (path === '/customer/wallet') return { data: { data: { balance: 999999 } } };
    return { data: { data: [] } };
  });
  const w = mount(Page, { global: { stubs: { OrderComplaintPanel: true, WarrantyClaimModal: true, ReviewTechnicianModal: true, RebookDialog: true, RouterLink: true } } });
  await flushPromises();
  return w;
};
describe('customer invoice payment UI', () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()); state.quote = undefined; state.invoice = { id: 'i1', laborTotal: 0, partsTotal: 0, grandTotal: 0, items: [] }; });
  it('blocks a misleading zero invoice and never shows approved parts as billed', async () => {
    state.quote = { id: 'q1', status: 'approved', items: [{ type: 'parts_equipment', quantity: 1, unitPrice: 550000, lineTotal: 550000, description: 'Van dự kiến', partSource: 'fixhome', partCatalogId: 'sku1' }] };
    const w = await mountPage();
    expect(w.get('[data-testid="billing-mismatch"]').text()).toContain('chưa khớp');
    expect(w.get('[data-testid="order-costs"]').text()).not.toContain('Van dự kiến');
    const pay = w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!;
    expect(pay.attributes('disabled')).toBeDefined();
    await pay.trigger('click');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    w.unmount();
  });
  it.each([0, 1, 4999, 5000])('shows eligible channels for invoice %s', async total => {
    state.invoice = { ...state.invoice, laborTotal: total, grandTotal: total };
    const w = await mountPage();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    await flushPromises();
    const dialog = w.get('[aria-label="Thanh toán đơn"]');
    expect(dialog.text().includes('Hoàn tất miễn phí')).toBe(total === 0);
    expect(dialog.text().includes('Trả bằng ví')).toBe(total > 0);
    expect(dialog.text().includes('tiền mặt')).toBe(total > 0);
    expect(dialog.text().includes('Thanh toán qua VNPay')).toBe(total >= 5000);
    w.unmount();
  });
  it('calls only the free route and does not report success on backend rejection', async () => {
    const w = await mountPage();
    await w.findAll('button').find(b => b.text() === 'Thanh toán ngay')!.trigger('click');
    api.post.mockRejectedValueOnce(new Error('Không thể hoàn tất hóa đơn này.'));
    await w.get('[data-testid="complete-no-charge"]').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/invoices/i1/no-charge', {});
    expect(w.text()).not.toContain('Đã hoàn tất miễn phí');
    expect(w.find('[aria-label="Thanh toán đơn"]').exists()).toBe(true);
    w.unmount();
  });
});
