// Shared paging pieces (PO 12/10/2026: every data table is paginated):
// the numbered pager, page state in the address bar, and the one helper that
// reads a page of any list from the backend.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get: mockGet } }));

import FhPagination from '../src/components/FhPagination.vue';
import ConsolePagination from '../src/components/console/ConsolePagination.vue';
import { filterParams, pageCount, readPage, slicePage, type PageResult } from '../src/api/paging';
import { pageItems, pageRangeLabel } from '../src/utils/pagination';
import { useQueryChoice, useQueryPage, useQuerySearch } from '../src/composables/useQueryState';
import { usePagedList } from '../src/composables/usePagedList';
import { technicianEarningsApi } from '../src/api/technician-earnings.api';
import { notificationsApi } from '../src/api/notifications.api';
import { ordersApi } from '../src/api/orders.api';
import { bookingsApi } from '../src/api/bookings.api';

describe('pageItems and pageRangeLabel', () => {
  it('shows every page when there are few', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps first, last and neighbours with gaps, never hiding a single page behind a gap', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageItems(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageItems(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    // Page 5 of 9: 2..3 hidden behind a gap, 7..8 too.
    expect(pageItems(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9]);
    // Out of range is clamped.
    expect(pageItems(99, 9)).toEqual([1, 'gap', 5, 6, 7, 8, 9]);
  });

  it('says which rows the page holds', () => {
    expect(pageRangeLabel(1, 20, 57)).toBe('1–20 / 57');
    expect(pageRangeLabel(3, 20, 57)).toBe('41–57 / 57');
    expect(pageRangeLabel(1, 20, 1234)).toBe('1–20 / 1.234');
    expect(pageRangeLabel(1, 20, 0)).toBe('0 / 0');
  });
});

describe('FhPagination', () => {
  it('is hidden when everything fits on one page', () => {
    expect(mount(FhPagination, { props: { page: 1, pageSize: 20, total: 20 } }).find('nav').exists()).toBe(false);
    expect(mount(FhPagination, { props: { page: 1, pageSize: 20, total: 0 } }).find('nav').exists()).toBe(false);
  });

  it('shows the range, numbered pages with the current one marked, and emits the page asked for', async () => {
    const wrapper = mount(FhPagination, { props: { page: 2, pageSize: 20, total: 57 } });
    const nav = wrapper.get('nav');
    expect(nav.attributes('aria-label')).toBe('Phân trang');
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('21–40 / 57');
    expect(wrapper.findAll('[data-testid^="pagination-page-"]').map((b) => b.text())).toEqual(['1', '2', '3']);
    expect(wrapper.get('[data-testid="pagination-page-2"]').attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-testid="pagination-page-3"]').attributes('aria-label')).toBe('Trang 3');
    expect(wrapper.get('[data-testid="pagination-prev"]').text()).toContain('Trước');
    expect(wrapper.get('[data-testid="pagination-next"]').text()).toContain('Sau');

    await wrapper.get('[data-testid="pagination-page-3"]').trigger('click');
    await wrapper.get('[data-testid="pagination-prev"]').trigger('click');
    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    // Clicking the page already shown does nothing.
    await wrapper.get('[data-testid="pagination-page-2"]').trigger('click');
    expect(wrapper.emitted('update:page')).toEqual([[3], [1], [3]]);
  });

  it('disables Trước on the first page, Sau on the last, and everything while loading', async () => {
    const first = mount(FhPagination, { props: { page: 1, pageSize: 10, total: 30 } });
    expect(first.get('[data-testid="pagination-prev"]').attributes('disabled')).toBeDefined();
    expect(first.get('[data-testid="pagination-next"]').attributes('disabled')).toBeUndefined();
    const last = mount(FhPagination, { props: { page: 3, pageSize: 10, total: 30 } });
    expect(last.get('[data-testid="pagination-next"]').attributes('disabled')).toBeDefined();
    const busy = mount(FhPagination, { props: { page: 2, pageSize: 10, total: 30, disabled: true } });
    await busy.get('[data-testid="pagination-next"]').trigger('click');
    await busy.get('[data-testid="pagination-page-1"]').trigger('click');
    expect(busy.emitted('update:page')).toBeUndefined();
  });

  it('keeps only the current number on a phone, the others from sm up', () => {
    const wrapper = mount(FhPagination, { props: { page: 5, pageSize: 10, total: 200 } });
    expect(wrapper.get('[data-testid="pagination-page-5"]').classes()).toContain('inline-flex');
    expect(wrapper.get('[data-testid="pagination-page-5"]').classes()).not.toContain('hidden');
    expect(wrapper.get('[data-testid="pagination-page-4"]').classes()).toContain('hidden');
    expect(wrapper.get('[data-testid="pagination-page-4"]').classes()).toContain('sm:inline-flex');
    // A bare `inline-flex` next to `hidden` wins in the stylesheet and shows every number on a phone.
    expect(wrapper.get('[data-testid="pagination-page-4"]').classes()).not.toContain('inline-flex');
  });

  it('is the same pager in the console, also for lists that only know their page count', async () => {
    const wrapper = mount(ConsolePagination, { props: { page: 2, totalPages: 4 } });
    expect(wrapper.get('[data-testid="pagination-summary"]').text()).toBe('Trang 2/4');
    expect(wrapper.findAll('[data-testid^="pagination-page-"]')).toHaveLength(4);
    await wrapper.get('[data-testid="pagination-page-4"]').trigger('click');
    expect(wrapper.emitted('update:page')).toEqual([[4]]);

    const counted = mount(ConsolePagination, { props: { page: 1, total: 45, pageSize: 20 } });
    expect(counted.get('[data-testid="pagination-summary"]').text()).toBe('1–20 / 45');
  });
});

describe('readPage, slicePage and filterParams', () => {
  it('reads data, total and the page size whatever the endpoint calls it', () => {
    expect(readPage({ data: [1, 2], meta: { total: 42, page: 2, pageSize: 2 } }, { page: 2, pageSize: 2 })).toEqual({ items: [1, 2], total: 42, page: 2, pageSize: 2 });
    expect(readPage({ data: [1], meta: { total: '9', page: 1, limit: 5 } }, { page: 1, pageSize: 20 })).toEqual({ items: [1], total: 9, page: 1, pageSize: 5 });
    expect(readPage({ data: [1], total: 3 }, { page: 1, pageSize: 20 }).total).toBe(3);
    expect(readPage([1, 2, 3], { page: 1, pageSize: 20 }).items).toEqual([1, 2, 3]);
    expect(readPage({ data: [{ n: 1 }] }, { page: 1, pageSize: 20 }, (row: { n: number }) => row.n * 2).items).toEqual([2]);
    // No total: never more than what has been seen.
    expect(readPage({ data: [1, 2] }, { page: 3, pageSize: 10 }).total).toBe(22);
    expect(readPage(null, { page: 1, pageSize: 10 })).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    expect(readPage({ data: [], meta: { total: -4 } }, { page: 1, pageSize: 10 }).total).toBe(0);
  });

  it('pages a loaded list and counts pages', () => {
    const rows = Array.from({ length: 45 }, (_, i) => i + 1);
    expect(slicePage(rows, 3, 20)).toEqual({ items: [41, 42, 43, 44, 45], total: 45, page: 3, pageSize: 20 });
    expect(slicePage(rows, 9, 20).page).toBe(3);
    expect(slicePage([], 2, 20)).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });

  it('sends several states in one request, one state as status, and a trimmed search', () => {
    expect(filterParams({ statuses: ['ACCEPTED', 'EN_ROUTE'] })).toEqual({ statuses: 'accepted,en_route' });
    expect(filterParams({ statuses: ['COMPLETED'] })).toEqual({ status: 'completed' });
    expect(filterParams({ status: 'CANCELLED', search: '  điều hoà ' })).toEqual({ status: 'cancelled', search: 'điều hoà' });
    expect(filterParams({ excludeVisitGroups: true })).toEqual({ excludeVisitGroups: 'true' });
    expect(filterParams({ excludeVisitGroups: false })).toEqual({});
    expect(filterParams({ statuses: [], search: '   ' })).toEqual({});
    expect(filterParams()).toEqual({});
  });
});

describe('page state in the address bar', () => {
  const Probe = defineComponent({
    setup() {
      const page = useQueryPage();
      const tab = useQueryChoice('tab', ['all', 'done'] as const, 'all');
      return { page, tab };
    },
    render() {
      return h('span', `${this.page}|${this.tab}`);
    },
  });

  async function mountAt(path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/list', component: Probe },
        { path: '/other', component: { render: () => h('i') } },
      ],
    });
    await router.push(path);
    await router.isReady();
    const wrapper = mount({ render: () => h(Probe) }, { global: { plugins: [router] } });
    return { router, wrapper };
  }

  it('reads ?page and ?tab, ignoring values that make no sense', async () => {
    expect((await mountAt('/list?page=3&tab=done')).wrapper.text()).toBe('3|done');
    expect((await mountAt('/list?page=-2&tab=nope')).wrapper.text()).toBe('1|all');
    expect((await mountAt('/list?page=abc')).wrapper.text()).toBe('1|all');
  });

  it('writes changes made in the same moment together, leaves defaults out and keeps other keys', async () => {
    const { router, wrapper } = await mountAt('/list?payment=success');
    const vm = wrapper.findComponent(Probe).vm as unknown as { page: number; tab: string };
    vm.tab = 'done';
    vm.page = 4;
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ payment: 'success', tab: 'done', page: '4' });
    vm.page = 1;
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ payment: 'success', tab: 'done' });
  });

  it('sends a search about 300 ms after typing stops, trimmed, and keeps it as ?q=', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/list', component: { render: () => h('i') } }] });
    await router.push('/list?page=3');
    await router.isReady();
    let state!: ReturnType<typeof useQuerySearch>;
    mount(defineComponent({ setup() { state = useQuerySearch(); return () => h('i'); } }), { global: { plugins: [router] } });
    vi.useFakeTimers();
    try {
      state.input.value = 'dieu';
      await vi.advanceTimersByTimeAsync(200);
      state.input.value = ' dieu hoa ';
      await vi.advanceTimersByTimeAsync(200);
      expect(state.search.value).toBe('');
      await vi.advanceTimersByTimeAsync(150);
      expect(state.search.value).toBe('dieu hoa');
    } finally {
      vi.useRealTimers();
    }
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ page: '3', q: 'dieu hoa' });
  });

  it('follows back and forward to another page of the same list', async () => {
    const { router, wrapper } = await mountAt('/list');
    await router.push('/list?page=2');
    await nextTick();
    expect(wrapper.text()).toBe('2|all');
  });
});

describe('usePagedList', () => {
  it('ignores an answer that arrives after a newer request, and moves back to the last page that exists', async () => {
    let releaseFirst!: (value: PageResult<string>) => void;
    const fetch = vi
      .fn<(page: number, pageSize: number) => Promise<PageResult<string>>>()
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
      .mockResolvedValueOnce({ items: ['new'], total: 1, page: 1, pageSize: 10 });
    let list!: ReturnType<typeof usePagedList<string>>;
    mount(defineComponent({ setup() { list = usePagedList({ key: () => ['test-list'], pageSize: 10, fetch }); return () => h('i'); } }));
    await flushPromises();
    void list.load();
    await flushPromises();
    releaseFirst({ items: ['old'], total: 1, page: 1, pageSize: 10 });
    await flushPromises();
    expect(list.items.value).toEqual(['new']);

    // An old link to page 5 of a two-page list lands on page 2.
    fetch.mockReset()
      .mockResolvedValueOnce({ items: [], total: 15, page: 5, pageSize: 10 })
      .mockResolvedValueOnce({ items: ['p2'], total: 15, page: 2, pageSize: 10 });
    list.page.value = 5;
    await flushPromises();
    expect(list.page.value).toBe(2);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([5, 2]);
    expect(list.items.value).toEqual(['p2']);
  });
});

describe('API endpoints send page and pageSize', () => {
  beforeEach(() => mockGet.mockReset());

  it('technician earnings: dates only when set, numbers read safely', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { totalCompletedOrders: '3', totalGross: '600000', totalNet: 540000, paidOrders: 2, payouts: [{ orderId: 'o1', orderCode: 'FH-1', gross: '200000', net: '180000', orderValue: 250000, paid: true }], page: 1, pageSize: 20, total: 3 } },
    });
    const result = await technicianEarningsApi.getMyEarnings({ from: '2026-10-05', to: '2026-10-11', page: 1, pageSize: 20 });
    expect(mockGet).toHaveBeenCalledWith('/technicians/me/earnings', { params: { page: 1, pageSize: 20, from: '2026-10-05', to: '2026-10-11' } });
    expect(result).toMatchObject({ totalCompletedOrders: 3, totalGross: 600000, totalNet: 540000, paidOrders: 2, total: 3, rating: null });
    expect(result.payouts[0]).toMatchObject({ orderId: 'o1', gross: 200000, net: 180000, paid: true, customer: null });

    mockGet.mockResolvedValueOnce({ data: { data: { totalCompletedOrders: 0, payouts: [] } } });
    const all = await technicianEarningsApi.getMyEarnings({ from: null, to: null, page: 2, pageSize: 20 });
    expect(mockGet).toHaveBeenLastCalledWith('/technicians/me/earnings', { params: { page: 2, pageSize: 20 } });
    expect(all).toMatchObject({ page: 2, pageSize: 20, total: 0, payouts: [] });
  });

  it('notifications: the total comes from meta.total', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [{ id: 'n1' }], meta: { page: 2, limit: 20, total: 41, totalPages: 3 } } });
    const result = await notificationsApi.getMyNotifications(2, 20);
    expect(mockGet).toHaveBeenCalledWith('/notifications', { params: { page: 2, limit: 20 } });
    expect(result.total).toBe(41);
  });

  it('technician jobs, staff orders, cancellations and staff bookings', async () => {
    mockGet.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await ordersApi.getTechnicianJobsPage(2, 20, { status: 'UNDER_REPAIR' });
    expect(mockGet).toHaveBeenLastCalledWith('/service-orders/my', { params: { page: 2, pageSize: 20, status: 'under_repair' } });
    await ordersApi.getConsoleOrdersPage(3, 20, { status: 'COMPLETED', search: '  FH-12 ' });
    expect(mockGet).toHaveBeenLastCalledWith('/service-orders', { params: { page: 3, pageSize: 20, status: 'completed', search: 'FH-12' } });
    await ordersApi.getConsoleOrdersPage(1, 20, { search: '   ' });
    expect(mockGet).toHaveBeenLastCalledWith('/service-orders', { params: { page: 1, pageSize: 20 } });
    await ordersApi.getTechnicianJobsPage(1, 20, { statuses: ['accepted', 'en_route'] });
    expect(mockGet).toHaveBeenLastCalledWith('/service-orders/my', { params: { page: 1, pageSize: 20, statuses: 'accepted,en_route' } });
    await ordersApi.getRepairHistory(2, 20, 'cancelled', ' dieu hoa ');
    expect(mockGet).toHaveBeenLastCalledWith('/repair-history', { params: { page: 2, pageSize: 20, status: 'cancelled', search: 'dieu hoa' } });
    await ordersApi.getCancellationsPage(4, 20);
    expect(mockGet).toHaveBeenLastCalledWith('/cancellations', { params: { page: 4, pageSize: 20 } });
    await bookingsApi.getStaffBookingsPage(2, 20, { statuses: ['submitted', 'matching', 'closed'], overdue: false, sort: 'appointment' });
    expect(mockGet).toHaveBeenLastCalledWith('/bookings', {
      params: { page: 2, pageSize: 20, statuses: 'submitted,matching,closed', overdue: 'false', sort: 'appointment' },
    });
    await bookingsApi.getStaffBookingsPage(1, 1, { statuses: ['submitted', 'matching', 'closed'], overdue: true, sort: 'appointment' });
    expect(mockGet).toHaveBeenLastCalledWith('/bookings', {
      params: { page: 1, pageSize: 1, statuses: 'submitted,matching,closed', overdue: 'true', sort: 'appointment' },
    });
  });
});
