import apiClient from './client';

/** One change of a score: a violation, a staff adjustment or the periodic reset. */
export interface ReputationEvent {
  id: string;
  kind: 'violation' | 'adjustment' | 'reset';
  delta: number;
  pointsAfter: number;
  reason: string;
  penalty?: string | null;
  createdAt: string;
  serviceOrderId?: string | null;
  cancellationId?: string | null;
  supportCaseId?: string | null;
  warrantyClaimId?: string | null;
  warrantyCause?: 'decline' | 'no_show' | 'unfixed' | null;
  actorUserId?: string | null;
  orderCode?: string | null;
  actorName?: string | null;
}

/** The signed-in customer's or technician's own score (GET /reputation/me). */
export interface MyReputation {
  points: number;
  periodStart: string | null;
  resetsAt: string;
  suspendedUntil: string | null;
  locked: boolean;
  events: ReputationEvent[];
}

export interface ReputationRow {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: 'customer' | 'technician';
  status: string;
  reputationPoints: number;
  bookingSuspendedUntil: string | null;
  workSuspendedUntil: string | null;
}

/** Account states a stat card filters by; the backend counts and filters with the same rule (BUG 318). */
export type ReputationState = 'deducted' | 'low' | 'suspended' | 'locked';

/** GET /reputation/stats: counts over every account, not the page on screen. */
export interface ReputationStats {
  /** Accounts by role whatever is filtered: the numbers of the role filter. */
  roles: { all: number; customer: number; technician: number };
  /** Accounts in the selected role (both when none). */
  total: number;
  deducted: number;
  low: number;
  suspended: number;
  locked: number;
}

export interface ReputationPage {
  data: ReputationRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const reputationApi = {
  async mine(): Promise<MyReputation> {
    const res = await apiClient.get<{ data: MyReputation }>('/reputation/me');
    return res.data.data;
  },

  async list(params: { role?: 'customer' | 'technician'; search?: string; state?: ReputationState; page?: number; pageSize?: number }): Promise<ReputationPage> {
    const res = await apiClient.get<{ data: ReputationRow[]; meta: ReputationPage['meta'] }>('/reputation', { params });
    return {
      data: res.data.data ?? [],
      meta: res.data.meta ?? { page: 1, limit: params.pageSize ?? 20, total: 0, totalPages: 0 },
    };
  },

  async stats(role?: 'customer' | 'technician'): Promise<ReputationStats> {
    const res = await apiClient.get<{ data: Partial<ReputationStats> | null }>('/reputation/stats', { params: role ? { role } : {} });
    const raw = res.data.data;
    if (!raw || typeof raw !== 'object') throw new Error('Backend returned an invalid reputation stats response.');
    return {
      roles: { all: count(raw.roles?.all), customer: count(raw.roles?.customer), technician: count(raw.roles?.technician) },
      total: count(raw.total),
      deducted: count(raw.deducted),
      low: count(raw.low),
      suspended: count(raw.suspended),
      locked: count(raw.locked),
    };
  },

  async events(userId: string): Promise<ReputationEvent[]> {
    const res = await apiClient.get<{ data: ReputationEvent[] }>(`/reputation/${userId}/events`);
    return res.data.data ?? [];
  },

  async adjust(userId: string, delta: number, reason: string): Promise<{ points: number; event?: ReputationEvent }> {
    const res = await apiClient.post<{ data: { points: number; event?: ReputationEvent } }>(`/reputation/${userId}/adjust`, { delta, reason });
    return res.data.data;
  },
};
