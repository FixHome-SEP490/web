// src/api/bookings.api.ts
import type { BookingMode, BookingSlot, SessionOption } from '../utils/booking-session';
import type { BookingDeviceAttributes } from './catalog-pricing.api';
import apiClient from './client';
import { filterParams, readPage, type ListFilter, type PageResult } from './paging';

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
  /** scheduled = one session of a day; urgent = come now (PO 08/10/2026). */
  bookingMode?: BookingMode;
  slot?: BookingSlot | null;
  /** What the customer wants the technician to know, apart from the problem. */
  customerNote?: string | null;
  /** Set only when the customer booked through the AI flow. */
  aiSummary?: AiBookingSummary | null;
  /** Device facts the customer gave, frozen at booking time (catalog V2). */
  deviceAttributesSnapshot?: BookingDeviceAttributes | null;
  /** Set when this booking is one device of a visit of several devices (PO 21/10/2026). */
  visitGroupId?: string | null;
  /** Times the arrival session was moved; one move per booking (PO 21/10/2026). */
  rescheduleCount?: number;
  /** The server's frozen price basis: one approved tier, or a nonbinding range. */
  catalogV2PricingSnapshot?: {
    selectedVariant?: { variantCode: string; scopeVi: string; laborPriceVnd: number } | null;
    priceRange?: { minLaborVnd: number; maxLaborVnd: number } | null;
  } | null;
  pricingModeSnapshot?: 'fixed_price' | 'inspection_required' | null;
  /** Postgres numeric: may arrive as a string. */
  fixedUnitPriceSnapshot?: number | string | null;
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

/**
 * What the assistant concluded before the customer booked (frozen on the booking when it is created
 * from the AI flow). Shown to the assigned technician; null when the booking did not come from the AI.
 */
export interface AiBookingSummary {
  deviceName?: string | null;
  customerText?: string | null;
  suspectedFaults?: string[];
  suggestedActions?: string[];
  conclusion?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  requiresAssessment?: boolean | null;
  recommendedServiceName?: string | null;
  photoCount?: number;
  /** What the customer already tried, ruled out or suspects, from the AI. */
  notes?: string[];
  recordedAt?: string;
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
  /** A session of a day (date + slot) or "come now"; the server turns it into the arrival window. */
  mode: BookingMode;
  date?: string;
  slot?: BookingSlot;
  customerNote?: string;
  quantity?: number;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  mediaUrls?: string[];
  photoUploadIds?: string[];
  /** Session id from the assistant; the technician receives a summary of it. */
  aiSessionId?: string;
  /**
   * P012: customer-reported Catalog V2 device facts. The server validates them
   * against the chosen service and derives the pricing snapshot itself; the
   * browser never computes or sends money.
   */
  deviceAttributes?: BookingDeviceAttributes;
  /**
   * P012: approved variant code, sent only after GET catalog-v2-pricing
   * confirmed it with FIXED_PRICE. The booking transaction re-validates it.
   */
  selectedVariantCode?: string;
}

export interface MatchingExtensionResult {
  bookingId: string;
  invitationGroupId: string;
  expiresAt: string;
  extendedInvitationCount: number;
}

export type CandidateEmptyReason =
  | 'BOOKING_LOCATION_MISSING'
  | 'OUTSIDE_COVERAGE'
  | 'TIME_UNAVAILABLE'
  | 'UNAVAILABLE';

export interface CandidateSearchResult {
  candidates: TechnicianCandidate[];
  emptyReason: CandidateEmptyReason | null;
}

export interface TechnicianCandidate {
  id: string;
  technicianId?: string;
  userId?: string;
  fullName: string;
  avatarUrl?: string;
  /** null until the technician has at least one review. */
  averageRating: number | null;
  ratingCount: number;
  yearsExperience: number;
  reliabilityScore: number | null;
  distanceKm?: number;
  isAvailable: boolean;
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number;
  bio?: string | null;
  completedOrdersCount?: number;
  completionRate?: number;
}

// DiagnosisResult and diagnoseAI lived here and are gone. They described a
// reply the AI Service has never sent - possibleIssues, possibleCauses,
// suggestedPriceMin - so the call always failed to parse into them, and the
// catch returned a diagnosis written by hand: a named refrigerant, a named
// cause, and a price range, presented as the assistant's own work. Since the
// catch ran on every call, that invention was the only thing anyone ever saw.
// The assistant is reached through src/api/ai.api.ts, which speaks the shape
// the service actually returns and says so when it cannot be reached.

/** Technician preview before winning: never model it as a full customer Booking. */
export interface InvitationBookingPreview {
  id: string;
  serviceName: string;
  addressSummary: string; // Coarse district/province only; not a saved customer address.
  quantity: number;
  urgency: string;
  preferredStartAt: string | null;
  preferredEndAt: string | null;
  /** Session the technician commits to by accepting (PO 08/10/2026). */
  bookingMode?: BookingMode;
  slot?: BookingSlot | null;
  /**
   * PO 18/10/2026: what the technician needs to decide before accepting. The
   * customer's words, the assistant's summary, the private photos and videos, the
   * price basis and an estimated distance; never the address or the phone number.
   */
  description: string | null;
  aiSummary: AiBookingSummary | null;
  media: BookingMedia[];
  /** `fixed_price` (listed price) or `inspection_required` (quote after checking). */
  pricingMode: string | null;
  fixedUnitPrice: number | null;
  /** A coarse band, never an exact distance (it could locate the customer): {0,1}, {1,3} ... {40,null}. */
  distanceBand: { minKm: number; maxKm: number | null } | null;
}

export interface InvitationItem {
  id: string;
  bookingId: string;
  booking?: InvitationBookingPreview;
  /** Every device of a visit of several devices, taken together on Accept (PO 21/10/2026). */
  visitDevices?: Array<{ sequence: number; deviceLabel: string | null; booking: InvitationBookingPreview }>;
  priorityOrder: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
}

type BackendBookingPreview = NonNullable<BackendInvitationPreview['booking']>;

interface BackendInvitationPreview {
  id: string;
  bookingId: string;
  priorityOrder: number;
  status: string;
  invitedAt: string;
  expiresAt: string;
  visitDevices?: Array<{ sequence: number; deviceLabel: string | null; booking: BackendBookingPreview }>;
  booking?: {
    id: string;
    province: string | null;
    district: string | null;
    serviceName: string | null;
    quantity: number;
    urgency: string;
    preferredStartAt: string | null;
    preferredEndAt: string | null;
    bookingMode?: BookingMode;
    slot?: BookingSlot | null;
    description?: string | null;
    aiSummary?: AiBookingSummary | null;
    media?: unknown;
    pricingMode?: string | null;
    fixedUnitPrice?: number | string | null;
    distanceBand?: { minKm?: unknown; maxKm?: unknown } | null;
  };
}

function previewBand(value: { minKm?: unknown; maxKm?: unknown } | null | undefined): InvitationBookingPreview['distanceBand'] {
  if (!value || typeof value !== 'object') return null;
  const minKm = finiteOrNull(value.minKm);
  const maxKm = value.maxKm === null ? null : finiteOrNull(value.maxKm);
  if (minKm == null || minKm < 0 || (maxKm != null && maxKm <= minKm) || (value.maxKm !== null && maxKm == null)) return null;
  return { minKm, maxKm };
}

/** Media of an invitation preview, kept only when every field has the shape the viewer relies on. */
function previewMedia(value: unknown): BookingMedia[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BookingMedia => !!item && typeof item === 'object'
    && typeof (item as BookingMedia).id === 'string' && (item as BookingMedia).id.trim().length > 0
    && typeof (item as BookingMedia).isPrivate === 'boolean'
    && typeof (item as BookingMedia).legacyInsecure === 'boolean'
    && typeof (item as BookingMedia).mimeType === 'string'
    && ((item as BookingMedia).url === null || typeof (item as BookingMedia).url === 'string')
    && (!(item as BookingMedia).isPrivate || (item as BookingMedia).url === null))
    .map((item) => ({ ...item, sizeBytes: typeof item.sizeBytes === 'number' ? item.sizeBytes : null }));
}

const finiteOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function normalizeInvitationPreview(invitation: BackendInvitationPreview): InvitationItem {
  const booking = invitation.booking;
  if (!invitation.expiresAt || !booking) {
    throw new Error('Unexpected API response: missing active invitation preview');
  }
  const devices = Array.isArray(invitation.visitDevices)
    ? invitation.visitDevices.filter((device) => device && device.booking && typeof device.sequence === 'number')
    : [];
  return {
    id: invitation.id,
    bookingId: invitation.bookingId,
    priorityOrder: invitation.priorityOrder,
    status: invitation.status.toUpperCase() as InvitationItem['status'],
    invitedAt: invitation.invitedAt,
    expiresAt: invitation.expiresAt,
    ...(devices.length > 1 ? { visitDevices: devices.map((device) => ({ sequence: device.sequence, deviceLabel: device.deviceLabel ?? null, booking: normalizeBookingPreview(device.booking) })) } : {}),
    booking: normalizeBookingPreview(booking),
  };
}

function normalizeBookingPreview(booking: BackendBookingPreview): InvitationBookingPreview {
  return {
    id: booking.id,
    serviceName: booking.serviceName ?? 'Dịch vụ sửa chữa',
    addressSummary: [booking.district, booking.province].filter(Boolean).join(', ') || 'Chưa có khu vực',
    quantity: booking.quantity,
    urgency: booking.urgency,
    preferredStartAt: booking.preferredStartAt,
    preferredEndAt: booking.preferredEndAt,
    bookingMode: booking.bookingMode,
    slot: booking.slot ?? null,
    description: typeof booking.description === 'string' && booking.description.trim() ? booking.description : null,
    aiSummary: booking.aiSummary && typeof booking.aiSummary === 'object' ? booking.aiSummary : null,
    media: previewMedia(booking.media),
    pricingMode: booking.pricingMode ?? null,
    fixedUnitPrice: finiteOrNull(booking.fixedUnitPrice),
    distanceBand: previewBand(booking.distanceBand),
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

export function normalizeBooking(booking: BookingItem & { serviceNameSnapshot?: string; addressTextSnapshot?: string; preferredStartAt?: string }): BookingItem {
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

/** How long the technician list may take before the page offers "Thử lại". */
export const CANDIDATES_TIMEOUT_MS = 60000;

export const bookingsApi = {
  async createBooking(dto: CreateBookingDto): Promise<BookingItem> {
    const res = await apiClient.post<{ data: BookingItem }>('/bookings', {
      ...dto,
      urgency: ({ LOW: 'low', NORMAL: 'medium', HIGH: 'high', EMERGENCY: 'critical' })[dto.urgency],
    });
    return normalizeBooking(res.data.data);
  },

  async getMyBookings(): Promise<BookingItem[]> { const res = await apiClient.get<{data: BookingItem[]}>('/bookings/my'); return res.data.data.map(normalizeBooking); },

  /** One page of the customer's booking requests, newest first, by state(s) and server search. */
  async getMyBookingsPage(page: number, pageSize: number, filter: ListFilter = {}): Promise<PageResult<BookingItem>> {
    const res = await apiClient.get<unknown>('/bookings/my', { params: { page, pageSize, ...filterParams(filter) } });
    return readPage(res.data, { page, pageSize }, normalizeBooking);
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

  /** Moves a booking to another session; with a technician already on it, only a session they are free for. */
  async updateBooking(id: string, dto: { description?: string; date: string; slot: BookingSlot }): Promise<BookingItem> {
    const res = await apiClient.patch<{ data: BookingItem }>(`/bookings/${id}/schedule`, { mode: 'scheduled', ...dto });
    return normalizeBooking(res.data.data);
  },

  /**
   * Sessions of the next days and whether the technician is free for each: the
   * one holding the order, or with previous the one of a finished booking.
   */
  async availableSessions(bookingId: string, previous = false): Promise<{ technicianId: string | null; sessions: SessionOption[] }> {
    const res = await apiClient.get<{ data: { technicianId: string | null; sessions: SessionOption[] } }>(
      `/bookings/${bookingId}/available-slots`,
      { params: { days: 14, ...(previous ? { previous: 1 } : {}) } },
    );
    return { technicianId: res.data.data?.technicianId ?? null, sessions: res.data.data?.sessions ?? [] };
  },

  /** New booking with the same service and address; the same technician is invited when free. */
  async rebook(bookingId: string, dto: { date: string; slot: BookingSlot; customerNote?: string }): Promise<{ booking: BookingItem; previousTechnicianInvited: boolean }> {
    const res = await apiClient.post<{ data: BookingItem & { previousTechnicianInvited?: boolean } }>(
      `/bookings/${bookingId}/rebook`,
      { mode: 'scheduled', ...dto },
    );
    const { previousTechnicianInvited, ...booking } = res.data.data;
    return { booking: normalizeBooking(booking), previousTechnicianInvited: previousTechnicianInvited === true };
  },

  async cancelBooking(id: string, reason: string): Promise<BookingItem> {
    const res = await apiClient.post<{ data: BookingItem }>(`/bookings/${id}/cancel`, { reason });
    return normalizeBooking(res.data.data);
  },



  async getCandidates(bookingId: string): Promise<TechnicianCandidate[]> {
    // Checking each technician takes a dozen database round trips; with a slow or busy database the list
    // can take longer than the 15s default, and the customer then saw "Không thể tải danh sách" (10/10/2026).
    const res = await apiClient.get<{ data: TechnicianCandidate[] }>(`/bookings/${bookingId}/technician-candidates`, { timeout: CANDIDATES_TIMEOUT_MS });
    return res.data.data.map(candidate => {
      // Backend shortlist accepts User IDs, never TechnicianProfile IDs.
      if (!candidate.userId?.trim()) throw new Error('Candidate missing technician User ID');
      return { ...candidate, id: candidate.userId.trim() };
    });
  },

  /** Opt-in diagnostics without changing the legacy array response consumed by Mobile. */
  async getCandidatesWithDiagnostics(bookingId: string): Promise<CandidateSearchResult> {
    const res = await apiClient.get<{ data: TechnicianCandidate[]; emptyReason?: CandidateEmptyReason | null }>(
      `/bookings/${bookingId}/technician-candidates?diagnostics=1`,
      { timeout: CANDIDATES_TIMEOUT_MS },
    );
    const candidates = res.data.data.map(candidate => {
      if (!candidate.userId?.trim()) throw new Error('Candidate missing technician User ID');
      return { ...candidate, id: candidate.userId.trim() };
    });
    const allowed: CandidateEmptyReason[] = [
      'BOOKING_LOCATION_MISSING', 'OUTSIDE_COVERAGE', 'TIME_UNAVAILABLE', 'UNAVAILABLE',
    ];
    const reason = res.data.emptyReason;
    return { candidates, emptyReason: candidates.length === 0 && reason && allowed.includes(reason) ? reason : null };
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

  /**
   * Staff board, one page. `overdue` splits on whether the appointment has
   * passed; `sort: 'appointment'` lists the earliest appointment first.
   */
  async getStaffBookingsPage(
    page: number,
    pageSize: number,
    filter: ListFilter & { overdue?: boolean; sort?: 'created' | 'appointment' } = {},
  ): Promise<PageResult<BookingItem>> {
    const params: Record<string, string | number> = { page, pageSize, ...filterParams(filter) };
    if (filter.overdue !== undefined) params.overdue = String(filter.overdue);
    if (filter.sort) params.sort = filter.sort;
    const res = await apiClient.get<unknown>('/bookings', { params });
    return readPage(res.data, { page, pageSize }, normalizeBooking);
  },

  async assignTechnicianToBooking(bookingId: string, technicianId: string, reason: string): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/assign`, { technicianId, reason });
  },

  /** Service Manager: give the order to another technician after the one on site reported "Cần thay đổi thợ". */
  async replaceTechnicianAfterReport(orderId: string, technicianId: string, reason: string): Promise<void> {
    await apiClient.post(`/service-orders/${orderId}/replace-technician`, { technicianId, reason });
  },
};
