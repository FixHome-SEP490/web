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
import LandingPage from '../src/pages/public/LandingPage.vue';
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
      { path: '/services/:slug', name: 'service-detail', component: { template: '<div />' } },
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

  it('scrolls within the landing from the header instead of opening another page (PO 21/10/2026)', async () => {
    const context = await setup('/');
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    const section = document.createElement('div');
    section.id = 'services';
    document.body.append(section);
    try {
      const layout = mount(PublicLayout, { ...context, attachTo: document.body });
      const link = (label: string) => layout.get('nav[aria-label="Điều hướng chính"]').findAll('a').find((a) => a.text() === label)!;
      await link('Dịch vụ').trigger('click');
      await flushPromises();
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(context.router.currentRoute.value.path).toBe('/');
      expect(context.router.currentRoute.value.hash).toBe('#services');

      await link('Giới thiệu').trigger('click');
      await flushPromises();
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));
      layout.unmount();
    } finally {
      section.remove();
      vi.unstubAllGlobals();
    }
  });

  it('sends the how-it-works call to action to the booking form, not the catalog', async () => {
    const context = await setup();
    const wrapper = mount(LandingHowItWorks, context);
    await wrapper.findAll('button').find((b) => b.text().includes('Bắt đầu đặt lịch ngay'))!.trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.query.redirect).toBe('/app/bookings/new');
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

  it('identifies the generated hero image as an illustration, not a FixHome employee', async () => {
    const wrapper = mount(LandingHero, await setup());
    const alt = wrapper.get('img').attributes('alt') ?? '';
    expect(alt).toMatch(/^Minh họa kỹ thuật viên/);
    expect(alt).toContain('kiểm tra máy lạnh tại nhà');
    expect(alt).not.toContain('FixHome');
    wrapper.unmount();
  });

  it('applies category deep links and falls back for an invalid category', async () => {
    const categories = [category('one'), category('two')];
    const serviceRows = ['one', 'two'].map((id) => ({
      id: `service-${id}`,
      categoryId: id,
      category: categories.find((entry) => entry.id === id),
      name: `Dịch vụ kiểm thử ${id}`,
      code: id,
      isActive: true,
      estimatedMinutes: 30,
    }));
    vi.mocked(apiClient.get).mockImplementation(async (url, config) => {
      if (url === '/categories') return response(categories) as never;
      if (url === '/services') {
        const params = (config?.params ?? {}) as { categoryId?: string; page?: number; limit?: number };
        const rows = params.categoryId
          ? serviceRows.filter((service) => service.categoryId === params.categoryId)
          : serviceRows;
        const limit = params.limit ?? 12;
        return {
          data: {
            success: true,
            statusCode: 200,
            message: 'OK',
            data: rows,
            meta: { page: params.page ?? 1, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
          },
        } as never;
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });
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
    [UserRole.CUSTOMER, '/app/orders'],
    [UserRole.TECHNICIAN, '/tech'],
    [UserRole.ADMIN, '/console'],
    [UserRole.SERVICE_MANAGER, '/console'],
  ])('links %s to its own area from the footer, not to a services dashboard', async (role, destination) => {
    const context = await setup();
    context.auth.setAuth('unit-test-token', {
      id: 'test-user',
      fullName: 'Tài khoản kiểm thử',
      email: 'test@example.test',
      role: role as UserRole,
      status: 'ACTIVE',
    });
    const wrapper = mount(PublicLayout, context);
    const footerLinks = wrapper.get('footer').findAll('a').map((link) => link.attributes('href'));
    expect(footerLinks).toContain(destination);
    // "Tài khoản" used to open the customer dashboard full of services.
    expect(wrapper.findAll('a').some((link) => link.text() === 'Tài khoản')).toBe(false);
    wrapper.unmount();
  });

  it('presents current mobile app capabilities as a visual feature path without fake store claims', async () => {
    const context = await setup();
    const wrapper = mount(LandingMobileApp, context);

    expect(wrapper.text()).toContain('Theo dõi việc sửa chữa trên điện thoại');
    expect(wrapper.text()).toContain('Theo dõi yêu cầu trong từng đơn');
    expect(wrapper.text()).toContain('Trao đổi với kỹ thuật viên');
    expect(wrapper.text()).toContain('Xem lại lịch sử sửa chữa');
    expect(wrapper.findAll('.app-flow > li')).toHaveLength(3);
    expect(wrapper.findAll('img')).toHaveLength(0);

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

  it('explains the four AI guidance stages and keeps human assessment authoritative', async () => {
    const context = await setup();
    const wrapper = mount(LandingDiagnosis, context);

    expect(wrapper.text()).toContain('Chưa rõ hỏng ở đâu?');
    expect(wrapper.text()).toContain('Để AI gợi ý bước đầu');
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(wrapper.findAll('ol > li')).toHaveLength(4);

    // Verify 4 stages exist
    expect(wrapper.text()).toContain('Mô tả sự cố');
    expect(wrapper.text()).toContain('Trao đổi với trợ lý AI');
    expect(wrapper.text()).toContain('Nhận gợi ý ban đầu');
    expect(wrapper.text()).toContain('Tự chọn dịch vụ và tiếp tục đặt lịch');
    expect(wrapper.text()).toContain('AI chỉ đưa ra gợi ý ban đầu');
    expect(wrapper.text()).not.toContain('Độ chính xác cao');
    expect(wrapper.text()).toContain('Kỹ thuật viên kiểm tra thực tế');
    expect(wrapper.text()).toContain('bạn duyệt báo giá trước khi sửa');

    // Verify CTA
    expect(wrapper.text()).toContain('Phân tích sự cố bằng AI');
    wrapper.unmount();
  });

  it('shows candidate selection and invitation before tracking a booking', async () => {
    const context = await setup();
    const wrapper = mount(LandingHowItWorks, context);

    expect(wrapper.text()).toContain('Sửa chữa đơn giản, từng bước rõ ràng');
    expect(wrapper.findAll('ol > li')).toHaveLength(4);
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(wrapper.findAll('.step-item h3').map((heading) => heading.text())).toEqual([
      'Gửi yêu cầu sửa chữa',
      'Xem kỹ thuật viên phù hợp',
      'Chọn 1 hoặc 2 kỹ thuật viên',
      'Theo dõi đơn và báo giá',
    ]);
    expect(wrapper.text()).toContain('Chọn dịch vụ, mô tả tình trạng, địa chỉ và thời gian phù hợp.');
    expect(wrapper.text()).toContain('Sau khi gửi yêu cầu, xem danh sách kỹ thuật viên phù hợp.');
    expect(wrapper.text()).toContain('Chọn theo thứ tự ưu tiên rồi gửi lời mời.');
    expect(wrapper.text()).toContain('Người thứ hai là dự phòng nếu người đầu từ chối hoặc hết hạn phản hồi.');
    expect(wrapper.text()).toContain('Khi kỹ thuật viên nhận việc, theo dõi đơn.');
    expect(wrapper.text()).toContain('Nếu cần khảo sát, duyệt báo giá trước khi sửa.');
    expect(wrapper.text()).not.toContain('Chờ kỹ thuật viên phản hồi');
    expect(wrapper.text()).not.toContain('tối đa 5 ảnh');
    expect(wrapper.text()).not.toContain('3 ảnh');
    expect(wrapper.text()).not.toMatch(/1-2km|100% Thợ/);

    // Verify CTA
    expect(wrapper.text()).toContain('Bắt đầu đặt lịch ngay');
    wrapper.unmount();
  });

  it('orders the landing sections like the header navigation', async () => {
    const context = await setup();
    const wrapper = mount(LandingPage, context);
    await flushPromises();
    expect(wrapper.find('a[href="/app/bookings/ai"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/pricing-policy"]').exists()).toBe(true);
    expect(wrapper.findAll('#questions details')).toHaveLength(4);
    const ids = wrapper.findAll('[id]').map((el) => el.attributes('id'));
    const order = ['gioi-thieu', 'services', 'ai', 'how-it-works', 'trust', 'mobile-app', 'questions'].map((id) => ids.indexOf(id));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const layout = mount(PublicLayout, context);
    const navTargets = layout.get('nav[aria-label="Điều hướng chính"]').findAll('a').map((a) => a.attributes('href'));
    // Every header item stays on the landing (PO 21/10/2026); "Giới thiệu" is its first screen.
    expect(navTargets).toEqual(['/#gioi-thieu', '/#services', '/#ai', '/#how-it-works', '/#trust']);
    layout.unmount();
    wrapper.unmount();
  });

  it('renders concise trust details without overstating technician identity checks', async () => {
    const context = await setup();
    const wrapper = mount(LandingTrust, context);

    expect(wrapper.text()).toContain('Hồ sơ và kỹ năng được xem xét');
    expect(wrapper.text()).toContain('Đánh giá sau đơn hoàn tất');
    expect(wrapper.text()).toContain('Bảo hành theo thông tin đơn');
    expect(wrapper.text()).not.toContain('video khuôn mặt');
    expect(wrapper.findAll('img')).toHaveLength(0);
    wrapper.unmount();
  });
});
