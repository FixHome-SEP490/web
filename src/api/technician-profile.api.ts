// src/api/technician-profile.api.ts
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
  isAvailable: boolean;
  averageRating: number;
  ratingCount: number;
  reliabilityScore: number;
  skills: TechnicianSkillView[];
  serviceAreas: TechnicianServiceAreaView[];
  schedules: TechnicianScheduleView[];
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

function normalizeProfile(payload: unknown): TechnicianProfileView {
  const profile = isRecord(payload) ? payload : {};
  return {
    bio: profile.bio == null ? null : String(profile.bio),
    yearsExperience: Number(profile.yearsExperience ?? 0),
    isAvailable: Boolean(profile.isAvailable ?? true),
    averageRating: Number(profile.averageRating ?? 5),
    ratingCount: Number(profile.ratingCount ?? 0),
    reliabilityScore: Number(profile.reliabilityScore ?? 100),
    skills: Array.isArray(profile.skills) ? profile.skills.map(normalizeSkill) : [],
    serviceAreas: Array.isArray(profile.serviceAreas)
      ? profile.serviceAreas.map(normalizeServiceArea)
      : [],
    schedules: Array.isArray(profile.schedules) ? profile.schedules.map(normalizeSchedule) : [],
  };
}

export const technicianProfileApi = {
  async getMyProfile(): Promise<TechnicianProfileView> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/profile');
    return normalizeProfile(res.data.data);
  },

  async updateMyProfile(dto: {
    bio?: string;
    isAvailable?: boolean;
    yearsExperience?: number;
  }): Promise<TechnicianProfileView> {
    const res = await apiClient.patch<{ data: unknown }>('/technicians/me/profile', dto);
    return normalizeProfile(res.data.data);
  },
};
