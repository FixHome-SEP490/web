// Videos of the problem, made light before they leave the browser (PO 18/10/2026:
// customers are often on weak mobile connections).
//
// A minute filmed on a phone is 50-150 MB; the technician only needs to see the
// problem. Where the browser can encode H.264 itself (WebCodecs: Chrome, Edge,
// Safari 16.4+, Firefox desktop 130+), the clip is converted on the device to an
// MP4 of at most 1280 px on the long side at about 1.2 Mbit/s with AAC sound -
// roughly 9 MB a minute - and anything after the first minute is cut. Every
// location stamp in the metadata is dropped, because the technician sees the
// video before the address. Where the browser cannot, or the conversion fails,
// the original goes up unchanged and the server makes a viewing copy itself.
//
// The converter (mediabunny, about 100 KB) is loaded only when a video is picked.

/** A clip of the problem is at most a minute. */
export const VIDEO_MAX_SECONDS = 60;
/** The server's limit for one video. */
export const VIDEO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
/** What may be picked when it is converted on the device first (a long 4K clip). */
export const VIDEO_SOURCE_MAX_BYTES = 600 * 1024 * 1024;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** Small enough already: converting would barely help. */
const SKIP_BELOW_BYTES = 4 * 1024 * 1024;
const TARGET_LONG_SIDE = 1280;
const TARGET_VIDEO_BITRATE = 1_200_000;
const TARGET_AUDIO_BITRATE = 96_000;
/**
 * A conversion that has not finished in twice the clip's length plus half a
 * minute is stuck (an encoder that hangs on some devices): the original is sent
 * instead, as on the phone app. Three minutes when the length is unknown.
 */
export function conversionLimitMs(durationS: number | null): number {
  return durationS === null ? 180_000 : Math.round(Math.min(durationS, VIDEO_MAX_SECONDS) * 2000) + 30_000;
}

export interface VideoInfo {
  /** Seconds, or null when the browser cannot read the file (an HEVC clip in some browsers). */
  durationS: number | null;
}

/** Reads how long a picked video is without decoding it; gives up after a few seconds. */
export function readVideoInfo(file: File, timeoutMs = 8000): Promise<VideoInfo> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve({ durationS: null });
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (durationS: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load?.();
      URL.revokeObjectURL(url);
      resolve({ durationS });
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export interface PreparedVideo {
  file: File;
  /** Converted on the device (smaller, H.264). */
  shrunk: boolean;
  /** The original was longer than a minute; only its first minute is kept. */
  trimmed: boolean;
}

export type PrepareProblem = 'type' | 'too_long' | 'too_big';

export class VideoPrepError extends Error {
  constructor(readonly problem: PrepareProblem) {
    super(problem);
  }
}

/** What to tell the customer about a video that cannot go. */
export function videoProblemText(problem: PrepareProblem): string {
  if (problem === 'type') return 'Chỉ gửi được video MP4, MOV hoặc WebM.';
  if (problem === 'too_long') return `Video dài hơn ${VIDEO_MAX_SECONDS} giây. Anh/chị quay đoạn ngắn hơn giúp em nhé.`;
  return 'Video lớn hơn 50 MB. Anh/chị quay đoạn ngắn hơn giúp em nhé.';
}

function canUseWebCodecs(): boolean {
  return typeof window !== 'undefined' && typeof (window as { VideoEncoder?: unknown }).VideoEncoder === 'function';
}


/**
 * Makes a picked video ready to send: checks its type, converts it on the
 * device when possible (cutting it to the first minute), otherwise checks it
 * already fits. Throws VideoPrepError when it cannot go at all; never throws
 * for a conversion that fails - the original is used instead.
 */
export async function prepareVideo(
  file: File,
  opts: {
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
    readInfo?: (file: File) => Promise<VideoInfo>;
    /** Test seam. */
    limitMs?: number;
  } = {},
): Promise<PreparedVideo> {
  if (!VIDEO_TYPES.includes((file.type || '').toLowerCase())) throw new VideoPrepError('type');
  const info = await (opts.readInfo ?? readVideoInfo)(file);
  const longer = info.durationS !== null && info.durationS > VIDEO_MAX_SECONDS + 0.5;

  const limitMs = opts.limitMs ?? conversionLimitMs(info.durationS);
  const shrunk = file.size > SKIP_BELOW_BYTES || longer ? await shrink(file, longer, { ...opts, limitMs }) : null;
  if (shrunk) return { file: shrunk, shrunk: true, trimmed: longer };

  if (longer) throw new VideoPrepError('too_long');
  if (file.size > VIDEO_UPLOAD_MAX_BYTES) throw new VideoPrepError('too_big');
  return { file, shrunk: false, trimmed: false };
}

/** The converted file, or null when this browser cannot convert it or it would not get smaller. */
async function shrink(
  file: File,
  trim: boolean,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal; limitMs: number },
): Promise<File | null> {
  if (!canUseWebCodecs() || file.size > VIDEO_SOURCE_MAX_BYTES || opts.signal?.aborted) return null;
  // Stops the converter when the customer removes the clip or it takes too long.
  const stop = new AbortController();
  const forward = () => stop.abort();
  opts.signal?.addEventListener('abort', forward, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooLong = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      stop.abort();
      resolve(null);
    }, opts.limitMs);
  });
  try {
    const { shrinkWithMediabunny } = await import('./video-shrink');
    const buffer = await Promise.race([
      shrinkWithMediabunny(
        file,
        {
          longSide: TARGET_LONG_SIDE,
          videoBitrate: TARGET_VIDEO_BITRATE,
          audioBitrate: TARGET_AUDIO_BITRATE,
          ...(trim ? { trimToSeconds: VIDEO_MAX_SECONDS } : {}),
        },
        { onProgress: opts.onProgress, signal: stop.signal },
      ),
      tooLong,
    ]);
    if (!buffer || buffer.byteLength === 0) return null;
    // Converting a clip that was already light can make it bigger: keep whichever is smaller.
    if (!trim && buffer.byteLength >= file.size * 0.9) return null;
    if (buffer.byteLength > VIDEO_UPLOAD_MAX_BYTES) return null;
    const name = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([buffer], `${name}.mp4`, { type: 'video/mp4' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', forward);
  }
}
