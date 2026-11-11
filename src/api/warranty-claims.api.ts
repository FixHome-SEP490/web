import apiClient, { getHttpStatus } from './client';
import { readPage, type PageResult } from './paging';
import type { PaginationMeta } from '../types';
import type { WarrantyClaimView } from './orders.api';
import type {
  ClaimOutcome,
  DeclineReason,
  DeclineReview,
  InspectionResult,
  NotCoveredReason,
  WarrantyClaimStatus,
} from '../utils/warranty-claim';

export interface WarrantyVisitView {
  id: string;
  status: 'scheduled' | 'checked_in' | 'inspected' | 'completed' | 'cancelled' | string;
  scheduledAt: string | null;
  checkedInAt: string | null;
  proposedResult: InspectionResult | null;
  notCoveredReasonCode: NotCoveredReason | string | null;
  findings: string | null;
  evidenceRefs: string[] | null;
  /** Part lines of the original invoice the technician named as faulty (part fault only). */
  faultyInvoiceItemIds?: string[] | null;
  /** How many of each named line are faulty (line id → count); missing = the whole line. */
  faultyQuantities?: Record<string, number> | null;
  reServiceNotes: string | null;
  reServiceEvidenceRefs: string[] | null;
  completedAt: string | null;
}

/** Claim as seen by technicians and managers: adds order, customer, coverage and latest visit. */
export interface StaffWarrantyClaim extends WarrantyClaimView {
  order: {
    id: string;
    code: string;
    bookingId?: string;
    serviceName: string;
    addressSummary: string;
    customerName: string;
    customerPhone: string;
    /** Part lines of the original invoice: the technician picks the faulty ones for a part fault. */
    partLines?: { id: string; name: string; quantity: number; partSource: string | null }[];
  };
  coverage: { id: string; itemDescription: string; expiresAt: string } | null;
  visit: WarrantyVisitView | null;
  /** The free warranty part and the return of the faulty one. */
  partRequest?: {
    id: string;
    status: string;
    faultyReturnDueAt: string | null;
    faultyReturnedAt: string | null;
    faultyReturnChargedAt: string | null;
    faultyInspectionResult: 'manufacturer' | 'installation' | 'undetermined' | null;
    chargeTechnician: boolean;
  } | null;
  /** A decline or missed response waiting for a manager, or the verdict. */
  declineReview?: DeclineReview | null;
  declineReasonCode?: string | null;
  outcomeCode?: ClaimOutcome | null;
  /** Whole VND returned to the customer wallet when the item could not be fixed. */
  refundAmount?: number | null;
  noShowFlaggedAt?: string | null;
  /** A workmanship fault without parts, approved by the system instead of a manager. */
  autoApproved?: boolean;
}

type Person = { id: string; fullName: string } | null;

/** One claim with everything a service manager needs to judge it. */
export interface WarrantyClaimDetail extends StaffWarrantyClaim {
  /** False when the server answered with the claim only (a backend without the detail block yet). */
  detailLoaded?: boolean;
  detail: {
    decision: {
      finalResult: InspectionResult | null;
      finalReasonCode: string | null;
      smOverrodeProposal: boolean;
      reviewedBy: Person;
      reviewedAt: string | null;
      customerRespondedAt: string | null;
      awaitingSince: string | null;
      escalatedSupportCaseId: string | null;
    };
    declined: { by: Person; at: string | null; reasonCode: string | null; note: string | null } | null;
    originalJob: {
      completedAt: string | null;
      paymentStatus: string;
      laborTotal: number;
      partsTotal: number;
      grandTotal: number;
      laborWarrantyDays: number | null;
      technicians: { id: string; fullName: string; assignedAt: string; isActive: boolean }[];
      lines: {
        id: string;
        type: string;
        description: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        warrantyDays: number;
        partSource: string | null;
        partWarrantyOption: string | null;
        covered: boolean;
        /** The technician named this line as faulty. */
        faulty?: boolean;
        faultyQuantity?: number;
      }[];
    };
    coverage: { id: string; startsAt: string; expiresAt: string; warrantyDays: number; status: string } | null;
    visits: (WarrantyVisitView & { technician: Person })[];
    partRequest: {
      id: string;
      status: string;
      chargeTechnician: boolean;
      faultyInspectionResult: 'manufacturer' | 'installation' | 'undetermined' | null;
      faultyInspectionNote: string | null;
      faultyInspectionEvidence: string[] | null;
      faultyInspectedAt: string | null;
      faultyReturnDueAt?: string | null;
      faultyReturnedAt?: string | null;
      faultyReturnNote?: string | null;
      faultyReturnEvidence?: string[] | null;
      faultyReturnChargedAt?: string | null;
      items: { id: string; name: string; quantity: number; unitPrice: number; usageStatus: string }[];
    } | null;
    otherClaims: { id: string; status: string; submittedAt: string; itemDescription: string }[];
  };
}

export function emptyClaimDetail(): WarrantyClaimDetail['detail'] {
  return {
    decision: { finalResult: null, finalReasonCode: null, smOverrodeProposal: false, reviewedBy: null, reviewedAt: null, customerRespondedAt: null, awaitingSince: null, escalatedSupportCaseId: null },
    declined: null,
    originalJob: { completedAt: null, paymentStatus: 'unpaid', laborTotal: 0, partsTotal: 0, grandTotal: 0, laborWarrantyDays: null, technicians: [], lines: [] },
    coverage: null,
    visits: [],
    partRequest: null,
    otherClaims: [],
  };
}

export interface ReplacementPart {
  partCatalogId: string;
  quantity: number;
}

export interface ProposeInspectionPayload {
  result: InspectionResult;
  notCoveredReasonCode?: NotCoveredReason;
  findings: string;
  evidenceRefs?: string[];
  /** Required for covered_part: the part lines of the original invoice that are faulty. */
  faultyInvoiceItemIds?: string[];
  /** How many of each faulty line are faulty (1..quantity bought); omit for the whole line. */
  faultyQuantities?: Record<string, number>;
}

async function post(claimId: string, action: string, body: object): Promise<StaffWarrantyClaim> {
  const res = await apiClient.post<{ data: StaffWarrantyClaim }>(
    `/warranty-claims/${encodeURIComponent(claimId)}/${action}`,
    body,
  );
  return res.data.data;
}

export const warrantyClaimsApi = {
  /** One page of the claims assigned to me, optionally in one state. */
  async listMine(
    query: { page?: number; pageSize?: number; status?: WarrantyClaimStatus } = {},
  ): Promise<PageResult<StaffWarrantyClaim>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const res = await apiClient.get<unknown>('/warranty-claims/mine', {
      params: { page, pageSize, ...(query.status ? { status: query.status } : {}) },
    });
    return readPage(res.data, { page, pageSize });
  },

  /**
   * One of my claims. A claim handed back or taken by someone else answers 404, and so does a
   * backend without the single-claim route, so a 404 is double-checked against my own list.
   */
  async get(claimId: string): Promise<StaffWarrantyClaim> {
    try {
      const res = await apiClient.get<{ data: StaffWarrantyClaim }>(`/warranty-claims/${encodeURIComponent(claimId)}`);
      return res.data.data;
    } catch (reason) {
      if (getHttpStatus(reason) !== 404) throw reason;
      const pageSize = 100;
      for (let page = 1; page <= 5; page++) {
        const result = await warrantyClaimsApi.listMine({ page, pageSize });
        const found = result.items.find((claim) => claim.id === claimId);
        if (found) return found;
        if (page * pageSize >= result.total) break;
      }
      throw reason;
    }
  },

  accept: (claimId: string, payload: { scheduledAt: string }) => post(claimId, 'accept', payload),

  /** Moves the inspection time until check-in; the customer is told. */
  reschedule: (claimId: string, payload: { scheduledAt: string }) => post(claimId, 'reschedule', payload),

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
  /** Only claims whose decline or missed response a manager still has to judge. */
  declineReview?: 'pending';
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

  async getDetail(claimId: string): Promise<WarrantyClaimDetail> {
    const res = await apiClient.get<{ data: StaffWarrantyClaim & Partial<WarrantyClaimDetail> }>(`${MANAGER_BASE}/${encodeURIComponent(claimId)}`);
    const data = res.data.data;
    // A backend without the detail block still answers with the claim itself: show that, not a blank page.
    return { ...data, detail: data.detail ?? emptyClaimDetail(), detailLoaded: !!data.detail };
  },

  assign: (claimId: string, technicianId: string) => managerPost(claimId, 'assign', { technicianId }),

  approve: (
    claimId: string,
    payload: {
      result?: InspectionResult;
      reasonCode?: NotCoveredReason;
      customerNote?: string;
      overrideReason?: string;
      replacementParts?: ReplacementPart[];
    },
  ) => managerPost(claimId, 'approve', payload),

  reject: (claimId: string, payload: { reasonCode: NotCoveredReason; customerNote: string }) =>
    managerPost(claimId, 'reject', payload),

  close: (claimId: string, payload: { outcome: 'resolved' | 'rejected' | 'unfixed'; note?: string; refundAmount?: number }) =>
    managerPost(claimId, 'close', payload),

  reviewDecline: (claimId: string, payload: { valid: boolean; note: string }) =>
    managerPost(claimId, 'review-decline', payload),
};
