import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// PO 18/10/2026: the chat with the assistant takes videos, which the AI never
// sees; they are kept with the photos and the words for the technician.
const { analyze, ask, acknowledgements } = vi.hoisted(() => ({ analyze: vi.fn(), ask: vi.fn(), acknowledgements: vi.fn() }));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask, acknowledgements, feedback: vi.fn() } };
});
vi.mock('../src/utils/image-for-ai', () => ({
  prepareForAi: vi.fn(async (files: File[]) => ({ images: files.map((f) => ({ dataUrl: `data:image/jpeg;base64,${btoa(f.name)}`, bytes: 1 })) })),
  shrinkForRetry: vi.fn(async (images: { dataUrl: string }[]) => images.map((i) => i.dataUrl)),
}));

import { AI_MAX_VIDEOS, VIDEO_NOT_ANALYSED, useAiConversation } from '../src/composables/useAiConversation';
import AiConversationThread from '../src/components/chat/AiConversationThread.vue';

const reply = { sessionId: 'sess-1', status: 'ok', aiAvailable: true, messageVi: 'Dạ em xem rồi ạ.', suspectedFaults: [], recommendedServices: [], suggestedActionsVi: [], priceEstimate: null };
const file = (name: string, type: string, size = 1024) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

beforeEach(() => {
  analyze.mockReset().mockResolvedValue(reply);
  ask.mockReset().mockResolvedValue(reply);
  acknowledgements.mockReset().mockResolvedValue({});
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:v${n++}`), revokeObjectURL: vi.fn() }));
});

describe('videos in the chat with the assistant', () => {
  it('keeps the video out of the AI request but in the thread and in what goes with the booking', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.addFiles([file('may-giat.mp4', 'video/mp4'), file('anh.jpg', 'image/jpeg')]);
    expect(c.pendingVideos.value).toHaveLength(1);
    expect(c.pending.value).toHaveLength(1);
    // Words are still needed to send (BRX-064), whatever is attached.
    expect(c.canSend.value).toBe(false);
    expect(c.needsDescription.value).toBe(true);

    c.input.value = 'Máy giặt rung mạnh khi vắt';
    await c.send();
    expect(analyze).toHaveBeenCalledTimes(1);
    const payload = analyze.mock.calls[0][0];
    expect(payload.images).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(/blob:|mp4|video/i);
    const sent = c.messages.value.find((m) => m.sender === 'user')!;
    expect(sent.videos).toEqual(['blob:v0']);
    expect(c.pendingVideos.value).toHaveLength(0);
    const attachments = c.bookingAttachments();
    expect(attachments.videos.map((v) => v.name)).toEqual(['may-giat.mp4']);
    expect(attachments.images).toHaveLength(1);
  });

  it('refuses a third video, a video over 50 MB and an unknown format, saying why', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.addFiles([file('a.mp4', 'video/mp4'), file('b.mov', 'video/quicktime'), file('c.webm', 'video/webm')]);
    expect(c.pendingVideos.value).toHaveLength(AI_MAX_VIDEOS);
    expect(c.problem.value).toBe('Gửi được tối đa 2 video.');
    c.removePendingVideo(0);
    await c.addFiles([file('big.mp4', 'video/mp4', 50 * 1024 * 1024 + 1)]);
    expect(c.problem.value).toContain('50 MB');
    await c.addFiles([file('x.avi', 'video/x-msvideo')]);
    expect(c.problem.value).toContain('MP4, MOV hoặc WebM');
    expect(c.pendingVideos.value).toHaveLength(1);
  });

  it('does not keep the form photos it opens with, and forgets everything on start over', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.sendTurn('Tủ lạnh không lạnh', [{ dataUrl: 'data:image/jpeg;base64,AAAA', bytes: 1 } as never], { keepImagesForBooking: false });
    expect(c.bookingAttachments()).toEqual({ images: [], videos: [] });
    await c.addFiles([file('t.mp4', 'video/mp4')]);
    c.input.value = 'Ngăn đá vẫn đông';
    await c.send();
    expect(c.bookingAttachments().videos).toHaveLength(1);
    c.removeSentVideo(c.sentVideos.value[0].id);
    expect(c.bookingAttachments().videos).toHaveLength(0);
    expect(c.messages.value.find((m) => m.videos)?.videos).toEqual([]);
    c.startOver();
    expect(c.sentVideos.value).toEqual([]);
    expect(c.sentImages.value).toEqual([]);
  });

  it('shows the video in the thread with a note that the AI does not watch it', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    const wrapper = mount(AiConversationThread, { props: { conversation: c } });
    expect(wrapper.get('[data-testid="ai-file-input"]').attributes('accept')).toContain('video/mp4');
    await c.addFiles([file('clip.mp4', 'video/mp4')]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ai-pending-video"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('1/2 video');
    expect(wrapper.text()).toContain(VIDEO_NOT_ANALYSED);
    c.input.value = 'Vòi rỉ nước';
    await c.send();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="ai-message-videos"] video').attributes('src')).toBe('blob:v0');
    expect(wrapper.get('[data-testid="ai-video-note"]').text()).toBe(VIDEO_NOT_ANALYSED);
  });
});
