// Lists that used to stop silently at the server's first 20 rows (PO 12/10/2026):
// each now asks for a page and shows the numbered pager.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

const { mockGet, mockPost, push } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), push: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet, post: mockPost } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({ params: {}, query: {} }) }));
const notifStore = vi.hoisted(() => ({ unreadCount: 2, markAsRead: vi.fn(), markAllAsRead: vi.fn(), fetchUnreadCount: vi.fn() }));
vi.mock('../src/stores/notifications.store', () => ({ useNotificationsStore: () => notifStore }));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }),
}));

import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';
import CustomerWarrantiesPage from '../src/pages/customer/CustomerWarrantiesPage.vue';
import ConsoleOrdersPage from '../src/pages/console/ConsoleOrdersPage.vue';
import ConsoleBookingsPage from '../src/pages/console/ConsoleBookingsPage.vue';
import ConsoleCancellationsPage from '../src/pages/console/ConsoleCancellationsPage.vue';
import ServiceAreasPage from '../src/pages/console/ServiceAreasPage.vue';
import CustomerNotificationsPage from '../src/pages/customer/CustomerNotificationsPage.vue';

type Params = Record<string, unknown> & { page?: number; pageSize?: number; status?: string };
const stubs = {
  'router-link': RouterLinkStub,
  RouterLink: RouterLinkStub,
  WarrantyClaimCard: true,
  WarrantyClaimModal: true,
  FhConfirmDialog: true,
};

const order = (id: string, status = 'accepted', extra: Record<string, unknown> = {}) => ({
  id, code: `SO-${id}`, bookingId: `b-${id}`, status, serviceName: `Dịch vụ ${id}`, customerName: 'Khách A',
  customerPhone: '0901234567', addressSummary: '1 Lê Lợi, Quận 1', scheduledAt: '2030-01-01T01:00:00Z',
  laborTotal: 100000, partsTotal: 20000, grandTotal: 120000, paymentStatus: 'unpaid', createdAt: '2030-01-01T00:00:00Z',
  ...extra,
});
const many = (prefix: string, count: number, status = 'accepted') => Array.from({ length: count }, (_, i) => order(`${prefix}${i + 1}`, status));
const listed = (rows: unknown[], total: number) => ({ data: { data: rows, meta: { total } } });
const paramsOf = (url: string) => mockGet.mock.calls.filter(([u]) => u === url).map(([, opts]) => (opts as { params: Params }).params);

beforeEach(() => {
  mockGet.mockReset(); mockPost.mockReset(); push.mockReset();
});

describe('Technician jobs', () => {
  it('asks for 20 jobs a page, keeps the old tabs with their counts, and pages with numbers', async () => {
    mockGet.mockImplementation(async (_url: string, opts: { params: Params }) => {
      const states = (opts.params.statuses as string | undefined) ?? opts.params.status;
      if (opts.params.pageSize === 1) return listed([], { 'accepted,en_route': 3, under_repair: 1, completed: 0 }[states as string] ?? 25);
      if (states === 'accepted,en_route') return listed([order('r1', 'en_route')], 1);
      return listed(opts.params.page === 2 ? many('p2-', 5) : many('p1-', 20), 25);
    });
    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();
    const lists = () => paramsOf('/service-orders/my').filter((p) => p.pageSize === 20);
    expect(lists()).toEqual([{ page: 1, pageSize: 20 }]);
    expect(wrapper.findAll('[data-testid^="technician-job-"]')).toHaveLength(20);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 25');
    // The tabs as before: "Cần di chuyển" is accepted and en route together; empty tabs show no count.
    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text().replace(/\s+/g, ' ').trim());
    expect(tabs).toEqual(['Tất cả 25', 'Cần di chuyển 3', 'Đang sửa chữa 1', 'Hoàn thành']);

    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(lists().at(-1)).toEqual({ page: 2, pageSize: 20 });
    expect(wrapper.findAll('[data-testid^="technician-job-"]')).toHaveLength(5);

    const tab = wrapper.findAll('[role="tab"]').find((t) => t.text().startsWith('Cần di chuyển'))!;
    await tab.trigger('click');
    await flushPromises();
    expect(lists().at(-1)).toEqual({ page: 1, pageSize: 20, statuses: 'accepted,en_route' });
    expect(wrapper.findAll('[data-testid^="technician-job-"]').map((r) => r.attributes('data-testid'))).toEqual(['technician-job-r1']);
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });

  it('keeps old orders in the server order, as short summaries', async () => {
    mockGet.mockResolvedValue(listed([order('new'), { id: 'old', code: 'SO-OLD', status: 'completed', historical: true, createdAt: '2029-01-01T00:00:00Z' }, order('newer')], 3));
    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();
    const rows = wrapper.findAll('ul > li').map((li) => li.attributes('data-testid'));
    expect(rows).toEqual(['technician-job-new', 'technician-historical-order', 'technician-job-newer']);
  });
});

describe('Customer warranties', () => {
  it('reads ten completed orders a page and the warranties of those orders only', async () => {
    const completed = many('c', 10, 'completed');
    mockGet.mockImplementation(async (url: string, opts?: { params: Params }) => {
      if (url === '/service-orders/my') {
        return opts!.params.page === 1 ? listed(completed, 12) : listed([order('c11', 'completed'), order('c12', 'completed')], 12);
      }
      if (url.endsWith('/warranty-claims')) return { data: { data: [] } };
      const id = url.split('/')[2];
      // Only some orders carry a warranty.
      return { data: { data: ['c1', 'c2', 'c11'].includes(id) ? [{ id: `w-${id}`, startsAt: '2030-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', status: 'active' }] : [] } };
    });
    const wrapper = mount(CustomerWarrantiesPage, { global: { stubs } });
    await flushPromises();

    expect(paramsOf('/service-orders/my')).toEqual([{ page: 1, pageSize: 10, status: 'completed' }]);
    const warrantyCalls = mockGet.mock.calls.map(([u]) => u as string).filter((u) => u.endsWith('/warranties'));
    expect(warrantyCalls).toHaveLength(10);
    expect(warrantyCalls.every((u) => completed.some((o) => u === `/service-orders/${o.id}/warranties`))).toBe(true);
    expect(wrapper.findAll('[data-testid^="warranty-order-"]').map((s) => s.attributes('data-testid'))).toEqual(['warranty-order-c1', 'warranty-order-c2']);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–10 / 12');

    mockGet.mockClear();
    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(paramsOf('/service-orders/my')).toEqual([{ page: 2, pageSize: 10, status: 'completed' }]);
    expect(mockGet.mock.calls.map(([u]) => u as string).filter((u) => u.endsWith('/warranties'))).toEqual([
      '/service-orders/c11/warranties',
      '/service-orders/c12/warranties',
    ]);
    expect(wrapper.findAll('[data-testid^="warranty-order-"]').map((s) => s.attributes('data-testid'))).toEqual(['warranty-order-c11']);
  });

  it('tells a page without warranties apart from no warranty at all', async () => {
    mockGet.mockImplementation(async (url: string) =>
      url === '/service-orders/my' ? listed(many('c', 10, 'completed'), 14) : { data: { data: [] } },
    );
    const wrapper = mount(CustomerWarrantiesPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="warranties-page-empty"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Chưa có đơn nào đang được bảo hành');
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
  });
});

describe('Console orders', () => {
  it('pages the board on the server, by state and by a search on code, customer and service', async () => {
    vi.useFakeTimers();
    try {
      mockGet.mockImplementation(async (_url: string, opts: { params: Params }) => listed(many(`p${opts.params.page}-`, opts.params.page === 3 ? 7 : 20), 47));
      const wrapper = mount(ConsoleOrdersPage, { global: { stubs } });
      await flushPromises();
      expect(paramsOf('/service-orders')).toEqual([{ page: 1, pageSize: 20 }]);
      expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 47');
      expect(wrapper.text()).toContain('47');

      await wrapper.get('[data-testid="pagination-page-3"]').trigger('click');
      await flushPromises();
      expect(paramsOf('/service-orders').at(-1)).toEqual({ page: 3, pageSize: 20 });
      expect(wrapper.findAll('tbody tr')).toHaveLength(7);

      await wrapper.get('select').setValue('COMPLETED');
      await flushPromises();
      expect(paramsOf('/service-orders').at(-1)).toEqual({ page: 1, pageSize: 20, status: 'completed' });

      expect(wrapper.get('input[type="search"]').attributes('placeholder')).toBe('Tìm mã đơn, khách hàng, dịch vụ');
      await wrapper.get('input[type="search"]').setValue('nguyen van a');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();
      expect(paramsOf('/service-orders').at(-1)).toEqual({ page: 1, pageSize: 20, status: 'completed', search: 'nguyen van a' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Console cancellations', () => {
  it('asks for a page at a time and shows the pager', async () => {
    const row = (id: string) => ({ id, serviceOrderId: 'o', actor: 'customer', actorUserId: 'u', reason: 'x', stateAtCancel: 'accepted', strikeApplied: false, compensationStatus: 'pending_review', createdAt: '2026-10-01T10:00:00Z', actorName: 'A', orderCode: `FH-${id}` });
    mockGet.mockImplementation(async (_url: string, opts: { params: Params }) =>
      listed(opts.params.page === 1 ? Array.from({ length: 20 }, (_, i) => row(`a${i}`)) : [row('last')], 21),
    );
    const wrapper = mount(ConsoleCancellationsPage, { global: { stubs } });
    await flushPromises();
    expect(paramsOf('/cancellations')).toEqual([{ page: 1, pageSize: 20 }]);
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(paramsOf('/cancellations').at(-1)).toEqual({ page: 2, pageSize: 20 });
    expect(wrapper.text()).toContain('FH-last');
  });
});

describe('Console bookings to assign', () => {
  it('keeps "Cần gán thợ" and "Đã quá hạn", sorted by appointment and paged on the server', async () => {
    const booking = (id: string, status: string, preferredStartAt: string) => ({
      id, status, serviceName: `Dịch vụ ${id}`, addressSummary: 'Quận 1', preferredStartAt, createdAt: '2026-10-01T00:00:00Z',
    });
    mockGet.mockImplementation(async (_url: string, opts: { params: Params }) => {
      const overdue = opts.params.overdue === 'true';
      if (opts.params.pageSize === 1) return listed([], overdue ? 4 : 31);
      if (overdue) return listed([booking('late', 'closed', '2020-01-01T00:00:00Z')], 4);
      return listed([booking(`s${opts.params.page}`, 'submitted', '2099-01-01T00:00:00Z')], 31);
    });
    const wrapper = mount(ConsoleBookingsPage, { global: { stubs } });
    await flushPromises();
    const lists = () => paramsOf('/bookings').filter((p) => p.pageSize === 20);
    const view = { statuses: 'submitted,matching,closed', sort: 'appointment' };
    expect(lists()).toEqual([{ page: 1, pageSize: 20, ...view, overdue: 'false' }]);
    const tabs = wrapper.findAll('[role="tab"]').map((t) => t.text().replace(/\s+/g, ' ').trim());
    expect(tabs).toEqual(['Cần gán thợ 31', 'Đã quá hạn 4']);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 31');
    expect(wrapper.text()).toContain('Gán thợ');

    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(lists().at(-1)).toEqual({ page: 2, pageSize: 20, ...view, overdue: 'false' });

    await wrapper.findAll('[role="tab"]')[1].trigger('click');
    await flushPromises();
    expect(lists().at(-1)).toEqual({ page: 1, pageSize: 20, ...view, overdue: 'true' });
    // A request whose time has passed cannot be assigned any more.
    expect(wrapper.text()).toContain('Chờ khách đặt lại');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Gán thợ')).toBe(false);
  });
});

describe('Service areas', () => {
  it('pages the loaded list 20 rows at a time and starts again after a filter', async () => {
    const areas = Array.from({ length: 45 }, (_, i) => ({
      id: `a${i}`, provinceCode: i < 30 ? '01' : '79', provinceName: i < 30 ? 'Hà Nội' : 'TP. Hồ Chí Minh',
      districtCode: `D${i}`, districtName: `Quận ${i}`, isActive: true,
    }));
    mockGet.mockResolvedValue({ data: { data: areas } });
    const wrapper = mount(ServiceAreasPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(20);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 45');
    await wrapper.get('[data-testid="pagination-page-3"]').trigger('click');
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);

    await wrapper.get('select').setValue('79');
    await flushPromises();
    expect(wrapper.findAll('tbody tr')).toHaveLength(15);
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });
});

describe('Customer notifications', () => {
  it('reads 20 notifications a page and pages with numbers instead of stopping at 50', async () => {
    const note = (id: string) => ({ id, title: `Thông báo ${id}`, message: 'Nội dung', isRead: true, type: 'ORDER_COMPLETED', createdAt: '2026-10-01T00:00:00Z' });
    mockGet.mockImplementation(async (_url: string, opts: { params: Params }) => ({
      data: { data: opts.params.page === 1 ? Array.from({ length: 20 }, (_, i) => note(`a${i}`)) : [note('z')], meta: { page: opts.params.page, limit: 20, total: 21 } },
    }));
    const wrapper = mount(CustomerNotificationsPage, { global: { stubs } });
    await flushPromises();
    expect(paramsOf('/notifications')).toEqual([{ page: 1, limit: 20 }]);
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 21');
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(paramsOf('/notifications').at(-1)).toEqual({ page: 2, limit: 20 });
    expect(wrapper.findAll('[data-testid^="notification-"]').map((n) => n.attributes('data-testid'))).toContain('notification-z');
  });

  it('shows a retry line when the list cannot be read', async () => {
    mockGet.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    const wrapper = mount(CustomerNotificationsPage, { global: { stubs } });
    await flushPromises();
    const error = wrapper.get('[data-testid="notifications-load-error"]');
    expect(error.text()).toContain('Thử lại');
    expect(wrapper.text()).not.toContain('500');
  });
});
