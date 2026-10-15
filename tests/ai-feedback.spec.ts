import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

const { feedback } = vi.hoisted(() => ({ feedback: vi.fn(async () => true) }));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...original, aiApi: { ...original.aiApi, feedback } };
});

import AiConversationThread from '../src/components/chat/AiConversationThread.vue';

function conversation(opts: { thinking?: boolean; sessionId?: string | null } = {}) {
  return {
    messages: ref([
      { id: 'u1', sender: 'user', text: 'máy lạnh không mát, mới vệ sinh rồi' },
      { id: 'b1', sender: 'bot', text: 'Dạ khả năng cao là thiếu gas ạ.', reply: { status: 'ok', suspectedFaults: [] } },
    ]),
    input: ref(''),
    pending: ref([]),
    isThinking: ref(opts.thinking ?? false),
    problem: ref(''),
    canSend: ref(true),
    needsDescription: ref(false),
    sessionId: ref(opts.sessionId === undefined ? 'sess-1' : opts.sessionId),
    addFiles: vi.fn(),
    removePending: vi.fn(),
    sendTurn: vi.fn(),
    send: vi.fn(),
  };
}

describe('Feedback on the assistant answer', () => {
  beforeEach(() => feedback.mockClear());

  it('asks under the newest answer and thanks after "Đúng ý"', async () => {
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation() as never } });
    await wrapper.find('[data-testid="ai-feedback-right"]').trigger('click');
    expect(feedback).toHaveBeenCalledWith({ sessionId: 'sess-1', verdict: 'right', note: undefined, reply: 'Dạ khả năng cao là thiếu gas ạ.' });
    expect(wrapper.find('[data-testid="ai-feedback-thanks"]').exists()).toBe(true);
  });

  it('takes an optional note with "Chưa đúng"', async () => {
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation() as never } });
    await wrapper.find('[data-testid="ai-feedback-wrong"]').trigger('click');
    await wrapper.find('[data-testid="ai-feedback-note"]').setValue('em đã nói vệ sinh rồi');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(feedback).toHaveBeenCalledWith({ sessionId: 'sess-1', verdict: 'wrong', note: 'em đã nói vệ sinh rồi', reply: 'Dạ khả năng cao là thiếu gas ạ.' });
    expect(wrapper.find('[data-testid="ai-feedback-thanks"]').exists()).toBe(true);
  });

  it('does not ask while the assistant is answering or before there is a conversation', () => {
    expect(mount(AiConversationThread, { props: { conversation: conversation({ thinking: true }) as never } })
      .find('[data-testid="ai-feedback"]').exists()).toBe(false);
    expect(mount(AiConversationThread, { props: { conversation: conversation({ sessionId: null }) as never } })
      .find('[data-testid="ai-feedback"]').exists()).toBe(false);
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
