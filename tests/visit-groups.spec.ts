import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());
const routeState = reactive({ params: { id: 'v1' } });

// Several devices in one visit (PO 21/10/2026): one technician, one payment.
const { client, visitApi, orders, wallet, funded, push, orderListeners, bookingListeners, resyncListeners, socketHandlers } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn() },
  visitApi: {
    get: vi.fn(), checkout: vi.fn(), payWithWallet: vi.fn(), vnpayUrl: vi.fn(), confirmCash: vi.fn(),
    cancel: vi.fn(), reschedule: vi.fn(), availableSessions: vi.fn(),
  },
  orders: { getOrder: vi.fn(), getAdditionalCosts: vi.fn(), getInvoice: vi.fn(), getEvidence: vi.fn(), approveQuotation: vi.fn(), rejectQuotation: vi.fn(), decideAdditionalCost: vi.fn() },
  wallet: { summary: vi.fn() },
  funded: { wallet: vi.fn(), vnpay: vi.fn(), zero: vi.fn(), confirmCash: vi.fn() },
  push: vi.fn(),
  orderListeners: new Map<string, () => void>(),
  bookingListeners: new Map<string, () => void>(),
  resyncListeners: new Set<() => void>(),
  socketHandlers: new Set<import('../src/services/chat-socket.service').ChatSocketHandlers>(),
}));

describe('visit-groups api', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../src/api/client', () => ({ default: client }));
    client.get.mockReset();
    client.post.mockReset();
  });

  it('sends the devices with the urgency the server knows and reads the visit back', async () => {
    const { visitGroupsApi } = await import('../src/api/visit-groups.api');
    client.post.mockResolvedValue({ data: { data: { id: 'v1', status: 'submitted', items: [{ id: 'i1', sequence: 1, serviceId: 's', deviceLabel: null, booking: { id: 'b1', status: 'submitted', serviceNameSnapshot: 'Máy lạnh' } }] } } });
    const visit = await visitGroupsApi.create({ addressId: 'a', mode: 'scheduled', date: '2030-01-01', slot: 'morning', urgency: 'NORMAL', idempotencyKey: 'visit-key-123', items: [{ serviceId: 's' }] });
    expect(client.post).toHaveBeenCalledWith('/visit-groups', expect.objectContaining({ urgency: 'medium', idempotencyKey: 'visit-key-123', items: [{ serviceId: 's' }] }));
    expect(visit.items[0].booking).toMatchObject({ status: 'SUBMITTED', serviceName: 'Máy lạnh' });
  });

  it('reads customer and assigned visit pages with server totals and filters', async () => {
    const { visitGroupsApi } = await import('../src/api/visit-groups.api');
    const group = {
      id: 'v2', status: 'accepted', createdAt: '2026-10-22T08:00:00Z', bookingMode: 'scheduled', slot: null,
      scheduledAt: '2026-10-23T02:00:00Z', scheduledEndAt: '2026-10-23T06:00:00Z',
      items: [{ itemId: 'i2', sequence: 1, bookingId: 'b2', serviceId: 's2', deviceLabel: 'Phòng khách', outcome: null, bookingStatus: 'accepted', serviceName: 'Sửa máy lạnh', orderId: 'o2', orderCode: 'FH-2', orderStatus: 'accepted' }],
    };
    client.get
      .mockResolvedValueOnce({ data: { data: [group], meta: { total: 21, page: 2, pageSize: 10 } } })
      .mockResolvedValueOnce({ data: { data: [group], meta: { total: 7, page: 1, pageSize: 20 } } });

    const customerPage = await visitGroupsApi.minePage(2, 10, { q: 'máy lạnh' });
    expect(client.get).toHaveBeenNthCalledWith(1, '/visit-groups/my-page', {
      params: { page: 2, pageSize: 10, q: 'máy lạnh' },
    });
    expect(customerPage).toMatchObject({ items: [group], total: 21, page: 2, pageSize: 10 });

    const assignedPage = await visitGroupsApi.assignedPage(1, 20);
    expect(client.get).toHaveBeenNthCalledWith(2, '/visit-groups/assigned-page', {
      params: { page: 1, pageSize: 20 },
    });
    expect(assignedPage).toMatchObject({ items: [group], total: 7, page: 1, pageSize: 20 });
  });

  it('treats the feature as off unless the server says it is on', async () => {
    const { visitGroupsApi } = await import('../src/api/visit-groups.api');
    client.get.mockResolvedValue({ data: { data: {} } });
    expect(await visitGroupsApi.contact()).toEqual({ enabled: false, deviceLimit: 3, hotline: null });
  });

  it('keeps an unconfigured hotline empty and sends consultation only when requested', async () => {
    const { visitGroupsApi } = await import('../src/api/visit-groups.api');
    client.get.mockResolvedValue({ data: { data: { enabled: true, deviceLimit: 3, hotline: null } } });
    client.post.mockResolvedValue({ data: { data: {} } });

    await expect(visitGroupsApi.contact()).resolves.toEqual({ enabled: true, deviceLimit: 3, hotline: null });
    await visitGroupsApi.consultation({ message: 'Tôi cần hỏi về thiết bị thứ tư.', devices: ['Máy lạnh'] });

    expect(client.post).toHaveBeenCalledWith('/visit-groups/consultation', {
      message: 'Tôi cần hỏi về thiết bị thứ tư.',
      devices: ['Máy lạnh'],
    });
  });

  it('reports "không sửa được" with the reason and each part received', async () => {
    const { reportRepairFailed } = await import('../src/api/visit-groups.api');
    client.post.mockResolvedValue({ data: { data: {} } });
    await reportRepairFailed('o1', { reason: 'no_part', parts: [{ partRequestId: 'p1', outcome: 'returned' }] });
    expect(client.post).toHaveBeenCalledWith('/service-orders/o1/repair-failed', { reason: 'no_part', parts: [{ partRequestId: 'p1', outcome: 'returned' }] });
  });
});

describe('customer visit page', () => {
  const visit = {
    id: 'v1', status: 'submitted', bookingMode: 'scheduled', slot: 'morning', preferredStartAt: '2030-01-01T01:00:00Z', preferredEndAt: '2030-01-01T05:00:00Z', leadBookingId: 'b1',
    items: [
      { id: 'i1', sequence: 1, serviceId: 's1', deviceLabel: null, booking: { id: 'b1', status: 'MATCHED', serviceName: 'Máy lạnh', description: 'Máy lạnh phòng khách chảy nước', media: [{ id: 'm1', url: null, isPrivate: true, legacyInsecure: false, mimeType: 'image/jpeg', sizeBytes: 12 }], rescheduleCount: 0 } },
      { id: 'i2', sequence: 2, serviceId: 's2', deviceLabel: 'Phòng khách', booking: { id: 'b2', status: 'CANCELLED', serviceName: 'Tủ lạnh', description: 'Tủ lạnh không lạnh', media: [{ id: 'm2', url: null, isPrivate: true, legacyInsecure: false, mimeType: 'image/jpeg', sizeBytes: 14 }], rescheduleCount: 0 } },
    ],
  };
  const device = (bookingId: string, extra: object) => ({ sequence: bookingId === 'b2' ? 2 : 1, deviceLabel: null, bookingId, serviceName: null, serviceOrderId: `o-${bookingId}`, orderCode: 'FH', invoiceId: null, amount: 0, paid: false, ...extra });
  const checkout = (extra: object = {}) => ({
    visitGroupId: 'v1', total: 250000, waiting: 0, ready: true, paid: false, pendingCash: null,
    devices: [device('b1', { state: 'succeeded', amount: 250000, invoiceId: 'inv1' }), device('b2', { state: 'failed' })],
    ...extra,
  });

  async function mountPage() {
    vi.resetModules();
    vi.doMock('../src/api/visit-groups.api', () => ({ visitGroupsApi: visitApi }));
    vi.doMock('../src/api/orders.api', () => ({ ordersApi: orders }));
    vi.doMock('../src/api/customer-wallet.api', () => ({ customerWalletApi: wallet }));
    vi.doMock('../src/api/funded-checkout.api', () => ({ fundedCheckoutApi: funded }));
    vi.doMock('../src/services/live-updates', () => ({
      LIVE_DEBOUNCE_MS: 150,
      onBookingChange: (bookingId: string, callback: () => void) => {
        bookingListeners.set(bookingId, callback);
        return () => bookingListeners.delete(bookingId);
      },
      onOrderChange: (orderId: string, callback: () => void) => {
        orderListeners.set(orderId, callback);
        return () => orderListeners.delete(orderId);
      },
      onResync: (callback: () => void) => { resyncListeners.add(callback); return () => resyncListeners.delete(callback); },
      whileOffline: () => () => undefined,
    }));
    vi.doMock('../src/services/chat-socket.service', () => ({ chatSocketService: { subscribe: (handler: import('../src/services/chat-socket.service').ChatSocketHandlers) => { socketHandlers.add(handler); return () => socketHandlers.delete(handler); } } }));
    vi.doMock('vue-router', () => ({ useRoute: () => routeState, useRouter: () => ({ push }) }));
    const page = (await import('../src/pages/customer/CustomerVisitPage.vue')).default;
    const w = mount(page, { global: { stubs: { CustomerStopReplaceRequest: true, CustomerCancelledRebookAction: true, FhSkeleton: true, FhBackLink: true, FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' }, FhCostBreakdown: { props: ['laborTotal', 'partsTotal', 'grandTotal'], template: '<div data-testid="visit-cost-breakdown" :data-labor="laborTotal" :data-parts="partsTotal" :data-total="grandTotal" />' }, FhButton: { template: '<button v-bind="$attrs"><slot /></button>' }, BookingSessionPicker: true, BookingMediaViewer: { props: ['bookingId', 'media', 'embedded'], template: '<div data-testid="visit-booking-media" :data-booking-id="bookingId" :data-media-count="media.length" />' }, VoucherCheckoutChooser: { props: ['scopeId', 'scopeKind'], emits: ['applied'], template: '<div data-testid="visit-voucher-picker" :data-scope-id="scopeId"><button data-testid="apply-test-voucher" @click="$emit(\'applied\', voucher)">Apply</button><button data-testid="apply-cash-test-voucher" @click="applyCashVoucher">Apply cash voucher</button></div>', data: () => ({ voucher: { reservation: { id: 'reservation-1', claimId: 'claim-1', scopeId: 'v1', attemptId: 'attempt-1', state: 'RESERVED', reservedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:15:00.000Z' }, preview: { scopeId: 'v1', claimId: 'claim-1', previewOnly: true, paymentAvailable: true, reason: 'server-ready', originalGrossVnd: 250000, eligibleBaseVnd: 250000, fixHomeDiscountSubsidyVnd: 250000, customerDueVnd: 0, reasonCodes: ['DISCOUNT_APPLIED'] } } }), methods: { applyCashVoucher() { this.$emit('applied', { ...this.voucher, preview: { ...this.voucher.preview, customerDueVnd: 125000 } }); } } }, 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
    await flushPromises();
    return w;
  }

  beforeEach(() => {
    Object.values(visitApi).forEach((fn) => fn.mockReset());
    Object.values(funded).forEach((fn) => fn.mockReset());
    routeState.params.id = 'v1';
    orderListeners.clear();
    bookingListeners.clear();
    resyncListeners.clear();
    socketHandlers.clear();
    orders.getOrder.mockReset().mockRejectedValue(new Error('Order detail unavailable'));
    orders.getAdditionalCosts.mockReset().mockResolvedValue([]);
    orders.getInvoice.mockReset().mockResolvedValue(null);
    orders.getEvidence.mockReset().mockResolvedValue([]);
    orders.approveQuotation.mockReset().mockResolvedValue({});
    orders.rejectQuotation.mockReset().mockResolvedValue({});
    orders.decideAdditionalCost.mockReset().mockResolvedValue({});
    push.mockClear();
    wallet.summary.mockResolvedValue({ balance: 1000000 });
    visitApi.get.mockResolvedValue(visit);
  });

  it('shows a single machine selector and only the selected machine panel', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    const selector = w.get('[data-testid="visit-device-selector"]');
    expect(selector.findAll('[data-testid^="visit-device-select-"]')).toHaveLength(2);
    expect(w.get('[data-testid="visit-device-select-1"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="visit-device-panel-1"]').attributes('aria-labelledby')).toBe('visit-device-select-1');
    expect(w.find('[data-testid="visit-device-order-link"]').exists()).toBe(false); // All normal device actions remain on the visit page.
    expect(w.get('[data-testid="visit-device-select-1"]').attributes('id')).toBe('visit-device-select-1');
    expect(w.get('[data-testid="visit-device-panel-1"]').text()).toContain('Đã sửa xong');
    expect(w.get('[data-testid="visit-device-panel-1"]').text()).toContain('Máy lạnh');
    expect(w.find('[data-testid="visit-device-panel-2"]').exists()).toBe(false);
    expect(w.get('[data-testid="visit-outcome-progress"]').text()).toBe('Kết quả 2/2 thiết bị');
    expect(w.get('[data-testid="visit-device-description-1"]').text()).toBe('Máy lạnh phòng khách chảy nước');
    expect(w.get('[data-testid="visit-device-media-count-1"]').text()).toContain('1');
    expect(w.findAll('[data-testid="visit-booking-media"]').map((media) => media.attributes('data-booking-id'))).toEqual([]);

    const firstDisclosure = w.get('[data-testid="visit-device-expand-1"]');
    expect(firstDisclosure.attributes('aria-expanded')).toBe('false');
    await firstDisclosure.trigger('click');
    expect(firstDisclosure.attributes('aria-expanded')).toBe('true');
    expect(firstDisclosure.attributes('aria-controls')).toBe('visit-device-details-1');
    expect(w.findAll('[data-testid="visit-booking-media"]').map((media) => media.attributes('data-booking-id'))).toEqual(['b1']);

    await w.get('[data-testid="visit-device-select-2"]').trigger('click');
    expect(w.get('[data-testid="visit-device-select-2"]').attributes('aria-pressed')).toBe('true');
    expect(w.find('[data-testid="visit-device-panel-1"]').exists()).toBe(false);
    expect(w.get('[data-testid="visit-device-panel-2"]').text()).toContain('Không sửa được, không tính tiền sửa');
    expect(w.get('[data-testid="visit-device-panel-2"]').text()).toContain('Tủ lạnh');
    expect(w.get('[data-testid="visit-device-description-2"]').text()).toBe('Tủ lạnh không lạnh');
    expect(w.get('[data-testid="visit-device-media-count-2"]').text()).toContain('1');
    await w.get('[data-testid="visit-device-expand-2"]').trigger('click');
    expect(w.findAll('[data-testid="visit-booking-media"]').map((media) => media.attributes('data-booking-id'))).toEqual(['b2']);
    expect(w.findAll('[data-testid="visit-booking-media"]').map((media) => media.attributes('data-media-count'))).toEqual(['1']);
    expect(w.get('[data-testid="visit-invoice-unpaid"]').text()).toBe('250000');
    expect(w.get('[data-testid="visit-checkout"]').find('[data-testid="visit-voucher-picker"]').exists()).toBe(true);
    expect(w.get('[data-testid="visit-voucher-picker"]').attributes('data-scope-id')).toBe('v1');
  });

  it('offers rebooking only for failed B in A succeeded / B failed / C succeeded, without a POST', async () => {
    visitApi.get.mockResolvedValue({ ...visit, items: [...visit.items, { ...visit.items[0], id: 'i3', sequence: 3, booking: { ...visit.items[0]!.booking, id: 'b3', serviceName: 'Máy C' } }] });
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'succeeded' }), device('b2', { state: 'failed' }), device('b3', { state: 'succeeded' })] }));
    const w = await mountPage();
    expect(w.find('[data-testid="failed-repair-rebook"]').exists()).toBe(false);
    await w.get('[data-testid="visit-device-select-2"]').trigger('click');
    expect(w.findAll('[data-testid="failed-repair-rebook"]')).toHaveLength(1);
    expect(w.find('[data-testid="failed-repair-rebook-all"]').exists()).toBe(false);
    await w.get('[data-testid="failed-repair-rebook"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { repairFailure: 'b2' } });
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    const originalHistory = w.get('[data-testid="visit-device-selector"]').text();
    await w.findAll('button').find(button => button.text() === 'Để sau')!.trigger('click');
    expect(push).toHaveBeenLastCalledWith('/app');
    expect(w.get('[data-testid="visit-device-selector"]').text()).toBe(originalHistory);
    expect(visitApi.cancel).not.toHaveBeenCalled();
    await w.get('[data-testid="visit-device-select-3"]').trigger('click');
    expect(w.find('[data-testid="failed-repair-rebook"]').exists()).toBe(false);
  });

  it('offers one new group of only failed children when multiple devices failed', async () => {
    visitApi.get.mockResolvedValue({ ...visit, items: [...visit.items, { ...visit.items[0], id: 'i3', sequence: 3, booking: { ...visit.items[0]!.booking, id: 'b3' } }] });
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'failed' }), device('b2', { state: 'failed' }), device('b3', { state: 'succeeded' })] }));
    const w = await mountPage();
    await w.get('[data-testid="failed-repair-rebook-all"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { repairFailure: 'b1,b2' } });
  });

  it('shows a failed child outcome even if the parent visit is marked cancelled', async () => {
    visitApi.get.mockResolvedValue({ ...visit, status: 'cancelled' });
    visitApi.checkout.mockResolvedValue(checkout({
      devices: [device('b1', { state: 'failed' }), device('b2', { state: 'succeeded', amount: 0 })],
    }));
    const w = await mountPage();

    expect(w.get('[data-testid="visit-device-select-1"]').text()).toContain('Không sửa được');
    expect(w.get('[data-testid="visit-device-select-1"]').attributes('aria-label')).toContain('Không sửa được, không tính tiền sửa');
    await w.get('[data-testid="visit-device-select-1"]').trigger('click');
    expect(w.get('[data-testid="visit-device-panel-1"]').text()).toContain('Không sửa được, không tính tiền sửa');
    expect(w.get('[data-testid="visit-device-panel-1"]').text()).not.toContain('Đã huỷ');
  });

  it('expands a short description and its media before matching without linking to a phantom order', async () => {
    visitApi.get.mockResolvedValue({ ...visit, items: visit.items.map((item) => ({ ...item, booking: { ...item.booking, status: 'SUBMITTED', description: 'Máy kêu' } })) });
    visitApi.checkout.mockResolvedValue(checkout({ devices: [], ready: false }));
    const w = await mountPage();
    const toggle = w.get('[data-testid="visit-device-expand-1"]');
    expect(w.find('[data-testid="visit-device-order-link"]').exists()).toBe(false);
    expect(toggle.attributes('aria-controls')).toBe('visit-device-details-1');
    expect(w.find('#visit-device-details-1').exists()).toBe(true);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(w.get('[data-testid="visit-device-description-1"]').text()).toBe('Máy kêu');
    expect(w.findAll('[data-testid="visit-booking-media"]')).toHaveLength(1);
    await toggle.trigger('click');
    expect(w.findAll('[data-testid="visit-booking-media"]')).toHaveLength(0);
    expect(orders.getOrder).not.toHaveBeenCalled();
  });

  it('offers one child-specific quotation action only when that order has a sent quotation', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })] }));
    orders.getOrder
      .mockResolvedValueOnce({ id: 'o-b1', status: 'EN_ROUTE', quotation: { id: 'q1', status: 'sent' } })
      .mockResolvedValueOnce({ id: 'o-b2', status: 'EN_ROUTE', quotation: { id: 'q2', status: 'approved' } });

    const w = await mountPage();

    expect(orders.getOrder).toHaveBeenNthCalledWith(1, 'o-b1');
    expect(orders.getOrder).toHaveBeenNthCalledWith(2, 'o-b2');
    expect(w.findAll('[data-testid="visit-quotation-cta"]')).toHaveLength(1);
    expect(w.get('[data-testid="visit-quotation-cta"]').element.tagName).toBe('BUTTON');
    expect(w.get('[data-testid="visit-quotation-cta"]').attributes('href')).toBeUndefined();
    await w.get('[data-testid="visit-quotation-cta"]').trigger('click');
    expect(w.find('[data-testid="visit-inline-quotation"]').exists()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(w.get('[data-testid="visit-device-quotation-status-1"]').text()).toBe('Báo giá đang chờ bạn duyệt');
    expect(w.get('[data-testid="visit-device-select-1"]').attributes('aria-label')).toContain('Chờ bạn duyệt báo giá');
    expect(w.get('[data-testid="visit-device-select-1"]').text()).toContain('Chờ bạn duyệt báo giá');
    expect(w.find('[data-testid="visit-device-quotation-status-2"]').exists()).toBe(false);
  });

  it('shows one authorized shared technician and address for the whole visit', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder.mockImplementation(async (id) => ({ id, bookingId: id.slice(2), visitGroupId: 'v1', status: 'UNDER_REPAIR', addressSummary: 'Địa chỉ fixture', technician: { id: 'tech1', fullName: 'Thợ thử nghiệm', phoneNumber: '0900000000' } }));
    const w = await mountPage();
    expect(w.get('[data-testid="visit-shared-technician"]').text()).toContain('Thợ thử nghiệm');
    expect(w.findAll('a[href="tel:0900000000"]')).toHaveLength(1);
    expect(w.get('[data-testid="visit-shared-address"]').text()).toBe('Địa chỉ fixture');
    expect(w.get('header').text()).toContain('Một kỹ thuật viên');
    w.unmount();
  });

  it('states that one technician handles every device in the group', async () => {
    const items = [
      ...visit.items.map(item => ({ ...item, booking: { ...item.booking, status: 'SUBMITTED' } })),
      { ...visit.items[0]!, id: 'i3', sequence: 3, booking: { ...visit.items[0]!.booking, id: 'b3', status: 'SUBMITTED' } },
    ];
    visitApi.get.mockResolvedValue({ ...visit, items });
    visitApi.checkout.mockResolvedValue(checkout({ devices: [], ready: false }));
    const w = await mountPage();
    expect(w.get('header').text()).toContain('Một kỹ thuật viên phụ trách cả lượt');
    expect(w.get('[data-testid="visit-choose-technician"]').text()).toContain('Chọn 1 kỹ thuật viên sửa cả 3 thiết bị');
    await w.get('[data-testid="visit-choose-technician"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/app/visits/v1/candidates');
    w.unmount();
  });

  it.each([
    ['ACCEPTED', 'Đã nhận lượt sửa'],
    ['EN_ROUTE', 'Đang di chuyển'],
    ['UNDER_REPAIR', 'Đang sửa chữa'],
  ])('shows shared technician progress from server status %s', async (status, label) => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })] }));
    orders.getOrder.mockImplementation(async id => ({ id, bookingId: id.slice(2), visitGroupId: 'v1', status }));
    const w = await mountPage();
    expect(w.get('[data-testid="visit-shared-technician"]').text()).toContain(label);
    expect(w.get('[data-testid="visit-device-list"]').text()).toContain('Dịch vụ từng máy');
    w.unmount();
  });

  it('explains a matched visit without inventing a technician status before a child order exists', async () => {
    visitApi.get.mockResolvedValue({ ...visit, items: visit.items.map(item => ({ ...item, booking: { ...item.booking, status: 'MATCHED' } })) });
    visitApi.checkout.mockResolvedValue(checkout({ devices: [], ready: false }));
    const w = await mountPage();
    expect(w.get('[data-testid="visit-shared-technician"]').text()).toContain('Đã ghép kỹ thuật viên cho lượt');
    expect(w.get('[data-testid="visit-shared-technician"]').text()).not.toContain('Chưa có kỹ thuật viên nhận lượt');
    w.unmount();
  });

  it('shows fixed labor snapshot before invoice instead of a zero breakdown', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'failed' })] }));
    orders.getOrder.mockImplementation(async id => ({
      id, bookingId: id.slice(2), visitGroupId: 'v1', status: 'EN_ROUTE',
      pricingMode: 'FIXED_PRICE', fixedUnitPrice: 449000, laborTotal: 0, partsTotal: 0, grandTotal: 0,
    }));
    const w = await mountPage();
    const details = w.get('[data-testid="visit-inline-details"]');
    expect(details.get('[data-testid="visit-fixed-labor"]').text()).toContain('449000');
    expect(details.find('[data-testid="visit-cost-breakdown"]').exists()).toBe(false);
    expect(details.text()).toContain('chưa gồm linh kiện FixHome');
    expect(details.text()).toContain('bạn duyệt trước khi thực hiện');
    expect(push).not.toHaveBeenCalled();
  });

  it('says there is no estimate when a fixed labor snapshot is unavailable', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'failed' })] }));
    orders.getOrder.mockImplementation(async id => ({
      id, bookingId: id.slice(2), visitGroupId: 'v1', status: 'EN_ROUTE',
      pricingMode: 'FIXED_PRICE', fixedUnitPrice: null, laborTotal: 0, partsTotal: 0, grandTotal: 0,
    }));
    const w = await mountPage();
    const details = w.get('[data-testid="visit-inline-details"]');
    expect(details.text()).toContain('Chưa có tạm tính');
    expect(details.find('[data-testid="visit-cost-breakdown"]').exists()).toBe(false);
  });

  it('keeps survey labor unpriced until a server quote exists', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'failed' })] }));
    orders.getOrder.mockImplementation(async id => ({
      id, bookingId: id.slice(2), visitGroupId: 'v1', status: 'EN_ROUTE',
      pricingMode: 'INSPECTION_REQUIRED', fixedUnitPrice: null, laborTotal: 0, partsTotal: 0, grandTotal: 0,
    }));
    const w = await mountPage();
    const details = w.get('[data-testid="visit-inline-details"]');
    expect(details.text()).toContain('Chưa có tạm tính');
    expect(details.find('[data-testid="visit-cost-breakdown"]').exists()).toBe(false);
  });

  it('approves the base quote inline once, refreshes the parent and never navigates', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ ready: false, waiting: 2, devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })] }));
    const child = (id: string, status = 'EN_ROUTE') => ({ id, bookingId: id.slice(2), visitGroupId: 'v1', status, quotation: { id: `q-${id}`, status: 'SENT', laborTotal: 199000, partsTotal: 0, items: [{ type: 'LABOR', description: 'Công sửa riêng', quantity: 1, unitPrice: 199000, lineTotal: 199000 }] } });
    orders.getOrder.mockImplementation(async id => child(id));
    const w = await mountPage();
    expect(w.get('[data-testid="visit-inline-quotation"]').text()).toContain('Công sửa riêng');
    let finish!: () => void;
    orders.approveQuotation.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await w.get('[data-testid="visit-quote-approve"]').trigger('click');
    await w.get('[data-testid="visit-quote-approve"]').trigger('click');
    expect(orders.approveQuotation).toHaveBeenCalledTimes(1);
    expect(orders.approveQuotation).toHaveBeenCalledWith('q-o-b1');
    orders.getOrder.mockImplementation(async id => ({ ...child(id, 'UNDER_REPAIR'), quotation: { ...child(id).quotation, status: 'approved' } }));
    finish();
    await flushPromises();
    expect(w.find('[data-testid="visit-quote-approve"]').exists()).toBe(false);
    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
    w.unmount();
  });

  it('scopes repeated additional decisions to the selected child, with external consent', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })] }));
    orders.getOrder.mockImplementation(async id => ({ id, bookingId: id.slice(2), visitGroupId: 'v1', status: 'UNDER_REPAIR' }));
    const cost = (id: string, owner: string, source = 'fixhome') => ({ id, serviceOrderId: owner, status: 'PENDING_APPROVAL', reason: `Lý do ${id}`, totalLaborDelta: 0, totalPartsDelta: 50000, items: [{ id: `${id}-line`, type: 'PARTS_EQUIPMENT', description: `Linh kiện ${id}`, quantity: 1, unitPrice: 50000, lineTotal: 50000, partSource: source }] });
    let costs = [cost('extra1', 'o-b1'), cost('extra2', 'o-b1'), cost('extra3', 'o-b1', 'external')];
    orders.getAdditionalCosts.mockImplementation(async id => id === 'o-b1' ? [...costs, cost('foreign', 'o-foreign')] : [cost('sibling', 'o-b2')]);
    const w = await mountPage();
    expect(w.text()).not.toContain('Lý do foreign');
    expect(w.text()).not.toContain('Lý do sibling');
    expect(w.get('[data-testid="visit-device-select-2"]').text()).toContain('Chờ duyệt phát sinh');
    expect(w.get('[data-testid="visit-cost-approve-extra3"]').attributes('disabled')).toBeDefined();
    orders.decideAdditionalCost.mockImplementation(async (id, action) => { costs = costs.map(c => c.id === id ? { ...c, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : c); return costs.find(c => c.id === id); });
    await w.get('[data-testid="visit-cost-approve-extra1"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="visit-cost-reject-extra2"]').trigger('click');
    await flushPromises();
    await w.get('[data-testid="visit-external-consent-extra3"]').setValue(true);
    await w.get('[data-testid="visit-cost-approve-extra3"]').trigger('click');
    await flushPromises();
    expect(orders.decideAdditionalCost.mock.calls).toEqual([['extra1', 'APPROVE'], ['extra2', 'REJECT'], ['extra3', 'APPROVE']]);
    await w.get('[data-testid="visit-device-select-2"]').trigger('click');
    expect(w.text()).toContain('Lý do sibling');
    expect(w.text()).not.toContain('Lý do extra1');
    expect(w.findAll('[data-testid="visit-checkout"]')).toHaveLength(1);
    w.unmount();
  });

  it('resyncs pending cash on focus without accepting money and removes listeners on unmount', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { amount: 250000 } }));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(w.get('[data-testid="visit-cash-pending"]').text()).toContain('250000');
    expect(visitApi.confirmCash).not.toHaveBeenCalled();
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    w.unmount();
    const calls = visitApi.checkout.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(visitApi.checkout).toHaveBeenCalledTimes(calls);
  });

  it('ignores unrelated notifications and updates cash on an authorized group notification', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    const event = { id: 'n1', title: '', message: '', type: 'VISIT_CASH_DECLARED', referenceType: 'VISIT_GROUP', referenceId: 'other', isRead: false, createdAt: '' };
    for (const handler of socketHandlers) handler.onNotificationNew?.(event);
    await flushPromises();
    expect(visitApi.checkout).toHaveBeenCalledTimes(1);
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { amount: 250000 } }));
    for (const handler of socketHandlers) handler.onNotificationNew?.({ ...event, referenceId: 'v1' });
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(w.find('[data-testid="visit-cash-confirm"]').exists()).toBe(true);
    expect(visitApi.confirmCash).not.toHaveBeenCalled();
  });

  it('subscribes every child booking before orders exist and coalesces assignment updates', async () => {
    const third = { ...visit.items[0], id: 'i3', sequence: 3, booking: { ...visit.items[0].booking, id: 'b3', status: 'MATCHING' } };
    visitApi.get.mockResolvedValue({ ...visit, items: [...visit.items, third].map(item => ({ ...item, booking: { ...item.booking, status: 'MATCHING' } })) });
    visitApi.checkout.mockResolvedValue(checkout({ ready: false, waiting: 3, devices: ['b1', 'b2', 'b3'].map(id => device(id, { state: 'open', serviceOrderId: null })) }));
    const w = await mountPage();
    expect([...bookingListeners.keys()]).toEqual(['b1', 'b2', 'b3']);
    expect(orderListeners.size).toBe(0);
    vi.useFakeTimers();
    orders.getOrder.mockImplementation(async id => ({ id, status: 'ACCEPTED', technician: { id: 'tech1', fullName: 'Thợ vừa nhận lượt', phoneNumber: '0900000000' } }));
    visitApi.checkout.mockResolvedValue(checkout({ ready: false, waiting: 3, devices: ['b1', 'b2', 'b3'].map(id => device(id, { state: 'open' })) }));
    for (let i = 0; i < 6; i++) for (const listener of bookingListeners.values()) listener();
    await vi.advanceTimersByTimeAsync(149);
    expect(visitApi.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(visitApi.get).toHaveBeenCalledTimes(2);
    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    expect(w.get('[data-testid="visit-shared-technician"]').text()).toContain('Thợ vừa nhận lượt');
    expect([...orderListeners.keys()]).toEqual(['o-b1', 'o-b2', 'o-b3']);
    w.unmount();
    expect(bookingListeners.size).toBe(0);
    expect(orderListeners.size).toBe(0);
  });

  it('ignores wrong notification types/references and deduplicates cash delivery by notification ID', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    const event = { id: 'cash-n1', title: '', message: '', type: 'VISIT_CASH_DECLARED', referenceType: 'VISIT_GROUP', referenceId: 'v1', isRead: false, createdAt: '' };
    const emit = (delta: object = {}) => { for (const handler of socketHandlers) handler.onNotificationNew?.({ ...event, ...delta }); };
    emit({ type: 'CASH_DECLARED' });
    emit({ referenceType: 'SERVICE_ORDER' });
    emit({ referenceId: 'unauthorized-visit' });
    emit({ id: '' });
    await vi.advanceTimersByTimeAsync(150);
    expect(visitApi.checkout).toHaveBeenCalledTimes(1);
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { amount: 250000 } }));
    for (let i = 0; i < 10; i++) emit();
    emit({ id: 'cash-n2' });
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    expect(w.get('[data-testid="visit-cash-pending"]').text()).toContain('250000');
    emit();
    await vi.advanceTimersByTimeAsync(500);
    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    expect(visitApi.confirmCash).not.toHaveBeenCalled();
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    expect(visitApi.vnpayUrl).not.toHaveBeenCalled();
  });

  it('merges booking, order, group cash, resync and focus into one read and cancels pending work on unmount', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    bookingListeners.get('b1')?.();
    orderListeners.get('o-b1')?.();
    for (const callback of resyncListeners) callback();
    for (const handler of socketHandlers) handler.onNotificationNew?.({ id: 'combined-cash', title: '', message: '', type: 'VISIT_CASH_DECLARED', referenceType: 'VISIT_GROUP', referenceId: 'v1', isRead: false, createdAt: '' });
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(visitApi.get).toHaveBeenCalledTimes(2);
    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    bookingListeners.get('b2')?.();
    w.unmount();
    await vi.advanceTimersByTimeAsync(500);
    expect(visitApi.get).toHaveBeenCalledTimes(2);
    expect(resyncListeners.size).toBe(0);
    expect(socketHandlers.size).toBe(0);
  });

  it('drops a late cash checkout response from a previous visit', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    let finish!: (value: ReturnType<typeof checkout>) => void;
    visitApi.checkout.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    for (const handler of socketHandlers) handler.onNotificationNew?.({ id: 'late-cash', title: '', message: '', type: 'VISIT_CASH_DECLARED', referenceType: 'VISIT_GROUP', referenceId: 'v1', isRead: false, createdAt: '' });
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    visitApi.get.mockResolvedValue({ ...visit, id: 'v2', items: [] });
    visitApi.checkout.mockResolvedValue({ ...checkout({ total: 50000, devices: [], ready: false }), visitGroupId: 'v2' });
    routeState.params.id = 'v2';
    await flushPromises();
    finish(checkout({ paid: true, total: 0 }));
    await flushPromises();
    expect(visitApi.checkout).toHaveBeenLastCalledWith('v2');
    expect(w.find('[data-checkout-state="paid"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-zero-due"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-cash-confirm"]').exists()).toBe(false);
  });

  it('never grants payment state from a cash notification when checkout fails', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    visitApi.checkout.mockRejectedValue(new Error('Forbidden'));
    for (const handler of socketHandlers) handler.onNotificationNew?.({ id: 'cash-failed', title: 'Đã trả tiền', message: '', type: 'VISIT_CASH_DECLARED', referenceType: 'VISIT_GROUP', referenceId: 'v1', isRead: false, createdAt: '' });
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    expect(w.find('[data-testid="visit-checkout-error"]').exists()).toBe(true);
    expect(w.find('[data-checkout-state="paid"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-zero-due"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-cash-confirm"]').exists()).toBe(false);
    expect(visitApi.confirmCash).not.toHaveBeenCalled();
  });

  it('cleans old booking subscriptions and ignores retained callbacks for a previous visit', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [], ready: false }));
    const w = await mountPage();
    const oldBooking = bookingListeners.get('b1');
    expect(oldBooking).toBeTypeOf('function');
    vi.useFakeTimers();
    oldBooking?.();
    visitApi.get.mockResolvedValue({ ...visit, id: 'v2', items: [{ ...visit.items[0], id: 'i-new', booking: { ...visit.items[0].booking, id: 'b-new' } }] });
    visitApi.checkout.mockResolvedValue({ ...checkout({ devices: [], ready: false }), visitGroupId: 'v2' });
    routeState.params.id = 'v2';
    await flushPromises();
    const calls = visitApi.get.mock.calls.length;
    oldBooking?.();
    for (const handler of socketHandlers) handler.onNotificationNew?.({ id: 'old-cash', title: '', message: '', type: 'VISIT_CASH_DECLARED', referenceType: 'VISIT_GROUP', referenceId: 'v1', isRead: false, createdAt: '' });
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect([...bookingListeners.keys()]).toEqual(['b-new']);
    expect(visitApi.get).toHaveBeenCalledTimes(calls);
    w.unmount();
    expect(bookingListeners.size).toBe(0);
  });

  it('does not fetch child or checkout data after an unauthorized parent read', async () => {
    visitApi.get.mockRejectedValue(new Error('Forbidden'));
    const w = await mountPage();
    expect(w.find('[role="alert"]').exists()).toBe(true);
    expect(visitApi.checkout).not.toHaveBeenCalled();
    expect(orders.getOrder).not.toHaveBeenCalled();
    expect(bookingListeners.size).toBe(0);
    expect(orderListeners.size).toBe(0);
  });

  it('coalesces changes during a read and blocks payment until the newer cash snapshot arrives', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    vi.useFakeTimers();
    let finish!: (value: ReturnType<typeof checkout>) => void;
    visitApi.checkout.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    orderListeners.get('o-b1')?.();
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    orderListeners.get('o-b2')?.();
    await vi.advanceTimersByTimeAsync(150);
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { amount: 250000 } }));
    expect(w.get('[data-testid="visit-pay-wallet"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="visit-pay-wallet"]').trigger('click');
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    finish(checkout());
    await flushPromises();
    expect(w.find('[data-testid="visit-cash-confirm"]').exists()).toBe(true);
    expect(visitApi.checkout).toHaveBeenCalledTimes(3);
  });

  it('fails closed on mismatched order ownership and never fetches its photos or costs', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder.mockImplementation(async id => ({ id, bookingId: 'foreign', visitGroupId: 'other', status: 'UNDER_REPAIR', technician: { id: 'foreign', fullName: 'PRIVATE NAME' } }));
    const w = await mountPage();
    expect(w.text()).not.toContain('PRIVATE NAME');
    expect(orders.getEvidence).not.toHaveBeenCalled();
    expect(orders.getAdditionalCosts).not.toHaveBeenCalled();
    expect(w.find('[data-testid="visit-inline-details"]').exists()).toBe(false);
  });

  it('keeps late child decisions and photos out of the newly selected child', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })] }));
    orders.getOrder.mockImplementation(async id => ({ id, bookingId: id.slice(2), visitGroupId: 'v1', status: 'EN_ROUTE', quotation: { id: `q-${id}`, status: 'SENT' } }));
    orders.getEvidence.mockImplementation(async id => [{ id: `e-${id}`, mediaUrl: `https://example.invalid/${id}.jpg`, note: `Ảnh ${id}`, type: 'before' }]);
    let finish!: () => void;
    orders.approveQuotation.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const w = await mountPage();
    await w.get('[data-testid="visit-quote-approve"]').trigger('click');
    await w.get('[data-testid="visit-device-select-2"]').trigger('click');
    expect(w.text()).not.toContain('Ảnh o-b1');
    finish();
    await flushPromises();
    expect(w.text()).not.toContain('Đã duyệt báo giá của máy này.');
    expect(w.get('[data-testid="visit-inline-details"]').text()).toContain('Ảnh o-b2');
    expect(w.find('img[src="https://example.invalid/o-b1.jpg"]').exists()).toBe(false);
  });

  it('clears prior visit details immediately on route change and drops a late prior read', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder.mockImplementation(async id => ({ id, status: 'UNDER_REPAIR', bookingId: id.slice(2), visitGroupId: 'v1' }));
    const w = await mountPage();
    vi.useFakeTimers();
    let finish!: (value: typeof visit) => void;
    visitApi.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    orderListeners.get('o-b1')?.();
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();
    visitApi.get.mockResolvedValue({ ...visit, id: 'v2', items: [{ ...visit.items[0], id: 'v2-i', booking: { ...visit.items[0].booking, id: 'v2-b', description: 'Máy thuộc lượt mới' } }] });
    visitApi.checkout.mockResolvedValue({ ...checkout({ devices: [], ready: false }), visitGroupId: 'v2' });
    routeState.params.id = 'v2';
    await flushPromises();
    expect(w.text()).not.toContain('Máy lạnh phòng khách chảy nước');
    expect(w.find('[data-testid="visit-inline-details"]').exists()).toBe(false);
    finish(visit);
    await flushPromises();
    expect(visitApi.get).toHaveBeenLastCalledWith('v2');
    expect(w.text()).toContain('Máy thuộc lượt mới');
    expect(w.text()).not.toContain('Máy lạnh phòng khách chảy nước');
  });

  it('does not permit additional approval once finalization was requested', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder.mockImplementation(async id => ({ id, status: 'UNDER_REPAIR', completionRequestedAt: '2026-10-26T01:00:00Z' }));
    orders.getAdditionalCosts.mockImplementation(async id => [{ id: 'locked', serviceOrderId: id, status: 'PENDING_APPROVAL', reason: 'Khoản đang chờ', items: [], totalLaborDelta: 50000, totalPartsDelta: 0 }]);
    const w = await mountPage();
    expect(w.text()).toContain('Khoản đang chờ');
    expect(w.find('[data-testid="visit-cost-approve-locked"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-cost-reject-locked"]').exists()).toBe(false);
    expect(orders.decideAdditionalCost).not.toHaveBeenCalled();
  });

  it('shows a failed quote decision and reloads authoritative state without announcing success', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder.mockImplementation(async id => ({ id, status: 'EN_ROUTE', quotation: { id: 'q1', status: 'SENT' } }));
    orders.rejectQuotation.mockRejectedValue(new Error('network'));
    const w = await mountPage();
    await w.get('[data-testid="visit-quote-reject"]').trigger('click');
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Chưa gửi được lựa chọn');
    expect(w.text()).not.toContain('Đã từ chối báo giá của máy này.');
    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="visit-quote-reject"]').exists()).toBe(true);
  });

  it('does not show an incomplete checkout as paid or free', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ total: undefined, paid: true }));
    const w = await mountPage();
    expect(w.find('[data-testid="visit-checkout-error"]').exists()).toBe(true);
    expect(w.find('[data-checkout-state="paid"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-zero-due"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(false);
  });

  it('does not announce a prior visit cash confirmation on the newly selected visit', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { amount: 250000 } }));
    let finish!: () => void;
    visitApi.confirmCash.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const w = await mountPage();
    await w.get('[data-testid="visit-cash-confirm"]').trigger('click');
    await w.get('[data-testid="visit-cash-confirm"]').trigger('click');
    expect(visitApi.confirmCash).toHaveBeenCalledTimes(1);
    visitApi.get.mockResolvedValue({ ...visit, id: 'v2' });
    visitApi.checkout.mockResolvedValue({ ...checkout(), visitGroupId: 'v2' });
    routeState.params.id = 'v2';
    await flushPromises();
    finish();
    await flushPromises();
    expect(w.text()).not.toContain('Đã xác nhận trả tiền mặt cho cả lượt.');
  });

  it('does not offer approval when a quotation is sent but its order is not EN_ROUTE', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder
      .mockResolvedValueOnce({ id: 'o-b1', status: 'UNDER_REPAIR', quotation: { id: 'q1', status: 'sent' } })
      .mockResolvedValueOnce({ id: 'o-b2', status: 'EN_ROUTE', quotation: { id: 'q2', status: 'approved' } });
    const w = await mountPage();
    expect(w.find('[data-testid="visit-quotation-cta"]').exists()).toBe(false);
  });

  it('keeps quotation handling neutral when a child order read fails', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    orders.getOrder
      .mockResolvedValueOnce({ id: 'o-b1', status: 'EN_ROUTE', quotation: { id: 'q1', status: 'approved' } })
      .mockRejectedValueOnce(new Error('Forbidden'));

    const w = await mountPage();

    expect(w.find('[data-testid="visit-quotation-cta"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-device-quotation-status-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-device-quotation-status-2"]').exists()).toBe(false);
  });

  it('hides group cancellation and reschedule if a child status read fails', async () => {
    visitApi.checkout.mockResolvedValue(checkout({
      ready: false,
      waiting: 2,
      devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })],
    }));
    orders.getOrder.mockRejectedValue(new Error('Forbidden'));
    const w = await mountPage();
    expect(w.find('[data-testid="visit-reschedule"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-cancel"]').exists()).toBe(false);
  });

  it('bounds child order reads to three checkout devices', async () => {
    visitApi.get.mockResolvedValue({ ...visit, items: [...visit.items, { ...visit.items[0], id: 'i3', sequence: 3, booking: { ...visit.items[0].booking, id: 'b3' } }] });
    visitApi.checkout.mockResolvedValue(checkout({
      ready: false,
      waiting: 4,
      devices: [
        device('b1', { state: 'open' }),
        device('b2', { state: 'open' }),
        device('b3', { state: 'open', sequence: 3 }),
        device('b4', { state: 'open', sequence: 4 }),
      ],
    }));
    orders.getOrder.mockImplementation(async (id: string) => ({ id, status: 'EN_ROUTE' }));

    await mountPage();

    expect(orders.getOrder).toHaveBeenCalledTimes(3);
    expect(orders.getOrder).not.toHaveBeenCalledWith('o-b4');
  });

  it('does not offer group reschedule or cancellation after a child order is under repair', async () => {
    visitApi.checkout.mockResolvedValue(checkout({
      ready: false,
      waiting: 2,
      devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })],
    }));
    orders.getOrder
      .mockResolvedValueOnce({ id: 'o-b1', status: 'UNDER_REPAIR' })
      .mockResolvedValueOnce({ id: 'o-b2', status: 'EN_ROUTE' });

    const w = await mountPage();

    expect(w.find('[data-testid="visit-reschedule"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-cancel"]').exists()).toBe(false);
  });

  it('waits for child order statuses before offering group reschedule or cancellation', async () => {
    visitApi.checkout.mockResolvedValue(checkout({
      ready: false,
      waiting: 2,
      devices: [device('b1', { state: 'open' }), device('b2', { state: 'open' })],
    }));
    orders.getOrder.mockReturnValue(new Promise(() => {}));

    const w = await mountPage();

    expect(w.find('[data-testid="visit-reschedule"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-cancel"]').exists()).toBe(false);
  });

  it('pays the whole visit once from the wallet', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    visitApi.payWithWallet.mockResolvedValue({ amount: 250000, balance: 750000 });
    const w = await mountPage();
    await w.get('[data-testid="visit-pay-wallet"]').trigger('click');
    await flushPromises();
    expect(visitApi.payWithWallet).toHaveBeenCalledWith('v1');
    expect(w.text()).toContain('Đã thanh toán 250.000 ₫ bằng ví.');
    expect(w.get('[data-testid="visit-checkout-title"]').text()).toBe('Thanh toán');
  });

  it('finalizes a voucher ZERO amount only through the server closeout', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    funded.zero.mockResolvedValue({ paid: true, amount: 0, settlementId: 'settlement-1' });
    const w = await mountPage();
    await w.get('[data-testid="apply-test-voucher"]').trigger('click');
    await flushPromises();
    expect(funded.zero).toHaveBeenCalledWith({ kind: 'VISIT_GROUP', id: 'v1' }, 'reservation-1');
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    expect(visitApi.vnpayUrl).not.toHaveBeenCalled();
    expect(w.text()).toContain('Máy chủ đã xác nhận tất toán voucher với số tiền khách hàng cần trả là 0 ₫.');
  });

  it('waits for every device before asking to pay', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ ready: false, waiting: 1 }));
    const w = await mountPage();
    expect(w.get('[data-testid="visit-checkout"]').text()).toContain('Còn 1 thiết bị đang xử lý');
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(false);
  });

  it('refreshes the shared checkout when a child order changes and the last device finishes', async () => {
    visitApi.checkout
      .mockResolvedValueOnce(checkout({ ready: false, waiting: 1, devices: [device('b1', { state: 'succeeded' }), device('b2', { state: 'open' })] }))
      .mockResolvedValueOnce(checkout({ ready: true, waiting: 0 }));
    const w = await mountPage();
    vi.useFakeTimers();
    expect(visitApi.checkout).toHaveBeenCalledTimes(1);
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(false);
    expect(orderListeners.has('o-b2')).toBe(true);

    orderListeners.get('o-b2')?.();
    await vi.advanceTimersByTimeAsync(150);
    await flushPromises();

    expect(visitApi.checkout).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(true);
  });

  it('confirms the cash the technician reported for the whole visit', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { id: 'c1', amount: 250000, declaredAt: '2030-01-01T06:00:00Z' } }));
    const w = await mountPage();
    await w.get('[data-testid="visit-cash-confirm"]').trigger('click');
    await flushPromises();
    expect(visitApi.confirmCash).toHaveBeenCalledWith('v1', true, undefined);
  });

  it('shows zero due separately from paid and offers no payment action', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ total: 0, ready: true, paid: false }));
    const w = await mountPage();

    expect(w.get('[data-testid="visit-checkout"]').attributes('data-checkout-state')).toBe('zero_due');
    expect(w.get('[data-testid="visit-checkout-state"]').text()).toContain('Không phát sinh khoản cần thanh toán');
    expect(w.get('[data-testid="visit-checkout"]').text()).not.toContain('Đã thanh toán');
    expect(w.find('[data-testid="visit-pay-methods"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(false);
  });

  it('keeps a failed checkout visible with retry instead of implying zero due', async () => {
    visitApi.checkout.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(checkout());
    const w = await mountPage();
    expect(w.get('[data-testid="visit-checkout-error"]').attributes('role')).toBe('alert');
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Không phát sinh khoản cần thanh toán');
    await w.get('[data-testid="visit-checkout-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="visit-checkout-error"]').exists()).toBe(false);
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(true);
  });

  it('does not describe a rejected cash dispute request as recorded successfully', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { id: 'c1', amount: 250000 } }));
    visitApi.confirmCash.mockRejectedValue(new Error('Network unavailable'));
    const w = await mountPage();
    await w.get('[data-testid="visit-cash-dispute"]').trigger('click');
    await flushPromises();
    const alert = w.get('[data-testid="visit-action-message"]');
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toContain('Chưa gửi được yêu cầu kiểm tra tiền mặt');
    expect(alert.text()).not.toContain('Đã ghi nhận');
    expect(w.get('[data-testid="visit-checkout"]').attributes('data-checkout-state')).toBe('pending_cash');
  });

  it('switches payment methods with arrow keys and preserves the wallet funding gate', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    wallet.summary.mockResolvedValue({ balance: 0 });
    const w = await mountPage();
    await w.get('[data-testid="visit-pay-method-wallet"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.get('[data-testid="visit-pay-method-vnpay"]').attributes('aria-checked')).toBe('true');
    expect(w.find('[data-testid="visit-pay-vnpay"]').exists()).toBe(true);
    await w.get('[data-testid="visit-pay-method-vnpay"]').trigger('keydown', { key: 'End' });
    expect(w.get('[data-testid="visit-pay-method-cash"]').attributes('aria-checked')).toBe('true');
    expect(w.find('[data-testid="visit-pay-vnpay"]').exists()).toBe(false);
    await w.get('[data-testid="visit-pay-method-cash"]').trigger('keydown', { key: 'Home' });
    expect(w.get('[data-testid="visit-pay-method-wallet"]').attributes('aria-checked')).toBe('true');
    expect((w.get('[data-testid="visit-pay-wallet"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    expect(visitApi.vnpayUrl).not.toHaveBeenCalled();
  });

  it('opens cash instructions with the exact group amount without declaring payment', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ total: 375000 }));
    const w = await mountPage();
    await w.get('[data-testid="visit-pay-method-cash"]').trigger('click');
    await w.get('[data-testid="visit-cash-intent"]').trigger('click');
    const instructions = w.get('[data-testid="visit-cash-instructions"]');
    expect(instructions.text()).toContain('375000');
    expect(instructions.text()).toContain('Chưa ghi nhận đã thanh toán');
    expect(instructions.text()).toContain('Kỹ thuật viên khai báo số tiền đã nhận');
    expect(instructions.text()).toContain('xác nhận đúng số tiền hoặc báo chưa đúng');
    expect(w.get('[data-testid="visit-checkout"]').attributes('data-checkout-state')).toBe('ready');
    expect(visitApi.confirmCash).not.toHaveBeenCalled();
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    expect(visitApi.vnpayUrl).not.toHaveBeenCalled();
  });

  it('allows a voucher funded visit to choose cash and shows the preview server due', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ total: 250000 }));
    const w = await mountPage();
    await w.get('[data-testid="apply-cash-test-voucher"]').trigger('click');
    await w.get('[data-testid="visit-pay-method-cash"]').trigger('click');
    await w.get('[data-testid="visit-cash-intent"]').trigger('click');

    const instructions = w.get('[data-testid="visit-cash-instructions"]');
    expect(instructions.text()).toContain('125000');
    expect(instructions.text()).not.toContain('250000');
    expect(w.find('[data-testid="visit-cash-method-unavailable"]').exists()).toBe(false);
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
    expect(visitApi.vnpayUrl).not.toHaveBeenCalled();
    w.unmount();
  });

  it('offers a wallet read retry without presenting a read error as zero balance', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    wallet.summary.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({ balance: 1000000 });
    const w = await mountPage();
    expect(w.get('[data-testid="visit-wallet-error"]').attributes('role')).toBe('alert');
    expect(w.find('[data-testid="visit-wallet-short"]').exists()).toBe(false);
    expect((w.get('[data-testid="visit-pay-wallet"]').element as HTMLButtonElement).disabled).toBe(true);
    await w.get('[data-testid="visit-wallet-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="visit-wallet-error"]').exists()).toBe(false);
    expect((w.get('[data-testid="visit-pay-wallet"]').element as HTMLButtonElement).disabled).toBe(false);
    expect(visitApi.payWithWallet).not.toHaveBeenCalled();
  });

  it('does not offer another payment after the group is paid', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ paid: true }));
    const w = await mountPage();

    expect(w.get('[data-testid="visit-checkout"]').attributes('data-checkout-state')).toBe('paid');
    expect(w.get('[data-testid="visit-checkout-state"]').text()).toBe('Đã thanh toán');
    expect(w.get('[data-testid="visit-checkout-title"]').text()).toBe('Thanh toán');
    expect(w.get('[data-testid="visit-checkout-scope"]').text()).toContain('Gồm 2 thiết bị');
    expect(w.find('[data-testid="visit-pay-methods"]').exists()).toBe(false);
  });

  it('labels wallet shortfall and only offers VNPay at its minimum amount', async () => {
    wallet.summary.mockResolvedValue({ balance: 100000 });
    visitApi.checkout.mockResolvedValue(checkout());
    const short = await mountPage();
    expect(short.get('[data-testid="visit-checkout"]').attributes('data-checkout-state')).toBe('wallet_short');
    expect(short.get('[data-testid="visit-wallet-short"]').text()).toContain('Ví chưa đủ tiền');
    expect((short.get('[data-testid="visit-pay-wallet"]').element as HTMLButtonElement).disabled).toBe(true);
    short.unmount();

    visitApi.checkout.mockResolvedValue(checkout({ total: 4999 }));
    const belowMinimum = await mountPage();
    expect(belowMinimum.find('[data-testid="visit-pay-method-vnpay"]').exists()).toBe(false);
    belowMinimum.unmount();

    visitApi.checkout.mockResolvedValue(checkout({ total: 5000 }));
    const eligible = await mountPage();
    expect(eligible.find('[data-testid="visit-pay-method-vnpay"]').exists()).toBe(true);
  });
});

describe('technician invitation for a visit', () => {
  it('names the visit and lists every device the technician takes on Accept', async () => {
    vi.resetModules();
    const preview = (id: string, serviceName: string) => ({ id, serviceName, addressSummary: 'Quận 1', quantity: 1, urgency: 'medium', preferredStartAt: null, preferredEndAt: null, description: null, aiSummary: null, media: [], pricingMode: 'fixed_price', fixedUnitPrice: 200000, distanceBand: null });
    const invitation = {
      id: 'inv-1', bookingId: 'b-1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-10-10T01:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
      booking: { ...preview('b-1', 'Máy lạnh'), description: 'Mô tả riêng máy lạnh' },
      visitDevices: [{ sequence: 1, deviceLabel: null, booking: { ...preview('b-1', 'Máy lạnh'), description: 'Mô tả riêng máy lạnh' } }, { sequence: 2, deviceLabel: 'Phòng khách', booking: { ...preview('b-2', 'Tủ lạnh'), description: 'Mô tả riêng tủ lạnh' } }],
    };
    vi.doMock('../src/api/bookings.api', () => ({ bookingsApi: { getMyInvitations: vi.fn().mockResolvedValue([invitation]), respondInvitation: vi.fn() } }));
    vi.doMock('../src/api/technician-profile.api', () => ({ technicianProfileApi: { getMyProfile: vi.fn().mockResolvedValue({ autoAcceptInvitations: false }), updateMyProfile: vi.fn() } }));
    vi.doMock('vue-router', () => ({ useRouter: () => ({ push }) }));
    const page = (await import('../src/pages/technician/TechnicianInvitationsPage.vue')).default;
    const w = mount(page, { global: { stubs: { FhCountdown: true, FhSkeleton: true, FhMoney: true, BookingMediaViewer: true, FhButton: { template: '<button><slot /></button>' } } } });
    await flushPromises();
    expect(w.text()).toContain('Lượt sửa 2 thiết bị');
    expect(w.get('[data-testid="invitation-visit-devices"]').text()).toBe('Máy lạnh · Tủ lạnh (Phòng khách)');
    expect(w.find('[data-testid="invitation-description"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Mô tả riêng máy lạnh');
    await w.get('[data-testid="invitation-inv-1"] button').trigger('click');
    expect(w.get('[data-testid="invitation-detail-visit"]').text()).toContain('Máy 2: Tủ lạnh');
    expect(w.get('[data-testid="invitation-detail-visit"]').text()).toContain('Mô tả riêng máy lạnh');
    expect(w.get('[data-testid="invitation-detail-visit"]').text()).toContain('Mô tả riêng tủ lạnh');
  });
});
