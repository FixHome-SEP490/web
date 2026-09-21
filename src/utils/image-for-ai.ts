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
  AI_IMAGE_QUALITY,
  AI_IMAGE_WIDTH,
  AI_MAX_IMAGES,
  AI_RETRY_QUALITY,
  AI_RETRY_WIDTH,
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

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

function readAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    image.src = url;
  });
}

async function encode(file: File, width: number, quality: number): Promise<string | null> {
  try {
    const image = await readAsImage(file);
    // Never enlarge. A small photograph scaled up is the same picture in more
    // bytes, which is the opposite of what this is for.
    const scale = Math.min(1, width / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

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

  const images: PickedImage[] = [];
  let rejected = 0;

  for (const file of files.slice(0, room)) {
    if (!ALLOWED.includes(file.type)) {
      rejected += 1;
      continue;
    }
    const dataUrl = await encode(file, AI_IMAGE_WIDTH, AI_IMAGE_QUALITY);
    if (dataUrl) images.push({ file, dataUrl });
    else rejected += 1;
  }

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
  const smaller: string[] = [];
  for (const image of images) {
    const encoded = await encode(image.file, AI_RETRY_WIDTH, AI_RETRY_QUALITY);
    if (encoded) smaller.push(encoded);
  }
  return smaller;
}
