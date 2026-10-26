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
  type AiDeviceSuggestion,
  type AiReply,
  type RecommendedService,
} from '../api/ai.api';
import { prepareForAi, shrinkForRetry, type PickedImage } from '../utils/image-for-ai';
import { mediaApi } from '../api/media.api';
import { prepareVideo, VideoPrepError, videoProblemText, VIDEO_SOURCE_MAX_BYTES, VIDEO_TYPES } from '../lib/video-prep';
import { uploadErrorText, uploadWithRetry, UploadCancelledError } from '../lib/upload-retry';

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
 * Catch-all services that must not replace a specific service the conversation
 * already found. Catalogue V2 retired the generic inspection
 * (KIEM_TRA_CHAN_DOAN_THIET_BI): every service is now for one appliance, and the
 * assistant names none rather than a catch-all when the appliance is unknown.
 */
const FALLBACK_SERVICE_CODES = new Set(['DICH_VU_KHAC']);

/** The most appliances one visit takes, and so the most the assistant suggests at once. */
export const AI_VISIT_DEVICE_LIMIT = 3;

/** The appliances of a reply that can be booked now, in the order the assistant gave them. */
export function bookableDevices(reply: AiReply | null | undefined): AiDeviceSuggestion[] {
  return (reply?.devices ?? [])
    .filter((device) => !!device.service?.serviceId)
    .slice(0, AI_VISIT_DEVICE_LIMIT);
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  images?: string[];
  /** Local object URLs of the videos sent with this message; the AI never receives them. */
  videos?: string[];
  /** The attachments of this message, to show how far each is on its way to the technician. */
  attachmentIds?: string[];
  reply?: AiReply;
  isAcknowledgement?: boolean;
}

/**
 * PO 18/10/2026: the customer may send photos and short videos in the chat with
 * the assistant - at most three photos and two videos in the whole conversation.
 * Videos are not analysed; photos and videos go up in the background as soon as
 * they are sent, for the technician to see with the booking, so booking never
 * waits on a weak connection longer than it has to.
 */
export type AttachmentState = 'preparing' | 'ready' | 'uploading' | 'done' | 'failed';

export interface AttachedVideo {
  id: string;
  /** The picked file, previewed in the thread. */
  file: File;
  url: string;
  /** What goes up: converted on the device when the browser can. */
  prepared?: File;
  shrunk?: boolean;
  /** Longer than a minute: only the first minute goes. */
  trimmed?: boolean;
  state: AttachmentState;
  /** 0..1 of the conversion while preparing. */
  progress: number;
}

/** A photo or video sent in the thread, on its way to the technician. */
export interface ChatAttachment {
  id: string;
  kind: 'image' | 'video';
  /** The photo as sent to the assistant. */
  dataUrl?: string;
  video?: AttachedVideo;
  state: AttachmentState;
  /** 0..1 of the upload. */
  progress: number;
  uploadId?: string;
  error?: string;
  /** The connection dropped and it is being sent again. */
  retrying?: boolean;
}

export const AI_MAX_VIDEOS = 2;
/** Photos in the whole conversation (the assistant also takes at most three per message). */
export const AI_CHAT_MAX_IMAGES = 3;
export const AI_VIDEO_TYPES = VIDEO_TYPES;
export const VIDEO_NOT_ANALYSED = 'Video được gửi kèm cho kỹ thuật viên xem, trợ lý AI không xem video.';
export { uploadErrorText };
export const ATTACHMENT_LIMIT_TEXT = `Mỗi cuộc trò chuyện gửi được tối đa ${AI_CHAT_MAX_IMAGES} ảnh và ${AI_MAX_VIDEOS} video.`;

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body = ''] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return new File([bytes], `${name}.${ext}`, { type: mime });
}

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

/**
 * The label under photo `imageIndex` of the customer's message at
 * `messageIndex`: what the assistant read it as, from the first reply after it
 * that reports its photos. PO 26/10/2026: shown so a wrong reading is seen at
 * once and corrected with a tap ("Ảnh 2 là ..."), instead of the customer
 * finding out from a diagnosis of the wrong appliance.
 */
export interface PhotoLabel {
  text: string;
  uncertain: boolean;
  /** What the composer is filled with when the label is tapped. */
  correction: string;
}

export function photoLabel(messages: AiChatMessage[], messageIndex: number, imageIndex: number): PhotoLabel | null {
  const sent = messages[messageIndex];
  if (!sent || sent.sender !== 'user' || !sent.images?.length) return null;
  for (let i = messageIndex + 1; i < messages.length; i++) {
    const message = messages[i];
    if (message.sender === 'user') return null;
    const photos = message.reply?.photos;
    if (!photos?.length) continue;
    const reading = photos.find((photo) => photo.index === imageIndex);
    const correction = sent.images.length > 1 ? `Ảnh ${imageIndex + 1} là ` : 'Ảnh này là ';
    if (!reading?.nameVi) return { text: 'Chưa nhận ra', uncertain: true, correction };
    return { text: reading.uncertain ? `${reading.nameVi}?` : reading.nameVi, uncertain: Boolean(reading.uncertain), correction };
  }
  return null;
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
  /** Videos waiting in the composer (being converted, or ready), sent with the next message. */
  const pendingVideos = ref<AttachedVideo[]>([]);
  /** Photos and videos sent in the thread (not the form's own), going up for the booking. */
  const attachments = ref<ChatAttachment[]>([]);
  /** Cancels a video's conversion or an attachment's upload when it is removed. */
  const controllers = new Map<string, AbortController>();
  const imagesUsed = computed(() => pending.value.length + attachments.value.filter((item) => item.kind === 'image').length);
  const videosUsed = computed(() => pendingVideos.value.length + attachments.value.filter((item) => item.kind === 'video').length);
  /** Where the photos and videos for the technician are: for the booking step to wait on or offer a retry. */
  const uploads = computed(() => {
    const items = attachments.value;
    const busy = items.filter((item) => item.state === 'preparing' || item.state === 'ready' || item.state === 'uploading');
    return {
      total: items.length,
      done: items.filter((item) => item.state === 'done').length,
      failed: items.filter((item) => item.state === 'failed').length,
      busy: busy.length,
      /** Upload progress of what is still on its way, 0..1. */
      progress: busy.length ? busy.reduce((sum, item) => sum + (item.state === 'uploading' ? item.progress : 0), 0) / busy.length : 1,
    };
  });
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

  /**
   * The appliances to book together when the conversation is about more than
   * one (photographed or named), each with its own service. Empty for one
   * appliance. Replaced by every reply that carries the list, kept by a reply
   * that does not (a plain question answered in passing).
   */
  const pinnedDevices = ref<AiDeviceSuggestion[]>([]);

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
    pinnedDevices.value = [];
    lastReply.value = null;
    pending.value = [];
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    for (const video of pendingVideos.value) revokeUrl(video.url);
    for (const item of attachments.value) if (item.video) revokeUrl(item.video.url);
    pendingVideos.value = [];
    attachments.value = [];
    input.value = '';
    turnCount.value = 0;
    problem.value = '';
    messages.value = greetingMessage();
  }

  /** Converts a picked video in the background; a video that cannot go is taken out with the reason. */
  function prepare(video: AttachedVideo) {
    const controller = new AbortController();
    controllers.set(video.id, controller);
    prepareVideo(video.file, { signal: controller.signal, onProgress: (fraction) => { video.progress = fraction; } })
      .then((prepared) => {
        if (controller.signal.aborted) return;
        video.prepared = prepared.file;
        video.shrunk = prepared.shrunk;
        video.trimmed = prepared.trimmed;
        video.state = 'ready';
        video.progress = 1;
        const sent = attachments.value.find((item) => item.video?.id === video.id);
        if (sent && sent.state === 'preparing') sent.state = 'ready';
        void pump();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof VideoPrepError) problem.value = videoProblemText(error.problem);
        dropVideo(video.id);
      })
      .finally(() => {
        if (controllers.get(video.id) === controller) controllers.delete(video.id);
      });
  }

  /** Add picked files: photos wait to be sent to the assistant, videos only travel with the booking (3 photos, 2 videos per conversation). */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const videos = files.filter((file) => (file.type || '').toLowerCase().startsWith('video/'));
    const images = files.filter((file) => !videos.includes(file));
    let videoProblem = '';
    for (const file of videos) {
      if (videosUsed.value >= AI_MAX_VIDEOS) {
        videoProblem = ATTACHMENT_LIMIT_TEXT;
      } else if (!AI_VIDEO_TYPES.includes(file.type.toLowerCase())) {
        videoProblem = videoProblemText('type');
      } else if (file.size > VIDEO_SOURCE_MAX_BYTES) {
        videoProblem = videoProblemText('too_big');
      } else {
        pendingVideos.value = [...pendingVideos.value, { id: nextId(), file, url: objectUrl(file), state: 'preparing', progress: 0 }];
        prepare(pendingVideos.value[pendingVideos.value.length - 1]);
      }
    }
    if (images.length === 0) {
      problem.value = videoProblem;
      return;
    }
    if (imagesUsed.value >= AI_CHAT_MAX_IMAGES) {
      problem.value = ATTACHMENT_LIMIT_TEXT;
      return;
    }
    const room = AI_CHAT_MAX_IMAGES - imagesUsed.value;
    const result = await prepareForAi(images, imagesUsed.value);
    problem.value = result.problemVi || (images.length > room ? ATTACHMENT_LIMIT_TEXT : videoProblem);
    if (result.images.length > 0) {
      pending.value = [...pending.value, ...result.images].slice(0, AI_MAX_IMAGES);
    }
  }

  function removePending(index: number) {
    pending.value = pending.value.filter((_, i) => i !== index);
  }

  /** Takes a video out of the composer and out of what goes with the booking. */
  function dropVideo(id: string) {
    controllers.get(id)?.abort();
    controllers.delete(id);
    const waiting = pendingVideos.value.find((video) => video.id === id);
    if (waiting) {
      revokeUrl(waiting.url);
      pendingVideos.value = pendingVideos.value.filter((video) => video.id !== id);
    }
    const sent = attachments.value.find((item) => item.video?.id === id);
    if (sent) removeAttachment(sent.id);
  }

  function removePendingVideo(index: number) {
    const video = pendingVideos.value[index];
    if (video) dropVideo(video.id);
  }

  /** Leaves a sent photo or video out of the booking; a video also leaves the thread. */
  function removeAttachment(id: string) {
    const item = attachments.value.find((entry) => entry.id === id);
    if (!item) return;
    controllers.get(id)?.abort();
    controllers.delete(id);
    const video = item.video;
    if (video) {
      controllers.get(video.id)?.abort();
      controllers.delete(video.id);
      for (const message of messages.value) {
        if (message.videos?.includes(video.url)) message.videos = message.videos.filter((url) => url !== video.url);
      }
      revokeUrl(video.url);
    }
    attachments.value = attachments.value.filter((entry) => entry.id !== id);
  }

  /** Same as removeAttachment, by the video's own id (kept for the booking step). */
  function removeSentVideo(id: string) {
    const item = attachments.value.find((entry) => entry.video?.id === id || entry.id === id);
    if (item) removeAttachment(item.id);
  }

  let pumping = false;
  /** Sends what is ready, one at a time, so a weak connection is not split between files. */
  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const next = attachments.value.find((item) => item.state === 'ready');
        if (!next) break;
        await uploadOne(next);
      }
    } finally {
      pumping = false;
    }
  }

  async function uploadOne(item: ChatAttachment): Promise<void> {
    item.state = 'uploading';
    item.progress = 0;
    item.error = undefined;
    item.retrying = false;
    const controller = new AbortController();
    controllers.set(item.id, controller);
    const track = {
      signal: controller.signal,
      onProgress: (fraction: number) => { item.progress = Math.max(item.progress, fraction); },
      onRetry: () => { item.retrying = true; },
    };
    try {
      const video = item.video;
      const result = video
        ? await uploadWithRetry(({ onProgress, signal }) => mediaApi.uploadBookingVideo(video.prepared ?? video.file, { onProgress, signal }), track)
        : await uploadWithRetry(({ onProgress, signal }) => mediaApi.uploadBookingPhoto(dataUrlToFile(item.dataUrl ?? '', 'tro-ly'), { onProgress, signal }), track);
      item.uploadId = result.uploadId;
      item.state = 'done';
      item.progress = 1;
    } catch (error) {
      if (error instanceof UploadCancelledError || controller.signal.aborted) return;
      item.state = 'failed';
      item.error = uploadErrorText(error);
    } finally {
      item.retrying = false;
      if (controllers.get(item.id) === controller) controllers.delete(item.id);
    }
  }

  /** Sends a failed photo or video again. */
  function retryUpload(id: string) {
    const item = attachments.value.find((entry) => entry.id === id);
    if (!item || item.state !== 'failed') return;
    item.state = item.video && item.video.state !== 'ready' ? 'preparing' : 'ready';
    item.progress = 0;
    item.error = undefined;
    void pump();
  }

  /** Sends every failed one again (the booking step does this when it opens). */
  function retryFailed() {
    for (const item of attachments.value) if (item.state === 'failed') retryUpload(item.id);
  }

  /** The upload ids of what has reached the server, for the booking. */
  function bookingUploadIds(): string[] {
    return attachments.value.flatMap((item) => (item.state === 'done' && item.uploadId ? [item.uploadId] : []));
  }

  /** The photos and videos that go with the booking, for the confirm step. */
  function bookingAttachments(): { images: string[]; videos: AttachedVideo[] } {
    return {
      images: attachments.value.flatMap((item) => (item.kind === 'image' && item.dataUrl ? [item.dataUrl] : [])),
      videos: attachments.value.flatMap((item) => (item.video ? [item.video] : [])),
    };
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
    // The form's own photos are uploaded by the form; only the chat's go up from here, at once, in the background.
    const sentNow: ChatAttachment[] = [];
    if (opts.keepImagesForBooking !== false) {
      for (const image of images) sentNow.push({ id: nextId(), kind: 'image', dataUrl: image.dataUrl, state: 'ready', progress: 0 });
    }
    for (const video of videos) sentNow.push({ id: nextId(), kind: 'video', video, state: video.state === 'ready' ? 'ready' : 'preparing', progress: 0 });
    if (sentNow.length) {
      attachments.value = [...attachments.value, ...sentNow];
      void pump();
    }

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
      ...(sentNow.length ? { attachmentIds: sentNow.map((item) => item.id) } : {}),
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
    if (Array.isArray(reply.devices)) {
      const devices = bookableDevices(reply);
      pinnedDevices.value = devices.length >= 2 ? devices : [];
    }

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
    attachments,
    imagesUsed,
    videosUsed,
    uploads,
    isThinking,
    turnCount,
    problem,
    sessionId,
    pinnedService,
    pinnedDevices,
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
    removeAttachment,
    retryUpload,
    retryFailed,
    bookingUploadIds,
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
