import apiClient, { getHttpStatus } from './client';
import { uploadFailedRepairEvidence } from './failed-repair.api';
import type { TechnicianReportReasonClass, TechnicianReportReasonCode } from './support-cases.api';

export type CannotContinueReasonCode = Exclude<TechnicianReportReasonCode, 'customer_absent' | 'customer_cancelled'>;
export interface CannotContinueInput {
  reasonClass: TechnicianReportReasonClass;
  reasonCode: CannotContinueReasonCode;
  reason: string;
  photoEvidenceIds: string[];
}
export interface CannotContinueCommand extends CannotContinueInput { commandId: string }
export interface ContinuationSource {
  serviceOrderId: string; bookingId: string; incidentId: string; visitGroupId: string | null;
}
/** Verified against Backend 6ed7f73. Future terminal/draft contracts require explicit integration. */
export interface CustomerContinuation {
  version: 1;
  incidentId: string | null;
  serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED' | null;
  serviceOrderStatus: string;
  terminalTransitionApplied: false;
  oldObligations: {
    reviewRequired: boolean; quotePreserved: true; moneyPreserved: true; partsPreserved: true;
    physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY'; legacyPartReturnState: 'NOT_VERIFIED';
  };
  customerContinuation: {
    eligible: boolean; independentNewBookingAllowed: boolean; prefilledRebookAvailable: boolean;
    requiresNewSchedule: true; requiresPricingRevalidation: true; requiresCustomerConfirmation: true;
    source: ContinuationSource | null;
  };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
const invalid = () => new Error('Chưa xác nhận được kết quả gián đoạn. Vui lòng kiểm tra lại trạng thái.');

function readResult(data: unknown, orderId: string, bookingId: string, groupId: string | null): CustomerContinuation {
  if (!record(data) || data.version !== 1 || data.terminalTransitionApplied !== false
    || !['accepted', 'en_route', 'under_repair', 'completed', 'cancelled'].includes(String(data.serviceOrderStatus))
    || !record(data.oldObligations) || !record(data.customerContinuation)) throw invalid();
  const old = data.oldObligations; const next = data.customerContinuation;
  if (typeof old.reviewRequired !== 'boolean' || old.quotePreserved !== true || old.moneyPreserved !== true || old.partsPreserved !== true
    || old.physicalReturnAcceptance !== 'MANUAL_SERVICE_MANAGER_ONLY' || old.legacyPartReturnState !== 'NOT_VERIFIED'
    || typeof next.eligible !== 'boolean' || typeof next.independentNewBookingAllowed !== 'boolean'
    || typeof next.prefilledRebookAvailable !== 'boolean' || next.requiresNewSchedule !== true
    || next.requiresPricingRevalidation !== true || next.requiresCustomerConfirmation !== true) throw invalid();
  if (next.eligible) {
    const source = next.source;
    if (!uuid(data.incidentId) || data.serviceOutcome !== 'VERIFIED_INTERRUPTION_RECORDED'
      || !['en_route', 'under_repair'].includes(String(data.serviceOrderStatus)) || old.reviewRequired !== true
      || !record(source) || source.serviceOrderId !== orderId || source.bookingId !== bookingId
      || source.incidentId !== data.incidentId || source.visitGroupId !== groupId) throw invalid();
  } else if (data.incidentId !== null || data.serviceOutcome !== null || next.source !== null
    || next.independentNewBookingAllowed || next.prefilledRebookAvailable || old.reviewRequired) throw invalid();
  // Return only the reviewed fields. No server-supplied URLs or arbitrary draft paths are consumed.
  return {
    version: 1, incidentId: data.incidentId as string | null, serviceOutcome: data.serviceOutcome as CustomerContinuation['serviceOutcome'],
    serviceOrderStatus: data.serviceOrderStatus as string, terminalTransitionApplied: false,
    oldObligations: { reviewRequired: old.reviewRequired, quotePreserved: true, moneyPreserved: true, partsPreserved: true,
      physicalReturnAcceptance: 'MANUAL_SERVICE_MANAGER_ONLY', legacyPartReturnState: 'NOT_VERIFIED' },
    customerContinuation: { eligible: next.eligible, independentNewBookingAllowed: next.independentNewBookingAllowed,
      prefilledRebookAvailable: next.prefilledRebookAvailable, requiresNewSchedule: true, requiresPricingRevalidation: true,
      requiresCustomerConfirmation: true, source: next.eligible ? { serviceOrderId: orderId, bookingId,
        incidentId: data.incidentId as string, visitGroupId: groupId } : null },
  };
}
const path = (id: string) => `/service-orders/${encodeURIComponent(id)}`;
export const customerContinuationApi = {
  async get(orderId: string, bookingId: string, groupId: string | null): Promise<CustomerContinuation> {
    if (!orderId || !bookingId) throw invalid();
    const response = await apiClient.get<{ data: unknown }>(`${path(orderId)}/customer-continuation`);
    return readResult(response.data?.data, orderId, bookingId, groupId);
  },
};

export class CannotContinueError extends Error {
  constructor(readonly locked: boolean, readonly uncertain: boolean) {
    super(uncertain ? 'Chưa xác nhận được kết quả. Thử lại cùng nội dung để kiểm tra, không gửi yêu cầu khác.'
      : locked ? 'Quyền hoặc trạng thái đơn đã thay đổi. Vui lòng tải lại công việc để kiểm tra.'
        : 'Chưa gửi được yêu cầu. Kiểm tra lý do và ảnh chứng cứ rồi thử lại.');
  }
}
const reasonCodes: readonly CannotContinueReasonCode[] = ['skill_gap', 'device_too_old', 'severe_damage', 'no_compatible_part', 'manufacturer_warranty_or_workshop', 'dispute_or_other'];
function normalize(input: CannotContinueInput): CannotContinueInput {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const photos = input.photoEvidenceIds;
  if (!(input.reasonClass === 'technician_skill_gap' ? input.reasonCode === 'skill_gap'
    : input.reasonClass === 'non_technician_exception' && input.reasonCode !== 'skill_gap' && reasonCodes.includes(input.reasonCode))
    || reason.length < 10 || reason.length > 2000 || !Array.isArray(photos) || photos.length > 3
    || photos.some(id => !uuid(id)) || new Set(photos.map(id => id.toLowerCase())).size !== photos.length) throw new CannotContinueError(false, false);
  return { reasonClass: input.reasonClass, reasonCode: input.reasonCode, reason, photoEvidenceIds: photos.map(id => id.toLowerCase()).sort() };
}
export async function uploadCannotContinueEvidence(orderId: string, file: File) {
  const result = await uploadFailedRepairEvidence(orderId, file);
  if (!uuid(result.evidenceId)) throw new Error('Chưa xác nhận được ảnh chứng cứ. Vui lòng tải lại ảnh.');
  return result;
}

/** Per-page memory; exact pending commands survive dialog reopen/device switching, never localStorage. */
export function createCannotContinuePort() {
  const pending = new Map<string, { command: CannotContinueCommand; editable: boolean; bookingId: string; groupId: string | null }>();
  const confirmed = new Map<string, CustomerContinuation>();
  const running = new Set<string>();
  let epoch = 0;
  return {
    pending(id: string): CannotContinueCommand | null {
      const command = pending.get(id)?.command;
      return command ? { ...command, photoEvidenceIds: [...command.photoEvidenceIds] } : null;
    },
    reset() { ++epoch; pending.clear(); confirmed.clear(); running.clear(); },
    async send(orderId: string, bookingId: string, groupId: string | null, input: CannotContinueInput): Promise<CustomerContinuation> {
      if (!orderId || !bookingId) throw new CannotContinueError(false, false);
      const normalized = normalize(input);
      if (running.has(orderId)) throw new CannotContinueError(true, true);
      const prior = pending.get(orderId);
      const same = prior && prior.bookingId === bookingId && prior.groupId === groupId
        && JSON.stringify(normalize(prior.command)) === JSON.stringify(normalized);
      if (prior && !same && !prior.editable) throw new CannotContinueError(true, true);
      if (same && confirmed.has(orderId)) return confirmed.get(orderId)!;
      const entry = same ? prior : { command: { ...normalized, commandId: crypto.randomUUID() }, editable: false, bookingId, groupId };
      pending.set(orderId, entry); running.add(orderId);
      const requestEpoch = epoch;
      try {
        const response = await apiClient.post<{ data: unknown }>(`${path(orderId)}/cannot-continue`, entry.command);
        const result = readResult(response.data?.data, orderId, bookingId, groupId);
        if (!result.customerContinuation.eligible || requestEpoch !== epoch) throw invalid();
        confirmed.set(orderId, result);
        return result;
      } catch (error) {
        const status = getHttpStatus(error);
        const editable = status === 400 || status === 422;
        if (requestEpoch === epoch) entry.editable = editable;
        throw new CannotContinueError(!editable, status === undefined || status >= 500 || status === 408);
      } finally { if (requestEpoch === epoch) running.delete(orderId); }
    },
  };
}
export type CannotContinuePort = ReturnType<typeof createCannotContinuePort>;
