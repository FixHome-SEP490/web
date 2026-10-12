<script setup lang="ts">
// Numbered pager shared by every list (customer, technician and console):
// "1–20 / 57" on the left, Trước · 1 2 3 … 9 · Sau on the right. On a phone
// only the current page number shows between Trước and Sau. Hidden when the
// list fits on one page.
import { computed, ref } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { pageItems, pageRangeLabel } from '../utils/pagination';

const props = withDefaults(
  defineProps<{
    page: number;
    pageSize?: number;
    total?: number | null;
    /** For lists that only know how many pages there are. */
    totalPages?: number | null;
    disabled?: boolean;
  }>(),
  { pageSize: 20, total: null, totalPages: null, disabled: false },
);

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  /** The pointer or focus is on a page button: the list may read that page ahead. */
  (e: 'prefetch', value: number): void;
}>();
const root = ref<HTMLElement | null>(null);

const count = computed(() => {
  if (props.totalPages != null) return Math.max(0, Math.floor(props.totalPages));
  if (props.total != null && props.pageSize > 0) return Math.ceil(Math.max(0, props.total) / props.pageSize);
  return 0;
});
const current = computed(() => Math.min(Math.max(1, props.page), Math.max(1, count.value)));
const items = computed(() => pageItems(current.value, count.value));
const summary = computed(() =>
  props.total != null && props.pageSize > 0
    ? pageRangeLabel(current.value, props.pageSize, props.total)
    : `Trang ${current.value}/${count.value}`,
);

function go(target: number) {
  if (props.disabled || target < 1 || target > count.value || target === current.value) return;
  emit('update:page', target);
  // Paging from the bottom of a long list: bring the top of the list back into view.
  const list = root.value?.parentElement;
  if (list && typeof list.getBoundingClientRect === 'function' && list.getBoundingClientRect().top < 0) {
    list.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }
}

function intent(target: number) {
  if (props.disabled || target < 1 || target > count.value || target === current.value) return;
  emit('prefetch', target);
}

// No display class here: each button sets its own, so `hidden sm:inline-flex`
// really hides the other page numbers on a phone (an `inline-flex` here won).
const button =
  'h-9 items-center justify-center rounded-[var(--radius-sm)] border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40';
const idle = 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50';
const active = 'border-brand-600 bg-brand-50 font-semibold text-brand-700';
</script>

<template>
  <nav
    v-if="count > 1"
    ref="root"
    class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1 text-sm text-ink-600"
    aria-label="Phân trang"
    data-testid="pagination"
  >
    <span class="whitespace-nowrap font-num" data-testid="pagination-summary">{{ summary }}</span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :class="[button, idle, 'inline-flex gap-1 px-2.5']"
        aria-label="Trang trước"
        :disabled="disabled || current <= 1"
        data-testid="pagination-prev"
        @click="go(current - 1)"
        @pointerenter="intent(current - 1)"
        @focus="intent(current - 1)"
      >
        <ChevronLeft :size="16" aria-hidden="true" />
        <span class="hidden sm:inline">Trước</span>
      </button>
      <template v-for="(item, index) in items" :key="item === 'gap' ? `gap-${index}` : item">
        <span v-if="item === 'gap'" class="hidden w-7 text-center text-ink-400 sm:inline-block" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="[button, item === current ? active : idle, item === current ? 'inline-flex' : 'hidden sm:inline-flex', 'min-w-9 px-2 font-num']"
          :aria-label="`Trang ${item}`"
          :aria-current="item === current ? 'page' : undefined"
          :disabled="disabled && item !== current"
          :data-testid="`pagination-page-${item}`"
          @click="go(item)"
          @pointerenter="intent(item)"
          @focus="intent(item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        type="button"
        :class="[button, idle, 'inline-flex gap-1 px-2.5']"
        aria-label="Trang sau"
        :disabled="disabled || current >= count"
        data-testid="pagination-next"
        @click="go(current + 1)"
        @pointerenter="intent(current + 1)"
        @focus="intent(current + 1)"
      >
        <span class="hidden sm:inline">Sau</span>
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>
