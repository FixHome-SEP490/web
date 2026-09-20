import apiClient from './client';
import type { PaginationMeta } from '../types';

export type SkillVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface SkillVerificationDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  issuedById: string | null;
}

export interface SkillVerification {
  id: string;
  technicianSkillId: string;
  technicianId?: string;
  serviceId?: string;
  serviceName?: string;
  status: SkillVerificationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  documents: SkillVerificationDocument[];
  technician?: { fullName: string; email: string } | null;
}

export interface SkillVerificationQuery {
  page?: number;
  limit?: number;
  status?: SkillVerificationStatus;
}

export interface SkillVerificationsResponse {
  data: SkillVerification[];
  meta: PaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeDocument(payload: unknown): SkillVerificationDocument {
  const doc = isRecord(payload) ? payload : {};
  return {
    id: String(doc.id ?? ''),
    documentType: String(doc.documentType ?? 'other'),
    fileName: String(doc.fileName ?? ''),
    fileSize: Number(doc.fileSize ?? 0),
    mimeType: String(doc.mimeType ?? ''),
    issuedById: doc.issuedById == null ? null : String(doc.issuedById),
  };
}

function normalizeVerification(payload: unknown): SkillVerification {
  const v = isRecord(payload) ? payload : {};
  const technician = isRecord(v.technician) ? v.technician : null;
  return {
    id: String(v.id ?? ''),
    technicianSkillId: String(v.technicianSkillId ?? ''),
    technicianId: v.technicianId == null ? undefined : String(v.technicianId),
    serviceId: v.serviceId == null ? undefined : String(v.serviceId),
    serviceName: v.serviceName == null ? undefined : String(v.serviceName),
    status: String(v.status ?? 'pending').toUpperCase() as SkillVerificationStatus,
    submittedAt: String(v.submittedAt ?? ''),
    reviewedAt: v.reviewedAt == null ? null : String(v.reviewedAt),
    rejectionReason: v.rejectionReason == null ? null : String(v.rejectionReason),
    documents: Array.isArray(v.documents) ? v.documents.map(normalizeDocument) : [],
    technician: technician
      ? { fullName: String(technician.fullName ?? ''), email: String(technician.email ?? '') }
      : null,
  };
}

export const adminSkillVerificationsApi = {
  async list(query: SkillVerificationQuery = {}): Promise<SkillVerificationsResponse> {
    const res = await apiClient.get<{ data: unknown[]; meta: PaginationMeta }>(
      '/admin/technician-skill-verifications',
      { params: { ...query, status: query.status?.toLowerCase() } },
    );
    return { data: res.data.data.map(normalizeVerification), meta: res.data.meta };
  },

  async get(id: string): Promise<SkillVerification> {
    const res = await apiClient.get<unknown>(`/admin/technician-skill-verifications/${id}`);
    return normalizeVerification(res.data);
  },

  async getDocumentAccess(id: string, documentId: string): Promise<{ signedUrl: string }> {
    const res = await apiClient.get<{ signedUrl: string }>(
      `/admin/technician-skill-verifications/${id}/documents/${documentId}/access`,
    );
    return res.data;
  },

  /** Uploads raw bytes straight to Supabase Storage — different origin, must
   * not carry our backend JWT, so this bypasses apiClient. */
  async uploadCertificateFile(uploadUrl: string, mimeType: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    });
    if (!res.ok) throw new Error(`Tải file lên thất bại (mã lỗi ${res.status}).`);
  },

  async requestCertificateUploadUrl(
    id: string,
    mimeType: string,
  ): Promise<{ storageObjectPath: string; uploadUrl: string }> {
    const res = await apiClient.post<{ storageObjectPath: string; uploadUrl: string }>(
      `/admin/technician-skill-verifications/${id}/certificate-upload-url`,
      { mimeType },
    );
    return res.data;
  },

  async approve(
    id: string,
    certificate: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string },
  ): Promise<SkillVerification> {
    const res = await apiClient.patch<unknown>(
      `/admin/technician-skill-verifications/${id}/approve`,
      certificate,
    );
    return normalizeVerification(res.data);
  },

  async reject(id: string, rejectionReason: string): Promise<SkillVerification> {
    const res = await apiClient.patch<unknown>(
      `/admin/technician-skill-verifications/${id}/reject`,
      { rejectionReason },
    );
    return normalizeVerification(res.data);
  },
};
