import type { ServiceOrderItem } from '../api/orders.api';
import type { PartRequest } from '../api/part-requests.api';
import type { VisitDeviceState } from '../api/visit-groups.api';

export interface TechnicianVisitCustodySummary {
  needDeclare: number;
  awaitingManager: number;
}

export interface TechnicianVisitDeviceStatus {
  label: string;
  tone: 'neutral' | 'attention' | 'progress' | 'success' | 'danger';
  outcome: boolean;
  custodyLabel: string | null;
}

type JobStatusSource = Pick<ServiceOrderItem, 'status' | 'quotation'>;
type PartRequestStatusSource = Pick<PartRequest, 'status'>;

const OUTCOME_LABELS: Record<Exclude<VisitDeviceState, 'open'>, Pick<TechnicianVisitDeviceStatus, 'label' | 'tone'>> = {
  succeeded: { label: 'Đã sửa xong', tone: 'success' },
  failed: { label: 'Không sửa được', tone: 'danger' },
  quote_declined: { label: 'Khách không duyệt báo giá', tone: 'attention' },
  cancelled: { label: 'Đã huỷ', tone: 'neutral' },
};

function custodyLabel(summary?: TechnicianVisitCustodySummary | null): string | null {
  if (!summary) return null;
  const actions = [
    summary.needDeclare > 0 ? `${summary.needDeclare} linh kiện còn cần khai trả` : null,
    summary.awaitingManager > 0 ? `${summary.awaitingManager} linh kiện chờ Quản lý Dịch vụ xác nhận` : null,
  ].filter((action): action is string => action !== null);
  return actions.length ? actions.join(' · ') : null;
}

/** Projects only states confirmed by this ServiceOrder's authorized detail reads. */
export function projectTechnicianVisitDeviceStatus(
  visitState: VisitDeviceState,
  job: JobStatusSource | null | undefined,
  partRequests: readonly PartRequestStatusSource[] | null | undefined,
  custody?: TechnicianVisitCustodySummary | null,
): TechnicianVisitDeviceStatus {
  const custodyAction = custodyLabel(custody);
  if (visitState !== 'open') {
    return { ...OUTCOME_LABELS[visitState], outcome: true, custodyLabel: custodyAction };
  }

  let label = 'Chưa cập nhật';
  let tone: TechnicianVisitDeviceStatus['tone'] = 'neutral';
  if (job && String(job.quotation?.status ?? '').toUpperCase() === 'SENT') {
    label = 'Chờ khách duyệt báo giá';
    tone = 'attention';
  } else if (job && partRequests) {
    const statuses = new Set(partRequests.map((request) => String(request.status).toLowerCase()));
    if (statuses.has('ready')) {
      label = 'Linh kiện sẵn sàng nhận';
      tone = 'attention';
    } else if (statuses.has('delivering')) {
      label = 'Linh kiện đang giao';
      tone = 'progress';
    } else if (statuses.has('requested')) {
      label = 'Chờ linh kiện';
      tone = 'progress';
    } else if (statuses.has('received')) {
      label = 'Đã nhận linh kiện';
      tone = 'progress';
    } else if (['UNDER_REPAIR', 'IN_PROGRESS'].includes(String(job.status).toUpperCase())) {
      label = 'Đang sửa';
      tone = 'progress';
    }
  }

  return { label, tone, outcome: false, custodyLabel: custodyAction };
}
