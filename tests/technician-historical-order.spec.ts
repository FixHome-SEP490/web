import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'synthetic-old-order' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }) }));
import { ordersApi, isHistoricalOrder } from '../src/api/orders.api';
import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';
import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';

const historical = {
  id: 'synthetic-old-order', code: 'SO-OLD', status: 'ACCEPTED', historical: true,
  createdAt: '2030-01-01T00:00:00Z', completedAt: null, cancelledAt: null,
};
const full = {
  id: 'synthetic-current-order', bookingId: 'booking-private', code: 'SO-CURRENT',
  status: 'ACCEPTED', paymentStatus: 'UNPAID', laborTotal: 0, partsTotal: 0, grandTotal: 0,
  customerPhone: 'SYNTHETIC_PRIVATE_PHONE', addressSummary: 'SYNTHETIC_PRIVATE_ADDRESS',
};
beforeEach(() => { mockGet.mockReset(); });
describe('historical ServiceOrder Web adapter keeps private-free summary separate', () => {
  it('distinguishes historical and current orders without inventing customer or payment fields', async () => {
    mockGet.mockResolvedValue({ data: { data: [historical, full] } });
    const result = await ordersApi.getTechnicianJobs();
    expect(mockGet).toHaveBeenCalledWith('/service-orders/my');
    expect(result).toHaveLength(2);
    expect(isHistoricalOrder(result[0])).toBe(true);
    expect(isHistoricalOrder(result[1])).toBe(false);
    expect(result[0]).toEqual(historical);
    expect(JSON.stringify(result[0])).not.toMatch(/bookingId|address|phone|paymentStatus|SYNTHETIC_PRIVATE/);
  });
  it('renders a read-only history card without customer contact or workspace controls', async () => {
    mockGet.mockResolvedValue({ data: { data: [historical] } });
    const wrapper = mount(TechnicianJobsPage, { global: { stubs: { FhButton: true, FhMoney: true, FhCostBreakdown: true } } });
    await flushPromises();
    const card = wrapper.find('[data-testid="technician-historical-order"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('SO-OLD');
    expect(card.text()).not.toMatch(/PRIVATE|SYNTHETIC_PRIVATE|Địa chỉ|Điện thoại/);
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Vào Workspace');
    expect(wrapper.text()).not.toContain('Nhắn tin');
    wrapper.unmount();
  });
  it('shows historical detail without requesting live job financial, GPS or customer data', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path !== '/service-orders/synthetic-old-order') throw new Error('Unexpected private endpoint ' + path);
      return { data: { data: historical } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs: { FhButton: true, FhCard: true, FhStatusPill: true, FhMoney: true, FhCostBreakdown: true } } });
    await flushPromises();
    const history = wrapper.find('[data-testid="technician-historical-detail"]');
    expect(history.exists()).toBe(true);
    expect(history.text()).toContain('SO-OLD');
    expect(wrapper.text()).not.toContain('Nhắn tin cho khách');
    expect(wrapper.text()).not.toContain('Khai báo đã thu tiền mặt');
    expect(mockGet).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });  it('reads historical detail without manufacturing full order fields', async () => {
    mockGet.mockResolvedValue({ data: { data: historical } });
    const value = await ordersApi.getTechnicianOrder('synthetic-old-order');
    expect(isHistoricalOrder(value)).toBe(true);
    expect(value).toEqual(historical);
  });
});