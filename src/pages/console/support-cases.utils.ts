import type { SupportCaseStatus, SupportCaseType } from '../../api/support-cases.api';

export const supportCaseTypeLabels: Record<SupportCaseType, string> = {
  matching_exhausted: 'Cạn ứng viên matching',
  arrival_abnormal: 'Bất thường khi đến nơi',
  cash_non_response: 'Không phản hồi tiền mặt',
  cash_mismatch: 'Lệch đối soát tiền mặt',
  cancellation_review: 'Rà soát huỷ đơn',
  parts_dispute: 'Tranh chấp phụ tùng',
  warranty_dispute: 'Tranh chấp bảo hành',
  mid_job_interruption: 'Gián đoạn giữa ca sửa',
  other: 'Trường hợp khác',
};

export const supportCaseStatusLabels: Record<SupportCaseStatus, string> = {
  open: 'Mở',
  in_review: 'Đang rà soát',
  resolved: 'Đã giải quyết',
  rejected: 'Đã từ chối',
};

export function isCashCase(caseType: SupportCaseType): boolean {
  return caseType === 'cash_non_response' || caseType === 'cash_mismatch';
}

export function formatSupportDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

export function getSupportErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason !== 'object' || reason === null || !('response' in reason)) return fallback;
  const response = (reason as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null || !('data' in response)) return fallback;
  const data = (response as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return fallback;

  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) return message;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const errorMessage = (error as { message?: unknown }).message;
    if (typeof errorMessage === 'string' && errorMessage.trim()) return errorMessage;
  }
  return fallback;
}

export function isSafeEvidenceLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
