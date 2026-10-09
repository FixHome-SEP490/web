import apiClient from './client';

export interface AdminTechnicianRow {
  id: string;
  profileId: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  citizenIdNumber: string | null;
  status: string;
  reputationPoints: number;
  verificationStatus: string | null;
  isAvailable: boolean | null;
  averageRating: number | null;
  ratingCount: number;
  workSuspendedUntil: string | null;
  createdAt: string;
}

export interface AdminTechnicianDetail {
  user: {
    id: string; fullName: string; email: string; phoneNumber: string | null; citizenIdNumber: string | null;
    dateOfBirth: string | null; gender: string | null; avatarUrl: string | null; status: string; emailVerified: boolean;
    authProvider: string; reputationPoints: number; createdAt: string;
  };
  profile: {
    id: string; verificationStatus: string; yearsExperience: number; bio: string | null; averageRating: number | null;
    ratingCount: number; reliabilityScore: number; isAvailable: boolean; serviceRadiusKm: number; fullAddress: string | null;
    workSuspendedUntil: string | null; priorityBoostUntil: string | null; lastLocationAt: string | null; onboardingStep: number;
  } | null;
  skills: Array<{ serviceName: string; listedLaborPrice: number | null; verificationStatus: string; isActive: boolean }>;
  serviceAreas: Array<{ provinceCode: string; districtCode: string }>;
  schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  upcomingTimeOff: Array<{ startAt: string; endAt: string }>;
  walletBalance: number | null;
  orderCounts: Record<string, number>;
  recentOrders: Array<{ id: string; code: string; status: string; grandTotal: number; createdAt: string }>;
  verification: { status: string; submittedAt: string; reviewedAt: string | null; rejectionReason: string | null } | null;
  reputationEvents: Array<{ kind: string; delta: number; pointsAfter: number; reason: string; createdAt: string }>;
}

/** Admin look-up of technicians (PO 08/10/2026): by name, email, phone, CCCD or id; never by address. */
export const adminTechniciansApi = {
  async search(params: { search?: string; page?: number; pageSize?: number }) {
    const res = await apiClient.get<{ data: AdminTechnicianRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/admin/technicians', { params });
    return { data: res.data.data ?? [], meta: res.data.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 } };
  },
  async detail(id: string): Promise<AdminTechnicianDetail> {
    const res = await apiClient.get<{ data: AdminTechnicianDetail }>(`/admin/technicians/${id}`);
    return res.data.data;
  },
};
