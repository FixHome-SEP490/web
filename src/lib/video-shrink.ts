// The converter itself, loaded only when a video is picked (see video-prep.ts).
// Named imports let the build keep only what the conversion uses of mediabunny.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';

export interface ShrinkTarget {
  longSide: number;
  videoBitrate: number;
  audioBitrate: number;
  /** Keep only this many seconds from the start, when set. */
  trimToSeconds?: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Converts a video to H.264 + AAC MP4 at most `longSide` px, without any
 * metadata tag. Resolves to the bytes, or null when this browser cannot
 * convert it (no H.264 encoder, a source it cannot decode, sound only).
 */
export async function shrinkWithMediabunny(
  file: File,
  target: ShrinkTarget,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<ArrayBuffer | null> {
  const video = new Quality({ bitrate: target.videoBitrate });
  if (!(await canEncodeVideo('avc', { width: target.longSide, height: 720, quality: video }))) return null;
  if (!(await canEncodeAudio('aac'))) {
    // Firefox and some Linux builds have no AAC encoder of their own.
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  }
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  // An HEVC clip in a browser that cannot decode HEVC: the original goes, the server converts it.
  if (!track || !(await track.canDecode())) return null;
  const scale = Math.min(1, target.longSide / Math.max(track.displayWidth, track.displayHeight));
  const bufferTarget = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: bufferTarget });
  const conversion = await Conversion.init({
    input,
    output,
    showWarnings: false,
    ...(target.trimToSeconds ? { trim: { start: 0, end: target.trimToSeconds } } : {}),
    // No metadata: phones write where the clip was shot.
    tags: {},
    video: {
      width: even(track.displayWidth * scale),
      height: even(track.displayHeight * scale),
      fit: 'contain',
      codec: 'avc',
      quality: video,
      frameRate: 30,
      forceTranscode: true,
    },
    audio: { codec: 'aac', quality: new Quality({ bitrate: target.audioBitrate }) },
  });
  // Without a picture track the result would be sound only.
  if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) return null;
  conversion.onProgress = (progress) => opts.onProgress?.(Math.max(0, Math.min(1, progress)));
  const abort = () => void conversion.cancel();
  opts.signal?.addEventListener('abort', abort, { once: true });
  try {
    await conversion.execute();
  } finally {
    opts.signal?.removeEventListener('abort', abort);
  }
  return bufferTarget.buffer ?? null;
}
