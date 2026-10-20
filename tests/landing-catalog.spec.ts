import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { catalogApi, type ServiceCategory } from '../src/api/catalog.api';
import LandingServices from '../src/components/landing/LandingServices.vue';
import { categoryIcon } from '../src/components/booking/service-icons';
import { Droplets, Refrigerator, WashingMachine, Wind } from 'lucide-vue-next';

vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories: vi.fn() } }));

describe('landing catalog highlights', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses distinctive code icons when iconKey and category names are missing', () => {
    expect(categoryIcon({ code: 'CAT_AC', iconKey: null })).toBe(Wind);
    expect(categoryIcon({ code: 'CAT_LAUNDRY', iconKey: null })).toBe(WashingMachine);
    expect(categoryIcon({ code: 'CAT_FRIDGE', iconKey: null })).toBe(Refrigerator);
    expect(categoryIcon({ code: 'CAT_RO', iconKey: null })).toBe(Droplets);
  });

  it('shows six active highlights, useful descriptions and the full category count', async () => {
    const categories: ServiceCategory[] = Array.from({ length: 13 }, (_, i) => ({
      id: `cat-${i}`, name: `Danh mục ${i + 1}`, code: i === 0 ? 'CAT_AC' : `CAT_${i}`,
      description: i === 0 ? 'Catalog V2 — chưa kích hoạt' : i === 1 ? 'Chưa kích hoạt' : i === 2 ? 'Catalog V2' : i === 3 ? 'Chăm sóc thiết bị tại nhà.' : null,
      iconKey: null, sortOrder: i, isActive: true,
    }));
    vi.mocked(catalogApi.getCategories).mockResolvedValue([{ ...categories[0], id: 'inactive', isActive: false }, ...categories]);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/services', name: 'services', component: { template: '<div />' } }] });
    await router.push('/');
    const wrapper = mount(LandingServices, { global: { plugins: [router] } });
    await flushPromises();
    const cards = wrapper.findAll('.service-card');
    expect(cards).toHaveLength(6);
    expect(cards[0].text()).toContain('Vệ sinh, bảo dưỡng và sửa máy lạnh.');
    expect(wrapper.text()).not.toMatch(/chưa kích hoạt|catalog v2/i);
    expect(cards[3].text()).toContain('Chăm sóc thiết bị tại nhà.');
    const all = wrapper.findAll('a').find((a) => a.text().includes('Xem tất cả'))!;
    // The one way off the landing into the full catalog (PO 21/10/2026).
    expect(all.text()).toContain('Xem tất cả dịch vụ');
    expect(all.attributes('href')).toBe('/services');
    expect(cards[5].attributes('href')).toBe('/services?category=cat-5');
    wrapper.unmount();
  });
});
