import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

// The reply is written out a few words at a time, the way a person types, and
// nothing under it can be acted on until the whole text is there (PO
// 16/10/2026: "Đặt thợ" only after the full message is on screen).
const { analyze, ask, acknowledgements } = vi.hoisted(() => ({ analyze: vi.fn(), ask: vi.fn(), acknowledgements: vi.fn() }));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask, acknowledgements } };
});

import { REVEAL_STEPS, revealSteps, useAiConversation } from '../src/composables/useAiConversation';
import AiConversationThread from '../src/components/chat/AiConversationThread.vue';

const ANSWER = 'Dạ với những gì anh/chị kể, khả năng cao là thiếu gas, xì gas. Anh/chị đặt dịch vụ "Sửa điều hòa" để thợ kiểm tra tận nơi giúp em ạ.';
const reply = {
  sessionId: 'sess-1', status: 'ok', aiAvailable: true, messageVi: ANSWER,
  suspectedFaults: [{ faultCode: 'GAS', nameVi: 'Thiếu gas' }],
  recommendedServices: [{ serviceCode: 'A', nameVi: 'Sửa điều hòa', serviceId: 'svc-ac' }],
  suggestedActionsVi: [], priceEstimate: null,
};

describe('revealSteps', () => {
  it('grows by whole words and ends on the exact text', () => {
    const steps = revealSteps(ANSWER);
    expect(steps.at(-1)).toBe(ANSWER);
    for (let i = 1; i < steps.length; i++) expect(steps[i].startsWith(steps[i - 1])).toBe(true);
    for (const step of steps.slice(0, -1)) expect(ANSWER.startsWith(step + ' ') || ANSWER.startsWith(step + '\n')).toBe(true);
  });

  it('takes at most a fixed number of steps however long the reply', () => {
    expect(revealSteps('chữ '.repeat(2000).trim()).length).toBeLessThanOrEqual(REVEAL_STEPS);
    expect(revealSteps('Dạ.')).toEqual(['Dạ.']);
    expect(revealSteps('')).toEqual(['']);
  });
});

describe('a reply written out', () => {
  beforeEach(() => {
    analyze.mockReset().mockResolvedValue(reply);
    ask.mockReset().mockResolvedValue(reply);
    acknowledgements.mockReset().mockResolvedValue({});
  });

  it('keeps the conversation busy until the whole text is shown, then attaches the details', async () => {
    vi.useFakeTimers();
    try {
      const c = useAiConversation({ dwellMs: 0, revealMs: 20 });
      const sending = c.sendTurn('máy lạnh không mát', []);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(20);
      const live = c.messages.value.at(-1)!;
      expect(c.isRevealing.value).toBe(true);
      expect(c.isThinking.value).toBe(true);
      expect(live.text.length).toBeGreaterThan(0);
      expect(live.text.length).toBeLessThan(ANSWER.length);
      expect(live.reply).toBeUndefined();
      await vi.runAllTimersAsync();
      await sending;
      expect(c.messages.value.at(-1)!.text).toBe(ANSWER);
      expect(c.messages.value.at(-1)!.reply?.messageVi).toBe(ANSWER);
      expect(c.isRevealing.value).toBe(false);
      expect(c.isThinking.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes it out by default in a browser, and not where motion is reduced', async () => {
    const original = window.matchMedia;
    try {
      window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
      vi.useFakeTimers();
      const c = useAiConversation({ dwellMs: 0 });
      const sending = c.sendTurn('máy lạnh không mát', []);
      await vi.advanceTimersByTimeAsync(30);
      expect(c.isRevealing.value).toBe(true);
      await vi.runAllTimersAsync();
      await sending;
      vi.useRealTimers();
      window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as typeof window.matchMedia;
      const calm = useAiConversation({ dwellMs: 0 });
      await calm.sendTurn('máy lạnh không mát', []);
      expect(calm.messages.value.at(-1)!.text).toBe(ANSWER);
    } finally {
      vi.useRealTimers();
      window.matchMedia = original;
    }
  });

  it('shows the reply at once when the pace is 0', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.sendTurn('máy lạnh không mát', []);
    expect(c.messages.value.at(-1)!.text).toBe(ANSWER);
    expect(c.isRevealing.value).toBe(false);
  });

  it('stops writing into a conversation the customer started over', async () => {
    vi.useFakeTimers();
    try {
      const c = useAiConversation({ dwellMs: 0, revealMs: 20 });
      const sending = c.sendTurn('máy lạnh không mát', []);
      await vi.advanceTimersByTimeAsync(40);
      c.startOver();
      await vi.runAllTimersAsync();
      await sending;
      expect(c.messages.value.some((m) => m.text.includes('thiếu gas'))).toBe(false);
      expect(c.isThinking.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the typing dots once the text starts appearing', async () => {
    vi.useFakeTimers();
    try {
      const c = useAiConversation({ dwellMs: 0, revealMs: 20 });
      const wrapper = mount(AiConversationThread, { props: { conversation: c } });
      const sending = c.sendTurn('máy lạnh không mát', []);
      await nextTick();
      const dots = () => wrapper.findComponent({ name: 'ChatTypingDots' }).exists();
      expect(dots()).toBe(true);
      await vi.advanceTimersByTimeAsync(20);
      await nextTick();
      expect(dots()).toBe(false);
      await vi.runAllTimersAsync();
      await sending;
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
