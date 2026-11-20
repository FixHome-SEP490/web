// Check-in faces that did not match the technician's registered face, waiting for a service manager (PO 20/11/2026).
import apiClient from './client';
import { readPage, type PageResult } from './paging';

export type CheckinFaceReviewStatus = 'pending' | 'approved' | 'rejected';

export interface CheckinFaceReview {
  id: string;
  status: CheckinFaceReviewStatus;
  /** Match with the registered face, 0 to 100; null when it could not be compared. */
  similarity: number | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  orderId: string;
  orderCode: string;
  technicianId: string;
  technicianName: string;
}

export interface CheckinFaceReviewDetail extends CheckinFaceReview {
  /** Retakes the technician made before this face was held for review. */
  retakeCount: number;
  /** Short-lived signed links; null when a photo could not be read. */
  checkinPhotoUrl: string | null;
  registeredPhotoUrl: string | null;
}

const BASE = '/service-manager/checkin-face-reviews';

export const checkinFaceReviewsApi = {
  async list(status: CheckinFaceReviewStatus, page: number, pageSize: number): Promise<PageResult<CheckinFaceReview>> {
    const res = await apiClient.get<unknown>(BASE, { params: { status, page, limit: pageSize } });
    return readPage<CheckinFaceReview>(res.data, { page, pageSize });
  },

  async get(id: string): Promise<CheckinFaceReviewDetail> {
    const res = await apiClient.get<{ data: CheckinFaceReviewDetail }>(`${BASE}/${encodeURIComponent(id)}`);
    return res.data.data;
  },

  async review(id: string, body: { approve: boolean; note?: string }): Promise<void> {
    await apiClient.post(`${BASE}/${encodeURIComponent(id)}/review`, body);
  },
};
