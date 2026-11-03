import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import HowItWorksPage from '../src/pages/public/HowItWorksPage.vue';
import { authGuard } from '../src/router/guards';
import { useAuthStore } from '../src/stores/auth';

async function setup() {
  const pinia = createPinia();
  useAuthStore(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/how-it-works', name: 'how-it-works', component: HowItWorksPage },
      { path: '/services', name: 'services', component: { template: '<div />' } },
      { path: '/pricing-policy', name: 'pricing-policy', component: { template: '<div />' } },
      { path: '/track', name: 'track', component: { template: '<div />' } },
      {
        path: '/app/bookings/new',
        name: 'new-booking',
        component: { template: '<div />' },
        meta: { requiresAuth: true, roles: ['CUSTOMER'] },
      },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  });
  router.beforeEach(authGuard);
  await router.push('/how-it-works');
  await router.isReady();
  return { router, global: { plugins: [pinia, router] } };
}

describe('Public how-it-works page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('presents exactly four ordered steps with one page heading', async () => {
    const wrapper = mount(HowItWorksPage, await setup());

    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h1').text()).toContain('Từ mô tả sự cố');

    const steps = wrapper.findAll('.how-step');
    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.get('.how-step__number').text())).toEqual(['01', '02', '03', '04']);
    expect(steps.map((step) => step.get('.how-step__title').text())).toEqual([
      'Mô tả sự cố',
      'Chọn tối đa 2 thợ',
      'Duyệt báo giá trước khi sửa',
      'Thanh toán và bảo hành',
    ]);
    expect(wrapper.get('ol.how-steps').attributes('aria-label')).toBe('Các bước đặt lịch và sửa chữa');

    wrapper.unmount();
  });

  it('keeps AI, technician choice, approval, and warranty wording accurate', async () => {
    const wrapper = mount(HowItWorksPage, await setup());
    const text = wrapper.text();

    expect(text).toContain('AI chỉ gợi ý, không thay kỹ thuật viên kiểm tra.');
    expect(text).toContain('Chọn tối đa 2 thợ');
    expect(text).toContain('chọn 1–2 người theo thứ tự ưu tiên');
    expect(text).toContain('báo giá tách tiền công và linh kiện');
    expect(text).toContain('Duyệt báo giá trước khi sửa');
    expect(text).toContain('Chi phí phát sinh cần bạn đồng ý.');
    expect(text).toContain('Thanh toán theo hóa đơn; bảo hành theo hạng mục trên đơn.');
    expect(text).toContain('Tiền công hiển thị từ trước; không cần báo giá khảo sát.');
    expect(text).toContain('phụ thuộc hạng mục, linh kiện và thông tin đơn hoàn tất');

    // The second polish pass keeps the page short; details hold only optional clarification.
    expect(text.length).toBeLessThan(1600);

    // Never present unsupported matching, diagnosis, pricing, or warranty promises.
    for (const claim of [
      'tối đa 5',
      '300m',
      'GPS',
      'định vị',
      'tự động gán',
      'gần nhất',
      'chẩn đoán chính xác',
      'chính xác 100',
      'miễn phí',
      'hoàn tiền',
      'cam kết giá',
      'bảo hành điện tử',
      'bảo hành trọn đời',
    ]) {
      expect(text).not.toContain(claim);
    }

    wrapper.unmount();
  });

  it('keeps the existing public links and labels the hero image as an illustration', async () => {
    const wrapper = mount(HowItWorksPage, await setup());

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'));
    expect(hrefs).toContain('/services');
    expect(hrefs).toContain('/track');

    const image = wrapper.get('img');
    expect(image.attributes('alt')).toMatch(/^Minh họa kỹ thuật viên/);
    expect(image.attributes('alt')).not.toContain('FixHome');

    wrapper.unmount();
  });

  it('keeps optional clarifications collapsed behind native details', async () => {
    const wrapper = mount(HowItWorksPage, await setup());

    const details = wrapper.findAll('details');
    expect(details).toHaveLength(2);
    expect(details.map((item) => item.get('summary').text())).toEqual([
      'Giá cố định?',
      'Bảo hành gồm gì?',
    ]);
    for (const item of details) {
      expect(item.attributes('open')).toBeUndefined();
    }

    wrapper.unmount();
  });

  it('sends both booking actions through the existing guest login redirect', async () => {
    const context = await setup();
    const wrapper = mount(HowItWorksPage, context);

    await wrapper.get('[data-testid="how-booking-cta"]').trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.path).toBe('/login');
    expect(context.router.currentRoute.value.query.redirect).toBe('/app/bookings/new');
    expect(context.router.currentRoute.value.path).not.toBe('/register');

    await context.router.push('/how-it-works');
    await flushPromises();
    await wrapper.get('[data-testid="how-final-booking-cta"]').trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.path).toBe('/login');
    expect(context.router.currentRoute.value.query.redirect).toBe('/app/bookings/new');

    wrapper.unmount();
  });
});
