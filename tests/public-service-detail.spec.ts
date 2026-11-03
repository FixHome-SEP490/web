import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import apiClient from '../src/api/client';
import ServiceDetailPage from '../src/pages/public/ServiceDetailPage.vue';
import { authGuard } from '../src/router/guards';
import { useAuthStore } from '../src/stores/auth';

vi.mock('../src/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  getHttpStatus: (error: unknown) => {
    if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
    const response = error.response;
    return response && typeof response === 'object' && 'status' in response
      ? response.status
      : undefined;
  },
  registerAuthSessionInvalidator: vi.fn(),
  registerTokenRefreshed: vi.fn(),
}));

vi.mock('../src/composables/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));

const SERVICE_ID = 'a1234567-b123-4c12-8d12-1234567890ab';

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE_ID,
    categoryId: 'air-category-id',
    category: { id: 'air-category-id', name: 'Điện lạnh', code: 'AIR', sortOrder: 1, isActive: true },
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

function envelope(data: unknown) {
  return { data: { success: true, statusCode: 200, message: 'OK', data } };
}

function mockService(item: ReturnType<typeof service>) {
  vi.mocked(apiClient.get).mockResolvedValue(envelope(item) as never);
}

async function setup() {
  const pinia = createPinia();
  useAuthStore(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/services', name: 'services', component: { template: '<div />' } },
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
  await router.push('/services/ve-sinh-may-lanh');
  await router.isReady();
  return { router, global: { plugins: [pinia, router] } };
}

describe('Public service detail', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockService(service());
  });

  it.each([
    [
      'a fixed catalog price',
      service({ pricingMode: 'fixed_price', fixedPrice: 250000 }),
      ['Giá niêm yết', '250.000'],
      ['449.000', 'Khảo sát'],
    ],
    [
      'a catalog range',
      service({
        pricingMode: 'inspection_required',
        fixedPrice: 250000,
        priceSummary: { kind: 'fixed_range', minLaborVnd: 199000, maxLaborVnd: 449000 },
      }),
      ['199.000', '449.000', 'thiết bị/phạm vi'],
      ['250.000', 'Giá niêm yết'],
    ],
    [
      'a non-guaranteed survey reference',
      service({
        pricingMode: 'inspection_required',
        fixedPrice: null,
        priceSummary: { kind: 'inspection_reference', minLaborVnd: null, maxLaborVnd: null, suggestedLaborVnd: 249000 },
      }),
      ['Tham khảo', '249.000', 'khảo sát', 'báo giá để bạn duyệt'],
      ['Giá niêm yết'],
    ],
    [
      'survey pricing without an amount',
      service({
        pricingMode: 'inspection_required',
        fixedPrice: null,
        priceSummary: { kind: 'inspection_only', minLaborVnd: null, maxLaborVnd: null },
      }),
      ['Cần khảo sát', 'báo giá để bạn duyệt'],
      ['0 ₫', '250.000'],
    ],
    [
      'unknown pricing without trusting a stale fixed amount',
      service({ pricingMode: 'unknown', fixedPrice: 250000 }),
      ['Chưa có thông tin giá'],
      ['250.000', 'Báo giá sau khảo sát'],
    ],
  ])('shows %s from the catalog without changing its meaning', async (_name, item, expected, absent) => {
    mockService(item as ReturnType<typeof service>);
    const wrapper = mount(ServiceDetailPage, await setup());
    await flushPromises();

    const price = wrapper.get('[data-testid="service-price-summary"]');
    const text = price.text().toLowerCase();
    for (const part of expected as string[]) expect(text).toContain(part.toLowerCase());
    for (const part of absent as string[]) expect(text).not.toContain(part.toLowerCase());
    wrapper.unmount();
  });

  it.each([
    ['equal labor endpoints', 250000, '250.000'],
    ['zero-valued labor endpoints', 0, '0'],
  ])('keeps %s as one scope-based labor amount', async (_name, amount, displayedAmount) => {
    mockService(service({
      pricingMode: 'inspection_required',
      fixedPrice: 975000,
      unit: 'thiết bị',
      priceSummary: { kind: 'fixed_range', minLaborVnd: amount, maxLaborVnd: amount },
    }));
    const wrapper = mount(ServiceDetailPage, await setup());
    await flushPromises();

    const price = wrapper.get('[data-testid="service-price-summary"]');
    expect(price.text()).toContain('Giá công theo thiết bị/phạm vi');
    expect(price.text()).toContain('khảo sát');
    expect(price.text()).toContain('trước khi sửa');
    expect(price.text()).not.toContain('Giá niêm yết');
    expect(price.text()).not.toContain('/ thiết bị');
    expect(price.get('.booking-price__range').text().match(new RegExp(displayedAmount, 'g'))).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps full scope and condition copy in a keyboard-operable disclosure', async () => {
    const fullScope = 'Phạm vi: làm sạch dàn lạnh và dàn nóng. Điều kiện bảo hành theo xác nhận trên yêu cầu dịch vụ.';
    mockService(service({
      description: 'Vệ sinh máy lạnh tại nhà.',
      scopeDescription: fullScope,
    }));
    const wrapper = mount(ServiceDetailPage, await setup());
    await flushPromises();

    expect(wrapper.get('.detail-lead').text()).toBe('Vệ sinh máy lạnh tại nhà.');
    const disclosure = wrapper.get('[data-testid="service-description-details"]');
    expect(disclosure.element.open).toBe(false);
    await disclosure.get('summary').trigger('click');
    expect(disclosure.element.open).toBe(true);
    expect(disclosure.text()).toContain(fullScope);
    wrapper.unmount();
  });

  it('distinguishes a missing service from a catalog connection error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce({ response: { status: 404 } });
    const missing = mount(ServiceDetailPage, await setup());
    await flushPromises();
    expect(missing.text()).toContain('Không tìm thấy dịch vụ này');
    missing.unmount();

    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('private backend detail'));
    const unavailable = mount(ServiceDetailPage, await setup());
    await flushPromises();
    expect(unavailable.text()).toContain('Không thể tải thông tin dịch vụ');
    expect(unavailable.text()).not.toContain('private backend detail');
    unavailable.unmount();
  });
});
