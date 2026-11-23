<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { ChevronDown, MoreHorizontal } from 'lucide-vue-next';

// The "⋯" menu that holds secondary actions. The panel is teleported to body
// with fixed viewport coordinates so transformed ancestors (.animate-slide-up)
// and overflow-hidden table wrappers never offset or clip it.
withDefaults(defineProps<{
  label?: string;
  showLabel?: boolean;
  buttonLabel?: string;
}>(), {
  label: 'Thao tác khác',
  showLabel: false,
  buttonLabel: 'Thao tác',
});

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({});
const panelId = useId();

function place() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect || typeof window === 'undefined') return;
  const below = window.innerHeight - rect.bottom;
  panelStyle.value = {
    position: 'fixed',
    right: `${Math.max(8, window.innerWidth - rect.right)}px`,
    ...(below < 220 && rect.top > below
      ? { bottom: `${window.innerHeight - rect.top + 4}px` }
      : { top: `${rect.bottom + 4}px` }),
  };
}
function toggle() {
  if (!open.value) place();
  open.value = !open.value;
}
function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function onOutside(event: PointerEvent) {
  if (!open.value || !(event.target instanceof Node)) return;
  if (root.value?.contains(event.target) || panel.value?.contains(event.target)) return;
  close();
}
function onViewportChange() {
  if (open.value) close();
}
onMounted(() => {
  document.addEventListener('pointerdown', onOutside);
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside);
  window.removeEventListener('scroll', onViewportChange, true);
  window.removeEventListener('resize', onViewportChange);
});
</script>

<template>
  <div ref="root" class="relative inline-flex" @keydown.esc.stop="close(true)">
    <button
      ref="trigger"
      type="button"
      :class="[
        showLabel
          ? 'inline-flex h-9 px-3 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium transition-colors hover:bg-slate-50 hover:text-slate-900 shadow-xs'
          : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
      ]"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="toggle"
    >
      <MoreHorizontal :size="showLabel ? 16 : 18" aria-hidden="true" />
      <span v-if="showLabel">{{ buttonLabel }}</span>
      <ChevronDown v-if="showLabel" :size="14" aria-hidden="true" class="text-slate-400" />
    </button>
    <Teleport to="body">
      <div
        v-show="open"
        :id="panelId"
        ref="panel"
        role="menu"
        class="z-[70] min-w-52 rounded-xl border border-ink-200 bg-white p-1 text-left shadow-[var(--shadow-e3)]"
        :style="panelStyle"
        @click="close()"
        @keydown.esc.stop="close(true)"
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>
