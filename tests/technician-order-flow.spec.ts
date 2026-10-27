import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, onMounted } from 'vue';
import { createTestQueryClient, installQueryClient } from './support/query-client';
import { queryKeys } from '../src/lib/query-keys';

const { mockGet, mockPost, mockRouteState, mockRouteControl, mockPush, mockSocketSubscriptions } = vi.hoisted(() => {
  const routeState = { params: { id: 'job-test-101' }, query: {} as Record<string, unknown> };
  const routeControl: { current: { params: { id: string }; query: Record<string, unknown> } | null } = { current: null };
  const socketSubscriptions: Array<Record<string, (event: unknown) => void>> = [];
  const push = vi.fn((to: string | { path?: string; query?: Record<string, unknown> }) => {
    if (!routeControl.current) return Promise.resolve();
    const path = typeof to === 'string' ? to : to.path;
    const match = path?.match(/^\/tech\/jobs\/([^/?]+)/);
    if (match) routeControl.current.params.id = decodeURIComponent(match[1]);
    routeControl.current.query = typeof to === 'object' && to.query ? to.query : {};
    return Promise.resolve();
  });
  return {
    mockGet: vi.fn(),
    mockPost: vi.fn(),
    mockRouteState: routeState,
    mockRouteControl: routeControl,
    mockPush: push,
    mockSocketSubscriptions: socketSubscriptions,
  };
});

vi.mock('../src/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getHttpStatus: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));

vi.mock('vue-router', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue');
  const route = vue.reactive(mockRouteState);
  mockRouteControl.current = route;
  return { useRoute: () => route, useRouter: () => ({ push: mockPush }) };
});

vi.mock('../src/services/chat-socket.service', () => ({
  chatSocketService: {
    connected: true,
    subscribe: (handlers: Record<string, (event: unknown) => void>) => {
      mockSocketSubscriptions.push(handlers);
      return () => {
        const index = mockSocketSubscriptions.indexOf(handlers);
        if (index >= 0) mockSocketSubscriptions.splice(index, 1);
      };
    },
  },
}));

vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    openConversationForBooking: vi.fn(),
    toggleWidget: vi.fn(),
    conversations: [],
  }),
}));

import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
import TechnicianJobsPage from '../src/pages/technician/TechnicianJobsPage.vue';

const activeOrder = {
  id: 'job-test-101',
  code: 'SO-101',
  bookingId: 'booking-101',
  serviceName: 'Sửa điều hòa rò rỉ gas',
  status: 'ACCEPTED',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  addressSummary: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
  scheduledAt: '2026-10-01T08:00:00Z',
  laborTotal: 150000,
  partsTotal: 0,
  grandTotal: 150000,
  paymentStatus: 'UNPAID',
  createdAt: '2026-09-26T00:00:00Z',
  destination: { lat: 10.7769, lng: 106.7009 },
};

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant'],
    template: '<button :disabled="disabled" :data-variant="variant"><slot /></button>',
  },
  FhCard: { props: ['title'], template: '<section class="fh-card"><h4>{{ title }}</h4><slot /></section>' },
  FhStatusPill: { props: ['status'], template: '<span class="status-pill">{{ status }}</span>' },
  FhMoney: { props: ['amount'], template: '<span>{{ amount }} đ</span>' },
  FhCostBreakdown: { template: '<div>Cost breakdown</div>' },
  'router-link': defineComponent({
    props: { to: { type: [String, Object], required: true } },
    setup(props, { slots }) {
      return () => h('a', {
        href: typeof props.to === 'string' ? props.to : props.to.path,
        onClick: (event: Event) => {
          event.preventDefault();
          void mockPush(props.to as string | { path?: string; query?: Record<string, unknown> });
        },
      }, slots.default?.());
    },
  }),
  BookingMediaViewer: {
    props: ['bookingId', 'media'],
    template: '<div data-testid="booking-media-viewer" :data-booking-id="bookingId" :data-media-count="media.length">Media</div>',
  },
  TechnicianPartsSection: { template: '<div data-testid="parts-section">Parts</div>' },
  FailedRepairDialog: defineComponent({
    props: ['orderId'],
    emits: ['close', 'reported'],
    setup(props, { emit }) {
      return () => h('div', { 'data-testid': 'failed-repair-dialog', 'data-order-id': props.orderId }, [
        h('button', { type: 'button', onClick: () => emit('reported') }, 'Đã báo cáo'),
      ]);
    },
  }),
};

/** Opens the "Thêm" overflow menu, where the rare actions of the job page live. */
async function openMoreMenu(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="job-more-button"]').trigger('click');
  await flushPromises();
}

const menuItems = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[role="menuitem"]').map((item) => item.text());

describe('VisitGroup departure and whole-visit warehouse warning', () => {
  beforeEach(() => {
    mockGet.mockReset(); mockPost.mockReset(); mockPush.mockClear();
    if (mockRouteControl.current) { mockRouteControl.current.params.id = 'job-test-101'; mockRouteControl.current.query = {}; }
    mockSocketSubscriptions.splice(0);
    installQueryClient(createTestQueryClient({ queries: { gcTime: 60_000 } }));
  });
  const ids = ['job-test-101', 'job-test-202', 'job-test-303'];
  const request = (id: string, status = 'ready') => ({ id: `request-${id}`, serviceOrderId: id, requestType: 'pre_repair', status, items: [] });
  const ledger = (id: string, issued: number, used: number, declared: number, accepted: number) => ({
    orderId: id, partRequestId: `request-${id}`, partRequestItemId: `item-${id}`, partNameSnapshot: 'Linh kiện fixture',
    issuedQty: issued, usedQty: used, declaredQty: declared, managerAcceptedQty: accepted, outstandingQty: issued - used - accepted, version: 1,
  });
  async function render(options: { status?: string; missing?: string; denied?: string; foreignRequest?: string; requestStatuses?: string[]; returns?: Record<string, unknown[] | Promise<unknown[]>>; invalidReturns?: string; invalidEnvelope?: string } = {}) {
    mockGet.mockImplementation(async (path: string) => {
      const id = ids.find(id => path === `/service-orders/${id}`);
      if (id) return { data: { data: { ...activeOrder, id, bookingId: `booking-${id}`, visitGroupId: 'visit-p1', status: options.status ?? 'ACCEPTED' } } };
      if (path === '/visit-groups/visit-p1/checkout') return { data: { data: {
        visitGroupId: 'visit-p1', total: 0, waiting: 0, ready: true, paid: false,
        devices: ids.map((id, i) => ({ sequence: i + 1, bookingId: `booking-${id}`, serviceOrderId: id, serviceName: `Máy fixture ${i + 1}`, state: options.status === 'COMPLETED' ? 'succeeded' : 'open', amount: 0, paid: false })),
      } } };
      const partsId = ids.find(id => path === `/service-orders/${id}/part-requests`);
      if (partsId) {
        if (partsId === options.denied) throw { response: { status: 403 } };
        return { data: { data: partsId === options.missing ? [] : [request(partsId === options.foreignRequest ? ids[0] : partsId, options.requestStatuses?.[ids.indexOf(partsId)] ?? 'ready')] } };
      }
      const returnsId = ids.find(id => path === `/service-orders/${id}/part-returns`);
      if (returnsId) {
        if (returnsId === options.invalidReturns) throw { response: { status: 503 } };
        if (returnsId === options.invalidEnvelope) return { data: {} };
        return { data: { data: await options.returns?.[returnsId] ?? [] } };
      }
      return { data: { data: path.endsWith('/invoice') || path.endsWith('/cash-settlement') ? null : [] } };
    });
    mockPost.mockResolvedValue({ data: { data: {} } });
    const w = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises(); return w;
  }
  it('reads all three requests again and skips redundant pre-order modal without claiming stock was picked up', async () => {
    const w = await render();
    mockGet.mockClear();
    await w.get('[data-testid="job-now"]').findAll('button').find(b => b.text().includes('Bắt đầu di chuyển'))!.trigger('click'); await flushPromises();
    expect(w.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(false);
    for (const id of ids) expect(mockGet).toHaveBeenCalledWith(`/service-orders/${id}/part-requests`);
    expect(mockPost.mock.calls).toEqual([['/service-orders/job-test-101/en-route']]);
    expect(w.text()).not.toContain('Đã nhận qua QR'); w.unmount();
  });
  it.each(['missing', 'denied', 'foreignRequest'] as const)('does not skip if machine 2 is %s and identifies that child', async problem => {
    const w = await render({ [problem]: ids[1] });
    await w.get('[data-testid="job-now"]').findAll('button').find(b => b.text().includes('Bắt đầu di chuyển'))!.trigger('click'); await flushPromises();
    const dialog = w.get('[data-testid="departure-pre-repair-dialog"]');
    expect(dialog.get('[data-testid="departure-missing-devices"]').text()).toContain('Máy 2');
    expect(mockPost).not.toHaveBeenCalled(); w.unmount();
  });
  it('skips a duplicate creation prompt for requested/ready/delivering requests without receiving stock', async () => {
    const w = await render({ requestStatuses: ['requested', 'ready', 'delivering'] });
    await w.get('[data-testid="job-now"]').findAll('button').find(b => b.text().includes('Bắt đầu di chuyển'))!.trigger('click'); await flushPromises();
    expect(w.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(false);
    expect(w.text()).toContain('Chờ kho chuẩn bị'); expect(w.text()).toContain('Sẵn sàng nhận'); expect(w.text()).toContain('Đang giao');
    expect(w.text()).not.toContain('Đã nhận qua QR');
    expect(mockPost.mock.calls).toEqual([['/service-orders/job-test-101/en-route']]); w.unmount();
  });
  it.each(['cancelled', 'unexpected'])('does not count %s requests as valid preparation', async status => {
    const w = await render({ requestStatuses: ['ready', status, 'ready'] });
    await w.get('[data-testid="job-now"]').findAll('button').find(b => b.text().includes('Bắt đầu di chuyển'))!.trigger('click'); await flushPromises();
    expect(w.get('[data-testid="departure-missing-devices"]').text()).toContain('Máy 2');
    expect(mockPost).not.toHaveBeenCalled(); w.unmount();
  });
  it('keeps two completed-machine return obligations at the top while switching active machine', async () => {
    const w = await render({ status: 'COMPLETED', returns: { [ids[0]]: [ledger(ids[0], 4, 1, 2, 0)], [ids[1]]: [ledger(ids[1], 2, 0, 2, 1)] } });
    let banner = w.get('[data-testid="visit-returns-warning"]');
    expect(banner.text()).toContain('1 linh kiện cần khai trả');
    expect(banner.text()).toContain('3 linh kiện chờ Quản lý Dịch vụ xác nhận');
    expect(banner.get('[data-testid="visit-return-device-1"]').text()).toContain('2 đã khai');
    expect(banner.get('[data-testid="visit-return-device-2"]').text()).toContain('1 đã khai');
    expect(banner.attributes('role')).toBe('status');
    const heading = w.get('h1').element;
    expect(heading.compareDocumentPosition(banner.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.element.compareDocumentPosition(w.get('[data-testid="job-visit"]').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await banner.get('[data-testid="visit-return-open-2"]').trigger('click'); await flushPromises();
    expect(mockPush).toHaveBeenCalledWith({ path: '/tech/jobs/job-test-202', query: { focus: 'parts' } });
    banner = w.get('[data-testid="visit-returns-warning"]');
    expect(banner.text()).toContain('1 linh kiện cần khai trả');
    expect(banner.text()).toContain('3 linh kiện chờ Quản lý Dịch vụ xác nhận');
    expect(w.find('#job-parts').exists()).toBe(true);
    expect(mockPost).not.toHaveBeenCalled(); w.unmount();
  });
  it('clears only quantities physically accepted by manager after an authoritative refresh', async () => {
    const returns = { [ids[0]]: [ledger(ids[0], 2, 0, 2, 0)], [ids[1]]: [ledger(ids[1], 1, 0, 1, 0)] };
    const w = await render({ status: 'COMPLETED', returns });
    expect(w.get('[data-testid="visit-returns-warning"]').text()).toContain('3 linh kiện chờ');
    returns[ids[0]] = [ledger(ids[0], 2, 0, 2, 2)];
    window.dispatchEvent(new Event('focus')); await flushPromises();
    expect(w.get('[data-testid="visit-returns-warning"]').text()).toContain('1 linh kiện chờ');
    expect(w.find('[data-testid="visit-return-device-1"]').exists()).toBe(false);
    returns[ids[1]] = [ledger(ids[1], 1, 0, 1, 1)];
    window.dispatchEvent(new Event('focus')); await flushPromises();
    expect(w.find('[data-testid="visit-returns-warning"]').exists()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled(); w.unmount();
  });
  it('shows unknown child reads without inventing zero or hiding known pending returns', async () => {
    const w = await render({ status: 'COMPLETED', invalidReturns: ids[1], returns: { [ids[0]]: [ledger(ids[0], 2, 0, 2, 0)] } });
    const banner = w.get('[data-testid="visit-returns-warning"]');
    expect(banner.text()).toContain('2 linh kiện chờ');
    expect(banner.get('[data-testid="visit-return-device-2"]').text()).toContain('Chưa kiểm tra được');
    expect(banner.find('[data-testid="visit-returns-retry"]').exists()).toBe(true);
    expect(mockPost).not.toHaveBeenCalled(); w.unmount();
  });
  it('rejects a ledger belonging to another child rather than adding its quantities', async () => {
    const w = await render({ status: 'COMPLETED', returns: { [ids[1]]: [ledger(ids[0], 99, 0, 99, 0)] } });
    const banner = w.get('[data-testid="visit-returns-warning"]');
    expect(banner.text()).not.toContain('99');
    expect(banner.get('[data-testid="visit-return-device-2"]').text()).toContain('Chưa kiểm tra được');
    w.unmount();
  });
  it('treats a missing ledger envelope as unknown instead of an empty returned-stock list', async () => {
    const w = await render({ status: 'COMPLETED', invalidEnvelope: ids[1] });
    expect(w.get('[data-testid="visit-return-device-2"]').text()).toContain('Chưa kiểm tra được');
    expect(w.get('[data-testid="visit-returns-warning"]').text()).not.toContain('0 linh kiện');
    w.unmount();
  });
  it('ignores an older pending ledger response after a newer manager-confirmed read', async () => {
    let finish!: (rows: unknown[]) => void;
    const returns: Record<string, unknown[] | Promise<unknown[]>> = { [ids[0]]: new Promise(resolve => { finish = resolve; }) };
    const w = await render({ status: 'COMPLETED', returns });
    expect(w.get('[data-testid="visit-returns-warning"]').attributes('aria-busy')).toBe('true');
    returns[ids[0]] = [ledger(ids[0], 2, 0, 2, 2)];
    window.dispatchEvent(new Event('focus')); await flushPromises();
    expect(w.find('[data-testid="visit-returns-warning"]').exists()).toBe(false);
    finish([ledger(ids[0], 2, 0, 2, 0)]); await flushPromises();
    expect(w.find('[data-testid="visit-returns-warning"]').exists()).toBe(false);
    w.unmount();
  });
});

describe('Technician Order Receiving & Execution Workspace', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    if (mockRouteControl.current) {
      mockRouteControl.current.params.id = 'job-test-101';
      mockRouteControl.current.query = {};
    }
    mockPush.mockClear();
    mockSocketSubscriptions.splice(0);
  });

  it('offers repeatable supplemental quotes beside repair actions, then freezes them before payment', async () => {
    let frozen = false;
    const base = { id: 'q1', status: 'approved', items: [{ type: 'labor', description: 'Công cố định', quantity: 1, unitPrice: 449000, lineTotal: 449000 }], laborTotal: 449000, partsTotal: 0 };
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', quotation: base, completionRequestedAt: frozen ? '2026-10-26T01:00:00Z' : null } } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    let next = 0;
    mockPost.mockImplementation(async () => ({ data: { data: { id: `extra-${++next}`, status: 'pending_approval', reason: 'Cần sửa thêm', items: [], totalLaborDelta: 50000, totalPartsDelta: 0, createdAt: '2026-10-26T00:00:00Z' } } }));
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.get('[data-testid="job-now"] [data-testid="repair-additional-quote"]').text()).toBe('Báo giá bổ sung');
    for (let n = 0; n < 3; n++) {
      await wrapper.get('[data-testid="repair-additional-quote"]').trigger('click');
      await wrapper.get('[data-testid="additional-cost-form"] textarea').setValue('Cần sửa thêm');
      await wrapper.get('[data-testid="additional-cost-form"] input[aria-label="Mô tả công việc phát sinh"]').setValue('Công phát sinh');
      await wrapper.get('[data-testid="additional-cost-form"] input[aria-label="Đơn giá"]').setValue(50000);
      await wrapper.findAll('button').find(b => b.text().includes('Gửi cho khách duyệt'))!.trigger('click');
      await flushPromises();
    }
    expect(mockPost.mock.calls.filter(([path]) => path.endsWith('/additional-costs'))).toHaveLength(3);
    expect(wrapper.get('[data-testid="additional-history-summary"]').text()).toContain('3 chờ duyệt');
    expect(wrapper.get('[data-testid="completion-blockers"]').text()).toContain('chờ khách duyệt');
    await wrapper.get('[data-testid="repair-additional-quote"]').trigger('click');
    frozen = true;
    await openMoreMenu(wrapper);
    await wrapper.findAll('[role="menuitem"]').find(b => b.text().includes('Làm mới'))!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="repair-additional-quote"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="additional-cost-form"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="cost-lines-quotation"]').text()).toContain('Công cố định');
    wrapper.unmount();
  });

  it('blocks new supplemental quotes when an invoice exists even without completionRequestedAt', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', quotation: { id: 'q1', status: 'approved', items: [], laborTotal: 150000, partsTotal: 0 } } } };
      if (path.endsWith('/invoice')) return { data: { data: { id: 'invoice-1', total: 150000 } } };
      if (path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="repair-additional-quote"]').exists()).toBe(false);
    expect(wrapper.findAll('button').some(b => b.text().includes('Thêm chi phí phát sinh'))).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ['solo repair', null],
    ['VisitGroup child repair', 'visit-101'],
  ] as const)('offers repair failure from the Thêm menu for a %s', async (_label, visitGroupId) => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', visitGroupId, quotation: { id: 'approved-quote', status: 'approved', items: [], laborTotal: 150000, partsTotal: 0 } } } };
      if (path === '/visit-groups/visit-101/checkout') return { data: { data: { visitGroupId: 'visit-101', total: 0, waiting: 1, ready: false, paid: false, devices: [] } } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="job-repair-failed"]').exists()).toBe(false);
    await openMoreMenu(wrapper);
    const menu = wrapper.get('[role="menu"]');
    expect(wrapper.get('[data-testid="job-more-button"]').attributes('aria-expanded')).toBe('true');
    expect(menu.text()).toContain('Không sửa được');
    expect(menu.text()).not.toContain('Hủy đơn');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="failed-repair-dialog"]').exists()).toBe(false);

    await openMoreMenu(wrapper);
    await wrapper.get('[data-testid="job-repair-failed-menu"]').trigger('click');
    const dialog = wrapper.get('[data-testid="failed-repair-dialog"]');
    expect(dialog.attributes('data-order-id')).toBe('job-test-101');
    await dialog.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="failed-repair-dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('summarizes pre-repair parts for all three machines and opens the exact sibling to prepare', async () => {
    const queryClient = createTestQueryClient({ queries: { gcTime: 60_000 } });
    installQueryClient(queryClient);
    mockGet.mockImplementation(async (path: string) => {
      if (/^\/service-orders\/job-test-\d+$/.test(path)) return { data: { data: { ...activeOrder, id: path.split('/').at(-1), visitGroupId: 'v1' } } };
      if (path === '/visit-groups/v1/checkout') return { data: { data: {
        visitGroupId: 'v1', total: 0, waiting: 3, ready: false, paid: false,
        devices: [101, 202, 303].map((n, i) => ({ sequence: i + 1, bookingId: `b${n}`, serviceOrderId: `job-test-${n}`, serviceName: `Thiết bị ${i+1}`, state: 'open', amount: 0, paid: false })),
      } } };
      if (path.endsWith('/part-requests')) return { data: { data: path.includes('101') ? [{ id: 'p1', serviceOrderId: 'job-test-101', requestType: 'pre_repair', status: 'received', items: [] }] : [] } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.findAll('button').find(b => b.text().includes('Bắt đầu di chuyển'))!.trigger('click');
    await flushPromises();
    const dialog = wrapper.get('[data-testid="departure-pre-repair-dialog"]');
    expect(dialog.text()).toContain('Máy 1');
    expect(dialog.text()).toContain('Máy 2');
    expect(dialog.text()).toContain('Máy 3');
    expect(dialog.text()).toContain('Không bắt buộc');
    expect(mockPost).not.toHaveBeenCalled();
    await dialog.get('[data-testid="prepare-device-2"]').trigger('click');
    await flushPromises();
    expect(mockPush).toHaveBeenCalledWith({ path: '/tech/jobs/job-test-202', query: { focus: 'parts', prepare: 'true' } });
    expect(wrapper.find('[data-testid="technician-job-loading-skeleton"]').exists()).toBe(false);
    wrapper.unmount();
    queryClient.clear();
  });

  it('allows completion with an undeclared return while preserving usage and approval guards', async () => {
    let pendingReturn = 2;
    const custody = new Map([['part-item-1', { usedQty: 1, declaredQty: 0 }]]);
    const partRequest = { id: 'part-request-1', requestType: 'pre_repair', status: 'received', receivedAt: '2026-10-26T01:00:00Z', items: [
      { id: 'part-item-1', partCatalogId: 'fan-1', partSource: 'fixhome', partNameSnapshot: 'Quạt dàn nóng', quantity: 3, unitPriceSnapshot: 30000, usageStatus: 'used' },
    ] };
    const Parts = defineComponent({ emits: ['return-summary', 'custody', 'pending-usage'], setup(_, { emit }) { onMounted(() => {
      emit('return-summary', { needDeclare: pendingReturn, awaitingManager: 0 });
      emit('custody', custody);
      emit('pending-usage', 0);
    }); return () => null; } });
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', pricingMode: 'fixed_price', afterEvidenceCount: 1,
        quotation: { id: 'quote-1', status: 'approved', items: [{ type: 'PARTS', partSource: 'fixhome', partCatalogId: 'fan-1', description: 'Quạt dàn nóng', quantity: 2, unitPrice: 30000, lineTotal: 60000 }] } } } };
      if (path.endsWith('/part-requests')) return { data: { data: [partRequest] } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValue({ data: { data: {} } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs: { ...stubs, TechnicianPartsSection: Parts } } });
    await flushPromises();
    expect(wrapper.find('[data-testid="completion-blockers"]').exists()).toBe(false);
    expect(wrapper.findAll('button').find(b => b.text() === 'Gửi hoàn thành')?.attributes('disabled')).toBeUndefined();
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.findComponent(Parts).vm.$emit('pending-usage', 1);
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button').find(b => b.text() === 'Gửi hoàn thành')!.trigger('click');
    expect(wrapper.find('[data-testid="completion-confirm-dialog"]').exists()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.findComponent(Parts).vm.$emit('pending-usage', 0);
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button').find(b => b.text() === 'Gửi hoàn thành')!.trigger('click');
    expect(mockPost).not.toHaveBeenCalled();
    const confirm = wrapper.get('[data-testid="completion-confirm-dialog"]');
    expect(confirm.text()).toContain('Còn khoản phát sinh chưa báo?');
    expect(confirm.text()).toContain('khóa');
    expect(confirm.get('[data-testid="completion-returns-owed"]').text()).toContain('Còn 2 linh kiện cần khai trả');
    expect(wrapper.findComponent(Parts).exists()).toBe(true);
    pendingReturn = 0;
    wrapper.findComponent(Parts).vm.$emit('return-summary', { needDeclare: 0, awaitingManager: 1 });
    await flushPromises();
    expect(confirm.text()).toContain('1 linh kiện đã khai trả');
    await confirm.get('[data-testid="confirm-finalize-repair"]').trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0]?.[0]).toContain('request-completion');
    wrapper.unmount();
  });

  it('offers FixHome catalog parts only in a new supplemental quote', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', quotation: {
        id: 'quote-1', status: 'approved', items: [{ type: 'LABOR', description: 'Công sửa', quantity: 1, unitPrice: 449000, lineTotal: 449000 }],
      } } } };
      if (path === '/parts/catalog') return { data: { data: [{ id: 'cap-1', name: 'Tụ quạt', sellingPrice: 30000, warrantyDays: 90 }], meta: { total: 1 } } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="repair-additional-quote"]').trigger('click');
    const form = wrapper.get('[data-testid="additional-cost-form"]');
    await form.findAll('button').find(button => button.text().includes('Linh kiện FixHome'))!.trigger('click');
    await flushPromises();
    const picker = wrapper.get('[role="dialog"][aria-labelledby="part-picker-title"]');
    await picker.findAll('button').find(button => button.text().includes('Tụ quạt'))!.trigger('click');
    await flushPromises();
    expect(form.find('select[aria-label="Nguồn linh kiện"]').exists()).toBe(false);
    expect(form.text()).not.toContain('Thợ tự có');
    expect(form.text()).toContain('Tụ quạt');
    wrapper.unmount();
  });

  it('keeps a technician-owned part from a rejected supplemental quote read-only during revision', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: { ...activeOrder, status: 'UNDER_REPAIR', quotation: {
        id: 'quote-1', status: 'approved', items: [{ type: 'LABOR', description: 'Công sửa', quantity: 1, unitPrice: 449000, lineTotal: 449000 }],
      } } } };
      if (path.endsWith('/additional-costs')) return { data: { data: [{ id: 'old-extra', status: 'REJECTED', reason: 'Cần sửa thêm', totalLaborDelta: 0, totalPartsDelta: 70000,
        items: [{ id: 'old-part', type: 'PARTS', partSource: 'technician', description: 'Van riêng', quantity: 1, unitPrice: 70000, lineTotal: 70000 }] }] } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Sửa và gửi lại')!.trigger('click');
    const form = wrapper.get('[data-testid="additional-cost-form"]');
    expect(form.get('[data-testid="legacy-additional-parts"]').text()).toContain('Van riêng × 1 · thợ tự có');
    expect(form.find('select[aria-label="Nguồn linh kiện"]').exists()).toBe(false);
    expect(form.find('input[aria-label="Tên linh kiện"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('seeds the correct fixed labor draft when switching directly between two quote-ready children', async () => {
    const queryClient = createTestQueryClient({ queries: { gcTime: 60_000 } });
    installQueryClient(queryClient);
    mockGet.mockImplementation(async (path: string) => {
      if (/^\/service-orders\/job-test-\d+$/.test(path)) return { data: { data: { ...activeOrder, id: path.split('/').at(-1), status: 'EN_ROUTE', arrivalVerified: true, beforeEvidenceCount: 1, visitGroupId: 'v1', pricingMode: 'fixed_price', quantity: 1, fixedUnitPrice: path.endsWith('101') ? 449000 : 229000 } } };
      if (path === '/visit-groups/v1/checkout') return { data: { data: { visitGroupId: 'v1', waiting: 2, ready: false, total: 0, devices: [101,202].map((n,i) => ({sequence:i+1,bookingId:`b${n}`,serviceOrderId:`job-test-${n}`,state:'open',amount:0,paid:false})) } } };
      if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect((wrapper.get('[data-testid="quotation-form"] input[aria-label="Đơn giá"]').element as HTMLInputElement).value).toBe('449000');
    await wrapper.get('[data-testid="tech-visit-device-2"]').trigger('click');
    await flushPromises();
    expect((wrapper.get('[data-testid="quotation-form"] input[aria-label="Đơn giá"]').element as HTMLInputElement).value).toBe('229000');
    expect(wrapper.find('[data-testid="technician-job-loading-skeleton"]').exists()).toBe(false);
    wrapper.unmount();
    queryClient.clear();
  });

  it('renders Hero Action Bar with correct initial action for ACCEPTED status', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      if (path === '/bookings/booking-101') return { data: { data: { id: 'booking-101', media: [] } } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    // The current step and its one primary action
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Xuất phát đến nhà khách');
    expect(wrapper.text()).toContain('Bắt đầu di chuyển');

    // Call, message and directions appear exactly once, next to the customer
    const mapLinks = wrapper.findAll('a[href*="google.com/maps"]');
    expect(mapLinks).toHaveLength(1);
    expect(mapLinks[0].attributes('href')).toContain('destination=10.7769,106.7009');
    expect(wrapper.findAll('a[href^="tel:"]')).toHaveLength(1);
    expect(wrapper.findAll('button').filter((b) => b.text().trim() === 'Nhắn tin')).toHaveLength(1);

    // Cancelling is available before check-in, from the overflow menu, under its new name
    expect(wrapper.text()).not.toContain('Rút khỏi đơn');
    await openMoreMenu(wrapper);
    expect(menuItems(wrapper)).toContain('Huỷ đơn');

    wrapper.unmount();
  });

  it('prefetches only the other assigned visit orders and seeds their detail cache', async () => {
    // The sibling detail has no observer yet, so keep this cache entry alive
    // long enough to verify that navigation can reuse the prefetched bundle.
    const queryClient = createTestQueryClient({ queries: { gcTime: 60_000 } });
    installQueryClient(queryClient);
    const current = { ...activeOrder, visitGroupId: 'visit-1' };
    const sibling = { ...activeOrder, id: 'job-test-202', bookingId: 'booking-202', visitGroupId: 'visit-1' };
    const third = { ...activeOrder, id: 'job-test-303', bookingId: 'booking-303', visitGroupId: 'visit-1' };
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: current } };
      if (path === '/service-orders/job-test-202') return { data: { data: sibling } };
      if (path === '/service-orders/job-test-303') return { data: { data: third } };
      if (path === '/visit-groups/visit-1/checkout') return { data: { data: {
        visitGroupId: 'visit-1', total: 0, waiting: 3, ready: false, paid: false, pendingCash: null,
        devices: [
          { sequence: 1, bookingId: 'booking-101', serviceName: 'Máy lạnh', serviceOrderId: 'job-test-101', state: 'open', amount: 0, paid: false },
          { sequence: 2, bookingId: 'booking-202', serviceName: 'Máy giặt', serviceOrderId: 'job-test-202', state: 'open', amount: 0, paid: false },
          { sequence: 3, bookingId: 'booking-303', serviceName: 'Tủ lạnh', serviceOrderId: 'job-test-303', state: 'open', amount: 0, paid: false },
          { sequence: 4, bookingId: 'booking-404', serviceName: 'Lò vi sóng', serviceOrderId: 'job-test-404', state: 'open', amount: 0, paid: false },
        ],
      } } };
      if (path.endsWith('/cash-settlement')) return { data: { data: null } };
      if (path.endsWith('/evidence')) return { data: { data: [] } };
      if (path.startsWith('/bookings/')) return { data: { data: { id: path.split('/').at(-1), media: [] } } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await flushPromises();

    expect(mockGet).toHaveBeenCalledWith('/service-orders/job-test-202');
    expect(mockGet).toHaveBeenCalledWith('/service-orders/job-test-303');
    expect(mockGet).not.toHaveBeenCalledWith('/service-orders/job-test-404');
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.orders.technicianDetail('job-test-202'))).toMatchObject({ job: { id: 'job-test-202' } });
      expect(queryClient.getQueryData(queryKeys.orders.technicianDetail('job-test-303'))).toMatchObject({ job: { id: 'job-test-303' } });
    });
    expect(wrapper.find('[data-testid="tech-visit-navigator"]').exists()).toBe(true);
    wrapper.unmount();
    queryClient.clear();
  });

  it('switches to a prefetched child in the same page and opens its verified ready-parts section', async () => {
    const queryClient = createTestQueryClient({ queries: { gcTime: 60_000 } });
    installQueryClient(queryClient);
    let readyPartsPublished = false;
    let readyPartRequestsFailed = false;
    const current = { ...activeOrder, visitGroupId: 'visit-1', customerName: 'Khách máy A', serviceName: 'Máy lạnh A', status: 'EN_ROUTE' };
    const sibling = {
      ...activeOrder,
      id: 'job-test-202',
      bookingId: 'booking-202',
      serviceName: 'Máy giặt B',
      customerName: 'Khách máy B',
      visitGroupId: 'visit-1',
      status: 'UNDER_REPAIR',
    };
    const readyRequest = {
      id: 'part-ready-b', serviceOrderId: 'job-test-202', technicianId: 'tech-1', requestType: 'pre_repair',
      fulfillmentMethod: 'pickup', status: 'ready', shippingFee: 0, createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z', items: [],
    };
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: current } };
      if (path === '/service-orders/job-test-202') return { data: { data: sibling } };
      if (path === '/visit-groups/visit-1/checkout') return { data: { data: {
        visitGroupId: 'visit-1', total: 0, waiting: 2, ready: false, paid: false, pendingCash: null,
        devices: [
          { sequence: 1, bookingId: 'booking-101', serviceName: 'Máy lạnh A', serviceOrderId: 'job-test-101', state: 'open', amount: 0, paid: false },
          { sequence: 2, bookingId: 'booking-202', serviceName: 'Máy giặt B', serviceOrderId: 'job-test-202', state: 'open', amount: 0, paid: false },
        ],
      } } };
      if (path === '/service-orders/job-test-101/part-requests') return { data: { data: [] } };
      if (path === '/service-orders/job-test-202/part-requests') {
        if (readyPartRequestsFailed) throw new Error('Part request read unavailable');
        return { data: { data: readyPartsPublished ? [readyRequest] : [] } };
      }
      if (path.endsWith('/cash-settlement')) return { data: { data: null } };
      if (path.endsWith('/evidence')) return { data: { data: [] } };
      if (path.endsWith('/additional-costs')) return { data: { data: [] } };
      if (path.startsWith('/bookings/')) {
        const id = path.split('/').at(-1);
        return { data: { data: {
          id, status: 'MATCHED', media: [{ id: `media-${id}`, url: null, isPrivate: true, legacyInsecure: false, mimeType: 'image/jpeg', sizeBytes: 12 }],
          description: id === 'booking-202' ? 'Mô tả riêng máy B' : 'Mô tả riêng máy A',
        } } };
      }
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await flushPromises();
    expect(queryClient.getQueryData(queryKeys.orders.technicianDetail('job-test-202'))).toMatchObject({ job: { id: 'job-test-202' }, partRequests: [] });
    expect(wrapper.get('[data-testid="booking-description"]').text()).toContain('Mô tả riêng máy A');
    expect(wrapper.get('[data-testid="booking-media-viewer"]').attributes('data-booking-id')).toBe('booking-101');

    const notificationHandler = mockSocketSubscriptions.find((handlers) => typeof handlers.onNotificationNew === 'function');
    expect(notificationHandler).toBeDefined();
    readyPartsPublished = true;
    notificationHandler?.onNotificationNew?.({
      id: 'notification-1', title: 'Linh kiện đã sẵn sàng', message: 'Máy 2', type: 'PART_REQUEST_READY',
      referenceId: 'part-ready-b', referenceType: 'PartRequest', isRead: true, createdAt: '2026-10-23T00:00:00Z',
    });
    await flushPromises();

    expect(mockGet).not.toHaveBeenCalledWith('/part-requests/part-ready-b');
    expect(mockGet).toHaveBeenCalledWith('/service-orders/job-test-101/part-requests');
    expect(mockGet).toHaveBeenCalledWith('/service-orders/job-test-202/part-requests');
    expect(wrapper.get('[data-testid="tech-visit-ready-parts-alert"]').text()).toContain('Máy 2');
    const shell = wrapper.get('[data-testid="technician-job-detail-shell"]').element;
    await wrapper.get('[data-testid="tech-visit-ready-parts-action"]').trigger('click');

    expect(mockPush).toHaveBeenCalledWith({ path: '/tech/jobs/job-test-202', query: { focus: 'parts' } });
    expect(wrapper.get('[data-testid="technician-job-detail-shell"]').element).toBe(shell);
    expect(wrapper.find('[data-testid="technician-job-loading-skeleton"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="booking-description"]').text()).toContain('Mô tả riêng máy B');
    expect(wrapper.get('[data-testid="booking-description"]').text()).not.toContain('Mô tả riêng máy A');
    expect(wrapper.get('[data-testid="booking-media-viewer"]').attributes('data-booking-id')).toBe('booking-202');
    expect(wrapper.get('button[aria-controls="job-parts"]').attributes('aria-expanded')).toBe('true');

    readyPartRequestsFailed = true;
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(wrapper.find('[data-testid="tech-visit-ready-parts-alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="tech-visit-action-status-2"]').text()).toBe('Chưa cập nhật');

    await wrapper.get('[data-testid="tech-visit-device-1"]').trigger('click');
    expect(mockPush).toHaveBeenCalledWith('/tech/jobs/job-test-101');
    expect(wrapper.get('[data-testid="technician-job-detail-shell"]').element).toBe(shell);
    expect(wrapper.get('h1').text()).toContain('Máy lạnh A');
    expect(wrapper.get('[data-testid="booking-description"]').text()).toContain('Mô tả riêng máy A');
    expect(wrapper.get('[data-testid="booking-media-viewer"]').attributes('data-booking-id')).toBe('booking-101');
    expect(wrapper.find('[data-testid="technician-job-loading-skeleton"]').exists()).toBe(false);

    wrapper.unmount();
    queryClient.clear();
  });

  it('uses a child-safe skeleton on a cache miss instead of leaving the previous machine visible', async () => {
    const queryClient = createTestQueryClient({ queries: { gcTime: 60_000 } });
    installQueryClient(queryClient);
    const current = { ...activeOrder, visitGroupId: 'visit-1', customerName: 'Khách máy A' };
    let resolveUncachedOrder!: (value: { data: { data: typeof activeOrder } }) => void;
    const uncachedOrderRead = new Promise<{ data: { data: typeof activeOrder } }>((resolve) => { resolveUncachedOrder = resolve; });
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: current } };
      if (path === '/service-orders/job-test-404') return uncachedOrderRead;
      if (path === '/visit-groups/visit-1/checkout') return { data: { data: {
        visitGroupId: 'visit-1', total: 0, waiting: 1, ready: false, paid: false, pendingCash: null,
        devices: [{ sequence: 1, bookingId: 'booking-101', serviceName: 'Máy lạnh A', serviceOrderId: 'job-test-101', state: 'open', amount: 0, paid: false }],
      } } };
      if (path.endsWith('/cash-settlement')) return { data: { data: null } };
      if (path.endsWith('/evidence')) return { data: { data: [] } };
      if (path.startsWith('/bookings/')) return { data: { data: { id: 'booking-101', status: 'MATCHED', media: [], description: 'Mô tả riêng máy A' } } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.get('[data-testid="job-summary"]').text()).toContain('Khách máy A');

    await mockPush('/tech/jobs/job-test-404');
    await flushPromises();

    expect(wrapper.find('[data-testid="technician-job-loading-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="job-summary"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Khách máy A');
    expect(wrapper.text()).not.toContain('0901234567');

    wrapper.unmount();
    queryClient.clear();
    resolveUncachedOrder({ data: { data: { ...activeOrder, id: 'job-test-404' } } });
  });

  it('does not refill a prefetched order cache when the session ends during the read', async () => {
    const queryClient = createTestQueryClient({ queries: { gcTime: 60_000 } });
    installQueryClient(queryClient);
    const current = { ...activeOrder, visitGroupId: 'visit-1' };
    const sibling = { ...activeOrder, id: 'job-test-202', bookingId: 'booking-202', visitGroupId: 'visit-1' };
    let resolveSibling!: (value: { data: { data: typeof sibling } }) => void;
    const pendingSibling = new Promise<{ data: { data: typeof sibling } }>((resolve) => { resolveSibling = resolve; });
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: current } };
      if (path === '/service-orders/job-test-202') return pendingSibling;
      if (path === '/visit-groups/visit-1/checkout') return { data: { data: {
        visitGroupId: 'visit-1', total: 0, waiting: 2, ready: false, paid: false, pendingCash: null,
        devices: [
          { sequence: 1, bookingId: 'booking-101', serviceName: 'Máy lạnh', serviceOrderId: 'job-test-101', state: 'open', amount: 0, paid: false },
          { sequence: 2, bookingId: 'booking-202', serviceName: 'Máy giặt', serviceOrderId: 'job-test-202', state: 'open', amount: 0, paid: false },
        ],
      } } };
      if (path.endsWith('/cash-settlement')) return { data: { data: null } };
      if (path.endsWith('/evidence')) return { data: { data: [] } };
      if (path.startsWith('/bookings/')) return { data: { data: { id: path.split('/').at(-1), media: [] } } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledWith('/service-orders/job-test-202'));
    queryClient.clear();
    resolveSibling({ data: { data: sibling } });
    await flushPromises();
    await flushPromises();

    expect(queryClient.getQueryData(queryKeys.orders.technicianDetail('job-test-202'))).toBeUndefined();
    wrapper.unmount();
    queryClient.clear();
  });

  it('keeps the held, declare, and Service Manager confirmation custody steps visible after one device fails', async () => {
    const failedOrder = { ...activeOrder, status: 'CANCELLED', visitGroupId: 'visit-1' };
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: failedOrder } };
      if (path === '/visit-groups/visit-1/checkout') return { data: { data: {
        visitGroupId: 'visit-1', total: 0, waiting: 0, ready: true, paid: false, pendingCash: null,
        devices: [{ sequence: 1, bookingId: 'booking-101', serviceName: 'Máy lạnh', serviceOrderId: 'job-test-101', state: 'failed', amount: 0, paid: false }],
      } } };
      if (path.endsWith('/cash-settlement')) return { data: { data: null } };
      if (path.endsWith('/evidence')) return { data: { data: [] } };
      if (path.startsWith('/bookings/')) return { data: { data: { id: 'booking-101', media: [] } } };
      return { data: { data: [] } };
    });
    const custodyPartsStub = defineComponent({
      emits: ['pending-returns', 'return-summary'],
      setup(_props, { emit }) {
        onMounted(() => {
          emit('pending-returns', 2);
          emit('return-summary', { needDeclare: 1, awaitingManager: 1 });
        });
        return () => h('div', { 'data-testid': 'parts-section' }, 'Parts');
      },
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs: { ...stubs, TechnicianPartsSection: custodyPartsStub } } });
    await flushPromises();
    await flushPromises();

    const custody = wrapper.get('[data-testid="pending-parts-returns"]');
    expect(custody.text()).toContain('1 linh kiện chưa khai trả');
    expect(custody.text()).toContain('1 đã khai, chờ Quản lý Dịch vụ xác nhận đã nhận thực tế');
    expect(custody.text()).toContain('Mở khai trả');
  });

  it('offers releasing the order without losing points only when the server says the technician is on another job (PO 20/10/2026)', async () => {
    let eligible = false;
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/overrun-release') return { data: { data: { eligible, currentOrderCode: 'SO-099', block: eligible ? null : 'NO_CURRENT_JOB' } } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/bookings/booking-101') return { data: { data: { id: 'booking-101', media: [] } } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValue({ data: { data: {} } });
    const plain = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(plain.find('[data-testid="overrun-release-card"]').exists()).toBe(false);
    await openMoreMenu(plain);
    expect(menuItems(plain)).not.toContain('Không kịp tới, nhả đơn');
    plain.unmount();

    eligible = true;
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.get('[data-testid="overrun-release-card"]').text()).toContain('SO-099');
    await openMoreMenu(wrapper);
    expect(menuItems(wrapper)).toContain('Không kịp tới, nhả đơn');
    await wrapper.get('[data-testid="overrun-release-menu"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="overrun-release-dialog"]').text()).toContain('Không trừ điểm uy tín');
    await wrapper.get('[data-testid="overrun-release-confirm"]').trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-test-101/overrun-release');
    expect(mockPost.mock.calls.some(([path]) => String(path).endsWith('/cancel'))).toBe(false);
    wrapper.unmount();
  });

  it('opens a pre-repair choice and closing it leaves the accepted order unchanged', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Bắt đầu di chuyển'))!.trigger('click');

    const dialog = wrapper.get('[data-testid="departure-pre-repair-dialog"]');
    expect(dialog.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(dialog.text()).toContain('Đặt linh kiện trước?');
    await dialog.get('button[aria-label="Đóng"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Xuất phát đến nhà khách');
    expect(mockPost).not.toHaveBeenCalledWith('/service-orders/job-test-101/en-route', expect.anything());
    expect(wrapper.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('choosing no starts travel through the existing endpoint', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValue({ data: { data: {} } });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Bắt đầu di chuyển'))!.trigger('click');
    await wrapper.get('[data-testid="departure-pre-repair-dialog"]').findAll('button')
      .find((button) => button.text().includes('Không, bắt đầu di chuyển'))!.trigger('click');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-test-101/en-route');
    expect(wrapper.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the pre-repair form without creating a request or changing order status', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/part-requests') return { data: { data: [] } };
      return { data: { data: [] } };
    });
    const actualPartsStubs = { ...stubs, TechnicianPartsSection: false };
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs: actualPartsStubs } });
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Bắt đầu di chuyển'))!.trigger('click');
    await wrapper.get('[data-testid="departure-pre-repair-dialog"]').findAll('button')
      .find((button) => button.text().includes('Có, đặt linh kiện'))!.trigger('click');
    await flushPromises();

    expect(wrapper.get('#job-parts').text()).toContain('Chọn linh kiện FixHome');
    expect(wrapper.get('#job-parts').text()).toContain('Gửi yêu cầu tới Quản lý');
    expect(mockPost).not.toHaveBeenCalledWith('/service-orders/job-test-101/part-requests', expect.anything());
    expect(mockPost).not.toHaveBeenCalledWith('/service-orders/job-test-101/en-route', expect.anything());
    expect(wrapper.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not ask again and starts travel when a valid pre-repair request already exists', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/part-requests') return { data: { data: [{
        id: 'parts-1', serviceOrderId: 'job-test-101', technicianId: 'tech-1', requestType: 'pre_repair',
        fulfillmentMethod: 'pickup', status: 'received', shippingFee: 0, createdAt: '2026-10-20T00:00:00Z', items: [],
      }] } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValue({ data: { data: {} } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Bắt đầu di chuyển'))!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(false);
    expect(mockGet).toHaveBeenCalledWith('/service-orders/job-test-101/part-requests');
    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-test-101/en-route');
    expect(mockPost).not.toHaveBeenCalledWith('/service-orders/job-test-101/part-requests', expect.anything());
    wrapper.unmount();
  });

  it('checks whether an existing parts request was cancelled before deciding to prompt', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/part-requests') return { data: { data: [{
        id: 'parts-cancel', requestType: 'pre_repair', status: 'cancelled', items: [],
      }] } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Bắt đầu di chuyển'))!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="departure-pre-repair-dialog"]').exists()).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('updates Hero Action Bar to GPS Check-in when status is EN_ROUTE and not yet checked in', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: false } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Đang đến nhà khách');
    // Check-in now opens the face camera (PO 11/10/2026): one "Check-in" button, no gallery picker.
    const checkIn = wrapper.get('[data-testid="job-now"]').findAll('button').filter((b) => b.text().trim() === 'Check-in');
    expect(checkIn).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Check-in và chụp ảnh sản phẩm');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('offers "Cần thay đổi thợ" only after check-in and sends it to the manager', async () => {
    let arrived = false;
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: arrived } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    const before = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    await openMoreMenu(before);
    expect(menuItems(before)).not.toContain('Cần thay đổi thợ');
    expect(before.find('[data-testid="replacement-card"]').exists()).toBe(false);
    before.unmount();

    arrived = true;
    mockPost.mockResolvedValue({ data: { success: true, statusCode: 201, message: 'Created', data: {
      id: 'case-1', caseType: 'technician_replacement', status: 'open', bookingId: null, serviceOrderId: 'job-test-101',
      reason: 'x', description: null, resolutionCode: null, resolutionReason: null, resolvedAt: null, isUrgent: true,
      respondBy: null, holdCompletion: false, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
    } } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="replacement-card"]').exists()).toBe(false);
    await openMoreMenu(wrapper);
    // After check-in the order can no longer be cancelled by the technician.
    expect(menuItems(wrapper)).not.toContain('Huỷ đơn');
    await wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('Cần thay đổi thợ'))!.trigger('click');
    const card = wrapper.get('[data-testid="replacement-card"]');
    await card.get('textarea').setValue('Máy là loại công nghiệp, ngoài kỹ năng');
    await card.findAll('button').find((b) => b.text().includes('Gửi cho quản lý'))!.trigger('click');
    await flushPromises();
    expect(mockPost).toHaveBeenCalledWith('/support/cases', expect.objectContaining({ caseType: 'technician_replacement', serviceOrderId: 'job-test-101', isUrgent: true }));
    expect(wrapper.text()).toContain('Đã báo quản lý dịch vụ');
    expect(wrapper.find('[data-testid="replacement-card"]').exists()).toBe(false);
    await openMoreMenu(wrapper);
    expect(menuItems(wrapper)).not.toContain('Cần thay đổi thợ');
    wrapper.unmount();
  });

  it('updates Hero Action Bar to BEFORE evidence photo gating after GPS check-in', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: true, beforeEvidenceCount: 0 } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') {
        return { data: { data: [{ id: 'face-1', type: 'checkin_face', mediaUrl: 'https://img.test/face.jpg' }] } };
      }
      return { data: { data: [] } };
    });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Chụp ảnh máy trước khi sửa');
    expect(wrapper.text()).toContain('Chụp ảnh máy');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('allows technician to open withdrawal modal and cancel order with reason', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      if (path === '/service-orders/job-test-101/evidence') return { data: { data: [] } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    // "Huỷ đơn" in the overflow menu opens the confirmation
    await openMoreMenu(wrapper);
    const withdrawBtn = wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('Huỷ đơn'));
    expect(withdrawBtn).toBeDefined();
    await withdrawBtn!.trigger('click');

    const dialog = wrapper.get('[data-testid="cancel-order-dialog"]');
    expect(dialog.text()).toContain('Huỷ đơn sửa chữa?');
    expect(dialog.text()).toContain('Giữ lại đơn');
    expect(dialog.text()).not.toContain('Rút');

    // Confirm the cancellation
    const confirmBtn = dialog.findAll('button').find((b) => b.text().includes('Huỷ đơn sửa chữa'));
    expect(confirmBtn).toBeDefined();
    await confirmBtn!.trigger('click');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith('/service-orders/job-test-101/cancel', expect.objectContaining({
      reason: expect.any(String),
    }));

    wrapper.unmount();
  });

  it('shows only the current step until "Xem thêm" lists all five, then folds back', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') {
        return { data: { data: { ...activeOrder, status: 'EN_ROUTE', arrivalVerified: false } } };
      }
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="job-steps"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Bước 2/5');
    const toggle = wrapper.get('[data-testid="steps-toggle"]');
    expect(toggle.text()).toContain('Xem thêm');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    const list = wrapper.get('[data-testid="job-steps"]');
    expect(list.findAll('li')).toHaveLength(5);
    expect(list.text()).toContain('Xuất phát');
    expect(list.text()).toContain('Thu tiền');
    expect(list.text()).toContain('Đang làm');
    expect(toggle.text()).toContain('Thu gọn');
    expect(toggle.attributes('aria-expanded')).toBe('true');

    await toggle.trigger('click');
    expect(wrapper.find('[data-testid="job-steps"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps one primary action: the same button in the card and in the phone action bar', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/service-orders/job-test-101') return { data: { data: activeOrder } };
      if (path === '/service-orders/job-test-101/cash-settlement') return { data: { data: null } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    const bar = wrapper.get('[data-testid="job-action-bar"]');
    expect(bar.classes()).toContain('sm:hidden');
    expect(bar.text()).toContain('Bắt đầu di chuyển');
    const inCard = wrapper.get('[data-testid="job-now"]').findAll('button').filter((b) => b.text().includes('Bắt đầu di chuyển'));
    expect(inCard).toHaveLength(1);
    expect(inCard[0].element.parentElement?.className).toContain('hidden sm:flex');
    // No long rule paragraphs on the page any more
    expect(wrapper.text()).not.toMatch(/Quy chuẩn/);
    wrapper.unmount();
  });

  it('asks how the customer pays after completion and declares the cash amount', async () => {
    const orderId = '33333333-3333-4333-8333-333333333333';
    mockRouteControl.current!.params.id = orderId;
    mockGet.mockImplementation(async (path: string) => {
      if (path === `/service-orders/${orderId}`) {
        return { data: { data: { ...activeOrder, id: orderId, status: 'UNDER_REPAIR', arrivalVerified: true, beforeEvidenceCount: 1, afterEvidenceCount: 1, completionRequestedAt: '2026-10-01T10:00:00Z' } } };
      }
      if (path === `/service-orders/${orderId}/cash-settlement`) return { data: { data: null } };
      if (path === `/finance/funded/solo/${orderId}/cash/reservation`) return { data: { success: true, data: {
        voucherReservationId: null, customerDueVnd: null,
      } } };
      return { data: { data: [] } };
    });
    mockPost.mockResolvedValueOnce({ data: { data: { status: 'pending_confirmation' } } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    const now = wrapper.get('[data-testid="job-now"]');
    expect(now.text()).toContain('Thu tiền');
    expect(wrapper.find('[data-testid="job-action-bar"]').exists()).toBe(false);
    await now.findAll('button').find((b) => b.text().includes('Có thu tiền mặt'))!.trigger('click');
    const declare = wrapper.get('[data-testid="job-now"]').findAll('button').find((b) => b.text().includes('Khai báo đã thu tiền mặt'));
    expect(declare).toBeDefined();
    await declare!.trigger('click');
    await flushPromises();

    expect(mockPost).toHaveBeenCalledWith(`/service-orders/${orderId}/cash-settlement/declare`, expect.objectContaining({ declaredAmount: 150000 }));
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Chờ khách xác nhận tiền mặt');
    wrapper.unmount();
  });

  it.each([
    ['SOLO', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
      `/finance/funded/solo/33333333-3333-4333-8333-333333333333/cash/reservation`,
      `/finance/funded/solo/33333333-3333-4333-8333-333333333333/cash/declare`],
    ['VISIT_GROUP', '33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555',
      `/finance/funded/visit-groups/55555555-5555-4555-8555-555555555555/cash/reservation`,
      `/finance/funded/visit-groups/55555555-5555-4555-8555-555555555555/cash/declare`],
  ] as const)('declares funded cash with the server due for %s', async (kind, orderId, groupId, reservationRoute, declareRoute) => {
    mockRouteControl.current!.params.id = orderId;
    let pendingCash: Record<string, unknown> | null = null;
    mockGet.mockImplementation(async (path: string) => {
      if (path === `/service-orders/${orderId}`) return { data: { data: {
        ...activeOrder, id: orderId, status: 'UNDER_REPAIR', visitGroupId: kind === 'VISIT_GROUP' ? groupId : undefined,
        arrivalVerified: true, beforeEvidenceCount: 1, afterEvidenceCount: 1, completionRequestedAt: '2026-10-01T10:00:00Z',
      } } };
      if (path === `/service-orders/${orderId}/cash-settlement`) return { data: { data: null } };
      if (kind === 'VISIT_GROUP' && path === `/visit-groups/${groupId}/checkout`) return { data: { data: {
        visitGroupId: groupId, total: 300000, waiting: 0, ready: true, paid: false, pendingCash, devices: [],
      } } };
      if (path === reservationRoute) return { data: { success: true, data: {
        voucherReservationId: '66666666-6666-4666-8666-666666666666', customerDueVnd: 125000,
      } } };
      return { data: { data: [] } };
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path === declareRoute && kind === 'VISIT_GROUP') {
        pendingCash = { id: '77777777-7777-4777-8777-777777777777', status: 'pending_confirmation', declaredAmount: 125000 };
      }
      return { data: { success: true, data: {
        id: '77777777-7777-4777-8777-777777777777', status: 'pending_confirmation', declaredAmount: 125000,
      } } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    const now = wrapper.get('[data-testid="job-now"]');
    if (kind === 'SOLO') {
      await now.findAll('button').find((button) => button.text().includes('Có thu tiền mặt'))!.trigger('click');
      await wrapper.get('[data-testid="job-now"]').findAll('button')
        .find((button) => button.text().includes('Khai báo đã thu tiền mặt'))!.trigger('click');
    } else {
      await now.findAll('button').find((button) => button.text().includes('Khai báo đã thu tiền mặt cả lượt'))!.trigger('click');
    }
    await flushPromises();

    expect(mockGet).toHaveBeenCalledWith(reservationRoute);
    expect(mockPost).toHaveBeenCalledWith(declareRoute, {
      declaredAmount: 125000, technicianNotes: '', voucherReservationId: '66666666-6666-4666-8666-666666666666',
    });
    expect(wrapper.get('[data-testid="job-now"]').text()).toContain('Chờ khách xác nhận tiền mặt');
    wrapper.unmount();
  });

  it.each([403, 409, 503])('fails closed when funded cash context returns %i', async (status) => {
    const orderId = '33333333-3333-4333-8333-333333333333';
    mockRouteControl.current!.params.id = orderId;
    mockGet.mockImplementation(async (path: string) => {
      if (path === `/service-orders/${orderId}`) return { data: { data: {
        ...activeOrder, id: orderId, status: 'UNDER_REPAIR', arrivalVerified: true,
        beforeEvidenceCount: 1, afterEvidenceCount: 1, completionRequestedAt: '2026-10-01T10:00:00Z',
      } } };
      if (path === `/service-orders/${orderId}/cash-settlement`) return { data: { data: null } };
      if (path === `/finance/funded/solo/${orderId}/cash/reservation`) throw { response: { status } };
      return { data: { data: [] } };
    });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    const now = wrapper.get('[data-testid="job-now"]');
    await now.findAll('button').find((button) => button.text().includes('Có thu tiền mặt'))!.trigger('click');
    await wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Khai báo đã thu tiền mặt'))!.trigger('click');
    await flushPromises();

    expect(mockPost).not.toHaveBeenCalledWith(expect.stringContaining('/cash-settlement/declare'), expect.anything());
    expect(mockPost).not.toHaveBeenCalledWith(expect.stringContaining('/finance/funded/'), expect.anything());
    expect(wrapper.text()).not.toContain('66666666-6666-4666-8666-666666666666');
    expect(wrapper.text()).not.toContain('Chờ khách xác nhận tiền mặt');
    wrapper.unmount();
  });

  it('does not fall back to gross after an uncertain funded declaration', async () => {
    const orderId = '33333333-3333-4333-8333-333333333333';
    const reservationId = '66666666-6666-4666-8666-666666666666';
    let lookupCount = 0;
    mockRouteControl.current!.params.id = orderId;
    mockGet.mockImplementation(async (path: string) => {
      if (path === `/service-orders/${orderId}`) return { data: { data: {
        ...activeOrder, id: orderId, status: 'UNDER_REPAIR', arrivalVerified: true,
        beforeEvidenceCount: 1, afterEvidenceCount: 1, completionRequestedAt: '2026-10-01T10:00:00Z',
      } } };
      if (path === `/service-orders/${orderId}/cash-settlement`) return { data: { data: null } };
      if (path === `/finance/funded/solo/${orderId}/cash/reservation`) {
        lookupCount += 1;
        if (lookupCount > 1) return { data: { success: true, data: {
          voucherReservationId: null, customerDueVnd: null,
        } } };
        return { data: { success: true, data: { voucherReservationId: reservationId, customerDueVnd: 125000 } } };
      }
      return { data: { data: [] } };
    });
    mockPost.mockRejectedValueOnce({ response: { status: 503 } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();
    const selectCash = () => wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Có thu tiền mặt'))!.trigger('click');
    const declare = () => wrapper.get('[data-testid="job-now"]').findAll('button')
      .find((button) => button.text().includes('Khai báo đã thu tiền mặt'))!.trigger('click');
    await selectCash();
    await declare();
    await flushPromises();
    await declare();
    await flushPromises();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(`/finance/funded/solo/${orderId}/cash/declare`, {
      declaredAmount: 125000, technicianNotes: '', voucherReservationId: reservationId,
    });
    expect(wrapper.text()).toContain('Chưa xác định được lần khai báo trước');
    wrapper.unmount();
  });

  it('shows a friendly retry when the job cannot be loaded, never a raw error', async () => {
    mockGet.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'QueryFailedError: relation does not exist' } } } });
    const wrapper = mount(TechnicianJobDetailPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa tải được công việc. Vui lòng thử lại.');
    expect(wrapper.text()).not.toMatch(/INTERNAL_ERROR|QueryFailedError|500/);
    expect(wrapper.findAll('button').some((b) => b.text().includes('Thử lại'))).toBe(true);
    wrapper.unmount();
  });

  it('renders Google Maps navigation and direct phone button on TechnicianJobsPage', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [activeOrder] } });

    const wrapper = mount(TechnicianJobsPage, { global: { stubs } });
    await flushPromises();

    const mapLink = wrapper.find('a[href*="google.com/maps"]');
    expect(mapLink.exists()).toBe(true);
    expect(mapLink.attributes('href')).toContain('10.7769,106.7009');

    const phoneLink = wrapper.find('a[href^="tel:"]');
    expect(phoneLink.exists()).toBe(true);
    expect(phoneLink.attributes('href')).toBe('tel:0901234567');

    wrapper.unmount();
  });
});
