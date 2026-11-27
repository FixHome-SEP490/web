import type { ReputationRow } from '../api/reputation.api';

/**
 * Frontend mirror of `backend/src/modules/reputation/reputation-rules.ts`.
 * Keep thresholds strictly aligned with the official Backend rules:
 *   <= 0   -> account locked permanently
 *   <= 20  -> suspended 30 days
 *   < 40   -> suspended 7 days
 *   < 70   -> suspended 72 hours
 *   >= 70  -> no penalty (eligible)
 */
export const REPUTATION_START = 100;
export const REPUTATION_SUSPEND_THRESHOLD = 70;
export const REPUTATION_REASON_MIN = 5;
export const REPUTATION_REASON_MAX = 500;
export const REPUTATION_DELTA_MIN = 1;
export const REPUTATION_DELTA_MAX = 100;

export type ReputationPenalty =
  | { kind: 'none' }
  | { kind: 'suspend'; hours: number; label: string }
  | { kind: 'lock' };

export type ReputationTierTone = 'success' | 'warning' | 'danger';

export interface ReputationTierMeta {
  key: 'eligible' | 'watch' | 'low' | 'locked';
  label: string;
  tone: ReputationTierTone;
}

export function clampPoints(value: number): number {
  return Math.max(0, Math.min(REPUTATION_START, Math.round(value)));
}

export function penaltyFor(points: number): ReputationPenalty {
  if (points <= 0) return { kind: 'lock' };
  if (points <= 20) return { kind: 'suspend', hours: 30 * 24, label: '30 ngày' };
  if (points < 40) return { kind: 'suspend', hours: 7 * 24, label: '7 ngày' };
  if (points < 70) return { kind: 'suspend', hours: 72, label: '72 giờ' };
  return { kind: 'none' };
}

/**
 * Official rule-based classification strictly derived from `penaltyFor(points)`
 * and account lock state — no arbitrary client-invented tiers.
 */
export function reputationTierOf(row: Pick<ReputationRow, 'reputationPoints' | 'status'>): ReputationTierMeta {
  if (row.status === 'locked' || row.reputationPoints <= 0) {
    return { key: 'locked', label: 'Hết điểm / Khoá', tone: 'danger' };
  }
  if (row.reputationPoints < 40) {
    return { key: 'low', label: 'Điểm thấp', tone: 'danger' };
  }
  if (row.reputationPoints < REPUTATION_SUSPEND_THRESHOLD) {
    return { key: 'watch', label: 'Cần theo dõi', tone: 'warning' };
  }
  return { key: 'eligible', label: 'Đạt ngưỡng', tone: 'success' };
}

/** Active suspension timestamp for the row's role, or null when none is running. */
export function activeBanUntil(row: Pick<ReputationRow, 'role' | 'bookingSuspendedUntil' | 'workSuspendedUntil'>): string | null {
  const until = row.role === 'customer' ? row.bookingSuspendedUntil : row.workSuspendedUntil;
  return until && new Date(until).getTime() > Date.now() ? until : null;
}
