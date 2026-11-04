import apiClient from './client';
import type { BookingDeviceAttributes } from './catalog-pricing.api';
import type { CreateBookingDto } from './bookings.api';
import type { CreateVisitDto } from './visit-groups.api';
import type { BookingMode, BookingSlot } from '../utils/booking-session';

export interface SafeDraftItem {
  serviceId?: string;
  deviceLabel?: string;
  description?: string;
  deviceAttributes?: BookingDeviceAttributes;
  selectedVariantCode?: string;
  photoUploadIds?: string[];
}

/** Flat allowlisted Backend snapshot; UI caches and private URLs are never included. */
export interface SafeDraftSnapshot {
  addressId?: string;
  mode?: BookingMode;
  date?: string;
  slot?: BookingSlot;
  preferredStartAt?: string;
  preferredEndAt?: string;
  customerNote?: string;
  urgency?: CreateBookingDto['urgency'];
  items?: SafeDraftItem[];
  /** Safe wizard reconstruction metadata requested for the Web flow. */
  kind?: 'booking' | 'visit_group';
  savedDeviceCount?: number;
  quantity?: number;
  step?: number;
}

export interface BookingDraft {
  id: string;
  version: number;
  expiresAt: string;
  snapshot: SafeDraftSnapshot;
}

export interface BookingDraftSubmitResult {
  kind: 'booking' | 'visit_group';
  bookingId: string | null;
  visitGroupId: string | null;
}

export type BookingDraftSubmitRequest =
  | { kind: 'booking'; data: CreateBookingDto }
  | { kind: 'visit_group'; data: CreateVisitDto };

export interface BookingDraftSubmitCommand {
  expectedVersion: number;
  operationKey: string;
  request: BookingDraftSubmitRequest;
}

export const bookingDraftsApi = {
  async current(): Promise<BookingDraft | null> {
    const response = await apiClient.get<{ data: BookingDraft | null }>('/booking-drafts/current');
    return response.data.data;
  },

  async save(snapshot: SafeDraftSnapshot, expectedVersion: number | null): Promise<BookingDraft> {
    const response = await apiClient.put<{ data: BookingDraft }>('/booking-drafts/current', {
      snapshot,
      expectedVersion,
    });
    return response.data.data;
  },

  async discard(): Promise<{ deleted: boolean }> {
    const response = await apiClient.delete<{ data: { deleted: boolean } }>('/booking-drafts/current');
    return response.data.data;
  },

  async submit(draftId: string, command: BookingDraftSubmitCommand): Promise<BookingDraftSubmitResult> {
    const response = await apiClient.post<{ data: BookingDraftSubmitResult }>(
      `/booking-drafts/${encodeURIComponent(draftId)}/submit`,
      command,
    );
    return response.data.data;
  },
};
