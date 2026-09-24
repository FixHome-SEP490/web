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
  async uploadBookingPhoto(file: File): Promise<UploadedBookingPhoto> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<{ data: UploadedBookingPhoto }>(
      '/media/booking-photo-upload',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
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
