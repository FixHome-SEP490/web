import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { nextTick } from 'vue';
import { routeLocationKey, routerKey } from 'vue-router';
import VoucherCheckoutChooser from '../src/components/vouchers/VoucherCheckoutChooser.vue';
import VoucherSelectionSheet from '../src/components/vouchers/VoucherSelectionSheet.vue';
import apiClient from '../src/api/client';
import { vouchersApi } from '../src/api/vouchers.api';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';
vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() }, getHttpStatus: (error: { response?: { status?: number } }) => error?.response?.status, registerAuthSessionInvalidator: vi.fn(), registerTokenRefreshed: vi.fn() }));

const walletClaim = {
  id: 'claim-1', campaignId: 'campaign-1', status: 'CLAIMED', redeemedAt: null,
  policySnapshot: { discount: 'FIXED', value: 50000, capVnd: null, minimumVnd: 100000, categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] },
  campaign: { code: 'FIX50', name: 'Ưu đãi cá nhân', kind: 'PERSONAL', active: true, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z' },
};
const routeReplace = vi.fn();

function signIn() {
  const auth = useAuthStore();
  auth.setAuth('test-session', { id: 'customer-1', role: UserRole.CUSTOMER } as Parameters<ReturnType<typeof useAuthStore>['setAuth']>[1]);
  return auth;
}

function mountChooser(pinia: ReturnType<typeof createPinia>, scopeId: string | null = 'order-1', query: Record<string, unknown> = {}) {
  routeReplace.mockClear();
  return mount(VoucherCheckoutChooser, {
    props: { scopeId },
    global: {
      plugins: [pinia],
      provide: {
        [routeLocationKey]: reactive({ path: '/app/orders/order-1', fullPath: '/app/orders/order-1', hash: '', query }),
        [routerKey]: { replace: routeReplace },
      },
      stubs: {
        RouterLink: { props: ['to'], template: '<a data-testid="voucher-wallet-link" :data-return-to="to.query?.returnTo"><slot /></a>' },
        Teleport: true,
      },
    },
  });
}

const preview = (claimId: string, scopeId: string, originalGrossVnd = 250000, subsidy = 50000, paymentAvailable = false) => ({
  scopeId, claimId, previewOnly: true, paymentAvailable, reason: paymentAvailable ? null : 'VOUCHER_FUNDING_NOT_READY',
  originalGrossVnd, eligibleBaseVnd: 200000, fixHomeDiscountSubsidyVnd: subsidy,
  customerDueVnd: 200000, reasonCodes: ['DISCOUNT_APPLIED'],
});

describe('checkout voucher boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('accepts the public checkout preview DTO without internal finance fields', async () => {
    const dto = {
      scopeId: 'order-1', claimId: 'claim-1', previewOnly: true, paymentAvailable: false,
      reason: 'VOUCHER_FUNDING_NOT_READY', originalGrossVnd: 250000, eligibleBaseVnd: 200000,
      fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 200000, reasonCodes: ['DISCOUNT_APPLIED'],
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: dto } });
    await expect(vouchersApi.checkoutPreview('claim-1', 'order-1')).resolves.toEqual(dto);
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/checkout-preview/claim-1/order-1');
  });
  it('accepts only a server payment-available signal from checkout preview', async () => {
    const dto = { ...preview('claim-1', 'order-1', 250000, 50000, true) };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: dto } });
    await expect(vouchersApi.checkoutPreview('claim-1', 'order-1')).resolves.toEqual(dto);
  });
  it('accepts the Backend ready preview where reason is null and keeps money fields strict', async () => {
    const dto = {
      scopeId: 'order-1', claimId: 'claim-1', previewOnly: true, paymentAvailable: true,
      reason: null, originalGrossVnd: 250000, eligibleBaseVnd: 200000,
      fixHomeDiscountSubsidyVnd: 50000, customerDueVnd: 200000, reasonCodes: ['DISCOUNT_APPLIED'],
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: dto } });
    await expect(vouchersApi.checkoutPreview('claim-1', 'order-1')).resolves.toEqual(dto);

    vi.mocked(apiClient.get).mockResolvedValue({
      data: { success: true, data: { ...dto, customerDueVnd: '200000' } },
    });
    await expect(vouchersApi.checkoutPreview('claim-1', 'order-1')).rejects.toThrow();

    vi.mocked(apiClient.get).mockResolvedValue({
      data: { success: true, data: { ...dto, paymentAvailable: 'true' } },
    });
    await expect(vouchersApi.checkoutPreview('claim-1', 'order-1')).rejects.toThrow();

    const withoutReason = { ...dto };
    delete withoutReason.reason;
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: withoutReason } });
    await expect(vouchersApi.checkoutPreview('claim-1', 'order-1')).resolves.toEqual(withoutReason);
  });
  it('reads owned vouchers on demand but never applies a discount while finance is unavailable', async () => {
    const pinia = createPinia(); setActivePinia(pinia);
    signIn();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [walletClaim] : preview('claim-1', 'order-1') },
    }) as never);
    const wrapper = mountChooser(pinia);
    expect(apiClient.get).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/wallet');
    expect(wrapper.find('[data-testid="voucher-selection-sheet"]').exists()).toBe(true);

    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/checkout-preview/claim-1/order-1');
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').text()).toContain('Xem trước, chưa áp dụng');
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').text()).toContain('250.000');
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').text()).toContain('50.000');
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').text()).toContain('200.000');
    expect(wrapper.get('[data-testid="voucher-selection-selected"]').text()).toContain('Ưu đãi cá nhân');
    const apply = wrapper.get('[data-testid="checkout-voucher-apply"]');
    expect(apply.attributes('disabled')).toBeDefined();
    await apply.trigger('click');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Thanh toán voucher chưa sẵn sàng từ máy chủ');
    expect(wrapper.text()).toContain('Chưa áp dụng giảm giá');
    expect(wrapper.text()).not.toContain('Đã áp dụng');

    await wrapper.get('[data-testid="voucher-selection-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="voucher-selection-sheet"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('fails closed when scope is missing and does not request a preview', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [walletClaim] : preview('claim-1', 'order-1') },
    }) as never);
    const wrapper = mountChooser(pinia, null);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid="checkout-voucher-preview-state"]').text()).toContain('Chưa sẵn sàng');
    expect(wrapper.find('[data-testid="checkout-voucher-preview"]').exists()).toBe(false);
    expect(apiClient.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('reserves once the server enables checkout and retries with the same idempotency key', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    const claimId = '22222222-2222-4222-8222-222222222222';
    const scope = '33333333-3333-4333-8333-333333333333';
    const attemptId = '44444444-4444-4444-8444-444444444444';
    const reservationId = '55555555-5555-4555-8555-555555555555';
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(attemptId);
    const readyClaim = { ...walletClaim, id: claimId };
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [readyClaim] : preview(claimId, scope, 250000, 50000, true) },
    }) as never);
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { success: true, data: {
        id: reservationId, claimId, scopeId: scope, attemptId, state: 'RESERVED',
        reservedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:15:00.000Z',
      } } });
    const wrapper = mountChooser(pinia, scope);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Hãy thử lại');
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/vouchers/apply', { claimId, scopeId: scope, attemptId });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/vouchers/apply', { claimId, scopeId: scope, attemptId });
    expect(wrapper.emitted('applied')?.[0]?.[0]).toMatchObject({
      reservation: { id: reservationId, state: 'RESERVED', expiresAt: '2030-01-01T00:15:00.000Z' },
      preview: { customerDueVnd: 200000 },
    });
    uuid.mockRestore();
    wrapper.unmount();
  });

  it('returns a wallet-selected claim to the checkout chooser and requests its scoped preview', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [walletClaim] : preview('claim-1', 'order-1', 250000, 50000, true) },
    }) as never);
    const wrapper = mountChooser(pinia, 'order-1', { voucherClaimId: 'claim-1' });
    expect(wrapper.get('[data-testid="voucher-wallet-link"]').attributes('data-return-to')).toBe('/app/orders/order-1');
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-voucher-id="claim-1"]').attributes('aria-pressed')).toBe('true');
    expect(routeReplace).toHaveBeenCalledWith({ path: '/app/orders/order-1', query: {}, hash: '' });
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/checkout-preview/claim-1/order-1');
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').attributes('data-claim-id')).toBe('claim-1');
    wrapper.unmount();
  });

  it('shows the server price in the selection sheet and reserves only after its Apply confirmation', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    const claimId = '22222222-2222-4222-8222-222222222222';
    const scope = '33333333-3333-4333-8333-333333333333';
    const attemptId = '44444444-4444-4444-8444-444444444444';
    const reservationId = '55555555-5555-4555-8555-555555555555';
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(attemptId);
    const readyClaim = { ...walletClaim, id: claimId };
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [readyClaim] : preview(claimId, scope, 250000, 50000, true) },
    }) as never);
    let resolveReserve!: (value: unknown) => void;
    vi.mocked(apiClient.post).mockReturnValue(new Promise((resolve) => { resolveReserve = resolve; }) as never);
    const wrapper = mountChooser(pinia, scope);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();

    const sheet = wrapper.findComponent(VoucherSelectionSheet);
    expect(sheet.get('[data-testid="voucher-selection-preview"]').text()).toContain('200.000');
    const apply = sheet.get('[data-testid="voucher-selection-apply"]');
    expect(apply.attributes('disabled')).toBeUndefined();
    await apply.trigger('click');
    await apply.trigger('click');
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(sheet.get('[data-testid="voucher-selection-option"]').attributes('disabled')).toBeDefined();
    resolveReserve({ data: { success: true, data: {
      id: reservationId, claimId, scopeId: scope, attemptId, state: 'RESERVED',
      reservedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:15:00.000Z',
    } } });
    await flushPromises();
    await nextTick();

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/vouchers/apply', { claimId, scopeId: scope, attemptId });
    expect(wrapper.emitted('applied')).toHaveLength(1);
    expect(wrapper.findComponent(VoucherSelectionSheet).props('serverReservation')).toMatchObject({ voucherId: claimId });
    expect(sheet.text()).toContain('Voucher đã được giữ chỗ');
    uuid.mockRestore();
    wrapper.unmount();
  });

  it('releases a stale hold when the SOLO or VisitGroup checkout scope changes', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    const claimId = '22222222-2222-4222-8222-222222222222';
    const oldScope = '33333333-3333-4333-8333-333333333333';
    const nextScope = '66666666-6666-4666-8666-666666666666';
    const attemptId = '44444444-4444-4444-8444-444444444444';
    const reservationId = '55555555-5555-4555-8555-555555555555';
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(attemptId);
    const ownedClaim = { ...walletClaim, id: claimId };
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [ownedClaim] : preview(claimId, path.endsWith(nextScope) ? nextScope : oldScope, 250000, 50000, true) },
    }) as never);
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { success: true, data: {
        id: reservationId, claimId, scopeId: oldScope, attemptId, state: 'RESERVED',
        reservedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:15:00.000Z',
      } } })
      .mockResolvedValueOnce({ data: { success: true, data: { id: reservationId, state: 'RELEASED' } } });
    const wrapper = mountChooser(pinia, oldScope);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').attributes('data-scope-id')).toBe(oldScope);

    await wrapper.setProps({ scopeId: nextScope });
    await flushPromises();
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/vouchers/reservations/${reservationId}/release`);
    expect(wrapper.emitted('released')).toHaveLength(1);
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').attributes('data-scope-id')).toBe(nextScope);
    expect(wrapper.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not report an expired claim or wrong-role reservation as applied', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    const claimId = '22222222-2222-4222-8222-222222222222';
    const scope = '33333333-3333-4333-8333-333333333333';
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('44444444-4444-4444-8444-444444444444');
    const ownedClaim = { ...walletClaim, id: claimId };
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [ownedClaim] : preview(claimId, scope, 250000, 50000, true) },
    }) as never);
    const wrapper = mountChooser(pinia, scope);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 409 } });
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-apply-error"]').text()).toContain('đã hết hạn');
    expect(wrapper.emitted('applied')).toBeUndefined();

    await wrapper.get('[data-testid="checkout-voucher-preview-state"] button').trigger('click');
    await flushPromises();
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 403 } });
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-apply-error"]').text()).toContain('không có quyền');
    expect(wrapper.emitted('applied')).toBeUndefined();
    uuid.mockRestore();
    wrapper.unmount();
  });

  it.each([
    [400, 'không hợp lệ'],
    [401, 'Phiên đăng nhập'],
    [403, 'không thuộc tài khoản'],
    [404, 'không hợp lệ'],
    [409, 'không hợp lệ'],
    [503, 'tạm thời chưa sẵn sàng'],
  ])('shows a safe preview error for HTTP %s without enabling apply', async (status, message) => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/vouchers/wallet') return { data: { success: true, data: [walletClaim] } };
      throw { response: { status } };
    });
    const wrapper = mountChooser(pinia);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-preview-state"]').text()).toContain(message);
    expect(wrapper.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeDefined();
    expect(apiClient.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([
    [401, 'Phiên đăng nhập'],
    [403, 'không có quyền'],
    [409, 'đã hết hạn'],
    [503, 'tạm thời chưa sẵn sàng'],
  ])('shows the reservation error for HTTP %s and never reports success', async (status, message) => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    const claimId = '22222222-2222-4222-8222-222222222222';
    const scope = '33333333-3333-4333-8333-333333333333';
    const ownedClaim = { ...walletClaim, id: claimId };
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({
      data: { success: true, data: path === '/vouchers/wallet' ? [ownedClaim] : preview(claimId, scope, 250000, 50000, true) },
    }) as never);
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status } });
    const wrapper = mountChooser(pinia, scope);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-apply-error"]').text()).toContain(message);
    expect(wrapper.emitted('applied')).toBeUndefined();
    wrapper.unmount();
  });

  it('ignores an older preview response after the customer switches claims', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    let resolveFirst!: (value: unknown) => void;
    const secondClaim = { ...walletClaim, id: 'claim-2', campaignId: 'campaign-2', campaign: { ...walletClaim.campaign, code: 'FIX25', name: 'Ưu đãi khác' } };
    vi.mocked(apiClient.get).mockImplementation((path: string) => {
      if (path === '/vouchers/wallet') return Promise.resolve({ data: { success: true, data: [walletClaim, secondClaim] } }) as never;
      if (path.endsWith('/claim-1/order-1')) return new Promise((resolve) => { resolveFirst = resolve; }) as never;
      return Promise.resolve({ data: { success: true, data: preview('claim-2', 'order-1', 300000, 25000) } }) as never;
    });
    const wrapper = mountChooser(pinia);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    const options = wrapper.findAll('[data-testid="voucher-selection-option"]');
    await options[0]!.trigger('click');
    const firstRequest = flushPromises();
    await options[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').attributes('data-claim-id')).toBe('claim-2');
    resolveFirst({ data: { success: true, data: preview('claim-1', 'order-1') } });
    await firstRequest;
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').attributes('data-claim-id')).toBe('claim-2');
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').text()).toContain('300.000');
    wrapper.unmount();
  });

  it('shows an offline preview state when the server request loses connectivity', async () => {
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/vouchers/wallet') return { data: { success: true, data: [walletClaim] } };
      throw { code: 'ERR_NETWORK' };
    });
    const wrapper = mountChooser(pinia);
    await wrapper.get('[data-testid="open-voucher-chooser"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-preview-state"]').text()).toContain('Đang ngoại tuyến');
    expect(wrapper.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeDefined();
    expect(apiClient.post).not.toHaveBeenCalled();
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
