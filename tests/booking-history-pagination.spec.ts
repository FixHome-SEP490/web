// tests/booking-history-pagination.spec.ts
// Customer "Đơn của tôi" with numbered pagination (PO 12/10/2026, replaces the
// "Xem thêm" lists of WEB-H01). Covers: page/pageSize sent to the server, one
// request with `statuses=` for tabs that span several states, server search,
// partial failure and retry, no fake empty state.
// Mocked API only: no real calls, no database writes, no logins.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { get: mockGet },
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    conversations: [],
    openConversationForBooking: vi.fn().mockResolvedValue(null),
    selectConversation: vi.fn(),
    toggleWidget: vi.fn(),
  }),
}));

import { bookingsApi } from '../src/api/bookings.api';
import { ordersApi } from '../src/api/orders.api';
import CustomerOrdersPage from '../src/pages/customer/CustomerOrdersPage.vue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Params = { page: number; pageSize: number; status?: string; statuses?: string; search?: string };

function makeBooking(overrides: Partial<{ id: string; status: string; createdAt: string; serviceName: string }> = {}) {
  return {
    id: overrides.id ?? 'b1',
    customerId: 'c1',
    serviceId: 's1',
    serviceName: overrides.serviceName ?? 'Sửa điều hoà',
    addressId: 'a1',
    addressSummary: '12 Nguyễn Huệ',
    description: 'Mô tả',
    preferredAt: '2026-10-01T08:00:00Z',
    urgency: 'NORMAL' as const,
    status: overrides.status ?? 'submitted',
    createdAt: overrides.createdAt ?? '2026-09-20T08:00:00Z',
  };
}

function makeOrder(overrides: Partial<{ id: string; bookingId: string; status: string; createdAt: string; code: string }> = {}) {
  return {
    id: overrides.id ?? 'o1',
    code: overrides.code ?? 'ORD-001',
    bookingId: overrides.bookingId ?? 'b1',
    serviceName: 'Sửa điều hoà',
    status: overrides.status ?? 'accepted',
    customerName: 'Nguyễn A',
    customerPhone: '0900000000',
    addressSummary: '12 Nguyễn Huệ',
    scheduledAt: '2026-10-01T08:00:00Z',
    laborTotal: 200000,
    partsTotal: 0,
    grandTotal: 200000,
    paymentStatus: 'unpaid',
    createdAt: overrides.createdAt ?? '2026-09-21T08:00:00Z',
  };
}

const response = (rows: unknown[], total: number) => ({ data: { data: rows, meta: { total } } });
/** Day `n` of September 2026, so a larger n is newer. */
const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}T08:00:00Z`;

/**
 * Serves `/service-orders/my` and `/bookings/my` from per-state lists like the
 * current server: one optional `status`, newest first, sliced by page and pageSize.
 */
function serve(
  orders: Record<string, ReturnType<typeof makeOrder>[]>,
  bookings: Record<string, ReturnType<typeof makeBooking>[]>,
) {
  const slice = <T>(rows: T[], { page, pageSize }: Params) => response(rows.slice((page - 1) * pageSize, page * pageSize), rows.length);
  const byNewest = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  mockGet.mockReset().mockImplementation(async (url: string, opts: { params: Params }) => {
    const source: Record<string, { createdAt: string; serviceName: string; code?: string }[]> = url === '/service-orders/my' ? orders : bookings;
    const states = opts.params.statuses?.split(',') ?? (opts.params.status ? [opts.params.status] : Object.keys(source));
    const q = opts.params.search?.toLowerCase();
    const rows = states
      .flatMap((state) => source[state] ?? [])
      .filter((row) => !q || `${row.code ?? ''} ${row.serviceName}`.toLowerCase().includes(q));
    return slice(byNewest(rows), opts.params);
  });
}

const calls = (url: string) =>
  mockGet.mock.calls.filter(([u]) => u === url).map(([, opts]) => (opts as { params: Params }).params);

async function mountPage() {
  const wrapper = mount(CustomerOrdersPage, { global: { stubs: { FhButton: true, FhCostBreakdown: true, FhMoney: true, RebookDialog: true } } });
  await flushPromises();
  return wrapper;
}

const cardIds = (wrapper: Awaited<ReturnType<typeof mountPage>>, prefix: 'order-card-' | 'booking-card-') =>
  wrapper.findAll(`[data-testid^="${prefix}"]`).map((card) => card.attributes('data-testid')!.slice(prefix.length));

// ─── API ──────────────────────────────────────────────────────────────────────

describe('bookingsApi.getMyBookingsPage', () => {
  beforeEach(() => { mockGet.mockReset(); });

  it('sends page and pageSize, the state in lower case, and reads the total from meta', async () => {
    mockGet.mockResolvedValueOnce(response([makeBooking({ status: 'cancelled' }), makeBooking({ id: 'b2', status: 'closed' })], 12));
    const result = await bookingsApi.getMyBookingsPage(2, 10, { statuses: ['CANCELLED', 'CLOSED'], search: ' điều hoà ' });
    expect(mockGet).toHaveBeenCalledWith('/bookings/my', { params: { page: 2, pageSize: 10, statuses: 'cancelled,closed', search: 'điều hoà' } });
    expect(result.total).toBe(12);
    expect(result.items.map((b) => b.status)).toEqual(['CANCELLED', 'CLOSED']);
  });

  it('leaves the state out when none is asked for', async () => {
    mockGet.mockResolvedValueOnce(response([], 0));
    await bookingsApi.getMyBookingsPage(1, 10);
    expect(mockGet).toHaveBeenCalledWith('/bookings/my', { params: { page: 1, pageSize: 10 } });
  });

  it('never makes up a larger total when meta is missing', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeBooking(), makeBooking({ id: 'b2' }), makeBooking({ id: 'b3' })] } });
    const result = await bookingsApi.getMyBookingsPage(2, 10);
    // Ten on page 1 plus the three on this page: no next page is claimed.
    expect(result.total).toBe(13);
  });
});

describe('ordersApi.getMyOrdersPage', () => {
  beforeEach(() => { mockGet.mockReset(); });

  it('sends page, pageSize and the state, and reads the total from meta', async () => {
    mockGet.mockResolvedValueOnce(response([makeOrder({ status: 'completed' })], 31));
    const result = await ordersApi.getMyOrdersPage(3, 10, { statuses: ['COMPLETED'] });
    expect(mockGet).toHaveBeenCalledWith('/service-orders/my', { params: { page: 3, pageSize: 10, status: 'completed' } });
    expect(result).toMatchObject({ total: 31, page: 3, pageSize: 10 });
    expect(result.items[0].status).toBe('COMPLETED');
  });
});

// ─── Page: what is asked for ──────────────────────────────────────────────────

describe('CustomerOrdersPage: requests per tab', () => {
  it('ALL asks for one page of orders and every unmatched booking state, never "matched"', async () => {
    serve(
      { accepted: [makeOrder({ id: 'o1', bookingId: 'bm' })] },
      {
        cancelled: [makeBooking({ id: 'bC', status: 'cancelled' })],
        closed: [makeBooking({ id: 'bCl', status: 'closed' })],
        matched: [makeBooking({ id: 'bm', status: 'matched' })],
      },
    );
    const wrapper = await mountPage();

    expect(calls('/service-orders/my')).toEqual([{ page: 1, pageSize: 10 }]);
    expect(calls('/bookings/my')).toEqual([
      { page: 1, pageSize: 10, status: 'submitted' },
      { page: 1, pageSize: 10, status: 'matching' },
      { page: 1, pageSize: 10, status: 'closed' },
      { page: 1, pageSize: 10, status: 'cancelled' },
    ]);
    // A matched booking shows as its order only.
    expect(wrapper.find('[data-testid="booking-card-bm"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="order-card-o1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Đã huỷ trước khi có thợ');
    expect(wrapper.text()).toContain('Chưa tìm được thợ, chờ hỗ trợ');
    expect(wrapper.get('[data-testid="history-tab-ALL"]').text()).toBe('Tất cả (3)');
  });

  it('CANCELLED, IN_PROGRESS and COMPLETED ask the server for their own states only', async () => {
    serve(
      { cancelled: [makeOrder({ id: 'oX', status: 'cancelled' })], under_repair: [makeOrder({ id: 'oR', status: 'under_repair' })] },
      { cancelled: [makeBooking({ id: 'bC', status: 'cancelled' })], matching: [makeBooking({ id: 'bM', status: 'matching' })] },
    );
    const wrapper = await mountPage();

    mockGet.mockClear();
    await wrapper.get('[data-testid="history-tab-CANCELLED"]').trigger('click');
    await flushPromises();
    expect(calls('/service-orders/my')).toEqual([{ page: 1, pageSize: 10, status: 'cancelled' }]);
    expect(calls('/bookings/my')).toEqual([{ page: 1, pageSize: 10, status: 'cancelled' }]);
    expect(cardIds(wrapper, 'order-card-')).toEqual(['oX']);
    expect(cardIds(wrapper, 'booking-card-')).toEqual(['bC']);

    mockGet.mockClear();
    await wrapper.get('[data-testid="history-tab-IN_PROGRESS"]').trigger('click');
    await flushPromises();
    // The strict Backend DTO accepts one status per request; the page merges them.
    expect(calls('/service-orders/my')).toEqual([
      { page: 1, pageSize: 10, status: 'accepted' },
      { page: 1, pageSize: 10, status: 'en_route' },
      { page: 1, pageSize: 10, status: 'under_repair' },
    ]);
    expect(calls('/bookings/my')).toEqual([
      { page: 1, pageSize: 10, status: 'submitted' },
      { page: 1, pageSize: 10, status: 'matching' },
    ]);
    expect(cardIds(wrapper, 'order-card-')).toEqual(['oR']);
    expect(cardIds(wrapper, 'booking-card-')).toEqual(['bM']);

    mockGet.mockClear();
    await wrapper.get('[data-testid="history-tab-COMPLETED"]').trigger('click');
    await flushPromises();
    expect(calls('/service-orders/my')).toEqual([{ page: 1, pageSize: 10, status: 'completed' }]);
    expect(calls('/bookings/my')).toEqual([]);
    expect(wrapper.get('[data-testid="history-empty-state"]').text()).toContain('Không có đơn ở mục này');
  });
});

// ─── Page: numbered pagination ────────────────────────────────────────────────

describe('CustomerOrdersPage: numbered pagination', () => {
  const orders25 = Array.from({ length: 25 }, (_, i) => makeOrder({ id: `o${i + 1}`, bookingId: `bo${i + 1}`, createdAt: day(i + 1), code: `ORD-${i + 1}` }));

  it('shows ten orders, a pager, and replaces them with the next page', async () => {
    serve({ accepted: orders25 }, {});
    const wrapper = await mountPage();
    expect(cardIds(wrapper, 'order-card-')).toEqual(['o25', 'o24', 'o23', 'o22', 'o21', 'o20', 'o19', 'o18', 'o17', 'o16']);
    const pager = wrapper.get('[data-testid="orders-section"] [data-testid="pagination"]');
    expect(pager.get('[data-testid="pagination-summary"]').text()).toBe('1–10 / 25');
    expect(wrapper.find('[data-testid="load-more-orders"]').exists()).toBe(false);

    await pager.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(calls('/service-orders/my').at(-1)).toEqual({ page: 2, pageSize: 10 });
    expect(cardIds(wrapper, 'order-card-')).toEqual(['o15', 'o14', 'o13', 'o12', 'o11', 'o10', 'o9', 'o8', 'o7', 'o6']);
    expect(wrapper.get('[data-testid="orders-section"] [data-testid="pagination-summary"]').text()).toBe('11–20 / 25');

    await wrapper.get('[data-testid="orders-section"] [data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(cardIds(wrapper, 'order-card-')).toEqual(['o5', 'o4', 'o3', 'o2', 'o1']);
    expect(wrapper.get('[data-testid="orders-section"] [data-testid="pagination-next"]').attributes('disabled')).toBeDefined();
  });

  it('pages several booking states with one request per page', async () => {
    const cancelled = Array.from({ length: 15 }, (_, i) => makeBooking({ id: `c${i + 1}`, status: 'cancelled', createdAt: day(i + 1) }));
    serve({}, { submitted: [makeBooking({ id: 'new', status: 'submitted', createdAt: day(28) })], cancelled });
    const wrapper = await mountPage();
    expect(cardIds(wrapper, 'booking-card-')).toEqual(['new', 'c15', 'c14', 'c13', 'c12', 'c11', 'c10', 'c9', 'c8', 'c7']);
    const pager = wrapper.get('[data-testid="requests-section"] [data-testid="pagination"]');
    expect(pager.get('[data-testid="pagination-summary"]').text()).toBe('1–10 / 16');

    mockGet.mockClear();
    await pager.get('[data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(calls('/bookings/my')).toEqual([
      { page: 1, pageSize: 20, status: 'submitted' },
      { page: 1, pageSize: 20, status: 'matching' },
      { page: 1, pageSize: 20, status: 'closed' },
      { page: 1, pageSize: 20, status: 'cancelled' },
    ]);
    expect(calls('/service-orders/my')).toEqual([]);
    expect(cardIds(wrapper, 'booking-card-')).toEqual(['c6', 'c5', 'c4', 'c3', 'c2', 'c1']);
  });

  it('starts again from page 1 when the tab changes', async () => {
    serve({ accepted: orders25, completed: [makeOrder({ id: 'done', status: 'completed' })] }, {});
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="orders-section"] [data-testid="pagination-page-3"]').trigger('click');
    await flushPromises();
    expect(calls('/service-orders/my').at(-1)).toEqual({ page: 3, pageSize: 10 });

    await wrapper.get('[data-testid="history-tab-COMPLETED"]').trigger('click');
    await flushPromises();
    expect(calls('/service-orders/my').at(-1)).toEqual({ page: 1, pageSize: 10, status: 'completed' });
    expect(cardIds(wrapper, 'order-card-')).toEqual(['done']);
  });

  it('asks once for a page clicked twice quickly', async () => {
    serve({ accepted: orders25 }, {});
    const wrapper = await mountPage();
    const two = wrapper.get('[data-testid="orders-section"] [data-testid="pagination-page-2"]');
    await Promise.all([two.trigger('click'), two.trigger('click')]);
    await flushPromises();
    expect(calls('/service-orders/my').filter((p) => p.page === 2)).toHaveLength(1);
  });

  it('searches locally without sending query parameters rejected by the Backend DTO', async () => {
    serve({ accepted: orders25 }, { submitted: [makeBooking({ id: 'bS', serviceName: 'Sửa điều hoà' })] });
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="orders-section"] [data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();

    mockGet.mockClear();
    await wrapper.get('input[type="text"]').setValue('  ORD-3 ');
    // Nothing is sent while the customer is still typing.
    expect(mockGet).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(calls('/service-orders/my')).toEqual(
      ['accepted', 'en_route', 'under_repair', 'completed', 'cancelled'].map((status) => ({ page: 1, pageSize: 100, status })),
    );
    expect(calls('/bookings/my')).toEqual(
      ['submitted', 'matching', 'closed', 'cancelled'].map((status) => ({ page: 1, pageSize: 100, status })),
    );
    expect(mockGet.mock.calls.some(([, options]) => 'statuses' in (options as { params: Params }).params || 'search' in (options as { params: Params }).params)).toBe(false);
    expect(cardIds(wrapper, 'order-card-')).toEqual(['o3']);

    await wrapper.get('input[type="text"]').setValue('sua dieu hoa');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(cardIds(wrapper, 'booking-card-')).toEqual(['bS']);

    await wrapper.get('input[type="text"]').setValue('khong co');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.get('[data-testid="history-empty-state"]').text()).toContain('Không có đơn phù hợp');
  });
});

describe('CustomerOrdersPage: partial failure', () => {
  it('shows orders when bookings fail, with a banner and no empty state', async () => {
    mockGet.mockReset().mockImplementation(async (url: string) => {
      if (url === '/bookings/my') throw new Error('Network Error');
      return response([makeOrder()], 1);
    });
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('ORD-001');
    expect(wrapper.get('[data-testid="bookings-error-banner"]').text()).toContain('vui lòng thử lại');
    expect(wrapper.find('[data-testid="history-empty-state"]').exists()).toBe(false);
  });

  it('shows bookings when orders fail, with a banner', async () => {
    mockGet.mockReset().mockImplementation(async (url: string, opts: { params: Params }) => {
      if (url === '/service-orders/my') throw new Error('Network Error');
      return opts.params.status === 'submitted' ? response([makeBooking()], 1) : response([], 0);
    });
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="booking-card-b1"]').text()).toContain('Sửa điều hoà');
    expect(wrapper.get('[data-testid="orders-error-banner"]').exists()).toBe(true);
  });

  it('never shows the raw error to the customer', async () => {
    mockGet.mockReset().mockImplementation(async (url: string) => {
      if (url === '/service-orders/my') throw new Error('Internal: DB connection pool exhausted at 192.168.1.5:5432');
      return response([], 0);
    });
    const wrapper = await mountPage();
    expect(wrapper.text()).not.toContain('DB connection pool');
    expect(wrapper.text()).not.toContain('192.168');
    expect(wrapper.text()).toContain('vui lòng thử lại');
  });

  it('retries the page that failed and keeps the other list on screen', async () => {
    let attempts = 0;
    mockGet.mockReset().mockImplementation(async (url: string, opts: { params: Params }) => {
      if (url === '/bookings/my') return opts.params.status === 'submitted' ? response([makeBooking({ id: 'keep' })], 1) : response([], 0);
      if (opts.params.page === 2) {
        attempts++;
        if (attempts === 1) throw new Error('network failure');
        return response([makeOrder({ id: 'o11', bookingId: 'x11' })], 11);
      }
      return response(Array.from({ length: 10 }, (_, i) => makeOrder({ id: `o${i + 1}`, bookingId: `x${i + 1}` })), 11);
    });
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="orders-section"] [data-testid="pagination-page-2"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="orders-error-banner"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="booking-card-keep"]').exists()).toBe(true);

    await wrapper.get('[data-testid="retry-orders"]').trigger('click');
    await flushPromises();
    expect(attempts).toBe(2);
    expect(calls('/service-orders/my').filter((p) => p.page === 2)).toHaveLength(2);
    expect(cardIds(wrapper, 'order-card-')).toEqual(['o11']);
    expect(wrapper.find('[data-testid="orders-error-banner"]').exists()).toBe(false);
  });

  it('does not claim an empty history when both lists fail', async () => {
    mockGet.mockReset().mockRejectedValue(new Error('temporary outage'));
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="orders-error-banner"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="bookings-error-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="history-empty-state"]').exists()).toBe(false);
  });

  it('says plainly when there is nothing at all', async () => {
    serve({}, {});
    const wrapper = await mountPage();
    expect(wrapper.get('[data-testid="history-empty-state"]').text()).toContain('Bạn chưa có đơn sửa chữa');
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });
});
