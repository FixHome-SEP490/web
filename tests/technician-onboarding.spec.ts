import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TechnicianOnboardingPage from '../src/pages/technician/TechnicianOnboardingPage.vue';
import { technicianOnboardingApi } from '../src/api/technician-onboarding.api';
import { technicianVerificationApi } from '../src/api/technician-verification.api';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';
import { toast } from 'vue-sonner';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));
import { technicianProfileApi } from '../src/api/technician-profile.api';

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

vi.mock('../src/api/technician-profile.api', () => ({
  technicianProfileApi: {
    getMySkillEvidence: vi.fn().mockResolvedValue([]),
    requestCategoryEvidenceUploadUrl: vi.fn(),
    uploadSkillEvidenceFile: vi.fn(),
    attachCategoryEvidence: vi.fn(),
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
    // PO 08/10/2026: the technician is asked to come to the office; no promised review time.
    expect(wrapper.get('[data-testid="visit-office-note"]').text()).toBe('Vui lòng đến trụ sở trong thời gian sớm nhất để tiến hành xác minh thông tin và bắt đầu công việc.');
    expect(wrapper.text()).not.toContain('24 giờ');

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

  it('reports technician KYC submission as pending admin review', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({
      onboardingStatus: 'in_progress',
      verificationStatus: 'pending',
      currentStep: 2,
      personalInfoCompleted: true,
      kycSubmitted: false,
      skillsSelected: false,
      addressSet: false,
      fullName: 'minh CU',
      dateOfBirth: '1995-08-20',
      gender: 'male',
      citizenIdNumber: '001200001111',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    vi.mocked(technicianVerificationApi.requestUploadUrl).mockResolvedValue({
      storageObjectPath: 'technician-verification/fixture.jpg',
      uploadUrl: 'https://upload.invalid/fixture',
      token: 'fixture',
    });
    vi.mocked(technicianVerificationApi.uploadToSignedUrl).mockResolvedValue(undefined);
    vi.mocked(technicianVerificationApi.submit).mockResolvedValue({
      id: 'verification-1',
      status: 'PENDING',
      submittedAt: '2026-10-29T00:00:00.000Z',
      rejectionReason: null,
      fptDecision: null,
      documents: [],
    });

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    const fileInputs = wrapper.findAll('input[type="file"]');
    for (const [index, input] of fileInputs.slice(0, 3).entries()) {
      Object.defineProperty(input.element, 'files', {
        configurable: true,
        value: [new File(['fixture'], `kyc-${index}.jpg`, { type: 'image/jpeg' })],
      });
      await input.trigger('change');
    }

    const nextButton = wrapper.findAll('button').find((button) => button.text().includes('Lưu & Tiếp tục: Bước 3'));
    expect(nextButton).toBeDefined();
    await nextButton!.trigger('click');
    await flushPromises();

    expect(technicianVerificationApi.submit).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Đã gửi hồ sơ xác thực. Vui lòng chờ duyệt.');
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('xác thực hồ sơ KYC thành công'));
    expect(wrapper.text()).toContain('Bước 3: Chọn kỹ năng chuyên môn & Kinh nghiệm');
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
    // Said once, in one sentence (PO 10/10/2026: no repeated figures).
    expect(wrapper.text().split('200.000 ₫').length - 1).toBe(1);
    expect(wrapper.text()).toContain('Cần nạp tối thiểu 200.000 ₫ vào ví ký quỹ để bắt đầu nhận việc.');
  });

  it('shows a skeleton, not a spinner line, while the status loads', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockReturnValueOnce(new Promise(() => {}));

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Đang tải hồ sơ kỹ thuật viên');
  });
});


const submittedBase = {
  onboardingStatus: 'submitted',
  verificationStatus: 'verified',
  currentStep: 5,
  personalInfoCompleted: true,
  kycSubmitted: true,
  skillsSelected: true,
  addressSet: true,
  fullName: 'minh CU',
} as const;

describe('TechnicianOnboardingPage review stages and wizard rules', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('asks the technician to book an office visit once identity is confirmed', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValue({ ...submittedBase, reviewStage: 'visit_required' });
    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect(wrapper.get('[data-testid="stage-title"]').text()).toBe('Đặt lịch lên trụ sở');
    await wrapper.get('[data-testid="stage-action"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/tech/office-visit');
  });

  it('shows the booked visit, the support phone when blocked, and the profile rejection reason', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({
      ...submittedBase, reviewStage: 'visit_scheduled',
      officeVisit: { id: 'v', officeId: 'o', officeName: 'Trụ sở Q1', officeAddress: '1 Lê Lợi', scheduledAt: '2026-12-01T02:00:00.000Z' },
    });
    let wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect(wrapper.get('[data-testid="stage-body"]').text()).toContain('Trụ sở Q1');

    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({ ...submittedBase, reviewStage: 'visit_blocked', supportPhone: '0900000001' });
    wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect(wrapper.get('[data-testid="stage-body"]').text()).toContain('0900000001');
    expect(wrapper.get('[data-testid="stage-action"]').text()).toBe('Gọi 0900000001');

    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValueOnce({ ...submittedBase, reviewStage: 'profile_rejected', profileRejectionReason: 'Thiếu bằng cấp' });
    wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect(wrapper.get('[data-testid="stage-body"]').text()).toBe('Thiếu bằng cấp');
  });

  it('does not treat a verified identity alone as an approved profile', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValue({ ...submittedBase, reviewStage: 'profile_review' });
    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect(wrapper.text()).not.toContain('Hồ sơ đã được phê duyệt!');
    expect(wrapper.get('[data-testid="stage-title"]').text()).toBe('Đang chờ xét duyệt');
  });

  it('locks personal info after KYC is submitted and drops the certificate photos', async () => {
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValue({
      ...submittedBase, onboardingStatus: 'in_progress', currentStep: 1, reviewStage: null, citizenIdNumber: '001200001111',
    });
    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect(wrapper.find('[data-testid="personal-locked"]').exists()).toBe(true);
    expect(wrapper.find('input[maxlength="12"]').attributes('disabled')).toBeDefined();
    await wrapper.findAll('button').find((b) => b.text().includes('Tiếp tục: Bước 2'))!.trigger('click');
    await flushPromises();
    expect(technicianOnboardingApi.savePersonalInfo).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="certificate-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="notarised-note"]').exists()).toBe(true);
  });

  it('sends the declared level per skill and attaches papers only after the skills are saved', async () => {
    const { catalogApi } = await import('../src/api/catalog.api');
    vi.mocked(catalogApi.getCategories).mockResolvedValue([{ id: 'c1', name: 'Điện', isActive: true } as never]);
    vi.mocked(catalogApi.getServices).mockResolvedValue({ data: [{ id: 's1', name: 'Sửa điện', categoryId: 'c1' }] } as never);
    vi.mocked(technicianOnboardingApi.getStatus).mockResolvedValue({
      onboardingStatus: 'in_progress', verificationStatus: 'pending', currentStep: 3, personalInfoCompleted: true,
      kycSubmitted: true, skillsSelected: false, addressSet: false, fullName: 'minh CU', selectedServiceIds: ['s1'],
      skills: [{ serviceId: 's1', declaredLevel: 'ADVANCED', level: 'INTERMEDIATE', verificationStatus: 'pending' }],
    });
    const calls: string[] = [];
    vi.mocked(technicianOnboardingApi.saveSkills).mockImplementation(async () => { calls.push('skills'); return {} as never; });
    vi.mocked(technicianProfileApi.requestCategoryEvidenceUploadUrl).mockImplementation(async () => { calls.push('upload-url'); return { storageObjectPath: 'p', uploadUrl: 'u' }; });
    vi.mocked(technicianProfileApi.uploadSkillEvidenceFile).mockResolvedValue(undefined);
    vi.mocked(technicianProfileApi.attachCategoryEvidence).mockImplementation(async () => { calls.push('attach'); return { attachedSkills: 1, serviceIds: ['s1'] }; });

    const wrapper = mount(TechnicianOnboardingPage, mountOptions);
    await flushPromises();
    expect((wrapper.get('#ob-level-s1').element as HTMLSelectElement).value).toBe('ADVANCED');

    await wrapper.get('[data-testid="onboarding-paper-add"]').trigger('click');
    await wrapper.get('[data-testid="onboarding-papers"] input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-testid="paper-type"]').setValue('vocational_diploma');
    const file = wrapper.get('[data-testid="paper-file"]');
    Object.defineProperty(file.element, 'files', { configurable: true, value: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] });
    await file.trigger('change');
    await wrapper.get('[data-testid="paper-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="onboarding-paper-pending"]')).toHaveLength(1);
    expect(technicianProfileApi.attachCategoryEvidence).not.toHaveBeenCalled();

    await wrapper.findAll('button').find((b) => b.text().includes('Lưu & Tiếp tục: Bước 4'))!.trigger('click');
    await flushPromises();
    expect(technicianOnboardingApi.saveSkills).toHaveBeenCalledWith(
      expect.objectContaining({ serviceIds: ['s1'], skills: [{ serviceId: 's1', level: 'ADVANCED' }] }),
    );
    expect(calls).toEqual(['skills', 'upload-url', 'attach']);
    expect(wrapper.text()).toContain('Bước 4');
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
