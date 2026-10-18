import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PO 18/10/2026: a video is made light on the device before it goes up, cut to
// its first minute, with the location stamp dropped; where the browser cannot,
// the original goes as long as it already fits.
const mb = vi.hoisted(() => {
  const state = {
    canEncodeVideo: true,
    canEncodeAudio: true,
    canDecode: true,
    valid: true,
    hasVideo: true,
    hang: false,
    output: new ArrayBuffer(3 * 1024 * 1024),
    track: { displayWidth: 1080, displayHeight: 1920 },
    init: vi.fn(),
    cancel: vi.fn(),
  };
  class Quality { constructor(readonly options: unknown) {} }
  class BlobSource { constructor(readonly blob: Blob) {} }
  class BufferTarget { buffer: ArrayBuffer | null = null; }
  class Mp4OutputFormat { constructor(readonly options: unknown) {} }
  class Output { constructor(readonly options: { target: BufferTarget }) {} get target() { return this.options.target; } }
  class Input {
    async getPrimaryVideoTrack() {
      return state.hasVideo ? { ...state.track, canDecode: async () => state.canDecode } : null;
    }
  }
  const Conversion = {
    init: async (options: { output: Output }) => {
      state.init(options);
      const conversion = {
        isValid: state.valid,
        utilizedTracks: state.hasVideo ? [{ isVideoTrack: () => true }] : [{ isVideoTrack: () => false }],
        onProgress: undefined as undefined | ((p: number) => void),
        cancel: state.cancel,
        execute: async () => {
          if (state.hang) return new Promise<void>(() => undefined);
          conversion.onProgress?.(0.5);
          conversion.onProgress?.(1);
          options.output.target.buffer = state.output;
        },
      };
      return conversion;
    },
  };
  return {
    state,
    module: {
      Quality, BlobSource, BufferTarget, Mp4OutputFormat, Output, Input, Conversion, ALL_FORMATS: [],
      canEncodeVideo: async () => state.canEncodeVideo,
      canEncodeAudio: async () => state.canEncodeAudio,
    },
  };
});
const registerAacEncoder = vi.hoisted(() => vi.fn());
vi.mock('mediabunny', () => mb.module);
vi.mock('@mediabunny/aac-encoder', () => ({ registerAacEncoder }));

import { VideoPrepError, conversionLimitMs, prepareVideo, videoProblemText } from '../src/lib/video-prep';

const MB = 1024 * 1024;
const clip = (size: number, type = 'video/quicktime', name = 'IMG_0001.MOV') => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const seconds = (durationS: number | null) => ({ readInfo: async () => ({ durationS }) });

beforeEach(() => {
  Object.assign(mb.state, { canEncodeVideo: true, canEncodeAudio: true, canDecode: true, valid: true, hasVideo: true, hang: false, output: new ArrayBuffer(3 * MB) });
  mb.state.init.mockClear();
  mb.state.cancel.mockClear();
  registerAacEncoder.mockClear();
  vi.stubGlobal('VideoEncoder', function VideoEncoder() {});
});
afterEach(() => vi.unstubAllGlobals());

describe('prepareVideo', () => {
  it('converts a heavy phone clip to a light H.264 MP4, without its metadata, reporting progress', async () => {
    const progress = vi.fn();
    const prepared = await prepareVideo(clip(80 * MB), { ...seconds(42), onProgress: progress });
    expect(prepared).toMatchObject({ shrunk: true, trimmed: false });
    expect(prepared.file).toMatchObject({ name: 'IMG_0001.mp4', type: 'video/mp4', size: 3 * MB });
    const options = mb.state.init.mock.calls[0][0];
    // Portrait 1080x1920 becomes at most 1280 on the long side, even sizes.
    expect(options.video).toMatchObject({ width: 720, height: 1280, codec: 'avc', frameRate: 30, forceTranscode: true });
    expect(options.video.quality.options).toEqual({ bitrate: 1_200_000 });
    expect(options.audio).toMatchObject({ codec: 'aac' });
    // No location stamp or any other tag is copied.
    expect(options.tags).toEqual({});
    expect(options.trim).toBeUndefined();
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('keeps only the first minute of a longer clip', async () => {
    const prepared = await prepareVideo(clip(200 * MB), seconds(95));
    expect(prepared).toMatchObject({ shrunk: true, trimmed: true });
    expect(mb.state.init.mock.calls[0][0].trim).toEqual({ start: 0, end: 60 });
  });

  it('brings in an AAC encoder where the browser has none', async () => {
    mb.state.canEncodeAudio = false;
    await prepareVideo(clip(20 * MB), seconds(10));
    expect(registerAacEncoder).toHaveBeenCalledOnce();
  });

  it('sends the original when converting would not help or cannot be done', async () => {
    // Already light.
    expect(await prepareVideo(clip(3 * MB, 'video/mp4', 'a.mp4'), seconds(20))).toMatchObject({ shrunk: false });
    expect(mb.state.init).not.toHaveBeenCalled();
    // Barely smaller after converting.
    mb.state.output = new ArrayBuffer(19 * MB);
    expect(await prepareVideo(clip(20 * MB), seconds(20))).toMatchObject({ shrunk: false, file: { size: 20 * MB } });
    // An HEVC clip this browser cannot decode.
    mb.state.canDecode = false;
    expect(await prepareVideo(clip(20 * MB), seconds(20))).toMatchObject({ shrunk: false });
    // Sound only would come out.
    Object.assign(mb.state, { canDecode: true, hasVideo: false });
    expect(await prepareVideo(clip(20 * MB), seconds(20))).toMatchObject({ shrunk: false });
  });

  // Review 18/10/2026: a stuck encoder must not hold the booking forever.
  it('gives up on a conversion that hangs and sends the original, stopping the converter', async () => {
    mb.state.hang = true;
    const result = await prepareVideo(clip(20 * MB), { ...seconds(20), limitMs: 50 });
    expect(result).toMatchObject({ shrunk: false, file: { size: 20 * MB } });
    expect(mb.state.cancel).toHaveBeenCalled();
    // Twice the clip plus half a minute; three minutes when its length is unknown.
    expect(conversionLimitMs(20)).toBe(70_000);
    expect(conversionLimitMs(90)).toBe(150_000);
    expect(conversionLimitMs(null)).toBe(180_000);
  });

  it('without a converter, refuses what does not fit as is, and an unknown type', async () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(await prepareVideo(clip(20 * MB), seconds(30))).toMatchObject({ shrunk: false });
    await expect(prepareVideo(clip(20 * MB), seconds(75))).rejects.toEqual(new VideoPrepError('too_long'));
    await expect(prepareVideo(clip(60 * MB), seconds(30))).rejects.toEqual(new VideoPrepError('too_big'));
    // A length the browser cannot read is left to the server.
    expect(await prepareVideo(clip(20 * MB), seconds(null))).toMatchObject({ shrunk: false });
    await expect(prepareVideo(clip(1 * MB, 'video/x-msvideo', 'a.avi'), seconds(5))).rejects.toEqual(new VideoPrepError('type'));
    expect(videoProblemText('too_long')).toContain('dài hơn 60 giây');
  });
});
