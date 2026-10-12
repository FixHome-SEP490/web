// Customer profile edit (PO 12/10/2026): a name the server would refuse is caught in the form with the
// real reason, under the field, never in a browser alert; a server refusal shows a readable sentence.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { updateMe, getAddresses, alertSpy } = vi.hoisted(() => ({ updateMe: vi.fn(), getAddresses: vi.fn(), alertSpy: vi.fn() }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { updateMe, getAddresses, createAddress: vi.fn(), updateAddress: vi.fn(), deleteAddress: vi.fn() } }));
vi.mock('../src/api/geo.api', () => ({ geoApi: { autocomplete: vi.fn(), reverse: vi.fn() } }));
vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'mock-user', fullName: 'Khách Hàng', phoneNumber: '0904000001', email: 'example.invalid' }, token: 't', setAuth: vi.fn(), fetchProfile: vi.fn() }),
}));
vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));
import CustomerProfilePage from '../src/pages/customer/CustomerProfilePage.vue';

async function openForm() {
  const wrapper = mount(CustomerProfilePage, { global: { stubs: { MapTilerMap: true, FhConfirmDialog: true, AvatarDialog: true, ChangePasswordCard: true, ReputationCard: true } } });
  await flushPromises();
  const edit = wrapper.findAll('button').find((b) => b.text().trim() === 'Sửa');
  await edit!.trigger('click');
  return wrapper;
}

beforeEach(() => {
  updateMe.mockReset();
  getAddresses.mockReset().mockResolvedValue([]);
  alertSpy.mockReset();
  vi.stubGlobal('alert', alertSpy);
});

describe('customer profile form', () => {
  it.each([
    ['😀😀😀', 'chỉ gồm chữ cái'],
    ['<script>alert(1)</script>', 'chỉ gồm chữ cái'],
    ['   ', 'không được bỏ trống'],
    ['A'.repeat(2000), 'tối đa 200 ký tự'],
  ])('keeps %j out of the request and says why under the field', async (name, reason) => {
    const wrapper = await openForm();
    await wrapper.get('[data-testid="profile-fullname"]').setValue(name);
    await wrapper.get('[data-testid="profile-save"]').trigger('click');
    await flushPromises();
    expect(updateMe).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="profile-error"]').text()).toContain(reason);
    expect(alertSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('refuses a malformed phone number before asking the server', async () => {
    const wrapper = await openForm();
    await wrapper.get('[data-testid="profile-phone"]').setValue('12ab');
    await wrapper.get('[data-testid="profile-save"]').trigger('click');
    expect(updateMe).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="profile-error"]').text()).toContain('SĐT không hợp lệ');
    wrapper.unmount();
  });

  it('shows a readable sentence, not a code, when the server refuses', async () => {
    updateMe.mockRejectedValue(Object.assign(new Error('Request failed with status code 409'), {
      isAxiosError: true,
      response: { status: 409, data: { success: false, error: { code: 'PHONE_TAKEN', message: 'Phone number already in use' } } },
    }));
    const wrapper = await openForm();
    await wrapper.get('[data-testid="profile-fullname"]').setValue('Nguyễn Văn A');
    await wrapper.get('[data-testid="profile-save"]').trigger('click');
    await flushPromises();
    expect(updateMe).toHaveBeenCalledWith({ fullName: 'Nguyễn Văn A', phoneNumber: '0904000001' });
    const text = wrapper.get('[data-testid="profile-error"]').text();
    expect(text).not.toMatch(/PHONE_TAKEN|409|status code/);
    expect(text.length).toBeGreaterThan(5);
    expect(alertSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('saves a valid Vietnamese name', async () => {
    updateMe.mockResolvedValue({ fullName: 'Trần Thị Bích-Ngọc', phoneNumber: '0904000001' });
    const wrapper = await openForm();
    await wrapper.get('[data-testid="profile-fullname"]').setValue('  Trần Thị Bích-Ngọc ');
    await wrapper.get('[data-testid="profile-save"]').trigger('click');
    await flushPromises();
    expect(updateMe).toHaveBeenCalledWith({ fullName: 'Trần Thị Bích-Ngọc', phoneNumber: '0904000001' });
    expect(wrapper.find('[data-testid="profile-error"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
