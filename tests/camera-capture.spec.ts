import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CameraCapture from '../src/components/technician/CameraCapture.vue';

interface FakeTrack {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
}

/** A real (happy-dom) MediaStream, so `video.srcObject` accepts it, with tracks we can watch. */
function makeStream(tracks: FakeTrack[]): MediaStream {
  const stream = new MediaStream();
  Object.defineProperty(stream, 'getTracks', { value: () => tracks });
  return stream;
}

let tracks: FakeTrack[];
let getUserMedia: ReturnType<typeof vi.fn>;
let canvases: HTMLCanvasElement[];
let drawImage: ReturnType<typeof vi.fn>;

const PERMISSION_LINE = 'Không mở được camera. Hãy cho phép trình duyệt dùng camera rồi thử lại.';

beforeEach(() => {
  tracks = [{ kind: 'video', stop: vi.fn() }];
  getUserMedia = vi.fn().mockResolvedValue(makeStream(tracks));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  canvases = [];
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this);
    return { drawImage } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback, type?: string) => {
    callback(new Blob(['jpeg-bytes'], { type: type ?? 'image/png' }));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:still'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const mountCamera = (mode: 'face' | 'product' = 'face') =>
  mount(CameraCapture, { props: { mode, title: mode === 'face' ? 'Check-in' : 'Ảnh máy trước khi sửa' }, attachTo: document.body });

describe('CameraCapture', () => {
  it('opens the front camera in face mode with a mirrored preview, an oval guide and one hint', async () => {
    const wrapper = mountCamera('face');
    await flushPromises();

    expect(getUserMedia).toHaveBeenCalledWith({ video: expect.objectContaining({ facingMode: 'user' }), audio: false });
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(wrapper.get('video').classes()).toContain('-scale-x-100');
    expect(wrapper.find('[data-testid="camera-face-guide"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="camera-product-guide"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Đưa khuôn mặt vào khung');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the back camera in product mode with a rectangle guide and no mirror', async () => {
    const wrapper = mountCamera('product');
    await flushPromises();

    expect(getUserMedia).toHaveBeenCalledWith({ video: expect.objectContaining({ facingMode: { ideal: 'environment' } }), audio: false });
    expect(wrapper.get('video').classes()).not.toContain('-scale-x-100');
    expect(wrapper.find('[data-testid="camera-product-guide"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Đưa máy vào khung');
    wrapper.unmount();
  });

  it('shutter shows the still, then "Dùng ảnh này" emits a JPEG file and stops the camera', async () => {
    const wrapper = mountCamera('face');
    await flushPromises();

    await wrapper.get('[data-testid="camera-shutter"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="camera-still"]').attributes('src')).toBe('blob:still');
    expect(wrapper.text()).toContain('Chụp lại');
    expect(wrapper.text()).toContain('Dùng ảnh này');
    expect(wrapper.find('[data-testid="camera-shutter"]').exists()).toBe(false);

    await wrapper.get('[data-testid="camera-use"]').trigger('click');
    const emitted = wrapper.emitted('capture');
    expect(emitted).toHaveLength(1);
    const file = emitted![0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/\.jpg$/);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    // The saved face is the true image: the frame is drawn as is, not flipped.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, expect.any(Number), expect.any(Number));
    expect(tracks[0].stop).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the longest edge at 1600 px', async () => {
    const wrapper = mountCamera('product');
    await flushPromises();
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 4000 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 3000 });

    await wrapper.get('[data-testid="camera-shutter"]').trigger('click');
    await flushPromises();
    expect(canvases.at(-1)!.width).toBe(1600);
    expect(canvases.at(-1)!.height).toBe(1200);
    wrapper.unmount();
  });

  it('"Chụp lại" goes back to the live camera without asking for it again', async () => {
    const wrapper = mountCamera('product');
    await flushPromises();
    await wrapper.get('[data-testid="camera-shutter"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="camera-retake"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="camera-still"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="camera-shutter"]').exists()).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('capture')).toBeUndefined();
    wrapper.unmount();
  });

  it('a blocked permission shows one plain line and "Thử lại", never a file picker or an error name', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    const wrapper = mountCamera('face');
    await flushPromises();

    const error = wrapper.get('[data-testid="camera-error"]');
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain(PERMISSION_LINE);
    expect(wrapper.text()).not.toMatch(/NotAllowedError|Permission denied/);
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="camera-shutter"]').exists()).toBe(false);

    const retry = wrapper.findAll('button').find((b) => b.text().includes('Thử lại'));
    expect(retry).toBeDefined();
    await retry!.trigger('click');
    await flushPromises();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="camera-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="camera-shutter"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('names the busy camera and the missing camera in plain words', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' }));
    const busy = mountCamera('product');
    await flushPromises();
    expect(busy.get('[data-testid="camera-error"]').text()).toContain('Camera đang được ứng dụng khác dùng');
    expect(busy.text()).not.toMatch(/NotReadableError|video source/);
    busy.unmount();

    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }));
    const missing = mountCamera('product');
    await flushPromises();
    expect(missing.get('[data-testid="camera-error"]').text()).toContain('Không tìm thấy camera');
    missing.unmount();
  });

  it('an insecure page (no camera API) shows the same plain line', async () => {
    vi.stubGlobal('navigator', {});
    const wrapper = mountCamera('face');
    await flushPromises();
    expect(wrapper.get('[data-testid="camera-error"]').text()).toContain(PERMISSION_LINE);
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closing stops every track and emits close; Escape closes too', async () => {
    const wrapper = mountCamera('face');
    await flushPromises();
    await wrapper.get('[data-testid="camera-close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    wrapper.unmount();

    tracks = [{ kind: 'video', stop: vi.fn() }];
    getUserMedia.mockResolvedValue(makeStream(tracks));
    const second = mountCamera('product');
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(second.emitted('close')).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    second.unmount();
  });

  it('unmounting stops the camera, also when it opens after the dialog is gone', async () => {
    const wrapper = mountCamera('product');
    await flushPromises();
    wrapper.unmount();
    expect(tracks[0].stop).toHaveBeenCalled();

    let open: (stream: MediaStream) => void = () => {};
    const late: FakeTrack[] = [{ kind: 'video', stop: vi.fn() }];
    getUserMedia.mockImplementationOnce(() => new Promise<MediaStream>((resolve) => { open = resolve; }));
    const quick = mountCamera('product');
    quick.unmount();
    open(makeStream(late));
    await flushPromises();
    expect(late[0].stop).toHaveBeenCalled();
  });

  it('with FaceDetector, the shutter waits for one face inside the oval', async () => {
    vi.useFakeTimers();
    let faces: { boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
    vi.stubGlobal('FaceDetector', class {
      detect = vi.fn(async () => faces);
    });
    const wrapper = mountCamera('face');
    await flushPromises();
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 });

    await vi.advanceTimersByTimeAsync(350);
    expect(wrapper.get('[data-testid="camera-shutter"]').attributes('disabled')).toBeDefined();

    faces = [{ boundingBox: { x: 240, y: 130, width: 160, height: 180 } }];
    await vi.advanceTimersByTimeAsync(450);
    expect(wrapper.get('[data-testid="camera-shutter"]').attributes('disabled')).toBeUndefined();

    faces = [
      { boundingBox: { x: 240, y: 130, width: 160, height: 180 } },
      { boundingBox: { x: 20, y: 20, width: 100, height: 100 } },
    ];
    await vi.advanceTimersByTimeAsync(450);
    expect(wrapper.get('[data-testid="camera-shutter"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('without FaceDetector the shutter is always enabled', async () => {
    const wrapper = mountCamera('face');
    await flushPromises();
    expect(wrapper.get('[data-testid="camera-shutter"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
