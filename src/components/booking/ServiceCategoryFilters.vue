<script setup lang="ts">
// Named filters only: changing category never changes the selected service.
import { computed } from 'vue';
import FhSkeleton from '../FhSkeleton.vue';
import CategoryMorePopover from './CategoryMorePopover.vue';

export interface CategoryFilterItem {
  id: string;
  name: string;
  count: number;
}

const props = withDefaults(defineProps<{
  categories: CategoryFilterItem[];
  modelValue: string;
  loading?: boolean;
}>(), { loading: false });
const emit = defineEmits<{ (e: 'update:modelValue', id: string): void }>();
const totalCount = computed(() => props.categories.reduce((sum, cat) => sum + cat.count, 0));
const extraCategories = computed(() => props.categories.slice(3));
const options = computed(() => [
  { id: '', name: 'Tất cả', count: totalCount.value },
  ...props.categories.slice(0, 3),
  ...extraCategories.value.filter((cat) => cat.id === props.modelValue),
]);
</script>

<template>
  <div v-if="loading" aria-busy="true" aria-label="Đang tải nhóm dịch vụ" data-testid="booking-categories-skeleton">
    <FhSkeleton width="100%" height="48px" rounded="md" />
  </div>
  <div v-else class="space-y-2">
    <p class="text-xs font-semibold text-ink-700">Nhóm dịch vụ</p>
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo nhóm dịch vụ">
      <button
        v-for="cat in options"
        :key="cat.id"
        type="button"
        class="min-h-8 pointer-coarse:min-h-11 whitespace-nowrap rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        :class="modelValue === cat.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-brand-300 hover:bg-white'"
        :aria-pressed="modelValue === cat.id"
        :data-category-id="cat.id"
        data-testid="booking-category-filter"
        @click="emit('update:modelValue', cat.id)"
      >{{ cat.name }}</button>
      <CategoryMorePopover v-if="extraCategories.length" compact :categories="extraCategories" :model-value="modelValue" @select="emit('update:modelValue', $event)" />
    </div>
  </div>
</template>
