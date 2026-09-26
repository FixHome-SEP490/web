// tests/google-sign-in-button.spec.ts
//
// Kiểm nút Google ở mức giao diện: có dựng ra không, ẩn đúng lúc không, và
// chuyển ID token lên trên đúng cách không.
//
// Không gọi ra Internet: thư viện của Google được thay bằng bản giả.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { mockRender, mockConfigured } = vi.hoisted(() => ({
  mockRender: vi.fn(),
  mockConfigured: vi.fn(),
}));

vi.mock('../src/services/google-identity.service', () => ({
  renderGoogleButton: mockRender,
  isGoogleSignInConfigured: mockConfigured,
  getGoogleClientId: vi.fn(),
  loadGoogleIdentity: vi.fn(),
}));

import GoogleSignInButton from '../src/components/common/GoogleSignInButton.vue';

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    mockRender.mockReset().mockResolvedValue(undefined);
    mockConfigured.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('dựng nút khi đã cấu hình CLIENT_ID', async () => {
    const wrapper = mount(GoogleSignInButton);
    await flushPromises();

    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('hoặc');
  });

  // Chưa điền CLIENT_ID mà vẫn hiện nút thì người dùng bấm vào không có gì xảy
  // ra, và không ai hiểu vì sao.
  it('ẩn hoàn toàn khi chưa cấu hình CLIENT_ID', async () => {
    mockConfigured.mockReturnValue(false);

    const wrapper = mount(GoogleSignInButton);
    await flushPromises();

    expect(mockRender).not.toHaveBeenCalled();
    expect(wrapper.text()).toBe('');
  });

  it('chuyển ID token lên component cha', async () => {
    mockRender.mockImplementation(
      async (_parent: HTMLElement, onCredential: (token: string) => void) => {
        onCredential('id-token-cua-google');
      },
    );

    const wrapper = mount(GoogleSignInButton);
    await flushPromises();

    expect(wrapper.emitted('credential')?.[0]).toEqual(['id-token-cua-google']);
  });

  it('mạng chặn Google thì báo rõ và gợi ý dùng mật khẩu', async () => {
    mockRender.mockRejectedValue(
      new Error('Không tải được thư viện đăng nhập Google'),
    );

    const wrapper = mount(GoogleSignInButton);
    await flushPromises();

    expect(wrapper.emitted('error')).toBeTruthy();
    expect(wrapper.text()).toContain('Bạn vẫn có thể dùng mật khẩu');
  });

  it('đổi chữ trên nút theo trang đang đứng', async () => {
    mount(GoogleSignInButton, { props: { text: 'signup_with' } });
    await flushPromises();

    expect(mockRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      expect.objectContaining({ text: 'signup_with' }),
    );
  });
});
