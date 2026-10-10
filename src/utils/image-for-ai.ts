// src/utils/image-for-ai.ts
//
// Turning a file the customer picked into something the assistant can look at.
//
// The wire format is a base64 data URI inside the JSON body - that is what the
// AI Service accepts, and it is why size matters here. Base64 is about a third
// larger than the bytes it carries, so a 6 MB photograph becomes an 8 MB
// string, and three at once becomes a request that a weak connection will not
// hold open.
//
// Every image is therefore resized before it is encoded. The detector runs at
// 640px: a 4000px photograph carries nothing it can use and costs a hundred
// times the bytes to say the same thing.

import {
  AI_IMAGE_EDGE,
  AI_IMAGE_QUALITY,
  AI_MAX_IMAGES,
  AI_RETRY_EDGE,
  AI_RETRY_QUALITY,
} from '../api/ai.api';

/**
 * A photograph kept in two forms.
 *
 * `file` is the original, and it is kept on purpose: when a send fails on a
 * weak connection the only useful retry is a smaller picture, and you cannot
 * make one out of an image that has already been encoded.
 */
export interface PickedImage {
  file: File;
  dataUrl: string;
}

/** The service's ceiling is 8 MiB per image once decoded. */
const MAX_ENCODED_CHARS = Math.floor(8 * 1024 * 1024 * 1.37);

// Anything the browser can draw is accepted (HEIC on Safari, GIF, BMP, AVIF...): it is drawn
// and re-encoded as JPEG, so the backend and the AI only ever see JPEG.
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/** Worth trying to decode: an image type, or no type at all with an image name (HEIC on Windows). */
export function looksLikeImage(file: File): boolean {
  return file.type.startsWith('image/') || (!file.type && IMAGE_NAME.test(file.name));
}

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** Decoded with the camera's rotation applied (EXIF), off the main thread where the browser can. */
async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to <img>, which some browsers decode where createImageBitmap does not.
    }
  }
  const image = await readAsImage(file);
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => undefined };
}

/** The photo redrawn so its longest edge is at most `maxEdge` (never enlarged). */
async function draw(file: File, maxEdge: number): Promise<HTMLCanvasElement | null> {
  const picture = await decode(file);
  try {
    // Longest edge, not width: a portrait photo bounded by width stayed a third too large.
    const scale = Math.min(1, maxEdge / Math.max(picture.width, picture.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(picture.width * scale));
    canvas.height = Math.max(1, Math.round(picture.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(picture.source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    picture.release();
  }
}

function readAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    // A file the browser cannot decode sometimes fires neither event; do not wait for ever.
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    }, 15000);
    image.onload = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    image.src = url;
  });
}

async function encode(file: File, maxEdge: number, quality: number): Promise<string | null> {
  try {
    const canvas = await draw(file, maxEdge);
    if (!canvas) return null;
    const encoded = canvas.toDataURL('image/jpeg', quality);
    const payload = encoded.split(',')[1] ?? '';
    if (!payload || payload.length > MAX_ENCODED_CHARS) return null;
    return encoded;
  } catch {
    return null;
  }
}

export interface PickResult {
  images: PickedImage[];
  /** Set when something the customer chose could not be used. */
  problemVi?: string;
}

/** Resize, re-encode and keep the originals. */
export async function prepareForAi(files: File[], alreadyHave: number): Promise<PickResult> {
  const room = AI_MAX_IMAGES - alreadyHave;
  if (room <= 0) {
    return { images: [], problemVi: `Mỗi lần em xem được tối đa ${AI_MAX_IMAGES} ảnh thôi ạ.` };
  }

  // All at once: each is independent, and one after another made the customer wait on every photo.
  const picked = files.slice(0, room);
  const encoded = await Promise.all(picked.map((file) => (looksLikeImage(file) ? encode(file, AI_IMAGE_EDGE, AI_IMAGE_QUALITY) : null)));
  const images: PickedImage[] = [];
  let rejected = 0;
  picked.forEach((file, i) => {
    const dataUrl = encoded[i];
    if (dataUrl) images.push({ file, dataUrl });
    else rejected += 1;
  });

  return {
    images,
    problemVi: rejected
      ? 'Có ảnh em không đọc được, anh/chị thử ảnh JPG hoặc PNG khác giúp em nhé.'
      : undefined,
  };
}

/**
 * The same photographs, small enough to get through a bad connection.
 *
 * Roughly a tenth of the bytes of the first attempt and still above the 640px
 * the detector sees. Used only after a send has already failed: sending
 * everything this small by default would cost accuracy on the ordinary case to
 * buy nothing.
 */
export async function shrinkForRetry(images: PickedImage[]): Promise<string[]> {
  const encoded = await Promise.all(images.map((image) => encode(image.file, AI_RETRY_EDGE, AI_RETRY_QUALITY)));
  return encoded.filter((e): e is string => !!e);
}

/** Booking photos are stored at this size: enough to see the fault, a fraction of a camera file. */
export const UPLOAD_MAX_EDGE = 2048;
const UPLOAD_QUALITY = 0.85;

/**
 * The photo as a JPEG of at most 2048 px, rotated upright, ready to upload. A 10 MB phone photo
 * becomes a few hundred KB, so it goes up quickly on a weak connection and always matches the
 * type the server checks. Null when the browser cannot read it (HEIC outside Safari, a broken file).
 */
export async function normalizeForUpload(file: File): Promise<File | null> {
  try {
    const canvas = await draw(file, UPLOAD_MAX_EDGE);
    if (!canvas) return null;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_QUALITY));
    if (!blob) return null;
    const name = file.name.replace(/\.[^.]+$/, '') || 'anh';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return null;
  }
}

/** Avatars are shown round and small; 512 px is sharp on a retina header and only tens of KB. */
export const AVATAR_EDGE = 512;

/**
 * The picture cropped to its centre square, upright, as a 512 px JPEG ready to upload as an avatar.
 * Null when the browser cannot read it.
 */
export async function squareAvatar(file: File): Promise<File | null> {
  try {
    const picture = await decode(file);
    try {
      const side = Math.min(picture.width, picture.height);
      const edge = Math.min(AVATAR_EDGE, side);
      const canvas = document.createElement('canvas');
      canvas.width = edge;
      canvas.height = edge;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(picture.source, (picture.width - side) / 2, (picture.height - side) / 2, side, side, 0, 0, edge, edge);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_QUALITY));
      return blob ? new File([blob], 'avatar.jpg', { type: 'image/jpeg' }) : null;
    } finally {
      picture.release();
    }
  } catch {
    return null;
  }
}
