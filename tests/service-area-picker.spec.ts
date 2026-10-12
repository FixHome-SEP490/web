import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { TechnicianServiceAreaView } from '../src/api/technician-profile.api';

/**
 * "Khu vực nhận đơn khi tắt app" (PO 12/10/2026): many districts, in more than
 * one province; an empty list means "radius only".
 */

const { vietnamProvincesApi } = vi.hoisted(() => ({
  vietnamProvincesApi: { getProvincesWithDistricts: vi.fn() },
}));
vi.mock('../src/api/vietnam-provinces.api', () => ({ vietnamProvincesApi }));

import ServiceAreaPicker from '../src/components/technician/ServiceAreaPicker.vue';

const PROVINCES = [
  {
    code: 79,
    name: 'Thành phố Hồ Chí Minh',
    districts: [
      { code: 760, name: 'Quận 1' },
      { code: 769, name: 'Quận 2' },
      { code: 764, name: 'Quận Gò Vấp' },
    ],
  },
  {
    code: 1,
    name: 'Thành phố Hà Nội',
    districts: [
      { code: 1, name: 'Quận Ba Đình' },
      { code: 2, name: 'Quận Hoàn Kiếm' },
    ],
  },
  { code: 74, name: 'Tỉnh Bình Dương', districts: [{ code: 718, name: 'Thành phố Thủ Dầu Một' }] },
];

const stubs = { FhSkeleton: { template: '<div data-testid="skeleton" />' } };

/** Mounts the picker as v-model would drive it. */
async function mountPicker(props: { modelValue?: TechnicianServiceAreaView[]; defaultProvinceName?: string; loading?: boolean; loadFailed?: boolean } = {}) {
  const wrapper: VueWrapper = mount(ServiceAreaPicker, {
    props: {
      modelValue: [],
      ...props,
      'onUpdate:modelValue': (value: TechnicianServiceAreaView[]) => wrapper.setProps({ modelValue: value }),
    },
    global: { stubs },
  });
  await flushPromises();
  return wrapper;
}

const model = (wrapper: VueWrapper) => wrapper.props('modelValue') as TechnicianServiceAreaView[];
const chip = (wrapper: VueWrapper, name: string) =>
  wrapper.get('[aria-label="Quận/huyện"]').findAll('button').find((b) => b.text() === name)!;
const button = (wrapper: VueWrapper, text: string) => wrapper.findAll('button').find((b) => b.text() === text)!;
const selectedProvince = (wrapper: VueWrapper) => (wrapper.get('#tp-area-province').element as HTMLSelectElement).value;

describe('ServiceAreaPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vietnamProvincesApi.getProvincesWithDistricts.mockResolvedValue(PROVINCES);
  });

  it('opens on the province of the start address, matched by name', async () => {
    const wrapper = await mountPicker({ defaultProvinceName: 'Bình Dương' });
    expect(selectedProvince(wrapper)).toBe('74');

    const hcm = await mountPicker({ defaultProvinceName: 'TP. Hồ Chí Minh' });
    expect(selectedProvince(hcm)).toBe('79');
  });

  it('falls back to Ho Chi Minh City when the address province is unknown', async () => {
    const wrapper = await mountPicker({ defaultProvinceName: 'Nơi không có' });
    expect(selectedProvince(wrapper)).toBe('79');
  });

  it('shows saved areas as removable chips and the saved count', async () => {
    const wrapper = await mountPicker({
      modelValue: [
        { provinceCode: '79', districtCode: '760' },
        { provinceCode: '79', districtCode: '764' },
      ],
    });

    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Đã chọn 2 khu vực');
    expect(wrapper.get('[aria-label="Khu vực đã chọn"]').text()).toContain('Quận 1');
    expect(chip(wrapper, 'Quận 1').attributes('aria-pressed')).toBe('true');
    expect(chip(wrapper, 'Quận 2').attributes('aria-pressed')).toBe('false');

    await wrapper.get('[aria-label="Bỏ Quận 1"]').trigger('click');
    expect(model(wrapper)).toEqual([{ provinceCode: '79', districtCode: '764' }]);
  });

  it('selects and deselects districts as toggle chips', async () => {
    const wrapper = await mountPicker();

    await chip(wrapper, 'Quận 2').trigger('click');
    await chip(wrapper, 'Quận Gò Vấp').trigger('click');
    expect(model(wrapper)).toEqual([
      { provinceCode: '79', districtCode: '769' },
      { provinceCode: '79', districtCode: '764' },
    ]);

    await chip(wrapper, 'Quận 2').trigger('click');
    expect(model(wrapper)).toEqual([{ provinceCode: '79', districtCode: '764' }]);
  });

  it('keeps areas in more than one province and names the province on each chip', async () => {
    const wrapper = await mountPicker();
    await chip(wrapper, 'Quận 1').trigger('click');

    await wrapper.get('#tp-area-province').setValue('1');
    await chip(wrapper, 'Quận Hoàn Kiếm').trigger('click');

    expect(model(wrapper)).toEqual([
      { provinceCode: '79', districtCode: '760' },
      { provinceCode: '1', districtCode: '2' },
    ]);
    const selected = wrapper.get('[aria-label="Khu vực đã chọn"]').text();
    expect(selected).toContain('Quận 1, Hồ Chí Minh');
    expect(selected).toContain('Quận Hoàn Kiếm, Hà Nội');
    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Đã chọn 2 khu vực');
  });

  it('"Chọn tất cả" and "Bỏ chọn" act on the province shown, and the search narrows them', async () => {
    const wrapper = await mountPicker({ modelValue: [{ provinceCode: '1', districtCode: '1' }], defaultProvinceName: 'Hồ Chí Minh' });

    await button(wrapper, 'Chọn tất cả').trigger('click');
    expect(model(wrapper)).toHaveLength(4);

    await button(wrapper, 'Bỏ chọn').trigger('click');
    expect(model(wrapper)).toEqual([{ provinceCode: '1', districtCode: '1' }]);

    await wrapper.get('#tp-area-search').setValue('go vap');
    expect(wrapper.get('[aria-label="Quận/huyện"]').findAll('button').map((b) => b.text())).toEqual(['Quận Gò Vấp']);
    await button(wrapper, 'Chọn tất cả').trigger('click');
    expect(model(wrapper)).toEqual([
      { provinceCode: '1', districtCode: '1' },
      { provinceCode: '79', districtCode: '764' },
    ]);
  });

  it('an empty selection reads as "theo bán kính"', async () => {
    const wrapper = await mountPicker();
    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Chưa chọn khu vực nào, nhận đơn theo bán kính.');
  });

  it('matches a saved "01" province code to province 1 without rewriting it', async () => {
    const wrapper = await mountPicker({ modelValue: [{ provinceCode: '01', districtCode: '002' }] });
    await wrapper.get('#tp-area-province').setValue('1');

    expect(chip(wrapper, 'Quận Hoàn Kiếm').attributes('aria-pressed')).toBe('true');
    await chip(wrapper, 'Quận Hoàn Kiếm').trigger('click');
    expect(model(wrapper)).toEqual([]);
  });

  it('shows a skeleton while loading', async () => {
    const wrapper = await mountPicker({ loading: true });
    expect(wrapper.findAll('[data-testid="skeleton"]').length).toBeGreaterThan(0);
    expect(wrapper.find('#tp-area-province').exists()).toBe(false);
  });

  it('a failed district list says only to try again, and "Thử lại" recovers', async () => {
    vietnamProvincesApi.getProvincesWithDistricts.mockRejectedValueOnce(new Error('HTTP error 500 when fetching provinces'));
    const wrapper = await mountPicker();

    expect(wrapper.text()).toContain('Không tải được danh sách quận.');
    expect(wrapper.text()).not.toMatch(/HTTP|500/);
    await button(wrapper, 'Thử lại').trigger('click');
    await flushPromises();

    expect(vietnamProvincesApi.getProvincesWithDistricts).toHaveBeenCalledTimes(2);
    expect(wrapper.find('#tp-area-province').exists()).toBe(true);
  });

  it('a failed saved list hides the editor and asks the page to retry', async () => {
    const wrapper = await mountPicker({ loadFailed: true });

    expect(wrapper.text()).toContain('Không tải được khu vực đã chọn.');
    expect(wrapper.find('#tp-area-province').exists()).toBe(false);
    await button(wrapper, 'Thử lại').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });
});
