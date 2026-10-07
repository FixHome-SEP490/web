import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import apiClient from '../src/api/client';
import LandingServices from '../src/components/landing/LandingServices.vue';
import LandingHero from '../src/components/landing/LandingHero.vue';
import LandingMobileApp from '../src/components/landing/LandingMobileApp.vue';
import LandingDiagnosis from '../src/components/landing/LandingDiagnosis.vue';
import LandingHowItWorks from '../src/components/landing/LandingHowItWorks.vue';
import LandingTrust from '../src/components/landing/LandingTrust.vue';
import ServicesPage from '../src/pages/public/ServicesPage.vue';
import PublicLayout from '../src/layouts/PublicLayout.vue';
import { authGuard } from '../src/router/guards';
import { useAuthStore } from '../src/stores/auth';
import { UserRole } from '../src/types';

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn() },
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));
vi.mock('../src/composables/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));
const response = (data: unknown[]) => ({ data: { success: true, statusCode: 200, message: 'OK', data } });
const category = (id: string, isActive = true) => ({
  id,
  name: `Danh mục kiểm thử ${id}`,
  code: id,
  sortOrder: 0,
  isActive,
  services: [
    {
      id: `service-${id}`,
      categoryId: id,
      name: `Dịch vụ kiểm thử ${id}`,
      isActive: true,
      estimatedMinutes: 30,
    },
  ],
});
async function setup(path = '/') {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/services', name: 'services', component: { template: '<div />' } },
      {
        path: '/app/bookings/new',
        component: { template: '<div />' },
        meta: { requiresAuth: true, roles: ['CUSTOMER'] },
      },
      ...[
        '/login',
        '/app',
        '/app/orders',
        '/app/profile',
        '/tech',
        '/tech/jobs',
        '/console',
        '/console/orders',
        '/track',
        '/pricing-policy',
        '/how-it-works',
        '/for-technicians',
        '/403',
      ].map((path) => ({ path, component: { template: '<div />' } })),
    ],
  });
  const auth = useAuthStore(pinia);
  router.beforeEach(authGuard);
  await router.push(path);
  await router.isReady();
  return { router, auth, global: { plugins: [pinia, router] } };
}

describe('Public landing page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(response([]));
  });

  it('shows at most six active API categories linked to the catalog filter', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      response([category('inactive', false), ...Array.from({ length: 8 }, (_, i) => category(String(i)))]),
    );
    const context = await setup();
    const wrapper = mount(LandingServices, context);
    await flushPromises();
    expect(apiClient.get).toHaveBeenCalledWith('/categories');
    const cards = wrapper.findAll('a').filter((link) => link.attributes('href')?.includes('?category='));
    expect(cards).toHaveLength(6);
    expect(wrapper.text()).not.toContain('inactive');
    await cards[0]!.trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.fullPath).toBe('/services?category=0');
    wrapper.unmount();
  });

  it('shows loading, a safe error, and a working retry', async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.mocked(apiClient.get).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const context = await setup();
    const wrapper = mount(LandingServices, context);
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toContain('Đang tải');
    rejectRequest(new Error('private database error'));
    await flushPromises();
    expect(wrapper.text()).toContain('Chưa tải được danh mục');
    expect(wrapper.text()).not.toContain('database');
    vi.mocked(apiClient.get).mockResolvedValueOnce(response([category('retry')]));
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Danh mục kiểm thử retry');
    wrapper.unmount();
  });

  it('has an honest empty state', async () => {
    const wrapper = mount(LandingServices, await setup());
    await flushPromises();
    expect(wrapper.text()).toContain('Danh mục dịch vụ đang được cập nhật');
    expect(wrapper.findAll('a')).toHaveLength(1);
    wrapper.unmount();
  });

  it('preserves the booking destination for a guest CTA', async () => {
    const context = await setup();
    const wrapper = mount(LandingHero, context);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.path).toBe('/login');
    expect(context.router.currentRoute.value.query.redirect).toBe('/app/bookings/new');
    wrapper.unmount();
  });

  it('applies category deep links and falls back for an invalid category', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(response([category('one'), category('two')]));
    const context = await setup('/services?category=two');
    const wrapper = mount(ServicesPage, context);
    await flushPromises();
    expect(wrapper.text()).toContain('Dịch vụ kiểm thử two');
    expect(wrapper.text()).not.toContain('Dịch vụ kiểm thử one');
    await context.router.push('/services?category=missing');
    await flushPromises();
    expect(wrapper.text()).toContain('Dịch vụ kiểm thử one');
    expect(wrapper.text()).toContain('Dịch vụ kiểm thử two');
    wrapper.unmount();
  });

  it('closes the mobile menu on Escape and navigation and restores focus', async () => {
    const context = await setup();
    const wrapper = mount(PublicLayout, { ...context, attachTo: document.body });
    const trigger = wrapper.get('button[aria-controls="public-mobile-menu"]');
    await trigger.get('svg').trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
    await trigger.get('svg').trigger('click');
    await wrapper.get('#public-mobile-menu a').trigger('click');
    await flushPromises();
    expect(wrapper.find('#public-mobile-menu').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    [UserRole.CUSTOMER, '/app'],
    [UserRole.TECHNICIAN, '/tech'],
    [UserRole.ADMIN, '/console'],
    [UserRole.SERVICE_MANAGER, '/console'],
  ])('keeps the account destination for %s', async (role, destination) => {
    const context = await setup();
    context.auth.setAuth('unit-test-token', {
      id: 'test-user',
      fullName: 'Tài khoản kiểm thử',
      email: 'test@example.test',
      role: role as UserRole,
      status: 'ACTIVE',
    });
    const wrapper = mount(PublicLayout, context);
    const account = wrapper.findAll('a').find((link) => link.text() === 'Tài khoản')!;
    expect(account.attributes('href')).toBe(destination);
    wrapper.unmount();
  });

  it('renders the mobile app showcase without invented ratings, download counts or a fake QR code', async () => {
    const context = await setup();
    const wrapper = mount(LandingMobileApp, context);

    // Check headline and mockup image
    expect(wrapper.text()).toContain('Chăm sóc ngôi nhà trong tầm tay');
    expect(wrapper.text()).toContain('Tiện lợi hơn trên ứng dụng FixHome');
    const img = wrapper.get('img[src="/images/fixhome-devices-mockup.png"]');
    expect(img.exists()).toBe(true);

    // No store listing exists yet, so nothing may pretend to download the app.
    expect(wrapper.text()).not.toContain('4.9/5');
    expect(wrapper.text()).not.toContain('10.000+');
    expect(wrapper.text()).not.toContain('Tải ứng dụng ngay');
    expect(wrapper.text()).not.toContain('App Store');
    expect(wrapper.text()).not.toContain('Google Play');
    expect(wrapper.text()).not.toContain('Quét mã QR');
    expect(wrapper.findAll('button')).toHaveLength(0);
    wrapper.unmount();
  });

  it('shows no invented hotline, office address or support e-mail in the public footer', async () => {
    const wrapper = mount(PublicLayout, await setup());
    expect(wrapper.text()).not.toContain('1900');
    expect(wrapper.text()).not.toContain('Khu Công nghệ cao');
    expect(wrapper.text()).not.toContain('hotro@fixhome.vn');
    wrapper.unmount();
  });

  it('renders LandingDiagnosis with the AI diagnosis infographic image and 4 stages', async () => {
    const context = await setup();
    const wrapper = mount(LandingDiagnosis, context);

    expect(wrapper.text()).toContain('Chưa rõ hỏng ở đâu?');
    expect(wrapper.text()).toContain('Để AI hỗ trợ phân tích bước đầu');
    const img = wrapper.get('img[src="/images/fixhome-ai-diagnosis.jpg"]');
    expect(img.exists()).toBe(true);

    // Verify 4 stages exist
    expect(wrapper.text()).toContain('Gửi ảnh hoặc mô tả triệu chứng');
    expect(wrapper.text()).toContain('AI nhận diện thiết bị & phân tích');
    expect(wrapper.text()).toContain('Khoanh vùng nguyên nhân có thể gặp');
    expect(wrapper.text()).toContain('Gợi ý dịch vụ & kỹ thuật viên');

    // Verify CTA
    expect(wrapper.text()).toContain('Phân tích sự cố bằng AI');
    wrapper.unmount();
  });

  it('renders LandingHowItWorks with 5 steps and dynamic phone screen switching', async () => {
    const context = await setup();
    const wrapper = mount(LandingHowItWorks, context);

    expect(wrapper.text()).toContain('Sửa chữa đơn giản, từng bước rõ ràng');
    // Initially renders step 1 image
    let img = wrapper.get('img[src="/images/steps/step-1-select-service.png"]');
    expect(img.exists()).toBe(true);

    // Verify all 5 steps exist
    expect(wrapper.text()).toContain('Mở ứng dụng & Chọn dịch vụ');
    expect(wrapper.text()).toContain('Gửi ảnh & Nhờ AI chẩn đoán');
    expect(wrapper.text()).toContain('AI phân tích & Đưa kết quả');
    expect(wrapper.text()).toContain('Chọn lịch & Tìm kiếm thợ');
    expect(wrapper.text()).toContain('Duyệt báo giá & Nghiệm thu hoàn tất');

    // Click step 3 card to switch screen
    const stepCards = wrapper.findAll('.cursor-pointer');
    expect(stepCards.length).toBeGreaterThanOrEqual(5);
    await stepCards[2]!.trigger('click');
    await flushPromises();

    // Image switches to step 3 AI result
    img = wrapper.get('img[src="/images/steps/step-3-ai-result.png"]');
    expect(img.exists()).toBe(true);

    // Verify CTA
    expect(wrapper.text()).toContain('Bắt đầu đặt lịch ngay');
    wrapper.unmount();
  });

  it('renders LandingTrust with text on the left and technician photo on the right', async () => {
    const context = await setup();
    const wrapper = mount(LandingTrust, context);

    expect(wrapper.text()).toContain('Đúng người thực hiện');
    expect(wrapper.text()).toContain('Đúng chuẩn tay nghề');
    expect(wrapper.text()).toContain('Kỹ thuật viên đã xác minh');

    const img = wrapper.get('img[src="/images/technician-home-640.webp"]');
    expect(img.exists()).toBe(true);
    wrapper.unmount();
  });
});
