// src/services/chat-socket.service.ts
import { io, Socket } from 'socket.io-client';
import type { ChatMessage } from '../api/messaging.api';

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ChatSocketHandlers {
  onMessageNew?: (message: ChatMessage) => void;
  onMessageUpdated?: (message: ChatMessage) => void;
  onMessageDeleted?: (message: ChatMessage) => void;
  onConversationUpdated?: (payload: { conversationId: string }) => void;
  onTyping?: (event: TypingEvent) => void;
  onStatusChange?: (connected: boolean) => void;
  onReconnected?: () => void;
}

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

  get connected(): boolean {
    return this.socket?.connected ?? false;
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
  }
}

export const chatSocketService = new ChatSocketService();
