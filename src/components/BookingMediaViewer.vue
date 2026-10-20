<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Image as ImageIcon, LockKeyhole, Play, ShieldAlert, X } from 'lucide-vue-next';
import { AUTH_SESSION_INVALIDATED_EVENT, apiUrl } from '../api/client';
import { mediaApi } from '../api/media.api';
import type { BookingMedia } from '../api/bookings.api';

interface MediaItemState {
  status: 'loading' | 'ready' | 'error' | 'unsupported';
  /** A photo's object URL, or a video's streaming link. */
  objectUrl?: string;
  /** A video's poster still; hidden if not ready yet. */
  posterUrl?: string;
  posterFailed?: boolean;
  /** The streaming link was renewed once after it stopped working. */
  renewed?: boolean;
}

/** Short videos sit beside the photos (PO 18/10/2026); they play here and go to no AI. */
const isVideo = (media: BookingMedia) => /^video\//i.test(media.mimeType);

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
    // PO 18/10/2026: a video streams through a short-lived link, so it starts at
    // once and can be skipped through instead of downloading in full first.
    if (isVideo(media)) {
      const link = await mediaApi.getBookingVideoLink(props.bookingId, media.id);
      if (!mounted.value || requestGeneration !== generation.value || authorizationBlocked.value) return;
      state.objectUrl = apiUrl(link.url);
      state.posterUrl = apiUrl(link.posterUrl);
      state.status = 'ready';
      return;
    }
    const blob = await mediaApi.getBookingMediaContent(props.bookingId, media.id);
    const blobMimeType = blob.type || media.mimeType;
    if (!/^(image|video)\//i.test(blobMimeType)) throw new Error('Unsupported private Booking media type');

    const objectUrl = URL.createObjectURL(blob);
    ownedObjectUrls.add(objectUrl);
    if (!mounted.value || requestGeneration !== generation.value || authorizationBlocked.value) {
      releaseObjectUrl(objectUrl);
      return;
    }
    state.objectUrl = objectUrl;
    state.status = 'ready';
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

const hasVideo = computed(() => props.media.some(isVideo));

/**
 * The viewing link lasts fifteen minutes: when the player stops on it, a new one
 * is asked for once. Once a video plays again it may be renewed again later (a
 * page left open for an hour), and a video that still fails can be retried by
 * hand, for one whose playable copy was still being made.
 */
const videoPlayed = (media: BookingMedia) => {
  getMediaState(media).renewed = false;
};
const retryVideo = (media: BookingMedia) => {
  const state = getMediaState(media);
  state.renewed = false;
  state.status = 'loading';
  void loadPrivateMedia(media, generation.value);
};
const renewVideoLink = async (media: BookingMedia) => {
  const state = getMediaState(media);
  if (state.renewed || authorizationBlocked.value) {
    state.status = 'error';
    return;
  }
  state.renewed = true;
  const requestGeneration = generation.value;
  try {
    const link = await mediaApi.getBookingVideoLink(props.bookingId, media.id);
    if (!mounted.value || requestGeneration !== generation.value) return;
    state.objectUrl = apiUrl(link.url);
    state.posterUrl = apiUrl(link.posterUrl);
  } catch {
    if (mounted.value && requestGeneration === generation.value) state.status = 'error';
  }
};
/** Opens one item large over the page. */
const selectMedia = (media: BookingMedia) => {
  const state = getMediaState(media);
  if (state.status === 'ready') selectedMediaId.value = media.id;
};
const closeViewer = () => {
  selectedMediaId.value = null;
};
const readyMedia = computed(() => props.media.filter((media) => getMediaState(media).status === 'ready'));
/** The next or previous item that can be shown, wrapping around. */
const step = (direction: 1 | -1) => {
  const list = readyMedia.value;
  const at = list.findIndex((media) => media.id === selectedMediaId.value);
  if (at === -1 || list.length < 2) return;
  selectedMediaId.value = list[(at + direction + list.length) % list.length]!.id;
};
const onViewerKey = (event: KeyboardEvent) => {
  if (!selectedMediaId.value) return;
  if (event.key === 'Escape') closeViewer();
  else if (event.key === 'ArrowRight') step(1);
  else if (event.key === 'ArrowLeft') step(-1);
};

const handleAuthSessionInvalidated = () => {
  generation.value += 1;
  authorizationBlocked.value = true;
  selectedMediaId.value = null;
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
  window.addEventListener('keydown', onViewerKey);
});

onUnmounted(() => {
  window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, handleAuthSessionInvalidated);
  window.removeEventListener('keydown', onViewerKey);
  mounted.value = false;
  resetViewer();
});
</script>

<template>
  <!-- PO 21/10/2026: one grid of the customer's photos and videos ("Ảnh mô tả"), no
       second large copy above it. A tap opens the item large over the page; a tap
       outside it, the close button or Escape puts it back. Same for every role. -->
  <section v-if="media.length" data-testid="booking-media-viewer" class="space-y-3 border-t border-ink-100 pt-4">
    <div class="flex items-center gap-2">
      <ImageIcon :size="16" class="text-brand-600" aria-hidden="true" />
      <h2 class="text-sm font-bold text-ink-900">{{ hasVideo ? 'Ảnh và video mô tả' : 'Ảnh mô tả' }}</h2>
    </div>

    <div class="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
      <article
        v-for="(mediaItem, index) in media"
        :key="mediaItem.id"
        :data-testid="`booking-media-${mediaItem.id}`"
        class="aspect-square overflow-hidden rounded-xl border border-ink-200 bg-ink-50"
      >
        <button
          v-if="getMediaState(mediaItem).status === 'ready'"
          type="button"
          class="relative block h-full w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-inset"
          :aria-label="isVideo(mediaItem) ? `Xem video mô tả ${index + 1}` : `Xem ảnh mô tả ${index + 1}`"
          @click="selectMedia(mediaItem)"
        >
          <template v-if="isVideo(mediaItem)">
            <!-- The poster still, a few KB, instead of loading the video for a thumbnail. -->
            <img
              v-if="getMediaState(mediaItem).posterUrl && !getMediaState(mediaItem).posterFailed"
              :src="getMediaState(mediaItem).posterUrl"
              alt=""
              class="h-full w-full object-cover opacity-90"
              aria-hidden="true"
              @error="getMediaState(mediaItem).posterFailed = true"
            >
            <span v-else class="block h-full w-full bg-ink-900"></span>
            <span class="absolute inset-0 flex items-center justify-center">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow">
                <Play :size="16" class="ml-0.5" aria-hidden="true" />
              </span>
            </span>
          </template>
          <img
            v-else
            :src="mediaItem.isPrivate ? getMediaState(mediaItem).objectUrl : mediaItem.url ?? undefined"
            :alt="`Ảnh mô tả ${index + 1}`"
            class="h-full w-full object-cover transition-opacity hover:opacity-90"
          >
          <span v-if="!mediaItem.isPrivate" class="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 text-left text-[10px] font-medium leading-tight text-white">Ảnh cũ / liên kết công khai</span>
        </button>
        <div v-else class="flex h-full items-center justify-center px-2 text-center">
          <div v-if="getMediaState(mediaItem).status === 'loading'" class="space-y-1 text-[11px] text-ink-500">
            <LockKeyhole :size="16" class="mx-auto text-brand-600" aria-hidden="true" />
            <p>{{ isVideo(mediaItem) ? 'Đang tải video...' : 'Đang tải ảnh...' }}</p>
          </div>
          <div v-else-if="getMediaState(mediaItem).status === 'error'" class="space-y-1 text-[11px] text-danger-700">
            <ShieldAlert :size="16" class="mx-auto" aria-hidden="true" />
            <p>{{ isVideo(mediaItem) ? 'Video không khả dụng' : 'Ảnh không khả dụng' }}</p>
            <button
              v-if="isVideo(mediaItem) && !authorizationBlocked"
              type="button"
              class="font-semibold text-brand-700 hover:underline"
              data-testid="booking-media-video-retry"
              @click="retryVideo(mediaItem)"
            >
              Thử lại
            </button>
          </div>
          <div v-else class="space-y-1 text-[11px] text-ink-500">
            <ShieldAlert :size="16" class="mx-auto" aria-hidden="true" />
            <p>Liên kết ảnh cũ không khả dụng</p>
          </div>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div
        v-if="currentMedia && currentSource"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/90 p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        :aria-label="isVideo(currentMedia) ? 'Video mô tả' : 'Ảnh mô tả'"
        data-testid="booking-media-lightbox"
        @click.self="closeViewer"
      >
        <button
          type="button"
          class="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Đóng"
          data-testid="booking-media-lightbox-close"
          @click="closeViewer"
        >
          <X :size="22" aria-hidden="true" />
        </button>
        <button
          v-if="readyMedia.length > 1"
          type="button"
          class="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
          aria-label="Ảnh trước"
          @click="step(-1)"
        >
          <ChevronLeft :size="24" aria-hidden="true" />
        </button>
        <!-- Nothing is downloaded until play is pressed: a weak connection is spent only on what is watched. -->
        <video
          v-if="isVideo(currentMedia)"
          data-testid="booking-media-selected-video"
          :src="currentSource"
          :poster="currentState?.posterFailed ? undefined : currentState?.posterUrl"
          controls
          playsinline
          preload="none"
          class="max-h-[85vh] max-w-full rounded-lg bg-black"
          @error="renewVideoLink(currentMedia)"
          @loadeddata="videoPlayed(currentMedia)"
        ></video>
        <img
          v-else
          data-testid="booking-media-selected"
          :src="currentSource"
          alt="Ảnh mô tả phóng to"
          class="max-h-[85vh] max-w-full rounded-lg object-contain"
        >
        <button
          v-if="readyMedia.length > 1"
          type="button"
          class="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
          aria-label="Ảnh sau"
          @click="step(1)"
        >
          <ChevronRight :size="24" aria-hidden="true" />
        </button>
      </div>
    </Teleport>
  </section>
</template>
