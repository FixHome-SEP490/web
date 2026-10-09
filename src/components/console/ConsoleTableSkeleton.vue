<script setup lang="ts">
import FhSkeleton from '../FhSkeleton.vue';

// Loading placeholder shaped like a console table: a header strip and rows.
withDefaults(defineProps<{ rows?: number; columns?: number }>(), { rows: 6, columns: 4 });
const widths = ['72%', '48%', '60%', '36%', '54%', '40%'];
</script>

<template>
  <div
    class="overflow-hidden rounded-[var(--radius-md)] border border-ink-200 bg-white"
    aria-busy="true"
    aria-label="Đang tải"
    data-testid="console-table-skeleton"
  >
    <div class="flex gap-6 border-b border-ink-100 bg-ink-25 px-6 py-3.5">
      <div v-for="c in columns" :key="c" class="flex-1"><FhSkeleton height="10px" width="40%" /></div>
    </div>
    <div v-for="r in rows" :key="r" class="flex items-center gap-6 border-b border-ink-100 px-6 py-4 last:border-b-0">
      <div v-for="c in columns" :key="c" class="flex-1 space-y-2">
        <FhSkeleton height="12px" :width="widths[(r + c) % widths.length]" />
        <FhSkeleton v-if="c === 1" height="10px" width="32%" />
      </div>
    </div>
  </div>
</template>
