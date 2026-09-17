import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../src/stores/auth.store';
import { UserRole } from '../src/types';
import { authApi } from '../src/api/auth.api';

vi.mock('../src/api/auth.api', () => ({
  authApi: {
    logout: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    verifyRegisterOtp: vi.fn(),
  },
}));

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('sets authentication state and evaluates roles', () => {
    const store = useAuthStore();

    store.setAuth('token', {
      id: 'user-1',
      email: 'admin@fixhome.test',
      fullName: 'FixHome Admin',
      role: UserRole.ADMIN,
    });

    expect(store.isAuthenticated).toBe(true);
    expect(store.hasRole(UserRole.ADMIN)).toBe(true);
    expect(store.hasAnyRole([UserRole.SERVICE_MANAGER, UserRole.ADMIN])).toBe(true);
    expect(localStorage.getItem('access_token')).toBe('token');
  });

  it('handles registration without logging in immediately', async () => {
    const store = useAuthStore();
    const mockRegisterRes = {
      message: 'Đăng ký thành công',
      email: 'newuser@fixhome.vn',
      expiresInMinutes: 5,
    };
    vi.mocked(authApi.register).mockResolvedValueOnce(mockRegisterRes);

    const result = await store.register({
      email: 'newuser@fixhome.vn',
      password: 'Password123!',
      fullName: 'New User',
    });

    expect(result).toEqual(mockRegisterRes);
    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
  });

  it('authenticates user upon successful OTP verification', async () => {
    const store = useAuthStore();
    const mockUser = {
      id: 'user-otp-1',
      email: 'newuser@fixhome.vn',
      fullName: 'New User',
      role: UserRole.CUSTOMER,
      status: 'active',
    };
    vi.mocked(authApi.verifyRegisterOtp).mockResolvedValueOnce({
      accessToken: 'access-jwt-token',
      refreshToken: 'refresh-jwt-token',
      user: mockUser,
    });

    const user = await store.verifyRegisterOtp({
      email: 'newuser@fixhome.vn',
      otp: '123456',
    });

    expect(user).toEqual(mockUser);
    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toBe('access-jwt-token');
    expect(localStorage.getItem('access_token')).toBe('access-jwt-token');
    expect(localStorage.getItem('refresh_token')).toBe('refresh-jwt-token');
  });

  it('clears authentication state on logout', async () => {
    const store = useAuthStore();
    store.setAuth('token', {
      id: 'user-1',
      email: 'customer@fixhome.test',
      fullName: 'FixHome Customer',
      role: UserRole.CUSTOMER,
    });

    await store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
