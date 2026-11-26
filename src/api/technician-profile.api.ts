// src/api/technician-profile.api.ts
import type { TechnicianAvailability } from '../utils/availability';
import apiClient from './client';

export interface TechnicianSkillView {
  serviceName: string;
  level: string;
  listedLaborPrice: number | null;
  pricingMode: string;
  fixedPrice: number | null;
}

export interface TechnicianServiceAreaView {
  provinceCode: string;
  districtCode: string;
}

export interface TechnicianScheduleView {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TechnicianProfileView {
  bio: string | null;
  yearsExperience: number;
  /** null when the server did not say; never assume the technician is on. */
  isAvailable: boolean | null;
  /** null until the technician has at least one review. */
  averageRating: number | null;
  ratingCount: number;
  reliabilityScore: number | null;
  serviceRadiusKm: number;
  /** Labor warranty given when a service has none of its own; null when never set. */
  defaultLaborWarrantyDays: number | null;
  /** "Tự nhận việc": invitations are accepted for the technician (PO 10/10/2026). */
  autoAcceptInvitations: boolean;
  skills: TechnicianSkillView[];
  serviceAreas: TechnicianServiceAreaView[];
  schedules: TechnicianScheduleView[];
}

export type SkillVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface TechnicianServiceOfferingView {
  id: string;
  serviceId: string;
  listedLaborPrice: number | null;
  typicalWarrantyDays: number | null;
  level: string;
  isActive: boolean;
  verificationStatus: SkillVerificationStatus;
  service: { id: string; name: string; pricingMode: string; isActive: boolean } | null;
}

export type SkillEvidenceType =
  | 'national_skill_certificate'
  | 'vocational_diploma'
  | 'electrical_safety_card'
  | 'manufacturer_training'
  | 'employer_confirmation'
  | 'social_insurance'
  | 'work_photos'
  | 'other';

export interface SkillEvidenceDetailsInput {
  evidenceType: SkillEvidenceType;
  issuer?: string;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  claimedYears?: number;
}

export interface SkillVerificationDocumentView {
  id: string;
  fileName: string;
  issuedById: string | null;
  evidenceType: SkillEvidenceType | null;
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  claimedYears: number | null;
}

/** Trạng thái một giấy tờ, suy ra ở backend từ các kỹ năng nó gắn vào. */
export type SentEvidenceStatus = 'in_review' | 'approved' | 'pending' | 'rejected';

/** Một giấy tờ thợ đã nộp (mỗi file một mục). */
export interface SentSkillEvidence {
  documentId: string;
  /** Một kỹ năng giấy tờ gắn vào, dùng cho đường xem ảnh. */
  serviceId: string;
  /** Mọi kỹ năng giấy tờ gắn vào; backend cũ không có. */
  serviceIds?: string[];
  fileName: string;
  mimeType: string;
  evidenceType: SkillEvidenceType | null;
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  claimedYears: number | null;
  /** Backend cũ không có `status`; `editable` thay thế. */
  status?: SentEvidenceStatus;
  editable?: boolean;
  rejectionReason?: string | null;
  categories: { id: string; name: string }[];
}

export interface SkillVerificationView {
  id: string;
  status: SkillVerificationStatus;
  rejectionReason: string | null;
  documents: SkillVerificationDocumentView[];
}

export interface UpdateSkillPricingDto {
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number | null;
  level?: string;
  isActive?: boolean;
}

export interface TechnicianTimeOffView {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSkill(payload: unknown): TechnicianSkillView {
  const skill = isRecord(payload) ? payload : {};
  const service = isRecord(skill.service) ? skill.service : {};
  return {
    serviceName: String(service.name ?? ''),
    level: String(skill.level ?? 'INTERMEDIATE'),
    listedLaborPrice: skill.listedLaborPrice == null ? null : Number(skill.listedLaborPrice),
    pricingMode: String(service.pricingMode ?? ''),
    fixedPrice: service.fixedPrice == null ? null : Number(service.fixedPrice),
  };
}

function normalizeServiceArea(payload: unknown): TechnicianServiceAreaView {
  const area = isRecord(payload) ? payload : {};
  return {
    provinceCode: String(area.provinceCode ?? ''),
    districtCode: String(area.districtCode ?? ''),
  };
}

/** "HH:mm"; một vài lịch cũ lưu hết ngày là "24:00", máy chủ chỉ nhận "23:59" (cùng nghĩa, ô chọn hiện "24:00"). */
function scheduleTime(value: unknown): string {
  const text = String(value ?? '').slice(0, 5);
  return text === '24:00' ? '23:59' : text;
}

function normalizeSchedule(payload: unknown): TechnicianScheduleView {
  const schedule = isRecord(payload) ? payload : {};
  return {
    dayOfWeek: Number(schedule.dayOfWeek ?? 0),
    startTime: scheduleTime(schedule.startTime),
    endTime: scheduleTime(schedule.endTime),
  };
}

function normalizeOffering(payload: unknown): TechnicianServiceOfferingView {
  const item = isRecord(payload) ? payload : {};
  const service = isRecord(item.service) ? item.service : null;
  return {
    id: String(item.id ?? ''),
    serviceId: String(item.serviceId ?? ''),
    listedLaborPrice: item.listedLaborPrice == null ? null : Number(item.listedLaborPrice),
    typicalWarrantyDays: item.typicalWarrantyDays == null ? null : Number(item.typicalWarrantyDays),
    level: String(item.level ?? 'INTERMEDIATE'),
    isActive: Boolean(item.isActive ?? true),
    verificationStatus: (String(item.verificationStatus ?? 'pending') as SkillVerificationStatus),
    service: service
      ? {
          id: String(service.id ?? ''),
          name: String(service.name ?? ''),
          pricingMode: String(service.pricingMode ?? ''),
          isActive: Boolean(service.isActive ?? true),
        }
      : null,
  };
}

function normalizeSkillVerification(payload: unknown): SkillVerificationView {
  const v = isRecord(payload) ? payload : {};
  return {
    id: String(v.id ?? ''),
    status: (String(v.status ?? 'pending') as SkillVerificationStatus),
    rejectionReason: v.rejectionReason == null ? null : String(v.rejectionReason),
    documents: Array.isArray(v.documents)
      ? v.documents.map((doc): SkillVerificationDocumentView => {
          const d = isRecord(doc) ? doc : {};
          const text = (value: unknown) => (value == null || value === '' ? null : String(value));
          const years = d.claimedYears == null ? NaN : Number(d.claimedYears);
          return {
            id: String(d.id ?? ''),
            fileName: String(d.fileName ?? ''),
            issuedById: d.issuedById == null ? null : String(d.issuedById),
            evidenceType: text(d.evidenceType) as SkillEvidenceType | null,
            issuer: text(d.issuer),
            referenceNumber: text(d.referenceNumber),
            issuedAt: text(d.issuedAt),
            expiresAt: text(d.expiresAt),
            claimedYears: Number.isFinite(years) ? years : null,
          };
        })
      : [],
  };
}

function normalizeTimeOff(payload: unknown): TechnicianTimeOffView {
  const t = isRecord(payload) ? payload : {};
  return {
    id: String(t.id ?? ''),
    startAt: String(t.startAt ?? ''),
    endAt: String(t.endAt ?? ''),
    reason: t.reason == null ? null : String(t.reason),
  };
}

function normalizeProfile(payload: unknown): TechnicianProfileView {
  const profile = isRecord(payload) ? payload : {};
  return {
    bio: profile.bio == null ? null : String(profile.bio),
    yearsExperience: Number(profile.yearsExperience ?? 0),
    isAvailable: typeof profile.isAvailable === 'boolean' ? profile.isAvailable : null,
    averageRating:
      profile.averageRating == null || !(Number(profile.ratingCount) > 0)
        ? null
        : Number(profile.averageRating),
    ratingCount: Number(profile.ratingCount ?? 0),
    reliabilityScore: profile.reliabilityScore == null ? null : Number(profile.reliabilityScore),
    serviceRadiusKm: Number(profile.serviceRadiusKm ?? 10),
    defaultLaborWarrantyDays: profile.defaultLaborWarrantyDays == null ? null : Number(profile.defaultLaborWarrantyDays),
    autoAcceptInvitations: profile.autoAcceptInvitations === true,
    skills: Array.isArray(profile.skills) ? profile.skills.map(normalizeSkill) : [],
    serviceAreas: Array.isArray(profile.serviceAreas)
      ? profile.serviceAreas.map(normalizeServiceArea)
      : [],
    schedules: Array.isArray(profile.schedules) ? profile.schedules.map(normalizeSchedule) : [],
  };
}

export const technicianProfileApi = {
  /** Receiving jobs now: weekly schedule, manual pause, time off (PO 08/10/2026). */
  async getMyAvailability(): Promise<TechnicianAvailability> {
    const res = await apiClient.get<{ data: TechnicianAvailability }>('/technicians/me/availability');
    return res.data.data;
  },

  // ---- Info ----
  async getMyProfile(): Promise<TechnicianProfileView> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/profile');
    return normalizeProfile(res.data.data);
  },

  async updateMyProfile(dto: {
    bio?: string;
    isAvailable?: boolean;
    yearsExperience?: number;
    serviceRadiusKm?: number;
    autoAcceptInvitations?: boolean;
  }): Promise<TechnicianProfileView> {
    const res = await apiClient.patch<{ data: unknown }>('/technicians/me/profile', dto);
    return normalizeProfile(res.data.data);
  },

  /** Default labor warranty (PO 10/10/2026); applyToAllServices also overwrites every service's own value. */
  async setDefaultLaborWarranty(days: number, applyToAllServices: boolean): Promise<{ defaultLaborWarrantyDays: number; servicesUpdated: number }> {
    const res = await apiClient.put<{ data: { defaultLaborWarrantyDays: number; servicesUpdated: number } }>(
      '/technicians/me/warranty-default',
      { days, applyToAllServices },
    );
    return res.data.data;
  },

  /** Last GPS position while the technician app is open; used to offer urgent jobs nearby. */
  async reportLocation(dto: { lat: number; lng: number; accuracyMeters?: number }): Promise<void> {
    await apiClient.patch('/technicians/me/location', dto);
  },

  // ---- Skills (dịch vụ nhận làm) ----
  async getMyServices(): Promise<TechnicianServiceOfferingView[]> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/services');
    return Array.isArray(res.data.data) ? res.data.data.map(normalizeOffering) : [];
  },

  async setSkillPricing(
    serviceId: string,
    dto: UpdateSkillPricingDto,
  ): Promise<TechnicianServiceOfferingView> {
    const res = await apiClient.put<{ data: unknown }>(
      `/technicians/me/services/${serviceId}`,
      dto,
    );
    return normalizeOffering(res.data.data);
  },

  async getSkillVerification(serviceId: string): Promise<SkillVerificationView | null> {
    const res = await apiClient.get<{ data: unknown }>(
      `/technicians/me/services/${serviceId}/verification`,
    );
    return res.data.data == null ? null : normalizeSkillVerification(res.data.data);
  },

  async requestSkillEvidenceUploadUrl(
    serviceId: string,
    mimeType: string,
  ): Promise<{ storageObjectPath: string; uploadUrl: string }> {
    const res = await apiClient.post<{ data: { storageObjectPath: string; uploadUrl: string } }>(
      `/technicians/me/services/${serviceId}/verification/documents/upload-url`,
      { mimeType },
    );
    return res.data.data;
  },

  /** Uploads raw bytes straight to Supabase Storage — different origin, must
   * not carry our backend JWT, so this bypasses apiClient. */
  async uploadSkillEvidenceFile(uploadUrl: string, mimeType: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    });
    if (!res.ok) throw new Error(`Tải file lên thất bại (mã lỗi ${res.status}).`);
  },

  async attachSkillEvidence(
    serviceId: string,
    doc: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string } & Partial<SkillEvidenceDetailsInput>,
  ): Promise<SkillVerificationView> {
    const res = await apiClient.post<{ data: unknown }>(
      `/technicians/me/services/${serviceId}/verification/documents`,
      doc,
    );
    return normalizeSkillVerification(res.data.data);
  },

  /** Giấy tờ thợ đã nộp, mỗi file một mục. */
  async getMySkillEvidence(): Promise<SentSkillEvidence[]> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/skill-evidence');
    return Array.isArray(res.data.data) ? (res.data.data as SentSkillEvidence[]) : [];
  },

  /** Xin chỗ tải ảnh giấy tờ theo nhóm (cùng đường tải của giấy tờ theo kỹ năng). */
  async requestCategoryEvidenceUploadUrl(mimeType: string): Promise<{ storageObjectPath: string; uploadUrl: string }> {
    const res = await apiClient.post<{ data: { storageObjectPath: string; uploadUrl: string } }>(
      '/technicians/me/skill-evidence/upload-url',
      { mimeType },
    );
    return res.data.data;
  },

  /** Gắn giấy tờ đã tải lên cho mọi kỹ năng thợ có trong `categoryIds`. */
  async attachCategoryEvidence(
    categoryIds: string[],
    doc: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string } & SkillEvidenceDetailsInput,
  ): Promise<{ attachedSkills: number; serviceIds: string[] }> {
    const res = await apiClient.post<{ data: { attachedSkills?: number; serviceIds?: string[] } }>('/technicians/me/skill-evidence', { ...doc, categoryIds });
    return { attachedSkills: Number(res.data.data?.attachedSkills ?? 0), serviceIds: res.data.data?.serviceIds ?? [] };
  },

  /** Dùng lại giấy tờ đã nộp cho kỹ năng này, không tải lại; giấy tờ kỹ năng đã có thì bị bỏ qua. */
  async reuseSkillEvidence(serviceId: string, documentIds: string[]): Promise<{ attached: number; skipped: number }> {
    const res = await apiClient.post<{ data: { attached?: number; skipped?: number } }>(
      `/technicians/me/services/${serviceId}/verification/documents/reuse`,
      { documentIds },
    );
    return { attached: Number(res.data.data?.attached ?? 0), skipped: Number(res.data.data?.skipped ?? 0) };
  },

  /** Gỡ một giấy tờ khỏi riêng kỹ năng này; các kỹ năng khác vẫn giữ. */
  async deleteSkillEvidenceFromSkill(serviceId: string, documentId: string): Promise<void> {
    await apiClient.delete(`/technicians/me/services/${serviceId}/verification/documents/${documentId}`);
  },

  /** Gỡ một giấy tờ khỏi mọi kỹ năng nó gắn vào. */
  async deleteSkillEvidence(documentId: string): Promise<void> {
    await apiClient.delete(`/technicians/me/skill-evidence/${documentId}`);
  },

  /** Xin xét duyệt lại một kỹ năng FixHome đã từ chối; giấy tờ đã gửi đi kèm yêu cầu mới. */
  async resubmitSkill(serviceId: string): Promise<void> {
    await apiClient.post(`/technicians/me/services/${serviceId}/verification/resubmit`);
  },

  /** Link ký ngắn hạn để xem ảnh giấy tờ của chính thợ. */
  async getSkillEvidenceAccess(serviceId: string, documentId: string): Promise<string> {
    const res = await apiClient.get<{ data: { signedUrl?: string } }>(`/technicians/me/services/${serviceId}/verification/documents/${documentId}/access`);
    return String(res.data.data?.signedUrl ?? '');
  },

  // ---- Lịch làm việc ----
  async getMySchedule(): Promise<TechnicianScheduleView[]> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/schedule');
    return Array.isArray(res.data.data) ? res.data.data.map(normalizeSchedule) : [];
  },

  async updateMySchedule(
    schedules: TechnicianScheduleView[],
  ): Promise<TechnicianScheduleView[]> {
    const res = await apiClient.put<{ data: unknown }>('/technicians/me/schedule', { schedules });
    return Array.isArray(res.data.data) ? res.data.data.map(normalizeSchedule) : [];
  },

  // ---- Ngày nghỉ ----
  async getMyTimeOff(): Promise<TechnicianTimeOffView[]> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/time-off');
    return Array.isArray(res.data.data) ? res.data.data.map(normalizeTimeOff) : [];
  },

  async createTimeOff(dto: {
    startAt: string;
    endAt: string;
    reason?: string;
  }): Promise<TechnicianTimeOffView> {
    const res = await apiClient.post<{ data: unknown }>('/technicians/me/time-off', dto);
    return normalizeTimeOff(res.data.data);
  },

  async deleteTimeOff(id: string): Promise<void> {
    await apiClient.delete(`/technicians/me/time-off/${id}`);
  },

  // ---- Khu vực phục vụ ----
  async getMyServiceAreas(): Promise<TechnicianServiceAreaView[]> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/service-areas');
    return Array.isArray(res.data.data) ? res.data.data.map(normalizeServiceArea) : [];
  },

  async updateMyServiceAreas(
    areas: TechnicianServiceAreaView[],
  ): Promise<TechnicianServiceAreaView[]> {
    const res = await apiClient.put<{ data: unknown }>('/technicians/me/service-areas', { areas });
    return Array.isArray(res.data.data) ? res.data.data.map(normalizeServiceArea) : [];
  },
};
