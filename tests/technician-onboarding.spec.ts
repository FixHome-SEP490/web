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

// The chat dock has its own spec (public-layout-widgets); here it only has to be
// present, without opening a real chat connection.
vi.mock('../src/components/chat/RoleChatDock.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ render: () => h('div', { 'data-testid': 'role-chat-dock' }) }) };
});

vi.mock('../src/api/technician-onboarding.api', () => ({
  technicianOnboardingApi: {
    getStatus: vi.fn(),
    savePersonalInfo: vi.fn(),
    saveSkills: vi.fn(),
    saveAddress: vi.fn(),
    submit: vi.fn(),
  },
}));

vi.mock('../src/api/technician-verification.api', () => ({
  technicianVerificationApi: {
    getMyVerification: vi.fn().mockResolvedValue(null),
    requestUploadUrl: vi.fn(),
    uploadToSignedUrl: vi.fn(),
    submit: vi.fn(),
    getDocumentAccess: vi.fn().mockResolvedValue(''),
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

vi.mock('../src/api/wallet.api', () => ({
  walletApi: {
    getMyWallet: vi.fn().mockResolvedValue({
      id: 'mock-wallet-id',
      technicianId: 'tech-id',
      balance: 0,
      pendingWithdrawal: 0,
      processingWithdrawal: 0,
      minimumBalance: 200000,
      minimumWithdrawal: 10000,
      availableBalance: 0,
      withdrawableBalance: 0,
      eligibleForJobs: false,
    }),
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

  it('renders Rejected screen when status is rejected, allows editing, and updates to Submitted screen upon resubmit', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({
      onboardingStatus: 'rejected',
      verificationStatus: 'rejected',
      rejectionReason: 'Ảnh CCCD mặt sau bị mờ, vui lòng chụp lại rõ nét.',
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

    // Must show Rejected screen (Image 1)
    expect(wrapper.text()).toContain('Hồ sơ chưa đạt yêu cầu');
    expect(wrapper.text()).toContain('Ảnh CCCD mặt sau bị mờ, vui lòng chụp lại rõ nét.');
    expect(wrapper.text()).toContain('Chỉnh sửa lại hồ sơ');

    // Click "Chỉnh sửa lại hồ sơ"
    const editBtn = wrapper.findAll('button').find((b) => b.text().includes('Chỉnh sửa lại hồ sơ'));
    expect(editBtn).toBeDefined();
    await editBtn!.trigger('click');
    await flushPromises();

    // Form is now visible in editing mode
    expect(wrapper.text()).toContain('Hồ sơ cần cập nhật lại: Ảnh CCCD mặt sau bị mờ');
    expect(wrapper.text()).toContain('Bước 1: Thông tin cá nhân & Số CCCD');

    // Mock API submit response returning updated status as 'submitted' / 'pending'
    vi.mocked(technicianOnboardingApi.submit).mockResolvedValueOnce({
      onboardingStatus: 'submitted',
      verificationStatus: 'pending',
      currentStep: 5,
      personalInfoCompleted: true,
      kycSubmitted: true,
      skillsSelected: true,
      addressSet: true,
      fullName: 'minh CU',
    });

    // Jump to Step 5 via stepper
    const stepperSteps = wrapper.findAll('.grid.grid-cols-5 > div');
    expect(stepperSteps.length).toBe(5);
    await stepperSteps[4].trigger('click');
    await flushPromises();

    // Verify button says "Gửi lại hồ sơ xét duyệt"
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('Gửi lại hồ sơ xét duyệt'));
    expect(submitBtn).toBeDefined();

    // Click submit
    await submitBtn!.trigger('click');
    await flushPromises();

    expect(technicianOnboardingApi.submit).toHaveBeenCalledTimes(1);

    // After resubmitting, MUST display Submitted/Pending screen and NOT Rejected screen
    expect(wrapper.text()).toContain('Hồ sơ thợ đã được tiếp nhận!');
    expect(wrapper.text()).toContain('Đang chờ ban quản trị phê duyệt');
    expect(wrapper.text()).not.toContain('Hồ sơ chưa đạt yêu cầu');
  });

  it('renders Approved screen with 0 VND initial balance notice and 200,000 VND deposit requirement', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({
      onboardingStatus: 'approved',
      verificationStatus: 'verified',
      currentStep: 5,
      personalInfoCompleted: true,
      kycSubmitted: true,
      skillsSelected: true,
      addressSet: true,
      fullName: 'minh CU',
    });

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();

    expect(wrapper.text()).toContain('Hồ sơ đã được phê duyệt!');
    expect(wrapper.text()).toContain('Thông báo số dư ví ban đầu & Điều kiện nhận đơn');
    expect(wrapper.text()).toContain('0 ₫');
    expect(wrapper.text()).toContain('200.000 ₫');
    expect(wrapper.text()).toContain('Nạp tiền vào ví ngay');
    expect(wrapper.text()).toContain('Vào Bàn làm việc Kỹ thuật viên');
  });
});


describe('TechnicianOnboardingPage chat', () => {
  it('keeps the technician chat bubble on the onboarding page', () => {
    setActivePinia(createPinia());
    const wrapper = mount(TechnicianOnboardingPage);
    expect(wrapper.find('[data-testid="role-chat-dock"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
