<script setup lang="ts">
// Search box and price-mode chips above the service cards. Search runs over
// every loaded service (accent-insensitive); the category filter is applied
// on top and the price chips classify by the Backend pricing mode only.
import { Search, X, Zap } from 'lucide-vue-next';
import type { BookingPriceFilter } from './booking-service-catalog';

export interface PriceModeCounts {
  all: number;
  fixed: number;
  inspection: number;
}

defineProps<{
  query: string;
  priceFilter: BookingPriceFilter;
  counts: PriceModeCounts;
  resultCount: number;
  totalCount: number;
}>();

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:priceFilter', value: BookingPriceFilter): void;
}>();
</script>

<template>
  <div class="space-y-3">
    <label for="booking-service-query" class="block text-sm font-semibold text-ink-900">Tìm dịch vụ</label>
    <div class="relative">
      <Search :size="16" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        id="booking-service-query"
        :value="query"
        type="text"
        class="h-12 w-full rounded-[var(--radius-md)] border border-ink-300 bg-white pl-10 pr-12 text-base text-ink-900 placeholder:text-ink-500 transition-colors motion-reduce:transition-none focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        placeholder="Tên dịch vụ hoặc tình trạng thiết bị…"
        aria-label="Tìm dịch vụ"
        data-testid="booking-service-search"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="query"
        type="button"
        class="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-brand-600 text-ink-400 transition-colors hover:text-ink-700"
        aria-label="Xóa từ khóa tìm kiếm"
        data-testid="booking-service-search-clear"
        @click="emit('update:query', '')"
      >
        <X :size="15" />
      </button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div
        v-if="(counts.fixed > 0 && counts.inspection > 0) || priceFilter !== 'all'"
        class="flex flex-wrap items-center gap-1 rounded-[var(--radius-sm)] bg-ink-100/80 p-1 text-[11px]"
        role="group"
        aria-label="Lọc theo cách tính giá"
      >
        <button
          type="button"
          class="whitespace-nowrap min-h-11 rounded-[var(--radius-sm)] px-2.5 py-1 font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-brand-600"
          :class="priceFilter === 'all' ? 'bg-white font-bold text-ink-900 shadow-[var(--shadow-e1)]' : 'text-ink-600 hover:text-ink-900'"
          :aria-pressed="priceFilter === 'all'"
          data-testid="booking-price-filter-all"
          @click="emit('update:priceFilter', 'all')"
        >
          Tất cả ({{ counts.all }})
        </button>
        <button
          v-if="counts.fixed > 0"
          type="button"
          class="inline-flex items-center gap-1 whitespace-nowrap min-h-11 rounded-[var(--radius-sm)] px-2.5 py-1 font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-brand-600"
          :class="priceFilter === 'fixed_price' ? 'bg-white font-bold text-brand-700 shadow-[var(--shadow-e1)]' : 'text-ink-600 hover:text-ink-900'"
          :aria-pressed="priceFilter === 'fixed_price'"
          data-testid="booking-price-filter-fixed"
          @click="emit('update:priceFilter', 'fixed_price')"
        >
          <Zap :size="13" /> Giá niêm yết ({{ counts.fixed }})
        </button>
        <button
          v-if="counts.inspection > 0"
          type="button"
          class="inline-flex items-center gap-1 whitespace-nowrap min-h-11 rounded-[var(--radius-sm)] px-2.5 py-1 font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-brand-600"
          :class="priceFilter === 'inspection_required' ? 'bg-white font-bold text-brand-700 shadow-[var(--shadow-e1)]' : 'text-ink-600 hover:text-ink-900'"
          :aria-pressed="priceFilter === 'inspection_required'"
          data-testid="booking-price-filter-inspection"
          @click="emit('update:priceFilter', 'inspection_required')"
        >
          <Search :size="13" /> Khảo sát ({{ counts.inspection }})
        </button>
      </div>

      <p class="text-xs text-ink-600" role="status">{{ resultCount }} / {{ totalCount }} dịch vụ</p>
    </div>
  </div>
</template>
