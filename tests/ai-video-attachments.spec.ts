import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// PO 18/10/2026: the chat with the assistant takes at most three photos and two
// videos; the AI never sees the videos. What is sent goes up to the server at
// once, in the background, for the technician, and says how far it is.
const { analyze, ask, acknowledgements, uploadBookingPhoto, uploadBookingVideo, prepareVideo } = vi.hoisted(() => ({
  analyze: vi.fn(), ask: vi.fn(), acknowledgements: vi.fn(),
  uploadBookingPhoto: vi.fn(), uploadBookingVideo: vi.fn(), prepareVideo: vi.fn(),
}));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask, acknowledgements, feedback: vi.fn() } };
});
vi.mock('../src/utils/image-for-ai', () => ({
  prepareForAi: vi.fn(async (files: File[], already: number) => ({
    images: files.slice(0, Math.max(0, 3 - already)).map((f) => ({ file: f, dataUrl: `data:image/jpeg;base64,${btoa(f.name)}` })),
  })),
  shrinkForRetry: vi.fn(async (images: { dataUrl: string }[]) => images.map((i) => i.dataUrl)),
}));
vi.mock('../src/api/media.api', () => ({ mediaApi: { uploadBookingPhoto, uploadBookingVideo } }));
vi.mock('../src/lib/video-prep', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/video-prep')>();
  return { ...actual, prepareVideo };
});
// One attempt per upload here; retrying is tested on its own (upload-retry.spec.ts).
vi.mock('../src/lib/upload-retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/upload-retry')>();
  return {
    ...actual,
    uploadWithRetry: (send: (a: { onProgress: (f: number) => void; signal: AbortSignal }) => Promise<unknown>, opts: { onProgress?: (f: number) => void; signal?: AbortSignal }) =>
      send({ onProgress: opts.onProgress ?? (() => undefined), signal: opts.signal ?? new AbortController().signal }),
  };
});

import { ATTACHMENT_LIMIT_TEXT, AI_MAX_VIDEOS, VIDEO_NOT_ANALYSED, useAiConversation } from '../src/composables/useAiConversation';
import { VideoPrepError } from '../src/lib/video-prep';
import AiConversationThread from '../src/components/chat/AiConversationThread.vue';

const reply = { sessionId: 'sess-1', status: 'ok', aiAvailable: true, messageVi: 'Dạ em xem rồi ạ.', suspectedFaults: [], recommendedServices: [], suggestedActionsVi: [], priceEstimate: null };
const file = (name: string, type: string, size = 1024) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const small = new File(['small'], 'may-giat.mp4', { type: 'video/mp4' });

beforeEach(() => {
  analyze.mockReset().mockResolvedValue(reply);
  ask.mockReset().mockResolvedValue(reply);
  acknowledgements.mockReset().mockResolvedValue({});
  uploadBookingPhoto.mockReset().mockResolvedValue({ uploadId: 'up-photo', mimeType: 'image/jpeg', sizeBytes: 3 });
  uploadBookingVideo.mockReset().mockResolvedValue({ uploadId: 'up-video', mimeType: 'video/mp4', sizeBytes: 5 });
  prepareVideo.mockReset().mockResolvedValue({ file: small, shrunk: true, trimmed: false });
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:v${n++}`), revokeObjectURL: vi.fn() }));
});

async function sendWith(c: ReturnType<typeof useAiConversation>, text: string, files: File[]) {
  await c.addFiles(files);
  await flushPromises();
  c.input.value = text;
  await c.send();
  await flushPromises();
}

describe('photos and videos in the chat with the assistant', () => {
  it('keeps the video away from the AI and sends the photo and the converted video up at once, one after the other', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.addFiles([file('may-giat.mov', 'video/quicktime', 80 * 1024 * 1024), file('anh.jpg', 'image/jpeg')]);
    expect(c.pendingVideos.value).toHaveLength(1);
    // Words are still needed to send (BRX-064), whatever is attached.
    expect(c.canSend.value).toBe(false);
    expect(c.needsDescription.value).toBe(true);
    await flushPromises();
    expect(c.pendingVideos.value[0].state).toBe('ready');

    c.input.value = 'Máy giặt rung mạnh khi vắt';
    await c.send();
    await flushPromises();
    const payload = analyze.mock.calls[0][0];
    expect(payload.images).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(/blob:|mp4|mov|video/i);
    const sent = c.messages.value.find((m) => m.sender === 'user')!;
    expect(sent.videos).toEqual(['blob:v0']);
    expect(sent.attachmentIds).toHaveLength(2);
    // The converted file goes up, not the 80 MB original.
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect((uploadBookingPhoto.mock.calls[0][0] as File).type).toBe('image/jpeg');
    expect(uploadBookingVideo.mock.calls[0][0]).toMatchObject({ name: 'may-giat.mp4', size: small.size, type: 'video/mp4' });
    expect(c.attachments.value.map((a) => a.state)).toEqual(['done', 'done']);
    expect(c.bookingUploadIds()).toEqual(['up-photo', 'up-video']);
    expect(c.uploads.value).toMatchObject({ total: 2, done: 2, failed: 0, busy: 0 });
  });

  it('allows three photos and two videos in the whole conversation, saying so', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await sendWith(c, 'Tủ lạnh chảy nước', [file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')]);
    await c.addFiles([file('c.jpg', 'image/jpeg'), file('d.jpg', 'image/jpeg')]);
    expect(c.pending.value).toHaveLength(1);
    expect(c.problem.value).toBe(ATTACHMENT_LIMIT_TEXT);
    expect(c.imagesUsed.value).toBe(3);
    await c.addFiles([file('e.jpg', 'image/jpeg')]);
    expect(c.pending.value).toHaveLength(1);

    await c.addFiles([file('v1.mp4', 'video/mp4'), file('v2.mov', 'video/quicktime'), file('v3.webm', 'video/webm')]);
    expect(c.pendingVideos.value).toHaveLength(AI_MAX_VIDEOS);
    expect(c.videosUsed.value).toBe(2);
    expect(c.problem.value).toBe(ATTACHMENT_LIMIT_TEXT);
    expect(ATTACHMENT_LIMIT_TEXT).toBe('Mỗi cuộc trò chuyện gửi được tối đa 3 ảnh và 2 video.');
  });

  it('refuses an unknown format and takes out a clip that cannot go, with the reason', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.addFiles([file('x.avi', 'video/x-msvideo')]);
    expect(c.problem.value).toContain('MP4, MOV hoặc WebM');
    await c.addFiles([file('huge.mov', 'video/quicktime', 700 * 1024 * 1024)]);
    expect(c.problem.value).toContain('50 MB');
    prepareVideo.mockRejectedValueOnce(new VideoPrepError('too_long'));
    await c.addFiles([file('long.mp4', 'video/mp4')]);
    expect(c.pendingVideos.value).toHaveLength(1);
    await flushPromises();
    expect(c.pendingVideos.value).toHaveLength(0);
    expect(c.problem.value).toContain('dài hơn 60 giây');
  });

  it('says why an upload failed, sends it again on request, and stops one that is removed', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    uploadBookingVideo.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { response: undefined }));
    await sendWith(c, 'Vòi rỉ nước', [file('clip.mp4', 'video/mp4')]);
    const [video] = c.attachments.value;
    expect(video.state).toBe('failed');
    expect(video.error).toBe('Mạng yếu nên chưa gửi được. Bấm Thử lại khi mạng ổn hơn.');
    expect(c.bookingUploadIds()).toEqual([]);
    c.retryUpload(video.id);
    await flushPromises();
    expect(c.attachments.value[0].state).toBe('done');
    expect(uploadBookingVideo).toHaveBeenCalledTimes(2);

    uploadBookingPhoto.mockRejectedValueOnce({ response: { status: 401 } });
    await sendWith(c, 'Thêm ảnh', [file('p.jpg', 'image/jpeg')]);
    expect(c.attachments.value[1].error).toContain('đăng nhập lại');

    // A removed upload is cancelled and leaves the booking.
    let signal: AbortSignal | undefined;
    uploadBookingPhoto.mockImplementationOnce((_f: File, opts: { signal: AbortSignal }) => { signal = opts.signal; return new Promise(() => undefined); });
    await sendWith(c, 'Ảnh nữa', [file('q.jpg', 'image/jpeg')]);
    const busy = c.attachments.value[2];
    expect(busy.state).toBe('uploading');
    c.removeAttachment(busy.id);
    expect(signal?.aborted).toBe(true);
    expect(c.attachments.value).toHaveLength(2);
  });

  it('does not keep the form photos it opens with, and forgets and cancels everything on start over', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    await c.sendTurn('Tủ lạnh không lạnh', [{ file: file('f.jpg', 'image/jpeg'), dataUrl: 'data:image/jpeg;base64,AAAA' } as never], { keepImagesForBooking: false });
    expect(c.attachments.value).toEqual([]);
    expect(uploadBookingPhoto).not.toHaveBeenCalled();
    let signal: AbortSignal | undefined;
    uploadBookingVideo.mockImplementationOnce((_f: File, opts: { signal: AbortSignal }) => { signal = opts.signal; return new Promise(() => undefined); });
    await sendWith(c, 'Ngăn đá vẫn đông', [file('t.mp4', 'video/mp4')]);
    c.startOver();
    expect(signal?.aborted).toBe(true);
    expect(c.attachments.value).toEqual([]);
    expect(c.pendingVideos.value).toEqual([]);
  });

  it('shows the counts, the conversion, where each file is, and a retry for one that failed', async () => {
    const c = useAiConversation({ dwellMs: 0, revealMs: 0 });
    let finishPrep: (value: unknown) => void = () => undefined;
    prepareVideo.mockImplementationOnce((_f: File, opts: { onProgress: (n: number) => void }) => {
      opts.onProgress(0.4);
      return new Promise((resolve) => { finishPrep = resolve; });
    });
    const wrapper = mount(AiConversationThread, { props: { conversation: c } });
    expect(wrapper.get('[data-testid="ai-file-input"]').attributes('accept')).toContain('video/mp4');
    await c.addFiles([file('clip.mp4', 'video/mp4')]);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="ai-attachment-count"]').text()).toBe('Ảnh 0/3 · Video 1/2');
    expect(wrapper.get('[data-testid="ai-pending-video"]').attributes('data-state')).toBe('preparing');
    expect(wrapper.get('[data-testid="ai-pending-video"]').text()).toContain('40%');
    expect(wrapper.text()).toContain(VIDEO_NOT_ANALYSED);

    let progress: (n: number) => void = () => undefined;
    let fail: (e: unknown) => void = () => undefined;
    uploadBookingVideo.mockImplementationOnce((_f: File, opts: { onProgress: (n: number) => void }) => {
      progress = opts.onProgress;
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    c.input.value = 'Vòi rỉ nước';
    await c.send();
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-attachment-status"]').text()).toContain('Đang nén video 40%');
    finishPrep({ file: small, shrunk: true, trimmed: true });
    await flushPromises();
    progress(0.35);
    await wrapper.vm.$nextTick();
    const status = wrapper.get('[data-testid="ai-attachment-status"]');
    expect(status.text()).toContain('Đang gửi video cho thợ 35%');
    expect(status.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('35');
    expect(status.text()).toContain('chỉ gửi 60 giây đầu');
    expect(wrapper.find('[data-testid="ai-message-videos"] video').attributes('src')).toBe('blob:v0');
    // Found in the browser: the status under the message scrolls away, so one line above the composer keeps it in view.
    expect(wrapper.get('[data-testid="ai-upload-summary"]').text()).toContain('Đang gửi ảnh, video cho thợ 35%');
    expect(wrapper.get('[data-testid="ai-upload-summary"]').text()).toContain('Ảnh 0/3 · Video 1/2');
    // Sending again after the connection dropped: said the same way as under the message.
    c.attachments.value[0].retrying = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="ai-upload-summary"]').text()).toContain('Mạng chập chờn, đang gửi lại');
    c.attachments.value[0].retrying = false;
    await wrapper.vm.$nextTick();

    fail(new Error('Network Error'));
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-attachment-status"] li').attributes('data-state')).toBe('failed');
    expect(wrapper.text()).toContain('Mạng yếu nên chưa gửi được');
    expect(wrapper.get('[data-testid="ai-upload-summary"]').text()).toContain('1 ảnh/video chưa gửi được cho thợ');
    await wrapper.get('[data-testid="ai-upload-summary-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-attachment-status"]').text()).toContain('Video đã gửi kèm cho thợ');
    // Everything arrived: the line goes away.
    expect(wrapper.find('[data-testid="ai-upload-summary"]').exists()).toBe(false);
  });
});
