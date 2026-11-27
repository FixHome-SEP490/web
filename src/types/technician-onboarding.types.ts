// src/types/technician-onboarding.types.ts

export type OnboardingStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

export type Gender = 'male' | 'female' | 'other';

export interface SavePersonalInfoPayload {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  citizenIdNumber: string;
  phoneNumber?: string;
}

export interface SaveSkillsPayload {
  serviceIds: string[];
  /** Cấp độ tự khai cho từng kỹ năng đã chọn (thiếu thì backend mặc định INTERMEDIATE). */
  skills?: { serviceId: string; level: string }[];
  yearsExperience: number;
  bio?: string;
}

export interface ServiceAreaItem {
  provinceCode: string;
  districtCode: string;
}

export interface SaveAddressPayload {
  fullAddress: string;
  latitude?: number;
  longitude?: number;
  serviceAreas: ServiceAreaItem[];
  serviceRadiusKm?: number;
}

/** Giai đoạn xét duyệt sau khi thợ nộp hồ sơ (tính ở backend, cùng bản mobile). */
export type ReviewStage =
  | 'identity_review'
  | 'visit_required'
  | 'visit_scheduled'
  | 'visit_blocked'
  | 'profile_review'
  | 'approved'
  | 'identity_rejected'
  | 'profile_rejected';

export interface OnboardingSkill {
  serviceId: string;
  /** Cấp độ thợ tự khai lúc đăng ký. */
  declaredLevel: string | null;
  /** Cấp hiện hiệu lực; chỉ là cấp đã xác nhận khi `verificationStatus` là verified. */
  level: string;
  verificationStatus: string;
}

export interface OnboardingOfficeVisit {
  id: string;
  officeId: string;
  officeName: string;
  officeAddress: string;
  scheduledAt: string;
}

export interface OnboardingStatusResponse {
  onboardingStatus: OnboardingStatus;
  verificationStatus?: 'pending' | 'verified' | 'rejected' | string;
  currentStep: number;
  rejectionReason?: string | null;
  personalInfoCompleted: boolean;
  kycSubmitted: boolean;
  skillsSelected: boolean;
  addressSet: boolean;
  fullAddress?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
  serviceAreas?: ServiceAreaItem[];
  fullName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  citizenIdNumber?: string;
  phoneNumber?: string;
  yearsExperience?: number;
  bio?: string;
  selectedServiceIds?: string[];
  skills?: OnboardingSkill[];
  reviewStage?: ReviewStage | null;
  identityVerifiedAt?: string;
  profileRejectionReason?: string;
  officeVisit?: OnboardingOfficeVisit | null;
  /** Chỉ có khi bị khóa đặt lịch vì vắng nhiều lần. */
  supportPhone?: string;
}
