// Client cache (PO 12/10/2026): a page opened before shows its data at once and
// reads it again in the background; paging keeps the rows on screen; the user's
// own actions re-read what they changed; signing out empties the cache.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const { getRepairHistory, getTechnicianJobsPage, enRoute, push, logout, getProfile } = vi.hoisted(() => ({
  getRepairHistory: vi.fn(),
  getTechnicianJobsPage: vi.fn(),
  enRoute: vi.fn(),
  push: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock('../src/api/orders.api', () => ({
  ordersApi: { getRepairHistory, getTechnicianJobsPage, enRoute },
  isHistoricalOrder: () => false,
}));
vi.mock('../src/api/auth.api', () => ({ authApi: { logout, getProfile } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({ params: {}, query: {} }) }));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }),
}));
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import CustomerHistoryPage from '../src/pages/customer/CustomerHistoryPage.vue';
import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';
import { useCachedQuery, useCacheUpdates } from '../src/composables/useCachedQuery';
import { STALE_TIME, clearQueryCache, queryClient, shouldRetry } from '../src/lib/query-client';
import { affectedBy, keysChangedBy, queryKeys } from '../src/lib/query-keys';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';
import { createTestQueryClient, installQueryClient } from './support/query-client';

const row = (id: string) => ({
  orderId: id, bookingId: `b-${id}`, code: `FH-${id}`, status: 'completed',
  serviceName: `Dịch vụ ${id}`, technicianName: 'Kỹ thuật viên A', addressSummary: 'Quận 1',
  laborTotal: 100000, partsTotal: 0, grandTotal: 100000, completedAt: '2026-10-01T03:00:00Z', cancelledAt: null,
});
const rows = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => row(`${prefix}${i}`));

/** A client that keeps unused data, as the app does (the default test client drops it at once). */
const keepingClient = () => {
  const client = createTestQueryClient({ queries: { gcTime: 10 * 60_000 } });
  installQueryClient(client);
  return client;
};

describe('cached pages', () => {
  beforeEach(() => {
    getRepairHistory.mockReset();
    push.mockReset();
    keepingClient();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows cached rows at once on a return visit, without asking the server again inside the stale time', async () => {
    getRepairHistory.mockResolvedValue({ data: [row('a'), row('b')], total: 2 });
    const first = mount(CustomerHistoryPage);
    expect(first.find('[aria-label="Đang tải lịch sử sửa chữa"]').exists()).toBe(true);
    await flushPromises();
    expect(first.text()).toContain('Dịch vụ a');
    first.unmount();

    const again = mount(CustomerHistoryPage);
    // Before any promise settles: no skeleton, the rows are there.
    expect(again.find('[aria-label="Đang tải lịch sử sửa chữa"]').exists()).toBe(false);
    expect(again.text()).toContain('Dịch vụ a');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenCalledTimes(1);
  });

  it('reads again in the background once the data is older than the stale time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    getRepairHistory.mockResolvedValueOnce({ data: [row('old')], total: 1 });
    const first = mount(CustomerHistoryPage);
    await flushPromises();
    first.unmount();

    vi.setSystemTime(Date.now() + STALE_TIME + 1_000);
    let release!: (value: unknown) => void;
    getRepairHistory.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const again = mount(CustomerHistoryPage);
    await flushPromises();
    // The old copy stays on screen while the new one is read.
    expect(getRepairHistory).toHaveBeenCalledTimes(2);
    expect(again.text()).toContain('Dịch vụ old');
    expect(again.find('[aria-label="Đang tải lịch sử sửa chữa"]').exists()).toBe(false);

    release({ data: [row('new')], total: 1 });
    await flushPromises();
    expect(again.text()).toContain('Dịch vụ new');
    expect(again.text()).not.toContain('Dịch vụ old');
  });

  it('keeps the current rows on screen, dimmed, while the next page is read', async () => {
    getRepairHistory.mockResolvedValueOnce({ data: rows('p1-', 20), total: 45 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();

    let release!: (value: unknown) => void;
    getRepairHistory.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(2, 20, undefined, undefined);
    expect(wrapper.find('[aria-label="Đang tải lịch sử sửa chữa"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Dịch vụ p1-0');
    const list = wrapper.get('ul');
    expect(list.attributes('aria-busy')).toBe('true');
    expect(list.classes()).toContain('opacity-60');

    release({ data: rows('p2-', 20), total: 45 });
    await flushPromises();
    expect(wrapper.text()).toContain('Dịch vụ p2-0');
    expect(wrapper.text()).not.toContain('Dịch vụ p1-0');
    expect(wrapper.get('ul').attributes('aria-busy')).toBe('false');

    // Back to page 1: cached, so no request and no skeleton.
    await wrapper.get('[data-testid="pagination-prev"]').trigger('click');
    expect(wrapper.text()).toContain('Dịch vụ p1-0');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenCalledTimes(2);
  });

  it('reads the next page ahead when the pointer rests on its button', async () => {
    getRepairHistory.mockResolvedValue({ data: rows('p', 20), total: 45 });
    const wrapper = mount(CustomerHistoryPage);
    await flushPromises();
    await wrapper.get('[data-testid="pagination-next"]').trigger('pointerenter');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenLastCalledWith(2, 20, undefined, undefined);
    expect(getRepairHistory).toHaveBeenCalledTimes(2);

    // Moving there now needs no request.
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();
    expect(getRepairHistory).toHaveBeenCalledTimes(2);
  });
});

describe('after the user acts', () => {
  const job = (id: string, status: string) => ({
    id, code: `SO-${id}`, bookingId: `b-${id}`, status, serviceName: `Dịch vụ ${id}`, customerName: 'Khách A',
    customerPhone: '0901234567', addressSummary: '1 Lê Lợi', scheduledAt: '2030-01-01T01:00:00Z',
    laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '2030-01-01T00:00:00Z',
  });
  const stubs = {
    FhButton: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup(props, { slots, attrs }) {
        return () => h('button', { type: 'button', ...attrs, disabled: props.disabled || props.loading }, slots.default?.());
      },
    }),
  };

  beforeEach(() => {
    getTechnicianJobsPage.mockReset();
    enRoute.mockReset();
    keepingClient();
  });

  it('re-reads the job list after "Bắt đầu di chuyển", so the status is never the old one', async () => {
    let status = 'ACCEPTED';
    getTechnicianJobsPage.mockImplementation(async (page: number, pageSize: number) => ({
      items: [job('a', status)], total: 1, page, pageSize,
    }));
    enRoute.mockImplementation(async () => {
      status = 'EN_ROUTE';
      return {};
    });
    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();
    const calls = getTechnicianJobsPage.mock.calls.length;
    expect(wrapper.get('[data-testid="technician-job-a"]').text()).toContain('Bắt đầu di chuyển');

    await wrapper.findAll('button').find((b) => b.text().includes('Bắt đầu di chuyển'))!.trigger('click');
    await flushPromises();
    expect(enRoute).toHaveBeenCalledWith('a');
    // The list (20 a page) and the tab counts (1 a page) were read again.
    const after = getTechnicianJobsPage.mock.calls.slice(calls);
    expect(after.some(([page, size]) => page === 1 && size === 20)).toBe(true);
    expect(after.some(([page, size]) => page === 1 && size === 1)).toBe(true);
    expect(wrapper.get('[data-testid="technician-job-a"]').text()).not.toContain('Bắt đầu di chuyển');
  });

  it('re-reads data on screen and drops data no page shows', async () => {
    const client = keepingClient();
    const fetchBalance = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(40);
    let refresh!: ReturnType<typeof useCacheUpdates>['refresh'];
    const Probe = defineComponent({
      setup() {
        const wallet = useCachedQuery({ key: queryKeys.wallet.technician, fetch: fetchBalance });
        refresh = useCacheUpdates().refresh;
        return () => h('span', String(wallet.data.value ?? ''));
      },
    });
    const wrapper = mount(Probe);
    await flushPromises();
    expect(wrapper.text()).toBe('100');

    // An earnings page read earlier and closed since.
    const earningsKey = queryKeys.earnings.period({ from: null, to: null });
    client.setQueryData(earningsKey, { total: 1 });

    await refresh(affectedBy.walletChange);
    await flushPromises();
    expect(fetchBalance).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toBe('40');
    // Never shown stale on the next visit: it is read fresh instead.
    expect(client.getQueryData(earningsKey)).toBeUndefined();
  });
});

describe('the cache belongs to one session', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    logout.mockReset().mockResolvedValue(undefined);
    clearQueryCache();
  });

  it('is emptied on sign-out', async () => {
    const store = useAuthStore();
    store.setAuth('token-a', { id: 'user-a', email: 'a@fixhome.test', fullName: 'A', role: UserRole.CUSTOMER });
    queryClient.setQueryData(queryKeys.wallet.customer({}), { balance: 500000 });
    queryClient.setQueryData(queryKeys.orders.customerRecent, [{ id: 'o1' }]);

    await store.logout();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('is emptied when the session is no longer valid', async () => {
    const store = useAuthStore();
    store.setAuth('token-a', { id: 'user-a', email: 'a@fixhome.test', fullName: 'A', role: UserRole.CUSTOMER });
    queryClient.setQueryData(queryKeys.orders.customerRecent, [{ id: 'o1' }]);
    getProfile.mockRejectedValueOnce({ response: { status: 401 } });

    await store.fetchProfile();
    expect(store.isAuthenticated).toBe(false);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('is emptied when another account signs in, and kept when the same account saves its profile', () => {
    const store = useAuthStore();
    store.setAuth('token-a', { id: 'user-a', email: 'a@fixhome.test', fullName: 'A', role: UserRole.CUSTOMER });
    queryClient.setQueryData(queryKeys.orders.customerRecent, [{ id: 'o1' }]);

    store.setAuth('token-a', { id: 'user-a', email: 'a@fixhome.test', fullName: 'A mới', role: UserRole.CUSTOMER });
    expect(queryClient.getQueryData(queryKeys.orders.customerRecent)).toEqual([{ id: 'o1' }]);

    store.setAuth('token-b', { id: 'user-b', email: 'b@fixhome.test', fullName: 'B', role: UserRole.CUSTOMER });
    expect(queryClient.getQueryData(queryKeys.orders.customerRecent)).toBeUndefined();
  });
});

describe('cache rules', () => {
  it('retries a network or server error once and a 4xx answer never', () => {
    expect(shouldRetry(0, { response: { status: 500 } })).toBe(true);
    expect(shouldRetry(1, { response: { status: 500 } })).toBe(false);
    expect(shouldRetry(0, new Error('Network Error'))).toBe(true);
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetry(0, { response: { status } })).toBe(false);
    }
  });

  it('knows which cached data a write may change', () => {
    const roots = (url: string) => keysChangedBy(url).map((key) => key[0]);
    expect(roots('/technician/wallet/withdrawals')).toEqual(expect.arrayContaining(['wallet', 'earnings', 'orders']));
    expect(roots('/invoices/i1/pay-with-wallet')).toEqual(expect.arrayContaining(['wallet', 'orders']));
    expect(roots('/bookings/b1/cancel')).toEqual(expect.arrayContaining(['bookings', 'orders']));
    expect(roots('/invitations/i1/respond')).toEqual(expect.arrayContaining(['invitations', 'orders']));
    expect(roots('/quotations/q1/approve')).toEqual(expect.arrayContaining(['orders', 'wallet', 'earnings']));
    expect(roots('/me/addresses')).toEqual(['addresses']);
    expect(roots('/notifications/read-all')).toEqual(['notifications']);
    // Chat, sign-in and uploads change nothing that is cached.
    expect(keysChangedBy('/messages/m1')).toEqual([]);
    expect(keysChangedBy('/auth/logout')).toEqual([]);
    expect(keysChangedBy('/media/upload')).toEqual([]);
    // A write the table does not know drops everything of the user.
    expect(roots('/service-manager/withdrawals/w1/reconcile')).toEqual(
      expect.arrayContaining(['orders', 'bookings', 'wallet', 'earnings', 'notifications', 'technician']),
    );
  });
});
