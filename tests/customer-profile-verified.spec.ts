// After the identity check is approved (PO 14/10/2026) the customer's name and
// date of birth are those on the CCCD: shown with "Đã xác minh theo CCCD", the
// name cannot be edited and is never sent; the phone number still can be.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { updateMe, getAddresses, getMine } = vi.hoisted(() => ({ updateMe: vi.fn(), getAddresses: vi.fn(), getMine: vi.fn() }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { updateMe, getAddresses, createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn() } }));
vi.mock('../src/api/geo.api', () => ({ geoApi: { autocomplete: vi.fn(), reverse: vi.fn() } }));
vi.mock('../src/api/customer-verification.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/customer-verification.api')>()),
  customerVerificationApi: { getMine },
}));
vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'mock-user', role: 'CUSTOMER', fullName: 'Nguyễn Văn An', phoneNumber: '0904000001', email: 'example.invalid' },
    token: 't',
    setAuth: vi.fn(),
    fetchProfile: vi.fn(),
  }),
}));
vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));
import CustomerProfilePage from '../src/pages/customer/CustomerProfilePage.vue';

const stubs = { MapTilerMap: true, FhConfirmDialog: true, AvatarDialog: true, ChangePasswordCard: true, ReputationCard: true };

function state(status: 'none' | 'pending' | 'verified' | 'rejected') {
  return {
    status,
    rejectionReason: null,
    verification: status === 'none' ? null : { status, fullName: 'Nguyễn Văn An', dateOfBirth: '1990-05-20', verifiedFullName: status === 'verified' ? 'Nguyễn Văn An' : null },
    profile: { fullName: 'Nguyễn Văn An', dateOfBirth: '1990-05-20', gender: 'male', citizenIdNumber: '079090000001', address: '12 Lê Lợi' },
  };
}

async function mountPage() {
  const w = mount(CustomerProfilePage, { global: { stubs } });
  await flushPromises();
  return w;
}

async function openEdit(w: Awaited<ReturnType<typeof mountPage>>) {
  await w.findAll('button').find((b) => b.text().trim() === 'Sửa')!.trigger('click');
}

beforeEach(() => {
  vi.clearAllMocks();
  getAddresses.mockResolvedValue([]);
  updateMe.mockResolvedValue({ id: 'mock-user', fullName: 'Nguyễn Văn An', phoneNumber: '0912345678' });
});

describe('customer profile after identity verification', () => {
  it('marks the name and date of birth as verified by CCCD', async () => {
    getMine.mockResolvedValue(state('verified'));
    const w = await mountPage();
    expect(w.get('[data-testid="profile-name-verified"]').text()).toContain('Đã xác minh theo CCCD');
    expect(w.get('[data-testid="profile-dob"]').text()).toContain('20/05/1990');
    expect(w.get('[data-testid="profile-dob"]').text()).toContain('Đã xác minh theo CCCD');
  });

  it('does not let the verified name be edited and never sends it', async () => {
    getMine.mockResolvedValue(state('verified'));
    const w = await mountPage();
    await openEdit(w);
    expect(w.find('[data-testid="profile-fullname"]').exists()).toBe(false);
    expect(w.get('[data-testid="profile-fullname-locked"]').text()).toContain('không đổi được');
    await w.get('[data-testid="profile-phone"]').setValue('0912345678');
    await w.get('[data-testid="profile-save"]').trigger('click');
    await flushPromises();
    expect(updateMe).toHaveBeenCalledWith({ fullName: undefined, phoneNumber: '0912345678' });
  });

  it.each(['none', 'pending', 'rejected'] as const)('keeps the name editable while the check is %s', async (status) => {
    getMine.mockResolvedValue(state(status));
    const w = await mountPage();
    expect(w.find('[data-testid="profile-name-verified"]').exists()).toBe(false);
    expect(w.find('[data-testid="profile-dob"]').exists()).toBe(false);
    await openEdit(w);
    expect(w.find('[data-testid="profile-fullname"]').exists()).toBe(true);
  });
});
