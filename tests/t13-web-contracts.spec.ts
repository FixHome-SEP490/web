import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const { get, post, hasRole, staff } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), hasRole: vi.fn(() => true), staff: { userRole: 'SERVICE_MANAGER', hasPermission: () => true } }));
vi.mock('../src/api/client', () => ({ default: { get, post }, getHttpStatus: (e: { response?: { status?: number } }) => e?.response?.status }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ hasRole, ...staff }) }));
import { partRequestsApi } from '../src/api/part-requests.api';
import { ordersApi, historicalPill } from '../src/api/orders.api';
import { customerContinuationApi } from '../src/api/platform-continuation.api';


enableAutoUnmount(afterEach);
const id = (n: number) => `${n}0000000-0000-4000-8000-000000000001`;
const row = () => ({ kind: 'legacy_manual_review' as const, receiptState: 'UNKNOWN' as const, orderId: id(1),
  partRequestId: id(2), partRequestItemId: id(3), technicianId: id(4), requestType: 'pre_repair' as const,
  requestStatus: 'received' as const, handedOverAt: '2026-10-01T03:00:00Z', partCatalogId: null,
  partNameSnapshot: 'Van lịch sử', issuedQty: 2, manualReviewState: 'UNKNOWN' as const, lastManualReview: null });
const command = () => ({ commandId: id(5), expectedVersion: 0, status: 'INVESTIGATING' as const, reason: 'Đang kiểm tra chứng từ' });
const event = () => ({ ...command(), id: id(6), version: 1, actorUserId: id(7), actorRole: 'service_manager',
  occurredAt: '2026-10-29T08:00:00Z', orderId: id(1), partRequestId: id(2), partRequestItemId: id(3), technicianId: id(4) });
const view = () => ({ receiptState: 'UNKNOWN', manualReviewState: 'INVESTIGATING', lastManualReview: event() });
beforeEach(() => { get.mockReset(); post.mockReset(); hasRole.mockReturnValue(true); });
it('keeps STOP truth in the restricted technician history allowlist', async () => {
  get.mockResolvedValue({ data: { data: { id: id(1), code: 'FH-1', status: 'under_repair', historical: true,
    workStopped: true, operationalDisposition: 'STOPPED', createdAt: '2026-10-01', customerPhone: 'private' } } });
  const job = await ordersApi.getTechnicianOrder(id(1));
  expect(job).toMatchObject({ workStopped: true, operationalDisposition: 'STOPPED' });
  expect(job).not.toHaveProperty('customerPhone');
  expect(historicalPill(job as Parameters<typeof historicalPill>[0]).label).toBe('Đã dừng công việc');
});
it('preserves T8 continuation fields and rejects conflicting stop flags', async () => {
  const receipt = { version: 1, incidentId: id(8), workStopped: true, assignmentReleased: true, operationalDisposition: 'STOPPED',
    serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED', serviceOrderStatus: 'under_repair', terminalTransitionApplied: false,
    oldObligations: { reviewRequired: true, quotePreserved: true, moneyPreserved: true, partsPreserved: true,
      physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' },
    customerContinuation: { eligible: true, independentNewBookingAllowed: true, prefilledRebookAvailable: false,
      requiresNewSchedule: true, requiresPricingRevalidation: true, requiresCustomerConfirmation: true,
      source: { serviceOrderId: id(1), bookingId: id(2), incidentId: id(8), visitGroupId: null } } };
  get.mockResolvedValue({ data: { data: receipt } });
  await expect(customerContinuationApi.get(id(1), id(2), null)).resolves.toMatchObject({ workStopped: true, assignmentReleased: true, operationalDisposition: 'STOPPED' });
  get.mockResolvedValue({ data: { data: { ...receipt, assignmentReleased: false } } });
  await expect(customerContinuationApi.get(id(1), id(2), null)).rejects.toThrow();
});
it('reads T11 observation/version and posts only the fixed manual-review command', async () => {
  get.mockResolvedValue({ data: { data: [{ ...row(), ...view() }], meta: { total: 1, page: 1, pageSize: 20 } } });
  const page = await partRequestsApi.getLegacyManualReview();
  expect(page.data[0]).toMatchObject(view());
  post.mockResolvedValue({ data: { data: view() } });
  await expect(partRequestsApi.reviewLegacyItem(row(), command())).resolves.toMatchObject(view());
  expect(post).toHaveBeenCalledWith(`/part-returns/legacy-manual-review/${id(3)}`, command());
});
it('rejects malformed T11 readback and observations without evidence before transport', async () => {
  get.mockResolvedValue({ data: { data: [{ ...row(), manualReviewState: 'PHYSICALLY_VERIFIED', lastManualReview: null }], meta: { total: 1, page: 1, pageSize: 20 } } });
  await expect(partRequestsApi.getLegacyManualReview()).rejects.toThrow();
  await expect(partRequestsApi.reviewLegacyItem(row(), { ...command(), status: 'PHYSICALLY_VERIFIED', observedQty: 0 })).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});
it('retains the exact T11 command while retrying an uncertain outcome', async () => {
  post.mockRejectedValueOnce(new Error('network'));
  const { default: LegacyManualReviewForm } = await import('../src/components/console/LegacyManualReviewForm.vue');
  const w = mount(LegacyManualReviewForm, { props: { row: row() } });
  await w.get('[data-testid="legacy-review-reason"]').setValue(command().reason);
  await w.get('form').trigger('submit'); await flushPromises();
  expect(w.text()).toContain('Chưa xác nhận');
  expect(w.get('[data-testid="legacy-review-reason"]').attributes('disabled')).toBeDefined();
  const sent = structuredClone(post.mock.calls[0][1]);
  // The server returns the same command ID that was generated by the form.
  post.mockResolvedValueOnce({ data: { data: { ...view(), lastManualReview: { ...event(), commandId: sent.commandId } } } });
  await w.get('form').trigger('submit'); await flushPromises();
  expect(post.mock.calls[1][1]).toEqual(sent);
  expect(w.emitted('saved')).toHaveLength(1);
  expect(w.text()).toContain('không phải xác nhận nhận kho');
});
it('never exposes an Admin manual action or permits a final correction without a reason', async () => {
  const { default: LegacyManualReviewForm } = await import('../src/components/console/LegacyManualReviewForm.vue');
  hasRole.mockReturnValue(false);
  const admin = mount(LegacyManualReviewForm, { props: { row: row() } });
  expect(admin.find('form').exists()).toBe(false);
  hasRole.mockReturnValue(true);
  const final = { ...row(), manualReviewState: 'PHYSICALLY_VERIFIED' as const,
    lastManualReview: { ...event(), status: 'PHYSICALLY_VERIFIED' as const, evidenceReferenceId: id(8) } };
  const w = mount(LegacyManualReviewForm, { props: { row: final } });
  await w.get('[data-testid="legacy-review-reason"]').setValue('Điều chỉnh kết luận');
  await w.get('form').trigger('submit'); await flushPromises();
  expect(post).not.toHaveBeenCalled();
  expect(w.text()).toContain('đính chính');
});

it('reads T9 staff evidence as an allowlist without carrying provider/private fields', async () => {
  const { stoppedWorkFinanceApi } = await import('../src/api/stopped-work-finance.api');
  const customer = { version: 1, state: 'FINANCIAL_REVIEW_REQUIRED', customerPayableVnd: null,
    newCollectionAllowed: false, historicalQuoteOnly: true, reviewRequired: true, refundState: 'NOT_DETERMINED', message: 'Đang đối soát.' };
  get.mockResolvedValue({ data: { data: { customer, reasonCodes: ['INVOICES_PRESENT'],
    evidence: { invoices: [{ id: id(8), paymentStatus: 'unpaid', providerUrl: 'https://private.invalid', customerPhone: 'private' }] } } } });
  const result = await stoppedWorkFinanceApi.get(id(1));
  expect(get).toHaveBeenCalledWith(`/service-orders/${id(1)}/stopped-work-finance`);
  expect(result?.evidence.invoices).toEqual([{ id: id(8) }]);
  get.mockResolvedValue({ data: { data: { customer: { ...customer, customerPayableVnd: 0 }, reasonCodes: [], evidence: {} } } });
  await expect(stoppedWorkFinanceApi.get(id(1))).rejects.toThrow();
});
it('keeps the staff finance panel read-only for Admin and refuses Customer reads', async () => {
  const { default: Panel } = await import('../src/components/console/StoppedWorkFinancePanel.vue');
  staff.userRole = 'CUSTOMER';
  const denied = mount(Panel, { props: { orderId: id(1) } });
  expect(denied.find('button').exists()).toBe(false);
  expect(get).not.toHaveBeenCalled();
  staff.userRole = 'ADMIN';
  get.mockResolvedValue({ data: { data: null } });
  const admin = mount(Panel, { props: { orderId: id(1) } });
  await admin.get('button').trigger('click'); await flushPromises();
  expect(admin.text()).toContain('Chưa có thông tin');
  expect(post).not.toHaveBeenCalled();
});
