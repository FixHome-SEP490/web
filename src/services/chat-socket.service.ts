// src/services/chat-socket.service.ts
import { io, Socket } from 'socket.io-client';
import apiClient from '../api/client';
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
  | 'busy'
  /** Picked up on another of this person's devices. */
  | 'answered_elsewhere';

export interface IncomingCallEvent {
  callId: string;
  conversationId: string;
  fromUserId: string;
}

export interface CallAcceptedEvent {
  callId: string;
  conversationId: string;
}

/** The callee's device is showing the call. */
export type CallRingingEvent = CallAcceptedEvent;

/** Someone tried to call you while you were on another call. */
export interface CallMissedEvent {
  conversationId: string;
  fromUserId: string;
  reason: 'busy';
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
  reason?: 'invalid' | 'forbidden' | 'busy' | 'self_busy' | 'offline';
}

/**
 * What part of an order changed, so a screen reads only that again
 * (PO 18/10/2026: live updates, not reloading).
 */
export type OrderChangeKind =
  | 'order' | 'status' | 'invoice' | 'quotation' | 'additional_cost' | 'cash'
  | 'evidence' | 'arrival' | 'part' | 'warranty' | 'assignment';

/** An order changed on the server, after the write committed. */
export interface OrderUpdatedEvent {
  serviceOrderId: string;
  bookingId: string;
  status: string;
  /** Missing from an older server: treat as "anything may have changed". */
  kinds?: OrderChangeKind[];
  at?: string;
}

/** The technician moved while on the way; only the customer gets it. */
export interface OrderLocationEvent {
  serviceOrderId: string;
  lat: number;
  lng: number;
  updatedAt: string | null;
}

/** A booking changed (taken, closed, invitations moved on). */
export interface BookingUpdatedEvent {
  bookingId: string;
  status: string;
  serviceOrderId: string | null;
}

/** One of my invitations changed (new, accepted, expired, cancelled). */
export interface InvitationUpdatedEvent {
  invitationId: string;
  bookingId: string;
  status: string;
}

/** A new notification of mine, in the shape the list shows. */
export interface NotificationNewEvent {
  id: string;
  title: string;
  message: string;
  type: string;
  referenceId: string | null;
  referenceType: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ChatSocketHandlers {
  onOrderUpdated?: (event: OrderUpdatedEvent) => void;
  onOrderLocation?: (event: OrderLocationEvent) => void;
  onBookingUpdated?: (event: BookingUpdatedEvent) => void;
  onInvitationUpdated?: (event: InvitationUpdatedEvent) => void;
  onNotificationNew?: (event: NotificationNewEvent) => void;
  onWalletUpdated?: (event: { scope: 'technician' | 'customer' }) => void;
  /** The server missed changes while reconnecting to its database: read open screens once. */
  onRealtimeResync?: () => void;
  onMessageNew?: (message: ChatMessage) => void;
  onMessageUpdated?: (message: ChatMessage) => void;
  onMessageDeleted?: (message: ChatMessage) => void;
  onConversationUpdated?: (payload: { conversationId: string }) => void;
  onTyping?: (event: TypingEvent) => void;
  onStatusChange?: (connected: boolean) => void;
  onReconnected?: () => void;
  onCallIncoming?: (event: IncomingCallEvent) => void;
  onCallRinging?: (event: CallRingingEvent) => void;
  onCallAccepted?: (event: CallAcceptedEvent) => void;
  onCallMissed?: (event: CallMissedEvent) => void;
  onCallEnded?: (event: CallEndedEvent) => void;
  onCallOffer?: (event: CallSignalEvent<RTCSessionDescriptionInit>) => void;
  onCallAnswer?: (event: CallSignalEvent<RTCSessionDescriptionInit>) => void;
  onCallIce?: (event: CallSignalEvent<RTCIceCandidateInit>) => void;
}

/** How long to wait for the server to acknowledge a call request. */
const ACK_TIMEOUT_MS = 8000;

/**
 * A socket the server turned away (an expired token after a restart or a long
 * sleep) is not retried by Socket.IO on its own. We refresh the session and try
 * again, a few times, a little later each time.
 */
const AUTH_RETRY_DELAYS_MS = [500, 2000, 5000, 10000, 20000];

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
  private authRetries = 0;
  private recovering = false;
  private watchingPage = false;
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

      this.watchPage();
      const socket = io(`${socketOrigin()}/chat`, {
        transports: ['websocket', 'polling'],
        // Read on every (re)connect, so a reconnect after the token was
        // refreshed does not present the old, expired one.
        auth: (cb) => cb({ token: localStorage.getItem('access_token') || token }),
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

      socket.on('disconnect', (reason) => {
        this.emitToHandlers('onStatusChange', false);
        // The server hung up on us (it does so for an expired token); Socket.IO
        // will not come back by itself in that case.
        if (reason === 'io server disconnect') void this.recoverSession();
      });

      socket.on('connect:error', () => {
        void this.recoverSession();
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
      socket.on('order:updated', (e: OrderUpdatedEvent) => this.emitToHandlers('onOrderUpdated', e));
      socket.on('order:location', (e: OrderLocationEvent) => this.emitToHandlers('onOrderLocation', e));
      socket.on('booking:updated', (e: BookingUpdatedEvent) => this.emitToHandlers('onBookingUpdated', e));
      socket.on('invitation:updated', (e: InvitationUpdatedEvent) => this.emitToHandlers('onInvitationUpdated', e));
      socket.on('notification:new', (e: NotificationNewEvent) => this.emitToHandlers('onNotificationNew', e));
      socket.on('wallet:updated', (e: { scope: 'technician' | 'customer' }) => this.emitToHandlers('onWalletUpdated', e));
      socket.on('realtime:resync', () => this.emitToHandlers('onRealtimeResync'));

      socket.on(
        'connect:ready',
        (payload: { iceServers?: RTCIceServer[] }) => {
          this.ice = payload?.iceServers ?? [];
          this.authRetries = 0;
        },
      );

      // Call signalling. The server addresses every one of these from the call
      // it stored, so anything arriving here is genuinely for this account.
      socket.on('call:incoming', (e: IncomingCallEvent) =>
        this.emitToHandlers('onCallIncoming', e),
      );
      socket.on('call:ringing', (e: CallRingingEvent) =>
        this.emitToHandlers('onCallRinging', e),
      );
      socket.on('call:accepted', (e: CallAcceptedEvent) =>
        this.emitToHandlers('onCallAccepted', e),
      );
      socket.on('call:missed', (e: CallMissedEvent) =>
        this.emitToHandlers('onCallMissed', e),
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

  /** Tell the caller this device is showing their call, so they hear it ring. */
  callRinging(callId: string): void {
    this.socket?.emit('call:ringing', { callId });
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
    // The auth callback reads the stored token on every attempt; a dropped
    // socket only needs to try again now that there is a fresh one.
    if (this.socket && !this.socket.connected && token) this.socket.connect();
  }

  /**
   * Refresh the session (any authenticated request does: the API client trades
   * the refresh token on a 401) and reconnect. Bounded, so a signed-out user or
   * a revoked session stops trying.
   */
  private async recoverSession(): Promise<void> {
    if (this.recovering || !this.socket) return;
    if (this.authRetries >= AUTH_RETRY_DELAYS_MS.length || !localStorage.getItem('refresh_token')) return;
    this.recovering = true;
    const delay = AUTH_RETRY_DELAYS_MS[this.authRetries];
    this.authRetries += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await apiClient.get('/me').catch(() => undefined);
      if (this.socket && !this.socket.connected && localStorage.getItem('access_token')) this.socket.connect();
    } finally {
      this.recovering = false;
    }
  }

  /** Back online, or back to the tab after a sleep: reconnect if the socket dropped meanwhile. */
  private watchPage(): void {
    if (this.watchingPage || typeof window === 'undefined') return;
    this.watchingPage = true;
    const revive = () => {
      if (this.socket && !this.socket.connected && localStorage.getItem('access_token')) {
        this.authRetries = 0;
        this.socket.connect();
      }
    };
    window.addEventListener('online', revive);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revive();
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    // A connect still waiting would otherwise be handed back to the next
    // connect() (a sign-in after a sign-out) and no new socket would be made.
    this.connecting = null;
    this.joined.clear();
    this.hasConnectedOnce = false;
    this.ice = [];
    this.authRetries = 0;
  }
}

export const chatSocketService = new ChatSocketService();
