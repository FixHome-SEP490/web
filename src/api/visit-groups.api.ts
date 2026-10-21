// src/api/visit-groups.api.ts
// Up to three devices in one visit (PO 21/10/2026): one technician with every
// skill takes them all and the customer pays once for the devices repaired.
import type { BookingMode, BookingSlot, SessionOption } from '../utils/booking-session';
import type { BookingDeviceAttributes } from './catalog-pricing.api';
import type { BookingItem, TechnicianCandidate } from './bookings.api';
import { CANDIDATES_TIMEOUT_MS, normalizeBooking } from './bookings.api';
import apiClient from './client';

/** The most devices one visit takes; the form locks "Thêm thiết bị" at this count. */
export const VISIT_DEVICE_LIMIT = 3;

export interface VisitDeviceInput {
  serviceId: string;
  deviceLabel?: string;
  description?: string;
  deviceAttributes?: BookingDeviceAttributes;
  selectedVariantCode?: string;
  photoUploadIds?: string[];
}

export interface CreateVisitDto {
  addressId: string;
  mode: BookingMode;
  date?: string;
  slot?: BookingSlot;
  customerNote?: string;
  urgency?: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  idempotencyKey: string;
  items: VisitDeviceInput[];
}

export interface VisitItem {
  id: string;
  sequence: number;
  serviceId: string;
  deviceLabel: string | null;
  booking: BookingItem | null;
}

export interface Visit {
  id: string;
  status: 'submitted' | 'cancelled';
  bookingMode: BookingMode;
  slot: BookingSlot | null;
  preferredStartAt: string;
  preferredEndAt: string;
  leadBookingId: string | null;
  items: VisitItem[];
}

export type VisitDeviceState = 'succeeded' | 'failed' | 'quote_declined' | 'cancelled' | 'open';

export interface VisitCheckout {
  visitGroupId: string;
  devices: Array<{
    sequence: number;
    deviceLabel: string | null;
    bookingId: string;
    serviceName: string | null;
    serviceOrderId: string | null;
    orderCode: string | null;
    state: VisitDeviceState;
    invoiceId: string | null;
    amount: number;
    paid: boolean;
  }>;
  total: number;
  waiting: number;
  ready: boolean;
  paid: boolean;
  pendingCash: { id: string; amount: number; declaredAt: string } | null;
}

const URGENCY = { LOW: 'low', NORMAL: 'medium', HIGH: 'high', EMERGENCY: 'critical' } as const;

function normalizeVisit(raw: Visit): Visit {
  return {
    ...raw,
    items: (raw.items ?? []).map((item) => ({
      ...item,
      booking: item.booking ? normalizeBooking(item.booking) : null,
    })),
  };
}

export const visitGroupsApi = {
  /** Whether several devices may be booked now, and the limit. */
  async contact(): Promise<{ enabled: boolean; deviceLimit: number }> {
    const res = await apiClient.get<{ data: { enabled?: boolean; deviceLimit?: number } }>('/visit-groups/contact');
    return { enabled: res.data.data?.enabled === true, deviceLimit: Number(res.data.data?.deviceLimit) || VISIT_DEVICE_LIMIT };
  },

  async create(dto: CreateVisitDto): Promise<Visit> {
    const res = await apiClient.post<{ data: Visit }>('/visit-groups', { ...dto, ...(dto.urgency ? { urgency: URGENCY[dto.urgency] } : {}) });
    return normalizeVisit(res.data.data);
  },

  async get(id: string): Promise<Visit> {
    const res = await apiClient.get<{ data: Visit }>(`/visit-groups/${id}`);
    return normalizeVisit(res.data.data);
  },

  async candidates(id: string): Promise<TechnicianCandidate[]> {
    const res = await apiClient.get<{ data: TechnicianCandidate[] }>(`/visit-groups/${id}/technician-candidates`, { timeout: CANDIDATES_TIMEOUT_MS });
    return res.data.data.map((candidate) => {
      if (!candidate.userId?.trim()) throw new Error('Candidate missing technician User ID');
      return { ...candidate, id: candidate.userId.trim() };
    });
  },

  async shortlist(id: string, technicianIds: string[]): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/shortlist`, { technicianIds });
  },

  async extendMatching(id: string): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/matching/extend`);
  },

  async reschedule(id: string, dto: { date: string; slot: BookingSlot }): Promise<Visit> {
    const res = await apiClient.post<{ data: Visit }>(`/visit-groups/${id}/reschedule`, { mode: 'scheduled', ...dto });
    return normalizeVisit(res.data.data);
  },

  /** Sessions the technician holding the visit is free for (through its lead booking). */
  async availableSessions(leadBookingId: string): Promise<SessionOption[]> {
    const res = await apiClient.get<{ data: { sessions?: SessionOption[] } }>(`/bookings/${leadBookingId}/available-slots`, { params: { days: 14 } });
    return res.data.data?.sessions ?? [];
  },

  async cancel(id: string, reason: string): Promise<Visit> {
    const res = await apiClient.post<{ data: Visit }>(`/visit-groups/${id}/cancel`, { reason });
    return normalizeVisit(res.data.data);
  },

  async withdraw(id: string, reason: string): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/withdraw`, { reason });
  },

  async checkout(id: string): Promise<VisitCheckout> {
    const res = await apiClient.get<{ data: VisitCheckout }>(`/visit-groups/${id}/checkout`);
    return res.data.data;
  },

  async payWithWallet(id: string): Promise<{ amount: number; balance: number }> {
    const res = await apiClient.post<{ data: { amount: number; balance: number } }>(`/visit-groups/${id}/checkout/wallet`);
    return res.data.data;
  },

  async vnpayUrl(id: string): Promise<string> {
    const res = await apiClient.post<{ data: { paymentUrl?: string } }>(`/visit-groups/${id}/checkout/vnpay`);
    const url = res.data.data?.paymentUrl;
    if (!url) throw new Error('Backend did not return a VNPay URL');
    return url;
  },

  async declareCash(id: string, declaredAmount: number): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/checkout/cash/declare`, { declaredAmount });
  },

  async confirmCash(id: string, agreed: boolean, disputeReason?: string): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/checkout/cash/confirm`, agreed ? { agreed } : { agreed, disputeReason });
  },
};

/** Why an approved device of a visit could not be made to work; the technician taps one. */
export const REPAIR_FAILURE_REASONS = [
  { code: 'no_part', label: 'Không có linh kiện thay thế phù hợp' },
  { code: 'beyond_repair', label: 'Máy hỏng nặng, không sửa được' },
  { code: 'needs_workshop', label: 'Cần mang về xưởng để sửa' },
  { code: 'other', label: 'Lý do khác' },
] as const;
export type RepairFailureReason = (typeof REPAIR_FAILURE_REASONS)[number]['code'];

/**
 * "Không sửa được": the device ends at 0 đồng, no points are taken, the
 * customer is told and the managers get a case with every received part
 * marked fitted or going back to the warehouse.
 */
export async function reportRepairFailed(orderId: string, body: { reason: RepairFailureReason; note?: string; parts?: Array<{ partRequestId: string; outcome: 'installed' | 'returned' }> }): Promise<void> {
  await apiClient.post(`/service-orders/${orderId}/repair-failed`, body);
}
