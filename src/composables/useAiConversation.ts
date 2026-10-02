// src/composables/useAiConversation.ts
//
// One conversation with the FixHome assistant: the thread, the photos waiting
// to be sent, the session the AI Service remembers, and the service it is
// currently suggesting. Used by the floating assistant and by the diagnosis
// step of the booking form, so both talk to the AI the same way: the customer
// can answer what the assistant asks back, ask something else, add photos or
// ask for a different service, turn after turn, before booking.
//
// Nothing is persisted here. The backend keeps a summary per session for the
// booking that may follow.

import { computed, ref } from 'vue';
import {
  aiApi,
  looksLikeAQuestion,
  AI_MAX_IMAGES,
  type AiReply,
  type RecommendedService,
} from '../api/ai.api';
import { prepareForAi, shrinkForRetry, type PickedImage } from '../utils/image-for-ai';

/** The assistant's first line, before the customer says anything. */
export const ASSISTANT_GREETING =
  'Dạ em chào anh/chị, em là trợ lý của FixHome ạ. Anh/chị đang gặp vấn đề gì ở ' +
  'nhà mình thì kể em nghe, hoặc gửi em tấm ảnh thiết bị để em xem giúp nhé.';

/** The service drops a session after an hour of silence. Told, not discovered. */
export const SESSION_IDLE_MINUTES = 60;

/**
 * How long the acknowledgement stays alone before the answer can land. The
 * model often replies in under a second, and an answer arriving while the
 * customer is still reading "em đang xem ạ" reads like neither was meant.
 */
const ACKNOWLEDGEMENT_DWELL_MS = 900;

/**
 * Catch-all services the assistant falls back to when a turn names no fault -
 * a price question, a thank-you. They must not replace a specific service the
 * conversation already found ("Sửa điều hòa không mát" -> "Kiểm tra/chẩn đoán").
 */
const FALLBACK_SERVICE_CODES = new Set(['KIEM_TRA_CHAN_DOAN_THIET_BI', 'DICH_VU_KHAC']);

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  images?: string[];
  reply?: AiReply;
  isAcknowledgement?: boolean;
}

export interface AiConversationOptions {
  /** First assistant line, shown before the customer says anything. */
  greeting?: string;
  /** Session to continue, e.g. the one the floating assistant started. */
  sessionId?: string | null;
  /** Called after the thread grows, so the view can scroll to the end. */
  onUpdate?: () => void;
  /** Test seam for the acknowledgement pause. */
  dwellMs?: number;
}

let messageCounter = 0;
const nextId = () => `m${Date.now()}_${messageCounter++}`;

/** A sentence built from the structured fields, for the branches with no prose. */
export function composeFromFields(reply: AiReply): string {
  const questions = reply.clarification?.questionsVi || [];
  if (questions.length > 0) return 'Dạ em cần hỏi thêm một chút để chẩn cho đúng ạ.';
  const faults = reply.suspectedFaults || [];
  if (faults.length > 0) {
    return `Dạ em xem rồi ạ, khả năng là ${faults[0].nameVi.toLowerCase()}.`;
  }
  if (reply.device) {
    return `Dạ em thấy đây là ${reply.device.nameVi.toLowerCase()} ạ. Anh/chị kể thêm hiện tượng giúp em nhé.`;
  }
  return 'Dạ anh/chị mô tả thêm giúp em một chút để em xem cho đúng ạ.';
}

function money(value: number) {
  return `${value.toLocaleString('vi-VN')}đ`;
}

export function priceLabel(reply: AiReply): string | null {
  const price = reply.priceEstimate;
  if (!price) return null;
  if (price.max && price.max > price.min) return `${money(price.min)} – ${money(price.max)}`;
  return `Từ ${money(price.min)}`;
}

export function useAiConversation(options: AiConversationOptions = {}) {
  const greetingMessage = (): AiChatMessage[] =>
    options.greeting ? [{ id: nextId(), sender: 'bot', text: options.greeting }] : [];

  const messages = ref<AiChatMessage[]>(greetingMessage());
  const input = ref('');
  const pending = ref<PickedImage[]>([]);
  const isThinking = ref(false);
  const turnCount = ref(0);
  const problem = ref('');

  /** Server-issued, never invented here: the field accepts any string, so two
   *  clients that both made one up would share a conversation. */
  const sessionId = ref<string | null>(options.sessionId ?? null);

  /**
   * The service the customer is currently about to order. Replaced - never
   * appended to - so asking to switch changes what gets booked instead of
   * leaving two contradictory suggestions.
   */
  const pinnedService = ref<RecommendedService | null>(null);

  /** The most recent real answer (not a holding line), for summaries. */
  const lastReply = ref<AiReply | null>(null);

  const holdingLines = ref<Record<string, string[]>>({});

  const canSend = computed(
    () => (input.value.trim().length > 0 || pending.value.length > 0) && !isThinking.value,
  );

  const updated = () => options.onUpdate?.();

  async function loadHoldingLines() {
    if (Object.keys(holdingLines.value).length === 0) {
      holdingLines.value = await aiApi.acknowledgements();
    }
  }

  function holdingLineFor(situation: string): string {
    const group = holdingLines.value[situation] || holdingLines.value.first_text || [];
    if (group.length === 0) return 'Dạ em nhận được rồi ạ, anh/chị chờ em xem một chút nhé.';
    return group[Math.floor(Math.random() * group.length)];
  }

  function startOver() {
    sessionId.value = null;
    pinnedService.value = null;
    lastReply.value = null;
    pending.value = [];
    input.value = '';
    turnCount.value = 0;
    problem.value = '';
    messages.value = greetingMessage();
  }

  /** Add picked files to the photos waiting to be sent (at most three). */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const result = await prepareForAi(files, pending.value.length);
    problem.value = result.problemVi || '';
    if (result.images.length > 0) {
      pending.value = [...pending.value, ...result.images].slice(0, AI_MAX_IMAGES);
    }
  }

  function removePending(index: number) {
    pending.value = pending.value.filter((_, i) => i !== index);
  }

  /**
   * Send one turn. Photos always go to the diagnosis route; text that reads
   * like a question goes to the question route; anything else is a
   * description and goes to diagnosis, continuing the same session either way.
   */
  async function sendTurn(text: string, images: PickedImage[]) {
    if (!text && images.length === 0) return;
    if (isThinking.value) return;

    const isQuestion = images.length === 0 && looksLikeAQuestion(text);
    const situation =
      images.length > 0
        ? 'first_photo'
        : turnCount.value > 0
          ? 'follow_up'
          : isQuestion
            ? 'general_question'
            : 'first_text';

    messages.value.push({ id: nextId(), sender: 'user', text, images: images.map((i) => i.dataUrl) });
    messages.value.push({ id: nextId(), sender: 'bot', text: holdingLineFor(situation), isAcknowledgement: true });
    isThinking.value = true;
    updated();

    const ask = (payload: string[]) =>
      isQuestion
        ? aiApi.ask({ question: text, sessionId: sessionId.value })
        : aiApi.analyze({ description: text, images: payload, sessionId: sessionId.value });

    const [firstTry] = await Promise.all([
      ask(images.map((i) => i.dataUrl)),
      new Promise((resolve) => setTimeout(resolve, options.dwellMs ?? ACKNOWLEDGEMENT_DWELL_MS)),
    ]);

    // A send that fails with photographs attached is usually the photographs. On
    // a weak connection the request never completes and the customer is told the
    // assistant is unreachable when the assistant is fine. One retry at roughly
    // a tenth of the bytes turns that into an answer.
    let reply = firstTry;
    if (reply.status === 'unavailable' && images.length > 0) {
      messages.value.push({
        id: nextId(),
        sender: 'bot',
        text: 'Mạng hơi yếu nên ảnh chưa gửi được, em thử lại với ảnh nhẹ hơn nhé...',
        isAcknowledgement: true,
      });
      updated();
      const smaller = await shrinkForRetry(images);
      if (smaller.length > 0) reply = await ask(smaller);
    }

    if (reply.sessionId) sessionId.value = reply.sessionId;
    turnCount.value += 1;
    lastReply.value = reply;

    const offered = reply.recommendedServices?.[0];
    const current = pinnedService.value;
    const keepsSpecific =
      !!current && !FALLBACK_SERVICE_CODES.has(current.serviceCode) && FALLBACK_SERVICE_CODES.has(offered?.serviceCode ?? '');
    if (offered && !keepsSpecific) pinnedService.value = offered;

    messages.value.push({
      id: nextId(),
      sender: 'bot',
      text: reply.messageVi?.trim() || reply.answerVi?.trim() || composeFromFields(reply),
      reply,
    });
    isThinking.value = false;
    updated();
  }

  /** Send what is in the composer. */
  async function send() {
    const text = input.value.trim();
    const images = pending.value;
    if (!text && images.length === 0) return;
    input.value = '';
    pending.value = [];
    problem.value = '';
    await sendTurn(text, images);
  }

  /** What the customer typed, oldest first, for the booking description. */
  function customerWords(): string {
    return messages.value
      .filter((m) => m.sender === 'user' && m.text.trim())
      .map((m) => m.text.trim())
      .join('. ')
      .slice(0, 1000);
  }

  return {
    messages,
    input,
    pending,
    isThinking,
    turnCount,
    problem,
    sessionId,
    pinnedService,
    lastReply,
    canSend,
    loadHoldingLines,
    startOver,
    addFiles,
    removePending,
    sendTurn,
    send,
    customerWords,
  };
}

export type AiConversation = ReturnType<typeof useAiConversation>;

let shared: AiConversation | null = null;

/**
 * The floating assistant's conversation, one per page load. The booking form
 * reuses it when the customer arrives from the assistant ("Đặt thợ"), so step 3
 * shows what was already said and carries on, instead of starting a second
 * conversation and repeating the customer's words to the assistant.
 */
export function useSharedAiConversation(): AiConversation {
  shared ??= useAiConversation({ greeting: ASSISTANT_GREETING });
  return shared;
}

/** Test seam: forget the shared conversation. */
export function resetSharedAiConversation() {
  shared = null;
}
