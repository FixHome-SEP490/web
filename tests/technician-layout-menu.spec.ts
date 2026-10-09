import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

/**
 * The technician shell lists each destination once: the sidebar on wide screens,
 * the bottom tabs on phones, and the avatar menu only for what the tabs lack.
 */

const { route, push, toast, wallet, profileApi } = vi.hoisted(() => ({
  route: { meta: {} as Record<string, unknown> },
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  wallet: { balance: 500000, minimumBalance: 200000, eligibleForJobs: true },
  profileApi: { getMyProfile: vi.fn(), updateMyProfile: vi.fn(), reportLocation: vi.fn() },
}));

// The template's <img src="/logo.png"> becomes an import under Vite.
vi.mock('/logo.png', () => ({ default: '/logo.png' }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push }) }));
vi.mock('vue-sonner', () => ({ toast }));
vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({ user: { fullName: 'Phạm Đức Toàn', avatarUrl: null }, logout: vi.fn() }),
}));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({ initSocket: vi.fn(), totalUnreadCount: 0 }),
}));
vi.mock('../src/stores/call.store', () => ({ useCallStore: () => ({ initCallSignalling: vi.fn() }) }));
vi.mock('../src/api/orders.api', () => ({ ordersApi: { getTechnicianJobs: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { getMyInvitations: vi.fn().mockResolvedValue([]) } }));
vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi: profileApi }));
vi.mock('../src/api/technician-onboarding.api', () => ({
  technicianOnboardingApi: { getStatus: vi.fn().mockResolvedValue({ onboardingStatus: 'approved', verificationStatus: 'verified' }) },
}));
vi.mock('../src/api/wallet.api', () => ({
  walletApi: { getMyWallet: vi.fn(async () => ({ ...wallet })) },
}));

import TechnicianLayout from '../src/layouts/TechnicianLayout.vue';

const RouterLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('a', { href: props.to }, slots.default?.());
  },
});

const stubs = {
  'router-link': RouterLink,
  RouterLink,
  'router-view': true,
  ChatFloatingWidget: true,
  CallOverlay: true,
  NotificationBellDropdown: true,
};

async function mountLayout() {
  const wrapper = mount(TechnicianLayout, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

const textOf = (wrapper: Awaited<ReturnType<typeof mountLayout>>, text: string) =>
  wrapper.findAll('a, button').filter((el) => el.text().trim() === text);

describe('TechnicianLayout menus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(wallet, { balance: 500000, eligibleForJobs: true });
    profileApi.getMyProfile.mockResolvedValue({ isAvailable: true });
    profileApi.updateMyProfile.mockResolvedValue({});
  });

  it('will not switch jobs on below the deposit floor and points to the wallet', async () => {
    Object.assign(wallet, { balance: 0, eligibleForJobs: false });
    profileApi.getMyProfile.mockResolvedValue({ isAvailable: false });
    const wrapper = await mountLayout();
    await wrapper.findAll('button').find((b) => b.text().includes('Tạm nghỉ'))!.trigger('click');
    await flushPromises();

    expect(profileApi.updateMyProfile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Ví chưa đủ mức ký quỹ để nhận việc', expect.objectContaining({ action: expect.objectContaining({ label: 'Nạp tiền' }) }));
    wrapper.unmount();
  });

  it('switches to a pause without any wallet check', async () => {
    Object.assign(wallet, { balance: 0, eligibleForJobs: false });
    const wrapper = await mountLayout();
    await wrapper.findAll('button').find((b) => b.text().includes('Đang nhận việc'))!.trigger('click');
    await flushPromises();

    expect(profileApi.updateMyProfile).toHaveBeenCalledWith({ isAvailable: false });
    wrapper.unmount();
  });

  it('has a single "Đăng xuất", in the avatar menu', async () => {
    const wrapper = await mountLayout();
    expect(textOf(wrapper, 'Đăng xuất')).toHaveLength(0);

    await wrapper.get('button[aria-label="Tài khoản"]').trigger('click');
    expect(textOf(wrapper, 'Đăng xuất')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not repeat the profile or messages in the avatar menu', async () => {
    const wrapper = await mountLayout();
    await wrapper.get('button[aria-label="Tài khoản"]').trigger('click');
    const menu = wrapper.get('.absolute.right-0.mt-2');

    expect(menu.text()).not.toContain('Hồ sơ & Kỹ năng');
    expect(menu.findAll('a[href="/tech/profile"]')).toHaveLength(0);
    expect(menu.findAll('a[href="/tech/messages"]')).toHaveLength(0);
    // Wallet, warranty and identity are only there for phones, where the tabs lack them.
    const phoneOnly = menu.get('.lg\\:hidden');
    expect(phoneOnly.findAll('a').map((a) => a.attributes('href'))).toEqual(['/tech/wallet', '/tech/warranty', '/tech/kyc']);
    expect(menu.text()).toContain('Ví của tôi');
    expect(menu.text()).not.toContain('Ví & Rút tiền');
    wrapper.unmount();
  });

  it('lifts the floating chat above the action bar only on pages that have one', async () => {
    route.meta = {};
    const plain = await mountLayout();
    expect(plain.get('div').classes()).toContain('[--fh-dock:5.25rem]');
    plain.unmount();

    route.meta = { actionBar: true };
    const withBar = await mountLayout();
    expect(withBar.get('div').classes()).toContain('[--fh-dock:10rem]');
    withBar.unmount();
    route.meta = {};
  });
});
