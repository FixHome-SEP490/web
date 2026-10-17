<script setup lang="ts">
// The photo or short video of one chat message (PO 18/10/2026). Its bytes come
// through the authenticated proxy, never a public link; while a picked file is
// still uploading, the local copy shows instead.
import { onUnmounted, ref, watch } from 'vue';
import { ImageOff, Loader2 } from 'lucide-vue-next';
import { messagingApi, type ChatMessage } from '../../api/messaging.api';

const props = defineProps<{ message: ChatMessage; isMe: boolean }>();

const source = ref<string | null>(props.message.localPreviewUrl ?? null);
const failed = ref(false);
const loading = ref(false);
let owned: string | null = null;

const release = () => {
  if (owned) URL.revokeObjectURL(owned);
  owned = null;
};

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

watch(() => [props.message.id, props.message.localPreviewUrl], () => { void load(); }, { immediate: true });
onUnmounted(() => {
  release();
  // The local copy of a file this tab sent is freed with the bubble.
  if (props.message.localPreviewUrl) URL.revokeObjectURL(props.message.localPreviewUrl);
});
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border bg-ink-50 w-60 max-w-full"
    :class="isMe ? 'border-brand-200 rounded-br-xs' : 'border-ink-200 rounded-bl-xs'"
    data-testid="chat-attachment"
  >
    <template v-if="source">
      <video
        v-if="message.attachment?.kind === 'video'"
        :src="source"
        controls
        playsinline
        preload="metadata"
        class="block max-h-72 w-full bg-ink-900"
        data-testid="chat-attachment-video"
      ></video>
      <a v-else :href="source" target="_blank" rel="noopener" class="block" aria-label="Xem ảnh lớn">
        <img :src="source" alt="Ảnh gửi trong cuộc trò chuyện" class="block max-h-72 w-full object-cover" data-testid="chat-attachment-image" />
      </a>
    </template>
    <div v-else class="flex h-32 items-center justify-center gap-1.5 px-3 text-center text-xs" :class="failed ? 'text-danger-700' : 'text-ink-500'">
      <ImageOff v-if="failed" :size="16" aria-hidden="true" />
      <Loader2 v-else :size="16" class="animate-spin" aria-hidden="true" />
      <span>{{ failed ? (message.attachment?.kind === 'video' ? 'Chưa tải được video' : 'Chưa tải được ảnh') : (loading ? 'Đang tải…' : 'Đang gửi…') }}</span>
    </div>
  </div>
</template>
