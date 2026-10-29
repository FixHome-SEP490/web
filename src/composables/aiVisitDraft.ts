// src/composables/aiVisitDraft.ts
//
// The appliances the assistant suggested booking together, handed from the
// chat (floating assistant or the AI booking form) to the booking form that
// builds a visit of up to three devices. Kept in memory for one hand-over and
// tied to the conversation it came from, so a stale draft never fills a form
// for another conversation. Nothing is persisted.

import type { AiDeviceSuggestion } from '../api/ai.api';
import type { AiChatMessage, ChatAttachment } from './useAiConversation';

/** A photo already uploaded in the chat, shown from the copy the chat holds. */
export interface AiVisitPhoto {
  uploadId: string;
  previewUrl: string;
}

export interface AiVisitDevice extends AiDeviceSuggestion {
  /** The photos the assistant read as this appliance, so they need not be picked again. */
  photos?: AiVisitPhoto[];
}

interface Draft {
  sessionId: string;
  devices: AiVisitDevice[];
}

let draft: Draft | null = null;

export function setAiVisitDraft(sessionId: string, devices: AiVisitDevice[]): void {
  draft = {
    sessionId,
    devices: devices.map((device) => ({ ...device, photos: device.photos?.map((photo) => ({ ...photo })) })),
  };
}

/** The draft for this conversation, once; anything else is discarded. */
export function takeAiVisitDraft(sessionId: string | null | undefined): AiVisitDevice[] {
  const found = draft && sessionId && draft.sessionId === sessionId ? draft.devices : [];
  draft = null;
  return found;
}

/**
 * Each uploaded photo of the conversation under the appliance the assistant
 * read it as (the label the customer saw under it), so every machine of the
 * visit takes its own photos. A photo the assistant did not recognise, or one
 * not uploaded yet, stays with no appliance. `formUploadIds` are the upload ids
 * of the photos a booking form sent with the first message, in order; the
 * chat's own photos carry theirs.
 */
export function photosByAppliance(
  messages: AiChatMessage[],
  attachments: ChatAttachment[],
  formUploadIds: Array<string | null> = [],
): Map<string, AiVisitPhoto[]> {
  const found = new Map<string, AiVisitPhoto[]>();
  const firstUser = messages.findIndex((message) => message.sender === 'user');
  messages.forEach((sent, messageIndex) => {
    if (sent.sender !== 'user' || !sent.images?.length) return;
    const ids = sent.attachmentIds
      ? sent.attachmentIds.flatMap((id) => {
        const item = attachments.find((entry) => entry.id === id);
        return item?.kind === 'image' ? [item.state === 'done' ? item.uploadId ?? null : null] : [];
      })
      : messageIndex === firstUser ? formUploadIds : [];
    const reply = messages.slice(messageIndex + 1).find((message) => message.sender === 'user' || message.reply?.photos?.length);
    const readings = reply?.sender === 'bot' ? reply.reply?.photos ?? [] : [];
    sent.images.forEach((previewUrl, imageIndex) => {
      const uploadId = ids[imageIndex];
      const deviceType = readings.find((reading) => reading.index === imageIndex)?.deviceType;
      if (!uploadId || !deviceType) return;
      found.set(deviceType, [...(found.get(deviceType) ?? []), { uploadId, previewUrl }]);
    });
  });
  return found;
}
