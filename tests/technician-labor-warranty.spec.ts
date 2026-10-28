import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// PO 10/10/2026: the order takes the technician's default labor warranty when they accept it;
// the quote starts from it and the technician can change it for this job.
const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
const live = vi.hoisted(() => ({ listeners: new Map<string, (event: { kinds?: string[] }) => void>() }));
vi.mock('../src/services/live-updates', () => ({
  afterRunningRead: async () => undefined,
  onOrderChange: (id: string, fn: (event: { kinds?: string[] }) => void) => { live.listeners.set(id, fn); return () => live.listeners.delete(id); },
  onResync: () => () => undefined,
  whileOffline: () => () => undefined,
}));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: mockPost, patch: vi.fn(), delete: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'job-1' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }) }));
import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
import { ordersApi } from '../src/api/orders.api';

const stubs = {
  FhButton: { props: ['disabled', 'loading', 'variant'], template: '<button :disabled="disabled"><slot /></button>' },
  FhCard: { props: ['title'], template: '<section><slot /></section>' },
  FhStatusPill: { props: ['status'], template: '<span>{{ status }}</span>' },
  FhMoney: { props: ['amount'], template: '<span>{{ amount }} đ</span>' },
  FhCostBreakdown: { template: '<div />' },
  BookingMediaViewer: { template: '<div />' },
  TechnicianPartsSection: { name: 'TechnicianPartsSection', template: '<div />' },
};

const base = {
  id: 'job-1', code: 'FH-1', bookingId: 'booking-1', serviceName: 'Sửa quạt trần', status: 'EN_ROUTE',
  customerName: 'Khach Hang 1', customerPhone: '0904000001', addressSummary: '101 Lê Thánh Tôn, Quận 1',
  scheduledAt: '2026-10-10T02:00:00Z', laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID',
  createdAt: '2026-10-10T01:00:00Z', arrivalVerified: true, pricingMode: 'inspection_required', laborWarrantyDays: 90,
  timeline: [{ status: 'en_route', title: '', timestamp: '2026-10-10T02:05:00Z', actor: 'technician' }],
};

const mountPage = async (order: Record<string, unknown>) => {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/service-orders/job-1') return { data: { data: order } };
    if (path === '/service-orders/job-1/cash-settlement' || path === '/service-orders/job-1/invoice') return { data: { data: null } };
    if (path === '/service-orders/job-1/evidence') return { data: { data: [{ id: 'e1', type: 'before', mediaUrl: 'https://img.test/before.jpg' }] } };
    if (path === '/bookings/booking-1') return { data: { data: { id: 'booking-1', status: 'matched', media: [] } } };
    return { data: { data: [] } };
  });
  mockPost.mockResolvedValue({ data: { data: {} } });
  const w = mount(TechnicianJobDetailPage, { global: { stubs }, attachTo: document.body });
  await flushPromises();
  return w;
};

const submitQuote = async (w: Awaited<ReturnType<typeof mountPage>>) => {
  const send = w.findAll('button').find((b) => b.text().includes('Gửi báo giá cho khách duyệt'))!;
  await send.trigger('click');
  await flushPromises();
};

describe('Technician labor warranty on the job page', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  it('starts the quote from the order warranty and sends it on every labor line', async () => {
    const w = await mountPage(base);
    const form = w.get('[data-testid="quotation-form"]');
    const days = form.get('[data-testid="quote-labor-warranty"] input');
    expect((days.element as HTMLInputElement).value).toBe('90');

    await form.findAll('button').find(b => b.text().includes('Thêm công thợ'))!.trigger('click');
    const [description, price] = form.findAll('input').slice(0, 2);
    await description.setValue('Thay bạc đạn');
    await price.setValue(150000);
    await days.setValue(120);
    await submitQuote(w);

    const [path, body] = mockPost.mock.calls.find(([p]) => p === '/service-orders/job-1/quotations')!;
    expect(path).toBe('/service-orders/job-1/quotations');
    expect(body.items[0]).toMatchObject({ type: 'labor', description: 'Thay bạc đạn', warrantyDays: 120 });
    w.unmount();
  });

  it('refuses more than 365 days without calling the server', async () => {
    const w = await mountPage(base);
    await w.get('[data-testid="quote-labor-warranty"] input').setValue(400);
    await submitQuote(w);

    expect(mockPost.mock.calls.some(([p]) => p === '/service-orders/job-1/quotations')).toBe(false);
    expect(w.get('[data-testid="quote-labor-warranty"] input').classes()).toContain('border-danger-500');
    w.unmount();
  });

  it('shows the labor warranty of a fixed-price job in its step', async () => {
    const w = await mountPage({ ...base, pricingMode: 'fixed_price', status: 'UNDER_REPAIR', fixedUnitPrice: 200000, quantity: 1, laborWarrantyDays: 45 });
    await w.get('[data-testid="steps-toggle"]').trigger('click');
    await w.get('[data-testid="step-row-3"]').trigger('click');
    expect(w.get('[data-testid="fixed-labor-warranty"]').text()).toContain('Bảo hành công 45');
    w.unmount();
  });

  it('keeps empty, canceled and removed quotations neutral without a POST', async () => {
    const w = await mountPage(base);
    const send = () => w.findAll('button').find(b => b.text().includes('Gửi báo giá cho khách duyệt'))!;
    expect(send().attributes('disabled')).toBeDefined();
    await submitQuote(w);
    await w.findAll('button').find(b => b.text().includes('Thêm công thợ'))!.trigger('click');
    await w.get('input[aria-label="Mô tả công việc"]').setValue('Kiểm tra máy');
    await w.get('input[aria-label="Đơn giá"]').setValue(100000);
    expect(send().attributes('disabled')).toBeUndefined();
    await w.get('button[aria-label="Xoá dòng này"]').trigger('click');
    expect(w.find('[data-testid="quotation-form"]').exists()).toBe(false);
    await w.findAll('button').find(b => b.text() === 'Tạo báo giá')!.trigger('click');
    expect(send().attributes('disabled')).toBeDefined();
    await w.findAll('button').find(b => b.text() === 'Thêm linh kiện')!.trigger('click');
    expect(send().attributes('disabled')).toBeDefined();
    await w.findAll('button').find(b => b.text() === 'Hủy báo giá')!.trigger('click');
    expect(w.find('[aria-label="Nguồn linh kiện"]').exists()).toBe(false);
    expect(w.find('[data-testid="quotation-form"]').exists()).toBe(false);
    await w.findAll('button').find(b => b.text() === 'Tạo báo giá')!.trigger('click');
    expect(send().attributes('disabled')).toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
    w.unmount();
  });

  it('uses the shared FixHome picker for the first EN_ROUTE quote and locks the catalog price', async () => {
    const w = await mountPage(base);
    const previous = mockGet.getMockImplementation()!;
    mockGet.mockImplementation(async (path, config) => path === '/parts/catalog'
      ? { data: { data: [{ id: 'part-792', name: 'Van xả', sku: 'VAN', sellingPrice: 65000, warrantyDays: 30 }], meta: { total: 792 } } }
      : previous(path, config));
    await w.findAll('button').find(b => b.text() === 'Thêm linh kiện')!.trigger('click');
    await flushPromises();
    expect(mockGet).toHaveBeenCalledWith('/parts/catalog', { params: { page: 1, limit: 50 } });
    expect(w.get('[role="dialog"]').text()).toContain('792 linh kiện');
    await w.get('[role="dialog"] li button').trigger('click');
    await w.get('input[aria-label="Số lượng linh kiện"]').setValue(2);
    expect(w.get('input[aria-label="Đơn giá"]').attributes('disabled')).toBeDefined();
    await submitQuote(w);
    const body = mockPost.mock.calls.find(([path]) => path.endsWith('/quotations'))![1];
    expect(body.items[0]).toMatchObject({ type: 'parts_equipment', partSource: 'fixhome', partCatalogId: 'part-792', unitPrice: 65000, quantity: 2 });
    w.unmount();
  });

  it('does not offer technician-owned parts or freeform parts in a new quote', async () => {
    const w = await mountPage(base);
    const previous = mockGet.getMockImplementation()!;
    mockGet.mockImplementation(async (path, config) => path === '/parts/catalog'
      ? { data: { data: [{ id: 'part-1', name: 'Van xả', sellingPrice: 65000 }], meta: { total: 1 } } }
      : previous(path, config));
    await w.findAll('button').find(b => b.text() === 'Thêm linh kiện')!.trigger('click');
    await flushPromises();
    await w.get('[role="dialog"] li button').trigger('click');
    const form = w.get('[data-testid="quotation-form"]');
    expect(form.find('select[aria-label="Nguồn linh kiện"]').exists()).toBe(false);
    expect(form.find('input[aria-label="Tên linh kiện"]').exists()).toBe(false);
    expect(form.text()).not.toContain('Kỹ thuật viên tự có');
    expect(w.get('input[aria-label="Đơn giá"]').attributes('disabled')).toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
    w.unmount();
  });

  it('refreshes customer quote approval and payment without reloading the page', async () => {
    const order = { ...base, quotation: { id: 'q1', status: 'sent', items: [] } };
    const w = await mountPage(order);
    expect(w.get('[data-testid="job-now"]').text()).toContain('Chờ khách duyệt báo giá');
    Object.assign(order, { status: 'UNDER_REPAIR', quotation: { id: 'q1', status: 'approved', items: [] } });
    live.listeners.get('job-1')!({ kinds: ['quotation', 'status'] });
    await flushPromises();
    expect(w.get('[data-testid="job-now"]').text()).toContain('Đang sửa chữa');
    Object.assign(order, { status: 'COMPLETED', paymentStatus: 'PAID' });
    live.listeners.get('job-1')!({ kinds: ['invoice', 'status'] });
    await flushPromises();
    expect(w.get('[data-testid="job-now"]').text()).toContain('Đơn đã hoàn thành');
    expect(mockPost).not.toHaveBeenCalled();
    w.unmount();
    expect(live.listeners.size).toBe(0);
  });

  it('shows actionable pending usage only during repair and does not block the first quote', async () => {
    const w = await mountPage(base);
    const parts = w.findComponent({ name: 'TechnicianPartsSection' });
    parts.vm.$emit('pending-usage', 1);
    await flushPromises();
    expect(w.find('[data-testid="pending-parts-usage"]').exists()).toBe(false);
    await w.findAll('button').find(b => b.text().includes('Thêm công thợ'))!.trigger('click');
    await w.get('input[aria-label="Mô tả công việc"]').setValue('Sửa máy');
    await w.get('input[aria-label="Đơn giá"]').setValue(100000);
    expect(w.findAll('button').find(b => b.text().includes('Gửi báo giá cho khách duyệt'))!.attributes('disabled')).toBeUndefined();
    Object.assign(base, { status: 'UNDER_REPAIR' });
    live.listeners.get('job-1')!({ kinds: ['status'] });
    await flushPromises();
    expect(w.get('[data-testid="pending-parts-usage"]').text()).toContain('Ghi nhận đã dùng hoặc hoàn trả');
    base.status = 'EN_ROUTE';
    w.unmount();
  });

  it('keeps the paid completed job visible while waiting for a physical return, and clears the banner on acceptance', async () => {
    const w = await mountPage({ ...base, status: 'COMPLETED', paymentStatus: 'PAID' });
    const parts = w.findComponent({ name: 'TechnicianPartsSection' });
    parts.vm.$emit('returns-known', true);
    parts.vm.$emit('return-summary', { needDeclare: 2, awaitingManager: 0 });
    parts.vm.$emit('pending-returns', 2);
    await flushPromises();
    expect(w.get('[data-testid="pending-parts-returns"]').text()).toContain('Còn 2 linh kiện cần trả kho');
    expect(w.get('[data-testid="job-now"]').text()).toContain('Đơn đã hoàn thành');
    parts.vm.$emit('pending-returns', 0);
    await flushPromises();
    expect(w.find('[data-testid="pending-parts-returns"]').exists()).toBe(false);
    w.unmount();
  });

  it('gives the customer the labor warranty of each quote line and of the order', async () => {
    mockGet.mockResolvedValue({ data: { data: { ...base, status: 'arrived', paymentStatus: 'unpaid', quotation: {
      id: 'q1', status: 'pending', laborTotal: 150000, partsTotal: 0,
      items: [{ type: 'labor', description: 'Thay bạc đạn', quantity: 1, unitPrice: 150000, lineTotal: 150000, warrantyDaysSnapshot: 90 }],
    } } } });
    const order = await ordersApi.getOrder('job-1');
    expect(order.laborWarrantyDays).toBe(90);
    expect(order.quotation?.items[0]).toMatchObject({ type: 'LABOR', warrantyDays: 90 });
  });
});
