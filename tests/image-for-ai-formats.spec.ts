import { describe, expect, it } from 'vitest';
import { looksLikeImage, prepareForAi } from '../src/utils/image-for-ai';

// Any picture the browser can draw is tried (re-encoded as JPEG); only non-images are turned away up front.
describe('which files are tried as photos', () => {
  it.each([
    ['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['a.gif', 'image/gif'],
    ['a.avif', 'image/avif'], ['IMG_1.HEIC', 'image/heic'], ['IMG_2.heic', ''], ['IMG_3.HEIF', ''],
  ])('%s (%s) is tried', (name, type) => {
    expect(looksLikeImage(new File(['x'], name, { type }))).toBe(true);
  });

  it.each([['notes.txt', 'text/plain'], ['clip.mp4', 'video/mp4'], ['noext', ''], ['report.pdf', 'application/pdf']])(
    '%s (%s) is not an image',
    (name, type) => {
      expect(looksLikeImage(new File(['x'], name, { type }))).toBe(false);
    },
  );

  it('tells the customer when a file is not a photo, without trying to read it', async () => {
    const result = await prepareForAi([new File(['x'], 'notes.txt', { type: 'text/plain' })], 0);
    expect(result.images).toEqual([]);
    expect(result.problemVi).toContain('không đọc được');
  });
});
