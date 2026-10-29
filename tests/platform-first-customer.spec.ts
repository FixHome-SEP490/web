import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createTestQueryClient, installQueryClient } from './support/query-client';
import { queryKeys } from '../src/lib/query-keys';
const { get, post, push, getOrder, poll, stopPoll } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), getOrder: vi.fn(), poll: vi.fn(), stopPoll: vi.fn() }));
vi.mock('../src/services/live-updates', async importOriginal => ({
  ...await importOriginal<typeof import('../src/services/live-updates')>(), whileOffline: poll,
}));
vi.mock('../src/api/client', () => ({
  default: { get, post },
  getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
  registerMutationListener: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useRoute: () => ({ params: { id: '10000000-0000-4000-8000-000000000001' }, query: {} }),
  RouterLink: { template: '<a><slot /></a>' },
}));
vi.mock('../src/api/orders.api', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/api/orders.api')>();
  const optionalReads = {
    getOrder,
    getInvoice: vi.fn().mockResolvedValue(null),
    getCashSettlement: vi.fn().mockResolvedValue(null),
    getEvidence: vi.fn().mockResolvedValue([]),
    getAdditionalCosts: vi.fn().mockResolvedValue([]),
    getOrderWarranties: vi.fn().mockResolvedValue([]),
    getOrderWarrantyClaims: vi.fn().mockResolvedValue([]),
  } as Record<string, unknown>;
  return { ...actual, ordersApi: new Proxy(optionalReads, {
    get: (target, key: string) => target[key] ?? vi.fn().mockResolvedValue([]),
  }) };
});
vi.mock('../src/api/part-requests.api', () => ({ partRequestsApi: { getByOrderId: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getBooking: vi.fn().mockResolvedValue({ id: '20000000-0000-4000-8000-000000000001' }) } }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi: { getByOrder: vi.fn().mockResolvedValue(null) } }));
vi.mock('../src/api/cash-intents.api', () => ({ cashIntentsApi: { get: vi.fn().mockResolvedValue({ cashFirstEnabled: false, intent: null }), create: vi.fn(), cancel: vi.fn() } }));
import CustomerContinuationPanel from '../src/components/customer/CustomerContinuationPanel.vue';
import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';
enableAutoUnmount(afterEach);
const source = { serviceOrderId: '10000000-0000-4000-8000-000000000001', bookingId: '20000000-0000-4000-8000-000000000001', incidentId: '30000000-0000-4000-8000-000000000001', visitGroupId: null };
function receipt(eligible = true, prefill = false) {
  return { version: 1, incidentId: eligible ? source.incidentId : null, serviceOutcome: eligible ? 'VERIFIED_INTERRUPTION_RECORDED' : null, serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
    oldObligations: { reviewRequired: eligible, quotePreserved: true, moneyPreserved: true, partsPreserved: true, physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' },
    customerContinuation: { eligible, independentNewBookingAllowed: eligible, prefilledRebookAvailable: prefill,
      ...(prefill ? { draftPath: `/api/v1/bookings/${source.bookingId}/interruption-draft`, confirmationPath: `/api/v1/bookings/${source.bookingId}/interruption-rebook`, targetKind: 'booking', sourceCount: 1 } : {}),
      requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true, source: eligible ? source : null } };
}
const props = { orderId: source.serviceOrderId, bookingId: source.bookingId, visitGroupId: null, orderStatus: 'UNDER_REPAIR' };
beforeEach(() => { poll.mockReset().mockReturnValue(stopPoll); stopPoll.mockReset(); get.mockReset(); post.mockReset(); push.mockReset(); getOrder.mockReset(); setActivePinia(createPinia()); });
it('offers independent NEW booking with preserved obligations and no prefill promise', async () => {
  get.mockResolvedValue({ data: { data: receipt() } });
  const w = mount(CustomerContinuationPanel, { props }); await flushPromises();
  expect(w.text()).toContain('chưa được hủy');
  expect(w.text()).toContain('Quản lý dịch vụ');
  expect(w.text()).toContain('chưa sẵn sàng');
  await w.get('[data-testid="continuation-new-booking"]').trigger('click');
  expect(push).toHaveBeenCalledWith('/app/bookings/new');
  expect(post).not.toHaveBeenCalled();
});
it('offers the verified prefill CTA with the exact source booking query and keeps the independent NEW button', async () => {
  get.mockResolvedValue({ data: { data: receipt(true, true) } });
  const w = mount(CustomerContinuationPanel, { props }); await flushPromises();
  const cta = w.get('[data-testid="continuation-prefill"]');
  expect(cta.text()).toContain('Đặt lại dịch vụ');
  expect(w.find('[data-testid="continuation-new-booking"]').exists()).toBe(true);
  expect(w.text()).not.toContain('chưa sẵn sàng');
  await cta.trigger('click');
  expect(push).toHaveBeenCalledWith({ path: '/app/bookings/new', query: { interruptionRebook: source.bookingId } });
  expect(push).not.toHaveBeenCalledWith(expect.stringContaining('http'));
});
it('shows no source CTA for report-only/noneligible and no fake zero on errors', async () => {
  get.mockResolvedValue({ data: { data: receipt(false) } });
  const w = mount(CustomerContinuationPanel, { props }); await flushPromises();
  expect(w.find('[data-testid="continuation-new-booking"]').exists()).toBe(false);
  get.mockRejectedValue({ response: { status: 403 } });
  await w.setProps({ orderId: '40000000-0000-4000-8000-000000000001' }); await flushPromises();
  expect(w.text()).toContain('Chưa kiểm tra được');
  expect(w.text()).not.toContain('0 ₫');
  expect(w.find('[data-testid="continuation-new-booking"]').exists()).toBe(false);
});
it('ignores a late response from the previous device and supports retry', async () => {
  let finish!: (r: unknown) => void;
  get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('network'));
  const w = mount(CustomerContinuationPanel, { props });
  await w.setProps({ orderId: '40000000-0000-4000-8000-000000000001' }); await flushPromises();
  finish({ data: { data: receipt() } }); await flushPromises();
  expect(w.find('[data-testid="continuation-new-booking"]').exists()).toBe(false);
  get.mockResolvedValue({ data: { data: receipt(false) } });
  await w.get('[data-testid="continuation-retry"]').trigger('click'); await flushPromises();
  expect(w.find('[role="alert"]').exists()).toBe(false);
});
const customerOrder = (status: string) => ({
  id: source.serviceOrderId, code: 'FH-1', status, paymentStatus: 'UNPAID', grandTotal: 199000,
  bookingId: source.bookingId, technician: null,
});
const pageStubs = {
  MapTilerMap: { name: 'MapTilerMap', props: ['markers', 'center'], template: '<div data-testid="tracking-map" />' },
  RouterLink: true, 'router-link': true, VoucherCheckoutChooser: true, CustomerStopReplaceRequest: true,
  CustomerCancelledRebookAction: true, OrderComplaintPanel: true, WarrantyClaimCard: true,
  WarrantyClaimModal: true, RebookDialog: true, ChatThread: true,
};
it('renders the verified continuation source on the active order page and opens an independent new booking', async () => {
  getOrder.mockResolvedValue(customerOrder('UNDER_REPAIR'));
  get.mockImplementation(async (path: string) => path.endsWith('/customer-continuation')
    ? { data: { data: receipt() } } : { data: { data: [] } });
  const w = mount(CustomerOrderDetailPage, { global: { stubs: pageStubs } });
  await flushPromises();
  const panel = w.get('[data-testid="customer-continuation"]');
  expect(get).toHaveBeenCalledWith(`/service-orders/${source.serviceOrderId}/customer-continuation`);
  expect(panel.text()).toContain('chưa được hủy');
  await panel.get('[data-testid="continuation-new-booking"]').trigger('click');
  expect(push).toHaveBeenCalledWith('/app/bookings/new');
});
it('does not ask the server for a continuation source on a terminal order', async () => {
  getOrder.mockResolvedValue(customerOrder('COMPLETED'));
  get.mockResolvedValue({ data: { data: receipt() } });
  const w = mount(CustomerOrderDetailPage, { global: { stubs: pageStubs } });
  await flushPromises();
  expect(w.find('[data-testid="customer-continuation"]').exists()).toBe(false);
  expect(get.mock.calls.some(([path]) => String(path).endsWith('/customer-continuation'))).toBe(false);
});

it('renders T8 STOP and T9 undetermined finance without collecting the historical quote', async () => {
  getOrder.mockResolvedValue({ ...customerOrder('UNDER_REPAIR'), workStopped: true, assignmentReleased: true,
    operationalDisposition: 'STOPPED', completionRequestedAt: '2026-10-29T07:00:00Z',
    failedWorkFinance: { version: 1, state: 'VERIFIED_WORK_STOPPED_UNBILLED', customerPayableVnd: null,
      historicalQuoteOnly: true, newCollectionAllowed: false, reviewRequired: true, refundState: 'NOT_DETERMINED', message: 'Đang đối soát nghĩa vụ cũ.' } });
  get.mockImplementation(async (path: string) => ({ data: { data: path.endsWith('/customer-continuation')
    ? { ...receipt(), workStopped: true, assignmentReleased: true, operationalDisposition: 'STOPPED' } : [] } }));
  const w = mount(CustomerOrderDetailPage, { global: { stubs: pageStubs } }); await flushPromises();
  expect(w.text()).toContain('Đã dừng công việc');
  expect(w.get('[data-testid="stopped-work-finance"]').text()).toContain('Chưa xác định');
  expect(w.get('[data-testid="order-costs"]').text()).toContain('Báo giá cũ chỉ để xem lịch sử');
  expect(w.find('[data-testid="pay-after-completion"]').exists()).toBe(false);
  expect(w.text()).not.toContain('Đang sửa chữa');
  expect(w.get('[data-testid="customer-continuation"]').text()).toContain('đã được nhả');
  await w.get('[data-testid="continuation-new-booking"]').trigger('click');
  expect(push).toHaveBeenCalledWith('/app/bookings/new');
});

it('does not start tracking or show active tracking controls for a stopped EN_ROUTE order', async () => {
  getOrder.mockResolvedValue({ ...customerOrder('EN_ROUTE'), workStopped: true, assignmentReleased: true,
    operationalDisposition: 'STOPPED', technician: { id: 't-1', fullName: 'Thợ thử', phoneNumber: '' },
    technicianLocation: { lat: 10, lng: 106, updatedAt: '2026-10-29T08:00:00Z' } });
  get.mockResolvedValue({ data: { data: receipt() } });
  const w = mount(CustomerOrderDetailPage, { global: { stubs: pageStubs } }); await flushPromises();
  expect(poll).not.toHaveBeenCalled();
  expect(w.find('[aria-label="Xem vị trí kỹ thuật viên"]').exists()).toBe(false);
  expect(w.text()).not.toContain('Kỹ thuật viên sẽ chụp ảnh khi tới nơi');
  expect(w.text()).not.toContain('Chọn thợ khác');
});

it('stops tracking when STOP arrives with the same EN_ROUTE enum and ignores an earlier polling response', async () => {
  const query = createTestQueryClient(); installQueryClient(query);
  const active = { ...customerOrder('EN_ROUTE'), technician: { id: 't-1', fullName: 'Thợ thử', phoneNumber: '' },
    technicianLocation: { lat: 10, lng: 106, updatedAt: '2026-10-29T08:00:00Z' } };
  getOrder.mockResolvedValue(active); get.mockResolvedValue({ data: { data: receipt() } });
  const w = mount(CustomerOrderDetailPage, { global: { stubs: pageStubs } }); await flushPromises();
  expect(poll).toHaveBeenCalledTimes(1);
  await w.get('[aria-label="Xem vị trí kỹ thuật viên"]').trigger('click');
  expect(w.find('[data-testid="tracking-map"]').exists()).toBe(true);
  let finish!: (value: unknown) => void;
  getOrder.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const running = poll.mock.calls[0][0]();
  const key = queryKeys.orders.customerDetail(source.serviceOrderId);
  const bundle = query.getQueryData<Record<string, unknown>>(key)!;
  query.setQueryData(key, { ...bundle, order: { ...active, workStopped: true, operationalDisposition: 'STOPPED' } });
  await flushPromises();
  expect(stopPoll).toHaveBeenCalled();
  expect(w.find('[data-testid="tracking-map"]').exists()).toBe(false);
  finish(active); await running; await flushPromises();
  expect(w.text()).toContain('Đã dừng công việc');
  expect(w.find('[aria-label="Xem vị trí kỹ thuật viên"]').exists()).toBe(false);
});
