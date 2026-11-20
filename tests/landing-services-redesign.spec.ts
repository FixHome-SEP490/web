import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { catalogApi, type ServiceCategory } from '../src/api/catalog.api';
import LandingServices from '../src/components/landing/LandingServices.vue';

vi.mock('../src/api/catalog.api', () => ({
  catalogApi: { getCategories: vi.fn() },
}));

const mockCategories: ServiceCategory[] = [
  { id: 'cat-ac', name: 'Điều hòa', code: 'CAT_AC', sortOrder: 1, isActive: true, description: 'Vệ sinh, sửa chữa và lắp đặt điều hòa.' },
  { id: 'cat-wm', name: 'Máy giặt & máy sấy', code: 'CAT_LAUNDRY', sortOrder: 2, isActive: true, description: 'Vệ sinh, sửa chữa máy giặt và máy sấy.' },
  { id: 'cat-fr', name: 'Tủ lạnh', code: 'CAT_FRIDGE', sortOrder: 3, isActive: true, description: 'Kiểm tra và sửa chữa tủ lạnh.' },
  { id: 'cat-ro', name: 'Máy lọc nước', code: 'CAT_RO', sortOrder: 4, isActive: true, description: 'Bảo dưỡng và sửa chữa máy lọc nước.' },
  { id: 'cat-wh', name: 'Bình nóng lạnh', code: 'CAT_HEATER', sortOrder: 5, isActive: true, description: 'Sửa chữa và bảo dưỡng bình nóng lạnh.' },
  { id: 'cat-kt', name: 'Thiết bị nhà bếp', code: 'CAT_KITCHEN', sortOrder: 6, isActive: true, description: 'Dịch vụ sửa chữa thiết bị nhà bếp.' },
];

async function createWrapper(categories: ServiceCategory[] = mockCategories) {
  vi.mocked(catalogApi.getCategories).mockResolvedValue(categories);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/services', name: 'services', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  const wrapper = mount(LandingServices, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('LandingServices Modern Redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header Section', () => {
    it('renders the header badge "Danh mục dịch vụ" with wrench icon', async () => {
      const { wrapper } = await createWrapper();
      const badge = wrapper.find('.inline-flex.rounded-full');
      expect(badge.exists()).toBe(true);
      expect(badge.text()).toContain('Danh mục dịch vụ');
      expect(badge.find('svg').exists()).toBe(true);
    });

    it('renders the main heading and description', async () => {
      const { wrapper } = await createWrapper();
      const title = wrapper.get('#services-title');
      expect(title.text()).toBe('Dịch vụ cho ngôi nhà của bạn');
      expect(wrapper.text()).toContain('Tùy dịch vụ, bạn xem giá công theo loại máy hoặc nhận báo giá sau khảo sát.');
    });

    it('renders "Xem tất cả dịch vụ →" as a styled pill button on the right', async () => {
      const { wrapper } = await createWrapper();
      const allLink = wrapper.findAll('a').find((a) => a.text().includes('Xem tất cả dịch vụ'))!;
      expect(allLink.exists()).toBe(true);
      expect(allLink.attributes('href')).toBe('/services');
      expect(allLink.classes()).toContain('rounded-full');
      expect(allLink.classes()).toContain('border');
      expect(allLink.find('svg').exists()).toBe(true);
    });
  });

  describe('Horizontal Service Cards Layout', () => {
    it('renders 6 service cards in a responsive grid (3 cols desktop, 2 cols tablet, 1 col mobile)', async () => {
      const { wrapper } = await createWrapper();
      const cards = wrapper.findAll('.service-card');
      expect(cards).toHaveLength(6);

      const grid = wrapper.find('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-3');
      expect(grid.exists()).toBe(true);
    });

    it('structures each card as a horizontal card with image on left and content on right', async () => {
      const { wrapper } = await createWrapper();
      const cards = wrapper.findAll('.service-card');

      for (const card of cards) {
        expect(card.classes()).toContain('flex-row');
        expect(card.classes()).toContain('rounded-[20px]');
        const img = card.find('img');
        expect(img.exists()).toBe(true);
        expect(img.classes()).toContain('object-contain');
        expect(card.find('h3').exists()).toBe(true);
        expect(card.find('p').exists()).toBe(true);
        expect(card.text()).toContain('Xem dịch vụ');
      }
    });

    it('correctly maps each service category to its corresponding artwork', async () => {
      const { wrapper } = await createWrapper();
      const cards = wrapper.findAll('.service-card');

      expect(cards[0].find('img').attributes('src')).toBe('/images/services/svc-sua-dieu-hoa.png');
      expect(cards[1].find('img').attributes('src')).toBe('/images/services/svc-sua-may-giat.png');
      expect(cards[2].find('img').attributes('src')).toBe('/images/services/svc-sua-tu-lanh.png');
      expect(cards[3].find('img').attributes('src')).toBe('/images/services/svc-lap-may-loc-nuoc.png');
      expect(cards[4].find('img').attributes('src')).toBe('/images/services/svc-ve-sinh-binh-nong-lanh.png');
      expect(cards[5].find('img').attributes('src')).toBe('/images/services/svc-sua-bep-tu.png');
    });

    it('keeps uniform standard card styling across all cards unless a category is marked featured in data', async () => {
      const { wrapper } = await createWrapper();
      const cards = wrapper.findAll('.service-card');

      for (const card of cards) {
        expect(card.classes()).toContain('card-standard');
        expect(card.classes()).not.toContain('card-featured');
        const btn = card.find('span.inline-flex.rounded-full');
        expect(btn.classes()).toContain('text-brand-600');
        expect(btn.classes()).not.toContain('bg-brand-600');
      }
    });

    it('renders "Dịch vụ phổ biến" badge and featured styling when category is marked popular or featured in data', async () => {
      const categoriesWithPopular = [
        { ...mockCategories[0], isPopular: true } as ServiceCategory,
        ...mockCategories.slice(1),
      ];
      const { wrapper } = await createWrapper(categoriesWithPopular);
      const cards = wrapper.findAll('.service-card');
      expect(wrapper.text()).toContain('Dịch vụ phổ biến');
      expect(cards[0].classes()).toContain('card-featured');
      expect(cards[0].find('span.inline-flex.rounded-full.bg-brand-600').exists()).toBe(true);
      expect(cards[1].classes()).toContain('card-standard');
    });

    it('navigates to the correct catalog filtered route when a card is clicked', async () => {
      const { wrapper, router } = await createWrapper();
      const cards = wrapper.findAll('.service-card');

      expect(cards[0].attributes('href')).toBe('/services?category=cat-ac');
      await cards[0].trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/services?category=cat-ac');
    });
  });

  describe('Loading and Error States', () => {
    it('renders 6 skeleton cards with horizontal layout during loading', async () => {
      vi.mocked(catalogApi.getCategories).mockReturnValue(new Promise(() => {}));
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: { template: '<div />' } },
          { path: '/services', name: 'services', component: { template: '<div />' } },
        ],
      });
      const wrapper = mount(LandingServices, { global: { plugins: [router] } });
      expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('Đang tải danh mục dịch vụ');
      expect(wrapper.findAll('[role="status"] > div')).toHaveLength(6);
    });
  });
});
