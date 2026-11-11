<script setup lang="ts">
// One line per service (PO 20/10/2026): the name and one short price. The category
// is the group heading, the duration and the price caption live in the details dialog.
// The select surface and the details button stay two separate buttons (never nested).
import { computed } from 'vue';
import { Check, Info } from 'lucide-vue-next';
import { catalogPriceLabel } from './booking-price';
import { isServiceBookable, type BookingCatalogService } from './booking-service-catalog';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const props = withDefaults(
  defineProps<{
    service: BookingCatalogService;
    selected: boolean;
    /** Kept for callers; the category is now the group heading above the rows. */
    showCategory?: boolean;
  }>(),
  { showCategory: false },
);

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'details', id: string): void;
}>();

const bookable = computed(() => isServiceBookable(props.service));
const price = computed(() => catalogPriceLabel(props.service));
const artworkUrl = computed(() => getServiceArtworkUrl(props.service));
</script>

<template>
  <div
    class="flex min-w-0 items-stretch overflow-hidden rounded-xl border transition-colors duration-150 motion-reduce:transition-none"
    :class="selected ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-ink-200 bg-white hover:border-brand-300'"
    data-testid="booking-service-row"
  >
    <button
      type="button"
      class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      :aria-pressed="selected"
      :aria-label="`Chọn dịch vụ ${service.name}`"
      :data-service-id="service.id"
      data-testid="booking-service-card"
      @click="emit('select', service.id)"
    >
      <span class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-100 bg-ink-50 p-1">
        <img
          :src="artworkUrl"
          alt=""
          loading="lazy"
          class="h-full w-full object-contain"
          aria-hidden="true"
        />
        <span
          v-if="selected"
          class="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white"
          aria-hidden="true"
        >
          <Check :size="10" :stroke-width="3" />
        </span>
      </span>
      <span class="min-w-0 flex-1 text-sm font-medium leading-snug text-ink-900 text-pretty">{{ service.name }}</span>
      <span
        class="shrink-0 whitespace-nowrap text-sm"
        :class="!bookable ? 'text-ink-400' : price.kind === 'fixed' ? 'font-semibold text-ink-900 font-num' : 'text-ink-500'"
        data-testid="booking-service-price"
      >{{ bookable ? price.text : 'Tạm chưa đặt được' }}</span>
    </button>
    <button
      type="button"
      class="flex w-11 shrink-0 items-center justify-center text-ink-400 transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      :aria-label="`Xem chi tiết dịch vụ ${service.name}`"
      data-testid="booking-service-details"
      @click="emit('details', service.id)"
    ><Info :size="16" aria-hidden="true" /></button>
  </div>
</template>
