<script setup lang="ts">
import { computed, ref } from 'vue';
import { Layers } from 'lucide-vue-next';

interface StatusSlice {
  key: string;
  label: string;
  color: string;
  dotClass: string;
  count: number;
  percentage: number;
  dashArray: string;
  dashOffset: number;
}

const props = withDefaults(
  defineProps<{
    completed: number;
    active: number;
    cancelled: number;
  }>(),
  {
    completed: 0,
    active: 0,
    cancelled: 0,
  },
);

const hoveredKey = ref<string | null>(null);

// SVG geometry
const size = 170;
const strokeWidth = 22;
const radius = (size - strokeWidth) / 2 - 4; // ~70
const circumference = 2 * Math.PI * radius;

const totalCount = computed(() => {
  return props.completed + props.active + props.cancelled;
});

const slices = computed<StatusSlice[]>(() => {
  const total = totalCount.value;

  const rawSlices = [
    {
      key: 'completed',
      label: 'Hoàn thành',
      color: '#059669', // success-600 (.fh-console)
      dotClass: 'bg-success-600',
      count: props.completed,
    },
    {
      key: 'active',
      label: 'Đang thực hiện',
      color: '#2563EB', // brand-600
      dotClass: 'bg-brand-600',
      count: props.active,
    },
    {
      key: 'cancelled',
      label: 'Đã hủy',
      color: '#D92D20', // danger-600
      dotClass: 'bg-danger-600',
      count: props.cancelled,
    },
  ];

  if (total === 0) {
    return rawSlices.map((s) => ({
      ...s,
      percentage: 0,
      dashArray: `0 ${circumference}`,
      dashOffset: 0,
    }));
  }

  let accumulatedLength = 0;

  return rawSlices.map((s) => {
    const fraction = s.count / total;
    const percentage = Number((fraction * 100).toFixed(1));
    const segmentLength = fraction * circumference;

    // Tiny gap between slices if multiple slices exist
    const adjustedLength =
      rawSlices.filter((r) => r.count > 0).length > 1 && segmentLength > 2
        ? segmentLength - 1.5
        : segmentLength;

    const dashArray = `${adjustedLength.toFixed(2)} ${(circumference - adjustedLength).toFixed(2)}`;
    // Start at 12 o'clock (-90 degrees is -circumference/4)
    const dashOffset = -accumulatedLength;

    accumulatedLength += segmentLength;

    return {
      ...s,
      percentage,
      dashArray,
      dashOffset,
    };
  });
});
</script>

<template>
  <div class="flex flex-col rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
    <!-- Header -->
    <div class="flex items-center gap-2 pb-3">
      <Layers :size="18" :stroke-width="2" class="text-brand-600" aria-hidden="true" />
      <h2 class="text-base font-bold text-ink-900">Tình trạng đơn hàng</h2>
    </div>

    <!-- Body: Donut Chart on Left, Legend on Right -->
    <div class="flex flex-1 flex-col items-center justify-around gap-6 sm:flex-row sm:gap-4 sm:pt-2">
      <!-- Donut Visual -->
      <div class="relative shrink-0 select-none">
        <svg
          :width="size"
          :height="size"
          class="-rotate-90 transform transition-transform"
        >
          <!-- Base background ring for zero data -->
          <circle
            v-if="totalCount === 0"
            :cx="size / 2"
            :cy="size / 2"
            :r="radius"
            fill="transparent"
            stroke="#f1f5f9"
            :stroke-width="strokeWidth"
          />

          <!-- Colored Donut Slices -->
          <circle
            v-for="slice in slices"
            :key="slice.key"
            :cx="size / 2"
            :cy="size / 2"
            :r="radius"
            fill="transparent"
            :stroke="slice.color"
            :stroke-width="hoveredKey === slice.key ? strokeWidth + 3 : strokeWidth"
            :stroke-dasharray="slice.dashArray"
            :stroke-dashoffset="slice.dashOffset"
            stroke-linecap="butt"
            class="transition-all duration-200 cursor-pointer"
            @mouseenter="hoveredKey = slice.key"
            @mouseleave="hoveredKey = null"
          />
        </svg>

        <!-- Center Text in Donut Hole -->
        <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span class="font-num text-3xl font-bold tracking-tight text-ink-900">
            {{ totalCount }}
          </span>
          <span class="text-xs font-medium text-ink-500">
            Tổng đơn
          </span>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex flex-col justify-center gap-3.5 min-w-[170px]">
        <div
          v-for="slice in slices"
          :key="'legend-' + slice.key"
          class="flex items-center justify-between gap-3 text-xs transition-opacity duration-150 cursor-pointer"
          :class="{
            'opacity-100 font-medium': hoveredKey === slice.key,
            'opacity-80': hoveredKey && hoveredKey !== slice.key,
          }"
          @mouseenter="hoveredKey = slice.key"
          @mouseleave="hoveredKey = null"
        >
          <!-- Left: Dot + Label -->
          <div class="flex items-center gap-2">
            <span
              class="h-2.5 w-2.5 rounded-full shrink-0"
              :class="slice.dotClass"
            />
            <span class="text-ink-700">{{ slice.label }}</span>
          </div>

          <!-- Right: Value (Percentage%) -->
          <div class="font-num font-semibold text-ink-900 whitespace-nowrap">
            {{ slice.count }} <span class="font-normal text-ink-500">({{ slice.percentage }}%)</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
