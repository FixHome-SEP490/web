import apiClient from './client';
import type { PaginationMeta } from '../types';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
type BackendVerificationStatus = 'pending' | 'approved' | 'verified' | 'rejected';

export interface VerificationDocument {
  id?: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface VerificationTechnician {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  citizenIdNumber?: string | null;
}

export interface VerificationProfileSkill {
  name: string;
  level: string;
}

export interface VerificationProfile {
  yearsExperience: number;
  bio?: string | null;
  serviceRadiusKm: number;
  fullAddress?: string | null;
  skills: VerificationProfileSkill[];
  serviceAreas: string[];
}

export interface TechnicianVerification {
  id: string;
  technicianId: string;
  status: VerificationStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  rejectionReason?: string | null;
  documents: VerificationDocument[];
  technician?: VerificationTechnician | null;
  technicianProfile?: VerificationProfile | null;
  
  // Flattened for UI compatibility
  identityCardNumber?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  yearsExperience?: number | null;
  skills?: VerificationProfileSkill[];
  bio?: string | null;
  address?: string | null;
  serviceRadiusKm?: number | null;
  serviceAreas?: string[];
}

export interface VerificationQuery {
  page?: number;
  limit?: number;
  status?: VerificationStatus;
}

export interface VerificationsResponse {
  data: TechnicianVerification[];
  meta: PaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStatus(value: unknown): VerificationStatus {
  switch (String(value ?? '').toUpperCase()) {
    case 'PENDING':
      return 'PENDING';
    case 'APPROVED':
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
      return 'REJECTED';
    default:
      throw new Error('Backend returned an unsupported verification status.');
  }
}

function toBackendStatus(status: VerificationStatus): BackendVerificationStatus {
  if (status === 'VERIFIED') return 'approved';
  return status.toLowerCase() as BackendVerificationStatus;
}

function normalizeDocument(payload: unknown): VerificationDocument {
  const document = isRecord(payload) ? payload : {};
  return {
    id: document.id == null ? undefined : String(document.id),
    documentType: String(document.documentType ?? 'other'),
    fileUrl: String(document.fileUrl ?? ''),
    fileName: String(document.fileName ?? ''),
    fileSize: Number(document.fileSize ?? 0),
    mimeType: String(document.mimeType ?? ''),
  };
}

function normalizeTechnician(payload: unknown): VerificationTechnician | null {
  if (!isRecord(payload)) return null;
  const t = payload as Record<string, unknown>;
  return {
    id: String(t.id ?? ''),
    fullName: String(t.fullName ?? ''),
    email: String(t.email ?? ''),
    phoneNumber: t.phoneNumber == null ? null : String(t.phoneNumber),
    dateOfBirth: t.dateOfBirth == null ? null : String(t.dateOfBirth),
    gender: t.gender == null ? null : String(t.gender),
    citizenIdNumber: t.citizenIdNumber == null ? null : String(t.citizenIdNumber),
  };
}

function normalizeVerification(payload: unknown): TechnicianVerification {
  const verification = isRecord(payload) ? payload : {};
  const t = isRecord(verification.technician) ? verification.technician : {};
  const tp = isRecord(verification.technicianProfile) ? verification.technicianProfile : {};
  
  return {
    id: String(verification.id ?? ''),
    technicianId: String(verification.technicianId ?? ''),
    status: normalizeStatus(verification.status),
    submittedAt: String(verification.submittedAt ?? ''),
    reviewedAt: verification.reviewedAt == null ? null : String(verification.reviewedAt),
    reviewedById: verification.reviewedById == null ? null : String(verification.reviewedById),
    rejectionReason:
      verification.rejectionReason == null ? null : String(verification.rejectionReason),
    documents: Array.isArray(verification.documents)
      ? verification.documents.map(normalizeDocument)
      : [],
    technician: normalizeTechnician(verification.technician),
    
    // Flattened profile data for UI compatibility
    identityCardNumber: t.citizenIdNumber != null ? String(t.citizenIdNumber) : null,
    dateOfBirth: t.dateOfBirth != null ? String(t.dateOfBirth) : null,
    gender: t.gender != null ? String(t.gender) : null,
    yearsExperience: tp.yearsExperience != null ? Number(tp.yearsExperience) : null,
    skills: Array.isArray(tp.skills) ? (tp.skills as VerificationProfileSkill[]) : [],
    bio: tp.bio != null ? String(tp.bio) : null,
    address: tp.fullAddress != null ? String(tp.fullAddress) : null,
    serviceRadiusKm: tp.serviceRadiusKm != null ? Number(tp.serviceRadiusKm) : null,
    serviceAreas: Array.isArray(tp.serviceAreas) ? (tp.serviceAreas as string[]) : [],
  };
}

function unwrapVerifications(payload: unknown): VerificationsResponse {
  const outer = isRecord(payload) ? payload : {};
  const candidate = Array.isArray(payload) ? payload : outer.data;
  const dataSource = Array.isArray(candidate)
    ? candidate
    : isRecord(candidate) && Array.isArray(candidate.data)
      ? candidate.data
      : null;
  if (!dataSource) throw new Error('Backend returned an invalid verification list response.');
  const metaSource =
    isRecord(candidate) && isRecord(candidate.meta) ? candidate.meta : outer.meta;
  const dataLength = dataSource.length;
  const meta: PaginationMeta = {
    page: Number(metaSource && isRecord(metaSource) ? metaSource.page : 1) || 1,
    limit: Number(metaSource && isRecord(metaSource) ? metaSource.limit : dataLength) || dataLength,
    total: Number(metaSource && isRecord(metaSource) ? metaSource.total : dataLength) || 0,
    totalPages:
      Number(metaSource && isRecord(metaSource) ? metaSource.totalPages : 1) || 1,
  };
  return { data: dataSource.map(normalizeVerification), meta };
}

function unwrapVerification(payload: unknown): TechnicianVerification {
  const outer = isRecord(payload) ? payload : {};
  return normalizeVerification(
    outer.data && isRecord(outer.data) ? outer.data : payload,
  );
}

export const adminVerificationsApi = {
  async getVerifications(query: VerificationQuery = {}): Promise<VerificationsResponse> {
    const params = {
      ...query,
      status: query.status ? toBackendStatus(query.status) : undefined,
    };
    const response = await apiClient.get<unknown>('/admin/technician-verifications', { params });
    return unwrapVerifications(response.data);
  },

  async getVerification(id: string): Promise<TechnicianVerification> {
    const response = await apiClient.get<unknown>(`/admin/technician-verifications/${id}`);
    return unwrapVerification(response.data);
  },

  async getDocumentAccess(verificationId: string, documentId: string): Promise<string> {
    const response = await apiClient.get<{ signedUrl?: string; data?: { signedUrl?: string } }>(
      `/admin/technician-verifications/${verificationId}/documents/${documentId}/access`,
    );
    const url = response.data.signedUrl ?? response.data.data?.signedUrl;
    if (!url) throw new Error('Backend did not return a signed document URL.');
    return url;
  },

  async approveVerification(id: string): Promise<TechnicianVerification> {
    const response = await apiClient.patch<unknown>(
      `/admin/technician-verifications/${id}/approve`,
    );
    return unwrapVerification(response.data);
  },

  async rejectVerification(id: string, rejectionReason: string): Promise<TechnicianVerification> {
    const response = await apiClient.patch<unknown>(
      `/admin/technician-verifications/${id}/reject`,
      { rejectionReason },
    );
    return unwrapVerification(response.data);
  },
};
