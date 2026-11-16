import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { LayoutGrid } from 'lucide-vue-next';
import AppSidebar from '../src/components/AppSidebar.vue';

enableAutoUnmount(afterEach);

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/console', fullPath: '/console' }),
}));

vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'admin-1', fullName: 'Quản trị viên', avatarUrl: null },
    logout: vi.fn(),
  }),
}));

vi.mock('../src/composables/useCachedQuery', () => ({
  useRoutePrefetch: () => vi.fn(),
}));

describe('AppSidebar collapsed profile menu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('teleports the collapsed profile dropdown outside the clipped sidebar with fixed positioning', async () => {
    const wrapper = mount(AppSidebar, {
      attachTo: document.body,
      props: {
        navigation: [{ group: 'Chung', items: [{ label: 'Tổng quan', path: '/console', icon: LayoutGrid }] }],
      },
      global: {
        stubs: {
          'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
          AvatarDialog: true,
        },
      },
    });

    await wrapper.get('button[aria-label="Thu gọn menu"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('aside').classes()).toContain('sidebar-collapsed');

    await wrapper.get('button[aria-label="Quản trị viên"]').trigger('click');
    await flushPromises();

    // Must not remain trapped inside overflow-x-hidden aside
    expect(wrapper.find('aside [data-testid="change-avatar"]').exists()).toBe(false);

    const panel = document.body.querySelector('.profile-dropdown') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('fixed')).toBe(true);
    expect(panel?.textContent).toContain('Quản trị viên');
    expect(panel?.textContent).toContain('Đổi ảnh đại diện');
    expect(panel?.textContent).toContain('Đăng xuất');

    // Clicking inside teleported menu opens AvatarDialog and closes dropdown
    (panel?.querySelector('[data-testid="change-avatar"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(document.body.querySelector('.profile-dropdown')).toBeNull();
  });
});
