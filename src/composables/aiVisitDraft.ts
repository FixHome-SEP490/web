// src/composables/aiVisitDraft.ts
//
// The appliances the assistant suggested booking together, handed from the
// chat (floating assistant or the AI booking form) to the booking form that
// builds a visit of up to three devices. Kept in memory for one hand-over and
// tied to the conversation it came from, so a stale draft never fills a form
// for another conversation. Nothing is persisted.

import type { AiDeviceSuggestion } from '../api/ai.api';

interface Draft {
  sessionId: string;
  devices: AiDeviceSuggestion[];
}

let draft: Draft | null = null;

export function setAiVisitDraft(sessionId: string, devices: AiDeviceSuggestion[]): void {
  draft = { sessionId, devices: devices.map((device) => ({ ...device })) };
}

/** The draft for this conversation, once; anything else is discarded. */
export function takeAiVisitDraft(sessionId: string | null | undefined): AiDeviceSuggestion[] {
  const found = draft && sessionId && draft.sessionId === sessionId ? draft.devices : [];
  draft = null;
  return found;
}
