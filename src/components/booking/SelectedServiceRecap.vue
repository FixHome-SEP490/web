<script setup lang="ts">
// The recap of the one service this booking is for. It states the price mode
// the Backend sent and owns the quantity control for a fixed-price package.
import { computed } from 'vue';
import { AlertTriangle, Clock, Minus, Plus } from 'lucide-vue-next';
import FhMoney from '../FhMoney.vue';
import type { ServiceItem } from '../../api/catalog.api';
import { fixedPriceValue, isServiceBookable, normalizePricingMode } from './booking-service-catalog';

const props = withDefaults(
  defineProps<{
    service: ServiceItem | null;
    categoryName?: string | null;
    quantity: number;
  }>(),
  { categoryName: null },
);

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'change'): void;
  (e: 'update:quantity', value: number): void;
}>();

const mode = computed(() => normalizePricingMode(props.service?.pricingMode));
const price = computed(() => fixedPriceValue(props.service));
const bookable = computed(() => isServiceBookable(props.service));
const unit = computed(() => props.service?.unit?.trim() || 'thiết bị');
const total = computed(() => (price.value ?? 0) * props.quantity);

const modeLabel = computed(() => {
  if (mode.value === 'fixed_price') return price.value === null ? 'Chưa có giá niêm yết' : 'Giá niêm yết';
  if (mode.value === 'inspection_required') return 'Khảo sát tận nơi';
  return 'Chưa xác định cách tính giá';
});
</script>

<template>
  <aside
    class="rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-e1)]"
    :class="service ? 'border-brand-200' : 'border-dashed border-ink-300'"
    data-testid="selected-service-recap"
    aria-live="polite"
    tabindex="-1"
  >
    <p class="text-xs font-semibold text-ink-600">Dịch vụ đã chọn</p>

    <template v-if="service">
      <p v-if="categoryName" class="mt-1.5 text-[11px] font-medium text-ink-500">{{ categoryName }}</p>
      <p class="text-sm font-semibold leading-snug text-ink-900 text-pretty" data-testid="recap-service-name">
        {{ service.name }}
      </p>

      <div class="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
        <Clock :size="12" class="text-ink-400" /> Thời lượng dự kiến ~{{ service.estimatedMinutes }} phút
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-2.5 py-2">
        <span
          class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
          :class="mode === 'fixed_price' && price !== null
            ? 'border-brand-200 bg-white text-brand-700'
            : mode === 'inspection_required'
              ? 'border-ink-200 bg-white text-ink-700'
              : 'border-warning-200 bg-warning-50 text-warning-800'"
        >
          {{ modeLabel }}
        </span>
        <span v-if="mode === 'fixed_price' && price !== null" class="ml-auto font-bold text-[13px] text-brand-700 font-num">
          <FhMoney :amount="price" /><span class="text-[11px] font-normal text-ink-500"> / {{ unit }}</span>
        </span>
        <span v-else-if="mode === 'inspection_required'" class="ml-auto text-[11px] font-semibold text-ink-600">
          Thợ báo giá trước khi sửa
        </span>
        <span v-else class="ml-auto text-[11px] font-semibold text-warning-800">Tạm thời chưa đặt được</span>
      </div>

      <div v-if="mode === 'fixed_price' && price !== null" class="mt-3 space-y-2 rounded-[var(--radius-sm)] bg-ink-50 p-2.5">
        <div class="flex items-center justify-between gap-2">
          <label for="booking-quantity" class="text-[11px] font-semibold text-ink-700">Số lượng thiết bị</label>
          <div class="flex items-center gap-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white p-0.5">
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-800 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="quantity <= 1"
              aria-label="Giảm số lượng"
              data-testid="booking-quantity-decrease"
              @click="emit('update:quantity', Math.max(1, quantity - 1))"
            >
              <Minus :size="13" />
            </button>
            <span id="booking-quantity" class="w-8 text-center text-sm font-bold font-num text-ink-900" data-testid="booking-quantity">
              {{ quantity }}
            </span>
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-ink-800 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="quantity >= 99"
              aria-label="Tăng số lượng"
              data-testid="booking-quantity-increase"
              @click="emit('update:quantity', Math.min(99, quantity + 1))"
            >
              <Plus :size="13" />
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[11px] text-ink-500">Tạm tính</span>
          <span class="text-sm font-bold text-brand-700 font-num"><FhMoney :amount="total" /></span>
        </div>
      </div>

      <div
        v-if="!bookable"
        class="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 p-2.5 text-[11px] text-danger-700"
        data-testid="recap-unavailable"
      >
        <AlertTriangle :size="14" class="mt-0.5 shrink-0" />
        <p>Dịch vụ này chưa có cách tính giá hợp lệ nên chưa thể đặt. Vui lòng chọn dịch vụ khác.</p>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="min-h-11 flex-1 rounded-[var(--radius-sm)] border border-brand-200 px-3 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600 motion-reduce:transition-none"
        data-testid="recap-change"
        @click="emit('change')"
      >Đổi dịch vụ</button>
      <button
        type="button"
        class="min-h-11 flex-1 rounded-[var(--radius-sm)] border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-danger-200 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-2 focus-visible:outline-brand-600 motion-reduce:transition-none"
        data-testid="recap-clear"
        @click="emit('clear')"
      >
        Bỏ chọn dịch vụ
      </button>
      </div>
    </template>

    <p v-else class="mt-1.5 text-xs leading-relaxed text-ink-500" data-testid="recap-empty">
      Chọn một dịch vụ ở danh sách để xem tóm tắt và tiếp tục. Mỗi yêu cầu chỉ có một dịch vụ chính.
    </p>
  </aside>
</template>
