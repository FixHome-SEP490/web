import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const { forgotPassword, resetPassword, logout, push } = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  logout: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../src/api/auth.api', () => ({ authApi: { forgotPassword, resetPassword } }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => ({ user: { email: 'khach@fixhome.vn' }, logout }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ChangePasswordCard from '../src/components/account/ChangePasswordCard.vue';

const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!;

describe('Change password from the profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the code to the account email, then sets the new password and signs out', async () => {
    forgotPassword.mockResolvedValue({ message: 'ok' });
    resetPassword.mockResolvedValue({ message: 'ok' });
    const w = mount(ChangePasswordCard);
    await button(w, 'Gửi mã xác nhận').trigger('click');
    await flushPromises();
    expect(forgotPassword).toHaveBeenCalledWith({ email: 'khach@fixhome.vn' });
    const inputs = w.findAll('input');
    await inputs[0].setValue('123456');
    await inputs[1].setValue('MatKhauMoi@1');
    await inputs[2].setValue('MatKhauMoi@1');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(resetPassword).toHaveBeenCalledWith({ email: 'khach@fixhome.vn', otp: '123456', newPassword: 'MatKhauMoi@1' });
    expect(logout).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('checks the code and the confirmation before calling the server', async () => {
    forgotPassword.mockResolvedValue({ message: 'ok' });
    const w = mount(ChangePasswordCard);
    await button(w, 'Gửi mã xác nhận').trigger('click');
    await flushPromises();
    const inputs = w.findAll('input');
    await inputs[0].setValue('12ab');
    await w.get('form').trigger('submit');
    expect(w.text()).toContain('Mã xác nhận gồm 6 chữ số');
    await inputs[0].setValue('123456');
    await inputs[1].setValue('MatKhauMoi@1');
    await inputs[2].setValue('KhacNhau@2');
    await w.get('form').trigger('submit');
    expect(w.text()).toContain('chưa khớp');
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
