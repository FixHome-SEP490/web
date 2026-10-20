import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CameraCapture from '../src/components/technician/CameraCapture.vue';

describe('technician camera batch capture', () => {
  const stop = vi.fn();
  const createObjectUrl = vi.fn(() => `blob:photo-${createObjectUrl.mock.calls.length}`);

  beforeEach(() => {
    stop.mockReset();
    createObjectUrl.mockClear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() { return (this as HTMLMediaElement & { testSrcObject?: MediaProvider | null }).testSrcObject ?? null; },
      set(value: MediaProvider | null) { (this as HTMLMediaElement & { testSrcObject?: MediaProvider | null }).testSrcObject = value; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['photo'], { type: 'image/jpeg' })));
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps captured previews and emits the selected batch only after the technician sends it', async () => {
    const wrapper = mount(CameraCapture, {
      props: { mode: 'product', title: 'Ảnh máy sau khi sửa', multiple: true, maxShots: 3 },
    });
    await flushPromises();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();

    await wrapper.get('[data-testid="camera-shutter"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="camera-use"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="camera-thumbnail"]')).toHaveLength(1);
    expect(wrapper.emitted('capture')).toBeUndefined();

    await wrapper.get('[data-testid="camera-shutter"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="camera-use"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="camera-thumbnail"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Đã chụp 2/3 ảnh');
    expect(wrapper.emitted('capture')).toBeUndefined();

    await wrapper.get('[data-testid="camera-submit-batch"]').trigger('click');
    const files = wrapper.emitted('capture')?.[0]?.[0] as File[];
    expect(files).toHaveLength(2);
    expect(files.every((file) => file.type === 'image/jpeg')).toBe(true);
    wrapper.unmount();
    expect(stop).toHaveBeenCalled();
  });
});
