import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/api/client', () => ({ default: { get, post, patch: vi.fn(), delete: vi.fn() }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
const route = reactive({ params: { id: 'order-B' }, query: {} });
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: async (target: { path: string }) => { route.params.id = target.path.split('/').at(-1)!; }, replace: vi.fn() }) }));
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
    if (overrides.visitGroupId && /^\/service-orders\/order-[CD]$/.test(path)) {
      const id = path.split('/').at(-1)!;
      return { data: { data: { ...order(overrides), id, bookingId: id.replace('order-', 'booking-') } } };
    }
    if (overrides.visitGroupId && path.endsWith('/checkout')) return { data: { data: { visitGroupId: overrides.visitGroupId, ready: false, waiting: 3, total: 0, paid: false, pendingCash: null,
      devices: ['B', 'C', 'D'].map((key, i) => ({ sequence: i + 1, bookingId: `booking-${key}`, serviceOrderId: `order-${key}`, deviceLabel: null, serviceName: 'Fixture', state: 'open', invoiceId: null, amount: 0, paid: false })),
    } } };
    if (path === '/bookings/booking-B') return { data: { data: { id: 'booking-B', status: 'matched', media: [] } } };
    if (path === '/service-orders/order-B/part-requests') return { data: { data: [] } };
    if (path.endsWith('/invoice') || path.endsWith('/cash-settlement')) return { data: { data: null } };
    return { data: { data: [] } };
  });
  const w = mount(TechnicianJobDetailPage, { attachTo: document.body, global: { stubs: { Teleport: true, TechnicianPartsSection: true, BookingMediaViewer: true, AiSummaryDialog: true } } });
  await flushPromises();
  return w;
}
beforeEach(() => { route.params.id = 'order-B'; get.mockReset(); post.mockReset(); });

it('selects machine 2 in the report form and stops only that machine with its own source', async () => {
  const w = await render({ visitGroupId: 'visit-1' });
  await w.get('[data-testid="job-more-button"]').trigger('click');
  await w.get('[data-testid="job-cannot-continue-menu"]').trigger('click');
  expect(w.get('[data-testid="report-device"]').findAll('option').map(item => item.text())).toEqual(['Máy 1', 'Máy 2', 'Máy 3']);
  await w.get('[data-testid="report-device"]').setValue('order-C'); await flushPromises();
  expect(route.params.id).toBe('order-C');
  expect(w.get('[data-testid="report-device"]').element.value).toBe('order-C');
  await w.get('[data-testid="report-reason-code"]').setValue('manufacturer_warranty_or_workshop');
  await w.get('[data-testid="cannot-continue-dialog"] textarea').setValue(reason);
  await w.get('[data-testid="cannot-continue-confirm-intent"]').setValue(true);
  post.mockRejectedValue({ response: { status: 403 } });
  await w.get('[data-testid="cannot-continue-submit"]').trigger('click'); await flushPromises();
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/service-orders/order-C/cannot-continue', expect.objectContaining({ reasonCode: 'manufacturer_warranty_or_workshop', reasonClass: 'non_technician_exception', reason }));
});

it('offers cannot-continue only after a valid check-in and posts exactly one typed command', async () => {
  post.mockResolvedValue(receipt());
  const w = await render();
  await w.get('[data-testid="job-more-button"]').trigger('click');
  expect(w.find('[data-testid="job-technician-report-skill"]').exists()).toBe(false);
  expect(w.get('[data-testid="job-cannot-continue-menu"]').text()).toBe('Báo cáo vấn đề sửa chữa');
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

it('shows arrived waiting in detail after check-in while the device remains en route', async () => {
  const w = await render({ status: 'en_route', arrivalVerified: true });
  expect(w.text()).toContain('Đã đến, chờ sửa');
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
  expect(w.get('[data-testid="cannot-continue-dialog"]').text()).toContain('không có quyền');
  expect(w.get('[data-testid="cannot-continue-submit"]').attributes('disabled')).toBeDefined();
  expect(w.text()).not.toContain('Đã ghi nhận gián đoạn');
  expect(post.mock.calls.every(([path]) => path === '/service-orders/order-B/cannot-continue')).toBe(true);
});
