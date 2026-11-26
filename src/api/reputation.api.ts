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

export interface ReputationSummary {
  totalAccounts: number;
  lowScoreCount: number;
  suspendedCount: number;
  averagePoints: number;
}

export interface ReputationPage {
  data: ReputationRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary?: ReputationSummary | null;
}

export const reputationApi = {
  async mine(): Promise<MyReputation> {
    const res = await apiClient.get<{ data: MyReputation }>('/reputation/me');
    return res.data.data;
  },

  async list(params: { role?: 'customer' | 'technician'; search?: string; page?: number; pageSize?: number }): Promise<ReputationPage> {
    const res = await apiClient.get<{ data: ReputationRow[]; meta: ReputationPage['meta']; summary?: ReputationSummary | null }>('/reputation', { params });
    return {
      data: res.data.data ?? [],
      meta: res.data.meta ?? { page: 1, limit: params.pageSize ?? 20, total: 0, totalPages: 0 },
      summary: res.data.summary ?? null,
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
