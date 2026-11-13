import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DeliveryOperationsPanel from '../src/components/DeliveryOperationsPanel.vue';
import { w3DeliveryOperationsApi } from '../src/api/w3-delivery-operations.api';
import { w3DeliveryTermsApi } from '../src/api/w3-delivery-terms.api';
import { warehousesApi } from '../src/api/warehouses.api';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fingerprint = 'a'.repeat(64);
const quote = { quoteVersion: 1, fingerprint, policyVersion: 'W3_70_30_V1', totalShippingFee: 0 as const,
  customerShippingShare: 0 as const, technicianShippingShare: 0 as const, laborBudget: 'UNVERIFIED' as const };
const projection = (change: Record<string, unknown> = {}) => ({ version: 1, quote, invalidated: false,
  customerConsented: false, technicianConsented: false, actual: null, physical: null,
  financialExecution: 'BLOCKED' as const, financialBlocker: 'FINANCE_LEDGER_SOURCE_REQUIRED' as const, ...change });
const props = { requestId, fulfillmentMethod: 'delivery', requestType: 'additional', shippingFee: 0,
  audience: 'customer' as const, sourceOwnerId: 'owner-a' };
function signIn(role: UserRole, id: string) {
  useAuthStore().setAuth('session', { id, role, email: 'fixture@example.test', fullName: 'Fixture', status: 'active' });
}
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('W3 delivery operations panel', () => {
  it('does not read or reveal actions when the signed-in actor is not the source owner', async () => {
    signIn(UserRole.CUSTOMER, 'someone-else');
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read');
    const wrapper = mount(DeliveryOperationsPanel, { props });
    await flushPromises();
    expect(read).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delivery-operations-actions"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a delivered request as done, not as changed source data (13/11)', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection({ invalidated: true,
      customerConsented: true, technicianConsented: true,
      physical: { status: 'TECHNICIAN_RECEIVED', reason: null, warehouseId: null, responsibleUserId: null, quantities: [], version: 4, courierReference: null, evidence: [] } }) as never);
    const wrapper = mount(DeliveryOperationsPanel, { props });
    await flushPromises();
    expect(wrapper.get('[data-testid="delivery-operations-done"]').text()).toContain('Đã giao xong');
    expect(wrapper.text()).not.toContain('Dữ liệu nguồn đã thay đổi');
    wrapper.unmount();
  });

  it('offers customer consent only for the exact zero-fee quote from a real delivery request', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection());
    const consent = vi.spyOn(w3DeliveryOperationsApi, 'consent').mockResolvedValue({
      version: 2, quote, customerConsented: true, technicianConsented: false, replayed: false, financialExecution: 'BLOCKED',
    });
    const wrapper = mount(DeliveryOperationsPanel, { props });
    await flushPromises();
    expect(wrapper.text()).toContain('Phí giao thực tế: 0₫');
    expect(wrapper.text()).toContain('Tôi đồng ý với mức phí giao 0 ₫');
    expect(wrapper.text()).not.toMatch(/đã thanh toán|đã xác minh đơn vị giao/i);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-consent"]').trigger('click');
    await flushPromises();
    expect(consent).toHaveBeenCalledWith(requestId, expect.objectContaining({
      expectedVersion: 1, quoteVersion: 1, quoteFingerprint: fingerprint, totalShippingFee: 0, shippingShare: 0, accepted: true,
    }));
    wrapper.unmount();
  });

  it('keeps the same command key and payload for a retry after an uncertain response', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection());
    const consent = vi.spyOn(w3DeliveryOperationsApi, 'consent')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ version: 2, quote, customerConsented: true, technicianConsented: false, replayed: true, financialExecution: 'BLOCKED' });
    const wrapper = mount(DeliveryOperationsPanel, { props });
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-consent"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="delivery-consent"]').trigger('click');
    await flushPromises();
    expect(consent).toHaveBeenCalledTimes(2);
    expect(consent.mock.calls[0]?.[1]).toEqual(consent.mock.calls[1]?.[1]);
    wrapper.unmount();
  });

  it('requires a fresh read after a consent version conflict instead of replaying the stale command', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection());
    vi.spyOn(w3DeliveryOperationsApi, 'consent').mockRejectedValue({ response: { status: 409 } });
    const wrapper = mount(DeliveryOperationsPanel, { props });
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-consent"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Trạng thái đã thay đổi. Hãy tải lại trước khi tiếp tục.');
    expect(wrapper.text()).not.toContain('Thử lại cùng thao tác');
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(false);

    const reloadButton = wrapper.findAll('button').find(button => button.text().includes('Tải lại trạng thái'));
    expect(reloadButton).toBeDefined();
    await reloadButton!.trigger('click');
    await flushPromises();
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([404, 503])('shows only safe unavailable copy and no mutation for HTTP %s', async status => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockRejectedValue({ response: { status } });
    const consent = vi.spyOn(w3DeliveryOperationsApi, 'consent');
    const wrapper = mount(DeliveryOperationsPanel, { props });
    await flushPromises();
    expect(wrapper.text()).toContain('Chưa khả dụng');
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(false);
    expect(consent).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('drops an old read when the account changes on the same request', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    let resolveOld!: (value: ReturnType<typeof projection>) => void;
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockRejectedValueOnce({ response: { status: 403 } });
    const wrapper = mount(DeliveryOperationsPanel, { props });
    signIn(UserRole.CUSTOMER, 'owner-b');
    await wrapper.setProps({ sourceOwnerId: 'owner-b' });
    await flushPromises();
    resolveOld(projection());
    await flushPromises();
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Bạn không có quyền xem');
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('requires a technician request ownership match before reading or offering consent', async () => {
    signIn(UserRole.TECHNICIAN, 'tech-a');
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read');
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'technician', sourceOwnerId: 'tech-b' } });
    await flushPromises();
    expect(read).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('requires an actual delivery UUID, additional source and a non-negative fee before any read', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read');
    for (const change of [
      { requestId: 'not-a-uuid' },
      { fulfillmentMethod: 'pickup' },
      { requestType: 'quotation' },
      { shippingFee: undefined },
      { shippingFee: -1 },
    ]) {
      const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, ...change } });
      await flushPromises();
      expect(wrapper.find('[data-testid="delivery-operations-actions"]').exists()).toBe(false);
      wrapper.unmount();
    }
    expect(read).not.toHaveBeenCalled();
  });

  it('renders positive 70/30 terms read-only for the customer and never offers the zero-fee consent route', async () => {
    signIn(UserRole.CUSTOMER, 'owner-a');
    const positiveQuote = { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 };
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection({ quote: positiveQuote }));
    const consent = vi.spyOn(w3DeliveryOperationsApi, 'consent');
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, shippingFee: 101 } });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Giao linh kiện · phí 70/30');
    expect(text).toContain('Khách hàng chịu (70%): 71₫');
    expect(text).toContain('Kỹ thuật viên chịu (30%): 30₫');
    expect(text).toContain('Chưa đủ điều kiện giao nhận vật lý');
    expect(text).toContain('Đồng thuận phí dương được ghi tại mục Điều khoản phí giao hàng.');
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(false);
    expect(consent).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('offers the technician warehouse reservation only after both positive-fee consents and an actual fee', async () => {
    signIn(UserRole.TECHNICIAN, 'tech-a');
    const positiveQuote = { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 };
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection({
      quote: positiveQuote, customerConsented: true, technicianConsented: true,
      actual: { totalShippingFee: 100, quoteVersion: 1 },
    }));
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, shippingFee: 101, audience: 'technician', sourceOwnerId: 'tech-a' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Đã đủ điều kiện ghi nhận giao nhận vật lý.');
    expect(wrapper.find('[data-testid="delivery-consent"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Yêu cầu phân bổ kho');
    wrapper.unmount();
  });

  it('allows only the matching technician to consent and reserve after both consents and actual zero', async () => {
    signIn(UserRole.TECHNICIAN, 'tech-a');
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection({
      customerConsented: true, technicianConsented: false, actual: { totalShippingFee: 0, quoteVersion: 1 },
    }));
    const consent = vi.spyOn(w3DeliveryOperationsApi, 'consent').mockResolvedValue({
      version: 2, quote, customerConsented: true, technicianConsented: true, replayed: false, financialExecution: 'BLOCKED',
    });
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'technician', sourceOwnerId: 'tech-a' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Ghi nhận đồng ý');
    expect(wrapper.text()).not.toContain('Yêu cầu phân bổ kho');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-consent"]').trigger('click');
    await flushPromises();
    expect(consent.mock.calls[0]?.[1]).toMatchObject({ shippingShare: 0, quoteFingerprint: fingerprint, accepted: true });
    wrapper.unmount();
  });

  it('uploads technician receipt evidence against the server-bound DELIVERY warehouse, not a manager selection', async () => {
    signIn(UserRole.TECHNICIAN, 'tech-a');
    const warehouseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const receiptEvidenceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const dispatched = {
      status: 'DISPATCH_RECORDED' as const,
      reason: null,
      warehouseId,
      responsibleUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      courierReference: 'SHIP-0',
      evidence: [],
      version: 3,
    };
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection({
      customerConsented: true, technicianConsented: true,
      actual: { totalShippingFee: 0, quoteVersion: 1 },
      physical: dispatched,
    }));
    const upload = vi.spyOn(w3DeliveryOperationsApi, 'uploadEvidence').mockResolvedValue({
      evidenceId: receiptEvidenceId, purpose: 'TECHNICIAN_RECEIPT', quoteVersion: 1,
    });
    const physical = vi.spyOn(w3DeliveryOperationsApi, 'physical').mockResolvedValue({
      state: { ...dispatched, status: 'TECHNICIAN_RECEIVED', version: 4 },
      replayed: false,
    });
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'technician', sourceOwnerId: 'tech-a' } });
    await flushPromises();
    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [new File(['receipt'], 'receipt.png', { type: 'image/png' })] });
    await fileInput.trigger('change');
    await wrapper.findAll('button').find(button => button.text().includes('nhận linh kiện'))?.trigger('click');
    await flushPromises();
    expect(upload).toHaveBeenCalledWith(requestId, expect.objectContaining({
      warehouseId, purpose: 'TECHNICIAN_RECEIPT', quoteVersion: 1,
    }));
    expect(physical).toHaveBeenCalledWith(requestId, 'receipt', expect.objectContaining({
      expectedVersion: 3, evidenceId: receiptEvidenceId,
    }));
    wrapper.unmount();
  });

  it('bootstraps without W2 allocation, requires selecting an own active warehouse and quote evidence', async () => {
    signIn(UserRole.SERVICE_MANAGER, 'sm-a');
    vi.spyOn(warehousesApi, 'list').mockResolvedValue([
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kho của tôi', address: null, status: 'active', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Kho của người khác', address: null, status: 'active', responsibleUserId: 'sm-b', createdAt: '', updatedAt: '' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Kho ngừng hoạt động', address: null, status: 'inactive', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
    ]);
    const upload = vi.spyOn(w3DeliveryOperationsApi, 'uploadEvidence').mockResolvedValue({
      evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', purpose: 'QUOTE', quoteVersion: 1,
    });
    const propose = vi.spyOn(w3DeliveryOperationsApi, 'propose').mockResolvedValue({
      version: 1, quote, replayed: false, financialExecution: 'BLOCKED',
    });
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection());
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'manager', sourceOwnerId: undefined } });
    await flushPromises();
    expect(read).not.toHaveBeenCalled();
    const select = wrapper.get('select[aria-label="Chọn kho đang hoạt động do bạn phụ trách"]');
    expect(select.text()).toContain('Kho của tôi');
    expect(select.text()).not.toContain('Kho của người khác');
    expect(select.element.value).toBe('');
    await select.setValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(wrapper.get('button').text()).toBe('Đối chiếu trạng thái đã có');
    const proposalButton = wrapper.findAll('button').find(button => button.text() === 'Đề xuất phí giao 0 ₫');
    expect(proposalButton?.attributes('disabled')).toBeDefined();
    await proposalButton?.trigger('click');
    expect(upload).not.toHaveBeenCalled();
    expect(propose).not.toHaveBeenCalled();
    await wrapper.get('input[autocomplete="off"]').setValue('SHIP-0');
    const evidenceInput = wrapper.get('[data-testid="quote-evidence"]');
    Object.defineProperty(evidenceInput.element, 'files', { value: [new File(['photo'], 'quote.png', { type: 'image/png' })] });
    await evidenceInput.trigger('change');
    await wrapper.findAll('button').find(button => button.text() === 'Đề xuất phí giao 0 ₫')?.trigger('click');
    await flushPromises();
    expect(upload).toHaveBeenCalledWith(requestId, expect.objectContaining({ warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'QUOTE', quoteVersion: 1 }));
    expect(propose).toHaveBeenCalledWith(requestId, expect.objectContaining({
      expectedVersion: 0, totalShippingFee: 0, warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    }));
    expect(read).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not bootstrap when the manager owns no active warehouse', async () => {
    signIn(UserRole.SERVICE_MANAGER, 'sm-a');
    vi.spyOn(warehousesApi, 'list').mockResolvedValue([
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Kho của người khác', address: null, status: 'active', responsibleUserId: 'sm-b', createdAt: '', updatedAt: '' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Kho ngừng hoạt động', address: null, status: 'inactive', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
    ]);
    const upload = vi.spyOn(w3DeliveryOperationsApi, 'uploadEvidence');
    const propose = vi.spyOn(w3DeliveryOperationsApi, 'propose');
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read');
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'manager', sourceOwnerId: undefined } });
    await flushPromises();
    expect(wrapper.text()).toContain('chưa có kho đang hoạt động');
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('[data-testid="quote-evidence"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Đề xuất phí giao 0 ₫');
    expect(read).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(propose).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([404, 503])('does not mutate after an explicit existing-state read returns %s', async status => {
    signIn(UserRole.SERVICE_MANAGER, 'sm-a');
    vi.spyOn(warehousesApi, 'list').mockResolvedValue([
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kho của tôi', address: null, status: 'active', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
    ]);
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockRejectedValue({ response: { status } });
    const post = vi.spyOn(w3DeliveryOperationsApi, 'propose');
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'manager' } });
    await flushPromises();
    await wrapper.get('select').setValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Chưa khả dụng');
    expect(wrapper.text()).not.toContain('Mã tham chiếu đơn vị giao hàng');
    expect(post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the bootstrap proposal command key and payload after an uncertain POST', async () => {
    signIn(UserRole.SERVICE_MANAGER, 'sm-a');
    vi.spyOn(warehousesApi, 'list').mockResolvedValue([
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kho của tôi', address: null, status: 'active', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
    ]);
    const upload = vi.spyOn(w3DeliveryOperationsApi, 'uploadEvidence').mockResolvedValue({
      evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', purpose: 'QUOTE', quoteVersion: 1,
    });
    const propose = vi.spyOn(w3DeliveryOperationsApi, 'propose')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ version: 1, quote, replayed: true, financialExecution: 'BLOCKED' });
    vi.spyOn(w3DeliveryOperationsApi, 'read').mockResolvedValue(projection());
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, audience: 'manager' } });
    await flushPromises();
    await wrapper.get('select').setValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await wrapper.get('input[autocomplete="off"]').setValue('SHIP-0');
    const input = wrapper.get('[data-testid="quote-evidence"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['photo'], 'quote.png', { type: 'image/png' })] });
    await input.trigger('change');
    await wrapper.findAll('button').find(button => button.text() === 'Đề xuất phí giao 0 ₫')?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Chưa xác định được kết quả');
    await wrapper.findAll('button').find(button => button.text() === 'Thử lại cùng thao tác')?.trigger('click');
    await flushPromises();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(propose).toHaveBeenCalledTimes(2);
    expect(propose.mock.calls[0]?.[1]).toEqual(propose.mock.calls[1]?.[1]);
    expect(propose.mock.calls[0]?.[1]).toMatchObject({ expectedVersion: 0 });
    wrapper.unmount();
  });

  it('records a positive proposal through the terms contract after the manager inspects the authoritative version', async () => {
    signIn(UserRole.SERVICE_MANAGER, 'sm-a');
    vi.spyOn(warehousesApi, 'list').mockResolvedValue([
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kho của tôi', address: null, status: 'active', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
    ]);
    const positiveQuote = { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 };
    const read = vi.spyOn(w3DeliveryOperationsApi, 'read')
      .mockResolvedValueOnce(projection({ version: 0, quote: null }))
      .mockResolvedValue(projection({ quote: positiveQuote }));
    const upload = vi.spyOn(w3DeliveryTermsApi, 'uploadEvidence').mockResolvedValue({
      evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', purpose: 'QUOTE', quoteVersion: 1,
    });
    const propose = vi.spyOn(w3DeliveryTermsApi, 'propose').mockResolvedValue({ state: {
      version: 1, scope: 'CONDITIONAL_TERMS_ONLY', quote: { quoteVersion: 1, policyVersion: 'W3_70_30_V1',
        totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30, fingerprint },
      customerConsented: false, technicianConsented: false, actual: null, financialExecution: 'BLOCKED',
      laborBudget: null, aggregateBudgetVerified: false, paymentVerified: false,
    }, replayed: false });
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, shippingFee: 101, audience: 'manager' } });
    await flushPromises();
    await wrapper.get('select').setValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await wrapper.findAll('button').find(button => button.text() === 'Đối chiếu trạng thái đã có')?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="positive-shipping-fee"]').exists()).toBe(true);
    await wrapper.get('[data-testid="positive-shipping-fee"]').setValue('101');
    await wrapper.get('input[autocomplete="off"]').setValue('SHIP-101');
    const input = wrapper.get('[data-testid="quote-evidence"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['photo'], 'quote.png', { type: 'image/png' })] });
    await input.trigger('change');
    await wrapper.findAll('button').find(button => button.text() === 'Ghi đề xuất phí giao')?.trigger('click');
    await flushPromises();
    expect(upload).toHaveBeenCalledWith(requestId, expect.objectContaining({
      warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'QUOTE', quoteVersion: 1,
    }));
    expect(propose).toHaveBeenCalledWith(requestId, expect.objectContaining({
      expectedVersion: 0, totalShippingFee: 101, warehouseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', courierReference: 'SHIP-101',
    }));
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Khách hàng chịu (70%): 71₫');
    wrapper.unmount();
  });

  it('records a positive actual fee through the terms contract and enables physical operations only afterwards', async () => {
    signIn(UserRole.SERVICE_MANAGER, 'sm-a');
    vi.spyOn(warehousesApi, 'list').mockResolvedValue([
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kho của tôi', address: null, status: 'active', responsibleUserId: 'sm-a', createdAt: '', updatedAt: '' },
    ]);
    const positiveQuote = { ...quote, totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30 };
    const actual = { quoteVersion: 1, totalShippingFee: 100, customerShippingShare: 70, technicianShippingShare: 30,
      verification: 'RECORDED_NOT_EXTERNALLY_VERIFIED' as const };
    vi.spyOn(w3DeliveryOperationsApi, 'read')
      .mockResolvedValueOnce(projection({ quote: positiveQuote, customerConsented: true, technicianConsented: true }))
      .mockResolvedValue(projection({ quote: positiveQuote, customerConsented: true, technicianConsented: true,
        actual: { totalShippingFee: 100, quoteVersion: 1 } }));
    const upload = vi.spyOn(w3DeliveryTermsApi, 'uploadEvidence').mockResolvedValue({
      evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', purpose: 'ACTUAL', quoteVersion: 1,
    });
    const actualCall = vi.spyOn(w3DeliveryTermsApi, 'actual').mockResolvedValue({ state: {
      version: 2, scope: 'CONDITIONAL_TERMS_ONLY', quote: { quoteVersion: 1, policyVersion: 'W3_70_30_V1',
        totalShippingFee: 101, customerShippingShare: 71, technicianShippingShare: 30, fingerprint },
      customerConsented: true, technicianConsented: true, actual, financialExecution: 'BLOCKED',
      laborBudget: null, aggregateBudgetVerified: false, paymentVerified: false,
    }, replayed: false });
    const wrapper = mount(DeliveryOperationsPanel, { props: { ...props, shippingFee: 101, audience: 'manager' } });
    await flushPromises();
    await wrapper.get('select').setValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await wrapper.findAll('button').find(button => button.text() === 'Đối chiếu trạng thái đã có')?.trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="positive-actual-fee"]').setValue('100');
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['actual'], 'actual.png', { type: 'image/png' })] });
    await input.trigger('change');
    await wrapper.findAll('button').find(button => button.text() === 'Ghi nhận phí thực tế')?.trigger('click');
    await flushPromises();
    expect(upload).toHaveBeenCalledWith(requestId, expect.objectContaining({ purpose: 'ACTUAL', quoteVersion: 1 }));
    expect(actualCall).toHaveBeenCalledWith(requestId, expect.objectContaining({
      expectedVersion: 1, quoteVersion: 1, totalShippingFee: 100, evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    }));
    expect(wrapper.text()).toContain('Đã đủ điều kiện ghi nhận giao nhận vật lý.');
    wrapper.unmount();
  });
});
