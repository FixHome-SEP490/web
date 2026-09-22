import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { BookingMedia } from '../src/api/bookings.api';
import { AUTH_SESSION_INVALIDATED_EVENT } from '../src/api/client';

const { getBookingMediaContent } = vi.hoisted(() => ({
  getBookingMediaContent: vi.fn(),
}));

vi.mock('../src/api/media.api', () => ({
  mediaApi: { getBookingMediaContent },
}));

import BookingMediaViewer from '../src/components/BookingMediaViewer.vue';

const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const mountedWrappers: Array<{ unmount: () => void }> = [];

function privateMedia(id = 'private-media-id'): BookingMedia {
  return {
    id,
    url: null,
    isPrivate: true,
    legacyInsecure: false,
    mimeType: 'image/jpeg',
    sizeBytes: 12,
  };
}

function legacyMedia(url = 'https://cdn.example.test/legacy.jpg'): BookingMedia {
  return {
    id: 'legacy-media-id',
    url,
    isPrivate: false,
    legacyInsecure: true,
    mimeType: 'image/jpeg',
    sizeBytes: 12,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function mountViewer(media: BookingMedia[], bookingId = 'booking-id') {
  const wrapper = mount(BookingMediaViewer, { props: { bookingId, media } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  getBookingMediaContent.mockReset();
  createObjectURL.mockReset().mockReturnValue('blob:private-preview');
  revokeObjectURL.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('BookingMediaViewer', () => {
  it('does not render a private preview after a forbidden download', async () => {
    getBookingMediaContent.mockRejectedValue(new Error('403 forbidden private content'));

    const wrapper = mountViewer([{ ...privateMedia(), url: 'https://provider.example.test/private.jpg' }]);
    await flushPromises();

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('Ảnh riêng tư không khả dụng');
    expect(wrapper.text()).not.toContain('403 forbidden');
    expect(wrapper.html()).not.toContain('provider.example.test');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('shows only HTTPS legacy URLs with an explicit public legacy label', async () => {
    const wrapper = mountViewer([legacyMedia()]);
    await flushPromises();

    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.test/legacy.jpg');
    expect(wrapper.text()).toContain('Ảnh cũ / liên kết công khai');
    expect(getBookingMediaContent).not.toHaveBeenCalled();

    await wrapper.setProps({ media: [legacyMedia('storage://bucket/private.jpg')] });
    await flushPromises();
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('Liên kết ảnh cũ không khả dụng');
  });

  it('revokes a late private response after the Booking media props change', async () => {
    const pending = deferred<Blob>();
    getBookingMediaContent.mockImplementation((bookingId: string) => (
      bookingId === 'booking-old' ? pending.promise : new Promise<Blob>(() => {})
    ));
    const wrapper = mountViewer([privateMedia('same-media')], 'booking-old');

    await wrapper.setProps({ bookingId: 'booking-new', media: [privateMedia('same-media')] });
    pending.resolve(new Blob(['late bytes'], { type: 'image/jpeg' }));
    await flushPromises();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:private-preview');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('revokes a late private response after unmount and never renders it', async () => {
    const pending = deferred<Blob>();
    getBookingMediaContent.mockReturnValue(pending.promise);
    const wrapper = mountViewer([privateMedia()]);
    wrapper.unmount();

    pending.resolve(new Blob(['late bytes'], { type: 'image/jpeg' }));
    await flushPromises();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:private-preview');
  });

  it('renders exact Vietnamese private and legacy labels', async () => {
    getBookingMediaContent.mockResolvedValue(new Blob(['private'], { type: 'image/jpeg' }));
    const wrapper = mountViewer([privateMedia(), legacyMedia()]);
    await flushPromises();

    expect(wrapper.text()).toContain('Ảnh riêng tư');
    expect(wrapper.text()).toContain('Ảnh cũ / liên kết công khai');
  });

  it('revokes a ready private preview after auth invalidation without retrying', async () => {
    createObjectURL.mockReturnValueOnce('blob:ready');
    getBookingMediaContent.mockResolvedValue(new Blob(['ready'], { type: 'image/jpeg' }));
    const wrapper = mountViewer([privateMedia()]);
    await flushPromises();

    expect(wrapper.find('img[src="blob:ready"]').exists()).toBe(true);
    window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED_EVENT));
    await flushPromises();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ready');
    expect(wrapper.find('img[src="blob:ready"]').exists()).toBe(false);
    expect(getBookingMediaContent).toHaveBeenCalledTimes(1);
  });

  it('keeps a late pending private response hidden and revoked after auth invalidation', async () => {
    const pending = deferred<Blob>();
    createObjectURL.mockReturnValueOnce('blob:late');
    getBookingMediaContent.mockReturnValue(pending.promise);
    const wrapper = mountViewer([privateMedia()]);
    window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED_EVENT));

    pending.resolve(new Blob(['late'], { type: 'image/jpeg' }));
    await flushPromises();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:late');
    expect(wrapper.find('img[src="blob:late"]').exists()).toBe(false);
    expect(getBookingMediaContent).toHaveBeenCalledTimes(1);
  });

  it('removes the auth listener on unmount', async () => {
    getBookingMediaContent.mockResolvedValue(new Blob(['private'], { type: 'image/jpeg' }));
    const wrapper = mountViewer([privateMedia()]);
    await flushPromises();
    wrapper.unmount();
    const revokeCallsAfterUnmount = revokeObjectURL.mock.calls.length;

    window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED_EVENT));
    expect(revokeObjectURL.mock.calls.length).toBe(revokeCallsAfterUnmount);
  });
});
