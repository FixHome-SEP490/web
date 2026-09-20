<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  clickable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: string;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  clickable: false,
  padding: 'md',
  as: 'div',
});

const paddingClasses = computed(() => {
  switch (props.padding) {
    case 'none':
      return 'p-0';
    case 'sm':
      return 'p-3 sm:p-4';
    case 'lg':
      return 'p-6 sm:p-8';
    case 'md':
    default:
      return 'p-5 sm:p-6';
  }
});
</script>

<template>
  <component
    :is="as"
    class="bg-white rounded-md border border-ink-200 shadow-(--shadow-e1) transition-all duration-120 overflow-hidden"
    :class="[
      paddingClasses,
      {
        'hover:shadow-(--shadow-e2) hover:-translate-y-px cursor-pointer': clickable,
      },
    ]"
  >
    <div v-if="title || $slots.action" class="flex items-center justify-between mb-4">
      <h2 v-if="title" class="text-lg font-bold text-ink-900">{{ title }}</h2>
      <slot name="action" />
    </div>
    <slot />
  </component>
</template>
