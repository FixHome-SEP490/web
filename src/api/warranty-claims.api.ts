import apiClient from './client';
import type { PaginationMeta } from '../types';
import type { WarrantyClaimView } from './orders.api';
import type { DeclineReason, InspectionResult, NotCoveredReason, WarrantyClaimStatus } from '../utils/warranty-claim';

export interface WarrantyVisitView {
  id: string;
  status: 'scheduled' | 'checked_in' | 'inspected' | 'completed' | 'cancelled' | string;
  scheduledAt: string | null;
  checkedInAt: string | null;
  proposedResult: InspectionResult | null;
  notCoveredReasonCode: NotCoveredReason | string | null;
  findings: string | null;
  evidenceRefs: string[] | null;
  reServiceNotes: string | null;
  reServiceEvidenceRefs: string[] | null;
  completedAt: string | null;
}

/** Claim as seen by technicians and managers: adds order, customer, coverage and latest visit. */
export interface StaffWarrantyClaim extends WarrantyClaimView {
  order: {
    id: string;
    code: string;
    serviceName: string;
    addressSummary: string;
    customerName: string;
    customerPhone: string;
  };
  coverage: { id: string; itemDescription: string; expiresAt: string } | null;
  visit: WarrantyVisitView | null;
}

export interface ProposeInspectionPayload {
  result: InspectionResult;
  notCoveredReasonCode?: NotCoveredReason;
  findings: string;
  evidenceRefs?: string[];
}

async function post(claimId: string, action: string, body: object): Promise<StaffWarrantyClaim> {
  const res = await apiClient.post<{ data: StaffWarrantyClaim }>(
    `/warranty-claims/${encodeURIComponent(claimId)}/${action}`,
    body,
  );
  return res.data.data;
}

export const warrantyClaimsApi = {
  async listMine(status?: WarrantyClaimStatus): Promise<StaffWarrantyClaim[]> {
    const res = await apiClient.get<{ data: StaffWarrantyClaim[] }>('/warranty-claims/mine', {
      params: status ? { status } : {},
    });
    return res.data.data;
  },

  accept: (claimId: string, payload: { scheduledAt?: string }) => post(claimId, 'accept', payload),

  decline: (claimId: string, payload: { reasonCode: DeclineReason; note?: string }) =>
    post(claimId, 'decline', payload),

  checkIn: (claimId: string, payload: { lat?: number; lng?: number }) => post(claimId, 'check-in', payload),

  propose: (claimId: string, payload: ProposeInspectionPayload) => post(claimId, 'propose', payload),

  complete: (claimId: string, payload: { notes: string; evidenceRefs?: string[] }) =>
    post(claimId, 'complete', payload),
};

export interface WarrantyQueueQuery {
  page?: number;
  limit?: number;
  status?: WarrantyClaimStatus;
  unassigned?: boolean;
  technicianId?: string;
}

export interface TechnicianWarrantyStat {
  technicianId: string;
  fullName: string;
  ordersWithWarranty: number;
  claims: number;
  claimRate: number | null;
  covered: number;
  notCovered: number;
  notCoveredRate: number | null;
  overridden: number;
  overriddenRate: number | null;
  disputed: number;
  disputedRate: number | null;
  declines: number;
  declineRate: number | null;
  lowSample: boolean;
}

const MANAGER_BASE = '/service-manager/warranty-claims';

async function managerPost(claimId: string, action: string, body: object): Promise<StaffWarrantyClaim> {
  const res = await apiClient.post<{ data: StaffWarrantyClaim }>(
    `${MANAGER_BASE}/${encodeURIComponent(claimId)}/${action}`,
    body,
  );
  return res.data.data;
}

export const warrantyManagerApi = {
  async listQueue(query: WarrantyQueueQuery = {}): Promise<{ data: StaffWarrantyClaim[]; meta: PaginationMeta }> {
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '' && value !== false) params[key] = value;
    }
    const res = await apiClient.get<{ data: StaffWarrantyClaim[]; meta: PaginationMeta }>(MANAGER_BASE, { params });
    return { data: res.data.data, meta: res.data.meta };
  },

  async eligibleTechnicians(): Promise<{ id: string; fullName: string }[]> {
    const res = await apiClient.get<{ data: { id: string; fullName: string }[] }>(`${MANAGER_BASE}/eligible-technicians`);
    return res.data.data;
  },

  async technicianStats(windowDays = 90): Promise<TechnicianWarrantyStat[]> {
    const res = await apiClient.get<{ data: TechnicianWarrantyStat[] }>(`${MANAGER_BASE}/stats/technicians`, {
      params: { windowDays },
    });
    return res.data.data;
  },

  assign: (claimId: string, technicianId: string) => managerPost(claimId, 'assign', { technicianId }),

  approve: (
    claimId: string,
    payload: { result?: InspectionResult; reasonCode?: NotCoveredReason; customerNote?: string },
  ) => managerPost(claimId, 'approve', payload),

  reject: (claimId: string, payload: { reasonCode: NotCoveredReason; customerNote: string }) =>
    managerPost(claimId, 'reject', payload),

  close: (claimId: string, payload: { outcome: 'resolved' | 'rejected'; note?: string }) =>
    managerPost(claimId, 'close', payload),
};
