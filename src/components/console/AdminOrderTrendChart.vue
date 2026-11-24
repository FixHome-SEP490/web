<script setup lang="ts">
import { computed, ref } from 'vue';
import { BarChart2, ChevronDown } from 'lucide-vue-next';
import type { ServiceOrderItem } from '../../api/orders.api';
import { addDaysToKey, vnDayKey } from '../../utils/vn-time';

const props = withDefaults(
  defineProps<{
    orders: ServiceOrderItem[];
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

const selectedRange = ref<number>(7);

interface ChartPoint {
  dateKey: string;
  displayDate: string;
  fullDate: string;
  count: number;
  x: number;
  y: number;
}

// Chart layout constants
const width = 600;
const height = 220;
const padding = { top: 25, right: 30, bottom: 35, left: 45 };
const plotWidth = width - padding.left - padding.right;
const plotHeight = height - padding.top - padding.bottom;

// Compute data for selected range
const chartData = computed(() => {
  const days = selectedRange.value;
  const todayKey = vnDayKey(new Date());

  // Generate days array from (today - (days - 1)) to today
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(addDaysToKey(todayKey, -i));
  }

  // Count orders per day
  const countsByDay: Record<string, number> = {};
  for (const k of dayKeys) countsByDay[k] = 0;

  for (const o of props.orders) {
    if (!o.createdAt) continue;
    const orderKey = vnDayKey(o.createdAt);
    if (countsByDay[orderKey] !== undefined) {
      countsByDay[orderKey]++;
    }
  }

  // Calculate max count for Y scale
  const counts = dayKeys.map((k) => countsByDay[k] ?? 0);
  const maxVal = Math.max(...counts, 0);

  // Round up to nice number for Y grid (e.g. 10, 20, 50)
  let yMax = 10;
  if (maxVal > 40) yMax = Math.ceil(maxVal / 10) * 10;
  else if (maxVal > 25) yMax = 40;
  else if (maxVal > 15) yMax = 30;
  else if (maxVal > 5) yMax = 20;

  // Generate 5 grid ticks
  const tickCount = 5;
  const yTicks: { value: number; y: number }[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const val = Math.round((yMax / tickCount) * i);
    const yPos = padding.top + plotHeight - (val / yMax) * plotHeight;
    yTicks.push({ value: val, y: yPos });
  }

  // Map points to SVG coordinates
  const points: ChartPoint[] = dayKeys.map((key, index) => {
    const count = countsByDay[key] ?? 0;
    const x = padding.left + (index / (dayKeys.length - 1 || 1)) * plotWidth;
    const y = padding.top + plotHeight - (count / yMax) * plotHeight;

    const parts = key.split('-');
    const displayDate = `${parts[2]}/${parts[1]}`;
    const fullDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    return {
      dateKey: key,
      displayDate,
      fullDate,
      count,
      x,
      y,
    };
  });

  return { points, yTicks, yMax };
});

// Cubic Bezier spline generation for smooth curved line
function getBezierPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? i + 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

const linePath = computed(() => getBezierPath(chartData.value.points));

const areaPath = computed(() => {
  const points = chartData.value.points;
  if (points.length === 0) return '';
  const basePath = linePath.value;
  const bottomY = padding.top + plotHeight;
  const lastX = points[points.length - 1].x.toFixed(1);
  const firstX = points[0].x.toFixed(1);
  return `${basePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
});

// Interactive tooltip state
const hoveredPoint = ref<ChartPoint | null>(null);

function onPointHover(pt: ChartPoint) {
  hoveredPoint.value = pt;
}

function onPointLeave() {
  hoveredPoint.value = null;
}
</script>

<template>
  <div class="flex flex-col rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div class="flex items-center gap-2">
        <BarChart2 :size="18" :stroke-width="2" class="text-brand-600" aria-hidden="true" />
        <h2 class="text-base font-bold text-ink-900">Biến động đơn dịch vụ</h2>
      </div>

      <!-- Time Filter Selector -->
      <div class="relative inline-flex items-center">
        <select
          v-model="selectedRange"
          class="appearance-none rounded-lg border border-ink-200 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-ink-700 shadow-2xs transition-colors hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label="Chọn khoảng thời gian thống kê"
        >
          <option :value="7">7 ngày gần nhất</option>
          <option :value="14">14 ngày gần nhất</option>
          <option :value="30">30 ngày gần nhất</option>
        </select>
        <ChevronDown
          :size="14"
          :stroke-width="2"
          class="pointer-events-none absolute right-2.5 text-ink-400"
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- Chart Body -->
    <div class="relative flex-1 pt-2">
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        class="h-auto w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="orderTrendAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02" />
          </linearGradient>
        </defs>

        <!-- Horizontal Grid Lines and Y-Axis Labels -->
        <g class="grid-lines" stroke="#f1f5f9" stroke-width="1">
          <line
            v-for="tick in chartData.yTicks"
            :key="'grid-' + tick.value"
            :x1="padding.left"
            :y1="tick.y"
            :x2="width - padding.right"
            :y2="tick.y"
          />
        </g>

        <!-- Y Axis Labels -->
        <g class="y-labels select-none text-[11px] font-num" fill="#94a3b8" text-anchor="end">
          <text
            v-for="tick in chartData.yTicks"
            :key="'label-' + tick.value"
            :x="padding.left - 10"
            :y="tick.y + 4"
          >
            {{ tick.value }}
          </text>
        </g>

        <!-- Area Fill Under Line -->
        <path
          v-if="areaPath"
          :d="areaPath"
          fill="url(#orderTrendAreaGrad)"
        />

        <!-- Smooth Curved Line -->
        <path
          v-if="linePath"
          :d="linePath"
          fill="none"
          stroke="#2563eb"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Hover Guideline -->
        <line
          v-if="hoveredPoint"
          :x1="hoveredPoint.x"
          :y1="padding.top"
          :x2="hoveredPoint.x"
          :y2="padding.top + plotHeight"
          stroke="#93c5fd"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />

        <!-- Interactive Data Points -->
        <g class="data-points">
          <g
            v-for="pt in chartData.points"
            :key="'point-' + pt.dateKey"
            class="cursor-pointer"
            @mouseenter="onPointHover(pt)"
            @mouseleave="onPointLeave"
          >
            <!-- Larger transparent circle for generous hover hit area -->
            <circle
              :cx="pt.x"
              :cy="pt.y"
              r="14"
              fill="transparent"
            />
            <!-- Outer Glow when Hovered -->
            <circle
              v-if="hoveredPoint?.dateKey === pt.dateKey"
              :cx="pt.x"
              :cy="pt.y"
              r="7"
              fill="#bfdbfe"
              opacity="0.8"
            />
            <!-- Visual Point Circle -->
            <circle
              :cx="pt.x"
              :cy="pt.y"
              :r="hoveredPoint?.dateKey === pt.dateKey ? 5 : 4"
              fill="#ffffff"
              stroke="#2563eb"
              stroke-width="2.5"
            />
          </g>
        </g>

        <!-- X Axis Labels (Dates) -->
        <g class="x-labels select-none text-[11px] font-num" fill="#64748b" text-anchor="middle">
          <text
            v-for="pt in chartData.points"
            :key="'x-label-' + pt.dateKey"
            :x="pt.x"
            :y="height - 10"
            :class="{ 'font-bold fill-blue-600': hoveredPoint?.dateKey === pt.dateKey }"
          >
            {{ pt.displayDate }}
          </text>
        </g>
      </svg>

      <!-- Tooltip Popover -->
      <div
        v-if="hoveredPoint"
        class="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-xs transition-transform duration-75"
        :style="{
          left: `${(hoveredPoint.x / width) * 100}%`,
          top: `${(hoveredPoint.y / height) * 100 - 4}%`,
        }"
      >
        <div class="font-medium text-slate-300">{{ hoveredPoint.fullDate }}</div>
        <div class="font-bold text-white font-num">
          {{ hoveredPoint.count }} đơn
        </div>
      </div>
    </div>
  </div>
</template>
