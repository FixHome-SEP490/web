// src/api/profile.api.ts
import apiClient from './client';

export interface UserAddress {
  id: string;
  userId: string;
  label?: string | null;
  line1: string;
  ward?: string | null;
  district: string;
  province: string;
  lat?: number | null;
  lng?: number | null;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  role: string;
  status: string;
  bookingSuspendedUntil?: string | null;
  permissions?: string[];
}

interface ApiResponse<T> {
  data: T;
}

export const profileApi = {
  async getMe(): Promise<UserProfile> {
    const res = await apiClient.get<ApiResponse<UserProfile> | UserProfile>('/me');
    return 'data' in res.data ? (res.data as ApiResponse<UserProfile>).data : res.data;
  },

  async updateMe(dto: {
    fullName?: string;
    phoneNumber?: string;
    avatarUrl?: string;
  }): Promise<UserProfile> {
    const res = await apiClient.patch<ApiResponse<UserProfile> | UserProfile>('/me', dto);
    return 'data' in res.data ? (res.data as ApiResponse<UserProfile>).data : res.data;
  },

  async getAddresses(): Promise<UserAddress[]> {
    const res = await apiClient.get<ApiResponse<UserAddress[]> | UserAddress[]>('/me/addresses');
    return 'data' in res.data ? (res.data as ApiResponse<UserAddress[]>).data : res.data;
  },

  async createAddress(dto: {
    label?: string;
    line1: string;
    ward?: string;
    district: string;
    province: string;
    isDefault?: boolean;
  }): Promise<UserAddress> {
    const res = await apiClient.post<ApiResponse<UserAddress> | UserAddress>('/me/addresses', dto);
    return 'data' in res.data ? (res.data as ApiResponse<UserAddress>).data : res.data;
  },

  async updateAddress(
    id: string,
    dto: Partial<{
      label: string;
      line1: string;
      ward: string;
      district: string;
      province: string;
      isDefault: boolean;
    }>,
  ): Promise<UserAddress> {
    const res = await apiClient.patch<ApiResponse<UserAddress> | UserAddress>(`/me/addresses/${id}`, dto);
    return 'data' in res.data ? (res.data as ApiResponse<UserAddress>).data : res.data;
  },

  async deleteAddress(id: string): Promise<void> {
    await apiClient.delete(`/me/addresses/${id}`);
  },
};
