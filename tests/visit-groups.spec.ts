import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// Several devices in one visit (PO 21/10/2026): one technician, one payment.
const { client, visitApi, wallet, push } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn() },
  visitApi: {
    get: vi.fn(), checkout: vi.fn(), payWithWallet: vi.fn(), vnpayUrl: vi.fn(), confirmCash: vi.fn(),
    cancel: vi.fn(), reschedule: vi.fn(), availableSessions: vi.fn(),
  },
  wallet: { summary: vi.fn() },
  push: vi.fn(),
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

  it('treats the feature as off unless the server says it is on', async () => {
    const { visitGroupsApi } = await import('../src/api/visit-groups.api');
    client.get.mockResolvedValue({ data: { data: {} } });
    expect(await visitGroupsApi.contact()).toEqual({ enabled: false, deviceLimit: 3 });
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
      { id: 'i1', sequence: 1, serviceId: 's1', deviceLabel: null, booking: { id: 'b1', status: 'MATCHED', serviceName: 'Máy lạnh', rescheduleCount: 0 } },
      { id: 'i2', sequence: 2, serviceId: 's2', deviceLabel: 'Phòng khách', booking: { id: 'b2', status: 'CANCELLED', serviceName: 'Tủ lạnh', rescheduleCount: 0 } },
    ],
  };
  const device = (bookingId: string, extra: object) => ({ sequence: 1, deviceLabel: null, bookingId, serviceName: null, serviceOrderId: `o-${bookingId}`, orderCode: 'FH', invoiceId: null, amount: 0, paid: false, ...extra });
  const checkout = (extra: object = {}) => ({
    visitGroupId: 'v1', total: 250000, waiting: 0, ready: true, paid: false, pendingCash: null,
    devices: [device('b1', { state: 'succeeded', amount: 250000, invoiceId: 'inv1' }), device('b2', { state: 'failed' })],
    ...extra,
  });

  async function mountPage() {
    vi.resetModules();
    vi.doMock('../src/api/visit-groups.api', () => ({ visitGroupsApi: visitApi }));
    vi.doMock('../src/api/customer-wallet.api', () => ({ customerWalletApi: wallet }));
    vi.doMock('vue-router', () => ({ useRoute: () => ({ params: { id: 'v1' } }), useRouter: () => ({ push }) }));
    const page = (await import('../src/pages/customer/CustomerVisitPage.vue')).default;
    const w = mount(page, { global: { stubs: { FhSkeleton: true, FhBackLink: true, FhMoney: { props: ['amount'], template: '<span>{{ amount }}</span>' }, FhButton: { template: '<button v-bind="$attrs"><slot /></button>' }, BookingSessionPicker: true, 'router-link': { template: '<a><slot /></a>' } } } });
    await flushPromises();
    return w;
  }

  beforeEach(() => {
    Object.values(visitApi).forEach((fn) => fn.mockReset());
    wallet.summary.mockResolvedValue({ balance: 1000000 });
    visitApi.get.mockResolvedValue(visit);
  });

  it('lists every device with its result and charges only the one repaired', async () => {
    visitApi.checkout.mockResolvedValue(checkout());
    const w = await mountPage();
    expect(w.get('[data-testid="visit-device-1"]').text()).toContain('Đã sửa xong');
    expect(w.get('[data-testid="visit-device-2"]').text()).toContain('Không sửa được, không tính tiền');
    expect(w.get('[data-testid="visit-checkout"]').text()).toContain('250000');
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

  it('confirms the cash the technician reported for the whole visit', async () => {
    visitApi.checkout.mockResolvedValue(checkout({ pendingCash: { id: 'c1', amount: 250000, declaredAt: '2030-01-01T06:00:00Z' } }));
    const w = await mountPage();
    await w.get('[data-testid="visit-cash-confirm"]').trigger('click');
    await flushPromises();
    expect(visitApi.confirmCash).toHaveBeenCalledWith('v1', true, undefined);
  });
});

describe('technician invitation for a visit', () => {
  it('names the visit and lists every device the technician takes on Accept', async () => {
    vi.resetModules();
    const preview = (id: string, serviceName: string) => ({ id, serviceName, addressSummary: 'Quận 1', quantity: 1, urgency: 'medium', preferredStartAt: null, preferredEndAt: null, description: null, aiSummary: null, media: [], pricingMode: 'fixed_price', fixedUnitPrice: 200000, distanceBand: null });
    const invitation = {
      id: 'inv-1', bookingId: 'b-1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-10-10T01:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
      booking: preview('b-1', 'Máy lạnh'),
      visitDevices: [{ sequence: 1, deviceLabel: null, booking: preview('b-1', 'Máy lạnh') }, { sequence: 2, deviceLabel: 'Phòng khách', booking: preview('b-2', 'Tủ lạnh') }],
    };
    vi.doMock('../src/api/bookings.api', () => ({ bookingsApi: { getMyInvitations: vi.fn().mockResolvedValue([invitation]), respondInvitation: vi.fn() } }));
    vi.doMock('../src/api/technician-profile.api', () => ({ technicianProfileApi: { getMyProfile: vi.fn().mockResolvedValue({ autoAcceptInvitations: false }), updateMyProfile: vi.fn() } }));
    vi.doMock('vue-router', () => ({ useRouter: () => ({ push }) }));
    const page = (await import('../src/pages/technician/TechnicianInvitationsPage.vue')).default;
    const w = mount(page, { global: { stubs: { FhCountdown: true, FhSkeleton: true, FhMoney: true, BookingMediaViewer: true, FhButton: { template: '<button><slot /></button>' } } } });
    await flushPromises();
    expect(w.text()).toContain('Lượt sửa 2 thiết bị');
    expect(w.get('[data-testid="invitation-visit-devices"]').text()).toBe('Máy lạnh · Phòng khách');
    await w.get('[data-testid="invitation-inv-1"] button').trigger('click');
    expect(w.get('[data-testid="invitation-detail-visit"]').text()).toContain('Máy 2: Tủ lạnh');
  });
});
