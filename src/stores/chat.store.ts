// src/stores/chat.store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  messagingApi,
  type ConversationItem,
  type ChatMessage,
} from '../api/messaging.api';
import { chatSocketService, type TypingEvent } from '../services/chat-socket.service';
import { registerTokenRefreshed } from '../api/client';
import { useAuthStore } from './auth.store';

export const useChatStore = defineStore('chat', () => {
  const authStore = useAuthStore();

  // State
  const conversations = ref<ConversationItem[]>([]);
  const activeConversationId = ref<string | null>(null);
  const messages = ref<Record<string, ChatMessage[]>>({});
  const nextBeforeMap = ref<Record<string, string | null>>({});
  const loadingConversations = ref(false);
  const loadingMessages = ref(false);
  const loadingMore = ref(false);
  const isWidgetOpen = ref(false);
  const isSocketConnected = ref(false);
  const isInitialized = ref(false);

  // Typing tracking per conversation
  const typingMap = ref<Record<string, { isTyping: boolean; userName?: string }>>({});
  const typingTimeoutMap = new Map<string, ReturnType<typeof setTimeout>>();

  // Getters
  const totalUnreadCount = computed(() => {
    return conversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  });

  const activeConversation = computed<ConversationItem | null>(() => {
    if (!activeConversationId.value) return null;
    return conversations.value.find((c) => c.id === activeConversationId.value) || null;
  });

  const activeMessages = computed<ChatMessage[]>(() => {
    if (!activeConversationId.value) return [];
    return messages.value[activeConversationId.value] || [];
  });

  const isCounterpartTyping = computed<boolean>(() => {
    if (!activeConversationId.value) return false;
    return typingMap.value[activeConversationId.value]?.isTyping ?? false;
  });

  // Actions
  function initSocket() {
    if (isInitialized.value) return;
    isInitialized.value = true;

    // Hook into token refresh
    registerTokenRefreshed((newToken) => {
      chatSocketService.updateToken(newToken);
    });

    chatSocketService.subscribe({
      onStatusChange(connected) {
        isSocketConnected.value = connected;
      },
      onReconnected() {
        void fetchConversations();
        if (activeConversationId.value) {
          void loadMessages(activeConversationId.value, true);
        }
      },
      onMessageNew(msg: ChatMessage) {
        handleIncomingMessage(msg);
      },
      onMessageUpdated(msg: ChatMessage) {
        handleUpdatedMessage(msg);
      },
      onMessageDeleted(msg: ChatMessage) {
        handleDeletedMessage(msg);
      },
      onConversationUpdated(payload) {
        void handleConversationUpdated(payload.conversationId);
      },
      onTyping(event: TypingEvent) {
        handleTypingEvent(event);
      },
    });

    if (authStore.token) {
      void chatSocketService.connect(authStore.token);
      void fetchConversations();
    }
  }

  function handleIncomingMessage(msg: ChatMessage) {
    const list = messages.value[msg.conversationId] || [];
    const exists = list.some(
      (m) => m.id === msg.id || (m.clientMessageId && m.clientMessageId === msg.clientMessageId),
    );

    if (exists) {
      messages.value[msg.conversationId] = list.map((m) =>
        m.id === msg.id || (m.clientMessageId && m.clientMessageId === msg.clientMessageId)
          ? msg
          : m,
      );
    } else {
      messages.value[msg.conversationId] = [...list, msg];
    }

    // Update conversation metadata
    const conv = conversations.value.find((c) => c.id === msg.conversationId);
    if (conv) {
      conv.lastMessageAt = msg.createdAt;
      conv.lastMessagePreview = msg.isDeleted ? 'Tin nhắn đã được gỡ' : msg.content;

      const isMe = msg.senderId === authStore.user?.id;
      const isActiveScreen = activeConversationId.value === msg.conversationId && isWidgetOpen.value;

      if (!isMe) {
        if (isActiveScreen) {
          void markAsRead(msg.conversationId);
        } else {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
      }

      // Re-order conversations with newest activity first
      conversations.value = [
        conv,
        ...conversations.value.filter((c) => c.id !== msg.conversationId),
      ];
    } else {
      // Unknown conversation, refresh full list
      void fetchConversations();
    }
  }

  function handleUpdatedMessage(msg: ChatMessage) {
    const list = messages.value[msg.conversationId];
    if (list) {
      messages.value[msg.conversationId] = list.map((m) => (m.id === msg.id ? msg : m));
    }
    const conv = conversations.value.find((c) => c.id === msg.conversationId);
    if (conv && conv.lastMessageAt === msg.createdAt) {
      conv.lastMessagePreview = msg.content;
    }
  }

  function handleDeletedMessage(msg: ChatMessage) {
    const list = messages.value[msg.conversationId];
    if (list) {
      messages.value[msg.conversationId] = list.map((m) => (m.id === msg.id ? msg : m));
    }
    const conv = conversations.value.find((c) => c.id === msg.conversationId);
    if (conv && conv.lastMessageAt === msg.createdAt) {
      conv.lastMessagePreview = 'Tin nhắn đã được gỡ';
    }
  }

  async function handleConversationUpdated(conversationId: string) {
    try {
      const updated = await messagingApi.getConversation(conversationId);
      const index = conversations.value.findIndex((c) => c.id === conversationId);
      if (index >= 0) {
        conversations.value[index] = updated;
      } else {
        conversations.value.unshift(updated);
      }
    } catch {
      void fetchConversations();
    }
  }

  function handleTypingEvent(event: TypingEvent) {
    if (event.userId === authStore.user?.id) return;

    typingMap.value[event.conversationId] = {
      isTyping: event.isTyping,
    };

    const existingTimeout = typingTimeoutMap.get(event.conversationId);
    if (existingTimeout) clearTimeout(existingTimeout);

    if (event.isTyping) {
      const timer = setTimeout(() => {
        typingMap.value[event.conversationId] = { isTyping: false };
      }, 3000);
      typingTimeoutMap.set(event.conversationId, timer);
    }
  }

  async function fetchConversations() {
    if (!authStore.isAuthenticated) return;
    try {
      loadingConversations.value = true;
      const data = await messagingApi.listConversations();
      conversations.value = data;
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      loadingConversations.value = false;
    }
  }

  async function selectConversation(conversationId: string) {
    if (activeConversationId.value && activeConversationId.value !== conversationId) {
      chatSocketService.forgetConversation(activeConversationId.value);
    }

    activeConversationId.value = conversationId;
    chatSocketService.joinConversation(conversationId);

    await loadMessages(conversationId);
    await markAsRead(conversationId);
  }

  async function loadMessages(conversationId: string, force = false) {
    if (!force && messages.value[conversationId]?.length) {
      return;
    }

    try {
      loadingMessages.value = true;
      const page = await messagingApi.listMessages(conversationId, { limit: 30 });
      // Backend returns newest page with newest messages; reverse to display chronologically (oldest to newest)
      messages.value[conversationId] = [...page.data].reverse();
      nextBeforeMap.value[conversationId] = page.nextBefore;
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadOlderMessages(conversationId: string) {
    const before = nextBeforeMap.value[conversationId];
    if (!before || loadingMore.value) return;

    try {
      loadingMore.value = true;
      const page = await messagingApi.listMessages(conversationId, { limit: 30, before });
      const older = [...page.data].reverse();
      const existing = messages.value[conversationId] || [];
      messages.value[conversationId] = [...older, ...existing];
      nextBeforeMap.value[conversationId] = page.nextBefore;
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      loadingMore.value = false;
    }
  }

  async function sendMessage(content: string) {
    const convId = activeConversationId.value;
    if (!convId || !content.trim()) return;

    const trimmed = content.trim();
    const clientMessageId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic message
    const optimisticMsg: ChatMessage = {
      id: clientMessageId,
      conversationId: convId,
      senderId: authStore.user?.id || '',
      content: trimmed,
      createdAt: new Date().toISOString(),
      editedAt: null,
      isDeleted: false,
      clientMessageId,
    };

    const currentList = messages.value[convId] || [];
    messages.value[convId] = [...currentList, optimisticMsg];

    // Stop typing indicator immediately when sending
    sendTyping(false);

    try {
      const persisted = await messagingApi.sendMessage(convId, trimmed, clientMessageId);
      // Replace optimistic message with persisted one
      messages.value[convId] = (messages.value[convId] || []).map((m) =>
        m.clientMessageId === clientMessageId ? persisted : m,
      );
      // Update preview in list
      const conv = conversations.value.find((c) => c.id === convId);
      if (conv) {
        conv.lastMessageAt = persisted.createdAt;
        conv.lastMessagePreview = persisted.content;
      }
    } catch (err) {
      // Revert or mark error
      messages.value[convId] = (messages.value[convId] || []).filter(
        (m) => m.clientMessageId !== clientMessageId,
      );
      throw err;
    }
  }

  async function editMessage(messageId: string, content: string) {
    const convId = activeConversationId.value;
    if (!convId || !content.trim()) return;

    const updated = await messagingApi.editMessage(messageId, content.trim());
    handleUpdatedMessage(updated);
  }

  async function deleteMessage(messageId: string) {
    const deleted = await messagingApi.deleteMessage(messageId);
    handleDeletedMessage(deleted);
  }

  async function markAsRead(conversationId: string) {
    const conv = conversations.value.find((c) => c.id === conversationId);
    if (conv && conv.unreadCount > 0) {
      conv.unreadCount = 0;
    }
    try {
      await messagingApi.markRead(conversationId);
    } catch {
      // non-critical
    }
  }

  let typingDebounce: ReturnType<typeof setTimeout> | null = null;
  function sendTyping(isTyping: boolean) {
    const convId = activeConversationId.value;
    if (!convId) return;

    if (typingDebounce) clearTimeout(typingDebounce);

    chatSocketService.sendTyping(convId, isTyping);

    if (isTyping) {
      typingDebounce = setTimeout(() => {
        chatSocketService.sendTyping(convId, false);
      }, 2500);
    }
  }

  async function openConversationForBooking(bookingId: string) {
    if (!conversations.value.length) {
      await fetchConversations();
    }
    const conv = conversations.value.find((c) => c.bookingId === bookingId);
    if (conv) {
      await selectConversation(conv.id);
      isWidgetOpen.value = true;
      return conv;
    }
    return null;
  }

  function toggleWidget(open?: boolean) {
    isWidgetOpen.value = open !== undefined ? open : !isWidgetOpen.value;
    if (isWidgetOpen.value && activeConversationId.value) {
      void markAsRead(activeConversationId.value);
    }
  }

  function closeWidget() {
    isWidgetOpen.value = false;
  }

  return {
    conversations,
    activeConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    loadingMore,
    isWidgetOpen,
    isSocketConnected,
    totalUnreadCount,
    activeConversation,
    activeMessages,
    isCounterpartTyping,
    initSocket,
    fetchConversations,
    selectConversation,
    loadMessages,
    loadOlderMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    sendTyping,
    openConversationForBooking,
    toggleWidget,
    closeWidget,
  };
});
