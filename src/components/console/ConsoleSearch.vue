<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { consoleSearchField } from './console-ui';

withDefaults(defineProps<{ placeholder?: string; label?: string; maxlength?: number }>(), {
  placeholder: 'Tìm kiếm',
  label: 'Tìm kiếm',
  maxlength: 200,
});
const model = defineModel<string>({ default: '' });
</script>

<template>
  <div class="relative w-full min-w-0 sm:w-72">
    <Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
    <input
      v-model="model"
      type="search"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-label="label"
      :class="consoleSearchField"
    />
  </div>
</template>
