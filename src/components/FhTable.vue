<script setup lang="ts" generic="TRow extends object">
import { Loader2, Search } from 'lucide-vue-next';
import { computed } from 'vue';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  sortable?: boolean;
}

interface Props {
  columns: TableColumn[];
  rows: TRow[];
  loading?: boolean;
  emptyText?: string;
  selectable?: boolean;
  selected?: TRow[];
  sortBy?: string;
  sortDesc?: boolean;
  searchable?: boolean;
  searchQuery?: string;
  searchPlaceholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  emptyText: 'Không có dữ liệu',
  selectable: false,
  selected: () => [],
  searchable: false,
  searchQuery: '',
  searchPlaceholder: 'Tìm kiếm...',
});

const emit = defineEmits<{
  (e: 'update:selected', value: TRow[]): void;
  (e: 'sort', key: string): void;
  (e: 'update:searchQuery', value: string): void;
}>();

defineSlots<{
  [name: string]: (props: { row: TRow; value: TRow[keyof TRow]; column: TableColumn }) => unknown;
  toolbar: () => unknown;
  title: () => unknown;
}>();

const getCellValue = (row: TRow, key: string): TRow[keyof TRow] =>
  (row as Record<string, TRow[keyof TRow]>)[key];

const isAllSelected = computed(() => {
  return props.rows.length > 0 && props.selected.length === props.rows.length;
});

const isSomeSelected = computed(() => {
  return props.selected.length > 0 && props.selected.length < props.rows.length;
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    emit('update:selected', []);
  } else {
    emit('update:selected', [...props.rows]);
  }
};

const toggleSelect = (row: TRow) => {
  const index = props.selected.findIndex(r => r === row);
  if (index >= 0) {
    const next = [...props.selected];
    next.splice(index, 1);
    emit('update:selected', next);
  } else {
    emit('update:selected', [...props.selected, row]);
  }
};
</script>

<template>
  <div class="w-full overflow-x-auto rounded-md border border-ink-200 bg-white shadow-(--shadow-e1)">
    <!-- Optional Toolbar/Header for Search & Filters -->
    <div v-if="$slots.toolbar || searchable || $slots.title" class="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-ink-200 bg-white/50">
      <div v-if="$slots.title" class="font-bold text-gray-900 tracking-tight">
        <slot name="title"></slot>
      </div>
      
      <div v-if="searchable" class="relative flex-1 max-w-sm" :class="{ 'ml-4': $slots.title }">
        <Search :size="16" class="absolute left-3 top-2.5 text-gray-400" />
        <input 
          :value="searchQuery"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          type="search" 
          :placeholder="searchPlaceholder" 
          class="w-full h-9 pl-9 pr-4 text-sm bg-gray-50 border-none rounded-md focus:ring-2 focus:ring-brand-100 transition-colors placeholder:text-gray-400"
        />
      </div>

      <div v-if="$slots.toolbar" class="flex items-center gap-4 ml-auto">
        <slot name="toolbar"></slot>
      </div>
    </div>

    <table class="w-full border-collapse text-left text-sm">
      <!-- Sticky Overline Header -->
      <thead class="sticky top-0 bg-white border-b border-ink-200 z-10">
        <tr>
          <th v-if="selectable" class="px-5 py-3 w-12.5 border-b border-ink-200 text-left">
            <input 
              type="checkbox" 
              class="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              :checked="isAllSelected"
              :indeterminate="isSomeSelected"
              @change="toggleSelectAll"
            />
          </th>
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-5 py-3 text-xs text-ink-500 uppercase font-semibold select-none border-b border-ink-200"
            :class="[
              col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
              col.sortable ? 'cursor-pointer hover:bg-gray-50' : ''
            ]"
            :style="{ width: col.width }"
            @click="col.sortable ? emit('sort', col.key) : undefined"
          >
            <div class="flex items-center gap-1.5" :class="[col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start']">
              <slot :name="`header-${col.key}`" :column="col" :row="{} as TRow" :value="'' as TRow[keyof TRow]">
                {{ col.label }}
              </slot>
              <div v-if="col.sortable" class="flex flex-col opacity-50">
                <svg width="8" height="10" viewBox="0 0 8 10" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-ink-400">
                  <path d="M4 0L8 4H0L4 0Z" :fill="sortBy === col.key && !sortDesc ? '#4F46E5' : 'currentColor'" />
                  <path d="M4 10L0 6H8L4 10Z" :fill="sortBy === col.key && sortDesc ? '#4F46E5' : 'currentColor'" />
                </svg>
              </div>
            </div>
          </th>
        </tr>
      </thead>

      <!-- Body: 56px rows, hover ink-25, no zebra -->
      <tbody class="divide-y divide-ink-100">
        <tr v-if="loading">
          <td :colspan="columns.length" class="h-40 text-center text-ink-500">
            <div class="inline-flex items-center gap-2">
              <Loader2 class="animate-spin text-brand-600" :size="20" />
              <span>Đang tải dữ liệu...</span>
            </div>
          </td>
        </tr>

        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length" class="h-32 text-center text-ink-500">
            {{ emptyText }}
          </td>
        </tr>

        <tr
          v-for="(row, rIdx) in rows"
          v-else
          :key="rIdx"
          class="h-16 transition-colors duration-100 hover:bg-gray-50 border-b border-ink-100 last:border-0 bg-white"
        >
          <td v-if="selectable" class="px-5 py-3 border-b border-ink-100 text-left">
            <input 
              type="checkbox" 
              class="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              :checked="selected.includes(row)"
              @change="toggleSelect(row)"
            />
          </td>
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-5 py-3 text-ink-900 border-b border-ink-100"
            :class="[
              col.align === 'right' ? 'text-right font-num' : col.align === 'center' ? 'text-center' : 'text-left',
            ]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="getCellValue(row, col.key)" :column="col">
              <slot :name="`cell(${col.key})`" :row="row" :value="getCellValue(row, col.key)" :column="col">
                {{ getCellValue(row, col.key) }}
              </slot>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
