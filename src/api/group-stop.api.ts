import apiClient, { getHttpStatus } from './client';
import { CannotContinueError } from './platform-continuation.api';

export interface ContactReadiness {
  contactCount: number; notificationSent: boolean; callsSpaced: boolean;
  nextCallAt: string | null; nextEligibleAt: string | null; serverNow: string; ready: boolean;
}
export type ContactKind = 'CALL_ATTEMPT' | 'IN_APP_NOTIFICATION';
export interface GroupStopInput {
  selectedOrderId: string; reasonClass: 'non_technician_exception';
  reasonCode: 'customer_absent' | 'customer_unreachable'; reason: string; photoEvidenceIds: string[];
}
export interface GroupStopCommand extends GroupStopInput { commandId: string }
export interface GroupStopResult {
  version: 1; groupId: string; commandId: string;
  stopped: Array<{ bookingId: string; orderId: string; incidentId: string; workStopped: true; assignmentReleased: true; operationalDisposition: 'STOPPED'; financialFollowupRequired: true }>;
  preserved: Array<{ bookingId: string; orderId: string; orderStatus: string; outcome: string | null; disposition: 'PRESERVED'; financialFollowupRequired: boolean }>;
  oldObligationsPreserved: true; financialFollowupRequired: true; automaticLiabilityApplied: false;
}
export interface GroupStopIncident {
  commandId: string; recordedAt: string; result: GroupStopResult;
  contactEvidence: Array<{ id: string; createdAt: string; after: { kind: ContactKind; callConnectionVerified: false } }>;
  children: Array<{ bookingId: string; orderId?: string; orderStatus?: string; paymentStatus?: string;
    completionRequestedAt?: string | null; outcome: string | null; financialFollowupRequired: boolean;
    cases: Array<{ id: string; serviceOrderId: string; status: string }> }>;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const invalid = () => new Error('Chưa xác minh được dữ liệu lượt sửa. Vui lòng tải lại để đối chiếu.');
const path = (id: string) => { if (!uuid(id)) throw invalid(); return `/visit-groups/${encodeURIComponent(id)}`; };
function readReadiness(v: unknown): ContactReadiness {
  if (!record(v) || !Number.isSafeInteger(v.contactCount) || Number(v.contactCount) < 0
    || typeof v.notificationSent !== 'boolean' || typeof v.callsSpaced !== 'boolean' || typeof v.ready !== 'boolean'
    || !date(v.serverNow) || !(v.nextCallAt === null || date(v.nextCallAt)) || !(v.nextEligibleAt === null || date(v.nextEligibleAt))
    || (v.ready && (Number(v.contactCount) < 2 || !v.notificationSent || !v.callsSpaced || !date(v.nextEligibleAt) || Date.parse(v.nextEligibleAt) > Date.parse(v.serverNow)))) throw invalid();
  return { contactCount: Number(v.contactCount), notificationSent: v.notificationSent, callsSpaced: v.callsSpaced,
    nextCallAt: v.nextCallAt, nextEligibleAt: v.nextEligibleAt, serverNow: v.serverNow, ready: v.ready };
}
function readResult(v: unknown, groupId: string, commandId: string): GroupStopResult {
  if (!record(v) || v.version !== 1 || v.groupId !== groupId || v.commandId !== commandId
    || v.oldObligationsPreserved !== true || v.financialFollowupRequired !== true || v.automaticLiabilityApplied !== false
    || !Array.isArray(v.stopped) || v.stopped.length < 1 || !Array.isArray(v.preserved)
    || v.stopped.length + v.preserved.length > 3) throw invalid();
  const seen = new Set<string>();
  for (const child of [...v.stopped, ...v.preserved]) {
    if (!record(child) || !uuid(child.orderId) || !uuid(child.bookingId) || seen.has(child.orderId)) throw invalid();
    seen.add(child.orderId);
  }
  if (v.stopped.some(child => !record(child) || !uuid(child.incidentId) || child.workStopped !== true
    || child.assignmentReleased !== true || child.operationalDisposition !== 'STOPPED' || child.financialFollowupRequired !== true)
    || v.preserved.some(child => !record(child) || child.disposition !== 'PRESERVED' || typeof child.orderStatus !== 'string'
      || !(child.outcome === null || typeof child.outcome === 'string') || typeof child.financialFollowupRequired !== 'boolean')) throw invalid();
  return v as unknown as GroupStopResult;
}
function normalize(input: GroupStopInput): GroupStopInput {
  const reason = input.reason.trim();
  if (!uuid(input.selectedOrderId) || input.reasonClass !== 'non_technician_exception'
    || !['customer_absent', 'customer_unreachable'].includes(input.reasonCode) || reason.length < 10 || reason.length > 2000
    || !Array.isArray(input.photoEvidenceIds) || input.photoEvidenceIds.length > 3 || input.photoEvidenceIds.some(id => !uuid(id))
    || new Set(input.photoEvidenceIds.map(id => id.toLowerCase())).size !== input.photoEvidenceIds.length) throw new CannotContinueError(false, false);
  return { selectedOrderId: input.selectedOrderId, reasonClass: input.reasonClass, reasonCode: input.reasonCode,
    reason, photoEvidenceIds: input.photoEvidenceIds.map(id => id.toLowerCase()).sort() };
}
export const groupStopApi = {
  async readiness(groupId: string, selectedOrderId: string) {
    if (!uuid(selectedOrderId)) throw invalid();
    const res = await apiClient.get<{ data: unknown }>(`${path(groupId)}/contact-readiness`, { params: { selectedOrderId } });
    return readReadiness(res.data.data);
  },
  async contact(groupId: string, selectedOrderId: string, commandId: string, kind: ContactKind) {
    if (!uuid(selectedOrderId) || !uuid(commandId) || !['CALL_ATTEMPT', 'IN_APP_NOTIFICATION'].includes(kind)) throw invalid();
    const res = await apiClient.post<{ data: unknown }>(`${path(groupId)}/contact-attempt`, { selectedOrderId, commandId, kind });
    const v = res.data.data;
    if (!record(v) || !uuid(v.evidenceId) || !date(v.recordedAt) || v.callConnectionVerified !== false) throw invalid();
    return readReadiness(v);
  },
  async incidents(groupId: string): Promise<GroupStopIncident[]> {
    const res = await apiClient.get<{ data: unknown }>(`${path(groupId)}/stop-incidents`);
    const rows = res.data.data;
    if (!Array.isArray(rows)) throw invalid();
    return rows.map(v => {
      if (!record(v) || !uuid(v.commandId) || !date(v.recordedAt) || !Array.isArray(v.children) || !Array.isArray(v.contactEvidence)) throw invalid();
      const result = readResult(v.result, groupId, v.commandId);
      for (const child of v.children) {
        if (!record(child) || !uuid(child.bookingId) || (child.orderId !== undefined && !uuid(child.orderId)) || !Array.isArray(child.cases)
          || child.cases.some(c => !record(c) || !uuid(c.id) || c.serviceOrderId !== child.orderId || typeof c.status !== 'string')) throw invalid();
      }
      for (const proof of v.contactEvidence) {
        if (!record(proof) || !uuid(proof.id) || !date(proof.createdAt) || !record(proof.after)
          || !['CALL_ATTEMPT', 'IN_APP_NOTIFICATION'].includes(String(proof.after.kind)) || proof.after.callConnectionVerified !== false) throw invalid();
      }
      return { ...v, result } as unknown as GroupStopIncident;
    });
  },
};
/** Page-owned command memory. Exact replay reads the durable receipt even after assignment release. */
export function createGroupStopPort() {
  const contacts = new Map<string, { commandId: string; kind: ContactKind }>();
  const entries = new Map<string, { command: GroupStopCommand; locked: boolean; retry: boolean; result?: GroupStopResult }>();
  const running = new Set<string>();
  let epoch = 0;
  return {
    pending(id: string) { const c = entries.get(id)?.command; return c ? { ...c, photoEvidenceIds: [...c.photoEvidenceIds] } : null; },
    retryAllowed(id: string) { return entries.get(id)?.retry ?? true; },
    reset() { ++epoch; entries.clear(); contacts.clear(); running.clear(); },
    pendingContact(groupId: string, orderId: string) { return contacts.get(`${groupId}:${orderId}`)?.kind ?? null; },
    async contact(groupId: string, orderId: string, kind: ContactKind) {
      const key = `${groupId}:${orderId}`;
      const prior = contacts.get(key);
      if (prior && prior.kind !== kind) throw new Error('Cần đối chiếu lần liên hệ trước bằng cùng thao tác.');
      const command = prior ?? { commandId: crypto.randomUUID(), kind };
      contacts.set(key, command);
      const requestEpoch = epoch;
      const result = await groupStopApi.contact(groupId, orderId, command.commandId, kind);
      if (requestEpoch !== epoch) throw invalid();
      contacts.delete(key);
      return result;
    },
    async send(groupId: string, input: GroupStopInput): Promise<GroupStopResult> {
      const endpoint = `${path(groupId)}/cannot-continue`;
      const normalized = normalize(input);
      const prior = entries.get(groupId);
      const same = prior && JSON.stringify(normalize(prior.command)) === JSON.stringify(normalized);
      if (running.has(groupId) || (prior && !same && prior.locked)) throw new CannotContinueError(true, true);
      if (same && prior.result) return prior.result;
      if (prior && !prior.retry) throw new CannotContinueError(true, false);
      const entry = same ? prior : { command: { ...normalized, commandId: crypto.randomUUID() }, locked: true, retry: true, result: undefined as GroupStopResult | undefined };
      entries.set(groupId, entry); running.add(groupId);
      const requestEpoch = epoch;
      try {
        const res = await apiClient.post<{ data: unknown }>(endpoint, entry.command);
        const result = readResult(res.data.data, groupId, entry.command.commandId);
        if (requestEpoch !== epoch || !result.stopped.some(child => child.orderId === input.selectedOrderId)) throw invalid();
        entry.result = result;
        return result;
      } catch (error) {
        const status = getHttpStatus(error);
        const editable = status === 400 || status === 422;
        const uncertain = status === undefined || status === 408 || status >= 500;
        if (requestEpoch === epoch) { entry.locked = !editable; entry.retry = editable || uncertain; }
        throw new CannotContinueError(!editable, uncertain, uncertain
          ? 'Chưa xác nhận được kết quả cả lượt. Kiểm tra lại bằng cùng lệnh và nội dung; không tạo báo cáo khác.'
          : status === 409 ? 'Điều kiện liên hệ, trạng thái máy hoặc tài chính đã thay đổi. Tải lại công việc và kiểm tra; cần quản lý đối soát nếu vẫn bị chặn.' : undefined);
      } finally { if (requestEpoch === epoch) running.delete(groupId); }
    },
  };
}
export type GroupStopPort = ReturnType<typeof createGroupStopPort>;
