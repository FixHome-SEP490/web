import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const { get, post, push, getOrder } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), getOrder: vi.fn() }));
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
    customerContinuation: { eligible, independentNewBookingAllowed: eligible, prefilledRebookAvailable: prefill, requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true, source: eligible ? source : null } };
}
const props = { orderId: source.serviceOrderId, bookingId: source.bookingId, visitGroupId: null, orderStatus: 'UNDER_REPAIR' };
beforeEach(() => { get.mockReset(); post.mockReset(); push.mockReset(); getOrder.mockReset(); setActivePinia(createPinia()); });
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
it('does not enable prefill from a flag without a verified draft contract', async () => {
  get.mockResolvedValue({ data: { data: receipt(true, true) } });
  const w = mount(CustomerContinuationPanel, { props }); await flushPromises();
  expect(w.find('[data-testid="continuation-prefill"]').exists()).toBe(false);
  expect(w.find('[data-testid="continuation-new-booking"]').exists()).toBe(true);
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
