import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Several devices in one visit (PO 21/10/2026): one technician, one payment.
const { client, visitApi, orders, wallet, push, orderListeners } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn() },
  visitApi: {
    get: vi.fn(), checkout: vi.fn(), payWithWallet: vi.fn(), vnpayUrl: vi.fn(), confirmCash: vi.fn(),
    cancel: vi.fn(), reschedule: vi.fn(), availableSessions: vi.fn(),
  },
  orders: { getOrder: vi.fn() },
  wallet: { summary: vi.fn() },
  push: vi.fn(),
  orderListeners: new Map<string, () => void>(),
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
    vi.doMock('../src/services/live-updates', () => ({
      onOrderChange: (orderId: string, callback: () => void) => {
        orderListeners.set(orderId, callback);
        return () => orderListeners.delete(orderId);
      },
      onResync: () => () => undefined,
      whileOffline: () => () => undefined,
    }));
    vi.doMock('vue-router', () => ({ useRoute: () => ({ params: { id: 'v1' } }), useRouter: () => ({ push }) }));
    const page = (await import('../src/pages/customer/CustomerVisitPage.vue')).default;
    const w = mount(page, { global: { stubs: { FhSkeleton: true, FhBackLink: true, FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' }, FhButton: { template: '<button v-bind="$attrs"><slot /></button>' }, BookingSessionPicker: true, BookingMediaViewer: { props: ['bookingId', 'media', 'embedded'], template: '<div data-testid="visit-booking-media" :data-booking-id="bookingId" :data-media-count="media.length" />' }, 'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
    await flushPromises();
    return w;
  }

  beforeEach(() => {
    Object.values(visitApi).forEach((fn) => fn.mockReset());
    orderListeners.clear();
    orders.getOrder.mockReset().mockRejectedValue(new Error('Order detail unavailable'));
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
    expect(w.get('[data-testid="visit-checkout"]').text()).toContain('250000');
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
    expect(w.get('[data-testid="visit-device-order-link"]').attributes('href')).toBeUndefined();
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
    expect(w.get('[data-testid="visit-quotation-cta"]').attributes('href')).toBe('/app/orders/o-b1');
    expect(w.get('[data-testid="visit-device-quotation-status-1"]').text()).toBe('Báo giá đang chờ bạn duyệt');
    expect(w.get('[data-testid="visit-device-select-1"]').attributes('aria-label')).toContain('Chờ bạn duyệt báo giá');
    expect(w.get('[data-testid="visit-device-select-1"]').text()).toContain('Chờ bạn duyệt báo giá');
    expect(w.find('[data-testid="visit-device-quotation-status-2"]').exists()).toBe(false);
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
    expect(w.text()).toContain('Đã thanh toán 250.000 ₫ bằng ví cho cả lượt.');
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
    expect(visitApi.checkout).toHaveBeenCalledTimes(1);
    expect(w.find('[data-testid="visit-pay-wallet"]').exists()).toBe(false);
    expect(orderListeners.has('o-b2')).toBe(true);

    orderListeners.get('o-b2')?.();
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
