import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DeliveryTermsPanel from '../src/components/DeliveryTermsPanel.vue';
import { w3DeliveryTermsApi, type DeliveryTermsRead } from '../src/api/w3-delivery-terms.api';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fingerprint = 'a'.repeat(64);
const quote = { quoteVersion: 1, policyVersion: 'W3_70_30_V1' as const, totalShippingFee: 101,
  customerShippingShare: 71, technicianShippingShare: 30, fingerprint };
const terms = { version: 1, scope: 'CONDITIONAL_TERMS_ONLY' as const, quote, customerConsented: false,
  technicianConsented: false, actual: null, financialExecution: 'BLOCKED' as const, laborBudget: null,
  aggregateBudgetVerified: false as const, paymentVerified: false as const };
const projection: DeliveryTermsRead = { state: terms, invalidated: false, financialExecution: 'BLOCKED',
  laborBudget: null, aggregateBudgetVerified: false, recordedConditionalCeilings: { count: 1, shipping: '101', customer: '71', technician: '30' },
  blockers: ['COMMISSION_NOT_FROZEN', 'DEDUCTIONS_LEDGER_SOURCE_REQUIRED', 'SELLER_TAX_PAYMENT_POLICY_REQUIRED'] };
const props = { requestId, requestType: 'additional', fulfillmentMethod: 'delivery', shippingFee: 101,
  audience: 'customer' as const, sourceOwnerId: 'customer-1', technicianId: 'tech-1' };
function signIn(role: UserRole, id: string) {
  useAuthStore().setAuth('session', { id, role, email: 'fixture@example.test', fullName: 'Fixture', status: 'active' });
}
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('W3 conditional delivery terms panel', () => {
  it('renders server shares/totals and only the signed-in party consent control', async () => {
    signIn(UserRole.CUSTOMER, 'customer-1');
    const read = vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValueOnce(projection).mockResolvedValue({
      ...projection, state: { ...terms, version: 2, customerConsented: true },
      recordedConditionalCeilings: { count: 2, shipping: '202', customer: '142', technician: '60' },
    });
    const consent = vi.spyOn(w3DeliveryTermsApi, 'consent').mockResolvedValue({ state: { ...terms, version: 2, customerConsented: true }, replayed: false });
    const wrapper = mount(DeliveryTermsPanel, { props });
    await flushPromises();
    const text = wrapper.text().replace(/\s+/g, ' ');
    expect(text).toContain('Khách hàng chịu71 ₫');
    expect(text).toContain('Kỹ thuật viên chịu30 ₫');
    expect(text).toContain('Tổng điều khoản đã ghi nhận101 ₫');
    expect(wrapper.text()).toContain('Tài chính đang bị khóa');
    expect(wrapper.text()).not.toMatch(/đã thanh toán|đã chi trả|đã xuất kho/i);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-terms-consent"]').trigger('click');
    await flushPromises();
    expect(consent).toHaveBeenCalledWith(requestId, expect.objectContaining({
      expectedVersion: 1, quoteVersion: 1, quoteFingerprint: fingerprint, totalShippingFee: 101, shippingShare: 71,
    }), 71);
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Bạn đã đồng ý điều khoản giao hàng.');
    expect(wrapper.text()).toContain('202 ₫');
    wrapper.unmount();
  });

  it('does not read or expose controls when the source owner or request context mismatches', async () => {
    signIn(UserRole.CUSTOMER, 'other-customer');
    const read = vi.spyOn(w3DeliveryTermsApi, 'read');
    const wrapper = mount(DeliveryTermsPanel, { props });
    await flushPromises();
    expect(read).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delivery-terms-actions"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('allows a server quote below the approved shipping ceiling', async () => {
    signIn(UserRole.CUSTOMER, 'customer-1');
    vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValue(projection);
    const wrapper = mount(DeliveryTermsPanel, { props: { ...props, shippingFee: 150 } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('không khớp snapshot terms');
    expect(wrapper.find('[data-testid="delivery-terms-actions"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('fails closed when the quote exceeds the approved shipping ceiling', async () => {
    signIn(UserRole.CUSTOMER, 'customer-1');
    vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValue(projection);
    const wrapper = mount(DeliveryTermsPanel, { props: { ...props, shippingFee: 100 } });
    await flushPromises();
    expect(wrapper.text()).toContain('không khớp snapshot terms');
    expect(wrapper.find('[data-testid="delivery-terms-actions"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the UI read-only for the technician when consent is already recorded', async () => {
    signIn(UserRole.TECHNICIAN, 'tech-1');
    vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValue({ ...projection,
      state: { ...terms, customerConsented: true, technicianConsented: true } });
    const wrapper = mount(DeliveryTermsPanel, { props: { ...props, audience: 'technician' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Bạn đã đồng ý điều khoản giao hàng.');
    expect(wrapper.find('[data-testid="delivery-terms-consent"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('allows Technician consent when a one-dong quote assigns a zero share to the technician', async () => {
    signIn(UserRole.TECHNICIAN, 'tech-1');
    const oneDongQuote = { ...quote, totalShippingFee: 1, customerShippingShare: 1, technicianShippingShare: 0 };
    vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValue({ ...projection, state: { ...terms, quote: oneDongQuote } });
    const consent = vi.spyOn(w3DeliveryTermsApi, 'consent').mockResolvedValue({
      state: { ...terms, quote: oneDongQuote, version: 2, technicianConsented: true }, replayed: false,
    });
    const wrapper = mount(DeliveryTermsPanel, { props: { ...props, shippingFee: 1, audience: 'technician' } });
    await flushPromises();
    expect(wrapper.text()).toContain('kỹ thuật viên chịu: 0 ₫');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-terms-consent"]').trigger('click');
    await flushPromises();
    expect(consent).toHaveBeenCalledWith(requestId, expect.objectContaining({
      quoteVersion: 1, quoteFingerprint: fingerprint, totalShippingFee: 1, shippingShare: 0, accepted: true,
    }), 0);
    wrapper.unmount();
  });

  it('keeps the Service Manager view read-only and displays only backend totals', async () => {
    signIn(UserRole.SERVICE_MANAGER, 'manager-1');
    vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValue(projection);
    const consent = vi.spyOn(w3DeliveryTermsApi, 'consent');
    const wrapper = mount(DeliveryTermsPanel, { props: { ...props, audience: 'manager' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Điều khoản chỉ đọc.');
    expect(wrapper.find('[data-testid="delivery-terms-actions"]').exists()).toBe(false);
    expect(consent).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('hides stale consent after a conflict until a fresh read succeeds', async () => {
    signIn(UserRole.CUSTOMER, 'customer-1');
    const read = vi.spyOn(w3DeliveryTermsApi, 'read').mockResolvedValue(projection);
    vi.spyOn(w3DeliveryTermsApi, 'consent').mockRejectedValue({ response: { status: 409 } });
    const wrapper = mount(DeliveryTermsPanel, { props });
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="delivery-terms-consent"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Trạng thái đã thay đổi. Hãy tải lại trước khi tiếp tục.');
    expect(sessionStorage.length).toBe(0);
    expect(wrapper.find('[data-testid="delivery-terms-actions"]').exists()).toBe(false);
    await wrapper.get('[data-testid="delivery-terms-reload"]').trigger('click');
    await flushPromises();
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="delivery-terms-actions"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
