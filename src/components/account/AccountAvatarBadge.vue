<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  name?: string | null;
  avatarUrl?: string | null;
  open?: boolean;
  showChevron?: boolean;
  size?: 'sm' | 'md';
}>(), {
  name: '',
  avatarUrl: null,
  open: false,
  showChevron: true,
  size: 'md',
});

const initial = computed(() => props.name?.trim().charAt(0).toUpperCase() || 'U');
</script>

<template>
  <span class="relative inline-flex shrink-0 items-center justify-center">
    <span
      class="flex items-center justify-center overflow-hidden rounded-full bg-brand-50 font-semibold text-brand-700 transition-[box-shadow,border-color] duration-150"
      :class="[
        size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm',
        open
          ? 'ring-2 ring-brand-500/30 border border-brand-500'
          : 'ring-1 ring-brand-200/80 group-hover:ring-brand-300',
      ]"
    >
      <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover" />
      <span v-else>{{ initial }}</span>
    </span>
    <span
      v-if="showChevron"
      class="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-ink-600 shadow-2xs ring-1 ring-ink-200 transition-colors"
      :class="open ? 'text-brand-600 ring-brand-300' : 'group-hover:text-ink-900'"
      aria-hidden="true"
    >
      <ChevronDown
        :size="10"
        :stroke-width="2.5"
        class="transition-transform duration-200 motion-reduce:transition-none"
        :class="open ? 'rotate-180' : ''"
      />
    </span>
  </span>
</template>

