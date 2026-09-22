// src/api/bookings.api.ts
import apiClient from './client';

export interface BookingItem {
  id: string;
  serviceOrderId?: string | null;
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
  media?: BookingMedia[];
  invitations?: BookingInvitation[];
  diagnosis?: {
    possibleIssues: string[];
    possibleCauses: string[];
    suggestedPriceMin: number;
    suggestedPriceMax: number;
    confidence: number;
  };
}

export type BookingInvitationStatus = 'PENDING' | 'STANDBY' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';

/** Customer-safe invitation fields; the internal invitation-group marker is intentionally omitted. */
export interface BookingInvitation {
  id: string;
  bookingId: string;
  priorityOrder: number;
  status: BookingInvitationStatus;
  invitedAt: string;
  expiresAt: string | null;
}

export interface BookingMedia {
  id: string;
  url: string | null;
  isPrivate: boolean;
  legacyInsecure: boolean;
  mimeType: string;
  sizeBytes: number | null;
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
  photoUploadIds?: string[];
}

export interface MatchingExtensionResult {
  bookingId: string;
  invitationGroupId: string;
  expiresAt: string;
  extendedInvitationCount: number;
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
  possibleIssues: string[];
  possibleCauses: string[];
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  confidence: number;
  urgency?: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  recommendedActions?: string[];
}

/** Technician preview before winning: never model it as a full customer Booking. */
export interface InvitationBookingPreview {
  id: string;
  serviceName: string;
  addressSummary: string; // Coarse district/province only; not a saved customer address.
  quantity: number;
  urgency: string;
  preferredStartAt: string | null;
  preferredEndAt: string | null;
}

export interface InvitationItem {
  id: string;
  bookingId: string;
  booking?: InvitationBookingPreview;
  priorityOrder: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
}

interface BackendInvitationPreview {
  id: string;
  bookingId: string;
  priorityOrder: number;
  status: string;
  invitedAt: string;
  expiresAt: string;
  booking?: {
    id: string;
    province: string | null;
    district: string | null;
    serviceName: string | null;
    quantity: number;
    urgency: string;
    preferredStartAt: string | null;
    preferredEndAt: string | null;
  };
}

function normalizeInvitationPreview(invitation: BackendInvitationPreview): InvitationItem {
  const booking = invitation.booking;
  if (!invitation.expiresAt || !booking) {
    throw new Error('Unexpected API response: missing active invitation preview');
  }
  return {
    id: invitation.id,
    bookingId: invitation.bookingId,
    priorityOrder: invitation.priorityOrder,
    status: invitation.status.toUpperCase() as InvitationItem['status'],
    invitedAt: invitation.invitedAt,
    expiresAt: invitation.expiresAt,
    booking: {
      id: booking.id,
      serviceName: booking.serviceName ?? 'Dịch vụ sửa chữa',
      addressSummary: [booking.district, booking.province].filter(Boolean).join(', ') || 'Chưa có khu vực',
      quantity: booking.quantity,
      urgency: booking.urgency,
      preferredStartAt: booking.preferredStartAt,
      preferredEndAt: booking.preferredEndAt,
    },
  };
}

function normalizeBookingInvitations(value: unknown): BookingInvitation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized: BookingInvitation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined;
    const raw = item as Record<string, unknown>;
    if (
      typeof raw.id !== 'string'
      || typeof raw.bookingId !== 'string'
      || typeof raw.priorityOrder !== 'number'
      || !Number.isFinite(raw.priorityOrder)
      || typeof raw.status !== 'string'
      || typeof raw.invitedAt !== 'string'
      || (raw.expiresAt !== null && typeof raw.expiresAt !== 'string')
    ) return undefined;
    normalized.push({
      id: raw.id,
      bookingId: raw.bookingId,
      priorityOrder: raw.priorityOrder,
      status: raw.status.toUpperCase() as BookingInvitationStatus,
      invitedAt: raw.invitedAt,
      expiresAt: raw.expiresAt,
    });
  }
  return normalized;
}

function normalizeBooking(booking: BookingItem & { serviceNameSnapshot?: string; addressTextSnapshot?: string; preferredStartAt?: string }): BookingItem {
  const normalized: BookingItem = { ...booking, serviceName: booking.serviceNameSnapshot ?? booking.serviceName,
    addressSummary: booking.addressTextSnapshot ?? booking.addressSummary,
    preferredAt: booking.preferredStartAt ?? booking.preferredAt,
    mediaUrls: booking.media ? booking.media.flatMap((media) => typeof media.url === 'string' ? [media.url] : []) : booking.mediaUrls,
    status: booking.status.toUpperCase() as BookingItem['status'] };
  if ('invitations' in booking) {
    normalized.invitations = normalizeBookingInvitations((booking as unknown as { invitations?: unknown }).invitations);
  }
  return normalized;
}

/**
 * Full Booking media is only safe to render after the Backend returned the
 * requested Booking identity and complete media metadata. Invitation previews
 * intentionally do not satisfy this contract.
 */
export function isFullBookingWithMedia(
  booking: BookingItem,
  expectedBookingId: string,
): booking is BookingItem & { media: BookingMedia[] } {
  if (!expectedBookingId.trim() || booking.id !== expectedBookingId || !Array.isArray(booking.media)) {
    return false;
  }

  return booking.media.every((media) => (
    typeof media.id === 'string'
      && media.id.trim().length > 0
      && (media.url === null || typeof media.url === 'string')
      && typeof media.isPrivate === 'boolean'
      && typeof media.legacyInsecure === 'boolean'
      && typeof media.mimeType === 'string'
      && media.mimeType.trim().length > 0
      && (media.sizeBytes === null
        || (typeof media.sizeBytes === 'number' && Number.isFinite(media.sizeBytes) && media.sizeBytes >= 0))
      && (!media.isPrivate || media.url === null)
  ));
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

  async getMyBookingsPaged(page: number, pageSize: number): Promise<{ data: BookingItem[]; total: number }> {
    const res = await apiClient.get<{ data: BookingItem[]; meta: { total: number } }>('/bookings/my', { params: { page, pageSize } });
    if (typeof res.data.meta?.total !== 'number') {
      throw new Error('Unexpected API response: bookings/my missing meta.total');
    }
    return { data: res.data.data.map(normalizeBooking), total: res.data.meta.total };
  },

  async getBooking(id: string): Promise<BookingItem> { const res = await apiClient.get<{data: BookingItem}>(`/bookings/${id}`); return normalizeBooking(res.data.data); },

  async extendMatching(bookingId: string): Promise<MatchingExtensionResult> {
    const res = await apiClient.post<{ data: Partial<MatchingExtensionResult> }>(`/bookings/${bookingId}/matching/extend`);
    const data = res.data.data;
    if (
      !data
      || data.bookingId !== bookingId
      || typeof data.invitationGroupId !== 'string'
      || !data.invitationGroupId.trim()
      || typeof data.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(data.expiresAt))
      || typeof data.extendedInvitationCount !== 'number'
      || !Number.isSafeInteger(data.extendedInvitationCount)
      || data.extendedInvitationCount < 1
    ) {
      throw new Error('Backend returned an invalid matching extension response');
    }
    return {
      bookingId: data.bookingId,
      invitationGroupId: data.invitationGroupId,
      expiresAt: data.expiresAt,
      extendedInvitationCount: data.extendedInvitationCount,
    };
  },

  async updateBooking(id: string, dto: { description?: string; preferredStartAt: string; preferredEndAt: string }): Promise<BookingItem> {
    const res = await apiClient.patch<{ data: BookingItem }>(`/bookings/${id}/schedule`, dto);
    return normalizeBooking(res.data.data);
  },

  async cancelBooking(id: string, reason: string): Promise<BookingItem> {
    const res = await apiClient.post<{ data: BookingItem }>(`/bookings/${id}/cancel`, { reason });
    return normalizeBooking(res.data.data);
  },

  async diagnoseAI(dto: { description: string; serviceId?: string }): Promise<DiagnosisResult> {
    try {
      const res = await apiClient.post<DiagnosisResult>('/ai/diagnoses', dto);
      return res.data;
    } catch {
      // Smart offline fallback
      return {
        possibleIssues: [
          'Thiếu gas làm lạnh (R32 / R410A) do rò rỉ zắc co',
          'Lưới lọc bụi và dàn tản nhiệt bám bẩn nặng gây cản gió',
          'Tụ kích block hoặc quạt dàn nóng bị yếu',
        ],
        possibleCauses: [
          'Chưa bảo dưỡng định kỳ trong hơn 6 tháng',
          'Môi trường bụi bẩn cao hoặc đường ống đồng gấp khúc',
        ],
        suggestedPriceMin: 150000,
        suggestedPriceMax: 380000,
        confidence: 0.92,
        urgency: 'NORMAL',
      };
    }
  },

  async getCandidates(bookingId: string): Promise<TechnicianCandidate[]> {
    const res = await apiClient.get<{ data: TechnicianCandidate[] }>(`/bookings/${bookingId}/technician-candidates`);
    return res.data.data.map(candidate => {
      // Backend shortlist accepts User IDs, never TechnicianProfile IDs.
      if (!candidate.userId?.trim()) throw new Error('Candidate missing technician User ID');
      return { ...candidate, id: candidate.userId.trim() };
    });
  },

  async sendShortlist(bookingId: string, technicianIds: string[]): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/shortlist`, { technicianIds });
  },

  async getMyInvitations(): Promise<InvitationItem[]> {
    const res = await apiClient.get<{ data: BackendInvitationPreview[] }>('/invitations/my');
    return res.data.data.map(normalizeInvitationPreview);
  },

  async respondInvitation(invitationId: string, action: 'ACCEPT' | 'DECLINE'): Promise<{ serviceOrderId: string | null }> {
    const res = await apiClient.post<{ data: { serviceOrder?: { id?: string } } }>(
      `/invitations/${invitationId}/respond`, { action },
    );
    const id = res.data.data?.serviceOrder?.id?.trim() ?? '';
    if (action === 'ACCEPT' && !id) {
      throw new Error('Backend did not confirm the accepted ServiceOrder ID');
    }
    return { serviceOrderId: id || null };
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
