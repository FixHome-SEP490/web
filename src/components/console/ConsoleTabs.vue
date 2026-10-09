<script setup lang="ts" generic="T extends string">
// Underline tabs above a list; the count sits next to the label and never wraps.
defineProps<{ tabs: { key: T; label: string; count?: number | null }[] }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="flex gap-6 overflow-x-auto border-b border-ink-200" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      :aria-selected="model === tab.key"
      class="-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      :class="model === tab.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'"
      @click="model = tab.key"
    >
      {{ tab.label }}
      <span
        v-if="tab.count != null"
        class="rounded-full bg-ink-100 px-2 py-0.5 font-num text-xs font-semibold text-ink-600"
      >{{ tab.count }}</span>
    </button>
  </div>
</template>
