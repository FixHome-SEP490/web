import apiClient from './client';

// Duyệt danh tính → hẹn lên trụ sở → duyệt hồ sơ (PO 09/11/2026). Hợp đồng bám theo backend `technician-office-visits`.

export type ReviewStage =
  | 'identity_review'
  | 'visit_required'
  | 'visit_scheduled'
  | 'visit_blocked'
  | 'profile_review'
  | 'approved'
  | 'identity_rejected'
  | 'profile_rejected';

export type OfficeVisitStatus = 'scheduled' | 'attended' | 'missed' | 'cancelled';

export interface VisitOffice {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  isActive: boolean;
  /** 1 = thứ hai … 7 = chủ nhật. */
  visitDays: number[];
  openTime: string;
  closeTime: string;
  lunchStart: string | null;
  lunchEnd: string | null;
  slotMinutes: number;
  slotCapacity: number;
}

export type VisitOfficeInput = Omit<VisitOffice, 'id'>;

export interface OfficeVisitRow {
  id: string;
  officeId: string;
  officeName: string;
  officeAddress: string;
  scheduledAt: string;
  status: OfficeVisitStatus;
  technicianId: string;
  technicianName: string;
  technicianPhone: string | null;
  note: string | null;
}

export interface ProfileReviewRow {
  technicianId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  identityVerifiedAt: string | null;
  stage: ReviewStage | null;
  visit: { id: string; status: OfficeVisitStatus; scheduledAt: string; officeName: string } | null;
  missedVisits: number;
}

export interface ProfileReviewSkill {
  id: string;
  serviceName: string;
  declaredLevel: string | null;
  level: string;
  verificationStatus: string;
}

export interface ProfileReviewDetail {
  technicianId: string;
  stage: ReviewStage | null;
  technician: { fullName: string; email: string; phoneNumber: string | null; citizenIdNumber: string | null };
  profile: {
    yearsExperience: number;
    bio: string | null;
    fullAddress: string | null;
    serviceRadiusKm: number;
    serviceAreas: { provinceCode: string; districtCode: string }[];
    rejectionReason: string | null;
  };
  skills: ProfileReviewSkill[];
  verificationId: string | null;
  faceMatchScore: number | null;
  documents: { id: string; documentType: string; fileName: string }[];
  visits: { id: string; status: OfficeVisitStatus; scheduledAt: string; officeName: string; note: string | null }[];
}

export interface SkillDecision {
  skillId: string;
  level: string;
  approved: boolean;
}

type Wrapped<T> = { data: T } | T;
const unwrap = <T>(body: Wrapped<T>): T => ((body as { data?: T })?.data !== undefined ? (body as { data: T }).data : (body as T));

export const adminOfficeVisitsApi = {
  async listOffices(): Promise<VisitOffice[]> {
    return unwrap((await apiClient.get<Wrapped<VisitOffice[]>>('/admin/visit-offices')).data);
  },
  async createOffice(input: Partial<VisitOfficeInput>): Promise<VisitOffice> {
    return unwrap((await apiClient.post<Wrapped<VisitOffice>>('/admin/visit-offices', input)).data);
  },
  async updateOffice(id: string, input: Partial<VisitOfficeInput>): Promise<VisitOffice> {
    return unwrap((await apiClient.patch<Wrapped<VisitOffice>>(`/admin/visit-offices/${id}`, input)).data);
  },

  async listVisits(params: { status?: OfficeVisitStatus; officeId?: string; date?: string } = {}): Promise<OfficeVisitRow[]> {
    return unwrap((await apiClient.get<Wrapped<OfficeVisitRow[]>>('/admin/technician-office-visits', { params })).data);
  },
  async markAttended(id: string, note?: string): Promise<void> {
    await apiClient.patch(`/admin/technician-office-visits/${id}/attended`, { note });
  },
  async markMissed(id: string, note?: string): Promise<{ missedVisits: number; blocked: boolean }> {
    return unwrap((await apiClient.patch<Wrapped<{ missedVisits: number; blocked: boolean }>>(`/admin/technician-office-visits/${id}/missed`, { note })).data);
  },
  async resetMissed(technicianId: string): Promise<void> {
    await apiClient.post(`/admin/technician-office-visits/technicians/${technicianId}/reset`);
  },

  async listReviews(): Promise<ProfileReviewRow[]> {
    return unwrap((await apiClient.get<Wrapped<ProfileReviewRow[]>>('/admin/technician-profile-reviews')).data);
  },
  async getReview(technicianId: string): Promise<ProfileReviewDetail> {
    return unwrap((await apiClient.get<Wrapped<ProfileReviewDetail>>(`/admin/technician-profile-reviews/${technicianId}`)).data);
  },
  async approveReview(technicianId: string, skills: SkillDecision[]): Promise<void> {
    await apiClient.patch(`/admin/technician-profile-reviews/${technicianId}/approve`, { skills });
  },
  async rejectReview(technicianId: string, reason: string): Promise<void> {
    await apiClient.patch(`/admin/technician-profile-reviews/${technicianId}/reject`, { reason });
  },
};
