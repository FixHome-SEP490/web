import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// PO 18/10/2026: what the customer sent in the chat with the assistant (photos
// and videos, the videos never shown to the AI) goes with the booking for the technician.
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
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));
vi.mock('../src/api/ai.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/ai.api')>();
  return { ...actual, aiApi: { analyze, ask: analyze, acknowledgements: vi.fn().mockResolvedValue({}), feedback: vi.fn() } };
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
  await shared.sendTurn('Máy giặt rung mạnh khi vắt', [{ dataUrl: 'data:image/jpeg;base64,QUJD', bytes: 3 } as never], {
    videos: [{ id: 'v1', file: video, url: 'blob:v1' }],
  });
  route.query = { aiSession: 'sess-1', serviceId: 'svc', desc: 'Máy giặt rung mạnh khi vắt' };
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  await wrapper.find('button[data-testid^="session-2"]').trigger('click');
  await wrapper.findAll('button').find((b) => b.text().includes('Xác nhận'))?.trigger('click');
  await flushPromises();
  return wrapper;
}

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
  it('lists them on the confirm step and uploads them with the booking', async () => {
    const wrapper = await chatThenBook();
    expect(wrapper.get('[data-testid="confirm-attachments"]').text()).toContain('1 ảnh, 1 video');
    expect(wrapper.get('[data-testid="confirm-video"]').text()).toContain('may-giat.mp4');
    expect(analyze.mock.calls[0][0].images).toEqual(['data:image/jpeg;base64,QUJD']);

    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên ngay'))!.trigger('click');
    await flushPromises();
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    const photo = uploadBookingPhoto.mock.calls[0][0] as File;
    expect(photo.type).toBe('image/jpeg');
    expect(await photo.text()).toBe('ABC');
    expect(uploadBookingVideo).toHaveBeenCalledWith(video);
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ photoUploadIds: ['up-photo', 'up-video'], aiSessionId: 'sess-1' }));
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-id/candidates');
  });

  it('lets the customer drop the video before booking', async () => {
    const wrapper = await chatThenBook();
    await wrapper.get('[data-testid="confirm-video"] button').trigger('click');
    expect(wrapper.get('[data-testid="confirm-attachments"]').text()).toContain('1 ảnh');
    expect(wrapper.find('[data-testid="confirm-video"]').exists()).toBe(false);
    await wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên ngay'))!.trigger('click');
    await flushPromises();
    expect(uploadBookingVideo).not.toHaveBeenCalled();
    expect(createBooking.mock.calls[0][0].photoUploadIds).toEqual(['up-photo']);
  });

  it('does not book when a chat file cannot go up, and does not upload twice on retry', async () => {
    const wrapper = await chatThenBook();
    uploadBookingVideo.mockRejectedValueOnce(new Error('network'));
    const book = () => wrapper.findAll('button').find((b) => b.text().includes('Tìm kỹ thuật viên ngay'))!.trigger('click');
    await book();
    await flushPromises();
    expect(createBooking).not.toHaveBeenCalled();
    await book();
    await flushPromises();
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    expect(uploadBookingVideo).toHaveBeenCalledTimes(2);
    expect(createBooking).toHaveBeenCalledTimes(1);
  });
});
