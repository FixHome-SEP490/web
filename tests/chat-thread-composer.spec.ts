import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';

/**
 * The composer, which is the whole feature.
 *
 * Every conversation on the web showed "Khung trò chuyện đã đóng" instead of a
 * message box, so the chat read as unbuilt. It was one comparison: the thread
 * asked `status === 'ACTIVE'` and the wire carries `"status": "active"`.
 *
 * Mounted for real rather than unit-testing the computed, because the thing
 * that was wrong was what the customer saw.
 */

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { data: [] } }),
  post: vi.fn().mockResolvedValue({ data: { data: {} } }),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../src/api/client', () => ({
  default: apiClientMock,
  registerTokenRefreshed: vi.fn(),
  registerAuthSessionInvalidator: vi.fn(),
  getHttpStatus: vi.fn(),
  AUTH_SESSION_INVALIDATED_EVENT: 'fixhome:auth-session-invalidated',
}));

vi.mock('../src/services/chat-socket.service', () => ({
  default: {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    joinConversation: vi.fn(),
    leaveConversation: vi.fn(),
    sendTyping: vi.fn(),
    updateToken: vi.fn(),
  },
  chatSocketService: {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    joinConversation: vi.fn(),
    leaveConversation: vi.fn(),
    sendTyping: vi.fn(),
    updateToken: vi.fn(),
  },
}));

import ChatThread from '../src/components/chat/ChatThread.vue';
import { useChatStore } from '../src/stores/chat.store';

/** Copied from the running backend, lowercase status and all. */
const liveConversation = {
  id: 'conv-1',
  bookingId: 'booking-1',
  serviceOrderId: null,
  status: 'active',
  serviceName: 'Vệ sinh & nạp gas điều hòa',
  counterpart: {
    id: 'tech-2',
    fullName: 'Tho Dien Lanh 2',
    avatarUrl: null,
    role: 'technician',
  },
  lastMessageAt: null,
  lastMessagePreview: null,
  unreadCount: 0,
  canSend: true,
};

function mountWith(conversation: Record<string, unknown>) {
  const store = useChatStore();
  store.conversations = [conversation] as never;
  store.messages = { 'conv-1': [] } as never;
  return mount(ChatThread, {
    props: { conversationId: 'conv-1' },
    global: { stubs: { ChatMessageItem: true, ChatTypingDots: true } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('the message composer', () => {
  it('is shown for a conversation the backend says is open', () => {
    const wrapper = mountWith(liveConversation);

    expect(wrapper.find('textarea, input[type="text"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Khung trò chuyện đã đóng');
  });

  it('is shown even though the status is lowercase', () => {
    // The exact shape that broke it. Uppercase was never on the wire.
    const wrapper = mountWith({ ...liveConversation, status: 'active' });

    expect(wrapper.text()).not.toContain('Khung trò chuyện đã đóng');
  });

  it('is hidden when the backend says the conversation cannot take messages', () => {
    const wrapper = mountWith({ ...liveConversation, status: 'closed', canSend: false });

    expect(wrapper.text()).toContain('Khung trò chuyện đã đóng');
  });

  it('follows canSend rather than second-guessing it from the status', () => {
    // A participant removed from an otherwise active conversation: the server
    // knows, the client cannot work it out, and must not try.
    const wrapper = mountWith({ ...liveConversation, status: 'active', canSend: false });

    expect(wrapper.text()).toContain('Khung trò chuyện đã đóng');
  });
});
