import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AiConversationThread from '../src/components/chat/AiConversationThread.vue';
import { photoLabel, type AiChatMessage } from '../src/composables/useAiConversation';

// PO 26/10/2026: each photo the customer sent is labelled with what the
// assistant read it as, so a wrong reading is seen at once and corrected
// with a tap ("Ảnh 2 là ..."), not found out from the wrong diagnosis.

const sent: AiChatMessage = {
  id: 'u1',
  sender: 'user',
  text: 'máy lạnh nhà em không mát',
  images: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB', 'data:image/jpeg;base64,CCC'],
};
const replied: AiChatMessage = {
  id: 'b1',
  sender: 'bot',
  text: 'Dạ, máy lạnh nhà mình có thể thiếu gas ạ.',
  reply: {
    sessionId: 's1',
    status: 'ok',
    photos: [
      { index: 0, deviceType: 'air_conditioner', nameVi: 'Máy lạnh', uncertain: false },
      { index: 1, deviceType: 'washing_machine', nameVi: 'Máy giặt', uncertain: true },
      { index: 2, deviceType: null, nameVi: null, uncertain: false },
    ],
  },
};

describe('photoLabel', () => {
  it('names each photo from the reply after it, a guess with a question mark', () => {
    const messages = [sent, replied];
    expect(photoLabel(messages, 0, 0)).toEqual({ text: 'Máy lạnh', uncertain: false, correction: 'Ảnh 1 là ' });
    expect(photoLabel(messages, 0, 1)).toEqual({ text: 'Máy giặt?', uncertain: true, correction: 'Ảnh 2 là ' });
    expect(photoLabel(messages, 0, 2)).toEqual({ text: 'Chưa nhận ra', uncertain: true, correction: 'Ảnh 3 là ' });
  });

  it('says nothing before the reply, and for a reply that reports no photos', () => {
    expect(photoLabel([sent], 0, 0)).toBeNull();
    const plain: AiChatMessage = { id: 'b0', sender: 'bot', text: 'Dạ em xem ạ', isAcknowledgement: true };
    expect(photoLabel([sent, plain], 0, 0)).toBeNull();
    expect(photoLabel([sent, plain, replied], 0, 1)?.text).toBe('Máy giặt?');
  });

  it('never borrows the reply to a later message', () => {
    const later: AiChatMessage = { id: 'u2', sender: 'user', text: 'còn máy giặt thì sao' };
    expect(photoLabel([sent, later, replied], 0, 0)).toBeNull();
  });

  it('asks about "this photo" when only one was sent', () => {
    const one: AiChatMessage = { ...sent, images: ['data:image/jpeg;base64,AAA'] };
    const reply: AiChatMessage = { ...replied, reply: { sessionId: 's1', status: 'ok', photos: [{ index: 0, nameVi: 'Tủ lạnh', uncertain: true }] } };
    expect(photoLabel([one, reply], 0, 0)?.correction).toBe('Ảnh này là ');
  });
});

describe('Photo labels in the thread', () => {
  it('shows a label under each photo and fills the composer when one is tapped', async () => {
    const conversation = {
      messages: ref([sent, replied]),
      input: ref(''),
      pending: ref([]),
      isThinking: ref(false),
      problem: ref(''),
      canSend: ref(true),
      needsDescription: ref(false),
      addFiles: vi.fn(),
      removePending: vi.fn(),
      sendTurn: vi.fn(async () => {}),
      send: vi.fn(),
    };
    const wrapper = mount(AiConversationThread, { props: { conversation: conversation as never }, attachTo: document.body });
    const labels = wrapper.findAll('[data-testid="ai-photo-label"]');
    expect(labels.map((l) => l.text())).toEqual(['Máy lạnh', 'Máy giặt?', 'Chưa nhận ra']);
    await labels[1].trigger('click');
    expect(conversation.input.value).toBe('Ảnh 2 là ');
    wrapper.unmount();
  });
});
