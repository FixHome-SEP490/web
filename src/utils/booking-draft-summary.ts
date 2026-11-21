import { bookingDraftsApi, type BookingDraft } from '../api/booking-drafts.api';

/** Type guard against non-draft envelopes (e.g. generic array mocks in unrelated tests). */
export function isBookingDraft(value: unknown): value is BookingDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<BookingDraft>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.version === 'number' &&
    typeof candidate.expiresAt === 'string' &&
    !!candidate.snapshot &&
    typeof candidate.snapshot === 'object' &&
    !Array.isArray(candidate.snapshot)
  );
}

/** Vietnamese local expiry timestamp in Asia/Ho_Chi_Minh timezone. */
export function formatDraftExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'ngày hết hạn chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Short customer-facing summary derived solely from the flat snapshot fields. */
export function describeBookingDraft(draft: BookingDraft): string {
  const snap = draft.snapshot;
  const itemCount = Array.isArray(snap.items) ? snap.items.length : 0;
  const isVisit = snap.kind === 'visit_group' || (snap.savedDeviceCount ?? 0) > 0 || itemCount > 1;
  if (isVisit) {
    const count = Math.max(itemCount, snap.savedDeviceCount ?? 0);
    return count > 0 ? `Lượt nhiều thiết bị · ${count} thiết bị` : 'Lượt sửa nhiều thiết bị';
  }
  const qty = snap.quantity && snap.quantity > 1 ? ` (số lượng ${snap.quantity})` : '';
  return `Đơn đặt 1 thiết bị${qty}`;
}

/** Quietly fetches the customer's active draft if present; never throws for banner checks. */
export async function fetchCurrentBookingDraft(): Promise<BookingDraft | null> {
  try {
    const draft = await bookingDraftsApi.current();
    return isBookingDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

/** Discards the active draft on the server, returning whether it was deleted. */
export async function discardSavedBookingDraft(): Promise<boolean> {
  const result = await bookingDraftsApi.discard();
  return result.deleted === true;
}
