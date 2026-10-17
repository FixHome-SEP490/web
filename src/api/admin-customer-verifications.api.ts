// Admin review of customer identity checks (PO 14/10/2026). Admin only, as for
// technician KYC; a Service Manager cannot review.
import apiClient from './client';
import { readPage, type PageResult } from './paging';
import type { CustomerVerification, CustomerVerificationRecordStatus } from './customer-verification.api';

export interface CustomerVerificationQuery {
  status?: CustomerVerificationRecordStatus;
  search?: string;
  page: number;
  limit: number;
}

export const adminCustomerVerificationsApi = {
  async list(query: CustomerVerificationQuery): Promise<PageResult<CustomerVerification>> {
    const params: Record<string, string | number> = { page: query.page, limit: query.limit };
    if (query.status) params.status = query.status;
    const search = query.search?.trim();
    if (search) params.search = search;
    const res = await apiClient.get<unknown>('/admin/customer-verifications', { params });
    return readPage<CustomerVerification>(res.data, { page: query.page, pageSize: query.limit });
  },

  async detail(id: string): Promise<CustomerVerification> {
    const res = await apiClient.get<{ data: CustomerVerification }>(`/admin/customer-verifications/${id}`);
    return res.data.data;
  },

  async getDocumentAccess(id: string, documentId: string): Promise<string> {
    const res = await apiClient.get<{ data: { signedUrl: string } }>(
      `/admin/customer-verifications/${id}/documents/${documentId}/access`,
    );
    const url = res.data.data?.signedUrl;
    if (!url) throw new Error('Chưa mở được ảnh CCCD, vui lòng thử lại.');
    return url;
  },

  async approve(id: string): Promise<CustomerVerification> {
    const res = await apiClient.patch<{ data: CustomerVerification }>(`/admin/customer-verifications/${id}/approve`);
    return res.data.data;
  },

  async reject(id: string, rejectionReason: string): Promise<CustomerVerification> {
    const res = await apiClient.patch<{ data: CustomerVerification }>(`/admin/customer-verifications/${id}/reject`, {
      rejectionReason,
    });
    return res.data.data;
  },
};
