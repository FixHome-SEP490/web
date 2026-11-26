// src/types/auth.types.ts
export interface LoginRequest {
  email?: string;
  identifier?: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  role?: 'customer' | 'technician';
  verifyChannel?: OtpChannel;
}

/** Kênh nhận mã OTP xác thực. */
export type OtpChannel = 'EMAIL' | 'SMS';

export interface RegisterResponse {
  message: string;
  email: string;
  expiresInMinutes: number;
  channel?: OtpChannel;
}

export interface VerifyOtpRequest {
  email: string;
  otp: string;
  channel?: OtpChannel;
}

export interface ResendOtpRequest {
  email: string;
  channel?: OtpChannel;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  role: UserRole;
  status: string;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  avatarUrl?: string | null;
  bookingSuspendedUntil?: string | null;
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  TECHNICIAN = 'TECHNICIAN',
  SERVICE_MANAGER = 'SERVICE_MANAGER',
  ADMIN = 'ADMIN',
}
