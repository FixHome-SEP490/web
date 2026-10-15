import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

// "Đặt thợ" belongs to an answer the assistant has finished giving. While a
// follow-up is being worked on the pinned service may be about to change, so
// the card waits until the reply is back.
const { conversation } = vi.hoisted(() => ({ conversation: {} as Record<string, unknown> }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/app', meta: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ isAiPanelOpen: true, isWidgetOpen: false, toggleAiPanel: vi.fn() }) }));
vi.mock('../src/composables/useAiConversation', () => ({
  SESSION_IDLE_MINUTES: 60,
  useSharedAiConversation: () => conversation,
}));

import AiAssistantWidget from '../src/components/chat/AiAssistantWidget.vue';

function setUp(thinking: boolean) {
  Object.assign(conversation, {
    turnCount: ref(1),
    pinnedService: ref({ serviceCode: 'SUA_DIEU_HOA', nameVi: 'Sửa điều hòa', serviceId: 's1' }),
    sessionId: ref('abc'),
    isThinking: ref(thinking),
    startOver: vi.fn(),
    loadHoldingLines: vi.fn(),
    customerWords: () => 'máy lạnh không mát',
  });
  return mount(AiAssistantWidget, {
    global: { stubs: { AiConversationThread: { template: '<div><slot name="pinned" /></div>' }, transition: false } },
  });
}

describe('Booking button in the assistant', () => {
  it('shows once the reply is back', () => {
    expect(setUp(false).find('[data-testid="ai-book-technician"]').exists()).toBe(true);
  });

  it('hides while the assistant is still answering a follow-up', () => {
    expect(setUp(true).find('[data-testid="ai-book-technician"]').exists()).toBe(false);
  });

  it('comes back when the answer arrives', async () => {
    const wrapper = setUp(true);
    (conversation.isThinking as { value: boolean }).value = false;
    await nextTick();
    expect(wrapper.find('[data-testid="ai-book-technician"]').exists()).toBe(true);
  });
});
