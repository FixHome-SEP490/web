import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AiConversationThread from '../src/components/chat/AiConversationThread.vue';
import { useAiConversation } from '../src/composables/useAiConversation';

afterEach(() => vi.unstubAllGlobals());

async function openThread() {
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const conversation = useAiConversation({ revealMs: 0, greeting: 'Bạn cần hỗ trợ gì?' });
  const wrapper = mount(AiConversationThread, {
    props: { conversation }, slots: { pinned: '<button>Đặt lịch sửa chữa</button>' },
  });
  const thread = wrapper.get('[data-testid="ai-thread"]');
  const element = thread.element as HTMLElement;
  let height = 1400;
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { configurable: true, value: 400 },
  });
  await flushPromises();
  return { conversation, wrapper, thread, element, disconnect, grow: () => { height += 500; resize(); } };
}

describe('AI thread reading position (booking and floating assistant)', () => {
  it('opens at the latest message, follows nearby growth and keeps the pinned action', async () => {
    const { wrapper, thread, element, grow } = await openThread();
    expect(element.scrollTop).toBe(1400);
    element.scrollTop = 930; // 70px from the bottom
    await thread.trigger('scroll');
    grow();
    await flushPromises();
    expect(element.scrollTop).toBe(1900);
    expect(wrapper.find('[data-testid="ai-jump-latest"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đặt lịch sửa chữa');
    expect(thread.classes()).toContain('overscroll-contain');
    expect(wrapper.get('[data-testid="ai-input"]').classes()).toContain('text-base');
    expect(wrapper.get('[data-testid="ai-input"]').attributes('aria-label')).toBe('Nhắn cho trợ lý AI');
    expect(wrapper.get('[data-testid="ai-input"]').element.parentElement?.className).toContain('safe-area-inset-bottom');
    wrapper.unmount();
  });

  it('preserves a reader scrolling up during long streamed text and media growth, then jumps on request', async () => {
    const { conversation, wrapper, thread, element, grow, disconnect } = await openThread();
    element.scrollTop = 200;
    await thread.trigger('scroll');
    conversation.messages.value.push({ id: 'answer', sender: 'bot', text: 'Nội dung dài. '.repeat(200) });
    await flushPromises();
    conversation.messages.value.at(-1)!.text += 'Kết thúc câu trả lời.';
    grow();
    await flushPromises();
    expect(element.scrollTop).toBe(200);
    expect(thread.text()).toContain('Kết thúc câu trả lời.');
    const jump = wrapper.get('[data-testid="ai-jump-latest"]');
    expect(jump.attributes('type')).toBe('button');
    expect(jump.text()).toContain('Tin nhắn mới nhất');
    await jump.trigger('click');
    await flushPromises();
    expect(element.scrollTop).toBe(1900);
    expect(wrapper.find('[data-testid="ai-jump-latest"]').exists()).toBe(false);
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('resumes following when the reader returns near the bottom', async () => {
    const { wrapper, thread, element, grow } = await openThread();
    element.scrollTop = 100;
    await thread.trigger('scroll');
    element.scrollTop = 990;
    await thread.trigger('scroll');
    grow();
    await flushPromises();
    expect(element.scrollTop).toBe(1900);
    wrapper.unmount();
  });

  it('follows a newly sent user turn even when an acknowledgement arrives in the same tick', async () => {
    const { conversation, wrapper, thread, element } = await openThread();
    element.scrollTop = 100;
    await thread.trigger('scroll');
    conversation.messages.value.push(
      { id: 'user-new', sender: 'user', text: 'Tôi muốn hỏi thêm' },
      { id: 'ack', sender: 'bot', text: 'Đang xem', isAcknowledgement: true },
    );
    await flushPromises();
    expect(element.scrollTop).toBe(1400);
    wrapper.unmount();
  });

  it('handles a reset while reading older messages', async () => {
    const { conversation, wrapper, thread, element } = await openThread();
    element.scrollTop = 100;
    await thread.trigger('scroll');
    conversation.startOver();
    await flushPromises();
    expect(element.scrollTop).toBe(1400);
    expect(wrapper.find('[data-testid="ai-jump-latest"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
