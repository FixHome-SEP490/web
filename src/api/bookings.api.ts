// src/api/bookings.api.ts
import apiClient from './client';
import { unwrap } from './response';

export interface BookingItem {
  id: string;
  customerId: string;
  serviceOrderId?: string;
  serviceId: string;
  serviceName?: string;
  addressId: string;
  addressSummary?: string;
  description: string;
  preferredAt: string;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  status: 'PENDING' | 'MATCHING' | 'CONFIRMED' | 'CANCELLED' | 'SUBMITTED' | 'CLOSED' | 'MATCHED';
  preferredStartAt?: string;
  preferredEndAt?: string;
  pricingModeSnapshot?: string;
  fixedUnitPriceSnapshot?: number;
  quantity?: number;
  scopeSnapshot?: string;
  invitations?: InvitationItem[];
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
  aiDiagnosisId?: string;
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

export interface DiagnosisResult {
  id?: string;
  possibleProblems?: string[];
  possibleCauses?: string[];
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'NORMAL' | 'EMERGENCY';
  estimatedCostMin?: number;
  estimatedCostMax?: number;
  suggestedServiceId?: string | null;
  suggestedServiceName?: string | null;
  suggestedSkill?: string | null;
  troubleshooting?: string[];
  confidence: number;
  isFallback?: boolean;
  disclaimer?: string;
  possibleIssues?: string[];
  suggestedPriceMin?: number;
  suggestedPriceMax?: number;
  recommendedActions?: string[];
}

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

type RawBooking = BookingItem & {
  service?: { name: string };
  serviceNameSnapshot?: string;
  addressTextSnapshot?: string;
  preferredStartAt: string;
  media?: { url: string }[];
};

const normalizeBooking = (booking: RawBooking): BookingItem => ({
  ...booking,
  serviceName: booking.serviceNameSnapshot || booking.service?.name,
  addressSummary: booking.addressTextSnapshot,
  preferredAt: booking.preferredStartAt,
  status: booking.status.toUpperCase() as BookingItem['status'],
  urgency: booking.urgency.toUpperCase() as BookingItem['urgency'],
  mediaUrls: booking.mediaUrls?.length ? booking.mediaUrls : (booking.media?.map(m => m.url) || []),
});

export const bookingsApi = {
  async createBooking(dto: CreateBookingDto): Promise<BookingItem> {
    const urgency = { LOW: 'low', NORMAL: 'medium', HIGH: 'high', EMERGENCY: 'critical' }[dto.urgency];
    const body = { ...dto };
    return normalizeBooking(unwrap<RawBooking>((await apiClient.post('/bookings', { ...body, urgency })).data));
  },
  async getMyBookings(): Promise<BookingItem[]> {
    return unwrap<RawBooking[]>((await apiClient.get('/bookings/my')).data).map(normalizeBooking);
  },
  async getBooking(id: string): Promise<BookingItem> {
    return normalizeBooking(unwrap<RawBooking>((await apiClient.get('/bookings/'+id)).data));
  },
  async diagnoseAI(dto: {
    description: string;
    serviceId?: string;
    imageUrl?: string;
    images?: string[];
    categoryHint?: string;
  }): Promise<DiagnosisResult> {
    return unwrap<DiagnosisResult>((await apiClient.post('/ai/diagnoses', dto)).data);
  },
  async getCandidates(bookingId: string): Promise<TechnicianCandidate[]> {
    const candidates = unwrap<TechnicianCandidate[]>((await apiClient.get('/bookings/'+bookingId+'/technician-candidates')).data);
    return candidates.map(candidate => ({ ...candidate, id: candidate.userId!, technicianId: candidate.userId }));
  },
  async sendShortlist(bookingId: string, technicianIds: string[]): Promise<void> {
    await apiClient.post('/bookings/'+bookingId+'/shortlist', { technicianIds });
  },
  async getMyInvitations(): Promise<InvitationItem[]> {
    const invitations = unwrap<(InvitationItem & { booking: RawBooking })[]>((await apiClient.get('/invitations/my')).data);
    return invitations.map(invitation => ({ ...invitation, status: invitation.status.toUpperCase() as InvitationItem['status'], booking: normalizeBooking(invitation.booking) }));
  },
  async respondInvitation(id: string, action: 'ACCEPT' | 'DECLINE'): Promise<{ serviceOrder?: { id: string } }> {
    return unwrap((await apiClient.post('/invitations/'+id+'/respond', { action })).data);
  },
  async cancelBooking(id: string, reason: string): Promise<void> {
    await apiClient.post('/bookings/'+id+'/cancel', { reason });
  },
  async reschedule(id: string, preferredStartAt: string, preferredEndAt: string): Promise<void> {
    await apiClient.patch('/bookings/'+id+'/schedule', { preferredStartAt, preferredEndAt });
  },
};
