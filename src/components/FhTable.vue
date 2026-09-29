<script setup lang="ts" generic="TRow extends object">
import { Loader2, Search, RefreshCw, MoreHorizontal } from 'lucide-vue-next';
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
  refreshable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  emptyText: 'Không có dữ liệu',
  selectable: false,
  selected: () => [],
  searchable: false,
  searchQuery: '',
  searchPlaceholder: 'Tìm kiếm...',
  refreshable: false,
});

const emit = defineEmits<{
  (e: 'update:selected', value: TRow[]): void;
  (e: 'sort', key: string): void;
  (e: 'update:searchQuery', value: string): void;
  (e: 'refresh'): void;
}>();

defineSlots<{
  [name: string]: (props: { row: TRow; value: TRow[keyof TRow]; column: TableColumn }) => unknown;
  toolbar: () => unknown;
  'toolbar-left': () => unknown;
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
  <div class="w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xl shadow-gray-200/40">
    <!-- Premium Header Toolbar -->
    <div v-if="$slots.toolbar || $slots['toolbar-left'] || searchable || refreshable" 
         class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 lg:px-6 border-b border-gray-100 bg-white relative z-20">
      
      <!-- Left Area: Search Bar & Left Toolbar -->
      <div class="flex flex-1 items-center gap-3 w-full sm:max-w-xl">
        <div v-if="searchable" class="relative group w-full">
          <Search :size="16" class="absolute left-3.5 top-2.5 text-gray-400 group-focus-within:text-brand-500 transition-colors" />
          <input 
            :value="searchQuery"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            type="search" 
            :placeholder="searchPlaceholder" 
            class="w-full h-10 pl-10 pr-4 text-sm bg-gray-50/80 border border-gray-200/80 rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white transition-all placeholder:text-gray-400 text-gray-800 font-medium"
          />
        </div>
        <slot name="toolbar-left"></slot>
      </div>
      
      <!-- Right Area: Custom Toolbar & Actions -->
      <div class="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">

        <!-- Custom Toolbar Slot -->
        <div v-if="$slots.toolbar" class="flex items-center gap-2">
          <slot name="toolbar"></slot>
        </div>

        <!-- Refresh Button -->
        <button 
          v-if="refreshable" 
          @click="emit('refresh')"
          class="flex items-center justify-center h-10 w-10 bg-white border border-gray-200/80 rounded-xl hover:bg-gray-50 text-gray-600 hover:text-brand-600 transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 active:scale-95"
          :class="{ 'opacity-50 pointer-events-none': loading }"
          title="Làm mới"
        >
          <RefreshCw :size="16" stroke-width="2.5" :class="{ 'animate-spin': loading }" />
        </button>
        
        <!-- Default list options button (ellipsis) if user desires it -->
        <button v-if="searchable || refreshable" class="flex sm:hidden items-center justify-center h-10 w-10 bg-white border border-gray-200/80 rounded-xl hover:bg-gray-50 text-gray-600 transition-all shadow-sm">
           <MoreHorizontal :size="16" />
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm whitespace-nowrap">
        <!-- Sticky Header -->
        <thead class="bg-gray-50/80 border-b border-gray-100">
          <tr>
            <th v-if="selectable" class="px-6 py-4 w-12 border-b border-gray-100 text-left">
              <input 
                type="checkbox" 
                class="w-4.5 h-4.5 rounded-[4px] border-gray-300 text-brand-600 focus:ring-brand-500/20 focus:ring-offset-0 cursor-pointer shadow-sm transition-all"
                :checked="isAllSelected"
                :indeterminate="isSomeSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              class="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider font-bold select-none border-b border-gray-100"
              :class="[
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.sortable ? 'cursor-pointer hover:bg-gray-200/50 transition-colors' : ''
              ]"
              :style="{ width: col.width }"
              @click="col.sortable ? emit('sort', col.key) : undefined"
            >
              <div class="flex items-center gap-2" :class="[col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start']">
                <slot :name="`header-${col.key}`" :column="col" :row="{} as TRow" :value="'' as TRow[keyof TRow]">
                  {{ col.label }}
                </slot>
                <div v-if="col.sortable" class="flex flex-col opacity-50">
                  <svg width="8" height="10" viewBox="0 0 8 10" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-gray-400">
                    <path d="M4 0L8 4H0L4 0Z" :fill="sortBy === col.key && !sortDesc ? '#4F46E5' : 'currentColor'" />
                    <path d="M4 10L0 6H8L4 10Z" :fill="sortBy === col.key && sortDesc ? '#4F46E5' : 'currentColor'" />
                  </svg>
                </div>
              </div>
            </th>
          </tr>
        </thead>

        <!-- Body -->
        <tbody class="divide-y divide-gray-100">
          <tr v-if="loading">
            <td :colspan="selectable ? columns.length + 1 : columns.length" class="h-48 text-center text-gray-500 bg-white">
              <div class="flex flex-col items-center justify-center gap-3">
                <div class="h-10 w-10 rounded-full bg-brand-50 flex items-center justify-center">
                  <Loader2 class="animate-spin text-brand-600" :size="20" stroke-width="2.5" />
                </div>
                <span class="font-medium text-sm">Đang tải dữ liệu...</span>
              </div>
            </td>
          </tr>

          <tr v-else-if="rows.length === 0">
            <td :colspan="selectable ? columns.length + 1 : columns.length" class="h-48 text-center text-gray-500 bg-white">
              <div class="flex flex-col items-center justify-center gap-3">
                <div class="h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
                  <Search class="text-gray-400" :size="24" stroke-width="1.5" />
                </div>
                <span class="font-medium text-sm">{{ emptyText }}</span>
              </div>
            </td>
          </tr>

          <tr
            v-for="(row, rIdx) in rows"
            v-else
            :key="rIdx"
            class="group h-16 transition-all duration-200 hover:bg-brand-50/30 bg-white hover:shadow-[inset_4px_0_0_0_#4F46E5]"
          >
            <td v-if="selectable" class="px-6 py-4 text-left">
              <input 
                type="checkbox" 
                class="w-4.5 h-4.5 rounded-[4px] border-gray-300 text-brand-600 focus:ring-brand-500/20 focus:ring-offset-0 cursor-pointer shadow-sm transition-all"
                :checked="selected.includes(row)"
                @change="toggleSelect(row)"
              />
            </td>
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-6 py-4 text-gray-800"
              :class="[
                col.align === 'right' ? 'text-right font-num' : col.align === 'center' ? 'text-center' : 'text-left',
              ]"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="getCellValue(row, col.key)" :column="col">
                <slot :name="`cell(${col.key})`" :row="row" :value="getCellValue(row, col.key)" :column="col">
                  <span class="font-medium">{{ getCellValue(row, col.key) }}</span>
                </slot>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
