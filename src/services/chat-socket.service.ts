// src/services/chat-socket.service.ts
import { io, Socket } from 'socket.io-client';
import type { ChatMessage } from '../api/messaging.api';

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

/** Why a call stopped. Mirrors CallEndReason in the backend. */
export type CallEndReason =
  | 'rejected'
  | 'cancelled'
  | 'ended'
  | 'timeout'
  | 'disconnected'
  | 'busy';

export interface IncomingCallEvent {
  callId: string;
  conversationId: string;
  fromUserId: string;
}

export interface CallAcceptedEvent {
  callId: string;
  conversationId: string;
}

export interface CallEndedEvent {
  callId: string;
  conversationId: string;
  reason: CallEndReason;
}

export interface CallSignalEvent<T> {
  callId: string;
  data: T;
}

export interface CallInviteResult {
  ok: boolean;
  callId?: string;
  reason?: 'invalid' | 'forbidden' | 'busy';
}

export interface ChatSocketHandlers {
  onMessageNew?: (message: ChatMessage) => void;
  onMessageUpdated?: (message: ChatMessage) => void;
  onMessageDeleted?: (message: ChatMessage) => void;
  onConversationUpdated?: (payload: { conversationId: string }) => void;
  onTyping?: (event: TypingEvent) => void;
  onStatusChange?: (connected: boolean) => void;
  onReconnected?: () => void;
  onCallIncoming?: (event: IncomingCallEvent) => void;
  onCallAccepted?: (event: CallAcceptedEvent) => void;
  onCallEnded?: (event: CallEndedEvent) => void;
  onCallOffer?: (event: CallSignalEvent<RTCSessionDescriptionInit>) => void;
  onCallAnswer?: (event: CallSignalEvent<RTCSessionDescriptionInit>) => void;
  onCallIce?: (event: CallSignalEvent<RTCIceCandidateInit>) => void;
}

/** How long to wait for the server to acknowledge a call request. */
const ACK_TIMEOUT_MS = 8000;

function socketOrigin(): string {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
  return base.replace(/\/api\/v\d+\/?$/, '');
}

class ChatSocketService {
  private socket: Socket | null = null;
  private handlers = new Set<ChatSocketHandlers>();
  private connecting: Promise<void> | null = null;
  private joined = new Set<string>();
  private hasConnectedOnce = false;
  /**
   * Handed over by the server on connect:ready. Empty is a valid answer — two
   * peers on one Wi-Fi network reach each other without any STUN server.
   */
  private ice: RTCIceServer[] = [];

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get iceServers(): RTCIceServer[] {
    return this.ice;
  }

  subscribe(handlers: ChatSocketHandlers): () => void {
    this.handlers.add(handlers);
    return () => {
      this.handlers.delete(handlers);
    };
  }

  private emitToHandlers<K extends keyof ChatSocketHandlers>(
    key: K,
    ...args: Parameters<NonNullable<ChatSocketHandlers[K]>>
  ): void {
    this.handlers.forEach((handler) => {
      const fn = handler[key] as ((...a: unknown[]) => void) | undefined;
      fn?.(...(args as unknown[]));
    });
  }

  async connect(explicitToken?: string): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve) => {
      const token = explicitToken || localStorage.getItem('access_token');
      if (!token) {
        resolve();
        return;
      }

      this.socket?.removeAllListeners();
      this.socket?.disconnect();

      const socket = io(`${socketOrigin()}/chat`, {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });
      this.socket = socket;

      socket.on('connect', () => {
        this.emitToHandlers('onStatusChange', true);
        this.joined.forEach((id) =>
          socket.emit('conversation:join', { conversationId: id }),
        );
        if (this.hasConnectedOnce) {
          this.emitToHandlers('onReconnected');
        }
        this.hasConnectedOnce = true;
        resolve();
      });

      socket.on('disconnect', () => {
        this.emitToHandlers('onStatusChange', false);
      });

      socket.on('connect_error', () => {
        this.emitToHandlers('onStatusChange', false);
        resolve();
      });

      socket.on('message:new', (m: ChatMessage) => this.emitToHandlers('onMessageNew', m));
      socket.on('message:updated', (m: ChatMessage) =>
        this.emitToHandlers('onMessageUpdated', m),
      );
      socket.on('message:deleted', (m: ChatMessage) =>
        this.emitToHandlers('onMessageDeleted', m),
      );
      socket.on('conversation:updated', (p: { conversationId: string }) =>
        this.emitToHandlers('onConversationUpdated', p),
      );
      socket.on('typing', (e: TypingEvent) => this.emitToHandlers('onTyping', e));

      socket.on(
        'connect:ready',
        (payload: { iceServers?: RTCIceServer[] }) => {
          this.ice = payload?.iceServers ?? [];
        },
      );

      // Call signalling. The server addresses every one of these from the call
      // it stored, so anything arriving here is genuinely for this account.
      socket.on('call:incoming', (e: IncomingCallEvent) =>
        this.emitToHandlers('onCallIncoming', e),
      );
      socket.on('call:accepted', (e: CallAcceptedEvent) =>
        this.emitToHandlers('onCallAccepted', e),
      );
      socket.on('call:ended', (e: CallEndedEvent) =>
        this.emitToHandlers('onCallEnded', e),
      );
      socket.on('call:offer', (e: CallSignalEvent<RTCSessionDescriptionInit>) =>
        this.emitToHandlers('onCallOffer', e),
      );
      socket.on('call:answer', (e: CallSignalEvent<RTCSessionDescriptionInit>) =>
        this.emitToHandlers('onCallAnswer', e),
      );
      socket.on('call:ice', (e: CallSignalEvent<RTCIceCandidateInit>) =>
        this.emitToHandlers('onCallIce', e),
      );
    });

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  joinConversation(conversationId: string): void {
    this.joined.add(conversationId);
    this.socket?.emit('conversation:join', { conversationId });
  }

  forgetConversation(conversationId: string): void {
    this.joined.delete(conversationId);
    this.socket?.emit('conversation:leave', { conversationId });
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.socket?.emit('typing', { conversationId, isTyping });
  }

  // --------------------------------------------------------- voice signalling

  /**
   * Ask the server to ring the other participant.
   *
   * Only a conversation id is sent: the server works out who that means. The
   * promise resolves rather than rejects on failure so the caller can show the
   * right Vietnamese message for a busy line versus a closed conversation.
   */
  callInvite(conversationId: string): Promise<CallInviteResult> {
    return this.emitWithAck<CallInviteResult>('call:invite', { conversationId });
  }

  callAccept(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:accept', { callId });
  }

  callReject(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:reject', { callId });
  }

  callCancel(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:cancel', { callId });
  }

  callEnd(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:end', { callId });
  }

  sendOffer(callId: string, data: RTCSessionDescriptionInit): void {
    this.socket?.emit('call:offer', { callId, data });
  }

  sendAnswer(callId: string, data: RTCSessionDescriptionInit): void {
    this.socket?.emit('call:answer', { callId, data });
  }

  sendIceCandidate(callId: string, data: RTCIceCandidateInit): void {
    this.socket?.emit('call:ice', { callId, data });
  }

  /**
   * A hang-up that never comes back would leave the caller stuck on a ringing
   * screen, so every acknowledgement is bounded.
   */
  private emitWithAck<T extends { ok: boolean }>(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false } as T);
    }
    return new Promise<T>((resolve) => {
      let settled = false;
      const done = (value: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => done({ ok: false } as T), ACK_TIMEOUT_MS);
      socket.emit(event, payload, (ack: T) => done(ack ?? ({ ok: false } as T)));
    });
  }

  updateToken(token: string): void {
    if (this.socket) {
      this.socket.auth = { token };
      if (this.socket.connected) {
        // Socket.IO updates auth for next auto-reconnect
      } else {
        void this.connect(token);
      }
    }
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined.clear();
    this.hasConnectedOnce = false;
    this.ice = [];
  }
}

export const chatSocketService = new ChatSocketService();
