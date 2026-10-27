// src/api/ai.api.ts
//
// The assistant, as the AI Service actually speaks it. Reached through our own
// backend rather than the GPU box directly: the box is rented per demo, so its
// host and port change every time, and a new rental must not mean a new build.

import apiClient from './client';

/** The service refuses a fourth image. */
export const AI_MAX_IMAGES = 3;

/**
 * Longest edge sent to the AI: the service shrinks every photo to 1024px anyway (IMAGE_MAX_EDGE),
 * so anything larger is bytes on the wire for nothing. Still well above the 640px the detector sees.
 */
export const AI_IMAGE_EDGE = 1024;
export const AI_IMAGE_QUALITY = 0.8;

/** What to try when the connection will not carry the first attempt. */
export const AI_RETRY_EDGE = 640;
export const AI_RETRY_QUALITY = 0.5;

/**
 * The model's budget is eight seconds and measured round trips are 0.3 to 3.3
 * seconds, but the box sits on rented hardware that may be on another
 * continent. The shared client timeout of 15s is too tight for a cold first
 * call with photographs attached, so these requests carry their own.
 */
const AI_REQUEST_TIMEOUT = 45000;

export interface DetectedDevice {
  deviceType: string;
  nameVi: string;
  confidence: number;
  source?: string | null;
  /** A guess from a photograph nobody was sure of; the customer can correct it. */
  uncertain?: boolean;
}

/** What one photograph of the message was read as (ai-service, 26/10/2026). */
export interface PhotoReading {
  /** Its place among the message's photos, from 0. */
  index: number;
  /** Null when nothing was recognised in it. */
  deviceType?: string | null;
  nameVi?: string | null;
  uncertain?: boolean;
}

export interface SuspectedFault {
  faultCode: string;
  nameVi: string;
  confidence: number;
  source?: string | null;
}

export interface RecommendedService {
  serviceCode: string;
  nameVi: string;
  /** Added by our backend from the catalogue. Null if the code is unknown. */
  serviceId?: string | null;
  /** Which appliance it is for, when the reply covers more than one. */
  deviceType?: string | null;
}

/**
 * One appliance of a reply about several, at most three (one visit). The
 * appliance being talked through is `isPrimary`; the others carry what the
 * customer said about them and the service to book each under.
 */
export interface AiDeviceSuggestion {
  deviceType: string;
  nameVi: string;
  imageIndex?: number | null;
  isPrimary?: boolean;
  service?: RecommendedService | null;
  variantCode?: string | null;
  questionsVi?: string[];
  priceEstimate?: PriceEstimate | null;
  descriptionVi?: string | null;
  /** Why there is no service, e.g. FixHome does not repair it yet. */
  noteVi?: string | null;
  /** The appliance of this photograph is a guess. */
  uncertain?: boolean;
}

export interface PriceEstimate {
  min: number;
  /** Null means the technician has to look first: render it as "from min". */
  max?: number | null;
  currency: string;
  requiresAssessment: boolean;
  /** The service's own price, as the booking form shows it: `min` is this (PO 26/10/2026). */
  labourMin?: number | null;
  /** Its top while the fixed-price variant is not known yet. */
  labourMax?: number | null;
  /** The parts the suspected fault usually needs, at FixHome's selling price; `max` adds them. */
  partsMax?: number | null;
}

/** The customer said the last answer was wrong; see ai-service `customerDisagreed`. */
export interface AiDisagreement {
  kind?: string | null;
  rejectedVi?: string[];
  /** This turn's words without the opening "sai rồi", for the booking description. */
  restVi?: string | null;
}

export interface Clarification {
  questionsVi: string[];
  serviceGroupCodes?: string[] | null;
}

/**
 * `status` is the branch to render on.
 *   ok                   - a diagnosis, or an answer
 *   needs_clarification  - questionsVi is filled; a service is still offered
 *   out_of_scope         - politely declined; show the text as written
 *   general_knowledge    - answered without our documents behind it
 *   no_grounding         - nothing in the corpus matched
 *   unavailable          - our backend could not reach the AI at all
 */
export type AiStatus =
  | 'ok'
  | 'needs_clarification'
  | 'out_of_scope'
  | 'general_knowledge'
  | 'no_grounding'
  | 'unavailable';

export interface AiReply {
  sessionId: string | null;
  status: AiStatus;
  aiAvailable?: boolean;
  /** Prose. Diagnosis fills messageVi; a question fills answerVi. */
  messageVi?: string | null;
  answerVi?: string | null;
  device?: DetectedDevice | null;
  suspectedFaults?: SuspectedFault[];
  recommendedServices?: RecommendedService[];
  /** Safety advice. When urgency is HIGH this outranks everything else. */
  suggestedActionsVi?: string[];
  priceEstimate?: PriceEstimate | null;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence?: number;
  isLowConfidence?: boolean;
  clarification?: Clarification | null;
  /**
   * What the conversation established beyond the symptom, about "Khách": what
   * they already tried or ruled out, what they suspect. Goes to the technician.
   */
  notesVi?: string[];
  /** Every appliance of the conversation when there is more than one; empty otherwise. */
  devices?: AiDeviceSuggestion[];
  /** One per photo of the message this replies to, in order: what each was read as. */
  photos?: PhotoReading[];
  disclaimerVi?: string;
  customerDisagreed?: AiDisagreement | null;
}

export type AcknowledgementSituations = Record<string, string[]>;

interface AcknowledgementPayload {
  version?: string;
  situations?: AcknowledgementSituations;
}

function unwrap<T>(payload: unknown): T {
  let current = payload;
  while (
    current &&
    typeof current === 'object' &&
    !Array.isArray(current) &&
    'data' in (current as Record<string, unknown>)
  ) {
    current = (current as Record<string, unknown>).data;
  }
  return current as T;
}

/** Too many messages in a minute: said plainly, never as an error code. */
const TOO_FAST =
  'Anh/chị nhắn hơi nhanh, em chưa kịp xử lý hết ạ. Anh/chị đợi khoảng một phút rồi gửi lại giúp em nhé.';

function tooFast(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 429;
}

/** What to say when even our own backend is unreachable. */
function offline(sessionId?: string | null, sentenceOverride?: string): AiReply {
  const sentence =
    sentenceOverride ??
    'Hiện chưa kết nối được tới trợ lý ạ. Anh/chị kiểm tra lại mạng giúp em, ' +
      'hoặc vẫn có thể đặt thợ bình thường.';
  return {
    sessionId: sessionId ?? null,
    status: 'unavailable',
    aiAvailable: false,
    messageVi: sentence,
    answerVi: sentence,
    suspectedFaults: [],
    recommendedServices: [],
    suggestedActionsVi: [],
  };
}

export const aiApi = {
  /**
   * A photo, a description, or both.
   *
   * Never rejects: the assistant failing must not take the page down with it,
   * and the customer can always still book.
   */
  async analyze(payload: {
    description: string;
    images?: string[];
    sessionId?: string | null;
  }): Promise<AiReply> {
    try {
      const response = await apiClient.post(
        '/ai/diagnoses',
        {
          description: payload.description,
          images: (payload.images || []).slice(0, AI_MAX_IMAGES),
          sessionId: payload.sessionId || undefined,
        },
        { timeout: AI_REQUEST_TIMEOUT },
      );
      return unwrap<AiReply>(response.data);
    } catch (error) {
      return offline(payload.sessionId, tooFast(error) ? TOO_FAST : undefined);
    }
  },

  /** A question with no photo. */
  async ask(payload: { question: string; sessionId?: string | null }): Promise<AiReply> {
    try {
      const response = await apiClient.post(
        '/ai/chat/ask',
        { question: payload.question, sessionId: payload.sessionId || undefined },
        { timeout: AI_REQUEST_TIMEOUT },
      );
      return unwrap<AiReply>(response.data);
    } catch (error) {
      return offline(payload.sessionId, tooFast(error) ? TOO_FAST : undefined);
    }
  },

  /**
   * Holding lines, grouped by situation - first_photo, first_text, follow_up,
   * price_question - so the wait can sound like it belongs to the message that
   * caused it.
   */
  async acknowledgements(): Promise<AcknowledgementSituations> {
    try {
      const response = await apiClient.get('/ai/chat/acknowledgements');
      return unwrap<AcknowledgementPayload>(response.data)?.situations ?? {};
    } catch {
      return {};
    }
  },
};

/**
 * Whether a message should go to the diagnosis route or the question route.
 *
 * A photo always means diagnosis. Otherwise anything that reads like a report
 * of something wrong goes to diagnosis, and the rest is a question. Getting it
 * wrong is cheap: the diagnosis route recognises questions, greetings and
 * booking intent on its own, so this only avoids a needless round trip.
 */
export function looksLikeAQuestion(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;

  const asksSomething =
    trimmed.includes('?') ||
    /\b(bao nhiêu|bao lâu|thế nào|như thế nào|có được không|được không|là gì|khi nào|ở đâu|tại sao|vì sao|có nên)\b/.test(
      trimmed,
    );
  if (!asksSomething) return false;

  // `nóng` and `lạnh` are deliberately absent: they are parts of appliance
  // names - máy lạnh, tủ lạnh, bình nóng lạnh - not symptoms, and treating
  // them as symptoms sent every air-conditioner price question down the
  // diagnosis path. A real report says "không lạnh", and `không` is here.
  const reportsAFault =
    /(không|hỏng|hư|kêu|rò rỉ|chảy|cháy|rung|lỗi|kẹt|tắc|nghẹt|chập|aptomat|bốc khói|mất điện)/.test(
      trimmed,
    );
  return !reportsAFault;
}
