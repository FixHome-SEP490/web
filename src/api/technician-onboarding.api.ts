// src/api/technician-onboarding.api.ts
import apiClient from './client';
import type {
  OnboardingStatusResponse,
  SavePersonalInfoPayload,
  SaveSkillsPayload,
  SaveAddressPayload,
} from '../types';

interface ApiResponse<T> {
  data: T;
}

function unwrap<T extends object>(res: { data: ApiResponse<T> | T }): T {
  return 'data' in res.data ? (res.data as ApiResponse<T>).data : (res.data as T);
}

export const technicianOnboardingApi = {
  /**
   * Lấy trạng thái quy trình Onboarding hiện tại của thợ
   */
  async getStatus(): Promise<OnboardingStatusResponse> {
    const res = await apiClient.get<ApiResponse<OnboardingStatusResponse> | OnboardingStatusResponse>(
      '/technicians/onboarding/status',
    );
    return unwrap(res);
  },

  /**
   * Bước 1: Lưu thông tin cá nhân & định danh (Họ tên, Ngày sinh >= 18 tuổi, Giới tính, CCCD 12 số, SĐT)
   */
  async savePersonalInfo(payload: SavePersonalInfoPayload): Promise<OnboardingStatusResponse> {
    const res = await apiClient.post<ApiResponse<OnboardingStatusResponse> | OnboardingStatusResponse>(
      '/technicians/onboarding/personal-info',
      payload,
    );
    return unwrap(res);
  },

  /**
   * Bước 3: Lưu kỹ năng chuyên môn và số năm kinh nghiệm
   */
  async saveSkills(payload: SaveSkillsPayload): Promise<OnboardingStatusResponse> {
    const res = await apiClient.post<ApiResponse<OnboardingStatusResponse> | OnboardingStatusResponse>(
      '/technicians/onboarding/skills',
      payload,
    );
    return unwrap(res);
  },

  /**
   * Bước 4: Lưu địa chỉ cụ thể và khu vực phục vụ (quận/huyện, bán kính)
   */
  async saveAddress(payload: SaveAddressPayload): Promise<OnboardingStatusResponse> {
    const res = await apiClient.post<ApiResponse<OnboardingStatusResponse> | OnboardingStatusResponse>(
      '/technicians/onboarding/address',
      payload,
    );
    return unwrap(res);
  },

  /**
   * Bước 5: Nộp toàn bộ hồ sơ xác thực để Quản trị viên xét duyệt
   */
  async submit(): Promise<OnboardingStatusResponse> {
    const res = await apiClient.post<ApiResponse<OnboardingStatusResponse> | OnboardingStatusResponse>(
      '/technicians/onboarding/submit',
      {},
    );
    return unwrap(res);
  },
};
