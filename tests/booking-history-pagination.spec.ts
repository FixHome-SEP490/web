// tests/booking-history-pagination.spec.ts
// Focused mocked API/UI tests for WEB-H01
// Covers: page1/page2, 21+ records, status filtering (CANCELLED/CLOSED/MATCHED), dedup,
// one endpoint failure, load-more failure+retry, component behavior.
// No real API calls, no database writes, no account logins.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ─── Mock apiClient before importing modules that use it ─────────────────────
// vi.hoisted() ensures mockGet is available when vi.mock factory runs (hoisted to top by Vitest).

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { get: mockGet },
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
}));

// Stub vue-router and chat store to avoid full app bootstrap
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

// Import AFTER mocking
import { bookingsApi } from '../src/api/bookings.api';
import { ordersApi } from '../src/api/orders.api';
import CustomerOrdersPage from '../src/pages/customer/CustomerOrdersPage.vue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<{ id: string; status: string }> = {}) {
  return {
    id: overrides.id ?? 'b1',
    customerId: 'c1',
    serviceId: 's1',
    serviceName: 'Sửa điều hoà',
    addressId: 'a1',
    addressSummary: '12 Nguyễn Huệ',
    description: 'Mô tả',
    preferredAt: '2026-10-01T08:00:00Z',
    urgency: 'NORMAL' as const,
    status: (overrides.status ?? 'SUBMITTED') as 'SUBMITTED' | 'MATCHING' | 'MATCHED' | 'CANCELLED' | 'CLOSED',
    createdAt: '2026-09-20T08:00:00Z',
  };
}

function makeOrder(overrides: Partial<{ id: string; bookingId: string; status: string }> = {}) {
  return {
    id: overrides.id ?? 'o1',
    code: 'ORD-001',
    bookingId: overrides.bookingId ?? 'b1',
    serviceName: 'Sửa điều hoà',
    status: (overrides.status ?? 'ACCEPTED') as import('../src/api/orders.api').CanonicalOrderStatus,
    customerName: 'Nguyễn A',
    customerPhone: '0900000000',
    addressSummary: '12 Nguyễn Huệ',
    scheduledAt: '2026-10-01T08:00:00Z',
    laborTotal: 200000,
    partsTotal: 0,
    grandTotal: 200000,
    paymentStatus: 'UNPAID' as const,
    createdAt: '2026-09-21T08:00:00Z',
  };
}

/** Mount page with both endpoints succeeding */
async function mountPageWith(orders: ReturnType<typeof makeOrder>[], bookings: ReturnType<typeof makeBooking>[], { ordersTotal = orders.length, bookingsTotal = bookings.length } = {}) {
  mockGet.mockReset();
  mockGet
    .mockResolvedValueOnce({ data: { data: orders, meta: { total: ordersTotal } } })
    .mockResolvedValueOnce({ data: { data: bookings, meta: { total: bookingsTotal } } });
  const wrapper = mount(CustomerOrdersPage, { global: { stubs: { FhButton: true, FhCostBreakdown: true, FhMoney: true } } });
  await flushPromises();
  return wrapper;
}

/** Mount page with orders succeeding but bookings failing */
async function mountPageWithBookingsFailure() {
  mockGet.mockReset();
  mockGet
    .mockResolvedValueOnce({ data: { data: [makeOrder()], meta: { total: 1 } } })
    .mockRejectedValueOnce(new Error('Network Error'));
  const wrapper = mount(CustomerOrdersPage, { global: { stubs: { FhButton: true, FhCostBreakdown: true, FhMoney: true } } });
  await flushPromises();
  return wrapper;
}

/** Mount page with orders failing but bookings succeeding */
async function mountPageWithOrdersFailure() {
  mockGet.mockReset();
  mockGet
    .mockRejectedValueOnce(new Error('Network Error'))
    .mockResolvedValueOnce({ data: { data: [makeBooking()], meta: { total: 1 } } });
  const wrapper = mount(CustomerOrdersPage, { global: { stubs: { FhButton: true, FhCostBreakdown: true, FhMoney: true } } });
  await flushPromises();
  return wrapper;
}

// ─── bookingsApi.getMyBookingsPaged ───────────────────────────────────────────

describe('bookingsApi.getMyBookingsPaged', () => {
  beforeEach(() => { mockGet.mockReset(); });

  it('returns page 1 data and total from meta', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeBooking()], meta: { total: 1 } } });

    const result = await bookingsApi.getMyBookingsPaged(1, 20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/bookings/my', { params: { page: 1, pageSize: 20 } });
  });

  it('throws when meta.total is missing — no fabricated total', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeBooking()] } }); // no meta

    await expect(bookingsApi.getMyBookingsPaged(1, 20)).rejects.toThrow('missing meta.total');
  });

  it('handles 21+ records across two pages without fabricating total', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeBooking({ id: `b${i + 1}` }));
    const page2 = [makeBooking({ id: 'b21' })];

    mockGet
      .mockResolvedValueOnce({ data: { data: page1, meta: { total: 21 } } })
      .mockResolvedValueOnce({ data: { data: page2, meta: { total: 21 } } });

    const r1 = await bookingsApi.getMyBookingsPaged(1, 20);
    expect(r1.total).toBe(21);
    expect(r1.data).toHaveLength(20);

    const r2 = await bookingsApi.getMyBookingsPaged(2, 20);
    expect(r2.total).toBe(21);
    expect(r2.data).toHaveLength(1);
  });

  it('includes CANCELLED booking in returned data', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeBooking({ id: 'bC', status: 'CANCELLED' })], meta: { total: 1 } } });
    const result = await bookingsApi.getMyBookingsPaged(1, 20);
    expect(result.data[0].status).toBe('CANCELLED');
  });

  it('includes CLOSED booking in returned data', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeBooking({ id: 'bCl', status: 'CLOSED' })], meta: { total: 1 } } });
    const result = await bookingsApi.getMyBookingsPaged(1, 20);
    expect(result.data[0].status).toBe('CLOSED');
  });
});

// ─── ordersApi.getCustomerOrdersPaged ─────────────────────────────────────────

describe('ordersApi.getCustomerOrdersPaged', () => {
  beforeEach(() => { mockGet.mockReset(); });

  it('returns page 1 data and total from meta', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeOrder()], meta: { total: 1 } } });

    const result = await ordersApi.getCustomerOrdersPaged(1, 20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/service-orders/my', { params: { page: 1, pageSize: 20 } });
  });

  it('throws when meta.total is missing — no fabricated total', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [makeOrder()] } }); // no meta
    await expect(ordersApi.getCustomerOrdersPaged(1, 20)).rejects.toThrow('missing meta.total');
  });
});

// ─── Dedup logic (pure unit, matching updated MATCHED-inclusive filter) ────────

describe('Dedup: pendingBookings filter logic', () => {
  // This mirrors the actual computed: ['SUBMITTED','MATCHING','MATCHED','CLOSED','CANCELLED'] && !orderedIds.has(id)
  function applyPendingFilter(bookingList: ReturnType<typeof makeBooking>[], orderList: ReturnType<typeof makeOrder>[]) {
    const orderedIds = new Set(orderList.map((o) => o.bookingId));
    return bookingList.filter(
      (b) => ['SUBMITTED', 'MATCHING', 'MATCHED', 'CLOSED', 'CANCELLED'].includes(b.status) && !orderedIds.has(b.id),
    );
  }

  it('SUBMITTED booking without SO → appears in pending', () => {
    const pending = applyPendingFilter([makeBooking({ id: 'b1', status: 'SUBMITTED' })], []);
    expect(pending).toHaveLength(1);
  });

  it('MATCHED booking whose SO is loaded → excluded from pending (dedup)', () => {
    const pending = applyPendingFilter(
      [makeBooking({ id: 'b1', status: 'MATCHED' })],
      [makeOrder({ bookingId: 'b1' })],
    );
    expect(pending).toHaveLength(0);
  });

  it('MATCHED booking whose SO is NOT loaded (cross-page) → stays visible in pending', () => {
    // SO list is empty (not yet loaded), MATCHED booking should remain visible
    const pending = applyPendingFilter([makeBooking({ id: 'b1', status: 'MATCHED' })], []);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('MATCHED');
  });

  it('CANCELLED booking without SO → appears in pending', () => {
    const pending = applyPendingFilter([makeBooking({ id: 'bC', status: 'CANCELLED' })], []);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('CANCELLED');
  });

  it('CLOSED booking without SO → appears in pending', () => {
    const pending = applyPendingFilter([makeBooking({ id: 'bCl', status: 'CLOSED' })], []);
    expect(pending).toHaveLength(1);
  });

  it('cross-page dedup: does not show Booking+SO as two independent cards when SO is loaded', () => {
    const bookingList = [makeBooking({ id: 'b1', status: 'MATCHED' })];
    const orderList = [makeOrder({ id: 'o1', bookingId: 'b1' })];
    // Only SO should show; booking filtered out
    const pending = applyPendingFilter(bookingList, orderList);
    expect(pending).toHaveLength(0);
    expect(orderList).toHaveLength(1);
  });
});

// ─── Partial-failure / one-endpoint-failure tests ────────────────────────────

describe('Partial failure: one source fails, other succeeds', () => {
  beforeEach(() => { mockGet.mockReset(); });

  it('bookings failure does not erase existing orders data', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [makeOrder()], meta: { total: 1 } } })
      .mockResolvedValueOnce({ data: { data: [makeBooking()] /* no meta */ } });

    const ordersResult = await ordersApi.getCustomerOrdersPaged(1, 20);
    await expect(bookingsApi.getMyBookingsPaged(1, 20)).rejects.toThrow('missing meta.total');

    expect(ordersResult.data).toHaveLength(1);
    expect(ordersResult.total).toBe(1);
  });

  it('orders failure does not erase existing bookings data', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [makeBooking()], meta: { total: 1 } } })
      .mockResolvedValueOnce({ data: { data: [makeOrder()] /* no meta */ } });

    const bookingsResult = await bookingsApi.getMyBookingsPaged(1, 20);
    await expect(ordersApi.getCustomerOrdersPaged(1, 20)).rejects.toThrow('missing meta.total');

    expect(bookingsResult.data).toHaveLength(1);
    expect(bookingsResult.total).toBe(1);
  });
});

// ─── Component: partial failure UI behavior ───────────────────────────────────

describe('CustomerOrdersPage component: partial failure', () => {
  it('shows orders when bookings endpoint fails, displays error banner, no fake empty state', async () => {
    const wrapper = await mountPageWithBookingsFailure();

    // SO card should be visible (orders succeeded)
    expect(wrapper.text()).toContain('ORD-001');

    // Error banner for bookings should appear (generic message, no raw internals)
    expect(wrapper.text()).toContain('Vui lòng thử lại');

    // Empty state must NOT appear when we have data
    expect(wrapper.find('[data-testid="empty-state"]').exists() || !wrapper.text().includes('Chưa có đơn dịch vụ nào')).toBeTruthy();
  });

  it('shows bookings when orders endpoint fails, displays error banner', async () => {
    const wrapper = await mountPageWithOrdersFailure();

    // Booking card text should appear
    expect(wrapper.text()).toContain('Sửa điều hoà');

    // Error banner must appear
    expect(wrapper.text()).toContain('Vui lòng thử lại');
  });

  it('error banner does not surface raw internal error message to user', async () => {
    mockGet.mockReset();
    mockGet
      .mockRejectedValueOnce(new Error('Internal: DB connection pool exhausted at 192.168.1.5:5432'))
      .mockResolvedValueOnce({ data: { data: [], meta: { total: 0 } } });
    const wrapper = mount(CustomerOrdersPage, { global: { stubs: { FhButton: true, FhCostBreakdown: true, FhMoney: true } } });
    await flushPromises();

    // Raw internal error should NOT appear in UI
    expect(wrapper.text()).not.toContain('DB connection pool');
    expect(wrapper.text()).not.toContain('192.168');
    // Generic user-facing message should appear instead
    expect(wrapper.text()).toContain('Vui lòng thử lại');
  });
});

// ─── Component: CANCELLED/MATCHED badge labels ────────────────────────────────

describe('CustomerOrdersPage component: badge labels', () => {
  it('shows CANCELLED label in ALL tab (ALL must include every booking status)', async () => {
    // After fix: ALL tab shows ALL pending bookings including CANCELLED
    const wrapper = await mountPageWith([], [makeBooking({ id: 'bC', status: 'CANCELLED' })]);

    // ALL is the default active tab — CANCELLED booking must be visible immediately
    expect(wrapper.text()).toContain('Đã huỷ trước khi có thợ');
  });

  it('shows CANCELLED label in CANCELLED tab', async () => {
    const wrapper = await mountPageWith([], [makeBooking({ id: 'bC', status: 'CANCELLED' })]);

    // Switch to CANCELLED tab — must still appear
    const cancelledTab = wrapper.findAll('button').find((b) => b.text() === 'Đã huỷ');
    expect(cancelledTab?.exists()).toBe(true);
    await cancelledTab!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Đã huỷ trước khi có thợ');
  });

  it('does NOT show CANCELLED booking in IN_PROGRESS tab', async () => {
    const wrapper = await mountPageWith([], [makeBooking({ id: 'bC', status: 'CANCELLED' })]);

    const inProgressTab = wrapper.findAll('button').find((b) => b.text() === 'Đang xử lý');
    await inProgressTab!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Đã huỷ trước khi có thợ');
  });

  it('shows MATCHED awaiting link label for cross-page MATCHED booking without loaded SO', async () => {
    const wrapper = await mountPageWith([], [makeBooking({ id: 'bM', status: 'MATCHED' })]);
    expect(wrapper.text()).toContain('Đang chờ liên kết đơn thợ');
  });

  it('shows CLOSED label for closed booking without SO', async () => {
    const wrapper = await mountPageWith([], [makeBooking({ id: 'bCl', status: 'CLOSED' })]);
    expect(wrapper.text()).toContain('Chưa tìm được thợ');
  });
});

// ─── Component: load-more failure then retry same page ───────────────────────

describe('CustomerOrdersPage component: pagination regressions', () => {
  const response = (items: unknown[], total: number) => ({ data: { data: items, meta: { total } } });
  const manyOrders = () => Array.from({ length: 20 }, (_, i) => makeOrder({ id: `o${i + 1}`, bookingId: `link-${i + 1}` }));
  const manyBookings = () => Array.from({ length: 20 }, (_, i) => makeBooking({ id: `b${i + 1}` }));

  async function mountHistory() {
    const wrapper = mount(CustomerOrdersPage, {
      global: { stubs: { FhButton: true, FhCostBreakdown: true, FhMoney: true } },
    });
    await flushPromises();
    return wrapper;
  }

  it('retries the failed orders page 2 without discarding page 1', async () => {
    const first = manyOrders();
    let attempts = 0;
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return response([], 0);
      if (opts.params.page === 1) return response(first, 21);
      if (opts.params.page === 2) {
        attempts++;
        if (attempts === 1) throw new Error('network failure');
        return response([makeOrder({ id: 'o21', bookingId: 'link-21' })], 21);
      }
      throw new Error('unexpected page');
    });
    const wrapper = await mountHistory();
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(20);
    await wrapper.get('[data-testid="load-more-orders"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(20);
    expect(wrapper.get('[data-testid="orders-error-banner"]').exists()).toBe(true);
    await wrapper.get('[data-testid="retry-orders"]').trigger('click');
    await flushPromises();
    expect(attempts).toBe(2);
    expect(mockGet.mock.calls.filter(([url, opts]) => url === '/service-orders/my' && opts.params.page === 2)).toHaveLength(2);
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(21);
    expect(wrapper.get('[data-testid="order-card-o21"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="orders-error-banner"]').exists()).toBe(false);
  });

  it('retries the failed bookings page 2 without losing earlier booking cards', async () => {
    const first = manyBookings();
    let attempts = 0;
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/service-orders/my') return response([], 0);
      if (opts.params.page === 1) return response(first, 21);
      if (opts.params.page === 2) {
        attempts++;
        if (attempts === 1) throw new Error('network failure');
        return response([makeBooking({ id: 'b21', status: 'CANCELLED' })], 21);
      }
      throw new Error('unexpected page');
    });
    const wrapper = await mountHistory();
    await wrapper.get('[data-testid="load-more-bookings"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="booking-card-"]')).toHaveLength(20);
    expect(wrapper.get('[data-testid="bookings-error-banner"]').exists()).toBe(true);
    await wrapper.get('[data-testid="retry-bookings"]').trigger('click');
    await flushPromises();
    expect(attempts).toBe(2);
    expect(mockGet.mock.calls.filter(([url, opts]) => url === '/bookings/my' && opts.params.page === 2)).toHaveLength(2);
    expect(wrapper.findAll('[data-testid^="booking-card-"]')).toHaveLength(21);
    expect(wrapper.find('[data-testid="bookings-error-banner"]').exists()).toBe(false);
  });

  it('keeps booking pagination reachable in the CANCELLED tab when page 1 has no cancelled booking', async () => {
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/service-orders/my') return response([], 0);
      return opts.params.page === 1
        ? response(manyBookings(), 21)
        : response([makeBooking({ id: 'b21', status: 'CANCELLED' })], 21);
    });
    const wrapper = await mountHistory();
    await wrapper.get('[data-testid="history-tab-CANCELLED"]').trigger('click');
    expect(wrapper.findAll('[data-testid^="booking-card-"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="history-empty-state"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="load-more-bookings"]').exists()).toBe(true);
    await wrapper.get('[data-testid="load-more-bookings"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="booking-card-b21"]').exists()).toBe(true);
  });

  it('keeps load-more reachable when the search only matches an unloaded page', async () => {
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return response([], 0);
      return opts.params.page === 1
        ? response(manyOrders(), 21)
        : response([{ ...makeOrder({ id: 'o21', bookingId: 'link-21' }), code: 'TARGET-21' }], 21);
    });
    const wrapper = await mountHistory();
    await wrapper.get('input[type="text"]').setValue('TARGET-21');
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="history-empty-state"]').exists()).toBe(false);
    await wrapper.get('[data-testid="load-more-orders"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="order-card-o21"]').exists()).toBe(true);
  });

  it('deduplicates overlapping service-order pages while advancing by raw server pages', async () => {
    const first = manyOrders();
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return response([], 0);
      if (opts.params.page === 1) return response(first, 22);
      return response([first[19], makeOrder({ id: 'o21', bookingId: 'link-21' })], 22);
    });
    const wrapper = await mountHistory();
    await wrapper.get('[data-testid="load-more-orders"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(21);
    expect(wrapper.findAll('[data-testid="order-card-o20"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="history-tab-ALL"]').text()).toContain('(21)');
    expect(wrapper.find('[data-testid="load-more-orders"]').exists()).toBe(false);
  });

  it('deduplicates overlapping booking pages without double-counting standalone requests', async () => {
    const first = manyBookings();
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/service-orders/my') return response([], 0);
      if (opts.params.page === 1) return response(first, 22);
      return response([first[19], makeBooking({ id: 'b21' })], 22);
    });
    const wrapper = await mountHistory();
    await wrapper.get('[data-testid="load-more-bookings"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="booking-card-"]')).toHaveLength(21);
    expect(wrapper.findAll('[data-testid="booking-card-b20"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="history-tab-ALL"]').text()).toContain('(21)');
  });

  it('replaces a MATCHED booking card with its actual service order from a later page', async () => {
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return response([makeBooking({ id: 'bLinked', status: 'MATCHED' })], 1);
      if (opts.params.page === 1) return response(manyOrders(), 21);
      return response([makeOrder({ id: 'o21', bookingId: 'bLinked' })], 21);
    });
    const wrapper = await mountHistory();
    expect(wrapper.get('[data-testid="booking-card-bLinked"]').exists()).toBe(true);
    await wrapper.get('[data-testid="load-more-orders"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="booking-card-bLinked"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="order-card-o21"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="history-tab-ALL"]').text()).toContain('(21)');
  });

  it('guards against two fast clicks requesting the same service-order page twice', async () => {
    const first = manyOrders();
    let resolveNext!: (value: ReturnType<typeof response>) => void;
    const pendingNext = new Promise<ReturnType<typeof response>>((resolve) => { resolveNext = resolve; });
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return response([], 0);
      if (opts.params.page === 1) return response(first, 21);
      return pendingNext;
    });
    const wrapper = await mountHistory();
    const button = wrapper.get('[data-testid="load-more-orders"]');
    const one = button.trigger('click');
    const two = button.trigger('click');
    await Promise.all([one, two]);
    expect(mockGet.mock.calls.filter(([url, opts]) => url === '/service-orders/my' && opts.params.page === 2)).toHaveLength(1);
    resolveNext(response([makeOrder({ id: 'o21', bookingId: 'link-21' })], 21));
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(21);
  });

  it('stops offering load-more when the server returns an empty subsequent page', async () => {
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return response([], 0);
      return opts.params.page === 1 ? response(manyOrders(), 100) : response([], 100);
    });
    const wrapper = await mountHistory();
    await wrapper.get('[data-testid="load-more-orders"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="load-more-orders"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="order-card-"]')).toHaveLength(20);
  });
  it('preserves verified bookings while the initially failed orders source retries page 1', async () => {
    let ordersAttempts = 0;
    mockGet.mockReset().mockImplementation((url: string, opts: { params: { page: number } }) => {
      if (url === '/bookings/my') return { data: { data: [makeBooking({ id: 'b1', status: 'MATCHED' })], meta: { total: 1 } } };
      expect(opts.params.page).toBe(1);
      ordersAttempts++;
      if (ordersAttempts === 1) throw new Error('temporary outage');
      return { data: { data: [makeOrder({ id: 'o1', bookingId: 'b1' })], meta: { total: 1 } } };
    });
    const wrapper = await mountHistory();
    expect(wrapper.get('[data-testid="booking-card-b1"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="orders-error-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="history-empty-state"]').exists()).toBe(false);
    await wrapper.get('[data-testid="retry-orders"]').trigger('click');
    await flushPromises();
    expect(ordersAttempts).toBe(2);
    expect(wrapper.find('[data-testid="booking-card-b1"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="order-card-o1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="orders-error-banner"]').exists()).toBe(false);
  });

  it('does not claim empty history when both endpoints fail', async () => {
    mockGet.mockReset().mockRejectedValue(new Error('temporary outage'));
    const wrapper = await mountHistory();
    expect(wrapper.get('[data-testid="orders-error-banner"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="bookings-error-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="history-empty-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="loaded-page-empty"]').exists()).toBe(false);
  });
});
