import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';

enableAutoUnmount(afterEach);
const route = reactive({ params: { id: 'o1' }, query: {} });
const { http, visits, listeners } = vi.hoisted(() => ({
  http: { get: vi.fn(), post: vi.fn() },
  visits: { get: vi.fn(), checkout: vi.fn() },
  listeners: new Map<string, () => void>(),
}));
vi.mock('../src/api/client', () => ({ default: http }));
vi.mock('../src/api/visit-groups.api', () => ({ visitGroupsApi: visits }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({}) }));
vi.mock('../src/services/chat-socket.service', () => ({ chatSocketService: { subscribe: () => () => undefined } }));
vi.mock('../src/services/live-updates', () => ({
  LIVE_DEBOUNCE_MS: 150,
  onOrderChange: (id: string, callback: () => void) => { listeners.set(id, callback); return () => listeners.delete(id); },
  onBookingChange: () => () => undefined, onResync: () => () => undefined,
  onOrderLocation: () => () => undefined, whileOffline: () => () => undefined,
  afterRunningRead: async () => undefined,
}));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
import OrderPage from '../src/pages/customer/CustomerOrderDetailPage.vue';
import VisitPage from '../src/pages/customer/CustomerVisitPage.vue';

const envelope = (data: unknown) => ({ data: { data } });
const quote = (id: string, status = 'sent') => ({ id: `q-${id}`, status, items: [{ type: 'labor', description: 'Công sửa', quantity: 1, unitPrice: 100000, lineTotal: 100000 }], laborTotal: 100000, partsTotal: 0 });
const order = (id: string, status = 'sent') => ({
  id, code: `FH-${id}`, bookingId: `b-${id}`, visitGroupId: 'v1', status: 'en_route',
  paymentStatus: 'unpaid', laborTotal: 100000, partsTotal: 0, grandTotal: 100000,
  quotation: quote(id, status), timeline: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe.each(['solo', 'visit'] as const)('%s quotation approval', kind => {
  let states: Record<string, ReturnType<typeof order>>;
  let read: ((id: string) => Promise<unknown>) | undefined;
  const approveSelector = kind === 'visit' ? '[data-testid="visit-quote-approve"]' : '[data-testid="order-costs"] button:last-child';
  const checkSelector = '[data-testid="quotation-check-status"]';
  async function open() {
    route.params.id = kind === 'visit' ? 'v1' : 'o1';
    const wrapper = mount(kind === 'visit' ? VisitPage : OrderPage, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true, 'router-link': true, CustomerStopReplaceRequest: true, CustomerCancelledRebookAction: true, MapTilerMap: true, BookingMediaViewer: true,
        OrderComplaintPanel: true, WarrantyClaimCard: true, WarrantyClaimModal: true,
        RebookDialog: true, FailedRepairIncident: true, VoucherCheckoutChooser: true } },
    });
    await flushPromises();
    if (kind === 'visit') await wrapper.get('[data-testid="visit-device-select-2"]').trigger('click');
    return wrapper;
  }
  const targetId = kind === 'visit' ? 'o2' : 'o1';
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    states = { o1: order('o1'), o2: order('o2'), o3: order('o3') };
    read = undefined;
    http.get.mockImplementation(async (url: string) => {
      const match = /^\/service-orders\/(o\d)$/.exec(url);
      if (match) return read ? read(match[1]) : envelope(structuredClone(states[match[1]]));
      return envelope([]);
    });
    http.post.mockImplementation(async () => { states[targetId].quotation.status = 'approved'; return envelope(quote(targetId, 'approved')); });
    visits.get.mockResolvedValue({ id: 'v1', status: 'accepted', leadBookingId: 'b-o1', items: [1, 2, 3].map(n => ({
      id: `i${n}`, sequence: n, serviceId: 's', booking: { id: `b-o${n}`, status: 'MATCHED', serviceName: `Máy ${n}` },
    })) });
    visits.checkout.mockResolvedValue({ visitGroupId: 'v1', total: 0, waiting: 3, ready: false, paid: false,
      devices: [1, 2, 3].map(n => ({ bookingId: `b-o${n}`, serviceOrderId: `o${n}`, state: 'open' })),
    });
  });

  it('sends one APPROVE POST for rapid clicks and stays busy through the confirming GET', async () => {
    const w = await open();
    const post = deferred<ReturnType<typeof envelope>>();
    http.post.mockReturnValue(post.promise);
    const button = w.get(approveSelector);
    // Dispatch twice in one tick: disabled rendering must not be the only lock.
    (button.element as HTMLButtonElement).click();
    (button.element as HTMLButtonElement).click();
    await flushPromises();
    expect(http.post.mock.calls).toEqual([[`/quotations/q-${targetId}/decision`, { action: 'APPROVE' }]]);
    expect(button.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Đang duyệt báo giá');
    const get = deferred<ReturnType<typeof envelope>>();
    read = async id => id === targetId ? get.promise : envelope(states[id]);
    post.resolve(envelope(quote(targetId, 'approved')));
    await flushPromises();
    expect(w.text()).not.toContain('Đã duyệt báo giá');
    expect(w.get(approveSelector).attributes('disabled')).toBeDefined();
    if (kind === 'visit') {
      expect(w.get('[data-testid="visit-device-panel-2"]').exists()).toBe(true);
      expect(w.get('[data-testid="visit-device-quotation-status-2"]').exists()).toBe(true);
    }
    get.resolve(envelope(order(targetId, 'approved')));
    await flushPromises();
    expect(w.text()).toContain('Đã duyệt báo giá');
    expect(w.find(approveSelector).exists()).toBe(false);
  });

  it('keeps a solo detail and focused control mounted during a socket refresh', async () => {
    if (kind !== 'solo') return;
    const refresh = deferred<ReturnType<typeof envelope>>();
    const w = await open();
    const approve = w.get(approveSelector);
    approve.element.focus();
    read = async id => id === targetId ? refresh.promise : envelope(structuredClone(states[id]));
    (listeners.get(targetId) as unknown as (event: { kinds: string[] }) => void)({ kinds: ['status'] });
    await flushPromises();
    expect(w.find('[aria-label="Đang tải đơn"]').exists()).toBe(false);
    expect(w.text()).toContain('FH-o1');
    expect(document.activeElement).toBe(approve.element);
    refresh.resolve(envelope(structuredClone(states[targetId])));
    await flushPromises();
    expect(w.find('[aria-label="Đang tải đơn"]').exists()).toBe(false);
    expect(document.activeElement).toBe(approve.element);
    w.unmount();
  });

  it('keeps keyboard focus at the quotation result after its approval button disappears', async () => {
    const w = await open();
    (w.get(approveSelector).element as HTMLButtonElement).focus();
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(document.activeElement?.textContent).toBe(kind === 'visit' ? 'Đã duyệt báo giá của máy này.' : 'Đã duyệt báo giá.');
  });

  it('keeps a successful POST with a stale SENT GET uncertain until a read-only check confirms', async () => {
    const w = await open();
    http.post.mockResolvedValue(envelope(quote(targetId, 'approved')));
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Chưa xác nhận được kết quả');
    expect(w.get(approveSelector).attributes('disabled')).toBeDefined();
    states[targetId].quotation.status = 'approved';
    await w.get(checkSelector).trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('Đã duyệt báo giá');
  });

  it.each([400, 401, 403, 409, 500, 503])('shows HTTP %i errors and reads final state without another POST', async status => {
    const w = await open();
    http.post.mockRejectedValue({ response: { status, data: { message: 'Bạn chưa thể duyệt báo giá này.' } } });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Bạn chưa thể duyệt báo giá này.');
    expect(w.text()).not.toContain('Đã duyệt báo giá');
    expect(http.get.mock.calls.filter(([url]) => url === `/service-orders/${targetId}`).length).toBeGreaterThan(1);
    expect(http.post).toHaveBeenCalledTimes(1);
    if (status === 409 || status >= 500) expect(w.get(approveSelector).attributes('disabled')).toBeDefined();
  });

  it('recovers a lost POST response from the matching approved GET', async () => {
    const w = await open();
    http.post.mockImplementation(async () => {
      states[targetId].quotation.status = 'approved';
      throw new Error('Network Error');
    });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Đã duyệt báo giá');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('does not treat a newer approved quotation as confirmation of the submitted version', async () => {
    const w = await open();
    http.post.mockImplementation(async () => {
      states[targetId].quotation = { ...quote(targetId, 'approved'), id: 'q-new-version' };
      return envelope(quote(targetId, 'approved'));
    });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Báo giá đã thay đổi');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('keeps an unreadable final GET uncertain and locked', async () => {
    const w = await open();
    http.post.mockImplementation(async () => {
      read = async () => { throw new Error('Network Error'); };
      return envelope(quote(targetId, 'approved'));
    });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Chưa xác nhận được kết quả');
    expect(w.find(checkSelector).exists()).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('requires a read-only check before explicitly retrying a timed-out unconfirmed approval', async () => {
    const w = await open();
    http.post.mockRejectedValue({ code: 'ECONNABORTED' });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(w.get(approveSelector).attributes('disabled')).toBeDefined();
    await w.get(checkSelector).trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(w.get(approveSelector).attributes('disabled')).toBeUndefined();
    http.post.mockImplementation(async () => {
      states[targetId].quotation.status = 'approved';
      return envelope(quote(targetId, 'approved'));
    });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(w.text()).toContain('Đã duyệt báo giá');
  });

  it('does not confirm using a read started before the POST finished', async () => {
    const w = await open();
    const post = deferred<ReturnType<typeof envelope>>();
    const stale = deferred<ReturnType<typeof envelope>>();
    http.post.mockReturnValue(post.promise);
    await w.get(approveSelector).trigger('click');
    let staleStarted = false;
    read = async id => {
      if (id === targetId && !staleStarted) { staleStarted = true; return stale.promise; }
      return envelope(structuredClone(states[id]));
    };
    (listeners.get(targetId) as unknown as (event: { kinds: string[] }) => void)({ kinds: ['quotation'] });
    await vi.waitFor(() => expect(staleStarted).toBe(true));
    states[targetId].quotation.status = 'approved';
    post.resolve(envelope(quote(targetId, 'approved')));
    await flushPromises();
    expect(w.get(approveSelector).attributes('disabled')).toBeDefined();
    stale.resolve(envelope(order(targetId)));
    await flushPromises();
    expect(w.text()).toContain('Đã duyệt báo giá');
    expect(w.find(approveSelector).exists()).toBe(false);
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('does not offer approval after an unauthorized initial read', async () => {
    read = async () => { throw { response: { status: 403 } }; };
    const w = await open();
    expect(w.find(approveSelector).exists()).toBe(false);
    expect(http.post).not.toHaveBeenCalled();
  });

  if (kind === 'visit') it.each([1, 2, 3])('approves only machine %i with one click', async n => {
    const w = await open();
    await w.get(`[data-testid="visit-device-select-${n}"]`).trigger('click');
    http.post.mockImplementation(async () => {
      states[`o${n}`].quotation.status = 'approved';
      return envelope(quote(`o${n}`, 'approved'));
    });
    await w.get(approveSelector).trigger('click');
    await flushPromises();
    expect(http.post.mock.calls).toEqual([[`/quotations/q-o${n}/decision`, { action: 'APPROVE' }]]);
    expect(w.get(`[data-testid="visit-device-panel-${n}"]`).text()).toContain('Đã duyệt báo giá');
    for (const sibling of [1, 2, 3].filter(index => index !== n)) expect(states[`o${sibling}`].quotation.status).toBe('sent');
  });

  if (kind === 'visit') it('keeps a late old-visit POST out of the newly selected visit', async () => {
    const w = await open();
    const post = deferred<ReturnType<typeof envelope>>();
    http.post.mockReturnValue(post.promise);
    await w.get(approveSelector).trigger('click');
    visits.get.mockResolvedValue({ id: 'v2', status: 'submitted', items: [] });
    visits.checkout.mockResolvedValue({ visitGroupId: 'v2', total: 0, waiting: 0, ready: false, paid: false, devices: [] });
    route.params.id = 'v2';
    await flushPromises();
    post.resolve(envelope(quote('o2', 'approved')));
    await flushPromises();
    expect(w.text()).not.toContain('Đã duyệt báo giá');
    expect(w.find('[data-testid="visit-inline-details"]').exists()).toBe(false);
    expect(visits.get.mock.calls.map(([id]) => id)).toEqual(['v1', 'v2']);
  });

  if (kind === 'visit') it('keeps machine2 submission scoped while switching to machine3', async () => {
    const w = await open();
    const post = deferred<ReturnType<typeof envelope>>();
    http.post.mockReturnValue(post.promise);
    await w.get(approveSelector).trigger('click');
    await w.get('[data-testid="visit-device-select-3"]').trigger('click');
    expect(w.text()).not.toContain('Đang duyệt báo giá');
    states.o2.quotation.status = 'approved';
    post.resolve(envelope(quote('o2', 'approved')));
    await flushPromises();
    expect(w.get('[data-testid="visit-device-panel-3"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Đã duyệt báo giá');
    expect(w.get(approveSelector).attributes('disabled')).toBeUndefined();
    await w.get('[data-testid="visit-device-select-2"]').trigger('click');
    expect(w.text()).toContain('Đã duyệt báo giá');
    expect(states.o1.quotation.status).toBe('sent');
    expect(states.o3.quotation.status).toBe('sent');
  });
});
