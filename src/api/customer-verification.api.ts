// Customer identity verification (PO 14/10/2026): needed once before the first
// withdrawal. Both sides of the citizen ID card go to private storage through
// signed upload URLs, then the details as printed on the card are submitted.
import apiClient from './client';
import type { CustomerKycStatus } from './customer-wallet.api';

export type CustomerKycMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type CustomerKycDocumentType = 'citizen_id_front' | 'citizen_id_back';
export type CustomerGender = 'male' | 'female' | 'other';

export const CUSTOMER_KYC_MIME_TYPES: readonly CustomerKycMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
export const CUSTOMER_KYC_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const genderLabels: Record<CustomerGender, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' };

export interface CustomerVerificationDocument {
  id: string;
  documentType: CustomerKycDocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

/** Backend status of one submission (lower case, as the server sends it). */
export type CustomerVerificationRecordStatus = 'pending' | 'verified' | 'rejected';

export interface CustomerVerification {
  id: string;
  customerId: string;
  status: CustomerVerificationRecordStatus;
  fullName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  gender: CustomerGender | string;
  citizenIdNumber: string;
  address: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  /** The name frozen at approval; bank account holders must match it. */
  verifiedFullName: string | null;
  documents: CustomerVerificationDocument[];
  /** Admin lists only. */
  customer?: { id: string; fullName: string; email: string; phoneNumber: string | null; status: string };
  reviewedBy?: { id: string; fullName: string } | null;
}

/** What the customer's own read answers: the status, the last submission and prefill values. */
export interface CustomerKycState {
  status: CustomerKycStatus;
  rejectionReason: string | null;
  verification: CustomerVerification | null;
  profile: {
    fullName: string;
    dateOfBirth: string | null;
    gender: CustomerGender | string | null;
    citizenIdNumber: string | null;
    address: string | null;
  };
}

export interface CustomerKycUploadSlot {
  storageObjectPath: string;
  uploadUrl: string;
}

export interface SubmitCustomerKycDocument {
  documentType: CustomerKycDocumentType;
  storageObjectPath: string;
  fileName: string;
  fileSize: number;
  mimeType: CustomerKycMimeType;
}

export interface SubmitCustomerKyc {
  fullName: string;
  dateOfBirth: string;
  gender: CustomerGender;
  citizenIdNumber: string;
  address: string;
  documents: SubmitCustomerKycDocument[];
}

export const customerVerificationApi = {
  async getMine(): Promise<CustomerKycState> {
    const res = await apiClient.get<{ data: CustomerKycState }>('/customer/verification');
    return res.data.data;
  },

  async requestUploadUrl(mimeType: CustomerKycMimeType): Promise<CustomerKycUploadSlot> {
    const res = await apiClient.post<{ data: CustomerKycUploadSlot }>('/customer/verification/upload-url', { mimeType });
    return { storageObjectPath: String(res.data.data.storageObjectPath ?? ''), uploadUrl: String(res.data.data.uploadUrl ?? '') };
  },

  /**
   * Sends the bytes straight to storage. Deliberately not through apiClient:
   * another origin, and it must not carry the FixHome sign-in token.
   */
  async uploadToSignedUrl(uploadUrl: string, mimeType: CustomerKycMimeType, file: File): Promise<void> {
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
    if (!res.ok) throw new Error('Chưa tải được ảnh CCCD lên, vui lòng thử lại.');
  },

  async submit(payload: SubmitCustomerKyc): Promise<CustomerKycState> {
    const res = await apiClient.post<{ data: CustomerKycState }>('/customer/verification', payload);
    return res.data.data;
  },

  async getDocumentAccess(documentId: string): Promise<string> {
    const res = await apiClient.get<{ data: { signedUrl: string } }>(`/customer/verification/documents/${documentId}/access`);
    return res.data.data?.signedUrl ?? '';
  },
};
