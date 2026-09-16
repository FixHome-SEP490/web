// src/api/technicians.api.ts
import apiClient from './client';
import { unwrap } from './response';

export interface TechnicianSkillItem {
  id: string;
  technicianId: string;
  serviceId: string;
  level: string;
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number | null;
  isActive: boolean;
  service?: {
    id: string;
    name: string;
    category?: { id: string; name: string };
  };
}

export interface TechnicianServiceAreaItem {
  id: string;
  technicianId: string;
  provinceCode: string;
  districtCode: string;
}

export interface TechnicianScheduleItem {
  id?: string;
  dayOfWeek: number; // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
  startTime: string; // "08:00"
  endTime: string; // "18:00"
}

export interface TechnicianTimeOffItem {
  id: string;
  startAt: string;
  endAt: string;
  reason?: string | null;
  createdAt?: string;
}

export interface TechnicianProfileData {
  id: string;
  userId: string;
  verificationStatus: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  yearsExperience: number;
  bio?: string | null;
  averageRating: number;
  ratingCount: number;
  reliabilityScore: number;
  isAvailable: boolean;
  skills?: TechnicianSkillItem[];
  serviceAreas?: TechnicianServiceAreaItem[];
  schedules?: TechnicianScheduleItem[];
  timeOffs?: TechnicianTimeOffItem[];
}

export interface TechnicianDashboardData {
  pendingInvitations: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  rating: number;
  ratingCount: number;
  reliabilityScore: number;
  monthlyEarnings: number;
  activeJob?: {
    id: string;
    orderCode: string;
    status: string;
    serviceTitle: string;
    customerName: string;
    customerPhone: string;
    address: string;
    createdAt: string;
  } | null;
  latestInvitation?: {
    id: string;
    bookingId: string;
    serviceTitle: string;
    address: string;
    preferredStartAt?: string;
    preferredEndAt?: string;
    expiresAt?: string;
    estimatedTotal?: number;
  } | null;
  serviceAreas: TechnicianServiceAreaItem[];
  isAvailable: boolean;
}

export interface PayoutItem {
  orderId: string;
  orderCode: string;
  date: string;
  customer: string;
  gross: number;
  platformFee: number;
  net: number;
  status: string;
}

export interface TechnicianEarningsData {
  totalCompletedOrders: number;
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  pendingDueCount: number;
  pendingDueAmount: number;
  rating: number;
  ratingCount: number;
  reliability: number;
  commissionRatePercent: number;
  payouts: PayoutItem[];
}

export interface VerificationDocument {
  documentType: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface VerificationData {
  id?: string;
  status: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  documents?: VerificationDocument[];
}

export const techniciansApi = {
  async getProfile(): Promise<TechnicianProfileData> {
    const res = await apiClient.get<TechnicianProfileData>('/technicians/me/profile');
    return unwrap(res.data);
  },

  async updateProfile(dto: {
    bio?: string;
    isAvailable?: boolean;
    yearsExperience?: number;
  }): Promise<TechnicianProfileData> {
    const res = await apiClient.patch<TechnicianProfileData>('/technicians/me/profile', dto);
    return unwrap(res.data);
  },

  async getSkills(): Promise<TechnicianSkillItem[]> {
    const res = await apiClient.get<TechnicianSkillItem[]>('/technicians/me/services');
    return unwrap(res.data);
  },

  async updateSkill(
    serviceId: string,
    dto: {
      listedLaborPrice?: number;
      typicalWarrantyDays?: number;
      level?: string;
      isActive?: boolean;
    },
  ): Promise<TechnicianSkillItem> {
    const res = await apiClient.put<TechnicianSkillItem>(`/technicians/me/services/${serviceId}`, dto);
    return unwrap(res.data);
  },

  async getSchedule(): Promise<TechnicianScheduleItem[]> {
    const res = await apiClient.get<TechnicianScheduleItem[]>('/technicians/me/schedule');
    return unwrap(res.data);
  },

  async updateSchedule(schedules: TechnicianScheduleItem[]): Promise<TechnicianScheduleItem[]> {
    const res = await apiClient.put<TechnicianScheduleItem[]>('/technicians/me/schedule', {
      schedules,
    });
    return unwrap(res.data);
  },

  async getTimeOff(): Promise<TechnicianTimeOffItem[]> {
    const res = await apiClient.get<TechnicianTimeOffItem[]>('/technicians/me/time-off');
    return unwrap(res.data);
  },

  async createTimeOff(dto: {
    startAt: string;
    endAt: string;
    reason?: string;
  }): Promise<TechnicianTimeOffItem> {
    const res = await apiClient.post<TechnicianTimeOffItem>('/technicians/me/time-off', dto);
    return unwrap(res.data);
  },

  async deleteTimeOff(id: string): Promise<void> {
    await apiClient.delete(`/technicians/me/time-off/${id}`);
  },

  async getServiceAreas(): Promise<TechnicianServiceAreaItem[]> {
    const res = await apiClient.get<TechnicianServiceAreaItem[]>('/technicians/me/service-areas');
    return unwrap(res.data);
  },

  async updateServiceAreas(
    areas: Array<{ provinceCode: string; districtCode: string }>,
  ): Promise<TechnicianServiceAreaItem[]> {
    const res = await apiClient.put<TechnicianServiceAreaItem[]>('/technicians/me/service-areas', {
      areas,
    });
    return unwrap(res.data);
  },

  async getEarnings(): Promise<TechnicianEarningsData> {
    const res = await apiClient.get<TechnicianEarningsData>('/technicians/me/earnings');
    return unwrap(res.data);
  },

  async getDashboard(): Promise<TechnicianDashboardData> {
    const res = await apiClient.get<TechnicianDashboardData>('/dashboard/technician');
    return unwrap(res.data);
  },

  async getVerification(): Promise<VerificationData> {
    const res = await apiClient.get<VerificationData>('/technicians/me/verification');
    return unwrap(res.data);
  },

  async submitVerification(documents: VerificationDocument[]): Promise<VerificationData> {
    const res = await apiClient.post<VerificationData>('/technicians/me/verification', {
      documents,
    });
    return unwrap(res.data);
  },
};
