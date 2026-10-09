import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';

// PO 09/10/2026: one header pattern on public pages and in the customer area.
// The avatar opens account items only (never a list of services), repair history
// moves from the customer top bar into that menu, and the only role difference
// on public pages is the header button.
vi.mock('../src/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ initSocket: vi.fn(), totalUnreadCount: 0 }) }));
vi.mock('../src/stores/call.store', () => ({ useCallStore: () => ({ initCallSignalling: vi.fn() }) }));
const { stub } = vi.hoisted(() => ({
  stub: (id: string) => async () => {
    const { defineComponent, h } = await import('vue');
    return { default: defineComponent({ render: () => h('div', { 'data-testid': id }) }) };
  },
}));
vi.mock('../src/components/chat/CallOverlay.vue', stub('call-overlay'));
vi.mock('../src/components/chat/ChatFloatingWidget.vue', stub('chat-widget'));
vi.mock('../src/components/chat/AiAssistantWidget.vue', stub('ai-widget'));
vi.mock('../src/components/notifications/NotificationBellDropdown.vue', stub('bell'));

import PublicLayout from '../src/layouts/PublicLayout.vue';
import CustomerLayout from '../src/layouts/CustomerLayout.vue';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';
import { accountMenuLinks, roleAreaLink, roleHeaderAction } from '../src/utils/account-menu';

const SERVICE_WORDS = /Điện lạnh|Điện nước|Máy giặt|Dịch vụ|Cách hoạt động|Phân tích sự cố/;

async function mountAs(layout: 'public' | 'customer', role: UserRole | null) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  await router.push(layout === 'public' ? '/' : '/app');
  await router.isReady();
  if (role) {
    // The server sends roles in lower case.
    useAuthStore().setAuth('token', {
      id: 'u1',
      fullName: 'Người dùng kiểm thử',
      email: 'u@example.test',
      role: role.toLowerCase() as UserRole,
      status: 'ACTIVE',
    });
  }
  const wrapper = mount(layout === 'public' ? PublicLayout : CustomerLayout, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  await flushPromises();
  return { wrapper, router };
}

async function openAccountMenu(wrapper: Awaited<ReturnType<typeof mountAs>>['wrapper']) {
  await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click');
  return wrapper.get('[data-testid="account-menu"]');
}

describe('account menu items', () => {
  it.each(['CUSTOMER', 'TECHNICIAN', 'SERVICE_MANAGER', 'ADMIN'])('never lists services for %s', (role) => {
    for (const context of ['public', 'customer-app'] as const) {
      const links = accountMenuLinks(role, context);
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((link) => !link.to.startsWith('/services'))).toBe(true);
    }
  });

  it('gives guests nothing and accepts lower-case roles from the server', () => {
    expect(accountMenuLinks(null, 'public')).toEqual([]);
    expect(roleHeaderAction(null)).toBeNull();
    expect(roleAreaLink(undefined)).toBeNull();
    expect(roleHeaderAction('customer')).toEqual({ to: '/app/bookings/new', label: 'Đặt thợ ngay' });
  });

  it.each([
    ['CUSTOMER', '/app/bookings/new', 'Đặt thợ ngay', '/app/orders', 'Đơn của tôi'],
    ['TECHNICIAN', '/tech', 'Vào trang thợ', '/tech', 'Vào trang thợ'],
    ['SERVICE_MANAGER', '/console', 'Vào trang quản lý', '/console', 'Vào trang quản lý'],
    ['ADMIN', '/console', 'Vào trang quản lý', '/console', 'Vào trang quản lý'],
  ])('%s gets its own header button and area link', (role, actionTo, actionLabel, areaTo, areaLabel) => {
    expect(roleHeaderAction(role)).toEqual({ to: actionTo, label: actionLabel });
    expect(roleAreaLink(role)).toEqual({ to: areaTo, label: areaLabel });
  });

  it('keeps repair history in the customer menu in both headers', () => {
    expect(accountMenuLinks('CUSTOMER', 'public').map((l) => l.to)).toEqual([
      '/app/orders',
      '/app/history',
      '/app/wallet',
      '/app/profile',
    ]);
    const inApp = accountMenuLinks('CUSTOMER', 'customer-app');
    expect(inApp.map((l) => l.to)).toEqual([
      '/app/history',
      '/app/warranties',
      '/app/wallet',
      '/app/notifications',
      '/app/profile',
    ]);
    // Warranties is in the wide top bar already; the menu only carries it on narrow screens.
    expect(inApp.find((l) => l.to === '/app/warranties')?.hiddenOnWide).toBe(true);
    expect(inApp.find((l) => l.to === '/app/history')?.hiddenOnWide).toBeFalsy();
  });
});

describe('public header', () => {
  beforeEach(() => document.body.replaceChildren());

  it('shows a guest the sign-in link and booking button, without an account menu', async () => {
    const { wrapper } = await mountAs('public', null);
    expect(wrapper.find('[data-testid="account-menu-trigger"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="header-role-action"]').exists()).toBe(false);
    expect(wrapper.find('header a[href="/login"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it.each([
    [UserRole.CUSTOMER, '/app/bookings/new', 'Đặt thợ ngay', ['menu-orders', 'menu-history', 'menu-wallet', 'menu-profile']],
    [UserRole.TECHNICIAN, '/tech', 'Vào trang thợ', ['menu-jobs', 'menu-wallet', 'menu-profile']],
    [UserRole.SERVICE_MANAGER, '/console', 'Vào trang quản lý', ['menu-orders']],
    [UserRole.ADMIN, '/console', 'Vào trang quản lý', ['menu-orders']],
  ])('gives %s one role button and an account-only menu', async (role, actionTo, actionLabel, items) => {
    const { wrapper, router } = await mountAs('public', role);
    const action = wrapper.get('[data-testid="header-role-action"]');
    expect(action.text()).toBe(actionLabel);
    // The old header sent every role to a "Vào trang quản lý" button.
    if (role === UserRole.CUSTOMER || role === UserRole.TECHNICIAN) expect(wrapper.text()).not.toContain('Vào trang quản lý');

    const menu = await openAccountMenu(wrapper);
    expect(menu.text()).not.toMatch(SERVICE_WORDS);
    expect(menu.text()).toContain('Đăng xuất');
    for (const id of items) expect(menu.find(`[data-testid="${id}"]`).exists()).toBe(true);
    // On a phone the role button lives in the menu instead (hidden from sm up).
    const narrow = menu.get('[data-testid="menu-role-action"]');
    expect(narrow.attributes('href')).toBe(actionTo);
    expect(narrow.classes()).toContain('sm:hidden');

    await action.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(actionTo);
    wrapper.unmount();
  });

  it('keeps the phone menu to site navigation only', async () => {
    const { wrapper } = await mountAs('public', UserRole.CUSTOMER);
    await wrapper.get('button[aria-controls="public-mobile-menu"]').trigger('click');
    const nav = wrapper.get('#public-mobile-menu');
    expect(nav.text()).toContain('Dịch vụ');
    expect(nav.text()).not.toMatch(/Đăng xuất|Vào trang quản lý|Tài khoản/);
    wrapper.unmount();
  });

  it('closes the account menu on Escape and on a click outside', async () => {
    const { wrapper } = await mountAs('public', UserRole.CUSTOMER);
    await openAccountMenu(wrapper);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false);
    await openAccountMenu(wrapper);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('logs out from the account menu', async () => {
    const { wrapper, router } = await mountAs('public', UserRole.CUSTOMER);
    const auth = useAuthStore();
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    await router.push('/services');
    const menu = await openAccountMenu(wrapper);
    await menu.get('[data-testid="menu-logout"]').trigger('click');
    await flushPromises();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/');
    wrapper.unmount();
  });
});

describe('customer header', () => {
  beforeEach(() => document.body.replaceChildren());

  it('moves repair history from the top bar into the account menu', async () => {
    const { wrapper } = await mountAs('customer', UserRole.CUSTOMER);
    const topNav = wrapper.get('header nav');
    expect(topNav.text()).not.toContain('Lịch sử sửa chữa');
    expect(topNav.findAll('a').map((a) => a.attributes('href'))).toEqual([
      '/app',
      '/app/orders',
      '/app/warranties',
      '/app/messages',
    ]);
    const menu = await openAccountMenu(wrapper);
    const history = menu.get('[data-testid="menu-history"]');
    expect(history.attributes('href')).toBe('/app/history');
    expect(history.classes()).not.toContain('lg:hidden');
    expect(menu.get('[data-testid="menu-wallet"]').attributes('href')).toBe('/app/wallet');
    expect(menu.text()).not.toMatch(SERVICE_WORDS);
    // The role badge belongs to public pages; inside the app everyone is a customer.
    expect(menu.text()).not.toContain('Khách hàng');
    wrapper.unmount();
  });
});
