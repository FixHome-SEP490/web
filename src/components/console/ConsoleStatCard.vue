<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type Component } from 'vue';

export type ConsoleStatTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const props = withDefaults(defineProps<{
  label: string;
  value?: string | number;
  sublabel?: string;
  icon?: Component;
  tone?: ConsoleStatTone;
  featured?: boolean;
  interactive?: boolean;
  active?: boolean;
  loading?: boolean;
  compact?: boolean;
  animateCount?: boolean;
}>(), {
  value: '',
  sublabel: '',
  icon: undefined,
  tone: 'neutral',
  featured: false,
  interactive: false,
  active: false,
  loading: false,
  compact: false,
  animateCount: true,
});

const isHero = computed(() => props.featured || props.active);

interface ParsedNumericValue {
  target: number;
  decimals: number;
  useGrouping: boolean;
  suffix: string;
}

function parseNumericValue(raw: string | number): ParsedNumericValue | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const str = String(raw);
    const dot = str.indexOf('.');
    return {
      target: raw,
      decimals: dot >= 0 ? str.length - dot - 1 : 0,
      useGrouping: Math.abs(raw) >= 1000,
      suffix: '',
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Matches integers, vi-VN thousand-grouped integers ("20.000", "1.234.567"), or decimals with optional suffix (" ₫", "%")
  const match = trimmed.match(/^(-?\d+(?:\.\d{3})*(?:,\d+)?|-?\d+(?:\.\d+)?)\s*(₫|%)?$/u);
  if (!match) return null;
  const numPart = match[1]!;
  const suffix = match[2] ? (trimmed.includes(` ${match[2]}`) ? ` ${match[2]}` : match[2]) : '';
  const hasViGrouping = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/u.test(numPart);
  const normalized = hasViGrouping
    ? numPart.replace(/\./g, '').replace(',', '.')
    : numPart;
  const target = Number(normalized);
  if (!Number.isFinite(target)) return null;
  const decimalIdx = normalized.indexOf('.');
  return {
    target,
    decimals: decimalIdx >= 0 ? normalized.length - decimalIdx - 1 : 0,
    useGrouping: hasViGrouping || Math.abs(target) >= 1000,
    suffix,
  };
}

function formatParsedValue(val: number, parsed: ParsedNumericValue): string {
  const factor = 10 ** parsed.decimals;
  const rounded = Math.round(val * factor) / factor;
  const formatted = parsed.useGrouping
    ? rounded.toLocaleString('vi-VN', {
        minimumFractionDigits: parsed.decimals,
        maximumFractionDigits: parsed.decimals,
      })
    : rounded.toFixed(parsed.decimals);
  return `${formatted}${parsed.suffix}`;
}

const canAnimateCount = () => {
  if (!props.animateCount || props.loading) return false;
  if (import.meta.env.VITEST || typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    return false;
  }
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
};

const parsedTarget = computed(() => parseNumericValue(props.value));
const animatedNumber = ref<number | null>(parsedTarget.value ? parsedTarget.value.target : null);
let rafId: number | null = null;
let hasAnimatedInitial = false;

function stopAnimation() {
  if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

watch(
  [() => props.value, () => props.loading],
  ([, isLoading], [, wasLoading]) => {
    stopAnimation();
    const parsed = parseNumericValue(props.value);
    if (!parsed || isLoading) {
      if (isLoading) hasAnimatedInitial = false;
      animatedNumber.value = parsed ? parsed.target : null;
      return;
    }

    if (!canAnimateCount()) {
      animatedNumber.value = parsed.target;
      hasAnimatedInitial = true;
      return;
    }

    const from = !hasAnimatedInitial || wasLoading ? 0 : (animatedNumber.value ?? 0);
    const to = parsed.target;
    hasAnimatedInitial = true;

    if (from === to) {
      animatedNumber.value = to;
      return;
    }

    const duration = 420;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - progress) ** 3;
      animatedNumber.value = from + (to - from) * eased;
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        animatedNumber.value = to;
        rafId = null;
      }
    };
    animatedNumber.value = from;
    rafId = requestAnimationFrame(step);
  },
  { immediate: true },
);

onUnmounted(stopAnimation);

const displayValue = computed(() => {
  const parsed = parsedTarget.value;
  if (!parsed || animatedNumber.value === null) return props.value;
  return formatParsedValue(animatedNumber.value, parsed);
});
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    :aria-pressed="interactive ? active : undefined"
    data-stat-card
    class="group relative flex w-full flex-col justify-between overflow-hidden rounded-[18px] border border-transparent bg-white text-left transition-[scale,transform,box-shadow,background-color] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none"
    :class="[
      compact ? 'p-4 sm:p-4.5' : 'p-5',
      interactive
        ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 enabled:active:scale-[0.96] motion-reduce:enabled:active:scale-100'
        : '',
      isHero
        ? 'text-white shadow-[0_6px_18px_-4px_rgba(37,99,235,0.32),0_2px_6px_-1px_rgba(37,99,235,0.18)] hover:shadow-[0_12px_26px_-6px_rgba(37,99,235,0.42),0_4px_10px_-2px_rgba(37,99,235,0.22)]'
        : interactive
          ? 'text-ink-900 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_6px_-1px_rgba(15,23,42,0.04),0_4px_12px_-2px_rgba(15,23,42,0.03)] hover:bg-brand-50/25 hover:shadow-[0_0_0_1px_rgba(37,99,235,0.24),0_10px_22px_-6px_rgba(37,99,235,0.12)]'
          : 'text-ink-900 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_6px_-1px_rgba(15,23,42,0.04),0_4px_12px_-2px_rgba(15,23,42,0.03)] hover:shadow-[0_0_0_1px_rgba(15,23,42,0.11),0_10px_22px_-6px_rgba(15,23,42,0.09)]',
    ]"
  >
    <!-- Smooth hero gradient layer so state switches crossfade instead of snapping -->
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-600 to-brand-700 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      :class="isHero ? 'opacity-100' : 'opacity-0'"
    />

    <!-- Top row: Label + Circular icon badge -->
    <div class="relative z-10 flex items-start justify-between gap-3">
      <span
        class="min-w-0 truncate pt-0.5 text-sm font-medium leading-snug transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        :class="isHero ? 'text-white/95' : 'text-ink-700'"
      >
        {{ label }}
      </span>

      <span
        v-if="icon"
        class="flex shrink-0 items-center justify-center rounded-full transition-[scale,transform,background-color,color] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        :class="[
          compact ? 'h-8 w-8' : 'h-9 w-9',
          isHero
            ? 'bg-white/15 text-white ring-1 ring-white/25 group-hover:bg-white/25'
            : 'bg-brand-600 text-white group-hover:bg-brand-700',
        ]"
      >
        <component
          :is="icon"
          :size="compact ? 15 : 16"
          :stroke-width="2"
          class="transition-[scale,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          aria-hidden="true"
        />
      </span>
    </div>

    <!-- Metric row -->
    <div class="relative z-10 mt-3.5 flex flex-wrap items-baseline gap-2">
      <div
        v-if="loading"
        class="animate-pulse rounded-[var(--radius-sm)]"
        :class="[
          compact ? 'h-7 w-16' : 'h-8 w-20',
          isHero ? 'bg-white/25' : 'bg-ink-200/75',
        ]"
        aria-hidden="true"
      />
      <template v-else>
        <span
          class="font-num font-bold leading-none tracking-[-0.025em] transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          :class="[
            compact ? 'text-2xl sm:text-[28px]' : 'text-3xl sm:text-[32px]',
            isHero ? 'text-white' : 'text-ink-900',
          ]"
        >
          <slot>{{ displayValue }}</slot>
        </span>
        <slot name="badge" />
      </template>
    </div>

    <!-- Optional supporting row -->
    <p
      v-if="sublabel || $slots.sub"
      class="relative z-10 mt-3 text-xs leading-snug transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      :class="isHero ? 'text-brand-50' : 'text-ink-500'"
    >
      <slot name="sub">{{ sublabel }}</slot>
    </p>
  </component>
</template>
