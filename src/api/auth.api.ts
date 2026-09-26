// src/api/auth.api.ts
import apiClient from './client';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  VerifyOtpRequest,
  ResendOtpRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  UserInfo,
} from '../types';

interface ApiResponse<T> {
  data: T;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<ApiResponse<LoginResponse> | LoginResponse>('/auth/login', data);
    return 'data' in res.data ? (res.data as ApiResponse<LoginResponse>).data : res.data;
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const res = await apiClient.post<ApiResponse<RegisterResponse> | RegisterResponse>('/auth/register', data);
    return 'data' in res.data ? (res.data as ApiResponse<RegisterResponse>).data : res.data;
  },

  /**
   * Gửi ID token nhận từ Google Identity Services lên backend đổi lấy phiên.
   *
   * Trình duyệt không tự tin được token này; backend mới là nơi kiểm chữ ký và
   * kiểm `aud` đúng CLIENT_ID của FixHome.
   */
  loginWithGoogle: async (idToken: string): Promise<LoginResponse> => {
    const res = await apiClient.post<ApiResponse<LoginResponse> | LoginResponse>('/auth/google', {
      idToken,
      deviceInfo: `Web - ${navigator.userAgent.slice(0, 200)}`,
    });
    return 'data' in res.data ? (res.data as ApiResponse<LoginResponse>).data : res.data;
  },

  verifyRegisterOtp: async (data: VerifyOtpRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<ApiResponse<LoginResponse> | LoginResponse>('/auth/verify-register-otp', data);
    return 'data' in res.data ? (res.data as ApiResponse<LoginResponse>).data : res.data;
  },

  resendRegisterOtp: async (data: ResendOtpRequest): Promise<{ message: string; resendAvailableAt?: string }> => {
    const res = await apiClient.post<ApiResponse<{ message: string; resendAvailableAt?: string }> | { message: string; resendAvailableAt?: string }>(
      '/auth/resend-register-otp',
      data,
    );
    return 'data' in res.data ? (res.data as ApiResponse<{ message: string; resendAvailableAt?: string }>).data : res.data;
  },

  forgotPassword: async (data: ForgotPasswordRequest): Promise<{ message: string }> => {
    const res = await apiClient.post<ApiResponse<{ message: string }> | { message: string }>('/auth/forgot-password', data);
    return 'data' in res.data ? (res.data as ApiResponse<{ message: string }>).data : res.data;
  },

  resetPassword: async (data: ResetPasswordRequest): Promise<{ message: string }> => {
    const res = await apiClient.post<ApiResponse<{ message: string }> | { message: string }>('/auth/reset-password', data);
    return 'data' in res.data ? (res.data as ApiResponse<{ message: string }>).data : res.data;
  },

  getProfile: async (): Promise<UserInfo> => {
    const res = await apiClient.get<ApiResponse<UserInfo> | UserInfo>('/me');
    return 'data' in res.data ? (res.data as ApiResponse<UserInfo>).data : res.data;
  },

  updateProfile: async (data: Partial<UserInfo>): Promise<UserInfo> => {
    const res = await apiClient.patch<ApiResponse<UserInfo> | UserInfo>('/me', data);
    return 'data' in res.data ? (res.data as ApiResponse<UserInfo>).data : res.data;
  },

  logout: async (): Promise<void> => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {});
    } catch {
      // ignore network error on logout
    }
  },
};
