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

export interface SkillVerificationDocumentView {
  id: string;
  fileName: string;
  issuedById: string | null;
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

function normalizeSchedule(payload: unknown): TechnicianScheduleView {
  const schedule = isRecord(payload) ? payload : {};
  return {
    dayOfWeek: Number(schedule.dayOfWeek ?? 0),
    startTime: String(schedule.startTime ?? ''),
    endTime: String(schedule.endTime ?? ''),
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
          return {
            id: String(d.id ?? ''),
            fileName: String(d.fileName ?? ''),
            issuedById: d.issuedById == null ? null : String(d.issuedById),
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
    const res = await apiClient.post<{ storageObjectPath: string; uploadUrl: string }>(
      `/technicians/me/services/${serviceId}/verification/documents/upload-url`,
      { mimeType },
    );
    return res.data;
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
    doc: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string },
  ): Promise<SkillVerificationView> {
    const res = await apiClient.post<unknown>(
      `/technicians/me/services/${serviceId}/verification/documents`,
      doc,
    );
    return normalizeSkillVerification(res.data);
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
