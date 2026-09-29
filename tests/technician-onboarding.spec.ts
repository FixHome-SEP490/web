import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TechnicianOnboardingPage from '../src/pages/technician/TechnicianOnboardingPage.vue';
import { technicianOnboardingApi } from '../src/api/technician-onboarding.api';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../src/api/technician-onboarding.api', () => ({
  technicianOnboardingApi: {
    getStatus: vi.fn(),
    savePersonalInfo: vi.fn(),
    saveSkills: vi.fn(),
    saveAddress: vi.fn(),
    submit: vi.fn(),
  },
}));

vi.mock('../src/api/catalog.api', () => ({
  catalogApi: {
    getCategories: vi.fn().mockResolvedValue([]),
    getServices: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('../src/api/vietnam-provinces.api', () => ({
  vietnamProvincesApi: {
    getProvincesWithDistricts: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mountOptions = {
  global: {
    stubs: {
      'router-link': { template: '<a><slot /></a>' },
    },
  },
};

describe('TechnicianOnboardingPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    const authStore = useAuthStore();
    authStore.setAuth('mock-token', {
      id: 'f1c85eb3-1111-2222-3333-444455556666',
      email: 'cuminhvippro@gmail.com',
      fullName: 'minh CU',
      role: UserRole.TECHNICIAN,
      phoneNumber: '0987654321',
    });
  });

  it('renders Step 1 Active Wizard for newly registered technician (onboardingStatus: not_started, verificationStatus: pending)', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({
      onboardingStatus: 'not_started',
      verificationStatus: 'pending',
      currentStep: 1,
      personalInfoCompleted: false,
      kycSubmitted: false,
      skillsSelected: false,
      addressSet: false,
    });

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();

    // Must NOT display "Hồ sơ thợ đã được tiếp nhận!"
    expect(wrapper.text()).not.toContain('Hồ sơ thợ đã được tiếp nhận!');
    expect(wrapper.text()).not.toContain('ĐANG CHỜ BAN QUẢN TRỊ PHÊ DUYỆT');

    // Must display Active Wizard Step 1 Form
    expect(wrapper.text()).toContain('Xác minh & Hoàn tất Hồ sơ Kỹ thuật viên');
    expect(wrapper.text()).toContain('Bước 1: Thông tin cá nhân & Số CCCD');
    expect(wrapper.find('input[placeholder="Nguyễn Văn A"]').exists()).toBe(true);
  });

  it('renders Active Wizard for in-progress technician at their saved current step', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({
      onboardingStatus: 'in_progress',
      verificationStatus: 'pending',
      currentStep: 3,
      personalInfoCompleted: true,
      kycSubmitted: true,
      skillsSelected: false,
      addressSet: false,
      fullName: 'minh CU',
      dateOfBirth: '1995-08-20',
      gender: 'male',
      citizenIdNumber: '001200001111',
    });

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();

    expect(wrapper.text()).not.toContain('Hồ sơ thợ đã được tiếp nhận!');
    expect(wrapper.text()).toContain('Bước 3: Chọn kỹ năng chuyên môn & Kinh nghiệm');
  });

  it('renders Submitted screen only when onboardingStatus is submitted, and allows reviewing form', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValue({
      onboardingStatus: 'submitted',
      verificationStatus: 'pending',
      currentStep: 5,
      personalInfoCompleted: true,
      kycSubmitted: true,
      skillsSelected: true,
      addressSet: true,
      fullName: 'minh CU',
      dateOfBirth: '1995-08-20',
      gender: 'male',
      citizenIdNumber: '001200001111',
      fullAddress: '123 Đường Cầu Giấy, Hà Nội',
      yearsExperience: 5,
    });

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();

    // Now it should show "Hồ sơ thợ đã được tiếp nhận!"
    expect(wrapper.text()).toContain('Hồ sơ thợ đã được tiếp nhận!');
    expect(wrapper.text()).toContain('Đang chờ ban quản trị phê duyệt');

    // Clicking "Xem lại thông tin đã gửi" enters review mode
    const reviewBtn = wrapper.findAll('button').find((b) => b.text().includes('Xem lại thông tin đã gửi'));
    expect(reviewBtn).toBeDefined();
    await reviewBtn!.trigger('click');
    await flushPromises();

    // Review mode banner is displayed, wizard step 1 is visible
    expect(wrapper.text()).toContain('Bạn đang ở chế độ xem lại hồ sơ đã nộp chờ phê duyệt');
    expect(wrapper.text()).toContain('Bước 1: Thông tin cá nhân & Số CCCD');
  });
});
