import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// PO 10/10/2026: each of the five steps opens to what happened in it, and a booking made through the AI
// flow offers the technician "Xem tóm tắt vấn đề từ AI" (customer words, photos, AI conclusion).
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'job-1' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }) }));
import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';

const stubs = {
  FhButton: { props: ['disabled', 'loading', 'variant'], template: '<button :disabled="disabled"><slot /></button>' },
  FhCard: { props: ['title'], template: '<section><slot /></section>' },
  FhStatusPill: { props: ['status'], template: '<span>{{ status }}</span>' },
  FhMoney: { props: ['amount'], template: '<span>{{ amount }} đ</span>' },
  FhCostBreakdown: { template: '<div />' },
  BookingMediaViewer: { props: ['media'], template: '<div data-testid="booking-media-viewer">{{ media.length }} ảnh</div>' },
  TechnicianPartsSection: { template: '<div />' },
};

const order = {
  id: 'job-1', code: 'FH-1', bookingId: 'booking-1', serviceName: 'Sửa quạt trần', status: 'UNDER_REPAIR',
  customerName: 'Khach Hang 1', customerPhone: '0904000001', addressSummary: '101 Lê Thánh Tôn, Quận 1',
  scheduledAt: '2026-10-10T02:00:00Z', laborTotal: 150000, partsTotal: 0, grandTotal: 150000, paymentStatus: 'UNPAID',
  createdAt: '2026-10-10T01:00:00Z', arrivalVerified: true, pricingMode: 'inspection_required',
  timeline: [{ status: 'en_route', title: '', timestamp: '2026-10-10T02:05:00Z', actor: 'technician' }],
  quotation: { id: 'q1', status: 'approved', laborTotal: 150000, partsTotal: 0, items: [{ type: 'LABOR', description: 'Thay bạc đạn', quantity: 1, unitPrice: 150000, lineTotal: 150000 }] },
};
const aiSummary = {
  deviceName: 'Quạt trần', customerText: 'cái quạt này kêu to và quay chậm', suspectedFaults: ['Khô bạc đạn, mòn bạc trục'],
  suggestedActions: ['Ngưng dùng để tránh kẹt trục làm cháy mô tơ'], conclusion: 'Có khả năng khô bạc đạn.', priceMin: 100000, priceMax: null,
  recommendedServiceName: 'Kiểm tra/chẩn đoán thiết bị tại nhà', photoCount: 1,
};
const mountPage = async (booking: Record<string, unknown>) => {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/service-orders/job-1') return { data: { data: order } };
    if (path === '/service-orders/job-1/cash-settlement') return { data: { data: null } };
    if (path === '/service-orders/job-1/evidence') return { data: { data: [{ id: 'e1', type: 'before', mediaUrl: 'https://img.test/before.jpg' }] } };
    if (path === '/bookings/booking-1') return { data: { data: { id: 'booking-1', status: 'matched', media: [{ id: 'm1', url: null, isPrivate: true, legacyInsecure: false, mimeType: 'image/jpeg', sizeBytes: 1 }], ...booking } } };
    return { data: { data: [] } };
  });
  const w = mount(TechnicianJobDetailPage, { global: { stubs }, attachTo: document.body });
  await flushPromises();
  return w;
};

describe('Technician job page: step details and AI summary', () => {
  beforeEach(() => mockGet.mockReset());

  it('opens each finished step to what happened in it', async () => {
    const w = await mountPage({ description: 'Quạt kêu to' });
    await w.get('[data-testid="steps-toggle"]').trigger('click');
    expect(w.find('[data-testid="step-detail-1"]').exists()).toBe(false);
    await w.get('[data-testid="step-row-1"]').trigger('click');
    expect(w.get('[data-testid="step-detail-1"]').text()).toContain('Xuất phát lúc');
    await w.get('[data-testid="step-row-2"]').trigger('click');
    expect(w.find('[data-testid="step-detail-1"]').exists()).toBe(false);
    expect(w.get('[data-testid="step-detail-2"]').text()).toContain('Đã check-in');
    expect(w.get('[data-testid="step-detail-2"] img').attributes('src')).toBe('https://img.test/before.jpg');
    await w.get('[data-testid="step-row-3"]').trigger('click');
    const quote = w.get('[data-testid="step-detail-3"]').text();
    expect(quote).toContain('Khách đã duyệt');
    expect(quote).toContain('Thay bạc đạn');
    expect(w.get('[data-testid="step-row-5"]').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('shows what the customer wrote, and the AI summary only for an AI booking', async () => {
    const plain = await mountPage({ description: 'Quạt kêu to' });
    expect(plain.get('[data-testid="booking-description"]').text()).toContain('Quạt kêu to');
    expect(plain.find('[data-testid="ai-summary-button"]').exists()).toBe(false);
    plain.unmount();

    const ai = await mountPage({ description: 'cái quạt này kêu to và quay chậm', aiSummary });
    await ai.get('[data-testid="ai-summary-button"]').trigger('click');
    const dialog = ai.get('[data-testid="ai-summary-dialog"]').text().replace(/\s+/g, ' ');
    for (const piece of ['cái quạt này kêu to và quay chậm', 'Quạt trần', 'Khô bạc đạn, mòn bạc trục', 'Ngưng dùng', 'Có khả năng khô bạc đạn.', 'gợi ý sơ bộ']) {
      expect(dialog).toContain(piece);
    }
    expect(ai.get('[data-testid="ai-summary-dialog"] [data-testid="booking-media-viewer"]').text()).toContain('1 ảnh');
    ai.unmount();
  });
});
