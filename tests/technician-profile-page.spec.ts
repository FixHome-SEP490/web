import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';

/**
 * Technician profile after the layout clean-up (PO 10/10/2026): the header
 * already owns the "Đang nhận việc / Tạm nghỉ" switch, a form has one save
 * button, and a service row only offers "Lưu" once it has changed.
 */

const { technicianProfileApi, profileApi, technicianVerificationApi, catalogApi, reviewsApi } = vi.hoisted(() => ({
  technicianProfileApi: {
    getMyProfile: vi.fn(),
    getMyServices: vi.fn(),
    getMyTimeOff: vi.fn(),
    updateMyProfile: vi.fn(),
    setSkillPricing: vi.fn(),
    updateMySchedule: vi.fn(),
    setDefaultLaborWarranty: vi.fn(),
  },
  profileApi: { getAddresses: vi.fn(), updateMe: vi.fn() },
  technicianVerificationApi: { getMyVerification: vi.fn() },
  catalogApi: { getServices: vi.fn(), getCategories: vi.fn() },
  reviewsApi: { getByTechnician: vi.fn() },
}));

vi.mock('../src/api/technician-profile.api', () => ({ technicianProfileApi }));
vi.mock('../src/api/profile.api', () => ({ profileApi }));
vi.mock('../src/api/geo.api', () => ({ geoApi: { autocomplete: vi.fn(), reverse: vi.fn() } }));
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
