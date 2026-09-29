import { ref } from 'vue';
import { mediaApi, ALLOWED_MEDIA_MIME_TYPES, MAX_MEDIA_SIZE_BYTES } from '../api/media.api';
import { getSupportErrorMessage } from '../pages/console/support-cases.utils';

/** Upload state for the optional evidence photos attached to complaints and warranty steps. */
export function useEvidencePhotos(maxPhotos = 5) {
  const photos = ref<{ url: string; name: string }[]>([]);
  const uploading = ref(false);
  const error = ref('');

  async function pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    error.value = '';
    uploading.value = true;
    try {
      for (const file of files) {
        if (photos.value.length >= maxPhotos) {
          error.value = `Bạn chỉ có thể đính kèm tối đa ${maxPhotos} ảnh.`;
          break;
        }
        if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type) || file.size > MAX_MEDIA_SIZE_BYTES) {
          error.value = 'Chỉ nhận ảnh JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.';
          continue;
        }
        const uploaded = await mediaApi.upload(file);
        photos.value.push({ url: uploaded.url, name: file.name });
      }
    } catch (reason) {
      error.value = getSupportErrorMessage(reason, 'Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      uploading.value = false;
    }
  }

  function remove(index: number) {
    photos.value.splice(index, 1);
  }

  function reset() {
    photos.value = [];
    error.value = '';
  }

  const urls = () => photos.value.map((photo) => photo.url);

  return { photos, uploading, error, pick, remove, reset, urls, maxPhotos };
}
