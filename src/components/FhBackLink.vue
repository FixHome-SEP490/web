<script setup lang="ts">
// The one "back" control at the top of a page (PO 21/10/2026): the same look on
// every customer screen, and it goes to a named place, never "wherever the
// browser was before".
import { ArrowLeft } from 'lucide-vue-next';

withDefaults(defineProps<{ label?: string }>(), { label: 'Quay lại' });
const emit = defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <button
    type="button"
    class="group inline-flex h-9 items-center gap-2 text-sm font-semibold text-ink-600 transition-colors hover:text-brand-600"
    data-testid="back-link"
    @click="emit('click')"
  >
    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 transition-colors group-hover:bg-brand-50">
      <ArrowLeft :size="15" class="text-ink-600 group-hover:text-brand-600" aria-hidden="true" />
    </span>
    <span>{{ label }}</span>
  </button>
</template>
