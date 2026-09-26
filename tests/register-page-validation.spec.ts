// tests/register-page-validation.spec.ts
//
// Kiểm ở mức giao diện: gõ vào ô "Họ và tên" thì lỗi có thật sự hiện ra trên
// màn hình không, chứ không chỉ kiểm hàm validate. Bản mobile tương ứng đã được
// bấm tay trên emulator FixHome_Dev.
//
// Không gọi API thật, không tạo tài khoản.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/stores/auth', () => ({
  useAuthStore: () => ({ register: mockRegister, loading: false }),
}));

import RegisterPage from '../src/pages/auth/RegisterPage.vue';

/** `router-link` chỉ dùng để điều hướng, không liên quan tới phần đang kiểm. */
const mountOptions = {
  global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } },
};

/** Ô nhập đầu tiên trên form là "Họ và tên". */
async function typeFullName(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.findAll('input')[0];
  await input.setValue(value);
  await input.trigger('blur');
  await flushPromises();
}

const LOI_KY_TU = 'Họ tên chỉ gồm chữ cái, khoảng trắng, dấu nháy, gạch nối và dấu chấm';
const LOI_KY_TU_AN = 'Họ tên chứa ký tự ẩn không hợp lệ, vui lòng gõ lại';

describe('RegisterPage — lỗi họ tên hiện trên giao diện', () => {
  beforeEach(() => {
    mockRegister.mockReset();
  });

  // Ký tự ẩn có thông báo riêng, vì người dùng không nhìn thấy thứ mình vừa
  // dán vào nên nói "chỉ gồm chữ cái" sẽ khiến họ tưởng mình gõ sai chữ.
  it.each([
    ['emoji', 'Nguyen 🔥 Van A', LOI_KY_TU],
    ['chữ số', 'Nguyen Van 123', LOI_KY_TU],
    ['thẻ HTML', '<script>alert(1)</script>', LOI_KY_TU],
    ['zero-width space', 'Nguyen​Van A', LOI_KY_TU_AN],
    ['byte NUL', 'Nguyen\u0000Van A', LOI_KY_TU_AN],
  ])('hiện thông báo tiếng Việt khi tên chứa %s', async (_ten, giaTri, mongDoi) => {
    const wrapper = mount(RegisterPage, mountOptions);
    await typeFullName(wrapper, giaTri);

    expect(wrapper.text()).toContain(mongDoi);
  });

  it('không hiện lỗi khi tên tiếng Việt hợp lệ', async () => {
    const wrapper = mount(RegisterPage, mountOptions);
    await typeFullName(wrapper, 'Nguyễn Thị Ánh Nguyệt');

    expect(wrapper.text()).not.toContain('Họ tên chỉ gồm chữ cái');
    expect(wrapper.text()).not.toContain('Họ tên tối thiểu 2 ký tự');
    expect(wrapper.text()).not.toContain('Họ tên chứa ký tự ẩn');
  });

  it('không gọi API đăng ký khi tên không hợp lệ', async () => {
    const wrapper = mount(RegisterPage, mountOptions);
    await typeFullName(wrapper, 'Nguyen Van 123');

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(mockRegister).not.toHaveBeenCalled();
  });
});
