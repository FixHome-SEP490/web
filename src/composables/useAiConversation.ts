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

/**
 * BRX-064: the assistant only diagnoses from a written description; the
 * backend answers 400 to a photo with no text. Shown under the composer when
 * photos wait without words.
 */
export const DESCRIBE_BEFORE_SEND = 'Mô tả vấn đề trước khi gửi cho trợ lý';

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
  /** Local object URLs of the videos sent with this message; the AI never receives them. */
  videos?: string[];
  reply?: AiReply;
  isAcknowledgement?: boolean;
}

/**
 * PO 18/10/2026: the customer may send a short video in the chat with the
 * assistant. It is not analysed; it is kept, with the photos and the words,
 * and goes with the booking for the technician to watch.
 */
export interface AttachedVideo {
  id: string;
  file: File;
  url: string;
}
export const AI_MAX_VIDEOS = 2;
export const AI_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const AI_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
/** At most this many chat photos go with the booking, besides the ones of the form. */
export const AI_KEPT_IMAGES = 5;
export const VIDEO_NOT_ANALYSED = 'Video được gửi kèm cho kỹ thuật viên xem, trợ lý AI không xem video.';

const objectUrl = (file: File) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '');
const revokeUrl = (url: string) => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

export interface AiConversationOptions {
  /** First assistant line, shown before the customer says anything. */
  greeting?: string;
  /** Session to continue, e.g. the one the floating assistant started. */
  sessionId?: string | null;
  /** Called after the thread grows, so the view can scroll to the end. */
  onUpdate?: () => void;
  /** Test seam for the acknowledgement pause. */
  dwellMs?: number;
  /**
   * Pause between the pieces of a reply as it is written out. Defaults to a
   * short pause in a browser and none where motion is reduced or there is no
   * browser (tests); 0 shows the reply at once.
   */
  revealMs?: number;
}

/** A reply is written out in at most this many steps, so a long one still takes about a second. */
export const REVEAL_STEPS = 40;
const REVEAL_DEFAULT_MS = 28;

function defaultRevealMs(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 0;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : REVEAL_DEFAULT_MS;
}

/**
 * The text as it grows: whole words, at most REVEAL_STEPS pieces, the last one
 * the full text. The reply has already passed every check on the server; this
 * only paces how it appears.
 */
export function revealSteps(text: string): string[] {
  const words = text.split(/(?<=\s)/);
  if (words.length <= 1) return [text];
  const size = Math.max(1, Math.ceil(words.length / REVEAL_STEPS));
  const steps: string[] = [];
  for (let end = size; end < words.length; end += size) steps.push(words.slice(0, end).join('').trimEnd());
  steps.push(text);
  return steps;
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
  /** Videos waiting in the composer, sent with the next message. */
  const pendingVideos = ref<AttachedVideo[]>([]);
  /** Videos already in the thread; they go with the booking. */
  const sentVideos = ref<AttachedVideo[]>([]);
  /** Photos the customer sent in the thread (not the form's own), for the booking. */
  const sentImages = ref<string[]>([]);
  /** True from Send until the reply is fully on screen: nothing to act on before then. */
  const isThinking = ref(false);
  /** The reply is being written out; the typing dots give way to it. */
  const isRevealing = ref(false);
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

  // Photos go along with words, never instead of them (BRX-064).
  const canSend = computed(() => input.value.trim().length > 0 && !isThinking.value);

  /** Photos or videos are waiting but nothing is written yet: say why Send is off. */
  const needsDescription = computed(
    () => (pending.value.length > 0 || pendingVideos.value.length > 0) && input.value.trim().length === 0,
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
    for (const video of [...pendingVideos.value, ...sentVideos.value]) revokeUrl(video.url);
    pendingVideos.value = [];
    sentVideos.value = [];
    sentImages.value = [];
    input.value = '';
    turnCount.value = 0;
    problem.value = '';
    messages.value = greetingMessage();
  }

  /** Add picked files: photos wait to be sent to the assistant (at most three), videos only travel with the booking. */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const videos = files.filter((file) => (file.type || '').toLowerCase().startsWith('video/'));
    const images = files.filter((file) => !videos.includes(file));
    let videoProblem = '';
    for (const file of videos) {
      if (!AI_VIDEO_TYPES.includes(file.type.toLowerCase())) {
        videoProblem = 'Chỉ gửi được video MP4, MOV hoặc WebM.';
      } else if (file.size > AI_VIDEO_MAX_BYTES) {
        videoProblem = 'Video lớn hơn 50 MB, vui lòng quay ngắn hơn.';
      } else if (pendingVideos.value.length + sentVideos.value.length >= AI_MAX_VIDEOS) {
        videoProblem = `Gửi được tối đa ${AI_MAX_VIDEOS} video.`;
      } else {
        pendingVideos.value = [...pendingVideos.value, { id: nextId(), file, url: objectUrl(file) }];
      }
    }
    if (images.length === 0) {
      problem.value = videoProblem;
      return;
    }
    const result = await prepareForAi(images, pending.value.length);
    problem.value = result.problemVi || videoProblem;
    if (result.images.length > 0) {
      pending.value = [...pending.value, ...result.images].slice(0, AI_MAX_IMAGES);
    }
  }

  function removePending(index: number) {
    pending.value = pending.value.filter((_, i) => i !== index);
  }

  function removePendingVideo(index: number) {
    const video = pendingVideos.value[index];
    if (video) revokeUrl(video.url);
    pendingVideos.value = pendingVideos.value.filter((_, i) => i !== index);
  }

  /** Drop a video already in the thread from what goes with the booking. */
  function removeSentVideo(id: string) {
    const video = sentVideos.value.find((item) => item.id === id);
    if (!video) return;
    sentVideos.value = sentVideos.value.filter((item) => item.id !== id);
    for (const message of messages.value) {
      if (message.videos?.includes(video.url)) message.videos = message.videos.filter((url) => url !== video.url);
    }
    revokeUrl(video.url);
  }

  /** What the booking takes from this conversation for the technician: the photos and videos sent in it. */
  function bookingAttachments(): { images: string[]; videos: File[] } {
    return { images: [...sentImages.value], videos: sentVideos.value.map((video) => video.file) };
  }

  /**
   * Send one turn. Text is required; photos ride along with it and always go
   * to the diagnosis route; text that reads
   * like a question goes to the question route; anything else is a
   * description and goes to diagnosis, continuing the same session either way.
   */
  async function sendTurn(
    text: string,
    images: PickedImage[],
    opts: { videos?: AttachedVideo[]; keepImagesForBooking?: boolean } = {},
  ) {
    // A description is required, with or without photos (BRX-064).
    if (!text.trim()) return;
    if (isThinking.value) return;
    const videos = opts.videos ?? [];
    // The form's own photos are uploaded by the form; only the chat's are kept here.
    if (opts.keepImagesForBooking !== false && images.length) {
      sentImages.value = [...sentImages.value, ...images.map((image) => image.dataUrl)].slice(0, AI_KEPT_IMAGES);
    }
    if (videos.length) sentVideos.value = [...sentVideos.value, ...videos];

    const isQuestion = images.length === 0 && looksLikeAQuestion(text);
    const situation =
      images.length > 0
        ? 'first_photo'
        : turnCount.value > 0
          ? 'follow_up'
          : isQuestion
            ? 'general_question'
            : 'first_text';

    messages.value.push({
      id: nextId(),
      sender: 'user',
      text,
      images: images.map((i) => i.dataUrl),
      ...(videos.length ? { videos: videos.map((video) => video.url) } : {}),
    });
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

    const shown = reply.messageVi?.trim() || reply.answerVi?.trim() || composeFromFields(reply);
    const pace = options.revealMs ?? defaultRevealMs();
    const steps = pace > 0 ? revealSteps(shown) : [shown];
    if (steps.length === 1) {
      messages.value.push({ id: nextId(), sender: 'bot', text: shown, reply });
    } else {
      // Written out piece by piece; the details under it (price, services,
      // questions) and every button come only once the whole text is there.
      isRevealing.value = true;
      messages.value.push({ id: nextId(), sender: 'bot', text: '' });
      const live = messages.value[messages.value.length - 1];
      for (const step of steps) {
        // Started over meanwhile: this reply belongs to a conversation that is gone.
        if (!messages.value.includes(live)) break;
        live.text = step;
        updated();
        if (step !== shown) await new Promise((resolve) => setTimeout(resolve, pace));
      }
      live.text = shown;
      live.reply = reply;
      isRevealing.value = false;
    }
    isThinking.value = false;
    updated();
  }

  /** Send what is in the composer. */
  async function send() {
    const text = input.value.trim();
    const images = pending.value;
    const videos = pendingVideos.value;
    if (!text) return;
    input.value = '';
    pending.value = [];
    pendingVideos.value = [];
    problem.value = '';
    await sendTurn(text, images, { videos });
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
    pendingVideos,
    sentVideos,
    sentImages,
    isThinking,
    turnCount,
    problem,
    sessionId,
    pinnedService,
    lastReply,
    isRevealing,
    canSend,
    needsDescription,
    loadHoldingLines,
    startOver,
    addFiles,
    removePending,
    removePendingVideo,
    removeSentVideo,
    bookingAttachments,
    sendTurn,
    send,
    customerWords,
  };
}

export type AiConversation = ReturnType<typeof useAiConversation>;

/**
 * One-tap answers to the question the assistant just asked, or none when the
 * question is not a yes/no one ("bắt đầu từ khi nào?"). A tapped answer cannot
 * be misread, and an older customer does not have to type it. "Không rõ" is
 * an answer too: the assistant moves on instead of waiting for a yes or no.
 */
export function quickReplies(question: string | undefined | null): string[] {
  const q = (question || '').normalize('NFC').trim().toLowerCase();
  if (!q.endsWith('?')) return [];
  const words = q.slice(0, -1).trim().split(/\s+/);
  const last = words[words.length - 1];
  if (last === 'chưa') return ['Rồi', 'Chưa', 'Không rõ'];
  if (last === 'không') return ['Có', 'Không', 'Không rõ'];
  return [];
}

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

export interface BookingRecap {
  device: string | null;
  faults: string[];
  told: string[];
}

// The AI writes its notes about "Khách" for the technician; the customer reads them as their own.
const TOLD_FOR_CUSTOMER: Array<[RegExp, string]> = [
  [/^Khách bác khả năng /, 'Không phải '],
  [/^Khách nghi /, 'Bạn nghi '],
  [/^Khách từng đặt /, 'Bạn từng đặt '],
  [/^Khách có tả /, 'Có '],
  [/^Khách cho biết /, ''],
  [/^Khách /, ''],
];

/**
 * What the technician will be handed, shown to the customer on the confirm
 * step so they see they will not have to tell it all again. Empty when the
 * assistant has not named anything yet.
 */
export function bookingRecap(reply: AiReply | null | undefined): BookingRecap | null {
  if (!reply) return null;
  const device = reply.device?.nameVi?.trim() || null;
  const faults = (reply.suspectedFaults ?? [])
    .map((fault) => fault.nameVi?.trim())
    .filter((name): name is string => !!name)
    .slice(0, 2);
  const told = (reply.notesVi ?? [])
    .map((note) => (note || '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((note) => {
      const rule = TOLD_FOR_CUSTOMER.find(([pattern]) => pattern.test(note));
      const text = rule ? note.replace(rule[0], rule[1]) : note;
      return text.charAt(0).toUpperCase() + text.slice(1);
    });
  if (!device && !faults.length && !told.length) return null;
  return { device, faults, told };
}
