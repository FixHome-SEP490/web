import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * Technician profile after the layout clean-up (PO 10/10/2026): the header
 * already owns the "Đang nhận việc / Tạm nghỉ" switch, a form has one save
 * button, and a service row only offers "Lưu" once it has changed.
 */

const { technicianProfileApi, profileApi, technicianVerificationApi, catalogApi, reviewsApi, geoApi, vietnamProvincesApi } = vi.hoisted(() => ({
  technicianProfileApi: {
    getMyProfile: vi.fn(),
    getMyServices: vi.fn(),
    getMyTimeOff: vi.fn(),
    updateMyProfile: vi.fn(),
    setSkillPricing: vi.fn(),
    updateMySchedule: vi.fn(),
    setDefaultLaborWarranty: vi.fn(),
    getMyServiceAreas: vi.fn(),
    updateMyServiceAreas: vi.fn(),
  },
  profileApi: { getAddresses: vi.fn(), updateMe: vi.fn(), updateAddress: vi.fn(), createAddress: vi.fn() },
  technicianVerificationApi: { getMyVerification: vi.fn() },
  catalogApi: { getServices: vi.fn(), getCategories: vi.fn() },
  reviewsApi: { getByTechnician: vi.fn() },
  geoApi: { autocomplete: vi.fn(), reverse: vi.fn() },
  vietnamProvincesApi: { getProvincesWithDistricts: vi.fn() },
}));

vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi }));
vi.mock('../src/api/profile.api', () => ({ profileApi }));
vi.mock('../src/api/geo.api', () => ({ geoApi }));
vi.mock('../src/api/vietnam-provinces.api', () => ({ vietnamProvincesApi }));
vi.mock('../src/api/technician-verification.api', () => ({ technicianVerificationApi }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi }));
vi.mock('../src/api/reviews.api', () => ({ reviewsApi }));
vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'u-1', fullName: 'Phạm Đức Toàn', email: 'tech@example.test', phoneNumber: '0900000000', avatarUrl: '' },
    token: 't',
    setAuth: vi.fn(),
    fetchProfile: vi.fn(),
  }),
}));
vi.mock('../src/components/account/ChangePasswordCard.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../src/components/account/ReputationCard.vue', () => ({ default: { template: '<div />' } }));

import TechnicianProfilePage from '../src/pages/technician/TechnicianProfilePage.vue';

const PROFILE = {
  bio: 'Sửa điều hoà và tủ lạnh tại nhà.',
  yearsExperience: 4,
  skills: [{ serviceId: 's-1' }],
  schedules: [],
  serviceRadiusKm: 10,
  isAvailable: true,
  averageRating: 5,
  ratingCount: 2,
  reliabilityScore: 100,
};

const SERVICE = {
  id: 's-1',
  name: 'Vệ sinh điều hoà',
  code: 'AC-CLEAN',
  pricingMode: 'quote_based',
  categoryId: 'c-1',
  description: 'Vệ sinh dàn nóng, dàn lạnh',
};

const OFFERING = {
  serviceId: 's-1',
  isActive: true,
  listedLaborPrice: 150000,
  typicalWarrantyDays: 30,
  level: 'INTERMEDIATE',
  verificationStatus: 'verified',
};

const stubs = {
  FhButton: {
    props: ['disabled', 'loading', 'variant', 'size', 'block'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  FhConfirmDialog: true,
  FhSkeleton: { template: '<div data-testid="skeleton" />' },
  MapTilerMap: true,
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
};

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(TechnicianProfilePage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

const buttonsWith = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').filter((b) => b.text().trim() === text);

describe('Hồ sơ kỹ thuật viên: bố cục gọn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    technicianProfileApi.getMyProfile.mockReset();
    technicianProfileApi.getMyProfile.mockResolvedValue({ ...PROFILE });
    technicianProfileApi.getMyServices.mockResolvedValue([{ ...OFFERING }]);
    technicianProfileApi.getMyTimeOff.mockResolvedValue([]);
    profileApi.getAddresses.mockResolvedValue([]);
    technicianVerificationApi.getMyVerification.mockResolvedValue({ status: 'VERIFIED', rejectionReason: null, documents: [] });
    catalogApi.getServices.mockResolvedValue({ data: [{ ...SERVICE }] });
    catalogApi.getCategories.mockResolvedValue([]);
    reviewsApi.getByTechnician.mockResolvedValue({ data: [], total: 0 });
    technicianProfileApi.getMyServiceAreas.mockResolvedValue([]);
  });

  it('has no second availability switch: the header owns it', async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).not.toContain('Đang sẵn sàng nhận việc');
    expect(wrapper.text()).not.toContain('Tạm dừng nhận việc');
    expect(technicianProfileApi.updateMyProfile).not.toHaveBeenCalled();
  });

  it('shows rating, experience and reliability once, not again as cards', async () => {
    const wrapper = await mountPage();
    const text = wrapper.text();

    expect(text).toContain('4 năm kinh nghiệm');
    expect(text.split('Độ tin cậy').length - 1).toBe(1);
    expect(text).not.toContain('Điểm độ tin cậy');
    expect(text).not.toContain('Bán kính quét đơn');
  });

  it('the personal form has exactly one save button', async () => {
    const wrapper = await mountPage();

    expect(buttonsWith(wrapper, 'Lưu thay đổi')).toHaveLength(1);
  });

  it('a service row offers "Lưu" only after it is changed', async () => {
    technicianProfileApi.setSkillPricing.mockResolvedValue({ ...OFFERING, listedLaborPrice: 200000 });
    const wrapper = await mountPage();
    await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Dịch vụ và giá công'))!.trigger('click');

    expect(buttonsWith(wrapper, 'Lưu')).toHaveLength(0);

    await wrapper.get('#tp-price-s-1').setValue('200000');
    const save = buttonsWith(wrapper, 'Lưu');
    expect(save).toHaveLength(1);

    await save[0].trigger('click');
    await flushPromises();
    expect(technicianProfileApi.setSkillPricing).toHaveBeenCalledWith('s-1', {
      isActive: true,
      level: 'INTERMEDIATE',
      typicalWarrantyDays: 30,
      listedLaborPrice: 200000,
    });
  });

  it('sets the default labor warranty, for every service when asked (PO 10/10/2026)', async () => {
    technicianProfileApi.getMyProfile.mockResolvedValue({ ...PROFILE, defaultLaborWarrantyDays: 30 });
    technicianProfileApi.setDefaultLaborWarranty.mockResolvedValue({ defaultLaborWarrantyDays: 90, servicesUpdated: 1 });
    technicianProfileApi.getMyServices.mockResolvedValue([{ ...OFFERING, typicalWarrantyDays: null }]);
    const wrapper = await mountPage();
    await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Dịch vụ và giá công'))!.trigger('click');

    const input = wrapper.get('#tp-default-warranty');
    expect((input.element as HTMLInputElement).value).toBe('30');
    expect(buttonsWith(wrapper, 'Lưu mặc định')).toHaveLength(0);
    // A service without its own value shows the default instead of a made-up 30.
    expect((wrapper.get('#tp-warranty-s-1').element as HTMLInputElement).value).toBe('');
    expect(wrapper.get('#tp-warranty-s-1').attributes('placeholder')).toBe('30 (mặc định)');

    await input.setValue('400');
    expect(buttonsWith(wrapper, 'Lưu mặc định')[0].attributes('disabled')).toBeDefined();

    await input.setValue('90');
    await wrapper.get('[data-testid="warranty-apply-all"]').setValue(true);
    technicianProfileApi.getMyServices.mockResolvedValue([{ ...OFFERING, typicalWarrantyDays: 90 }]);
    await wrapper.get('[data-testid="default-warranty"]').trigger('submit');
    await flushPromises();

    expect(technicianProfileApi.setDefaultLaborWarranty).toHaveBeenCalledWith(90, true);
    expect(wrapper.text()).toContain('Đã đặt bảo hành 90 ngày cho mọi dịch vụ.');
    expect((wrapper.get('#tp-warranty-s-1').element as HTMLInputElement).value).toBe('90');
    expect(buttonsWith(wrapper, 'Lưu mặc định')).toHaveLength(0);
  });

  it('a failed save of the default says only to try again', async () => {
    technicianProfileApi.setDefaultLaborWarranty.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL', message: 'Internal server error' } } } });
    const wrapper = await mountPage();
    await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Dịch vụ và giá công'))!.trigger('click');

    await wrapper.get('#tp-default-warranty').setValue('60');
    await wrapper.get('[data-testid="default-warranty"]').trigger('submit');
    await flushPromises();

    expect(technicianProfileApi.setDefaultLaborWarranty).toHaveBeenCalledWith(60, false);
    expect(wrapper.text()).toContain('Chưa lưu được. Vui lòng thử lại.');
    expect(wrapper.text()).not.toMatch(/Internal server error|INTERNAL|500/);
  });

  it('skill levels read as Vietnamese words, not enum codes', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Dịch vụ và giá công'))!.trigger('click');
    const options = wrapper.get('#tp-level-s-1').findAll('option').map((o) => o.text());

    expect(options).toEqual(['Thợ mới', 'Thợ lành nghề', 'Thợ kỹ thuật cao', 'Chuyên gia']);
  });

  it('a failed load shows a plain line, and "Thử lại" really recovers', async () => {
    technicianProfileApi.getMyProfile
      .mockRejectedValueOnce({ response: { status: 500, data: { error: { code: 'INTERNAL', message: 'Internal server error' } } } })
      .mockResolvedValueOnce({ ...PROFILE });
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Không thể tải hồ sơ. Vui lòng thử lại.');
    expect(wrapper.text()).not.toMatch(/Internal server error|INTERNAL/);

    await buttonsWith(wrapper, 'Thử lại')[0].trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('Không thể tải hồ sơ');
    expect(wrapper.text()).toContain('Thông tin hiển thị cho khách hàng');
  });

  it('an unverified technician gets one clear way to the identity check', async () => {
    technicianVerificationApi.getMyVerification.mockResolvedValue(null);
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Bạn chưa gửi hồ sơ xác minh danh tính.');
    expect(wrapper.findAll('a').filter((a) => a.text() === 'Xác minh ngay')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Khu vực nhận việc: areas for when the app is closed, and the map (PO 12/10/2026)
// ---------------------------------------------------------------------------

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
  { code: 1, name: 'Thành phố Hà Nội', districts: [{ code: 2, name: 'Quận Hoàn Kiếm' }] },
];

const ADDRESS = {
  id: 'a-1',
  line1: '12 Lê Lợi',
  ward: 'Phường Bến Nghé',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  lat: 10.7745,
  lng: 106.701,
  isDefault: true,
};

const mapRefresh = vi.fn();
const MapStub = defineComponent({
  name: 'MapTilerMap',
  props: ['center', 'markers', 'zoom', 'clickToMove', 'heightClass'],
  emits: ['marker-move'],
  setup(_, { expose }) {
    expose({ refresh: mapRefresh, flyTo: vi.fn() });
    return () => h('div', { 'data-testid': 'map' });
  },
});

async function openLocationTab(): Promise<VueWrapper> {
  const wrapper = mount(TechnicianProfilePage, { global: { stubs: { ...stubs, MapTilerMap: MapStub } } });
  await flushPromises();
  await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Khu vực nhận việc'))!.trigger('click');
  await flushPromises();
  return wrapper;
}

const districtChip = (wrapper: VueWrapper, name: string) =>
  wrapper.get('[aria-label="Quận/huyện"]').findAll('button').find((b) => b.text() === name)!;

const SERVER_ERROR = { response: { status: 500, data: { error: { code: 'INTERNAL', message: 'Internal server error' } } } };

describe('Hồ sơ kỹ thuật viên: khu vực nhận đơn khi tắt app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    technicianProfileApi.getMyProfile.mockReset();
    technicianProfileApi.getMyProfile.mockResolvedValue({ ...PROFILE });
    technicianProfileApi.getMyServices.mockResolvedValue([{ ...OFFERING }]);
    technicianProfileApi.getMyTimeOff.mockResolvedValue([]);
    technicianProfileApi.updateMyProfile.mockResolvedValue({ ...PROFILE });
    technicianProfileApi.getMyServiceAreas.mockReset();
    technicianProfileApi.getMyServiceAreas.mockResolvedValue([
      { provinceCode: '79', districtCode: '760' },
      { provinceCode: '79', districtCode: '764' },
    ]);
    technicianProfileApi.updateMyServiceAreas.mockReset();
    technicianProfileApi.updateMyServiceAreas.mockImplementation(async (areas: unknown) => areas);
    profileApi.getAddresses.mockResolvedValue([{ ...ADDRESS }]);
    profileApi.updateAddress.mockResolvedValue({ ...ADDRESS });
    technicianVerificationApi.getMyVerification.mockResolvedValue({ status: 'VERIFIED', rejectionReason: null, documents: [] });
    catalogApi.getServices.mockResolvedValue({ data: [{ ...SERVICE }] });
    catalogApi.getCategories.mockResolvedValue([]);
    reviewsApi.getByTechnician.mockResolvedValue({ data: [], total: 0 });
    vietnamProvincesApi.getProvincesWithDistricts.mockResolvedValue(PROVINCES);
  });

  it('loads the saved areas and shows how many are chosen', async () => {
    const wrapper = await openLocationTab();

    expect(technicianProfileApi.getMyServiceAreas).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Khu vực nhận đơn khi tắt app');
    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Đã chọn 2 khu vực');
    expect((wrapper.get('#tp-area-province').element as HTMLSelectElement).value).toBe('79');
    expect(districtChip(wrapper, 'Quận 1').attributes('aria-pressed')).toBe('true');
    expect(districtChip(wrapper, 'Quận Gò Vấp').attributes('aria-pressed')).toBe('true');
  });

  it('saves districts of several provinces with the one "Lưu khu vực" button', async () => {
    const wrapper = await openLocationTab();
    expect(buttonsWith(wrapper, 'Lưu khu vực')).toHaveLength(1);

    await districtChip(wrapper, 'Quận Gò Vấp').trigger('click');
    await districtChip(wrapper, 'Quận 2').trigger('click');
    await wrapper.get('#tp-area-province').setValue('1');
    await districtChip(wrapper, 'Quận Hoàn Kiếm').trigger('click');
    await buttonsWith(wrapper, 'Lưu khu vực')[0].trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMyServiceAreas).toHaveBeenCalledWith([
      { provinceCode: '79', districtCode: '760' },
      { provinceCode: '79', districtCode: '769' },
      { provinceCode: '1', districtCode: '2' },
    ]);
    expect(wrapper.text()).toContain('Đã lưu khu vực nhận việc.');
    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Đã chọn 3 khu vực');
  });

  it('allows an empty selection, which means "theo bán kính"', async () => {
    const wrapper = await openLocationTab();

    await wrapper.findAll('button').find((b) => b.text() === 'Bỏ chọn')!.trigger('click');
    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Chưa chọn khu vực nào, nhận đơn theo bán kính.');
    await buttonsWith(wrapper, 'Lưu khu vực')[0].trigger('click');
    await flushPromises();

    expect(technicianProfileApi.updateMyServiceAreas).toHaveBeenCalledWith([]);
  });

  it('does not resend unchanged areas when only the address is saved', async () => {
    const wrapper = await openLocationTab();
    await buttonsWith(wrapper, 'Lưu khu vực')[0].trigger('click');
    await flushPromises();

    expect(profileApi.updateAddress).toHaveBeenCalled();
    expect(technicianProfileApi.updateMyServiceAreas).not.toHaveBeenCalled();
  });

  it('a failed load of the saved areas never saves over them, and "Thử lại" recovers', async () => {
    technicianProfileApi.getMyServiceAreas.mockReset();
    technicianProfileApi.getMyServiceAreas
      .mockRejectedValueOnce(SERVER_ERROR)
      .mockResolvedValueOnce([{ provinceCode: '79', districtCode: '760' }]);
    const wrapper = await openLocationTab();

    expect(wrapper.text()).toContain('Không tải được khu vực đã chọn.');
    expect(wrapper.text()).not.toMatch(/Internal server error|INTERNAL|500/);
    await buttonsWith(wrapper, 'Lưu khu vực')[0].trigger('click');
    await flushPromises();
    expect(technicianProfileApi.updateMyServiceAreas).not.toHaveBeenCalled();

    await buttonsWith(wrapper, 'Thử lại')[0].trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="area-summary"]').text()).toBe('Đã chọn 1 khu vực');
  });

  it('a failed save says only to try again', async () => {
    technicianProfileApi.updateMyServiceAreas.mockRejectedValue(SERVER_ERROR);
    const wrapper = await openLocationTab();

    await districtChip(wrapper, 'Quận 2').trigger('click');
    await buttonsWith(wrapper, 'Lưu khu vực')[0].trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Chưa lưu được. Vui lòng thử lại.');
    expect(wrapper.text()).not.toMatch(/Internal server error|INTERNAL|500/);
  });

  it('re-measures and re-centres the map each time the tab is shown', async () => {
    const wrapper = await openLocationTab();
    expect(mapRefresh).toHaveBeenCalledTimes(1);

    await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Thông tin'))!.trigger('click');
    await wrapper.findAll('[role="tab"]').find((t) => t.text().includes('Khu vực nhận việc'))!.trigger('click');
    await flushPromises();
    expect(mapRefresh).toHaveBeenCalledTimes(2);
    expect(wrapper.findComponent(MapStub).props('zoom')).toBe(14);
  });

  it('a pin dropped at sea is not taken as the address', async () => {
    vi.useFakeTimers();
    try {
      geoApi.reverse.mockResolvedValue({ lat: 10.5, lng: 107.9, formattedAddress: 'Biển Đông', ward: 'Biển Đông', province: 'Tỉnh Lâm Đồng' });
      const wrapper = await openLocationTab();

      wrapper.findComponent(MapStub).vm.$emit('marker-move', 'picker', 10.5, 107.9);
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();

      expect(geoApi.reverse).toHaveBeenCalledWith(10.5, 107.9);
      expect(wrapper.get('[data-testid="location-notice"]').text()).toBe('Vị trí này chưa có địa chỉ, hãy kéo ghim vào đúng nhà.');
      expect(wrapper.text()).toContain('Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh');
      expect(wrapper.text()).not.toContain('Lâm Đồng');
      expect(wrapper.findComponent(MapStub).props('markers')).toEqual([
        expect.objectContaining({ id: 'picker', lat: 10.7745, lng: 106.701 }),
      ]);

      await buttonsWith(wrapper, 'Lưu khu vực')[0].trigger('click');
      await flushPromises();
      expect(profileApi.updateAddress).toHaveBeenCalledWith('a-1', expect.objectContaining({
        line1: '12 Lê Lợi',
        province: 'TP. Hồ Chí Minh',
        lat: 10.7745,
        lng: 106.701,
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pin dropped on land becomes the address', async () => {
    vi.useFakeTimers();
    try {
      geoApi.reverse.mockResolvedValue({
        lat: 10.78,
        lng: 106.7,
        formattedAddress: '5 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh',
        ward: 'Phường Sài Gòn',
        province: 'Thành phố Hồ Chí Minh',
      });
      const wrapper = await openLocationTab();

      wrapper.findComponent(MapStub).vm.$emit('marker-move', 'picker', 10.78, 106.7);
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();

      expect(wrapper.find('[data-testid="location-notice"]').exists()).toBe(false);
      expect((wrapper.get('#tp-location').element as HTMLInputElement).value).toBe('5 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh');
    } finally {
      vi.useRealTimers();
    }
  });
});
