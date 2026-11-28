import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ForTechniciansPage from '../src/pages/public/ForTechniciansPage.vue';

vi.mock('../src/composables/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));

describe('ForTechniciansPage', () => {
  async function mountPage() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/for-technicians', component: ForTechniciansPage },
        { path: '/register', component: { template: '<div />' } },
      ],
    });
    await router.push('/for-technicians');
    await router.isReady();
    const wrapper = mount(ForTechniciansPage, { global: { plugins: [router] } });
    return { wrapper, router };
  }

  it('renders official logo, technician showcase, 3 benefits, and 4-step P4.3 join flow', async () => {
    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain('Hợp tác cùng nền tảng');
    expect(wrapper.text()).toContain('Thu nhập xứng đáng');
    expect(wrapper.text()).toContain('Chủ động thời gian');
    expect(wrapper.text()).toContain('Đánh giá công bằng');
    expect(wrapper.text()).toContain('Quy trình gia nhập');
    expect(wrapper.text()).not.toContain('(P4.3)');

    expect(wrapper.get('img[src="/logo.png"]').exists()).toBe(true);
    expect(wrapper.get('img[src="/images/for-technicians-hero.webp"]').exists()).toBe(true);

    const steps = wrapper.findAll('ol li p');
    expect(steps.map((s) => s.text())).toEqual([
      'Đăng ký tài khoản',
      'Hoàn tất hồ sơ',
      'Quản trị viên duyệt hồ sơ',
      'Bật nhận việc và bắt đầu',
    ]);
    wrapper.unmount();
  });

  it('keeps the technician registration CTA routing to /register', async () => {
    const { wrapper, router } = await mountPage();
    const cta = wrapper.get('a[href="/register"]');
    expect(cta.text()).toContain('Đăng ký tài khoản kỹ thuật viên');

    await cta.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/register');
    wrapper.unmount();
  });
});
