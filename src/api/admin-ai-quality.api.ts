import apiClient from './client';

export interface AiQualityTotals {
  sessions: number;
  turns: number;
  signedIn: number;
  markedWrong: number;
  markedRight: number;
  bookings: number;
  bookingRate: number | null;
  wrongRate: number | null;
}

export interface AiQualityDay {
  day: string;
  sessions: number;
  bookings: number;
  markedWrong: number;
}

export interface AiWrongAnswer {
  sessionId: string;
  at: string;
  note: string | null;
  reply: string | null;
  customerText: string | null;
  deviceName: string | null;
  /** "chat" when the assistant noticed it in the conversation; "button" for old verdicts. */
  source?: string;
  /** fault, device or photo. */
  kind?: string | null;
  /** The words that were read wrong. */
  said?: string | null;
  /** What the customer turned down, by name. */
  rejected?: string[];
  /** The faults the conversation ended on. */
  settledOn?: string[];
}

export interface AiQuality {
  days: number;
  totals: AiQualityTotals | null;
  perDay: AiQualityDay[];
  recentWrong: AiWrongAnswer[];
}

function unwrap<T>(payload: unknown): T {
  let current = payload;
  while (current && typeof current === 'object' && !Array.isArray(current) && 'data' in (current as Record<string, unknown>)) {
    current = (current as Record<string, unknown>).data;
  }
  return current as T;
}

/** Admin: how the assistant is doing (backend GET /admin/ai-quality). Read only. */
export const adminAiQualityApi = {
  async get(days: number): Promise<AiQuality> {
    const res = await apiClient.get('/admin/ai-quality', { params: { days } });
    const body = unwrap<AiQuality>(res.data);
    return {
      days: body?.days ?? days,
      totals: body?.totals ?? null,
      perDay: body?.perDay ?? [],
      recentWrong: body?.recentWrong ?? [],
    };
  },
};
