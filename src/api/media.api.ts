// src/api/media.api.ts
import apiClient from './client';

export interface UploadedMedia {
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

export interface UploadedBookingPhoto {
  uploadId: string;
  mimeType: string;
  sizeBytes: number;
}

/** Upload progress and cancellation, for uploads that must survive a weak connection. */
export interface UploadProgressOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** A short-lived link a video player streams and seeks (PO 18/10/2026), relative to the API base. */
export interface VideoLink {
  url: string;
  posterUrl: string;
  expiresAt: string;
}

const progressConfig = (opts: UploadProgressOptions) => ({
  ...(opts.signal ? { signal: opts.signal } : {}),
  ...(opts.onProgress
    ? { onUploadProgress: (event: { loaded: number; total?: number }) => { if (event.total) opts.onProgress?.(event.loaded / event.total); } }
    : {}),
});

/** Validates a viewing link answer; the paths must point at our own streaming routes. */
export function toVideoLink(data: unknown, prefix: string): VideoLink {
  const link = data as Partial<VideoLink> | null;
  if (!link || typeof link.url !== 'string' || !link.url.startsWith(prefix) || typeof link.posterUrl !== 'string' || typeof link.expiresAt !== 'string') {
    throw new Error('Unexpected API response: invalid video link');
  }
  return { url: link.url, posterUrl: link.posterUrl, expiresAt: link.expiresAt };
}

export const ALLOWED_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const mediaApi = {
  /**
   * Upload an image to Cloudinary public storage via the backend.
   * Returns an UploadedMedia object whose `url` is the full public Cloudinary CDN URL.
   */
  async upload(file: File): Promise<UploadedMedia> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<{ data: UploadedMedia }>('/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  /** Uploads a private Booking photo without exposing a public storage URL. */
  async uploadBookingPhoto(file: File, opts: UploadProgressOptions = {}): Promise<UploadedBookingPhoto> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<{ data: UploadedBookingPhoto }>(
      '/media/booking-photo-upload',
      form,
      // No fixed timeout on a weak connection: a caller with progress watches for a stall instead.
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: opts.onProgress ? 0 : 60000, ...progressConfig(opts) },
    );
    const data = res.data?.data;
    if (
      !data
      || typeof data.uploadId !== 'string'
      || !data.uploadId.trim()
      || typeof data.mimeType !== 'string'
      || !data.mimeType.trim()
      || !Number.isSafeInteger(data.sizeBytes)
      || data.sizeBytes < 0
    ) {
      throw new Error('Unexpected API response: invalid private Booking photo metadata');
    }
    return { uploadId: data.uploadId, mimeType: data.mimeType, sizeBytes: data.sizeBytes };
  },

  /**
   * Uploads a short private video of the problem (PO 18/10/2026): mp4, mov or
   * webm up to 50 MB. It goes with the booking for the technician; the AI never sees it.
   */
  async uploadBookingVideo(file: File, opts: UploadProgressOptions = {}): Promise<UploadedBookingPhoto> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<{ data: UploadedBookingPhoto }>(
      '/media/booking-video-upload',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: opts.onProgress ? 0 : 180000, ...progressConfig(opts) },
    );
    const data = res.data?.data;
    if (!data || typeof data.uploadId !== 'string' || !data.uploadId.trim() || typeof data.mimeType !== 'string') {
      throw new Error('Unexpected API response: invalid private Booking video metadata');
    }
    return { uploadId: data.uploadId, mimeType: data.mimeType, sizeBytes: Number(data.sizeBytes) || 0 };
  },

  /** A viewing link for a booking video: the player streams it instead of downloading it whole. */
  async getBookingVideoLink(bookingId: string, mediaId: string): Promise<VideoLink> {
    const res = await apiClient.get<{ data: VideoLink }>(
      `/bookings/${encodeURIComponent(bookingId)}/media/${encodeURIComponent(mediaId)}/stream`,
    );
    return toVideoLink(res.data?.data, '/bookings/media/stream/');
  },

  /** Downloads private Booking media through the authenticated Backend proxy. */
  async getBookingMediaContent(bookingId: string, mediaId: string): Promise<Blob> {
    const res = await apiClient.get<Blob>(
      `/bookings/${encodeURIComponent(bookingId)}/media/${encodeURIComponent(mediaId)}/content`,
      { responseType: 'blob' },
    );
    if (!(res.data instanceof Blob)) {
      throw new Error('Unexpected API response: invalid private Booking media response');
    }
    return res.data;
  },
};
