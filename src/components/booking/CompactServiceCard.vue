<script setup lang="ts">
// Compact discovery price and duration; full scope lives in the details dialog.
// The select surface and the details button are two separate buttons (never
// nested), so a card click selects while `Chi tiết` only opens the dialog.
import { computed } from 'vue';
import { Check, Clock, Info } from 'lucide-vue-next';
import FhMoney from '../FhMoney.vue';
import { getServicePriceSummaryDisplay } from '../../utils/public-service-pricing';
import { categoryIcon } from './service-icons';
import { fixedPriceValue, normalizePricingMode, type BookingCatalogService } from './booking-service-catalog';

const props = withDefaults(
  defineProps<{
    service: BookingCatalogService;
    selected: boolean;
    showCategory?: boolean;
  }>(),
  { showCategory: false },
);

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'details', id: string): void;
}>();

const mode = computed(() => normalizePricingMode(props.service.pricingMode));
const price = computed(() => fixedPriceValue(props.service));
const unit = computed(() => props.service.unit?.trim() || 'thiết bị');
const icon = computed(() => categoryIcon({ name: props.service.categoryName }));
const summaryPrice = computed(() => getServicePriceSummaryDisplay(props.service));
</script>

<template>
  <div
    class="group relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-[var(--radius-md)] border transition-colors duration-150 motion-reduce:transition-none"
    :class="selected ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-ink-200 bg-white/60 hover:border-brand-300 hover:bg-white'"
    data-testid="booking-service-row"
  >
    <button
      type="button"
      class="flex min-h-24 w-full min-w-0 items-start gap-3 p-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      :aria-pressed="selected"
      :aria-label="`Chọn dịch vụ ${service.name}`"
      :data-service-id="service.id"
      data-testid="booking-service-card"
      @click="emit('select', service.id)"
    >
      <span
        class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
        :class="selected ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'"
        aria-hidden="true"
      >
        <Check v-if="selected" :size="18" />
        <component :is="icon" v-else :size="18" />
      </span>
      <span class="min-w-0 flex-1 space-y-1.5">
        <span v-if="showCategory" class="block text-xs text-ink-600">{{ service.categoryName }}</span>
        <span class="block text-sm font-semibold leading-snug text-ink-900 text-pretty">{{ service.name }}</span>
        <span class="block text-xs text-ink-600" data-testid="booking-service-price">
          <template v-if="summaryPrice">
            <span class="block text-sm font-bold leading-5 text-brand-700">{{ summaryPrice.label }}</span>
            <span v-if="summaryPrice.caption" class="mt-0.5 block text-xs leading-4">{{ summaryPrice.caption }}</span>
          </template>
          <template v-else-if="mode === 'fixed_price' && price !== null">
            <span class="block text-xs">Giá niêm yết</span>
            <span class="font-num text-sm font-bold text-brand-700"><FhMoney :amount="price" /></span> / {{ unit }}
          </template>
          <span v-else-if="mode === 'inspection_required'" class="block text-sm font-bold text-brand-700">Khảo sát &amp; báo giá</span>
          <span v-else class="text-warning-800">{{ mode === 'fixed_price' ? 'Chưa có giá niêm yết' : 'Chưa xác định cách tính giá' }} · Tạm chưa đặt được</span>
        </span>
        <span class="inline-flex items-center gap-1 text-xs text-ink-600"><Clock :size="12" aria-hidden="true" /> ~{{ service.estimatedMinutes }} phút</span>
      </span>
    </button>
    <div class="flex items-center pr-2">
      <button
        type="button"
        class="inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 text-[11px] font-medium text-ink-600 transition-colors duration-150 hover:bg-ink-100 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 motion-reduce:transition-none"
        :aria-label="`Xem chi tiết dịch vụ ${service.name}`"
        data-testid="booking-service-details"
        @click="emit('details', service.id)"
      ><Info :size="16" aria-hidden="true" /> Chi tiết</button>
    </div>
  </div>
</template>
