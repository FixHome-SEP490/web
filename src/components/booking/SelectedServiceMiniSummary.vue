<script setup lang="ts">
// Mobile-only strip: keeps the one chosen service (and its money) in view while
// the customer scrolls the finder, with a shortcut down to the real request
// form. It never duplicates a form control and never selects a service again.
import { computed } from 'vue';
import { ArrowDown, Check } from 'lucide-vue-next';
import FhMoney from '../FhMoney.vue';
import { normalizePricingMode, type BookingCatalogService } from './booking-service-catalog';
import { getPublicServicePricing } from '../../utils/public-service-pricing';
import type { ServiceItem } from '../../api/catalog.api';

const props = withDefaults(
  defineProps<{
    service: BookingCatalogService | ServiceItem | null;
    quantity?: number;
  }>(),
  { quantity: 1 },
);

const emit = defineEmits<{
  (e: 'complete'): void;
}>();

const mode = computed(() => normalizePricingMode(props.service?.pricingMode));
const price = computed(() => {
  if (!props.service) return null;
  const pricing = getPublicServicePricing(props.service);
  return pricing.kind === 'fixed' ? pricing.amount : null;
});
const unit = computed(() => props.service?.unit?.trim() || 'thiết bị');
const total = computed(() => (price.value ?? 0) * props.quantity);
</script>

<template>
  <div
    class="sticky top-16 z-20 rounded-[var(--radius-md)] border border-brand-200 bg-brand-50/95 p-2.5 shadow-[var(--shadow-e2)] backdrop-blur-md"
    data-testid="booking-mini-summary"
    aria-live="polite"
  >
    <div class="flex items-center gap-2.5">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <Check :size="14" :stroke-width="3" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-[10px] font-bold uppercase tracking-wider text-brand-700">Dịch vụ đã chọn</p>
        <p class="truncate text-xs font-semibold text-ink-900" data-testid="booking-mini-summary-name">
          {{ service?.name }}
        </p>
      </div>
      <div class="shrink-0 text-right text-[11px] font-bold font-num text-brand-700">
        <template v-if="mode === 'fixed_price' && price !== null">
          <p data-testid="booking-mini-unit-price"><FhMoney :amount="price" /><span class="font-normal text-ink-500"> / {{ unit }}</span></p>
          <p v-if="quantity > 1" data-testid="booking-mini-total" class="font-normal text-ink-600">Tạm tính: <FhMoney :amount="total" /></p>
        </template>
        <span v-else-if="mode === 'inspection_required'" class="font-semibold text-ink-600">Báo giá sau khảo sát</span>
        <span v-else class="font-semibold text-ink-600">{{ mode === 'fixed_price' ? 'Giá đang cập nhật' : 'Giá chưa xác định' }}</span>
      </div>
    </div>

    <button
      type="button"
      class="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-brand-600 text-[11px] font-bold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
      data-testid="booking-mini-summary-complete"
      @click="emit('complete')"
    >
      Hoàn thiện yêu cầu
      <ArrowDown :size="13" />
    </button>
  </div>
</template>
