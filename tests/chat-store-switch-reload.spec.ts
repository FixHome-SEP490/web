import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/messaging.api', () => ({
  isConversationClosedError: () => false,
  messagingApi: {
    listMessages: vi.fn(async (id: string) => ({ data: [{ id: `m-${id}`, conversationId: id, senderId: 'tech', content: 'x', createdAt: '2026-11-18T00:00:00Z' }], nextBefore: null })),
    markAsRead: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    listConversations: vi.fn(async () => ({ data: [] })),
  },
}));
vi.mock('../src/services/chat-socket.service', () => ({
  chatSocketService: { joinConversation: vi.fn(), forgetConversation: vi.fn(), setHandlers: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), sendTyping: vi.fn() },
}));

import { messagingApi } from '../src/api/messaging.api';
import { useChatStore } from '../src/stores/chat.store';

describe('BUG 156: chat store reloads a conversation after switching back', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

  it('reloads messages of a conversation whose room was left while another one was open', async () => {
    const store = useChatStore();
    await store.selectConversation('a');
    await store.selectConversation('b');
    await store.selectConversation('a');
    const calls = vi.mocked(messagingApi.listMessages).mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['a', 'b', 'a']);
  });

  it('does not reload when the open conversation is selected again', async () => {
    const store = useChatStore();
    await store.selectConversation('a');
    await store.selectConversation('a');
    expect(vi.mocked(messagingApi.listMessages)).toHaveBeenCalledTimes(1);
  });
});
