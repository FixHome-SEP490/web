<script setup lang="ts">
import { computed, ref } from 'vue';

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
    verified: number;
    pending: number;
    failed: number;
    total?: number;
  }>(),
  {
    verified: 0,
    pending: 0,
    failed: 0,
    total: 0,
  },
);

const hoveredKey = ref<string | null>(null);

// SVG geometry
const size = 130;
const strokeWidth = 14;
const radius = (size - strokeWidth) / 2 - 2;
const circumference = 2 * Math.PI * radius;

const totalCount = computed(() => {
  const sum = props.verified + props.pending + props.failed;
  return props.total > 0 ? props.total : sum;
});

const slices = computed<StatusSlice[]>(() => {
  const sum = props.verified + props.pending + props.failed;
  const total = sum > 0 ? sum : 1;

  const rawSlices = [
    {
      key: 'verified',
      label: 'Đã thanh toán',
      color: '#10B981', // emerald-500
      dotClass: 'bg-[#10B981]',
      count: props.verified,
    },
    {
      key: 'pending',
      label: 'Đang chờ',
      color: '#F59E0B', // amber-500
      dotClass: 'bg-[#F59E0B]',
      count: props.pending,
    },
    {
      key: 'failed',
      label: 'Thất bại',
      color: '#EF4444', // red-500
      dotClass: 'bg-[#EF4444]',
      count: props.failed,
    },
  ];

  if (sum === 0) {
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

    const activeCount = rawSlices.filter((r) => r.count > 0).length;
    const adjustedLength =
      activeCount > 1 && segmentLength > 2 ? segmentLength - 1.2 : segmentLength;

    const dashArray = `${adjustedLength.toFixed(2)} ${(circumference - adjustedLength).toFixed(2)}`;
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
  <div class="flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
    <!-- Header -->
    <div class="pb-1">
      <h3 class="text-sm font-bold text-ink-900">Tỷ lệ giao dịch</h3>
    </div>

    <!-- Body: Donut on Left, Legend on Right, Centered Vertically -->
    <div class="flex flex-1 items-center justify-between gap-4 py-2">
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
            :stroke-width="hoveredKey === slice.key ? strokeWidth + 2 : strokeWidth"
            :stroke-dasharray="slice.dashArray"
            :stroke-dashoffset="slice.dashOffset"
            stroke-linecap="butt"
            class="cursor-pointer transition-all duration-200"
            @mouseenter="hoveredKey = slice.key"
            @mouseleave="hoveredKey = null"
          />
        </svg>

        <!-- Center Text in Donut Hole -->
        <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span class="font-num text-xl font-bold tracking-tight text-ink-900">
            {{ totalCount.toLocaleString('vi-VN') }}
          </span>
          <span class="text-[11px] font-medium text-ink-500">
            Giao dịch
          </span>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex min-w-[130px] flex-1 flex-col justify-center gap-2.5">
        <div
          v-for="slice in slices"
          :key="'legend-' + slice.key"
          class="flex cursor-pointer items-center justify-between gap-2 text-xs transition-opacity duration-150"
          :class="{
            'opacity-100 font-semibold': hoveredKey === slice.key,
            'opacity-80': hoveredKey && hoveredKey !== slice.key,
          }"
          @mouseenter="hoveredKey = slice.key"
          @mouseleave="hoveredKey = null"
        >
          <!-- Left: Dot + Label -->
          <div class="flex items-center gap-2">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :class="slice.dotClass"
            />
            <span class="text-ink-700">{{ slice.label }}</span>
          </div>

          <!-- Right: Value (Percentage%) -->
          <div class="font-num text-ink-900">
            {{ slice.percentage }}%
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
