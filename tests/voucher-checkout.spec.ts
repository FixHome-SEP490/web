import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import VoucherCheckoutChooser from '../src/components/vouchers/VoucherCheckoutChooser.vue';
import apiClient from '../src/api/client';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';
vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() }, registerAuthSessionInvalidator: vi.fn(), registerTokenRefreshed: vi.fn() }));

describe('checkout voucher boundary', () => {
  it('reads owned vouchers on demand but never applies a discount while finance is unavailable', async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    useAuthStore().setAuth('test-session', { id: 'customer-1', role: UserRole.CUSTOMER } as Parameters<ReturnType<typeof useAuthStore>['setAuth']>[1]);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: [{
      id: 'claim-1', campaignId: 'campaign-1', status: 'CLAIMED', redeemedAt: null,
      policySnapshot: { discount: 'FIXED', value: 50000, capVnd: null, minimumVnd: 100000, categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] },
      campaign: { code: 'FIX50', name: 'Ưu đãi cá nhân', kind: 'PERSONAL', active: true, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z' },
    }] } });
    const wrapper = mount(VoucherCheckoutChooser, { global: { plugins: [pinia], stubs: { RouterLink: true } } });
    expect(apiClient.get).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/wallet');
    await wrapper.get('[data-testid="checkout-voucher-option"]').trigger('click');
    const apply = wrapper.get('[data-testid="checkout-voucher-apply"]');
    expect(apply.attributes('disabled')).toBeDefined();
    await apply.trigger('click');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Áp dụng ưu đãi khi thanh toán chưa khả dụng');
    expect(wrapper.text()).not.toContain('Đã áp dụng');
    wrapper.unmount();
  });
});
