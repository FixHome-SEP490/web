// src/api/media.api.ts
import apiClient from './client';
import { unwrap } from './response';

export interface UploadMediaResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename?: string;
}

export const mediaApi = {
  async upload(file: File): Promise<UploadMediaResult> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return unwrap<UploadMediaResult>(res.data);
  },
};
