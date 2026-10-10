<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

withDefaults(defineProps<{ page: number; totalPages: number; disabled?: boolean }>(), { disabled: false });
defineEmits<{ (e: 'update:page', value: number): void }>();
</script>

<template>
  <nav v-if="totalPages > 1" class="flex items-center justify-end gap-2 text-sm text-ink-600" aria-label="Phân trang">
    <span class="whitespace-nowrap font-num">Trang {{ page }}/{{ totalPages }}</span>
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-ink-200 bg-white transition-colors hover:bg-ink-50 disabled:opacity-40"
      aria-label="Trang trước"
      :disabled="disabled || page <= 1"
      @click="$emit('update:page', page - 1)"
    >
      <ChevronLeft :size="16" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-ink-200 bg-white transition-colors hover:bg-ink-50 disabled:opacity-40"
      aria-label="Trang sau"
      :disabled="disabled || page >= totalPages"
      @click="$emit('update:page', page + 1)"
    >
      <ChevronRight :size="16" aria-hidden="true" />
    </button>
  </nav>
</template>
