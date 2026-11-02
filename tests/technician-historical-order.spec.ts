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
    expect(wrapper.text()).not.toContain('Mở công việc');
    expect(wrapper.text()).not.toContain('Nhắn tin');
    wrapper.unmount();
  });
  it('an open order the technician stepped off reads as left, not as on the way', async () => {
    const left = { ...historical, id: 'left', status: 'en_route' };
    const finished = { ...historical, id: 'finished', code: 'SO-DONE', status: 'completed' };
    mockGet.mockResolvedValue({ data: { data: [left, finished] } });
    const wrapper = mount(TechnicianJobsPage, { global: { stubs: { FhButton: true, FhMoney: true, FhCostBreakdown: true } } });
    await flushPromises();
    const [leftCard, doneCard] = wrapper.findAll('[data-testid="technician-historical-order"]');
    expect(leftCard.text()).toContain('Bạn đã rời đơn');
    expect(leftCard.text()).toContain('Bạn không còn phụ trách đơn này');
    expect(leftCard.text()).not.toContain('Đang di chuyển');
    expect(doneCard.text()).toContain('Hoàn thành');
    expect(doneCard.text()).toContain('Đơn cũ, chỉ xem tóm tắt.');
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
it('requests guarded withdrawn history including grouped children and strips all private fields', async () => {
 const id = '11111111-1111-4111-8111-111111111111';
 mockGet.mockResolvedValue({ data: { data: [{ ...historical, id, status: 'under_repair', workStopped: true, operationalDisposition: 'STOPPED', ...{ customerPhone: 'PRIVATE', addressSummary: 'PRIVATE', destination: { lat: 10 }, bookingId: 'PRIVATE', visitGroupId: 'PRIVATE' } }], meta: { total: 1 } } });
 const page = await ordersApi.getTechnicianHistoryPage(1, 20);
 expect(mockGet).toHaveBeenCalledWith('/service-orders/my', { params: { page: 1, pageSize: 20, history: 'withdrawn' } });
 expect(page.items[0]).toMatchObject({ id, historical: true, status: 'UNDER_REPAIR', workStopped: true });
 expect(JSON.stringify(page.items)).not.toMatch(/PRIVATE|bookingId|address|destination|Phone|visitGroupId/);
});
it.each([{ ...historical, id: '../private' }, { ...historical, status: 'new_state' }, { ...historical, historical: false }])('rejects an unverified withdrawn history row %o', async row => {
 mockGet.mockResolvedValue({ data: { data: [row], meta: { total: 1 } } });
 await expect(ordersApi.getTechnicianHistoryPage(1, 20)).rejects.toThrow();
});
it('opens explicit history while keeping active tabs separate and has no customer actions', async () => {
 mockGet.mockImplementation(async (_url: string, options?: { params?: { history?: string } }) => ({ data: { data: options?.params?.history ? [{ ...historical, id: '11111111-1111-4111-8111-111111111111' }] : [], meta: { total: options?.params?.history ? 1 : 0 } } }));
 const w = mount(TechnicianJobsPage); await flushPromises();
 await w.get('[data-testid="jobs-list-switch-history"]').trigger('click'); await flushPromises();
 expect(w.text()).toContain('Đã rút, hủy'); expect(w.text()).toContain('SO-OLD');
 expect(w.find('a[href^="tel:"]').exists()).toBe(false); expect(w.text()).not.toContain('Nhắn tin');
 w.unmount();
});
