<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next';

// One header for every console page: title on the left, at most one primary
// action and the "⋯" menu on the right (PO 10/10/2026).
withDefaults(defineProps<{
  title: string;
  count?: number | string | null;
  backTo?: string;
  backLabel?: string;
}>(), {
  count: null,
  backTo: '',
  backLabel: 'Quay lại',
});
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <div class="min-w-0">
      <router-link
        v-if="backTo"
        :to="backTo"
        class="mb-1 inline-flex items-center gap-1 whitespace-nowrap rounded text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ChevronLeft :size="16" aria-hidden="true" />
        {{ backLabel }}
      </router-link>
      <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-2xl font-bold tracking-tight text-ink-900 text-balance">{{ title }}</h1>
        <span
          v-if="count !== null && count !== ''"
          class="whitespace-nowrap font-num text-base font-medium text-ink-500"
          data-testid="page-count"
        >{{ count }}</span>
        <slot name="badges" />
      </div>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
