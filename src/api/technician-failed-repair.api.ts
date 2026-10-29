import apiClient, { getHttpStatus } from './client';
import { blockedFailedRepair, uploadFailedRepairEvidence, type FailedRepairPort, type FailedRepairReport } from './failed-repair.api';
import { REPAIR_FAILURE_REASONS } from './visit-groups.api';
import { userFacingError } from '../utils/user-facing-error';

export class FailedRepairReportError extends Error {
  constructor(message: string, readonly uncertain: boolean, readonly locked: boolean) { super(message); }
}

export function createTechnicianFailedRepairPort(): FailedRepairPort {
  // Per-page, per-child memory only. Never persist private evidence or an uncertain
  // command in localStorage. The server authenticates assignment/receipt on every call.
  const pending = new Map<string, FailedRepairReport>();
  const inFlight = new Set<string>();
  const confirmed = new Set<string>();
  const path = (id: string) => `/service-orders/${encodeURIComponent(id)}`;
  async function send(id: string, body: FailedRepairReport) {
    if (inFlight.has(id)) throw new FailedRepairReportError('Đang kiểm tra kết quả. Vui lòng chờ.', true, true);
    inFlight.add(id);
    try {
      const response = await apiClient.post<{ data: { id: string; status: string; laborTotal: number | string; partsTotal: number | string; grandTotal: number | string } }>(`${path(id)}/repair-failed`, body);
      const result = response.data?.data;
      const zero = (value: unknown) => value === 0 || value === '0';
      if (!result || result.id !== id || result.status !== 'cancelled'
        || !zero(result.laborTotal) || !zero(result.partsTotal) || !zero(result.grandTotal)) {
        throw new FailedRepairReportError('Chưa xác nhận được kết quả. Hãy kiểm tra kết quả trước khi gửi lại.', true, true);
      }
      confirmed.add(id);
    } catch (error) {
      if (error instanceof FailedRepairReportError) throw error;
      const status = getHttpStatus(error);
      const definite = status !== undefined && status >= 400 && status < 500 && status !== 408;
      const locked = !definite || [401, 403, 404, 409].includes(status!);
      if (definite && !locked) pending.delete(id);
      const fallback = status === 409 ? 'Trạng thái hoặc báo cáo của máy đã thay đổi. Đóng và tải lại công việc để kiểm tra.'
        : definite ? 'Chưa gửi được báo cáo. Kiểm tra lý do và tình trạng linh kiện rồi thử lại.'
          : 'Chưa xác nhận được kết quả. Hãy kiểm tra kết quả trước khi gửi lại.';
      throw new FailedRepairReportError(definite ? userFacingError(error, fallback) : fallback, !definite, locked);
    } finally { inFlight.delete(id); }
  }
  return {
    ...blockedFailedRepair, available: true, evidenceAvailable: true,
    uploadEvidence: uploadFailedRepairEvidence,
    async report(id, input) {
      if (!id.trim() || !REPAIR_FAILURE_REASONS.some(option => option.code === input.reason)
        || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 500))
        || input.photoEvidenceIds.length > 3 || new Set(input.photoEvidenceIds).size !== input.photoEvidenceIds.length
        || input.photoEvidenceIds.some(photo => typeof photo !== 'string' || !photo.trim())
        || input.parts.length > 20 || new Set(input.parts.map(part => part.partRequestId)).size !== input.parts.length
        || input.parts.some(part => !part.partRequestId.trim() || !['installed', 'returned'].includes(part.outcome))) {
        throw new FailedRepairReportError('Chọn lý do, tối đa 3 ảnh và tình trạng của từng linh kiện.', false, false);
      }
      const previous = pending.get(id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(input)) {
        throw new FailedRepairReportError('Nội dung báo cáo đã khóa. Hãy kiểm tra kết quả trước khi thay đổi.', true, true);
      }
      if (confirmed.has(id)) return;
      const body = previous ?? { ...input, photoEvidenceIds: [...input.photoEvidenceIds], parts: input.parts.map(part => ({ ...part })) };
      pending.set(id, body);
      await send(id, body);
    },
    async reconcileReport(id) {
      const body = pending.get(id);
      if (!body) throw new FailedRepairReportError('Đóng và tải lại công việc để kiểm tra.', false, true);
      // A historical CANCELLED summary alone cannot prove a repair-failure
      // incident. Only the report endpoint checks the exact durable receipt.
      try {
        const response = await apiClient.get<{ data: { id: string; status: string } }>(path(id));
        const order = response.data?.data;
        if (!order || order.id !== id || !['under_repair', 'UNDER_REPAIR', 'cancelled', 'CANCELLED'].includes(order.status)) {
          throw new Error('Unconfirmed order state');
        }
      } catch (error) {
        throw new FailedRepairReportError(userFacingError(error, 'Chưa đọc được trạng thái máy. Kiểm tra kết nối rồi thử lại.'), true, true);
      }
      await send(id, body);
    },
  };
}
