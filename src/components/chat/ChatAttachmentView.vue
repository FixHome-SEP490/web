<script setup lang="ts">
// The photo or short video of one chat message (PO 18/10/2026). A photo's bytes
// come through the authenticated proxy, never a public link; a video streams
// through a short-lived viewing link so it starts at once on a weak connection.
// While this tab is still sending the file, the local copy shows with how far
// it is, and a failed send offers Thử lại / Bỏ.
import { computed, onUnmounted, ref, watch } from 'vue';
import { ImageOff, Loader2, RotateCw, X } from 'lucide-vue-next';
import { apiUrl } from '../../api/client';
import { messagingApi, type ChatMessage } from '../../api/messaging.api';
import { useChatStore } from '../../stores/chat.store';

const props = defineProps<{ message: ChatMessage; isMe: boolean }>();
const chatStore = useChatStore();

const source = ref<string | null>(props.message.localPreviewUrl ?? null);
const poster = ref<string | null>(null);
const failed = ref(false);
const loading = ref(false);
let owned: string | null = null;
let renewed = false;

const isVideo = computed(() => props.message.attachment?.kind === 'video');
const upload = computed(() => props.message.upload ?? null);
const percent = computed(() => `${Math.round(Math.max(0, Math.min(1, upload.value?.progress ?? 0)) * 100)}%`);
const uploadText = computed(() => {
  const state = upload.value?.state;
  if (state === 'preparing') return `Đang nén video ${percent.value}`;
  if (state === 'uploading') return `Đang gửi ${percent.value}`;
  if (state === 'failed') return upload.value?.error || 'Chưa gửi được';
  return '';
});

const release = () => {
  if (owned) URL.revokeObjectURL(owned);
  owned = null;
};

async function loadVideoLink() {
  const link = await messagingApi.getAttachmentVideoLink(props.message.id);
  source.value = apiUrl(link.url);
  poster.value = apiUrl(link.posterUrl);
}

async function load() {
  if (props.message.localPreviewUrl) {
    source.value = props.message.localPreviewUrl;
    return;
  }
  // An optimistic bubble has no stored copy yet.
  if (props.message.id === props.message.clientMessageId) return;
  loading.value = true;
  failed.value = false;
  try {
    if (isVideo.value) {
      await loadVideoLink();
      return;
    }
    const blob = await messagingApi.getAttachment(props.message.id);
    if (!/^(image|video)\//i.test(blob.type || props.message.attachment?.mimeType || '')) throw new Error('Unsupported attachment');
    release();
    owned = URL.createObjectURL(blob);
    source.value = owned;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

/**
 * The viewing link lasts fifteen minutes; when the player stops on it, ask once
 * for a new one. A video that played may be renewed again later, and one that
 * still fails (its playable copy was still being made) can be retried by hand.
 */
function onVideoPlayed() {
  renewed = false;
}
async function retryVideo() {
  renewed = false;
  failed.value = false;
  loading.value = true;
  try {
    await loadVideoLink();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
async function onVideoError() {
  if (props.message.localPreviewUrl || props.message.id === props.message.clientMessageId) return;
  if (renewed) {
    failed.value = true;
    source.value = null;
    return;
  }
  renewed = true;
  try {
    await loadVideoLink();
  } catch {
    failed.value = true;
    source.value = null;
  }
}

watch(() => [props.message.id, props.message.localPreviewUrl], () => { void load(); }, { immediate: true });
onUnmounted(() => {
  release();
  // The local copy of a file this tab sent is freed with the bubble.
  if (props.message.localPreviewUrl) URL.revokeObjectURL(props.message.localPreviewUrl);
});
</script>

<template>
  <div
    class="relative overflow-hidden rounded-2xl border bg-ink-50 w-60 max-w-full"
    :class="[isMe ? 'border-brand-200 rounded-br-xs' : 'border-ink-200 rounded-bl-xs', upload?.state === 'failed' ? 'border-danger-300' : '']"
    data-testid="chat-attachment"
    :data-upload="upload?.state"
  >
    <template v-if="source">
      <!-- Nothing is downloaded until play: a weak connection is spent only on what is watched. -->
      <video
        v-if="isVideo"
        :src="source"
        :poster="poster ?? undefined"
        controls
        playsinline
        :preload="message.localPreviewUrl ? 'metadata' : 'none'"
        class="block max-h-72 w-full bg-ink-900"
        data-testid="chat-attachment-video"
        @error="onVideoError"
        @loadeddata="onVideoPlayed"
      ></video>
      <a v-else :href="source" target="_blank" rel="noopener" class="block" aria-label="Xem ảnh lớn">
        <img :src="source" alt="Ảnh gửi trong cuộc trò chuyện" class="block max-h-72 w-full object-cover" data-testid="chat-attachment-image" />
      </a>
    </template>
    <div v-else class="flex h-32 items-center justify-center gap-1.5 px-3 text-center text-xs" :class="failed ? 'text-danger-700' : 'text-ink-500'">
      <ImageOff v-if="failed" :size="16" aria-hidden="true" />
      <Loader2 v-else :size="16" class="animate-spin" aria-hidden="true" />
      <span>{{ failed ? (isVideo ? 'Chưa tải được video' : 'Chưa tải được ảnh') : (loading ? 'Đang tải…' : 'Đang gửi…') }}</span>
      <button
        v-if="failed && isVideo && !upload"
        type="button"
        class="ml-1 font-semibold text-brand-700 hover:underline"
        data-testid="chat-attachment-video-retry"
        @click="retryVideo"
      >
        Thử lại
      </button>
    </div>

    <!-- Still sending from this tab: how far, or what went wrong and what to do. -->
    <div v-if="upload" class="border-t px-3 py-2 text-xs" :class="upload.state === 'failed' ? 'border-danger-200 bg-danger-50 text-danger-700' : 'border-ink-100 bg-white text-ink-600'" data-testid="chat-attachment-upload">
      <p class="font-medium">{{ uploadText }}</p>
      <div
        v-if="upload.state !== 'failed'"
        class="mt-1 h-1 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        :aria-valuenow="Math.round((upload.progress ?? 0) * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full bg-brand-500 transition-[width] duration-300" :style="{ width: percent }"></div>
      </div>
      <div v-else class="mt-1.5 flex gap-2">
        <button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50" data-testid="chat-attachment-retry" @click="chatStore.retryAttachment(message.clientMessageId ?? message.id)">
          <RotateCw :size="12" aria-hidden="true" /> Thử lại
        </button>
        <button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-danger-700 hover:bg-danger-100" data-testid="chat-attachment-discard" @click="chatStore.discardAttachment(message.clientMessageId ?? message.id)">
          <X :size="12" aria-hidden="true" /> Bỏ
        </button>
      </div>
    </div>
  </div>
</template>
