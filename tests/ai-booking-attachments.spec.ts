import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// PO 18/10/2026: what the customer sent in the chat with the assistant (photos
// and videos, the videos never shown to the AI) went up in the background as
// soon as it was sent; the booking takes what arrived, waits for or skips the
// rest, and never fails silently on a weak connection.
const { createBooking, getCategories, getAddresses, push, route, uploadBookingPhoto, uploadBookingVideo, analyze } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string>, meta: { bookingFlow: 'ai' } },
  uploadBookingPhoto: vi.fn(),
  uploadBookingVideo: vi.fn(),
  analyze: vi.fn(),
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg'],
  MAX_MEDIA_SIZE_BYTES: 1024,
  mediaApi: { upload: vi.fn(), uploadBookingPhoto, uploadBookingVideo },
}));
vi.mock('../src/api/bookings.api', () => ({ bookingsApi: { createBooking } }));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn(), go: vi.fn() }), useRoute: () => route }));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask: analyze, acknowledgements: vi.fn().mockResolvedValue({}), feedback: vi.fn() } };
});
vi.mock('../src/lib/upload-retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/upload-retry')>();
  return {
    ...actual,
    uploadWithRetry: (send: (a: { onProgress: (f: number) => void; signal: AbortSignal }) => Promise<unknown>, opts: { onProgress?: (f: number) => void; signal?: AbortSignal }) =>
      send({ onProgress: opts.onProgress ?? (() => undefined), signal: opts.signal ?? new AbortController().signal }),
  };
});

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';
import { resetSharedAiConversation, useSharedAiConversation } from '../src/composables/useAiConversation';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', { ...attrs, type: 'button', disabled: props.disabled || props.loading, onClick: (e: MouseEvent) => emit('click', e) }, slots.default?.());
  },
});
const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const stubs = { FhButton: ActionButton, FhMoney: SlotStub, FhDatePicker: SlotStub, FhTimeScrollPicker: SlotStub, RouterLink: true };

const video = new File(['clip'], 'may-giat.mp4', { type: 'video/mp4' });

async function chatThenBook() {
  // The customer talked to the floating assistant first, with a photo and a video.
  const shared = useSharedAiConversation();
  await shared.sendTurn('Máy giặt rung mạnh khi vắt', [{ file: video, dataUrl: 'data:image/jpeg;base64,QUJD' } as never], {
    videos: [{ id: 'v1', file: video, url: 'blob:v1', state: 'ready', progress: 1 }],
  });
  route.query = { aiSession: 'sess-1', serviceId: 'svc', desc: 'Máy giặt rung mạnh khi vắt' };
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  await wrapper.find('button[data-testid^="session-2"]').trigger('click');
  await wrapper.findAll('button').find((b) => b.text().includes('Xác nhận'))?.trigger('click');
  await flushPromises();
  return wrapper;
}
const submit = (wrapper: Awaited<ReturnType<typeof chatThenBook>>) => wrapper.get('[data-testid="booking-submit"]');

beforeEach(() => {
  resetSharedAiConversation();
  createBooking.mockReset().mockResolvedValue({ id: 'booking-id' });
  push.mockReset();
  uploadBookingPhoto.mockReset().mockResolvedValue({ uploadId: 'up-photo', mimeType: 'image/jpeg', sizeBytes: 3 });
  uploadBookingVideo.mockReset().mockResolvedValue({ uploadId: 'up-video', mimeType: 'video/mp4', sizeBytes: 4 });
  analyze.mockReset().mockResolvedValue({ sessionId: 'sess-1', status: 'ok', aiAvailable: true, messageVi: 'Dạ.', suspectedFaults: [], recommendedServices: [], suggestedActionsVi: [], priceEstimate: null });
  getCategories.mockReset().mockResolvedValue([{ id: 'cat', name: 'Điện máy', services: [{ id: 'svc', name: 'Sửa máy giặt', pricingMode: 'inspection_required', basePrice: 150000 }] }]);
  getAddresses.mockReset().mockResolvedValue([{ id: 'addr', label: 'Nhà', line1: '1 Test', district: 'Q1', province: 'HCM', isDefault: true }]);
  vi.stubGlobal('alert', vi.fn());
});

describe('booking from the assistant takes the chat photos and videos', () => {
  it('lists what went up on the confirm step and books with it, without uploading again', async () => {
    const wrapper = await chatThenBook();
    // Sent in the background while chatting, before the booking form opened.
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect(uploadBookingVideo).toHaveBeenCalledWith(video, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(wrapper.get('[data-testid="confirm-attachments"]').text()).toContain('1 ảnh, 1 video');
    expect(wrapper.get('[data-testid="confirm-video"]').attributes('data-state')).toBe('done');
    expect(wrapper.get('[data-testid="confirm-video"]').text()).toContain('Đã gửi');
    // Numbered within their kind: the only video is Video 1, not Video 2 after the photo.
    expect(wrapper.get('[data-testid="confirm-video"]').text()).toContain('Video 1');
    expect(wrapper.get('[data-testid="confirm-photo"]').text()).toContain('Ảnh 1');
    expect(wrapper.find('[data-testid="confirm-photos-left-out"]').exists()).toBe(false);

    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect(uploadBookingVideo).toHaveBeenCalledTimes(1);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ photoUploadIds: ['up-photo', 'up-video'], aiSessionId: 'sess-1' }));
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-id/candidates');
  });

  it('lets the customer leave the video out before booking', async () => {
    const wrapper = await chatThenBook();
    await wrapper.get('[data-testid="confirm-video"] [data-testid="confirm-attachment-remove"]').trigger('click');
    expect(wrapper.get('[data-testid="confirm-attachments"]').text()).toContain('1 ảnh');
    expect(wrapper.find('[data-testid="confirm-video"]').exists()).toBe(false);
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(createBooking.mock.calls[0][0].photoUploadIds).toEqual(['up-photo']);
  });

  it('waits, showing how far it is, while a video is still on its way', async () => {
    let progress: (n: number) => void = () => undefined;
    let finish: (v: unknown) => void = () => undefined;
    uploadBookingVideo.mockImplementationOnce((_f: File, opts: { onProgress: (n: number) => void }) => {
      progress = opts.onProgress;
      return new Promise((resolve) => { finish = resolve; });
    });
    const wrapper = await chatThenBook();
    progress(0.5);
    await flushPromises();
    expect(submit(wrapper).attributes('disabled')).toBeDefined();
    expect(submit(wrapper).text()).toBe('Đang gửi ảnh, video cho thợ 50%');
    expect(wrapper.get('[data-testid="confirm-video"]').text()).toContain('Đang gửi 50%');
    expect(wrapper.get('[data-testid="confirm-attachments"]').text()).toContain('có thể bấm Bỏ');
    finish({ uploadId: 'up-video', mimeType: 'video/mp4', sizeBytes: 4 });
    await flushPromises();
    expect(submit(wrapper).attributes('disabled')).toBeUndefined();
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(createBooking.mock.calls[0][0].photoUploadIds).toEqual(['up-photo', 'up-video']);
  });

  it('does not book past a video that failed: it offers to try again or leave it out', async () => {
    uploadBookingVideo.mockRejectedValueOnce(new Error('Network Error')).mockRejectedValueOnce(new Error('Network Error'));
    const wrapper = await chatThenBook();
    // Opening the form tried once more by itself.
    expect(uploadBookingVideo).toHaveBeenCalledTimes(2);
    const row = wrapper.get('[data-testid="confirm-video"]');
    expect(row.attributes('data-state')).toBe('failed');
    expect(row.text()).toContain('Mạng yếu nên chưa gửi được');
    expect(submit(wrapper).attributes('disabled')).toBeDefined();
    await row.get('[data-testid="confirm-attachment-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="confirm-video"]').attributes('data-state')).toBe('done');
    await submit(wrapper).trigger('click');
    await flushPromises();
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect(uploadBookingVideo).toHaveBeenCalledTimes(3);
    expect(createBooking).toHaveBeenCalledTimes(1);
  });
});
