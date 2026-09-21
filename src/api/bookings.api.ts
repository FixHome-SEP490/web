// src/api/bookings.api.ts
import apiClient from './client';

export interface BookingItem {
  id: string;
  customerId: string;
  serviceId: string;
  serviceName?: string;
  addressId: string;
  addressSummary?: string;
  description: string;
  preferredAt: string;
  preferredEndAt?: string;
  quantity?: number;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  status: 'SUBMITTED' | 'MATCHING' | 'MATCHED' | 'CANCELLED' | 'CLOSED';
  createdAt: string;
  mediaUrls?: string[];
  diagnosis?: {
    possibleIssues: string[];
    possibleCauses: string[];
    suggestedPriceMin: number;
    suggestedPriceMax: number;
    confidence: number;
  };
}

export interface CreateBookingDto {
  serviceId: string;
  addressId: string;
  description: string;
  preferredStartAt: string;
  preferredEndAt: string;
  quantity?: number;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  mediaUrls?: string[];
}

export interface TechnicianCandidate {
  id: string;
  technicianId?: string;
  userId?: string;
  fullName: string;
  avatarUrl?: string;
  averageRating: number;
  ratingCount: number;
  yearsExperience: number;
  reliabilityScore: number;
  distanceKm?: number;
  isAvailable: boolean;
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number;
}

// DiagnosisResult and diagnoseAI lived here and are gone. They described a
// reply the AI Service has never sent - possibleIssues, possibleCauses,
// suggestedPriceMin - so the call always failed to parse into them, and the
// catch returned a diagnosis written by hand: a named refrigerant, a named
// cause, and a price range, presented as the assistant's own work. Since the
// catch ran on every call, that invention was the only thing anyone ever saw.
// The assistant is reached through src/api/ai.api.ts, which speaks the shape
// the service actually returns and says so when it cannot be reached.

export interface InvitationItem {
  id: string;
  bookingId: string;
  booking?: BookingItem;
  technicianId: string;
  priorityOrder: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
}

function normalizeBooking(booking: BookingItem & { serviceNameSnapshot?: string; addressTextSnapshot?: string; preferredStartAt?: string; media?: { url: string }[] }): BookingItem {
  return { ...booking, serviceName: booking.serviceNameSnapshot ?? booking.serviceName,
    addressSummary: booking.addressTextSnapshot ?? booking.addressSummary,
    preferredAt: booking.preferredStartAt ?? booking.preferredAt,
    mediaUrls: booking.media ? booking.media.map((m) => m.url) : booking.mediaUrls,
    status: booking.status.toUpperCase() as BookingItem['status'] };
}

export const bookingsApi = {
  async createBooking(dto: CreateBookingDto): Promise<BookingItem> {
    const res = await apiClient.post<{ data: BookingItem }>('/bookings', {
      ...dto,
      urgency: ({ LOW: 'low', NORMAL: 'medium', HIGH: 'high', EMERGENCY: 'critical' })[dto.urgency],
    });
    return normalizeBooking(res.data.data);
  },

  async getMyBookings(): Promise<BookingItem[]> { const res = await apiClient.get<{data: BookingItem[]}>('/bookings/my'); return res.data.data.map(normalizeBooking); },

  async getBooking(id: string): Promise<BookingItem> { const res = await apiClient.get<{data: BookingItem}>(`/bookings/${id}`); return normalizeBooking(res.data.data); },

  async updateBooking(id: string, dto: { description?: string; preferredStartAt: string; preferredEndAt: string }): Promise<BookingItem> {
    const res = await apiClient.patch<{ data: BookingItem }>(`/bookings/${id}/schedule`, dto);
    return normalizeBooking(res.data.data);
  },

  async getCandidates(bookingId: string): Promise<TechnicianCandidate[]> { const res = await apiClient.get<{data: TechnicianCandidate[]}>(`/bookings/${bookingId}/technician-candidates`); return res.data.data.map(c => ({...c, id: c.userId || c.technicianId || c.id})); },

  async sendShortlist(bookingId: string, technicianIds: string[]): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/shortlist`, { technicianIds });
  },

  async getMyInvitations(): Promise<InvitationItem[]> { const res = await apiClient.get<{data: InvitationItem[]}>('/invitations/my'); return res.data.data.map(i => ({...i, status: i.status.toUpperCase() as InvitationItem['status'], booking: i.booking ? normalizeBooking(i.booking) : undefined})); },

  async respondInvitation(invitationId: string, action: 'ACCEPT' | 'DECLINE'): Promise<void> {
    await apiClient.post(`/invitations/${invitationId}/respond`, { action });
  },

  // ── SM/Admin: gán thợ thủ công ──

  async getAllForStaff(status?: BookingItem['status'], pageSize = 100): Promise<BookingItem[]> {
    const res = await apiClient.get<{ data: BookingItem[] }>('/bookings', { params: { status: status?.toLowerCase(), pageSize } });
    return res.data.data.map(normalizeBooking);
  },

  async assignTechnicianToBooking(bookingId: string, technicianId: string, reason: string): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/assign`, { technicianId, reason });
  },
};
