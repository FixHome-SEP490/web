import apiClient from './client';
import type { PaginationMeta } from '../types';

export type SkillVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/** Same wording as the technician app, so the reviewer reads what the technician picked. */
export const SKILL_EVIDENCE_TYPE_LABEL: Record<string, string> = {
  national_skill_certificate: 'Chứng chỉ kỹ năng nghề quốc gia',
  vocational_diploma: 'Bằng trung cấp hoặc cao đẳng nghề',
  electrical_safety_card: 'Thẻ an toàn điện',
  manufacturer_training: 'Chứng nhận đào tạo của hãng',
  employer_confirmation: 'Xác nhận của nơi làm cũ',
  social_insurance: 'Sổ bảo hiểm xã hội',
  work_photos: 'Ảnh công trình đã làm',
  other: 'Giấy tờ khác',
};

export const SKILL_EVIDENCE_GROUP_LABEL: Record<string, string> = {
  official: 'Chính thức',
  verifiable: 'Kiểm chứng được',
  self_declared: 'Tự khai',
};

export const SKILL_EVIDENCE_REVIEW_LABEL: Record<string, string> = {
  pending: 'Chờ xem xét',
  valid: 'Hợp lệ',
  invalid: 'Không hợp lệ',
  need_more: 'Cần bổ sung',
};

/** The details the technician declared for one paper, as the backend sends them. */
export interface SkillEvidenceDetails {
  evidenceType: string | null;
  evidenceGroup: string | null;
  issuer: string | null;
  referenceNumber: string | null;
  /** `YYYY-MM-DD`, as the backend stores it. */
  issuedAt: string | null;
  expiresAt: string | null;
  claimedYears: number | null;
  reviewStatus?: string | null;
  reviewNote?: string | null;
}

export interface SkillVerificationDocument extends SkillEvidenceDetails {
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
  /** 1 for the first request of the skill, 2 after one earlier request, and so on. */
  attemptNumber: number;
  /** Reason of the latest earlier rejection of this skill. */
  previousRejectionReason: string | null;
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

const text = (value: unknown) => (value == null || value === '' ? null : String(value));

export function normalizeDocument(payload: unknown): SkillVerificationDocument {
  const doc = isRecord(payload) ? payload : {};
  return {
    evidenceType: text(doc.evidenceType),
    evidenceGroup: text(doc.evidenceGroup),
    issuer: text(doc.issuer),
    referenceNumber: text(doc.referenceNumber),
    issuedAt: text(doc.issuedAt),
    expiresAt: text(doc.expiresAt),
    claimedYears: doc.claimedYears == null ? null : Number(doc.claimedYears),
    reviewStatus: text(doc.reviewStatus),
    reviewNote: text(doc.reviewNote),
    id: String(doc.id ?? ''),
    documentType: String(doc.documentType ?? 'other'),
    fileName: String(doc.fileName ?? ''),
    fileSize: Number(doc.fileSize ?? 0),
    mimeType: String(doc.mimeType ?? ''),
    issuedById: doc.issuedById == null ? null : String(doc.issuedById),
  };
}

export function normalizeVerification(payload: unknown): SkillVerification {
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
    attemptNumber: Number(v.attemptNumber) > 0 ? Number(v.attemptNumber) : 1,
    previousRejectionReason: v.previousRejectionReason == null ? null : String(v.previousRejectionReason),
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
    const res = await apiClient.get<{ data: unknown }>(`/admin/technician-skill-verifications/${id}`);
    return normalizeVerification(res.data.data);
  },

  async getDocumentAccess(id: string, documentId: string): Promise<{ signedUrl: string }> {
    const res = await apiClient.get<{ signedUrl?: string; data?: { signedUrl: string } }>(
      `/admin/technician-skill-verifications/${id}/documents/${documentId}/access`,
    );
    const signedUrl = res.data.signedUrl ?? res.data.data?.signedUrl;
    if (!signedUrl) throw new Error('Backend did not return a signed document URL.');
    return { signedUrl };
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
    const res = await apiClient.post<{ data: { storageObjectPath: string; uploadUrl: string } }>(
      `/admin/technician-skill-verifications/${id}/certificate-upload-url`,
      { mimeType },
    );
    return res.data.data;
  },

  /** Duyệt không cần tệp; `certificate` chỉ cho luồng cũ có chứng chỉ FixHome cấp. */
  async approve(
    id: string,
    certificate?: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string },
  ): Promise<SkillVerification> {
    const res = await apiClient.patch<{ data: unknown }>(
      `/admin/technician-skill-verifications/${id}/approve`,
      certificate ?? {},
    );
    return normalizeVerification(res.data.data);
  },

  async reject(id: string, rejectionReason: string): Promise<SkillVerification> {
    const res = await apiClient.patch<{ data: unknown }>(
      `/admin/technician-skill-verifications/${id}/reject`,
      { rejectionReason },
    );
    return normalizeVerification(res.data.data);
  },
};
