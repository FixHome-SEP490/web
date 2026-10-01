import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';

// A signed-in customer browsing the public pages keeps chat, the assistant and
// incoming calls, as inside the app; guests and staff see the pages unchanged.
const { initSocket, initCallSignalling } = vi.hoisted(() => ({ initSocket: vi.fn(), initCallSignalling: vi.fn() }));

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn() },
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ initSocket }) }));
vi.mock('../src/stores/call.store', () => ({ useCallStore: () => ({ initCallSignalling }) }));
vi.mock('../src/components/chat/CallOverlay.vue', () => ({ default: defineComponent({ render: () => h('div', { 'data-testid': 'call-overlay' }) }) }));
vi.mock('../src/components', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ChatFloatingWidget: defineComponent({ render: () => h('div', { 'data-testid': 'chat-widget' }) }),
  AiAssistantWidget: defineComponent({ render: () => h('div', { 'data-testid': 'ai-widget' }) }),
}));

import PublicLayout from '../src/layouts/PublicLayout.vue';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';

async function render(role: UserRole | null) {
  setActivePinia(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/:p(.*)*', component: { template: '<div />' } }] });
  await router.push('/');
  await router.isReady();
  if (role) {
    // The server sends roles in lower case; the layout must not depend on case.
    useAuthStore().setAuth('token', { id: 'u1', fullName: 'Người dùng', email: 'u@example.test', role: role.toLowerCase() as UserRole, status: 'ACTIVE' });
  }
  const wrapper = mount(PublicLayout, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('Public pages for a signed-in customer', () => {
  beforeEach(() => { initSocket.mockReset(); initCallSignalling.mockReset(); });

  it('shows chat, the assistant and incoming calls, and connects chat', async () => {
    const wrapper = await render(UserRole.CUSTOMER);
    expect(wrapper.find('[data-testid="chat-widget"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-widget"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="call-overlay"]').exists()).toBe(true);
    expect(initSocket).toHaveBeenCalledTimes(1);
    expect(initCallSignalling).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a guest', null],
    ['a technician', UserRole.TECHNICIAN],
    ['an admin', UserRole.ADMIN],
  ])('keeps the pages unchanged for %s', async (_label, role) => {
    const wrapper = await render(role as UserRole | null);
    expect(wrapper.find('[data-testid="chat-widget"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-widget"]').exists()).toBe(false);
    expect(initSocket).not.toHaveBeenCalled();
  });
});
