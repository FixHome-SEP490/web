import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import apiClient from '../src/api/client';
import { authGuard } from '../src/router/guards';
import { useAuthStore } from '../src/stores/auth';
import { useSmoothScroll } from '../src/composables/useSmoothScroll';
import ServicesPage from '../src/pages/public/ServicesPage.vue';
import ServiceDetailPage from '../src/pages/public/ServiceDetailPage.vue';
import { getPublicServicePricing } from '../src/utils/public-service-pricing';

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  getHttpStatus: () => undefined,
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));
vi.mock('../src/composables/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));

const SERVICE_ID = 'a1234567-b123-4c12-8d12-1234567890ab';
const AIR_CATEGORY_ID = 'air-category-id';
const WATER_CATEGORY_ID = 'water-category-id';
const CATEGORY_IDS = [
  AIR_CATEGORY_ID,
  WATER_CATEGORY_ID,
  'category-cleaning-id',
  'category-appliance-id',
  'category-installation-id',
];

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE_ID,
    categoryId: AIR_CATEGORY_ID,
    name: 'Vệ sinh máy lạnh treo tường',
    code: 'AIR-CLEAN',
    slug: 've-sinh-may-lanh',
    description: 'Vệ sinh dàn lạnh và dàn nóng theo phạm vi dịch vụ.',
    pricingMode: 'fixed_price',
    unit: 'thiết bị',
    fixedPrice: 250000,
    minPrice: null,
    maxPrice: null,
    estimatedMinutes: 60,
    isActive: true,
    ...overrides,
  };
}

function category(id: string, name: string, services: ReturnType<typeof service>[] = []) {
  return {
    id,
    name,
    code: id,
    sortOrder: 0,
    isActive: true,
    services,
  };
}

function envelope(data: unknown, meta?: Record<string, number>) {
  return {
    data: {
      success: true,
      statusCode: 200,
      message: 'OK',
      data,
      ...(meta ? { meta } : {}),
    },
  };
}

async function setup(path = '/services') {
  const pinia = createPinia();
  useAuthStore(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/services', name: 'services', component: ServicesPage },
      { path: '/services/:slug', name: 'service-detail', component: ServiceDetailPage },
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
  await router.push(path);
  await router.isReady();
  return { router, global: { plugins: [pinia, router] } };
}

function mockPublicCatalog(options: {
  categories?: ReturnType<typeof category>[];
  services?: ReturnType<typeof service>[];
  total?: number;
  detail?: ReturnType<typeof service>;
  rejectServices?: boolean;
} = {}) {
  const services = options.services ?? [service()];
  const categories = options.categories ?? [
    category(AIR_CATEGORY_ID, 'Điện lạnh', services),
    category(WATER_CATEGORY_ID, 'Điện & Nước'),
    category(CATEGORY_IDS[2], 'Vệ sinh thiết bị'),
    category(CATEGORY_IDS[3], 'Thiết bị gia dụng'),
    category(CATEGORY_IDS[4], 'Lắp đặt'),
  ];
  const detail = options.detail ?? service();

  vi.mocked(apiClient.get).mockImplementation(async (url, config) => {
    if (url === '/categories') return envelope(categories) as never;
    if (url === '/services') {
      if (options.rejectServices) throw new Error('private backend detail');
      const params = (config?.params ?? {}) as Record<string, number | string>;
      const page = Number(params.page ?? 1);
      const limit = Number(params.limit ?? 12);
      return envelope(services, { page, limit, total: options.total ?? services.length, totalPages: Math.ceil((options.total ?? services.length) / limit) }) as never;
    }
    if (typeof url === 'string' && url.startsWith('/services/')) return envelope(detail) as never;
    throw new Error(`Unexpected catalog request: ${String(url)}`);
  });
}

describe('Public service discovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockPublicCatalog();
  });

  it('shows all 14 category chips in two rows and keeps search when selecting the last', async () => {
    const categories = Array.from({ length: 13 }, (_, i) => category(`cat-${i}`, `Danh m?c ${i + 1}`));
    mockPublicCatalog({ categories });
    const context = await setup('/services?q=may');
    const wrapper = mount(ServicesPage, context);
    await flushPromises();
    const chips = wrapper.get('[data-testid="spotlight-categories"]');
    expect(chips.findAll('button')).toHaveLength(14);
    expect(chips.findAll('.category-row').map(row => row.findAll('button').length)).toEqual([8, 6]);
    expect(chips.find('[data-testid="category-more-toggle"]').exists()).toBe(false);
    await chips.get('[data-testid="category-cat-12"]').trigger('click');
    await flushPromises();
    expect(chips.get('[data-testid="category-cat-12"]').attributes('aria-pressed')).toBe('true');
    expect(context.router.currentRoute.value.query).toEqual({ category: 'cat-12', q: 'may' });
    expect(apiClient.get).toHaveBeenLastCalledWith('/services', { params: { page: 1, limit: 12, categoryId: 'cat-12', search: 'may' } });
    await chips.get('[data-testid="category-all"]').trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.query).toEqual({ q: 'may' });
    wrapper.unmount();
  });

  it('keeps technical scope in detail and uses a human description on the public card', async () => {
    const scope = 'PHẠM VI CẦN XÁC MINH: S1, S2, S3 theo thiết bị';
    mockPublicCatalog({ services: [service({ scopeDescription: scope })], detail: service({ scopeDescription: scope }) });
    const context = await setup();
    const wrapper = mount(ServicesPage, context);
    await flushPromises();
    expect(wrapper.find('.service-card__description').exists()).toBe(false);
    expect(wrapper.get('.service-card').text()).not.toContain('Catalog V2 staging');
    expect(wrapper.get('.service-card').text()).not.toContain(scope);
    wrapper.unmount();
    await context.router.push('/services/ve-sinh-may-lanh');
    const detail = mount(ServiceDetailPage, context);
    await flushPromises();
    expect(detail.text()).toContain(scope);
    detail.unmount();
  });

  it.each([
    ['fixed_range', 199000, 449000, '199.000 – 449.000đ', 'Giá công theo thiết bị/phạm vi'],
    ['fixed_range', 349000, 349000, '349.000đ', 'Giá công theo thiết bị/phạm vi'],
    ['inspection_reference', 249000, null, 'Tham khảo 249.000đ', 'Thợ khảo sát, báo giá để khách duyệt'],
    ['inspection_only', null, null, 'Khảo sát & báo giá', ''],
  ])('prioritizes API priceSummary %s in the public card', async (kind, minLaborVnd, maxLaborVnd, label, caption) => {
    mockPublicCatalog({ services: [service({
      pricingMode: 'inspection_required',
      priceSummary: { kind, minLaborVnd, maxLaborVnd },
    })] });
    const wrapper = mount(ServicesPage, await setup());
    await flushPromises();
    const price = wrapper.get('.service-price');
    expect(price.text()).toContain(label);
    if (caption) expect(price.text()).toContain(caption);
    expect(price.text()).not.toContain('Từ ');
    expect(price.text()).not.toContain('Giá niêm yết');
    wrapper.unmount();
  });

  it('requests the exact 12-row server page from the category, query, and page in the URL', async () => {
    const pageThreeService = service({ id: 'page-three-service', name: 'Kết quả từ trang thứ ba' });
    mockPublicCatalog({ services: [pageThreeService], total: 37 });
    const context = await setup(`/services?category=${AIR_CATEGORY_ID}&q=may&page=3`);
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    expect(apiClient.get).toHaveBeenCalledWith('/services', {
      params: { page: 3, limit: 12, categoryId: AIR_CATEGORY_ID, search: 'may' },
    });
    expect(wrapper.text()).toContain('Kết quả từ trang thứ ba');
    expect(wrapper.text()).not.toContain('Vệ sinh máy lạnh treo tường');
    expect(wrapper.get('[data-testid="pagination"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('preserves search when a category changes and resets the server page to one', async () => {
    const context = await setup(`/services?category=${AIR_CATEGORY_ID}&q=may&page=3`);
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    await wrapper.get(`[data-testid="category-${WATER_CATEGORY_ID}"]`).trigger('click');
    await flushPromises();

    expect(context.router.currentRoute.value.query).toEqual({ category: WATER_CATEGORY_ID, q: 'may' });
    expect(apiClient.get).toHaveBeenCalledWith('/services', {
      params: { page: 1, limit: 12, categoryId: WATER_CATEGORY_ID, search: 'may' },
    });
    wrapper.unmount();
  });

  it('keeps all six real category filters around the hero search and removes the duplicate lower section', async () => {
    const context = await setup(`/services?category=${AIR_CATEGORY_ID}&page=4`);
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    const heroChips = wrapper.get('[data-testid="spotlight-categories"]');
    expect(heroChips.findAll('button')).toHaveLength(6);
    expect(heroChips.get('[data-testid="category-all"]').text()).toContain('Tất cả');
    expect(heroChips.get('[data-testid="category-all"]').attributes('aria-pressed')).toBe('false');
    expect(heroChips.get(`[data-testid="category-${AIR_CATEGORY_ID}"]`).attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.category-discovery').exists()).toBe(false);
    expect(wrapper.find('.services-results').exists()).toBe(true);

    await heroChips.get('[data-testid="category-all"]').trigger('click');
    await flushPromises();
    expect(context.router.currentRoute.value.query).toEqual({});
    expect(heroChips.get('[data-testid="category-all"]').attributes('aria-pressed')).toBe('true');
    expect(apiClient.get).toHaveBeenLastCalledWith('/services', { params: { page: 1, limit: 12 } });
    wrapper.unmount();
  });

  it('debounces search into the q URL key and sends it to the server with the current category', async () => {
    vi.useFakeTimers();
    const context = await setup(`/services?category=${AIR_CATEGORY_ID}&page=2`);
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    await wrapper.get('input[type="search"]').setValue('may lanh');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(context.router.currentRoute.value.query).toEqual({ category: AIR_CATEGORY_ID, q: 'may lanh' });
    expect(apiClient.get).toHaveBeenCalledWith('/services', {
      params: { page: 1, limit: 12, categoryId: AIR_CATEGORY_ID, search: 'may lanh' },
    });
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('opens category suggestions and selects one by keyboard without blurring the search field', async () => {
    const context = await setup('/services?page=2');
    const wrapper = mount(ServicesPage, { ...context, attachTo: document.body });
    await flushPromises();

    const input = wrapper.get('#service-search');
    input.element.focus();
    await input.trigger('focus');
    expect(input.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[role="listbox"]').text()).toContain('Điện lạnh');

    await input.trigger('keydown', { key: 'ArrowDown' });
    const activeId = input.attributes('aria-activedescendant');
    expect(activeId).toBeTruthy();
    expect(wrapper.get(`#${activeId}`).attributes('aria-selected')).toBe('true');

    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(context.router.currentRoute.value.query).toEqual({ category: AIR_CATEGORY_ID });
    expect(document.activeElement).toBe(input.element);
    expect(apiClient.get).toHaveBeenCalledWith('/services', {
      params: { page: 1, limit: 12, categoryId: AIR_CATEGORY_ID },
    });
    wrapper.unmount();
  });

  it('waits for Vietnamese IME composition to finish before committing the search query', async () => {
    vi.useFakeTimers();
    const context = await setup('/services');
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    const input = wrapper.get('#service-search');
    input.element.focus();
    await input.trigger('focus');
    await input.trigger('compositionstart');
    input.element.value = 'máy lạnh';
    await input.trigger('input', { isComposing: true });
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect(context.router.currentRoute.value.query).not.toHaveProperty('q');
    expect(vi.mocked(apiClient.get).mock.calls.filter(([url]) => url === '/services'))
      .toHaveLength(1);

    await input.trigger('compositionend');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(context.router.currentRoute.value.query.q).toBe('máy lạnh');
    expect(apiClient.get).toHaveBeenLastCalledWith('/services', {
      params: { page: 1, limit: 12, search: 'máy lạnh' },
    });
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('keeps Escape inside the search and lets Tab leave the suggestions normally', async () => {
    const wrapper = mount(ServicesPage, { ...await setup('/services'), attachTo: document.body });
    await flushPromises();

    const input = wrapper.get('#service-search');
    input.element.focus();
    await input.trigger('focus');
    await input.trigger('keydown', { key: 'Escape' });
    expect(input.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(input.element);

    await input.setValue('máy');
    expect(input.attributes('aria-expanded')).toBe('true');
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.element.dispatchEvent(tab);
    await flushPromises();
    expect(tab.defaultPrevented).toBe(false);
    expect(input.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('uses only the committed current server page for service suggestions', async () => {
    mockPublicCatalog({ total: 37 });
    const context = await setup(`/services?category=${AIR_CATEGORY_ID}&q=may&page=3`);
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    const input = wrapper.get('#service-search');
    input.element.focus();
    await input.trigger('focus');
    expect(wrapper.get('[role="listbox"]').text()).toContain('Vệ sinh máy lạnh treo tường');
    expect(wrapper.get('[role="listbox"]').text()).not.toContain('Dịch vụ không có trong kết quả');

    expect(apiClient.get).toHaveBeenCalledWith('/services', {
      params: { page: 3, limit: 12, categoryId: AIR_CATEGORY_ID, search: 'may' },
    });
    wrapper.unmount();
  });

  it('writes the selected server page to the URL and focuses the results heading', async () => {
    mockPublicCatalog({ total: 37 });
    const context = await setup(`/services?category=${AIR_CATEGORY_ID}&q=may&page=3`);
    const wrapper = mount(ServicesPage, { ...context, attachTo: document.body });
    await flushPromises();

    await wrapper.get('[data-testid="pagination-next"]').trigger('click');
    await flushPromises();

    expect(context.router.currentRoute.value.query).toEqual({
      category: AIR_CATEGORY_ID,
      q: 'may',
      page: '4',
    });
    expect(apiClient.get).toHaveBeenLastCalledWith('/services', {
      params: { page: 4, limit: 12, categoryId: AIR_CATEGORY_ID, search: 'may' },
    });
    expect(document.activeElement).toBe(wrapper.get('#results-heading').element);
    wrapper.unmount();
  });

  it('uses the static search treatment and disables category halo rotation when reduced motion is preferred', async () => {
    vi.useFakeTimers();
    const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }) as unknown as MediaQueryList);

    const wrapper = mount(ServicesPage, await setup('/services'));
    await flushPromises();

    expect(wrapper.get('[data-testid="search-spotlight"]').classes()).toContain('search-spotlight--reduced-motion');
    expect(wrapper.find('.category-suggestion--halo').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.find('.category-suggestion--halo').exists()).toBe(false);
    expect(useSmoothScroll).not.toHaveBeenCalled();
    wrapper.unmount();
    media.mockRestore();
    vi.useRealTimers();
  });

  it('keeps category chips stable during hover and keyboard focus', async () => {
    const wrapper = mount(ServicesPage, await setup('/services'));
    await flushPromises();
    const group = wrapper.get('[data-testid="spotlight-categories"]');
    await group.trigger('mouseenter');
    await group.get('button').trigger('focus');
    expect(wrapper.find('.category-suggestion--halo').exists()).toBe(false);
    expect(group.findAll('button')).toHaveLength(6);
    expect(group.get('[data-testid="category-all"]').attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('routes a guest service choice through the existing login redirect with the exact service ID', async () => {
    const context = await setup('/services');
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    await wrapper.get(`[data-testid="service-booking-${SERVICE_ID}"]`).trigger('click');
    await flushPromises();

    expect(context.router.currentRoute.value.path).toBe('/login');
    expect(context.router.currentRoute.value.query.redirect).toBe(`/app/bookings/new?serviceId=${SERVICE_ID}`);
    expect(context.router.currentRoute.value.path).not.toBe('/register');
    expect(apiClient.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('uses pricingMode instead of a positive fixedPrice and never displays a zero range', async () => {
    mockPublicCatalog({
      services: [service({ pricingMode: 'inspection_required', fixedPrice: 240000, minPrice: 0, maxPrice: 0 })],
    });
    const wrapper = mount(ServicesPage, await setup('/services'));
    await flushPromises();

    expect(wrapper.text()).toContain('Báo giá sau khảo sát');
    expect(wrapper.text()).not.toContain('Giá cố định');
    expect(wrapper.text()).not.toContain('0 ₫');
    wrapper.unmount();
  });

  it.each(['list', 'detail'])('shows a catalog decimal string as an honest fixed price on %s', async (page) => {
    const item = service({ fixedPrice: '250000.00' });
    mockPublicCatalog({ services: [item], detail: item });
    const wrapper = page === 'list'
      ? mount(ServicesPage, await setup('/services'))
      : mount(ServiceDetailPage, await setup('/services/ve-sinh-may-lanh'));
    await flushPromises();
    expect(wrapper.text()).toContain('250.000');
    expect(wrapper.text()).not.toContain('Báo giá sau khảo sát');
    expect(wrapper.text()).not.toContain('Thông tin giá đang được cập nhật');
    wrapper.unmount();
  });

  it.each(['0', '0.00', '-1', 'NaN', 'Infinity', '250000oops', '1e5', '0x100', '1,000', ' 250000 ', '250000\n', '', '.5', '5.', '<script>1</script>'])('rejects malformed or non-positive fixed price %j', (fixedPrice) => {
    expect(getPublicServicePricing({ pricingMode: 'fixed_price', fixedPrice } as never)).toEqual({ kind: 'fixed-unavailable' });
  });

  it('keeps inspection and unknown modes separate from a missing fixed price', () => {
    expect(getPublicServicePricing({ pricingMode: 'fixed_price', fixedPrice: null })).toEqual({ kind: 'fixed-unavailable' });
    expect(getPublicServicePricing({ pricingMode: 'inspection_required', fixedPrice: 250000 })).toEqual({ kind: 'inspection' });
    expect(getPublicServicePricing({ pricingMode: 'mystery', fixedPrice: 250000 } as never)).toEqual({ kind: 'unknown' });
  });

  it('keeps an explicit detail page and carries its exact service ID into the guest redirect', async () => {
    const context = await setup('/services/ve-sinh-may-lanh');
    const wrapper = mount(ServiceDetailPage, context);
    await flushPromises();

    expect(apiClient.get).toHaveBeenCalledWith('/services/ve-sinh-may-lanh');
    await wrapper.get('[data-testid="detail-booking"]').trigger('click');
    await flushPromises();

    expect(context.router.currentRoute.value.path).toBe('/login');
    expect(context.router.currentRoute.value.query.redirect).toBe(`/app/bookings/new?serviceId=${SERVICE_ID}`);
    expect(apiClient.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('uses inspection pricing on the detail page even when a fixed amount is present', async () => {
    mockPublicCatalog({
      detail: service({ pricingMode: 'inspection_required', fixedPrice: 240000, minPrice: 0, maxPrice: 0 }),
    });
    const wrapper = mount(ServiceDetailPage, await setup('/services/ve-sinh-may-lanh'));
    await flushPromises();

    expect(wrapper.text()).toContain('Báo giá sau khảo sát');
    expect(wrapper.text()).not.toContain('Giá niêm yết');
    expect(wrapper.text()).not.toContain('0 ₫');
    wrapper.unmount();
  });

  it('shows a retryable, safe catalog error without leaking server details', async () => {
    mockPublicCatalog({ rejectServices: true });
    const context = await setup('/services');
    const wrapper = mount(ServicesPage, context);
    await flushPromises();

    expect(wrapper.text()).toContain('Không thể tải danh sách dịch vụ');
    expect(wrapper.text()).not.toContain('private backend detail');
    wrapper.unmount();
  });
});
