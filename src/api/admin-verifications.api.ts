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
  return {
    id: String(payload.id ?? ''),
    fullName: String(payload.fullName ?? ''),
    email: String(payload.email ?? ''),
    phoneNumber: payload.phoneNumber == null ? null : String(payload.phoneNumber),
  };
}

function normalizeVerification(payload: unknown): TechnicianVerification {
  const verification = isRecord(payload) ? payload : {};
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
