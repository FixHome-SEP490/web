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
import { authApi } from '../src/api/auth.api';
import { queryClient } from '../src/lib/query-client';
import { installQueryClient } from './support/query-client';
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
    expect(wrapper.find('[data-testid="voucher-selection-sheet"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Voucher đã được giữ chỗ');
    uuid.mockRestore();
    wrapper.unmount();
  });

  it('retains the hold without automatic release when checkout scope changes', async () => {
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
      } } });
    const wrapper = mountChooser(pinia, oldScope);
    await flushPromises();
    await wrapper.get('[data-testid="voucher-selection-option"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="checkout-voucher-apply"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="checkout-voucher-preview"]').attributes('data-scope-id')).toBe(oldScope);

    await wrapper.setProps({ scopeId: nextScope });
    await flushPromises();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('released')).toBeUndefined();
    expect(wrapper.find('[data-testid="checkout-voucher-preview"]').exists()).toBe(false);
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

it('reopen after an uncertain reserve keeps claim and attempt, never releases or settles', async () => {
 vi.clearAllMocks();
 const pinia = createPinia(); setActivePinia(pinia); signIn();
 const claimId = '22222222-2222-4222-8222-222222222222'; const scope = '33333333-3333-4333-8333-333333333333';
 vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({ data: { success: true, data: path === '/vouchers/wallet' ? [{ ...walletClaim, id: claimId }] : preview(claimId, scope, 250000, 50000, true) } }) as never);
 vi.mocked(apiClient.post).mockRejectedValue(new Error('uncertain'));
 const w = mountChooser(pinia, scope); await flushPromises();
 await w.get('[data-testid="voucher-selection-option"]').trigger('click'); await flushPromises();
 await w.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises();
 await w.get('[data-testid="voucher-selection-close"]').trigger('click');
 await w.get('[data-testid="open-voucher-chooser"]').trigger('click'); await flushPromises();
 expect(w.get('[data-testid="voucher-selection-option"]').attributes('aria-pressed')).toBe('true');
 await w.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises();
 expect(apiClient.post).toHaveBeenCalledTimes(2); expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
 w.unmount();
});

it('remount after an uncertain reserve reconciles with the same attempt id', async () => {
 vi.clearAllMocks();
 const pinia = createPinia(); setActivePinia(pinia); signIn();
 const claimId = '22222222-2222-4222-8222-222222222222'; const scope = '33333333-3333-4333-8333-333333333333';
 vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({ data: { success: true, data: path === '/vouchers/wallet' ? [{ ...walletClaim, id: claimId }] : preview(claimId, scope, 250000, 50000, true) } }) as never);
 vi.mocked(apiClient.post).mockRejectedValue(new Error('uncertain'));
 const w = mountChooser(pinia, scope); await flushPromises();
 await w.get('[data-testid="voucher-selection-option"]').trigger('click'); await flushPromises();
 await w.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises(); w.unmount();
 const again = mountChooser(pinia, scope); await flushPromises();
 expect(again.get('[data-testid="voucher-selection-option"]').attributes('aria-pressed')).toBe('true');
 await again.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises();
 expect(apiClient.post).toHaveBeenCalledTimes(2); expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
 again.unmount();
});

it('checks the same held attempt and only forgets it after server EXPIRED, never releases or pays', async () => {
 vi.clearAllMocks();
 const pinia = createPinia(); setActivePinia(pinia); signIn();
 const claimId = '22222222-2222-4222-8222-222222222222'; const scope = '33333333-3333-4333-8333-333333333333';
 vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({ data: { success: true, data: path === '/vouchers/wallet' ? [{ ...walletClaim, id: claimId }] : preview(claimId, scope, 250000, 50000, true) } }) as never);
 let state = 'RESERVED';
 vi.mocked(apiClient.post).mockImplementation(async (_path, body) => ({ headers: { date: 'Tue, 01 Jan 2030 00:20:00 GMT' }, data: { success: true, data: { ...body, id: '55555555-5555-4555-8555-555555555555', state, reservedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:15:00Z' } } }));
 const w = mountChooser(pinia, scope); await flushPromises();
 await w.get('[data-testid="voucher-selection-option"]').trigger('click'); await flushPromises();
 await w.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises();
 expect(w.emitted('applied')).toHaveLength(1);
 await w.get('[data-testid="checkout-voucher-reconcile"]').trigger('click'); await flushPromises();
 expect(w.emitted('expired')).toBeUndefined();
 expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
 state = 'EXPIRED';
 await w.get('[data-testid="checkout-voucher-reconcile"]').trigger('click'); await flushPromises();
 expect(w.emitted('expired')).toHaveLength(1);
 expect(vi.mocked(apiClient.post).mock.calls[2]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
 expect(vi.mocked(apiClient.post).mock.calls.every(([path]) => path === '/vouchers/apply')).toBe(true);
 w.unmount();
});

describe('ambiguous reservation recovery after quota was consumed', () => {
  const claimId = '22222222-2222-4222-8222-222222222222';
  const scopeId = '33333333-3333-4333-8333-333333333333';
  const heldId = '55555555-5555-4555-8555-555555555555';

  async function loseSuccessfulReservation(previewAfter: 'ineligible' | '409') {
    vi.clearAllMocks();
    installQueryClient(queryClient);
    const pinia = createPinia(); setActivePinia(pinia); const auth = signIn();
    let held: Record<string, unknown> | null = null;
    const originalPreview = preview(claimId, scopeId, 250000, 50000, true);
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === '/vouchers/wallet') return { data: { success: true, data: [{ ...walletClaim, id: claimId }] } };
      if (held && previewAfter === '409') throw { response: { status: 409 } };
      return { data: { success: true, data: held ? preview(claimId, scopeId) : originalPreview } };
    });
    vi.mocked(apiClient.post).mockImplementation(async (path, body) => {
      expect(path).toBe('/vouchers/apply');
      if (!held) {
        held = { ...body, id: heldId, state: 'RESERVED', reservedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:15:00Z' };
        throw { code: 'ECONNABORTED' }; // Server committed; its response was lost.
      }
      expect(body).toEqual({ claimId, scopeId, attemptId: held.attemptId });
      return { data: { success: true, data: held } };
    });
    const first = mountChooser(pinia, scopeId); await flushPromises();
    await first.get('[data-testid="voucher-selection-option"]').trigger('click'); await flushPromises();
    await first.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises();
    expect(first.emitted('applied')).toBeUndefined();
    first.unmount();
    return { pinia, auth, originalPreview };
  }

  it.each(['ineligible', '409'] as const)('replays the original identity after remount despite a new %s preview', async outcome => {
    const { pinia, originalPreview } = await loseSuccessfulReservation(outcome);
    const again = mountChooser(pinia, scopeId);
    try {
      await flushPromises();
      const retry = again.get('[data-testid="voucher-selection-apply"]');
      expect(retry.attributes('disabled')).toBeUndefined();
      expect(again.get('[data-testid="voucher-selection-option"]').attributes('disabled')).toBeDefined();
      again.getComponent(VoucherSelectionSheet).vm.$emit('select', 'another-claim');
      await nextTick();
      expect(again.get('[data-voucher-id="' + claimId + '"]').attributes('aria-pressed')).toBe('true');
      await retry.trigger('click'); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
      expect(again.emitted('applied')?.[0]?.[0]).toMatchObject({ reservation: { id: heldId }, preview: originalPreview });
      expect(again.emitted('released')).toBeUndefined();
    } finally { again.unmount(); }
  });

  it('cannot replay the saved attempt for another scope or owner, or after logout', async () => {
    const { pinia, auth } = await loseSuccessfulReservation('409');
    const again = mountChooser(pinia, scopeId);
    try {
      await flushPromises();
      await again.setProps({ scopeId: '66666666-6666-4666-8666-666666666666' }); await flushPromises();
      await again.get('[data-testid="checkout-voucher-apply"]').trigger('click');
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      await again.setProps({ scopeId }); await flushPromises();
      expect(again.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeUndefined();
      auth.setAuth('another-test-session', { id: 'customer-2', role: UserRole.CUSTOMER } as Parameters<typeof auth.setAuth>[1]);
      await flushPromises();
      again.getComponent(VoucherSelectionSheet).vm.$emit('apply'); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      const otherOwner = mountChooser(pinia, scopeId);
      try {
        await flushPromises();
        expect(otherOwner.getComponent(VoucherSelectionSheet).props('selectedId')).toBe('');
        otherOwner.getComponent(VoucherSelectionSheet).vm.$emit('apply'); await flushPromises();
        expect(apiClient.post).toHaveBeenCalledTimes(1);
      } finally { otherOwner.unmount(); }
      const logout = vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
      await auth.logout(); logout.mockRestore(); await flushPromises();
      again.getComponent(VoucherSelectionSheet).vm.$emit('apply'); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(again.emitted('applied')).toBeUndefined();
      signIn();
      const signedInAgain = mountChooser(pinia, scopeId);
      try {
        await flushPromises();
        expect(signedInAgain.getComponent(VoucherSelectionSheet).props('selectedId')).toBe('');
        signedInAgain.getComponent(VoucherSelectionSheet).vm.$emit('apply'); await flushPromises();
        expect(apiClient.post).toHaveBeenCalledTimes(1);
      } finally { signedInAgain.unmount(); }
    } finally { again.unmount(); }
  });
});

describe('terminal voucher recovery and scoped in-flight attempts', () => {
  const claimId = '22222222-2222-4222-8222-222222222222';
  const scopeA = '33333333-3333-4333-8333-333333333333';
  const scopeB = '66666666-6666-4666-8666-666666666666';
  const id = '55555555-5555-4555-8555-555555555555';
  function setup() {
    vi.clearAllMocks(); installQueryClient(queryClient);
    const pinia = createPinia(); setActivePinia(pinia); signIn();
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => ({ data: { success: true, data:
      path === '/vouchers/wallet' ? [{ ...walletClaim, id: claimId }] : preview(claimId, path.endsWith(scopeB) ? scopeB : scopeA, 250000, 50000, true) } }));
    return pinia;
  }
  const receipt = (scopeId: string, attemptId: string, state = 'RESERVED') => ({ id, claimId, scopeId, attemptId, state,
    reservedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-01T00:15:00Z' });
  async function start(w: ReturnType<typeof mountChooser>) {
    await flushPromises();
    await w.get('[data-testid="voucher-selection-option"]').trigger('click'); await flushPromises();
    await w.get('[data-testid="voucher-selection-apply"]').trigger('click');
  }
  it.each(['EXPIRED', 'RELEASED'])('forgets %s only on authoritative receipt and never automatically reserves again', async state => {
    const pinia = setup();
    vi.mocked(apiClient.post).mockImplementation(async (_path, body) => ({ data: { success: true, data: receipt(body.scopeId, body.attemptId, state) } }));
    const w = mountChooser(pinia, scopeA);
    try {
      await start(w); await flushPromises();
      expect(w.emitted(state === 'EXPIRED' ? 'expired' : 'released')).toHaveLength(1);
      expect(queryClient.getQueryData(['voucher-attempts', 'customer-1', scopeA])).toBeUndefined();
      expect(w.emitted('applied')).toBeUndefined();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(w.get('[data-testid="voucher-selection-option"]').attributes('disabled')).toBeUndefined();
      expect(w.get('[data-testid="voucher-selection-apply"]').attributes('disabled')).toBeUndefined();
    } finally { w.unmount(); }
  });
  it.each(['REDEEMED', 'REFUNDED'])('blocks %s across remount and asks parent to reconcile instead of retaining a hold or paying gross', async state => {
    const pinia = setup();
    vi.mocked(apiClient.post).mockImplementation(async (_path, body) => ({ data: { success: true, data: receipt(body.scopeId, body.attemptId, state) } }));
    const w = mountChooser(pinia, scopeA);
    await start(w); await flushPromises();
    expect(w.emitted('terminal')?.[0]?.[0]).toMatchObject({ state, scopeId: scopeA });
    expect(w.emitted('applied')).toBeUndefined();
    w.unmount();
    const again = mountChooser(pinia, scopeA);
    try {
      await flushPromises();
      expect(again.emitted('terminal')?.[0]?.[0]).toMatchObject({ state, scopeId: scopeA });
      expect(again.get('[data-testid="voucher-selection-apply"]').attributes('disabled')).toBeDefined();
      again.getComponent(VoucherSelectionSheet).vm.$emit('apply'); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(again.getComponent(VoucherSelectionSheet).props('serverReservation')).toBeNull();
      expect(again.text()).toContain('đối chiếu');
    } finally { again.unmount(); }
  });
  it('keeps A cached while B independently reserves, drops late A UI effects, and restores A on return', async () => {
    const pinia = setup();
    let finishA!: (value: unknown) => void;
    vi.mocked(apiClient.post).mockImplementation(async (_path, body) => {
      if (body.scopeId === scopeA) return await new Promise(resolve => { finishA = resolve; }) as never;
      return { data: { success: true, data: receipt(body.scopeId, body.attemptId) } };
    });
    const w = mountChooser(pinia, scopeA);
    try {
      await start(w);
      const originalA = vi.mocked(apiClient.post).mock.calls[0]![1];
      await w.setProps({ scopeId: scopeB }); await flushPromises();
      await start(w); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(w.emitted('applied')).toHaveLength(1);
      expect(w.emitted('applied')?.[0]?.[0]).toMatchObject({ reservation: { scopeId: scopeB } });
      finishA({ data: { success: true, data: receipt(scopeA, originalA.attemptId) } }); await flushPromises();
      expect(w.emitted('applied')).toHaveLength(1);
      await w.setProps({ scopeId: scopeA }); await flushPromises();
      expect(w.emitted('applied')?.at(-1)?.[0]).toMatchObject({ reservation: { scopeId: scopeA, attemptId: originalA.attemptId } });
      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(vi.mocked(apiClient.post).mock.calls.every(([path]) => path === '/vouchers/apply')).toBe(true);
    } finally { w.unmount(); }
  });

  it.each(['EXPIRED', 'RELEASED', 'REDEEMED', 'REFUNDED'])('reconciles an existing hold to %s without a new identity or money action', async state => {
    const pinia = setup(); let terminalState = 'RESERVED';
    vi.mocked(apiClient.post).mockImplementation(async (_path, body) => ({ data: { success: true, data: receipt(body.scopeId, body.attemptId, terminalState) } }));
    const w = mountChooser(pinia, scopeA);
    try {
      await start(w); await flushPromises(); terminalState = state;
      await w.get('[data-testid="checkout-voucher-reconcile"]').trigger('click'); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
      expect(w.emitted('applied')).toHaveLength(1);
      expect(w.emitted('terminal')?.at(-1)?.[0]).toMatchObject({ state, id, scopeId: scopeA });
      expect(w.getComponent(VoucherSelectionSheet).props('serverReservation')).toBeNull();
      if (state === 'REDEEMED' || state === 'REFUNDED') expect(w.get('[data-testid="checkout-voucher-apply"]').attributes('disabled')).toBeDefined();
      else expect(queryClient.getQueryData(['voucher-attempts', 'customer-1', scopeA])).toBeUndefined();
    } finally { w.unmount(); }
  });
  it.each(['EXPIRED', 'RELEASED', 'REDEEMED', 'REFUNDED'])('keeps a late %s for A out of B, then restores the correct A outcome', async state => {
    const pinia = setup(); let finishA!: (value: unknown) => void;
    vi.mocked(apiClient.post).mockImplementation(async () => await new Promise(resolve => { finishA = resolve; }) as never);
    const w = mountChooser(pinia, scopeA);
    try {
      await start(w); const body = vi.mocked(apiClient.post).mock.calls[0]![1];
      await w.setProps({ scopeId: scopeB }); await flushPromises();
      finishA({ data: { success: true, data: receipt(scopeA, body.attemptId, state) } }); await flushPromises();
      expect(w.emitted('terminal')).toBeUndefined(); expect(w.emitted('applied')).toBeUndefined();
      await w.setProps({ scopeId: scopeA }); await flushPromises();
      if (state === 'REDEEMED' || state === 'REFUNDED') {
        expect(w.emitted('terminal')?.at(-1)?.[0]).toMatchObject({ state, scopeId: scopeA });
        expect(w.get('[data-testid="voucher-selection-apply"]').attributes('disabled')).toBeDefined();
      } else expect(w.getComponent(VoucherSelectionSheet).props('selectedId')).toBe('');
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    } finally { w.unmount(); }
  });
  it('restores an uncertain A attempt after visiting B and replays its exact identity only on click', async () => {
    const pinia = setup(); vi.mocked(apiClient.post).mockRejectedValue({ code: 'ECONNABORTED' });
    const w = mountChooser(pinia, scopeA);
    try {
      await start(w); await flushPromises();
      await w.setProps({ scopeId: scopeB }); await flushPromises();
      expect(w.getComponent(VoucherSelectionSheet).props('selectedId')).toBe('');
      await w.setProps({ scopeId: scopeA }); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      await w.get('[data-testid="voucher-selection-apply"]').trigger('click'); await flushPromises();
      expect(apiClient.post).toHaveBeenCalledTimes(2);
      expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
    } finally { w.unmount(); }
  });

  it('does not issue a second A POST when switching back before its first response finishes', async () => {
    const pinia = setup(); let finish!: (value: unknown) => void;
    vi.mocked(apiClient.post).mockImplementation(async () => await new Promise(resolve => { finish = resolve; }) as never);
    const w = mountChooser(pinia, scopeA);
    try {
      await start(w); const body = vi.mocked(apiClient.post).mock.calls[0]![1];
      await w.setProps({ scopeId: scopeB }); await flushPromises();
      await w.setProps({ scopeId: scopeA }); await flushPromises();
      const retry = w.get('[data-testid="voucher-selection-apply"]');
      expect(retry.attributes('disabled')).toBeDefined();
      await retry.trigger('click'); expect(apiClient.post).toHaveBeenCalledTimes(1);
      finish({ data: { success: true, data: receipt(scopeA, body.attemptId) } }); await flushPromises();
      expect(w.emitted('applied')?.at(-1)?.[0]).toMatchObject({ reservation: { scopeId: scopeA, attemptId: body.attemptId } });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    } finally { w.unmount(); }
  });
});
