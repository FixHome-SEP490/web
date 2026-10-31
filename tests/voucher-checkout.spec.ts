import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import VoucherCheckoutChooser from '../src/components/vouchers/VoucherCheckoutChooser.vue';
import apiClient from '../src/api/client';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';
vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() }, registerAuthSessionInvalidator: vi.fn(), registerTokenRefreshed: vi.fn() }));

const walletClaim = {
  id: 'claim-1', campaignId: 'campaign-1', status: 'CLAIMED', redeemedAt: null,
  policySnapshot: { discount: 'FIXED', value: 50000, capVnd: null, minimumVnd: 100000, categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] },
  campaign: { code: 'FIX50', name: 'Ưu đãi cá nhân', kind: 'PERSONAL', active: true, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z' },
};

function signIn() {
  const auth = useAuthStore();
  auth.setAuth('test-session', { id: 'customer-1', role: UserRole.CUSTOMER } as Parameters<ReturnType<typeof useAuthStore>['setAuth']>[1]);
  return auth;
}

function mountChooser(pinia: ReturnType<typeof createPinia>) {
  return mount(VoucherCheckoutChooser, {
    global: { plugins: [pinia], stubs: { RouterLink: true, Teleport: true } },
  });
}

describe('checkout voucher boundary', () => {
  it('reads owned vouchers on demand but never applies a discount while finance is unavailable', async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    signIn();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: [walletClaim] } });
    const wrapper = mountChooser(pinia);
    expect(apiClient.get).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/wallet');
    expect(wrapper.find('[data-testid="voucher-selection-sheet"]').exists()).toBe(true);

    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    expect(wrapper.get('[data-testid="voucher-selection-selected"]').text()).toContain('Ưu đãi cá nhân');
    const apply = wrapper.get('[data-testid="checkout-voucher-apply"]');
    expect(apply.attributes('disabled')).toBeDefined();
    await apply.trigger('click');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Áp dụng ưu đãi khi thanh toán chưa khả dụng');
    expect(wrapper.text()).toContain('Chưa áp dụng giảm giá');
    expect(wrapper.text()).not.toContain('Đã áp dụng');

    await wrapper.get('[data-testid="voucher-selection-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="voucher-selection-sheet"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the offline state without calling the wallet endpoint', async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    signIn();
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    vi.mocked(apiClient.get).mockClear();
    vi.mocked(apiClient.post).mockClear();
    const wrapper = mountChooser(pinia);
    try {
      await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
      await flushPromises();
      expect(apiClient.get).not.toHaveBeenCalled();
      const sheet = wrapper.get('[data-testid="voucher-selection-sheet"]');
      expect(sheet.text()).toContain('Đang ngoại tuyến');
      expect(sheet.text()).toContain('Chưa có voucher nào được giữ chỗ hoặc áp dụng.');
      expect(apiClient.post).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      online.mockRestore();
    }
  });
});
