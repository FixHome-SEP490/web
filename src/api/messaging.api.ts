// src/api/messaging.api.ts
import apiClient from './client';

/**
 * Backend TransformInterceptor wraps responses in `{ data }`.
 * When double-nested, peel until the real payload is reached.
 */
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

/**
 * As the backend sends it, which is lowercase.
 *
 * The type used to claim uppercase and nothing checked it, so a comparison
 * against 'ACTIVE' silently failed for every conversation that was open. Both
 * spellings are listed because the value travels from a database enum through
 * two services, and being wrong about it once already closed the whole feature.
 */
export type ConversationStatus =
  | 'active'
  | 'read_only'
  | 'closed'
  | 'ACTIVE'
  | 'READ_ONLY'
  | 'CLOSED';

/** True when this conversation still accepts messages. Case-insensitive. */
export function isConversationOpen(status: ConversationStatus | null | undefined): boolean {
  return String(status ?? '').toUpperCase() === 'ACTIVE';
}

export interface ConversationParticipant {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
}

export interface ConversationItem {
  id: string;
  bookingId: string;
  serviceOrderId: string | null;
  status: ConversationStatus;
  serviceName: string | null;
  counterpart: ConversationParticipant;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  canSend: boolean;
  /**
   * `order_completed`: the order is done, so the chat is closed; a warranty claim
   * opens it again while the claim is in progress (PO 18/10/2026). Older servers send nothing.
   */
  closedReason?: 'order_completed' | null;
}

/** A photo or short video sent in the chat (PO 18/10/2026); the bytes come from getAttachment. */
export interface ChatAttachment {
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number | null;
}

/** What the chat accepts, as the server checks it: photos up to 10 MB, videos up to 50 MB. */
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const CHAT_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Null when the file can go, otherwise what to tell the person. */
export function chatAttachmentProblem(file: Pick<File, 'type' | 'size'>): string | null {
  const type = (file.type || '').toLowerCase();
  if (CHAT_IMAGE_TYPES.includes(type)) return file.size > CHAT_IMAGE_MAX_BYTES ? 'Ảnh lớn hơn 10 MB, vui lòng chọn ảnh nhỏ hơn.' : null;
  if (CHAT_VIDEO_TYPES.includes(type)) return file.size > CHAT_VIDEO_MAX_BYTES ? 'Video lớn hơn 50 MB, vui lòng quay ngắn hơn.' : null;
  return 'Chỉ gửi được ảnh (JPG, PNG, WebP) hoặc video (MP4, MOV, WebM).';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  clientMessageId: string | null;
  /** Sent by FixHome on the sender's behalf, e.g. the technician's greeting on accepting a job. */
  isAutomated?: boolean;
  attachment?: ChatAttachment | null;
  /** Client only: the picked file, shown while it uploads and right after. */
  localPreviewUrl?: string;
}

/** The send was refused because the order completed and no warranty claim is open. */
export function isConversationClosedError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: { code?: string } } } })?.response;
  return response?.status === 409 && response.data?.error?.code === 'CONVERSATION_CLOSED';
}

export interface MessagePage {
  data: ChatMessage[];
  nextBefore: string | null;
}

export const messagingApi = {
  async listConversations(): Promise<ConversationItem[]> {
    const res = await apiClient.get('/conversations');
    return unwrap<ConversationItem[]>(res.data) ?? [];
  },

  async getConversation(id: string): Promise<ConversationItem> {
    const res = await apiClient.get(`/conversations/${id}`);
    return unwrap<ConversationItem>(res.data);
  },

  /** `before` is the keyset cursor (ISO timestamp string) */
  async listMessages(
    conversationId: string,
    params: { limit?: number; before?: string } = {},
  ): Promise<MessagePage> {
    const res = await apiClient.get(`/conversations/${conversationId}/messages`, {
      params,
    });
    const body = res.data as { data?: ChatMessage[]; meta?: { nextBefore?: string | null } };
    return {
      data: body?.data ?? [],
      nextBefore: body?.meta?.nextBefore ?? null,
    };
  },

  async sendMessage(
    conversationId: string,
    content: string,
    clientMessageId?: string,
  ): Promise<ChatMessage> {
    const res = await apiClient.post(`/conversations/${conversationId}/messages`, {
      content,
      ...(clientMessageId ? { clientMessageId } : {}),
    });
    return unwrap<ChatMessage>(res.data);
  },

  /** One photo or video with an optional caption, as multipart. */
  async sendAttachment(
    conversationId: string,
    file: File,
    content?: string,
    clientMessageId?: string,
  ): Promise<ChatMessage> {
    const form = new FormData();
    form.append('file', file);
    if (content?.trim()) form.append('content', content.trim());
    if (clientMessageId) form.append('clientMessageId', clientMessageId);
    const res = await apiClient.post(`/conversations/${conversationId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // A video on a weak connection needs far more than the 15 s default.
      timeout: 180000,
    });
    return unwrap<ChatMessage>(res.data);
  },

  /** The photo or video bytes, through the authenticated proxy (no public link exists). */
  async getAttachment(messageId: string): Promise<Blob> {
    const res = await apiClient.get<Blob>(`/messages/${encodeURIComponent(messageId)}/attachment`, {
      responseType: 'blob',
      timeout: 120000,
    });
    if (!(res.data instanceof Blob)) throw new Error('Unexpected attachment response');
    return res.data;
  },

  async editMessage(messageId: string, content: string): Promise<ChatMessage> {
    const res = await apiClient.patch(`/messages/${messageId}`, { content });
    return unwrap<ChatMessage>(res.data);
  },

  async deleteMessage(messageId: string): Promise<ChatMessage> {
    const res = await apiClient.delete(`/messages/${messageId}`);
    return unwrap<ChatMessage>(res.data);
  },

  async markRead(conversationId: string): Promise<void> {
    await apiClient.post(`/conversations/${conversationId}/read`);
  },
};
