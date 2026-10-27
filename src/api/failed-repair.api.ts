import type { InjectionKey } from 'vue';
import { catalogPricingApi, type BookingDeviceAttributes, type CatalogPricingPreview } from './catalog-pricing.api';
import type { BookingMedia } from './bookings.api';
import type { UserAddress } from './profile.api';
import type { RepairFailureReason } from './visit-groups.api';
import type { BookingSlot } from '../utils/booking-session';
import apiClient from './client';
import { ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from './media.api';
import { mediaApi } from './media.api';
import { catalogApi } from './catalog.api';
import { profileApi } from './profile.api';
import { bookingsApi } from './bookings.api';

/** UI models mapped from the authenticated failed-repair draft, never legacy rebook. */
export interface FailedRepairDraft {
  id: string;
  customerId: string;
  expiresAt?: string;
  address: UserAddress;
  customerNote?: string;
  items: Array<{
    sourceBookingId: string;
    outcome: 'failed';
    active: boolean;
    serviceId: string;
    serviceName: string;
    selectedVariantCode?: string;
    description: string;
    model?: string;
    deviceAttributes: BookingDeviceAttributes;
    media: BookingMedia[];
    pricing?: CatalogPricingPreview;
  }>;
}
export interface FailedRepairReport {
  reason: RepairFailureReason;
  note?: string;
  photoEvidenceIds: string[];
  parts: Array<{ partRequestId: string; outcome: 'installed' | 'returned' }>;
}
export interface FailedRepairIncident {
  bookingId: string;
  reason: RepairFailureReason;
  note?: string;
  reportedAt: string;
  /** Adapter maps only statuses actually visible to the authenticated customer. */
  supportStatus: 'open' | 'in_progress' | 'resolved' | 'closed' | null;
}
export interface FailedRepairConfirmation {
  draftId: string;
  sourceBookingIds: string[];
  kind: 'booking' | 'visit';
  addressId: string;
  date: string;
  slot: BookingSlot;
  idempotencyKey: string;
}
export interface FailedRepairPort {
  available: boolean;
  /** The live endpoint persists the key and body fingerprint in one transaction. */
  retrySafe?: boolean;
  /** Only enabled after incident integration is reviewed; prevents orphan uploads while blocked. */
  evidenceAvailable: boolean;
  readDraft(sourceBookingIds: string[]): Promise<FailedRepairDraft>;
  confirm(input: FailedRepairConfirmation): Promise<{ kind: 'booking' | 'visit'; id: string }>;
  readIncident(bookingId: string): Promise<FailedRepairIncident>;
  report(orderId: string, input: FailedRepairReport): Promise<void>;
  /** Technician-only: read back and replay the exact pending report against its durable receipt. */
  reconcileReport?(orderId: string): Promise<void>;
  uploadEvidence(orderId: string, file: File): Promise<{ evidenceId: string }>;
}
export const failedRepairKey: InjectionKey<FailedRepairPort> = Symbol('failed-repair');
export const FAILED_REPAIR_UNAVAILABLE = 'Tính năng này chưa sẵn sàng. Vui lòng thử lại sau.';
async function unavailable(): Promise<never> { throw new Error(FAILED_REPAIR_UNAVAILABLE); }
export const blockedFailedRepair: FailedRepairPort = {
  available: false, evidenceAvailable: false,
  readDraft: unavailable, confirm: unavailable, readIncident: unavailable,
  report: unavailable, uploadEvidence: unavailable,
};

/** Existing media contract: assigned technician, private order ADDITIONAL evidence.
 * Booking-photo uploads are customer-only and public /media/upload must never be used.
 * This helper does not enable report/rebook endpoints or remove the integration gate.
 */
export async function uploadFailedRepairEvidence(orderId: string, file: File): Promise<{ evidenceId: string }> {
  if (!orderId.trim() || !ALLOWED_MEDIA_MIME_TYPES.includes(file.type) || file.size > MAX_MEDIA_SIZE_BYTES) {
    throw new Error('Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('type', 'additional');
  const response = await apiClient.post<{ data: { id?: string } }>(`/service-orders/${encodeURIComponent(orderId)}/evidence`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const id = response.data?.data?.id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('Chưa xác nhận được ảnh chứng cứ. Vui lòng tải lại ảnh.');
  return { evidenceId: id };
}

/** Defensive UX only; the server must revalidate ownership/catalog/media at confirmation. */
export function validateFailedRepairDraft(draft: FailedRepairDraft, sources: string[], customerId: string): void {
  if (!customerId || !draft?.id || draft.customerId !== customerId
    || (draft.expiresAt !== undefined && (!Number.isFinite(Date.parse(draft.expiresAt)) || Date.parse(draft.expiresAt) <= Date.now()))
    || !draft.address?.id || draft.address.userId !== customerId
    || !Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > 3
    || sources.length < 1 || sources.length !== new Set(sources).size
    || sources.some(id => !draft.items.some(item => item.sourceBookingId === id))
    || new Set(draft.items.map(item => item.sourceBookingId)).size !== draft.items.length
    || draft.items.some(item => item.outcome !== 'failed'
      || item.active !== true || !item.serviceId || !item.serviceName || typeof item.description !== 'string'
      || !Array.isArray(item.media) || item.media.some(media => !media.id || !media.isPrivate || media.url !== null))) {
    throw new Error('Không thể dùng dữ liệu đặt lại này. Vui lòng mở lại từ máy không sửa được.');
  }
}

/** Frozen R-BE DTO: original private photos are read references, not new upload claims. */
export interface RepairFailureDraftDto {
  sourceVisitGroupId: string | null;
  targetKind: 'booking' | 'visit_group';
  address: { id: string | null; text: string | null };
  customerNote: string | null;
  items: Array<{
    sourceBookingId: string; sourceOrderId: string; sourceIncidentId: string;
    serviceId: string; deviceLabel: string | null; selectedVariantCode: string | null;
    description: string; deviceAttributes: BookingDeviceAttributes | null; quantity: 1;
    photos: Array<{ mediaId: string; sourceBookingId: string; contentPath: string }>;
  }>;
  requiresNewSchedule: true;
  requiresPricingRevalidation: true;
  confirmation: { available: boolean; path?: string };
}
export interface RepairFailureRebookDto {
  idempotencyKey: string; addressId: string; date: string; slot: BookingSlot; customerNote?: string;
  items: Array<{
    sourceBookingId: string; sourceIncidentId: string; selectedVariantCode?: string;
    description?: string; deviceAttributes?: BookingDeviceAttributes; photoUploadIds?: string[];
  }>;
}
interface RepairFailureRebookResult {
  targetKind: 'booking' | 'visit_group'; bookingId: string | null; visitGroupId: string | null;
  items: Array<{ sourceBookingId: string; sourceIncidentId: string; bookingId: string }>;
}
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export class FailedRepairDraftRefreshError extends Error {}
const invalidDraft = () => new FailedRepairDraftRefreshError('Dữ liệu đặt lại chưa sẵn sàng. Vui lòng mở lại từ máy không sửa được.');
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function assertServerDraft(data: unknown, anchor: string, sources: string[]): asserts data is RepairFailureDraftDto {
  if (!isRecord(data) || !isRecord(data.confirmation) || data.confirmation.available !== true
    || data.confirmation.path !== `/api/v1/bookings/${anchor}/repair-failure-rebook`
    || data.requiresNewSchedule !== true || data.requiresPricingRevalidation !== true
    || !isRecord(data.address) || !safeId(data.address.id)
    || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 3
    || data.targetKind !== (data.items.length === 1 ? 'booking' : 'visit_group')
    || (data.customerNote !== null && typeof data.customerNote !== 'string')) throw invalidDraft();
  const seen = new Set<string>();
  const incidents = new Set<string>();
  for (const item of data.items) {
    if (!isRecord(item) || !safeId(item.sourceBookingId) || seen.has(item.sourceBookingId)
      || !safeId(item.sourceIncidentId) || incidents.has(item.sourceIncidentId)
      || !safeId(item.sourceOrderId) || !safeId(item.serviceId) || item.quantity !== 1
      || typeof item.description !== 'string' || (item.selectedVariantCode !== null && typeof item.selectedVariantCode !== 'string')
      || (item.deviceAttributes !== null && !isRecord(item.deviceAttributes)) || !Array.isArray(item.photos)
      || item.photos.some(photo => !isRecord(photo) || !safeId(photo.mediaId) || photo.sourceBookingId !== item.sourceBookingId
        || photo.contentPath !== `/api/v1/bookings/${item.sourceBookingId}/media/${photo.mediaId}/content`)) throw invalidDraft();
    seen.add(item.sourceBookingId); incidents.add(item.sourceIncidentId);
  }
  if (!sources.every(id => seen.has(id))) throw invalidDraft();
}

async function currentPricing(item: RepairFailureDraftDto['items'][number]) {
  const service = await catalogApi.getService(item.serviceId);
  if (service.id !== item.serviceId || service.isActive !== true) throw invalidDraft();
  const pricing = await catalogPricingApi.getPreview(item.serviceId, {
    ...item.deviceAttributes, ...(item.selectedVariantCode ? { selectedVariantCode: item.selectedVariantCode } : {}),
  });
  const fixed = pricing.status === 'FIXED_PRICE' && pricing.bindingReady && pricing.selectedVariant
    && (!item.selectedVariantCode || pricing.selectedVariant.variantCode === item.selectedVariantCode);
  const inspection = pricing.status === 'INSPECTION_REQUIRED' && !pricing.bindingReady
    && pricing.selectedVariant === null && !item.selectedVariantCode;
  if (pricing.serviceId !== item.serviceId || pricing.serviceCode !== service.code || (!fixed && !inspection)) {
    throw new FailedRepairDraftRefreshError('Thông tin giá dịch vụ đã thay đổi. Vui lòng tải lại dữ liệu đặt lịch.');
  }
  return { service, pricing };
}
const pricingBasis = (pricing: CatalogPricingPreview) => JSON.stringify({ status: pricing.status, selectedVariant: pricing.selectedVariant, priceRange: pricing.priceRange });

/** One port per wizard instance; nothing is cached across customers or new drafts. */
export function createFailedRepairPort(customerId: () => string): FailedRepairPort {
  let revision = 0;
  let context: { owner: string; anchor: string; raw: RepairFailureDraftDto; draft: FailedRepairDraft } | null = null;
  let submittedInput: string | null = null;
  let prepared: RepairFailureRebookDto | null = null;
  const photoClaims = new Map<string, string>();
  async function readRaw(anchor: string, sources: string[]) {
    const response = await apiClient.get<{ data: unknown }>(`/bookings/${anchor}/repair-failure-draft`);
    assertServerDraft(response.data?.data, anchor, sources);
    return response.data.data;
  }
  return {
    ...blockedFailedRepair, available: true, retrySafe: true,
    async readDraft(sources) {
      const version = ++revision;
      const owner = customerId();
      context = null; submittedInput = null; prepared = null; photoClaims.clear();
      if (!owner || !sources.length || sources.length > 3 || !sources.every(safeId) || new Set(sources).size !== sources.length) throw invalidDraft();
      const anchor = sources[0]!;
      const raw = await readRaw(anchor, sources);
      const addresses = await profileApi.getAddresses();
      const address = addresses.find(item => item.id === raw.address.id && item.userId === owner);
      if (!address) throw invalidDraft();
      const items = await Promise.all(raw.items.map(async item => {
        const [{ service, pricing }, booking] = await Promise.all([currentPricing(item), bookingsApi.getBooking(item.sourceBookingId)]);
        if (booking.id !== item.sourceBookingId || booking.customerId !== owner || booking.serviceId !== item.serviceId) throw invalidDraft();
        const media = item.photos.map(photo => {
          const original = booking.media?.find(media => media.id === photo.mediaId);
          if (!original || !original.isPrivate || original.url !== null || !ALLOWED_MEDIA_MIME_TYPES.includes(original.mimeType)) throw invalidDraft();
          return { ...original };
        });
        return { sourceBookingId: item.sourceBookingId, outcome: 'failed' as const, active: true, serviceId: item.serviceId,
          serviceName: item.deviceLabel || service.name, description: item.description, deviceAttributes: item.deviceAttributes ?? {},
          ...(pricing.selectedVariant ? { selectedVariantCode: pricing.selectedVariant.variantCode } : {}), media, pricing };
      }));
      const draft: FailedRepairDraft = { id: anchor, customerId: owner, address, ...(raw.customerNote ? { customerNote: raw.customerNote } : {}), items };
      validateFailedRepairDraft(draft, sources, owner);
      if (version !== revision || owner !== customerId()) throw invalidDraft();
      context = { owner, anchor, raw, draft };
      return draft;
    },
    async confirm(input) {
      const active = context;
      if (!active || active.owner !== customerId() || input.draftId !== active.anchor
        || input.kind !== (active.raw.items.length === 1 ? 'booking' : 'visit')
        || input.sourceBookingIds.length !== active.raw.items.length
        || new Set(input.sourceBookingIds).size !== input.sourceBookingIds.length
        || !active.raw.items.every(item => input.sourceBookingIds.includes(item.sourceBookingId))) throw invalidDraft();
      const signature = JSON.stringify(input);
      const assertActive = () => { if (active !== context || active.owner !== customerId()) throw invalidDraft(); };
      if (submittedInput && submittedInput !== signature) throw new Error('Nội dung xác nhận đã được khóa. Vui lòng thử lại cùng yêu cầu.');
      if (!prepared) {
        const fresh = await readRaw(active.anchor, input.sourceBookingIds);
        assertActive();
        if (JSON.stringify(fresh.items) !== JSON.stringify(active.raw.items)) throw invalidDraft();
        for (const item of fresh.items) {
          const { pricing } = await currentPricing(item);
          assertActive();
          const previous = active.draft.items.find(old => old.sourceBookingId === item.sourceBookingId)!.pricing!;
          if (pricingBasis(pricing) !== pricingBasis(previous)) throw new FailedRepairDraftRefreshError('Giá dịch vụ đã thay đổi. Vui lòng tải lại dữ liệu và xác nhận giá mới.');
        }
        const items: RepairFailureRebookDto['items'] = [];
        for (const source of fresh.items) {
          const photoUploadIds: string[] = [];
          for (const photo of source.photos) {
            const photoKey = `${source.sourceBookingId}:${photo.mediaId}`;
            let claim = photoClaims.get(photoKey);
            if (!claim) {
              const content = await mediaApi.getBookingMediaContent(source.sourceBookingId, photo.mediaId);
              assertActive();
              const uploaded = await mediaApi.uploadBookingPhoto(new File([content], 'repair-rebook.jpg', { type: content.type }));
              assertActive();
              claim = uploaded.uploadId; photoClaims.set(photoKey, claim);
            }
            photoUploadIds.push(claim);
          }
          const selectedVariantCode = active.draft.items.find(item => item.sourceBookingId === source.sourceBookingId)!.selectedVariantCode;
          items.push({ sourceBookingId: source.sourceBookingId, sourceIncidentId: source.sourceIncidentId,
            ...(selectedVariantCode ? { selectedVariantCode } : {}), description: source.description,
            ...(source.deviceAttributes ? { deviceAttributes: { ...source.deviceAttributes } } : {}),
            ...(photoUploadIds.length ? { photoUploadIds } : {}) });
        }
        prepared = { idempotencyKey: input.idempotencyKey, addressId: input.addressId, date: input.date, slot: input.slot,
          ...(active.raw.customerNote ? { customerNote: active.raw.customerNote } : {}), items };
        submittedInput = signature;
      }
      assertActive();
      const response = await apiClient.post<{ data: RepairFailureRebookResult }>(`/bookings/${active.anchor}/repair-failure-rebook`, prepared);
      const result = response.data?.data;
      const group = active.raw.items.length > 1;
      if (!result || result.targetKind !== (group ? 'visit_group' : 'booking') || !safeId(group ? result.visitGroupId : result.bookingId)
        || (group ? result.bookingId !== null : result.visitGroupId !== null) || !Array.isArray(result.items)
        || result.items.length !== active.raw.items.length || new Set(result.items.map(item => item.sourceBookingId)).size !== result.items.length
        || new Set(result.items.map(item => item.bookingId)).size !== result.items.length
        || result.items.some(item => !safeId(item.bookingId) || !active.raw.items.some(source => source.sourceBookingId === item.sourceBookingId && source.sourceIncidentId === item.sourceIncidentId))
        || (!group && result.items[0]?.bookingId !== result.bookingId)) throw new Error('Chưa xác nhận được kết quả đặt lại. Vui lòng thử lại cùng yêu cầu.');
      return { kind: group ? 'visit' : 'booking', id: (group ? result.visitGroupId : result.bookingId)! };
    },
  };
}
