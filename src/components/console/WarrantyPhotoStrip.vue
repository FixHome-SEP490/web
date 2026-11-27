<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { isSafeEvidenceLink } from '../../pages/console/support-cases.utils';

const props = defineProps<{ urls?: string[] | null; label: string }>();

const safeUrls = computed(() => (props.urls ?? []).filter(isSafeEvidenceLink));
const opened = ref<number | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let opener: HTMLElement | null = null;

async function open(index: number, event: Event) {
  opener = event.currentTarget as HTMLElement;
  opened.value = index;
  await nextTick();
  closeButton.value?.focus();
}

function close() {
  opened.value = null;
  opener?.focus();
}

function step(delta: number) {
  if (opened.value === null) return;
  opened.value = (opened.value + delta + safeUrls.value.length) % safeUrls.value.length;
}
</script>

<template>
  <div v-if="safeUrls.length" class="flex flex-wrap gap-2">
    <button
      v-for="(url, index) in safeUrls"
      :key="url"
      type="button"
      class="overflow-hidden rounded-lg border border-ink-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      :aria-label="`${label} ${index + 1}/${safeUrls.length}, bấm để phóng to`"
      @click="open(index, $event)"
    >
      <img :src="url" alt="" loading="lazy" class="h-16 w-20 object-cover" />
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="opened !== null"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="`${label} ${opened + 1}/${safeUrls.length}`"
      @click.self="close"
      @keydown.esc="close"
      @keydown.left="step(-1)"
      @keydown.right="step(1)"
    >
      <button
        ref="closeButton"
        type="button"
        class="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label="Đóng ảnh"
        @click="close"
      >
        <X :size="20" />
      </button>
      <img :src="safeUrls[opened]" :alt="label" class="max-h-full max-w-full rounded-lg object-contain" />
      <div v-if="safeUrls.length > 1" class="absolute bottom-4 flex items-center gap-3 text-sm text-white">
        <button type="button" class="rounded-lg bg-white/20 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" @click="step(-1)">Ảnh trước</button>
        <span class="font-num">{{ opened + 1 }}/{{ safeUrls.length }}</span>
        <button type="button" class="rounded-lg bg-white/20 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" @click="step(1)">Ảnh sau</button>
      </div>
    </div>
  </Teleport>
</template>
