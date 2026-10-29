import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { routeLocationKey, routerKey } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/client';
import CustomerVouchersPage from '../src/pages/customer/CustomerVouchersPage.vue';
import ConsoleVouchersPage from '../src/pages/console/ConsoleVouchersPage.vue';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getHttpStatus: (e: { response?: { status: number } }) => e?.response?.status,
  registerAuthSessionInvalidator: vi.fn(), registerTokenRefreshed: vi.fn(),
}));

const policy = { discount: 'PERCENT', value: 15, capVnd: 90000, minimumVnd: 200000,
  categoryIds: [], serviceIds: [], components: ['LABOR', 'PARTS'] };
const campaign = { id: '35acbd0e-e3c0-4f57-a691-1836b32b64a9', code: 'FIXHOME15', name: 'Chăm sóc thiết bị',
  kind: 'GENERAL', policy, startsAt: '2026-10-01T00:00:00+07:00', endsAt: '2026-11-30T23:59:59+07:00',
  active: true, quota: 100, redeemed: 7 };
const claim = { id: '049e921e-84e2-4bfa-8ac4-02cd254eb403', campaignId: campaign.id,
  status: 'CLAIMED', redeemedAt: null, policySnapshot: policy,
  campaign: { code: campaign.code, name: campaign.name, kind: campaign.kind,
    startsAt: campaign.startsAt, endsAt: campaign.endsAt, active: true } };
const response = (data: unknown) => ({ data: { success: true, statusCode: 200, message: 'Success', data } });

function mountWalletPage(pinia: ReturnType<typeof createPinia>, returnTo?: string) {
  const currentRoute = reactive({ fullPath: '/app/vouchers', query: returnTo ? { returnTo } : {} });
  const router = {
    resolve: vi.fn((value: string) => {
      const target = new URL(value, 'https://fixhome.test');
      const name = target.pathname.startsWith('/app/orders/') ? 'customer-order-detail'
        : target.pathname.startsWith('/app/visits/') ? 'customer-visit' : 'not-found';
      return { name, path: target.pathname, query: Object.fromEntries(target.searchParams), hash: target.hash };
    }),
    push: vi.fn(),
  };
  const wrapper = mount(CustomerVouchersPage, {
    global: {
      plugins: [pinia],
      provide: { [routeLocationKey]: currentRoute, [routerKey]: router },
    },
  });
  return { wrapper, router };
}

function session(role = UserRole.CUSTOMER, id = 'customer-1') {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth('test-session', { id, role, fullName: 'Khách kiểm thử' } as Parameters<ReturnType<typeof useAuthStore>['setAuth']>[1]);
  return pinia;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiClient.get).mockImplementation(async url => {
    if (url === '/vouchers/wallet') return response([claim]);
    if (url === '/vouchers/general') return response([]);
    if (url === '/vouchers/campaigns') return response([campaign]);
    if (url === '/admin/categories') return response([]);
    if (url === '/admin/services') return { data: { ...response([]).data, meta: { page: 1, limit: 100, total: 0, totalPages: 0 } } };
    throw new Error('Unexpected read');
  });
});

describe('authenticated voucher pages', () => {
  it('reads the owned wallet without fabricating quota or eligibility from CLAIMED', async () => {
    const { wrapper } = mountWalletPage(session());
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledWith('/vouchers/wallet');
    expect(wrapper.text()).toContain('Chăm sóc thiết bị');
    expect(wrapper.text()).toContain('Giảm 15%');
    expect(wrapper.text()).not.toContain('100 lượt');
    expect(wrapper.text()).not.toContain('Đang hoạt động');
    wrapper.unmount();
  });

  it('claims a normalized manual code once and waits for the server before showing success', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(apiClient.post).mockReturnValue(new Promise(r => { resolve = r; }));
    const { wrapper } = mountWalletPage(session());
    await flushPromises();
    await wrapper.get('input[aria-label="Mã ưu đãi"]').setValue(' fixhome15 ');
    const button = wrapper.get('button[aria-label="Lưu mã vào ví"]');
    await button.trigger('click');
    await button.trigger('click');
    expect(apiClient.post).toHaveBeenCalledExactlyOnceWith('/vouchers/claim', { code: 'FIXHOME15' });
    expect(wrapper.text()).not.toContain('Đã lưu mã ưu đãi vào ví.');
    expect(button.attributes('disabled')).toBeDefined();
    resolve(response(claim));
    await flushPromises();
    expect(wrapper.text()).toContain('Đã lưu mã ưu đãi vào ví.');
    wrapper.unmount();
  });

  it('does not let a late wallet response populate a different account', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(apiClient.get).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const pinia = session();
    const { wrapper } = mountWalletPage(pinia);
    useAuthStore().user = null;
    await flushPromises();
    resolve(response([claim]));
    await flushPromises();
    expect(wrapper.text()).not.toContain('Chăm sóc thiết bị');
    expect(wrapper.text()).toContain('Đăng nhập');
    wrapper.unmount();
  });

  it('shows a recoverable load error and never converts it to an empty wallet', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce({ response: { status: 503 } });
    const { wrapper } = mountWalletPage(session());
    await flushPromises();
    expect(wrapper.text()).not.toContain('Ví ưu đãi của bạn đang trống');
    await wrapper.get('button[aria-label="Thử lại"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Chăm sóc thiết bị');
    wrapper.unmount();
  });

  it('denies non-admin access without making a campaign request', async () => {
    const wrapper = mount(ConsoleVouchersPage, { global: { plugins: [session(UserRole.SERVICE_MANAGER)] } });
    await flushPromises();
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Quản trị viên');
    wrapper.unmount();
  });

  it('discovers server-filtered general offers and claims their code without needing a quota counter', async () => {
    vi.mocked(apiClient.get).mockImplementation(async url => url === '/vouchers/general'
      ? response([{ id: campaign.id, code: 'GENERAL20', name: 'Chăm sóc định kỳ', policy, startsAt: campaign.startsAt, endsAt: campaign.endsAt }])
      : response([claim]));
    vi.mocked(apiClient.post).mockResolvedValue(response({ ...claim, campaign: { ...claim.campaign, code: 'GENERAL20' } }));
    const { wrapper } = mountWalletPage(session());
    await flushPromises();
    await wrapper.get('[data-voucher-tab="general"]').trigger('click');
    expect(wrapper.text()).toContain('Chăm sóc định kỳ');
    const button = wrapper.get('button[aria-label="Lưu vào ví"]');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    expect(apiClient.post).toHaveBeenCalledWith('/vouchers/claim', { code: 'GENERAL20' });
    wrapper.unmount();
  });

  it('returns an owned wallet voucher to the originating SOLO checkout with its claim id', async () => {
    const { wrapper, router } = mountWalletPage(session(), '/app/orders/order-42?step=payment');
    await flushPromises();
    const returnPanel = wrapper.get('[data-testid="voucher-return-to-checkout"]');
    await returnPanel.get('button').trigger('click');
    expect(router.push).toHaveBeenCalledWith({
      path: '/app/orders/order-42',
      query: { step: 'payment', voucherClaimId: claim.id },
      hash: '',
    });
    wrapper.unmount();
  });

  it('returns a newly claimed GENERAL campaign to the originating VisitGroup checkout', async () => {
    vi.mocked(apiClient.get).mockImplementation(async url => url === '/vouchers/general'
      ? response([{ id: campaign.id, code: 'GENERAL20', name: 'Ưu đãi chung', policy, startsAt: campaign.startsAt, endsAt: campaign.endsAt }])
      : response([claim]));
    vi.mocked(apiClient.post).mockResolvedValue(response({
      ...claim,
      id: '88564cbc-edab-4ad7-b706-ed077904a0d2',
      campaign: { ...claim.campaign, code: 'GENERAL20', kind: 'GENERAL' },
    }));
    const { wrapper, router } = mountWalletPage(session(), '/app/visits/visit-78?tab=checkout');
    await flushPromises();
    await wrapper.get('[data-voucher-tab="general"]').trigger('click');
    await wrapper.get('button[aria-label="Lưu vào ví"]').trigger('click');
    await flushPromises();
    expect(router.push).toHaveBeenCalledWith({
      path: '/app/visits/visit-78',
      query: { tab: 'checkout', voucherClaimId: '88564cbc-edab-4ad7-b706-ed077904a0d2' },
      hash: '',
    });
    wrapper.unmount();
  });

  it('rejects external and non-checkout return paths', async () => {
    const external = mountWalletPage(session(), 'https://evil.example/app/orders/order-42');
    await flushPromises();
    expect(external.wrapper.find('[data-testid="voucher-return-to-checkout"]').exists()).toBe(false);
    external.wrapper.unmount();

    const admin = mountWalletPage(session(), '/app/admin/vouchers');
    await flushPromises();
    expect(admin.wrapper.find('[data-testid="voucher-return-to-checkout"]').exists()).toBe(false);
    admin.wrapper.unmount();
  });

  it('displays persisted successful quota progress and toggles status through the real contract', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(response({ ...campaign, active: false }));
    const wrapper = mount(ConsoleVouchersPage, { global: { plugins: [session(UserRole.ADMIN)] } });
    await flushPromises();
    expect(wrapper.text()).toContain('7 / 100');
    expect(wrapper.text()).not.toContain('93 lượt còn lại');
    await wrapper.get('button[aria-label="Tạm dừng Chăm sóc thiết bị"]').trigger('click');
    await flushPromises();
    expect(apiClient.patch).toHaveBeenCalledWith(`/vouchers/campaigns/${campaign.id}/status`, { active: false });
    expect(wrapper.text()).toContain('Tạm dừng');
    wrapper.unmount();
  });

  it('grants a personal voucher using a stable idempotency identity after an uncertain response', async () => {
    const personal = { ...campaign, kind: 'PERSONAL' };
    vi.mocked(apiClient.get).mockImplementation(async url => {
      if (url === '/vouchers/campaigns') return response([personal]);
      if (url === '/admin/users') return { data: { ...response([{ id: '71617cef-41b7-40bb-81c8-d6ad64b022ac', fullName: 'Khách nhận ưu đãi', email: 'customer@example.test', phoneNumber: null, role: 'customer', status: 'active', isActive: true, createdAt: campaign.startsAt, updatedAt: campaign.startsAt }]).data, meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } };
      return { data: { ...response([]).data, meta: { page: 1, limit: 100, total: 0, totalPages: 0 } } };
    });
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce(response({ ...claim, campaign: { ...claim.campaign, kind: 'PERSONAL' } }));
    const wrapper = mount(ConsoleVouchersPage, { global: { plugins: [session(UserRole.ADMIN)] } });
    await flushPromises();
    await wrapper.get('[data-console-voucher-tab="compensation"]').trigger('click');
    await wrapper.get('#voucher-grant-campaign').setValue(campaign.id);
    await wrapper.get('#voucher-grant-search').setValue('Khách');
    await wrapper.get('[data-testid="voucher-customer-search"]').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-testid="voucher-grant-customer"]').trigger('click');
    await wrapper.get('[data-testid="voucher-grant-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).not.toContain('Đã cấp voucher cá nhân.');
    await wrapper.get('[data-testid="voucher-grant-form"]').trigger('submit');
    await flushPromises();
    const [first, retry] = vi.mocked(apiClient.post).mock.calls;
    expect(first[0]).toBe(`/vouchers/campaigns/${campaign.id}/grants`);
    expect(first[1]).toEqual({ customerId: '71617cef-41b7-40bb-81c8-d6ad64b022ac', grantId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(retry).toEqual(first);
    expect(wrapper.text()).toContain('Đã cấp voucher cá nhân.');
    wrapper.unmount();
  });
});
