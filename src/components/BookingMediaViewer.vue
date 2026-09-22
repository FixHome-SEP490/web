<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Image as ImageIcon, LockKeyhole, ShieldAlert } from 'lucide-vue-next';
import { AUTH_SESSION_INVALIDATED_EVENT } from '../api/client';
import { mediaApi } from '../api/media.api';
import type { BookingMedia } from '../api/bookings.api';

interface MediaItemState {
  status: 'loading' | 'ready' | 'error' | 'unsupported';
  objectUrl?: string;
}

const props = defineProps<{
  bookingId: string;
  media: BookingMedia[];
}>();

const mounted = ref(true);
const generation = ref(0);
const authorizationBlocked = ref(false);
const selectedMediaId = ref<string | null>(null);
const states = ref<Record<string, MediaItemState>>({});
const ownedObjectUrls = new Set<string>();

const isHttpsPublicUrl = (value: string | null): value is string => {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const releaseObjectUrl = (url?: string) => {
  if (!url || !ownedObjectUrls.has(url)) return;
  ownedObjectUrls.delete(url);
  URL.revokeObjectURL(url);
};

const releaseAllObjectUrls = () => {
  for (const url of [...ownedObjectUrls]) releaseObjectUrl(url);
};

const resetViewer = () => {
  generation.value += 1;
  selectedMediaId.value = null;
  for (const state of Object.values(states.value)) releaseObjectUrl(state.objectUrl);
  releaseAllObjectUrls();
  states.value = {};
};

const getMediaState = (media: BookingMedia): MediaItemState => {
  const existing = states.value[media.id];
  if (existing) return existing;
  const state: MediaItemState = { status: media.isPrivate ? 'loading' : 'unsupported' };
  states.value[media.id] = state;
  return state;
};

const loadPrivateMedia = async (media: BookingMedia, requestGeneration: number) => {
  const state = getMediaState(media);
  if (authorizationBlocked.value || !mounted.value) return;
  try {
    const blob = await mediaApi.getBookingMediaContent(props.bookingId, media.id);
    const blobMimeType = blob.type || media.mimeType;
    if (!/^image\//i.test(blobMimeType)) throw new Error('Unsupported private Booking media type');

    const objectUrl = URL.createObjectURL(blob);
    ownedObjectUrls.add(objectUrl);
    if (!mounted.value || requestGeneration !== generation.value || authorizationBlocked.value) {
      releaseObjectUrl(objectUrl);
      return;
    }
    state.objectUrl = objectUrl;
    state.status = 'ready';
    selectedMediaId.value ??= media.id;
  } catch {
    if (!mounted.value || requestGeneration !== generation.value || authorizationBlocked.value) return;
    state.status = 'error';
  }
};

const prepareMedia = () => {
  if (authorizationBlocked.value) return;
  const requestGeneration = generation.value;
  for (const media of props.media) {
    const state = getMediaState(media);
    if (!media.isPrivate) {
      state.status = isHttpsPublicUrl(media.url) ? 'ready' : 'unsupported';
      selectedMediaId.value ??= media.id;
      continue;
    }
    void loadPrivateMedia(media, requestGeneration);
  }
};

const currentMedia = computed(() => props.media.find((media) => media.id === selectedMediaId.value) ?? null);
const currentState = computed(() => currentMedia.value ? getMediaState(currentMedia.value) : null);
const currentSource = computed(() => {
  const media = currentMedia.value;
  const state = currentState.value;
  if (!media || !state || state.status !== 'ready') return null;
  return media.isPrivate ? state.objectUrl ?? null : isHttpsPublicUrl(media.url) ? media.url : null;
});

const selectMedia = (media: BookingMedia) => {
  const state = getMediaState(media);
  if (state.status === 'ready') selectedMediaId.value = media.id;
};

const handleAuthSessionInvalidated = () => {
  generation.value += 1;
  authorizationBlocked.value = true;
  selectedMediaId.value = props.media.find((media) => !media.isPrivate && isHttpsPublicUrl(media.url))?.id ?? null;
  for (const media of props.media) {
    if (!media.isPrivate) continue;
    const state = states.value[media.id] ?? { status: 'error' as const };
    releaseObjectUrl(state.objectUrl);
    state.objectUrl = undefined;
    state.status = 'error';
    states.value[media.id] = state;
  }
  releaseAllObjectUrls();
};

watch(() => [props.bookingId, props.media], () => {
  authorizationBlocked.value = false;
  resetViewer();
  prepareMedia();
}, { deep: true, immediate: true });

onMounted(() => {
  window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleAuthSessionInvalidated);
});

onUnmounted(() => {
  window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleAuthSessionInvalidated);
  mounted.value = false;
  resetViewer();
});
</script>

<template>
  <section v-if="media.length" data-testid="booking-media-viewer" class="space-y-3 border-t border-ink-100 pt-4">
    <div class="flex items-center gap-2">
      <ImageIcon :size="16" class="text-brand-600" aria-hidden="true" />
      <div>
        <h2 class="text-sm font-bold text-ink-900">Ảnh hiện trường</h2>
        <p class="text-[11px] text-ink-500">Ảnh riêng tư chỉ hiển thị sau khi Backend xác thực quyền truy cập.</p>
      </div>
    </div>

    <div v-if="currentSource" class="overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
      <img
        data-testid="booking-media-selected"
        :src="currentSource"
        alt="Ảnh hiện trường của yêu cầu đặt lịch"
        class="max-h-72 w-full object-contain"
      >
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <article
        v-for="mediaItem in media"
        :key="mediaItem.id"
        :data-testid="`booking-media-${mediaItem.id}`"
        class="overflow-hidden rounded-xl border border-ink-200 bg-white"
      >
        <button
          v-if="getMediaState(mediaItem).status === 'ready'"
          type="button"
          class="block min-h-28 w-full cursor-pointer bg-ink-50 text-left focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-inset"
          :aria-label="mediaItem.isPrivate ? 'Xem ảnh riêng tư' : 'Xem ảnh cũ công khai'"
          @click="selectMedia(mediaItem)"
        >
          <img
            :src="mediaItem.isPrivate ? getMediaState(mediaItem).objectUrl : mediaItem.url ?? undefined"
            :alt="mediaItem.isPrivate ? 'Ảnh riêng tư' : 'Ảnh cũ / liên kết công khai'"
            class="h-28 w-full object-cover transition-opacity hover:opacity-90"
          >
        </button>
        <div v-else class="flex min-h-28 items-center justify-center bg-ink-50 px-3 text-center">
          <div v-if="getMediaState(mediaItem).status === 'loading'" class="space-y-1 text-[11px] text-ink-500">
            <LockKeyhole :size="16" class="mx-auto text-brand-600" aria-hidden="true" />
            <p>Đang tải ảnh riêng tư...</p>
          </div>
          <div v-else-if="getMediaState(mediaItem).status === 'error'" class="space-y-1 text-[11px] text-danger-700">
            <ShieldAlert :size="16" class="mx-auto" aria-hidden="true" />
            <p>Ảnh riêng tư không khả dụng</p>
          </div>
          <div v-else class="space-y-1 text-[11px] text-ink-500">
            <ShieldAlert :size="16" class="mx-auto" aria-hidden="true" />
            <p>Liên kết ảnh cũ không khả dụng</p>
          </div>
        </div>
        <p class="border-t border-ink-100 px-2.5 py-2 text-[11px] font-semibold text-ink-600">
          {{ mediaItem.isPrivate ? 'Ảnh riêng tư' : 'Ảnh cũ / liên kết công khai' }}
        </p>
      </article>
    </div>
  </section>
</template>
