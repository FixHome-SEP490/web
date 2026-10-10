import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// PO 10/10/2026: an avatar is picked from the device and uploaded, never typed as a link.
const { mediaApi, profileApi, auth, squareAvatar } = vi.hoisted(() => ({
  mediaApi: { upload: vi.fn() },
  profileApi: { updateMe: vi.fn() },
  auth: { user: { fullName: 'Phạm Đức Toàn', avatarUrl: 'https://res.cloudinary.com/demo/old.jpg' }, fetchProfile: vi.fn() },
  squareAvatar: vi.fn(),
}));
vi.mock('../src/api/media.api', () => ({ mediaApi }));
vi.mock('../src/api/profile.api', () => ({ profileApi }));
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('../src/utils/image-for-ai', async (load) => ({ ...(await load<object>()), squareAvatar }));

import AvatarDialog from '../src/components/account/AvatarDialog.vue';

const stubs = {
  FhButton: { props: ['disabled', 'loading', 'variant', 'size'], template: '<button :disabled="disabled || loading"><slot /></button>' },
};
const mountDialog = () => mount(AvatarDialog, { props: { open: true }, global: { stubs } });
const button = (w: ReturnType<typeof mountDialog>, text: string) => w.findAll('button').find((b) => b.text().trim() === text);

async function pick(w: ReturnType<typeof mountDialog>, file: File) {
  const input = w.get('[data-testid="avatar-file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

describe('Avatar dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('has a file picker and no link field', () => {
    const w = mountDialog();
    expect(w.get('[data-testid="avatar-file"]').attributes('type')).toBe('file');
    expect(w.get('[data-testid="avatar-file"]').attributes('accept')).toBe('image/*');
    expect(w.find('input[type="url"]').exists()).toBe(false);
    expect(w.text()).not.toMatch(/https?:|URL|Liên kết/);
    expect(w.get('[data-testid="avatar-preview"]').attributes('src')).toBe('https://res.cloudinary.com/demo/old.jpg');
    expect(button(w, 'Lưu ảnh')).toBeUndefined();
  });

  it('uploads the cropped picture and saves its address on the account', async () => {
    const cropped = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
    squareAvatar.mockResolvedValue(cropped);
    mediaApi.upload.mockResolvedValue({ url: 'https://res.cloudinary.com/demo/new.jpg' });
    profileApi.updateMe.mockResolvedValue({});
    const w = mountDialog();

    await pick(w, new File(['raw'], 'IMG_0001.HEIC', { type: '' }));
    expect(w.get('[data-testid="avatar-preview"]').attributes('src')).toBe('blob:preview');
    await button(w, 'Lưu ảnh')!.trigger('click');
    await flushPromises();

    expect(mediaApi.upload).toHaveBeenCalledWith(cropped);
    expect(profileApi.updateMe).toHaveBeenCalledWith({ avatarUrl: 'https://res.cloudinary.com/demo/new.jpg' });
    expect(auth.fetchProfile).toHaveBeenCalled();
    expect(w.emitted('saved')?.[0]).toEqual(['https://res.cloudinary.com/demo/new.jpg']);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('turns away a file that is not a picture, and one the browser cannot read', async () => {
    const w = mountDialog();
    await pick(w, new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));
    expect(w.text()).toContain('Hãy chọn một tấm ảnh.');
    expect(squareAvatar).not.toHaveBeenCalled();

    squareAvatar.mockResolvedValue(null);
    await pick(w, new File(['bad'], 'broken.jpg', { type: 'image/jpeg' }));
    expect(w.text()).toContain('Không đọc được ảnh này. Thử ảnh khác nhé.');
    expect(button(w, 'Lưu ảnh')).toBeUndefined();
  });

  it('a failed upload says only to try again, never the server error', async () => {
    squareAvatar.mockResolvedValue(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' }));
    mediaApi.upload.mockRejectedValue({ response: { status: 503, data: { error: { code: 'STORAGE_UNAVAILABLE', message: 'Cloudinary is not configured' } } } });
    const w = mountDialog();
    await pick(w, new File(['raw'], 'me.png', { type: 'image/png' }));
    await button(w, 'Lưu ảnh')!.trigger('click');
    await flushPromises();

    expect(w.text()).toContain('Chưa lưu được ảnh. Vui lòng thử lại.');
    expect(w.text()).not.toMatch(/503|STORAGE|Cloudinary/);
    expect(profileApi.updateMe).not.toHaveBeenCalled();
    expect(w.emitted('close')).toBeUndefined();
  });
});
