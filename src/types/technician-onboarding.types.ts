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
}
