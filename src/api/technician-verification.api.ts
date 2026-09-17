// src/api/technician-verification.api.ts
import apiClient from './client';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
type BackendVerificationStatus = 'pending' | 'approved' | 'verified' | 'rejected';

export type KycDocumentType = 'citizen_id_front' | 'citizen_id_back' | 'face_photo';
export type KycMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface MyVerificationDocument {
  documentType: string;
  fileName: string;
}

export interface MyVerification {
  id: string;
  status: VerificationStatus;
  submittedAt: string;
  rejectionReason: string | null;
  documents: MyVerificationDocument[];
}

export interface KycUploadSlot {
  storageObjectPath: string;
  uploadUrl: string;
  token: string;
}

export interface SubmitDocumentPayload {
  documentType: KycDocumentType;
  storageObjectPath: string;
  fileName: string;
  fileSize: number;
  mimeType: KycMimeType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStatus(value: unknown): VerificationStatus {
  switch (String(value ?? '').toUpperCase() as Uppercase<BackendVerificationStatus>) {
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

function normalizeDocument(payload: unknown): MyVerificationDocument {
  const document = isRecord(payload) ? payload : {};
  return {
    documentType: String(document.documentType ?? 'other'),
    fileName: String(document.fileName ?? ''),
  };
}

function normalizeVerification(payload: unknown): MyVerification {
  const verification = isRecord(payload) ? payload : {};
  return {
    id: String(verification.id ?? ''),
    status: normalizeStatus(verification.status),
    submittedAt: String(verification.submittedAt ?? ''),
    rejectionReason:
      verification.rejectionReason == null ? null : String(verification.rejectionReason),
    documents: Array.isArray(verification.documents)
      ? verification.documents.map(normalizeDocument)
      : [],
  };
}

export const technicianVerificationApi = {
  async getMyVerification(): Promise<MyVerification | null> {
    const res = await apiClient.get<{ data: unknown }>('/technicians/me/verification');
    return res.data.data == null ? null : normalizeVerification(res.data.data);
  },

  async requestUploadUrl(mimeType: KycMimeType): Promise<KycUploadSlot> {
    const res = await apiClient.post<{ data: unknown }>(
      '/technicians/me/verification/documents/upload-url',
      { mimeType },
    );
    const slot = isRecord(res.data.data) ? res.data.data : {};
    return {
      storageObjectPath: String(slot.storageObjectPath ?? ''),
      uploadUrl: String(slot.uploadUrl ?? ''),
      token: String(slot.token ?? ''),
    };
  },

  /** Uploads raw bytes straight to Supabase Storage. Deliberately bypasses
   * apiClient: this is a different origin and must not carry our backend JWT. */
  async uploadToSignedUrl(uploadUrl: string, mimeType: KycMimeType, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`Tải ảnh lên thất bại (mã lỗi ${res.status}).`);
    }
  },

  async submit(documents: SubmitDocumentPayload[]): Promise<MyVerification> {
    const res = await apiClient.post<{ data: unknown }>('/technicians/me/verification', {
      documents,
    });
    return normalizeVerification(res.data.data);
  },
};
