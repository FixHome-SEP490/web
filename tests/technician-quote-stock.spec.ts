import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, onMounted } from 'vue';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: api, getHttpStatus: () => undefined }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'o1' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ conversations: [] }) }));
import Page from '../src/pages/technician/TechnicianJobDetailPage.vue';
const requests = [{ id: 'r1', requestType: 'pre_repair', status: 'received', receivedAt: '2026-10-20', items: [{ id: 'l1', partCatalogId: 's1', partSource: 'fixhome', partNameSnapshot: 'Van kho', quantity: 2, unitPriceSnapshot: 50000, usageStatus: 'pending' }] }];
const Parts = defineComponent({ emits: ['requests'], setup(_, { emit }) { onMounted(() => emit('requests', requests)); return () => null; } });
let missingCatalog = false;
const open = async (approved = false, fixedVisit = false) => {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/service-orders/o1') return { data: { data: { id: 'o1', code: 'TEST', ...(fixedVisit ? { visitGroupId: 'v1', pricingMode: 'FIXED_PRICE', fixedUnitPrice: 449000, quantity: 1 } : {}), status: approved ? 'under_repair' : 'en_route', paymentStatus: 'unpaid', arrivalVerified: true, beforeEvidenceCount: 1, laborTotal: 0, partsTotal: 0, grandTotal: 0,
      quotation: approved ? { id: 'q1', status: 'approved', items: [{ type: 'parts_equipment', partSource: 'technician', quantity: 1, unitPrice: 70000, lineTotal: 70000, description: 'Van riêng' }] } : undefined } } };
    if (path === '/parts/catalog/s1' && missingCatalog) throw new Error('offline');
    if (path === '/parts/catalog/s1') return { data: { data: { id: 's1', name: 'Van kho', sellingPrice: 60000, warrantyDays: 90 } } };
    if (path.endsWith('/part-requests')) return { data: { data: requests } };
    if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
    return { data: { data: [] } };
  });
  const w = mount(Page, { global: { stubs: { TechnicianPartsSection: Parts, BookingMediaViewer: true } } });
  await flushPromises();
  return w;
};
describe('technician base quote stock integration', () => {
  beforeEach(() => { vi.clearAllMocks(); missingCatalog = false; });
  it('keeps a fixed visit base labor-only even with received stock and unavailable catalog', async () => {
    missingCatalog = true;
    api.post.mockResolvedValue({ data: { data: {} } });
    const w = await open(false, true);
    const form = w.get('[data-testid="quotation-form"]');
    expect(form.text()).toContain('chỉ gồm tiền công');
    expect(form.find('input[aria-label="Số lượng linh kiện"]').exists()).toBe(false);
    expect(form.findAll('input[aria-label="Đơn giá"]')).toHaveLength(1);
    expect(form.get('input[aria-label="Đơn giá"]').attributes('disabled')).toBeDefined();
    expect(form.text()).not.toContain('Thêm linh kiện');
    expect(w.find('[data-testid="quote-stock-error"]').exists()).toBe(false);
    await w.findAll('button').find(b => b.text() === 'Gửi báo giá cho khách duyệt')!.trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/service-orders/o1/quotations', expect.objectContaining({
      items: [expect.objectContaining({ type: 'labor', quantity: 1, unitPrice: 449000 })],
    }));
    w.unmount();
  });
  it('suggests stock with locked warehouse price/warranty once, preserves edited quantity and removal', async () => {
    const w = await open();
    const form = w.get('[data-testid="quotation-form"]');
    expect(form.text()).toContain('Van kho');
    expect(api.get).toHaveBeenCalledWith('/parts/catalog/s1');
    expect(form.text()).toContain('90 ngày');
    expect((form.get('input[aria-label="Đơn giá"]').element as HTMLInputElement).value).toBe('50000');
    expect(form.get('input[aria-label="Đơn giá"]').attributes('disabled')).toBeDefined();
    await form.get('input[aria-label="Số lượng linh kiện"]').setValue(1);
    w.findComponent(Parts).vm.$emit('requests', [...requests]);
    await flushPromises();
    expect(form.findAll('input[aria-label="Số lượng linh kiện"]')).toHaveLength(1);
    expect((form.get('input[aria-label="Số lượng linh kiện"]').element as HTMLInputElement).value).toBe('1');
    await form.get('[aria-label="Xoá dòng này"]').trigger('click');
    w.findComponent(Parts).vm.$emit('requests', [...requests]);
    await flushPromises();
    expect(w.find('input[aria-label="Số lượng linh kiện"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    w.unmount();
  });
  it('visibly blocks submission when a received SKU outside the first catalog page cannot be resolved, then retries by ID', async () => {
    missingCatalog = true;
    const w = await open();
    expect(w.get('[data-testid="quote-stock-error"]').text()).toContain('Chưa đọc đủ đơn giá hoặc bảo hành');
    const submit = w.findAll('button').find(button => button.text() === 'Gửi báo giá cho khách duyệt');
    expect(submit?.attributes('disabled')).toBeDefined();
    missingCatalog = false;
    await w.get('[data-testid="quote-stock-error"] button').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="quote-stock-error"]').exists()).toBe(false);
    expect(w.get('[data-testid="quotation-form"]').text()).toContain('Van kho');
    w.unmount();
  });
  it('keeps approved self-owned parts and warehouse usage visible outside collapsed steps', async () => {
    const w = await open(true);
    expect(w.get('[data-testid="job-cost-summary"]').text()).toContain('Báo giá đã duyệt');
    expect(w.get('[data-testid="approved-parts"]').text()).toContain('Van riêng');
    expect(w.get('[data-testid="actual-parts"]').text()).toContain('Van kho');
    expect(w.get('[data-testid="actual-parts"]').text()).toContain('Chưa ghi nhận sử dụng');
    expect(w.find('[data-testid="quotation-form"]').exists()).toBe(false);
    w.unmount();
  });
});
