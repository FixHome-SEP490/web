import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

import AiConversationThread from '../src/components/chat/AiConversationThread.vue';

function conversation() {
  return {
    messages: ref([
      { id: 'u1', sender: 'user', text: 'máy lạnh không mát, mới vệ sinh rồi' },
      { id: 'b1', sender: 'bot', text: 'Dạ khả năng cao là thiếu gas ạ.', reply: { status: 'ok', suspectedFaults: [] } },
    ]),
    input: ref(''),
    pending: ref([]),
    isThinking: ref(false),
    problem: ref(''),
    canSend: ref(true),
    needsDescription: ref(false),
    sessionId: ref('sess-1'),
    addFiles: vi.fn(),
    removePending: vi.fn(),
    sendTurn: vi.fn(),
    send: vi.fn(),
  };
}

describe('Feedback on the assistant answer', () => {
  // PO 26/10/2026: a customer who disagrees says so in the conversation and
  // the assistant notices; there is nothing to press.
  it('shows no "Đúng ý / Chưa đúng" buttons under an answer', () => {
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation() as never } });
    expect(wrapper.find('[data-testid="ai-feedback"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Chưa đúng');
    expect(wrapper.text()).not.toContain('Đúng ý');
  });
});

describe('Too many messages', () => {
  it('says so in words instead of claiming the assistant is unreachable', async () => {
    vi.resetModules();
    vi.doMock('../src/api/client', () => ({ default: { post: vi.fn(async () => { throw { response: { status: 429 } }; }) } }));
    const { aiApi } = await vi.importActual<typeof import('../src/api/ai.api')>('../src/api/ai.api');
    const reply = await aiApi.ask({ question: 'máy lạnh không mát' });
    expect(reply.status).toBe('unavailable');
    expect(reply.answerVi).toContain('nhắn hơi nhanh');
    vi.doUnmock('../src/api/client');
  });
});
