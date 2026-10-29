import apiClient from './client';
import { bookingsApi } from './bookings.api';
import { ordersApi } from './orders.api';
import { supportCasesApi } from './support-cases.api';
import { catalogApi } from './catalog.api';
import { catalogPricingApi, type BookingDeviceAttributes, type CatalogPricingPreview } from './catalog-pricing.api';
import { profileApi, type UserAddress } from './profile.api';
import type { BookingSlot } from '../utils/booking-session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new Error('Dữ liệu đặt lịch mới chưa được xác nhận. Vui lòng tải lại từ đơn đã gián đoạn.');
const asId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export interface InterruptionDraftItem {
  sourceBookingId: string;
  sourceOrderId: string;
  sourceCaseId: string;
  serviceId: string;
  serviceName: string;
  deviceLabel: string;
  selectedVariantCode: null;
  description: string;
  deviceAttributes: BookingDeviceAttributes;
  previousTechnicianId: string;
  pricing: CatalogPricingPreview;
}
export type InterruptionSourceKind = 'cancelled' | 'onsite';
export interface InterruptionDraft {
  anchorBookingId: string;
  sourceVisitGroupId: string | null;
  /** T2 onsite sources keep the old order active; manager-close sources ended it. */
  sourceKind: InterruptionSourceKind;
  targetKind: 'booking' | 'visit_group';
  addressId: string | null;
  addressText: string | null;
  customerNote: string;
  addresses: UserAddress[];
  items: InterruptionDraftItem[];
}
export interface InterruptionRebookItemInput {
  sourceBookingId: string;
  sourceCaseId: string;
  selectedVariantCode?: string;
  description?: string;
  deviceAttributes?: BookingDeviceAttributes;
}
export interface InterruptionRebookInput {
  idempotencyKey: string;
  addressId: string;
  date: string;
  slot: BookingSlot;
  customerNote?: string;
  items: InterruptionRebookItemInput[];
}

interface ReadContext {
  owner: string;
  draft: InterruptionDraft;
}
const contexts = new Map<string, ReadContext>();

function unwrap(payload: unknown): unknown {
  if (!isRecord(payload) || payload.success !== true || !Number.isInteger(payload.statusCode) || !('data' in payload)) throw invalid();
  return payload.data;
}

function normalizeRawDraft(value: unknown, anchor: string): Omit<InterruptionDraft, 'addresses' | 'items' | 'sourceKind'> & {
  rawItems: Array<Omit<InterruptionDraftItem, 'serviceName' | 'deviceLabel' | 'selectedVariantCode' | 'pricing'>>;
} {
  if (!isRecord(value) || !isRecord(value.confirmation) || value.confirmation.available !== true
    || value.confirmation.path !== '/api/v1/bookings/' + anchor + '/interruption-rebook'
    || value.requiresNewSchedule !== true || value.requiresPricingRevalidation !== true
    || (value.sourceVisitGroupId !== null && !asId(value.sourceVisitGroupId))
    || !isRecord(value.address)
    || (value.address.id !== null && !asId(value.address.id))
    || (value.address.text !== null && typeof value.address.text !== 'string')
    || (value.customerNote !== null && typeof value.customerNote !== 'string')
    || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 3) throw invalid();
  const seenBookings = new Set<string>();
  const seenOrders = new Set<string>();
  const seenCases = new Set<string>();
  const rawItems = value.items.map((item: unknown) => {
    if (!isRecord(item) || !asId(item.sourceBookingId) || seenBookings.has(item.sourceBookingId)
      || !asId(item.sourceOrderId) || seenOrders.has(item.sourceOrderId)
      || !asId(item.sourceCaseId) || seenCases.has(item.sourceCaseId)
      || !asId(item.serviceId) || typeof item.description !== 'string'
      || (item.deviceLabel !== null && typeof item.deviceLabel !== 'string')
      || (item.selectedVariantCode !== null && typeof item.selectedVariantCode !== 'string')
      || (item.deviceAttributes !== null && !isRecord(item.deviceAttributes))
      || item.quantity !== 1 || !Array.isArray(item.photos) || item.photos.length !== 0
      || !asId(item.previousTechnicianId)) throw invalid();
    seenBookings.add(item.sourceBookingId); seenOrders.add(item.sourceOrderId); seenCases.add(item.sourceCaseId);
    return {
      sourceBookingId: item.sourceBookingId, sourceOrderId: item.sourceOrderId, sourceCaseId: item.sourceCaseId,
      serviceId: item.serviceId, description: item.description, deviceAttributes: (item.deviceAttributes ?? {}) as BookingDeviceAttributes,
      previousTechnicianId: item.previousTechnicianId,
    };
  });
  if (!seenBookings.has(anchor) || value.targetKind !== (rawItems.length === 1 ? 'booking' : 'visit_group')
    || (rawItems.length > 1 && !value.sourceVisitGroupId)) throw invalid();
  return {
    anchorBookingId: anchor, sourceVisitGroupId: value.sourceVisitGroupId as string | null,
    targetKind: value.targetKind as 'booking' | 'visit_group', addressId: value.address.id as string | null, addressText: value.address.text as string | null,
    customerNote: value.customerNote ?? '', rawItems,
  };
}

export const interruptionRebookApi = {
  async readDraft(anchor: string, owner: string): Promise<InterruptionDraft> {
    contexts.delete(anchor);
    if (!asId(anchor) || !owner) throw invalid();
    const response = await apiClient.get<unknown>('/bookings/' + encodeURIComponent(anchor) + '/interruption-draft');
    const raw = normalizeRawDraft(unwrap(response.data), anchor);
    const kinds: InterruptionSourceKind[] = [];
    const [addresses, linked] = await Promise.all([
      profileApi.getAddresses(),
      Promise.all(raw.rawItems.map(async item => {
        const [booking, order, sourceCase] = await Promise.all([
          bookingsApi.getBooking(item.sourceBookingId), ordersApi.getOrder(item.sourceOrderId), supportCasesApi.getMine(item.sourceCaseId),
        ]);
        if (booking.id !== item.sourceBookingId || booking.customerId !== owner || booking.serviceId !== item.serviceId
          || (booking.visitGroupId ?? null) !== raw.sourceVisitGroupId
          || order.id !== item.sourceOrderId || order.bookingId !== item.sourceBookingId
          || sourceCase.id !== item.sourceCaseId || sourceCase.serviceOrderId !== item.sourceOrderId) throw invalid();
        const orderStatus = String(order.status).toUpperCase();
        if (booking.status === 'CANCELLED' && orderStatus === 'CANCELLED') {
          // Manager-close source: the old booking/order are closed and the case carries the resolution.
          const supportedCaseType = sourceCase.caseType === 'mid_job_interruption' || sourceCase.caseType === 'technician_replacement';
          const caseBookingMatches = sourceCase.bookingId === item.sourceBookingId
            || (sourceCase.bookingId === null && sourceCase.caseType === 'technician_replacement');
          if (!caseBookingMatches || !supportedCaseType
            || sourceCase.status !== 'resolved' || sourceCase.resolutionCode !== 'interrupted_for_rebook') throw invalid();
          kinds.push('cancelled');
        } else if (booking.status === 'MATCHED' && ['EN_ROUTE', 'UNDER_REPAIR'].includes(orderStatus)) {
          // T2 onsite source: the old order is still active. The server re-verifies the T1 receipt and
          // the SM case status is not authority, so only ownership and exact links are checked here.
          if (sourceCase.caseType !== 'technician_replacement' || sourceCase.bookingId !== item.sourceBookingId) throw invalid();
          kinds.push('onsite');
        } else throw invalid();
        const [service, pricing] = await Promise.all([
          catalogApi.getService(item.serviceId),
          catalogPricingApi.getPreview(item.serviceId, item.deviceAttributes),
        ]);
        if (service.id !== item.serviceId || service.isActive !== true || pricing.serviceId !== item.serviceId
          || pricing.serviceCode !== service.code || (pricing.status === 'FIXED_PRICE' && pricing.possibleVariants.length === 0)) throw invalid();
        return {
          ...item, serviceName: service.name, deviceLabel: raw.rawItems.length > 1 ? 'Thiết bị' : service.name,
          selectedVariantCode: null, pricing,
        };
      })),
    ]);
    const ownedAddresses = addresses.filter(address => address.userId === owner);
    const draft: InterruptionDraft = {
      anchorBookingId: raw.anchorBookingId, sourceVisitGroupId: raw.sourceVisitGroupId,
      sourceKind: kinds.includes('onsite') ? 'onsite' : 'cancelled', targetKind: raw.targetKind,
      addressId: raw.addressId, addressText: raw.addressText, customerNote: raw.customerNote,
      addresses: ownedAddresses, items: linked,
    };
    contexts.set(anchor, { owner, draft });
    return draft;
  },

  async confirm(anchor: string, owner: string, input: InterruptionRebookInput): Promise<{ kind: 'booking' | 'visit'; id: string }> {
    const context = contexts.get(anchor);
    if (!context || context.owner !== owner || !asId(input.addressId)
      || !context.draft.addresses.some(address => address.id === input.addressId)
      || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)
      || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
      || !['morning', 'afternoon', 'evening'].includes(input.slot)
      || !Array.isArray(input.items) || input.items.length !== context.draft.items.length
      || new Set(input.items.map(item => `${item.sourceBookingId}:${item.sourceCaseId}`)).size !== input.items.length
      || input.items.some(item => !context.draft.items.some(source => source.sourceBookingId === item.sourceBookingId && source.sourceCaseId === item.sourceCaseId))) throw invalid();
    for (const item of input.items) {
      const source = context.draft.items.find(row => row.sourceBookingId === item.sourceBookingId)!;
      if (source.pricing.status === 'FIXED_PRICE'
        && (!item.selectedVariantCode || !source.pricing.possibleVariants.some(variant => variant.variantCode === item.selectedVariantCode))) throw invalid();
      if (source.pricing.status === 'INSPECTION_REQUIRED' && item.selectedVariantCode) throw invalid();
    }
    const body = {
      idempotencyKey: input.idempotencyKey, addressId: input.addressId, date: input.date, slot: input.slot,
      ...(input.customerNote?.trim() ? { customerNote: input.customerNote.trim() } : {}),
      items: input.items.map(item => ({
        sourceBookingId: item.sourceBookingId, sourceCaseId: item.sourceCaseId,
        ...(item.selectedVariantCode ? { selectedVariantCode: item.selectedVariantCode } : {}),
        ...(item.description !== undefined ? { description: item.description } : {}),
        ...(item.deviceAttributes ? { deviceAttributes: item.deviceAttributes } : {}),
      })),
    };
    const response = await apiClient.post<unknown>('/bookings/' + encodeURIComponent(anchor) + '/interruption-rebook', body);
    const result = unwrap(response.data);
    if (!isRecord(result) || result.targetKind !== context.draft.targetKind || !Array.isArray(result.items)
      || result.items.length !== context.draft.items.length) throw invalid();
    const returned = new Map<string, { bookingId: string; sourceCaseId: string }>();
    for (const item of result.items) {
      if (!isRecord(item) || !asId(item.sourceBookingId) || !asId(item.sourceCaseId) || !asId(item.bookingId)
        || returned.has(item.sourceBookingId)) throw invalid();
      returned.set(item.sourceBookingId, { bookingId: item.bookingId, sourceCaseId: item.sourceCaseId });
    }
    if (!context.draft.items.every(item => returned.get(item.sourceBookingId)?.sourceCaseId === item.sourceCaseId)) throw invalid();
    if (context.draft.targetKind === 'booking') {
      if (!asId(result.bookingId) || result.visitGroupId !== null || returned.get(context.draft.items[0]!.sourceBookingId)?.bookingId !== result.bookingId) throw invalid();
      contexts.delete(anchor);
      return { kind: 'booking', id: result.bookingId };
    }
    if (!asId(result.visitGroupId) || result.bookingId !== null) throw invalid();
    contexts.delete(anchor);
    return { kind: 'visit', id: result.visitGroupId };
  },
};
