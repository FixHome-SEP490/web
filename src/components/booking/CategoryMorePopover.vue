<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

defineProps<{
  categories: { id: string; name: string; count?: number }[];
  modelValue: string;
}>();
const emit = defineEmits<{ (e: 'select', id: string): void }>();
const panelId = useId();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const toggle = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const panelLeft = ref(0);

function positionPanel() {
  const anchor = root.value?.getBoundingClientRect();
  if (!anchor) return;
  const width = Math.min(256, window.innerWidth - 32);
  const left = Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16));
  panelLeft.value = left - anchor.left;
}

async function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    positionPanel();
    await nextTick();
    panel.value?.querySelector<HTMLButtonElement>('button')?.focus();
  }
}
function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) toggle.value?.focus();
}
function choose(id: string) {
  emit('select', id);
  close(true);
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
function focusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close();
}
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', positionPanel);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('resize', positionPanel);
});
</script>

<template>
  <div ref="root" class="relative min-w-0" @focusout="focusOut" @keydown.esc.stop.prevent="close(true)">
    <button
      ref="toggle"
      type="button"
      class="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-[var(--radius-md)] border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="panelId"
      data-testid="category-more-toggle"
      @click="toggleOpen"
    >Xem thêm danh mục <ChevronDown :size="14" aria-hidden="true" /></button>
    <div
      v-if="open"
      :id="panelId"
      ref="panel"
      role="dialog"
      aria-label="Danh mục khác"
      :style="{ left: `${panelLeft}px` }"
      class="absolute top-full z-20 mt-2 max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[var(--radius-md)] border border-ink-200 bg-white p-2 shadow-[var(--shadow-e2)]"
    >
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="block min-h-11 w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-ink-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
        :aria-pressed="modelValue === category.id"
        :data-category-id="category.id"
        @click="choose(category.id)"
      >{{ category.name }}<template v-if="category.count !== undefined"> ({{ category.count }})</template></button>
    </div>
  </div>
</template>
