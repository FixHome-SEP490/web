import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const {
  uploadBookingPhoto,
  legacyUpload,
  createBooking,
  getCategories,
  getAddresses,
  push,
  route,
  alert,
} = vi.hoisted(() => ({
  uploadBookingPhoto: vi.fn(),
  legacyUpload: vi.fn(),
  createBooking: vi.fn(),
  getCategories: vi.fn(),
  getAddresses: vi.fn(),
  push: vi.fn(),
  route: { query: { fixed: 'true' } },
  alert: vi.fn(),
}));

vi.mock('../src/api/media.api', () => ({
  ALLOWED_MEDIA_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_MEDIA_SIZE_BYTES: 10 * 1024 * 1024,
  mediaApi: { upload: legacyUpload, uploadBookingPhoto },
}));
vi.mock('../src/api/bookings.api', () => ({
  bookingsApi: { createBooking },
}));
vi.mock('../src/api/catalog.api', () => ({ catalogApi: { getCategories } }));
vi.mock('../src/api/profile.api', () => ({ profileApi: { getAddresses } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push, back: vi.fn() }), useRoute: () => route }));

import NewBookingWizardPage from '../src/pages/customer/NewBookingWizardPage.vue';

const ActionButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      disabled: props.disabled || props.loading,
      onClick: (event: MouseEvent) => emit('click', event),
    }, slots.default?.());
  },
});

const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const stubs = {
  FhButton: ActionButton,
  FhMoney: SlotStub,
  FhDatePicker: SlotStub,
  FhTimeScrollPicker: SlotStub,
  RouterLink: true,
};

const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const createObjectURL = vi.fn<(file: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
}

async function selectPhoto(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.get('input[type="file"]');
  setInputFiles(input.element as HTMLInputElement, [file]);
  await input.trigger('change');
}

async function renderWizard() {
  const wrapper = mount(NewBookingWizardPage, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function submitFixedPriceBooking(wrapper: Awaited<ReturnType<typeof renderWizard>>) {
  await wrapper.findAll('button').find((button) => button.text().includes('Tiếp tục'))?.trigger('click');
  await wrapper.findAll('button').find((button) => button.text().includes('Xác nhận'))?.trigger('click');
  await wrapper.findAll('button').find((button) => button.text().includes('Tìm kỹ thuật viên'))?.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  uploadBookingPhoto.mockReset();
  legacyUpload.mockReset();
  createBooking.mockReset();
  getCategories.mockReset().mockResolvedValue([{
    id: 'category-id',
    name: 'Repair',
    services: [{ id: 'service-id', name: 'Appliance repair', pricingMode: 'fixed_price', fixedPrice: 1000, basePrice: 1000 }],
  }]);
  getAddresses.mockReset().mockResolvedValue([{
    id: 'address-id', label: 'Home', line1: '1 Test Street', district: 'Test District', province: 'Test Province', isDefault: true,
  }]);
  createBooking.mockResolvedValue({ id: 'booking-id' });
  push.mockReset();
  alert.mockReset();
  vi.stubGlobal('alert', alert);
  createObjectURL.mockReset().mockReturnValue('blob:booking-photo');
  revokeObjectURL.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('customer New Booking private photo flow', () => {
  it('uses the private upload and submits upload IDs without invoking the public upload or mediaUrls', async () => {
    const file = new File(['photo'], 'unit.jpg', { type: 'image/jpeg' });
    uploadBookingPhoto.mockResolvedValue({ uploadId: 'opaque-upload-id', mimeType: file.type, sizeBytes: file.size });
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, file);
    await flushPromises();
    await submitFixedPriceBooking(wrapper);

    expect(uploadBookingPhoto).toHaveBeenCalledWith(file);
    expect(legacyUpload).not.toHaveBeenCalled();
    expect(createBooking).toHaveBeenCalledTimes(1);
    const payload = createBooking.mock.calls[0][0];
    expect(payload.photoUploadIds).toEqual(['opaque-upload-id']);
    expect(payload).not.toHaveProperty('mediaUrls');
    expect(push).toHaveBeenCalledWith('/app/bookings/booking-id/candidates');
    wrapper.unmount();
  });

  it('revokes the local preview when a photo is removed and again when reuploaded photo is disposed', async () => {
    const file = new File(['photo'], 'unit.jpg', { type: 'image/jpeg' });
    uploadBookingPhoto.mockResolvedValue({ uploadId: 'opaque-upload-id', mimeType: file.type, sizeBytes: file.size });
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, file);
    await flushPromises();
    expect(wrapper.find('img[src="blob:first"]').exists()).toBe(true);
    const removeButton = wrapper.findAll('button').find((button) => button.element.parentElement?.querySelector('img[src="blob:first"]'));
    await removeButton?.trigger('click');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');

    await selectPhoto(wrapper, file);
    await flushPromises();
    expect(wrapper.find('img[src="blob:second"]').exists()).toBe(true);
    wrapper.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('revokes and removes the local preview when private upload fails', async () => {
    const file = new File(['photo'], 'unit.jpg', { type: 'image/jpeg' });
    uploadBookingPhoto.mockRejectedValue(new Error('private backend detail'));
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, file);
    await flushPromises();

    expect(wrapper.find('img[src="blob:booking-photo"]').exists()).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:booking-photo');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).not.toContain('private backend detail');
    wrapper.unmount();
  });

  it('blocks a second selection and booking creation while an upload is in flight', async () => {
    const file = new File(['photo'], 'unit.jpg', { type: 'image/jpeg' });
    const pending = deferred<{ uploadId: string; mimeType: string; sizeBytes: number }>();
    uploadBookingPhoto.mockReturnValue(pending.promise);
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, file);
    await selectPhoto(wrapper, file);
    expect(uploadBookingPhoto).toHaveBeenCalledTimes(1);
    await submitFixedPriceBooking(wrapper);
    expect(createBooking).not.toHaveBeenCalled();

    pending.resolve({ uploadId: 'opaque-upload-id', mimeType: file.type, sizeBytes: file.size });
    await flushPromises();
    await submitFixedPriceBooking(wrapper);
    expect(createBooking).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('ignores a late upload response after its photo was removed', async () => {
    const file = new File(['photo'], 'unit.jpg', { type: 'image/jpeg' });
    const pending = deferred<{ uploadId: string; mimeType: string; sizeBytes: number }>();
    uploadBookingPhoto.mockReturnValue(pending.promise);
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, file);
    expect(wrapper.find('img[src="blob:booking-photo"]').exists()).toBe(true);
    const removeButton = wrapper.findAll('button').find((button) => button.element.parentElement?.querySelector('img[src="blob:booking-photo"]'));
    await removeButton?.trigger('click');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    pending.resolve({ uploadId: 'late-upload-id', mimeType: file.type, sizeBytes: file.size });
    await flushPromises();
    expect(wrapper.find('img[src="blob:booking-photo"]').exists()).toBe(false);
    expect(alert).not.toHaveBeenCalled();
    await submitFixedPriceBooking(wrapper);
    expect(createBooking.mock.calls[0][0].photoUploadIds).toEqual([]);
    wrapper.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('releases the preview once when disposed during an upload', async () => {
    const file = new File(['photo'], 'unit.jpg', { type: 'image/jpeg' });
    const pending = deferred<{ uploadId: string; mimeType: string; sizeBytes: number }>();
    uploadBookingPhoto.mockReturnValue(pending.promise);
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, file);
    wrapper.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:booking-photo');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    pending.resolve({ uploadId: 'late-upload-id', mimeType: file.type, sizeBytes: file.size });
    await flushPromises();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('validates MIME and size and caps a multiple selection at five photos', async () => {
    const invalidType = new File(['document'], 'notes.txt', { type: 'text/plain' });
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' });
    uploadBookingPhoto.mockImplementation(async (file: File) => ({ uploadId: file.name, mimeType: file.type, sizeBytes: file.size }));
    createObjectURL.mockImplementation(() => `blob:photo-${createObjectURL.mock.calls.length}`);
    const wrapper = await renderWizard();

    await selectPhoto(wrapper, invalidType);
    await selectPhoto(wrapper, oversized);
    expect(uploadBookingPhoto).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();

    const files = Array.from({ length: 6 }, (_, index) => new File([`photo-${index}`], `photo-${index}.jpg`, { type: 'image/jpeg' }));
    const input = wrapper.get('input[type="file"]');
    setInputFiles(input.element as HTMLInputElement, files);
    await input.trigger('change');
    await flushPromises();

    expect(uploadBookingPhoto).toHaveBeenCalledTimes(5);
    expect(createObjectURL).toHaveBeenCalledTimes(5);
    wrapper.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(5);
  });
});
