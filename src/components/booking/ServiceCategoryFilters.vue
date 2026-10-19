<script setup lang="ts">
// Named filters only: changing category never changes the selected service.
// A native picker keeps the full catalog reachable without a wall of chips.
import { computed, useId } from 'vue';
import FhSkeleton from '../FhSkeleton.vue';

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
const pickerId = useId();
const totalCount = computed(() => props.categories.reduce((sum, cat) => sum + cat.count, 0));
const options = computed(() => [
  { id: '', name: 'Tất cả', count: totalCount.value },
  ...props.categories,
]);
</script>

<template>
  <div v-if="loading" aria-busy="true" aria-label="Đang tải nhóm dịch vụ" data-testid="booking-categories-skeleton">
    <FhSkeleton width="100%" height="48px" rounded="md" />
  </div>
  <div v-else class="space-y-2">
    <label v-if="categories.length > 5" :for="pickerId" class="block text-xs font-semibold text-ink-700">Nhóm dịch vụ</label>
    <p v-else class="text-xs font-semibold text-ink-700">Nhóm dịch vụ</p>
    <select
      v-if="categories.length > 5"
      :id="pickerId"
      :value="modelValue"
      class="min-h-12 w-full min-w-0 rounded-[var(--radius-md)] border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-2 focus:outline-brand-600"
      data-testid="booking-category-picker"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="cat in options" :key="cat.id" :value="cat.id">{{ cat.name }} ({{ cat.count }})</option>
    </select>
    <div v-else class="flex flex-wrap gap-2" role="group" aria-label="Lọc theo nhóm dịch vụ">
      <button
        v-for="cat in options"
        :key="cat.id"
        type="button"
        class="min-h-11 rounded-[var(--radius-md)] border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        :class="modelValue === cat.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-brand-300 hover:bg-white'"
        :aria-pressed="modelValue === cat.id"
        :data-category-id="cat.id"
        data-testid="booking-category-filter"
        @click="emit('update:modelValue', cat.id)"
      >{{ cat.name }} ({{ cat.count }})</button>
    </div>
  </div>
</template>
