import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// PO 10/10/2026: the order takes the technician's default labor warranty when they accept it;
// the quote starts from it and the technician can change it for this job.
const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
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
  TechnicianPartsSection: { template: '<div />' },
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
    if (path === '/service-orders/job-1/cash-settlement') return { data: { data: null } };
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
    expect(w.text()).toContain('Bảo hành công từ 0 đến 365 ngày.');
    w.unmount();
  });

  it('shows the labor warranty of a fixed-price job in its step', async () => {
    const w = await mountPage({ ...base, pricingMode: 'fixed_price', status: 'UNDER_REPAIR', fixedUnitPrice: 200000, quantity: 1, laborWarrantyDays: 45 });
    await w.get('[data-testid="steps-toggle"]').trigger('click');
    await w.get('[data-testid="step-row-3"]').trigger('click');
    expect(w.get('[data-testid="fixed-labor-warranty"]').text()).toContain('Bảo hành công 45');
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
