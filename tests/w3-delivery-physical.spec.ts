import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import apiClient from '../src/api/client';
import { w3DeliveryPhysicalApi } from '../src/api/w3-delivery-physical.api';
import DeliveryPhysicalPreview from '../src/components/DeliveryPhysicalPreview.vue';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';
import TechnicianPartsSection from '../src/components/TechnicianPartsSection.vue';
import CustomerOrderDetailPage from '../src/pages/customer/CustomerOrderDetailPage.vue';
import { partRequestsApi, type PartRequest } from '../src/api/part-requests.api';
import { partsCatalogApi } from '../src/api/parts-catalog.api';
import { ordersApi } from '../src/api/orders.api';
import { cashIntentsApi } from '../src/api/cash-intents.api';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'order-physical-fixture' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}));

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const blockers = ['SHIPPING_APPROVAL_SOURCE_UNVERIFIED', 'WAREHOUSE_DELIVERY_ALLOCATION_MISSING',
  'COURIER_PROOF_UNVERIFIED', 'FINANCE_CUTOVER_CLOSED', 'TOTAL_ORDER_LABOR_BUDGET_UNVERIFIED',
  'PHYSICAL_ACTIVATION_CLOSED', 'DUAL_CONSENT_UNVERIFIED'];
function preview(requestId = id) {
  return { mode: 'NON_EXECUTABLE_PREVIEW', consistency: 'NON_ATOMIC', requestId,
    eligibility: 'PENDING_ASSISTANCE', reason: 'SHIPPING_APPROVAL_SOURCE_UNVERIFIED', lastAssessment: null,
    physicalExecution: 'BLOCKED', financialExecution: 'BLOCKED', evidence: 'NOT_RECORDED',
    actualCourierCost: null, courierPayment: 'NOT_RECORDED', blockers: [...blockers],
    actions: { reserve: 'BLOCKED', issueToCourier: 'BLOCKED', dispatch: 'BLOCKED', technicianReceipt: 'BLOCKED' },
    progress: null as null | Record<string, unknown> };
}
const envelope = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'Success', data } });
function signIn(role = UserRole.CUSTOMER, userId = 'customer-a') {
  useAuthStore().setAuth('test-session', { id: userId, role, email: 'fixture@example.test', fullName: 'Fixture', status: 'active' });
}
const props = { requestId: id, fulfillmentMethod: 'delivery', audience: 'customer' as const };
beforeEach(() => { setActivePinia(createPinia()); signIn(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('W3 delivery physical read boundary', () => {
  it('reads the paid W3 progress and an older answer without it (W-16)', async () => {
    const paid = { ...preview(), lastAssessment: { version: 4, status: 'TECHNICIAN_RECEIVED', reason: null }, evidence: 'RECORDED_NOT_EXTERNALLY_VERIFIED',
      progress: { status: 'TECHNICIAN_RECEIVED', actualShippingFee: 35000, customerShippingShare: 24500, technicianShippingShare: 10500 } };
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(paid));
    expect((await w3DeliveryPhysicalApi.preview(id)).progress).toEqual(paid.progress);
    const older: Record<string, unknown> = { ...preview() };
    delete older.progress;
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(older));
    expect((await w3DeliveryPhysicalApi.preview(id)).progress).toBeNull();
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...paid, progress: { ...paid.progress, actualShippingFee: -1 } }));
    await expect(w3DeliveryPhysicalApi.preview(id)).rejects.toThrow();
  });
  it('reads only the canonical GET and never emits a physical or financial command', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(preview()));
    const post = vi.spyOn(apiClient, 'post'); const patch = vi.spyOn(apiClient, 'patch');
    expect(await w3DeliveryPhysicalApi.preview(id)).toEqual(preview());
    expect(get.mock.calls).toEqual([[`/part-requests/${id}/delivery-physical/preview`]]);
    expect(Object.keys(w3DeliveryPhysicalApi)).toEqual(['preview']);
    expect(post).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled();
  });
  it.each(['', '../orders', `${id}?dispatch=true`, 'order-id', null])('rejects invalid request ID %s before transport', async value => {
    const get = vi.spyOn(apiClient, 'get');
    await expect(w3DeliveryPhysicalApi.preview(value as never)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it.each([null, {}, { data: preview() }, { success: false, statusCode: 200, message: 'Success', data: preview() },
    { success: true, statusCode: 503, message: 'Success', data: preview() },
    { success: true, statusCode: '200', message: 'Success', data: preview() }])('rejects invalid envelope %j', async body => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: body });
    await expect(w3DeliveryPhysicalApi.preview(id)).rejects.toThrow();
  });
  it.each([
    { mode: 'EXECUTABLE' }, { consistency: 'ATOMIC' }, { requestId: otherId }, { eligibility: 'ELIGIBLE' },
    { reason: 'APPROVED' }, { eligibility: 'INELIGIBLE' }, { evidence: 'VERIFIED' }, { actualCourierCost: 0 },
    { actualCourierCost: 20000 }, { courierPayment: 'PAID' }, { physicalExecution: 'ENABLED' },
    { financialExecution: 'ENABLED' }, { blockers: [] }, { blockers: [...blockers, 'FUTURE_APPROVAL'] },
    { blockers: [...blockers, blockers[0]] }, { actions: { reserve: 'ALLOWED' } }, { approved: true },
    { lastAssessment: { version: 0, status: 'INELIGIBLE', reason: null } },
    { lastAssessment: { version: 1, status: 'SUCCESS', reason: null } },
    { lastAssessment: { version: 1, status: 'INELIGIBLE' } },
    { evidence: 'RECORDED_NOT_EXTERNALLY_VERIFIED' },
  ])('rejects unsafe projection %j', async change => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...preview(), ...change }));
    await expect(w3DeliveryPhysicalApi.preview(id)).rejects.toThrow();
  });
  it('accepts explicit legacy ineligibility and historical recorded evidence without granting execution', async () => {
    const data = { ...preview(), eligibility: 'INELIGIBLE', reason: 'LEGACY_OR_NOT_ENROLLED' };
    const recorded = { ...preview(), evidence: 'RECORDED_NOT_EXTERNALLY_VERIFIED', lastAssessment: { version: 2, status: 'DISPATCH_RECORDED', reason: null } };
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(envelope(data)).mockResolvedValueOnce(envelope(recorded));
    expect(await w3DeliveryPhysicalApi.preview(id)).toEqual(data);
    expect(await w3DeliveryPhysicalApi.preview(id)).toEqual(recorded);
  });
  it.each([403, 404, 503])('preserves real HTTP %s', async status => {
    const error = { response: { status } };
    vi.spyOn(apiClient, 'get').mockRejectedValue(error);
    await expect(w3DeliveryPhysicalApi.preview(id)).rejects.toBe(error);
  });
});

describe('real DELIVERY request integration', () => {
  const orderId = 'order-physical-fixture';
  const request = (change: Partial<PartRequest> = {}): PartRequest => ({ id, serviceOrderId: orderId,
    technicianId: 'technician-a', requestType: 'quotation', fulfillmentMethod: 'delivery', status: 'requested',
    shippingFee: 0, createdAt: '', updatedAt: '', items: [], ...change });
  const stubs = { RouterLink: true, MapTilerMap: true, CustomerStopReplaceRequest: true, CustomerContinuationPanel: true,
    CustomerCancelledRebookAction: true, OrderComplaintPanel: true, WarrantyClaimCard: true, WarrantyClaimModal: true,
    RebookDialog: true, ReviewTechnicianModal: true };
  function records() {
    return [request(), request({ id: otherId, fulfillmentMethod: 'pickup' }), request({ id: 'not-a-request-id' }),
      request({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', serviceOrderId: 'another-order' })];
  }
  it('mounts technician preview only on real delivery rows for the selected order; pickup stays untouched', async () => {
    signIn(UserRole.TECHNICIAN, 'technician-a');
    vi.spyOn(partRequestsApi, 'getByOrderId').mockResolvedValue(records());
    vi.spyOn(partRequestsApi, 'getReturnsByOrderId').mockResolvedValue([]);
    vi.spyOn(partRequestsApi, 'getWarehouseAllocation').mockResolvedValue({ partRequestId: otherId, mode: 'legacy', status: null });
    vi.spyOn(partsCatalogApi, 'getCatalog').mockResolvedValue({ data: [], total: 0 });
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(preview()));
    const w = mount(TechnicianPartsSection, { props: { orderId, orderStatus: 'UNDER_REPAIR' }, global: { stubs } });
    await flushPromises();
    expect(w.findAllComponents(DeliveryPhysicalPreview)).toHaveLength(1);
    expect(get.mock.calls.map(call => call[0])).toEqual([`/part-requests/${id}/delivery-physical/preview`]);
    expect(w.text()).toContain('Tự lấy tại kho'); w.unmount();
  });
  it('mounts customer preview from the actual parts list even without a quotation, invoice or shipping snapshot', async () => {
    vi.spyOn(partRequestsApi, 'getByOrderId').mockResolvedValue(records());
    vi.spyOn(ordersApi, 'getOrder').mockResolvedValue({ id: orderId, code: 'FIXTURE', status: 'ACCEPTED', paymentStatus: 'UNPAID',
      serviceName: 'Dịch vụ kiểm thử', createdAt: '2026-11-06T00:00:00Z', timeline: [] } as never);
    vi.spyOn(ordersApi, 'getInvoice').mockResolvedValue(null as never);
    vi.spyOn(ordersApi, 'getCashSettlement').mockResolvedValue(null as never);
    vi.spyOn(ordersApi, 'getEvidence').mockResolvedValue([]);
    vi.spyOn(cashIntentsApi, 'get').mockResolvedValue({ cashFirstEnabled: false, intent: null });
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(preview()));
    const w = mount(CustomerOrderDetailPage, { global: { stubs } }); await flushPromises();
    expect(w.findAllComponents(DeliveryPhysicalPreview)).toHaveLength(1);
    expect(w.get('[data-testid="customer-delivery-requests"]').text()).toContain('Cần hỗ trợ');
    expect(get.mock.calls.map(call => call[0])).toEqual([`/part-requests/${id}/delivery-physical/preview`]);
    w.unmount();
  });
});

describe('read-only delivery presentation', () => {
  it('identifies each real request when several delivery previews are shown', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async url => envelope(preview(String(url).includes(otherId) ? otherId : id)));
    const a = mount(DeliveryPhysicalPreview, { props });
    const b = mount(DeliveryPhysicalPreview, { props: { ...props, requestId: otherId } });
    await flushPromises();
    expect(a.text()).toContain(`Mã yêu cầu: ${id}`);
    expect(b.text()).toContain(`Mã yêu cầu: ${otherId}`);
    expect(a.text()).not.toContain(otherId); expect(b.text()).not.toContain(id);
    a.unmount(); b.unmount();
  });
  it.each([UserRole.CUSTOMER, UserRole.TECHNICIAN])('shows blocked, unknown-money status for %s', async role => {
    signIn(role);
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope(preview()));
    const post = vi.spyOn(apiClient, 'post'); const patch = vi.spyOn(apiClient, 'patch');
    const w = mount(DeliveryPhysicalPreview, { props: { ...props, audience: role === UserRole.CUSTOMER ? 'customer' : 'technician' } });
    await flushPromises();
    expect(w.text()).toContain('Trạng thái giao linh kiện');
    expect(w.text()).toContain('Chỉ xem');
    expect(w.text()).toContain('Cần hỗ trợ');
    expect(w.text()).toContain('Phí giao thực tế');
    expect(w.text()).toContain('Chưa xác định');
    expect(w.text()).toContain('Chưa ghi nhận thanh toán');
    expect(w.text()).not.toMatch(/0 ₫|70%|30%|Đã giao|Đã nhận|Đã duyệt|NON_ATOMIC|BLOCKED/);
    expect(w.find('form').exists()).toBe(false);
    expect(w.findAll('button').map(b => b.text())).toEqual(['Kiểm tra lại']);
    expect(w.get('[role="status"]').attributes('aria-live')).toBe('polite');
    expect(post).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled(); w.unmount();
  });
  it.each([UserRole.ADMIN, UserRole.SERVICE_MANAGER])('does not request or present status to %s', async role => {
    signIn(role); const get = vi.spyOn(apiClient, 'get');
    const w = mount(DeliveryPhysicalPreview, { props }); await flushPromises();
    expect(get).not.toHaveBeenCalled(); expect(w.text()).toBe(''); w.unmount();
  });
  it.each([{ fulfillmentMethod: 'pickup' }, { requestId: '' }, { audience: 'technician' }])('does not fetch for invalid presentation context %j', async change => {
    const get = vi.spyOn(apiClient, 'get');
    const w = mount(DeliveryPhysicalPreview, { props: { ...props, ...change } as never }); await flushPromises();
    expect(get).not.toHaveBeenCalled(); expect(w.text()).toBe(''); w.unmount();
  });
  it.each([404, 503])('shows safe fallback and hides details for HTTP %s', async status => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({ response: { status } });
    const w = mount(DeliveryPhysicalPreview, { props }); await flushPromises();
    expect(w.text()).toContain('Chưa có thông tin giao linh kiện khả dụng');
    expect(w.find('dl').exists()).toBe(false); expect(w.find('button').exists()).toBe(false);
    expect(w.text()).not.toMatch(/404|503|migration|Backend/); w.unmount();
  });
  it('fails closed on malformed responses; retries only a GET', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(envelope({ ...preview(), evidence: 'VERIFIED' })).mockResolvedValue(envelope(preview()));
    const w = mount(DeliveryPhysicalPreview, { props }); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Chưa thể kiểm tra trạng thái giao linh kiện');
    expect(w.find('dl').exists()).toBe(false);
    await w.get('button').trigger('click'); await flushPromises();
    expect(get).toHaveBeenCalledTimes(2); expect(w.text()).toContain('Cần hỗ trợ'); w.unmount();
  });
  it('shows recorded evidence as unverified even when a historical assessment mentions dispatch', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(envelope({ ...preview(), evidence: 'RECORDED_NOT_EXTERNALLY_VERIFIED',
      lastAssessment: { version: 2, status: 'DISPATCH_RECORDED', reason: null } }));
    const w = mount(DeliveryPhysicalPreview, { props }); await flushPromises();
    expect(w.text()).toContain('Đã ghi nhận, chưa được xác minh độc lập');
    expect(w.text()).not.toMatch(/Đã giao|Đã nhận|Đã thanh toán|DISPATCH_RECORDED/); w.unmount();
  });
  it('discards a late response when request changes, including A→B→A', async () => {
    let resolveA!: (value: unknown) => void;
    vi.spyOn(apiClient, 'get').mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }))
      .mockResolvedValueOnce(envelope(preview(otherId)))
      .mockResolvedValueOnce(envelope({ ...preview(), eligibility: 'INELIGIBLE', reason: 'LEGACY_OR_NOT_ENROLLED' }));
    const w = mount(DeliveryPhysicalPreview, { props });
    expect(w.attributes('aria-busy')).toBe('true');
    await w.setProps({ requestId: otherId }); await flushPromises();
    await w.setProps({ requestId: id }); await flushPromises();
    expect(w.text()).toContain('Chưa đủ điều kiện');
    resolveA(envelope(preview())); await flushPromises();
    expect(w.text()).toContain('Chưa đủ điều kiện'); expect(w.text()).not.toContain('Cần hỗ trợ'); w.unmount();
  });
  it('clears status on forbidden refresh and never exposes transport text', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(envelope(preview())).mockRejectedValue({ response: { status: 403 }, message: 'private database error' });
    const w = mount(DeliveryPhysicalPreview, { props }); await flushPromises();
    await w.get('button').trigger('click'); await flushPromises();
    expect(w.text()).toContain('Bạn không có quyền xem nội dung này');
    expect(w.find('dl').exists()).toBe(false); expect(w.text()).not.toContain('private'); w.unmount();
  });
  it('invalidates pending reads on logout', async () => {
    let resolve!: (value: unknown) => void;
    const get = vi.spyOn(apiClient, 'get').mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const w = mount(DeliveryPhysicalPreview, { props });
    useAuthStore().user = null; useAuthStore().token = null;
    await flushPromises(); resolve(envelope(preview())); await flushPromises();
    expect(w.text()).toBe(''); expect(get).toHaveBeenCalledTimes(1); w.unmount();
  });
  it('discards an old account response after switching accounts with the same role', async () => {
    let resolve!: (value: unknown) => void;
    vi.spyOn(apiClient, 'get').mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockRejectedValue({ response: { status: 403 } });
    const w = mount(DeliveryPhysicalPreview, { props });
    signIn(UserRole.CUSTOMER, 'customer-b'); await flushPromises();
    expect(w.text()).toContain('Bạn không có quyền');
    resolve(envelope(preview())); await flushPromises();
    expect(w.text()).toContain('Bạn không có quyền'); expect(w.find('dl').exists()).toBe(false); w.unmount();
  });
  it('does not publish a pending read after unmount', async () => {
    let resolve!: (value: unknown) => void;
    vi.spyOn(apiClient, 'get').mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValue(envelope({ ...preview(), eligibility: 'INELIGIBLE', reason: 'LEGACY_OR_NOT_ENROLLED' }));
    const old = mount(DeliveryPhysicalPreview, { props }); old.unmount();
    const current = mount(DeliveryPhysicalPreview, { props }); await flushPromises();
    resolve(envelope(preview())); await flushPromises();
    expect(current.text()).toContain('Chưa đủ điều kiện'); expect(current.text()).not.toContain('Cần hỗ trợ'); current.unmount();
  });
});
