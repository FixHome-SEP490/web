import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get, post, patch: vi.fn(), delete: vi.fn() }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'order-B' }, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ openConversationForBooking: vi.fn(), toggleWidget: vi.fn(), conversations: [] }) }));
import TechnicianJobDetailPage from '../src/pages/technician/TechnicianJobDetailPage.vue';
enableAutoUnmount(afterEach);

const order = (extra: Record<string, unknown> = {}) => ({
  id: 'order-B', code: 'FH-B', bookingId: 'booking-B', serviceName: 'Máy B', status: 'under_repair',
  arrivalVerified: true, pricingMode: 'inspection_required', customerName: 'Fixture', customerPhone: '',
  addressSummary: 'Fixture', scheduledAt: '2026-10-27T02:00:00Z', createdAt: '2026-10-27T01:00:00Z',
  laborTotal: 100000, partsTotal: 0, grandTotal: 100000, paymentStatus: 'unpaid',
  quotation: { id: 'quote-B', status: 'approved', laborTotal: 100000, partsTotal: 0, items: [] }, ...extra,
});
const receipt = () => ({ data: { data: {
  version: 1, incidentId: '30000000-0000-4000-8000-000000000001', serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED',
  serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
  oldObligations: { reviewRequired: true, quotePreserved: true, moneyPreserved: true, partsPreserved: true, physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' },
  customerContinuation: { eligible: true, independentNewBookingAllowed: true, prefilledRebookAvailable: false, requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true, source: { serviceOrderId: 'order-B', bookingId: 'booking-B', incidentId: '30000000-0000-4000-8000-000000000001', visitGroupId: null } },
} } });
const reason = 'Tôi không đủ kỹ năng xử lý thiết bị này.';

async function render(overrides: Record<string, unknown> = {}) {
  get.mockImplementation(async (path: string) => {
    if (path === '/service-orders/order-B') return { data: { data: order(overrides) } };
    if (path === '/bookings/booking-B') return { data: { data: { id: 'booking-B', status: 'matched', media: [] } } };
    if (path === '/service-orders/order-B/part-requests') return { data: { data: [] } };
    if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
    return { data: { data: [] } };
  });
  const w = mount(TechnicianJobDetailPage, { attachTo: document.body, global: { stubs: { Teleport: true, TechnicianPartsSection: true, BookingMediaViewer: true, AiSummaryDialog: true } } });
  await flushPromises();
  return w;
}
beforeEach(() => { get.mockReset(); post.mockReset(); });

it('offers cannot-continue only after a valid check-in and posts exactly one typed command', async () => {
  post.mockResolvedValue(receipt());
  const w = await render();
  await w.get('[data-testid="job-more-button"]').trigger('click');
  // Report-only stays a separate, non-stopping action.
  expect(w.find('[data-testid="job-technician-report-skill"]').exists()).toBe(true);
  await w.get('[data-testid="job-cannot-continue-menu"]').trigger('click');
  const dialog = w.get('[data-testid="cannot-continue-dialog"]');
  expect(dialog.attributes('aria-busy')).toBe('false');
  await dialog.get('textarea').setValue(reason);
  await dialog.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click');
  await flushPromises();
  const call = post.mock.calls.find(([path]) => path === '/service-orders/order-B/cannot-continue');
  expect(call).toBeTruthy();
  expect(call![1]).toMatchObject({ reasonClass: 'technician_skill_gap', reasonCode: 'skill_gap', reason, photoEvidenceIds: [] });
  expect(call![1].commandId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  expect(post.mock.calls.map(([path]) => path).filter(path => path.endsWith('/cancel') || path.endsWith('/repair-failed'))).toEqual([]);
  expect(w.text()).toContain('Đã ghi nhận gián đoạn');
  expect(w.text()).toContain('quản lý dịch vụ kiểm đếm');
  await w.get('[data-testid="job-more-button"]').trigger('click');
  expect(w.find('[data-testid="job-cannot-continue-menu"]').exists()).toBe(false);
  expect(w.find('[data-testid="job-repair-failed-menu"]').exists()).toBe(false);
});

it('hides cannot-continue before check-in and keeps objective repair-failed accessible after check-in', async () => {
  const w = await render({ arrivalVerified: false });
  await w.get('[data-testid="job-more-button"]').trigger('click');
  expect(w.find('[data-testid="job-cannot-continue-menu"]').exists()).toBe(false);
  expect(w.find('[data-testid="job-repair-failed-menu"]').exists()).toBe(true);
  w.unmount();
  const checkedIn = await render();
  await checkedIn.get('[data-testid="job-more-button"]').trigger('click');
  expect(checkedIn.find('[data-testid="job-cannot-continue-menu"]').exists()).toBe(true);
  expect(checkedIn.find('[data-testid="job-repair-failed-menu"]').exists()).toBe(true);
});

it('reports a refused command without claiming cancellation or success', async () => {
  post.mockRejectedValue({ response: { status: 403 } });
  const w = await render();
  await w.get('[data-testid="job-more-button"]').trigger('click');
  await w.get('[data-testid="job-cannot-continue-menu"]').trigger('click');
  const dialog = w.get('[data-testid="cannot-continue-dialog"]');
  await dialog.get('textarea').setValue(reason);
  await dialog.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click');
  await flushPromises();
  expect(post).toHaveBeenCalledTimes(1);
  await flushPromises();
  expect(w.get('[data-testid="cannot-continue-dialog"]').text()).toContain('Quyền hoặc trạng thái');
  expect(w.text()).not.toContain('Đã ghi nhận gián đoạn');
  expect(post.mock.calls.every(([path]) => path === '/service-orders/order-B/cannot-continue')).toBe(true);
});
