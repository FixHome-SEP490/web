<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { Download, X, ZoomIn, ZoomOut } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  open: boolean;
  src: string | null;
  alt?: string;
  caption?: string | null;
  downloadName?: string;
}>(), {
  alt: 'Ảnh phóng to',
  caption: null,
  downloadName: 'fixhome-chat-image.jpg',
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const zoomed = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow: string | null = null;

function close() {
  emit('close');
}

function toggleZoom() {
  zoomed.value = !zoomed.value;
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  } else if (event.key === '+' || event.key === '=') {
    zoomed.value = true;
  } else if (event.key === '-') {
    zoomed.value = false;
  }
}

function lockBodyAndFocus() {
  if (typeof document === 'undefined') return;
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (previousBodyOverflow === null) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  window.addEventListener('keydown', onKeydown);
  void nextTick(() => {
    closeBtn.value?.focus();
  });
}

function unlockBodyAndRestoreFocus() {
  if (typeof document === 'undefined') return;
  window.removeEventListener('keydown', onKeydown);
  if (previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
  previouslyFocused?.focus();
  previouslyFocused = null;
}

watch(
  () => props.open,
  (isOpen) => {
    zoomed.value = false;
    if (isOpen) lockBodyAndFocus();
    else unlockBodyAndRestoreFocus();
  },
);

onUnmounted(() => {
  unlockBodyAndRestoreFocus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div
        v-if="open && src"
        class="fixed inset-0 z-[80] flex flex-col bg-ink-950/92 backdrop-blur-xs select-none"
        role="dialog"
        aria-modal="true"
        :aria-label="alt"
        data-testid="chat-image-lightbox"
        @click.self="close"
      >
        <!-- Top minimal control bar -->
        <div
          class="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 shrink-0"
          @click.self="close"
        >
          <span class="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-xs">
            Ảnh đính kèm
          </span>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-[0.96] motion-reduce:active:scale-100 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 cursor-pointer"
              :aria-pressed="zoomed"
              :aria-label="zoomed ? 'Thu nhỏ ảnh' : 'Phóng to ảnh'"
              :title="zoomed ? 'Thu nhỏ' : 'Phóng to'"
              data-testid="chat-lightbox-zoom"
              @click="toggleZoom"
            >
              <ZoomOut v-if="zoomed" :size="19" :stroke-width="1.75" aria-hidden="true" />
              <ZoomIn v-else :size="19" :stroke-width="1.75" aria-hidden="true" />
            </button>

            <a
              :href="src"
              :download="downloadName"
              class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-[0.96] motion-reduce:active:scale-100 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label="Tải ảnh xuống"
              title="Tải ảnh xuống"
              data-testid="chat-lightbox-download"
            >
              <Download :size="19" :stroke-width="1.75" aria-hidden="true" />
            </a>

            <button
              ref="closeBtn"
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-[0.96] motion-reduce:active:scale-100 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 cursor-pointer"
              aria-label="Đóng xem ảnh"
              title="Đóng (Esc)"
              data-testid="chat-lightbox-close"
              @click="close"
            >
              <X :size="20" :stroke-width="1.75" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- Centered image stage -->
        <div
          class="fh-modal-panel flex-1 min-h-0 flex p-4 sm:p-6 pt-1"
          :class="zoomed ? 'overflow-auto items-start justify-start sm:justify-center' : 'overflow-hidden items-center justify-center'"
          @click.self="close"
        >
          <img
            :src="src"
            :alt="alt"
            data-testid="chat-lightbox-image"
            class="rounded-xl shadow-2xl object-contain transition-[transform,max-width,max-height] duration-200 motion-reduce:transition-none"
            :class="
              zoomed
                ? 'w-auto h-auto max-w-none max-h-none min-w-[min(92vw,720px)] cursor-zoom-out m-auto'
                : 'max-h-[78dvh] max-w-full cursor-zoom-in'
            "
            @click="toggleZoom"
          />
        </div>

        <!-- Optional message caption -->
        <div
          v-if="caption && caption.trim()"
          class="px-4 pb-5 sm:px-6 shrink-0 flex justify-center"
          @click.self="close"
        >
          <p
            data-testid="chat-lightbox-caption"
            class="max-w-xl rounded-2xl bg-ink-900/85 border border-white/10 px-4 py-2.5 text-sm text-white/95 text-center leading-relaxed text-pretty backdrop-blur-sm select-text"
          >
            {{ caption.trim() }}
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
