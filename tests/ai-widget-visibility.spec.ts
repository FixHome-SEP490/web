import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// The booking form talks to the assistant itself, so the floating assistant
// stays out of its way there and shows everywhere else.
const { route } = vi.hoisted(() => ({ route: { path: '/app', meta: {} as Record<string, unknown> } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/stores/chat.store', () => ({ useChatStore: () => ({ isAiPanelOpen: false, isWidgetOpen: false, toggleAiPanel: vi.fn() }) }));
vi.mock('../src/api/ai.api', async (importOriginal) => ({ ...(await importOriginal<object>()), aiApi: { acknowledgements: vi.fn(async () => ({})) } }));

import AiAssistantWidget from '../src/components/chat/AiAssistantWidget.vue';

describe('Floating assistant visibility', () => {
  it('shows its button on ordinary pages', () => {
    route.path = '/app'; route.meta = {};
    expect(mount(AiAssistantWidget).find('button[aria-label="Hỏi trợ lý AI"]').exists()).toBe(true);
  });

  it('stays hidden on the booking form, which has its own conversation', () => {
    route.path = '/app/bookings/new'; route.meta = { hidesAssistant: true };
    expect(mount(AiAssistantWidget).find('button').exists()).toBe(false);
  });
});
