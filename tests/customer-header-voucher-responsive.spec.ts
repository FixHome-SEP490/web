import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  initSocket: vi.fn(),
  initCallSignalling: vi.fn(),
  fetchConversations: vi.fn(),
  fetchUnreadCount: vi.fn(),
  whileOffline: vi.fn(() => vi.fn()),
}));

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));
vi.mock('../src/services/live-updates', () => ({ whileOffline: mocks.whileOffline }));
vi.mock('../src/stores/chat.store', () => ({
  useChatStore: () => ({
    initSocket: mocks.initSocket,
    fetchConversations: mocks.fetchConversations,
    totalUnreadCount: 0,
  }),
}));
vi.mock('../src/stores/call.store', () => ({ useCallStore: () => ({ initCallSignalling: mocks.initCallSignalling }) }));
vi.mock('../src/stores/notifications.store', () => ({
  useNotificationsStore: () => ({
    unreadCount: 0,
    unreadNotifications: [],
    fetchUnreadCount: mocks.fetchUnreadCount,
  }),
}));

const { stub } = vi.hoisted(() => ({
  stub: (id: string) => async () => {
    const { defineComponent, h } = await import('vue');
    return { default: defineComponent({ render: () => h('div', { 'data-testid': id }) }) };
  },
}));
vi.mock('../src/components/chat/CallOverlay.vue', stub('call-overlay'));
vi.mock('../src/components/chat/ChatFloatingWidget.vue', stub('chat-widget'));
vi.mock('../src/components/chat/AiAssistantWidget.vue', stub('ai-widget'));
vi.mock('../src/components/notifications/NotificationBellDropdown.vue', stub('notification-bell'));

import CustomerLayout from '../src/layouts/CustomerLayout.vue';
import { useAuthStore } from '../src/stores/auth';

const wrappers: VueWrapper[] = [];
let viewportWidth = 1280;
const mediaQueries: Array<{
  query: string;
  listeners: Set<(event: MediaQueryListEvent) => void>;
}> = [];

function minimumWidth(query: string) {
  return Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
}

function installMatchMedia(width: number) {
  viewportWidth = width;
  mediaQueries.length = 0;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => {
      const entry = { query, listeners: new Set<(event: MediaQueryListEvent) => void>() };
      mediaQueries.push(entry);
      return {
        media: query,
        get matches() { return viewportWidth >= minimumWidth(query); },
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => entry.listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => entry.listeners.delete(listener),
        addListener: (listener: (event: MediaQueryListEvent) => void) => entry.listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) => entry.listeners.delete(listener),
        dispatchEvent: () => true,
      } as MediaQueryList;
    },
  });
}

function resizeTo(width: number) {
  viewportWidth = width;
  for (const entry of mediaQueries) {
    const event = { matches: viewportWidth >= minimumWidth(entry.query), media: entry.query } as MediaQueryListEvent;
    for (const listener of entry.listeners) listener(event);
  }
  window.dispatchEvent(new Event('resize'));
}

async function renderAt(width: number, path = '/app') {
  installMatchMedia(width);
  localStorage.clear();
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push(path);
  await router.isReady();
  useAuthStore().setAuth('token', {
    id: 'customer-1',
    fullName: 'Test Customer',
    email: 'customer@example.test',
    role: 'customer',
    status: 'ACTIVE',
  });
  const wrapper = mount(CustomerLayout, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe('customer responsive header navigation', () => {
  it.each([1024, 1280])('uses one compact disclosure at %i CSS px and keeps voucher access available', async (width) => {
    const { wrapper } = await renderAt(width);

    expect(wrapper.get('[data-testid="customer-desktop-nav"]').isVisible()).toBe(false);
    const trigger = wrapper.get('[data-testid="customer-desktop-nav-overflow-trigger"]');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.attributes('aria-controls')).toBe('customer-desktop-nav-overflow');

    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    const overflow = wrapper.get('[data-testid="customer-desktop-nav-overflow"]');
    const links = overflow.findAll('a');
    const destinations = links.map((link) => link.attributes('href'));
    expect(destinations).toEqual([
      '/app',
      '/app/orders',
      '/app/warranties',
      '/app/messages',
      '/app/vouchers',
    ]);
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(wrapper.find('[data-testid="account-menu"]').exists()).toBe(false);

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click');
    expect(wrapper.get('[data-testid="customer-desktop-nav-overflow"]').isVisible()).toBe(false);
    expect(wrapper.get('[data-testid="menu-vouchers"]').attributes('href')).toBe('/app/vouchers');
  });

  it('supports keyboard opening and Escape with focus returned to the disclosure button', async () => {
    const { wrapper } = await renderAt(1280);
    const trigger = wrapper.get('[data-testid="customer-desktop-nav-overflow-trigger"]');

    await trigger.trigger('keydown', { key: 'ArrowDown' });
    const firstLink = wrapper.get('[data-testid="customer-desktop-nav-overflow"] a');
    expect(document.activeElement).toBe(firstLink.element);

    await firstLink.trigger('keydown', { key: 'Escape' });
    expect(wrapper.get('[data-testid="customer-desktop-nav-overflow"]').isVisible()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
  });

  it('switches to the full five-link desktop navigation when the viewport widens', async () => {
    const { wrapper } = await renderAt(1280);
    expect(wrapper.get('[data-testid="customer-desktop-nav"]').isVisible()).toBe(false);

    resizeTo(1440);
    await flushPromises();

    const nav = wrapper.get('[data-testid="customer-desktop-nav"]');
    expect(wrapper.get('[data-testid="customer-desktop-nav-overflow-trigger"]').isVisible()).toBe(false);
    expect(nav.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/app',
      '/app/orders',
      '/app/warranties',
      '/app/messages',
      '/app/vouchers',
    ]);
  });

  it('marks the compact disclosure active on a voucher route', async () => {
    const { wrapper } = await renderAt(1280, '/app/vouchers');

    expect(wrapper.get('[data-testid="customer-desktop-nav-overflow-trigger"]').classes()).toContain('text-brand-700');
    await wrapper.get('[data-testid="customer-desktop-nav-overflow-trigger"]').trigger('click');
    expect(wrapper.get('[data-testid="customer-desktop-nav-overflow"] a[href="/app/vouchers"]').attributes('aria-current')).toBe('page');
  });
});
