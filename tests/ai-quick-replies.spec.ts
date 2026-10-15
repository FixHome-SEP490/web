import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AiConversationThread from '../src/components/chat/AiConversationThread.vue';
import { quickReplies } from '../src/composables/useAiConversation';

describe('quickReplies', () => {
  it('offers yes/no for a "có ... không?" question', () => {
    expect(quickReplies('Cục nóng ngoài trời có chạy không?')).toEqual(['Có', 'Không', 'Không rõ']);
    expect(quickReplies('Thiết bị có hiện tượng kêu to khi vắt không?')).toEqual(['Có', 'Không', 'Không rõ']);
  });

  it('offers done/not yet for a "đã ... chưa?" question', () => {
    expect(quickReplies('Máy đã được vệ sinh chưa?')).toEqual(['Rồi', 'Chưa', 'Không rõ']);
  });

  it('offers nothing for an open question', () => {
    expect(quickReplies('Máy lạnh bắt đầu có hiện tượng này từ khi nào?')).toEqual([]);
    expect(quickReplies('')).toEqual([]);
    expect(quickReplies(undefined)).toEqual([]);
  });
});

function conversationWith(thinking: boolean, extra: Array<Record<string, unknown>> = []) {
  const sendTurn = vi.fn(async () => {});
  const conversation = {
    messages: ref([
      { id: 'u1', sender: 'user', text: 'máy lạnh nhà em bị sao ấy' },
      {
        id: 'b1',
        sender: 'bot',
        text: 'Dạ em cần hỏi thêm một chút để chẩn cho đúng ạ.',
        reply: { status: 'needs_clarification', clarification: { questionsVi: ['Cục nóng ngoài trời có chạy không?'] } },
      },
      ...extra,
    ]),
    input: ref(''),
    pending: ref([]),
    isThinking: ref(thinking),
    problem: ref(''),
    canSend: ref(true),
    needsDescription: ref(false),
    addFiles: vi.fn(),
    removePending: vi.fn(),
    sendTurn,
    send: vi.fn(),
  };
  return { conversation, sendTurn };
}

describe('Quick replies in the thread', () => {
  it('shows the choices under the newest question and sends the one tapped', async () => {
    const { conversation, sendTurn } = conversationWith(false);
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation as never } });
    const buttons = wrapper.find('[data-testid="ai-quick-replies"]').findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['Có', 'Không', 'Không rõ']);
    await buttons[1].trigger('click');
    expect(sendTurn).toHaveBeenCalledWith('Không', []);
  });

  it('hides them while the assistant is answering', () => {
    const { conversation } = conversationWith(true);
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation as never } });
    expect(wrapper.find('[data-testid="ai-quick-replies"]').exists()).toBe(false);
  });

  it('hides them once the customer has replied', () => {
    const { conversation } = conversationWith(false, [{ id: 'u2', sender: 'user', text: 'không' }]);
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation as never } });
    expect(wrapper.find('[data-testid="ai-quick-replies"]').exists()).toBe(false);
  });
});
