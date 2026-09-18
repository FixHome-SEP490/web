// src/api/media.api.ts
import apiClient from './client';

export interface UploadedMedia {
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

export const ALLOWED_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const mediaApi = {
  /**
   * Upload an image to Supabase public storage via the backend.
   * Returns an UploadedMedia object whose `url` is the full public Supabase CDN URL.
   */
  async upload(file: File): Promise<UploadedMedia> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<{ data: UploadedMedia }>('/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },
};
