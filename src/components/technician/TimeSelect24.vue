<script setup lang="ts">
import { computed } from 'vue';

/**
 * 24-hour time picker for the weekly schedule (PO 10/10/2026): a plain select
 * in 30-minute steps, never the browser's 12-hour "SA/CH" time input.
 *
 * The value is what the backend stores ("HH:mm", start < end by text). A whole
 * day ends at "23:59", which the end picker shows as "24:00". A stored value off
 * the 30-minute grid (e.g. "08:15") is kept as an extra option, never changed.
 */
const props = defineProps<{
  modelValue: string;
  kind: 'start' | 'end';
  /** Accessible name, e.g. "Giờ bắt đầu Thứ Hai". */
  label: string;
  muted?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

type TimeOption = { value: string; label: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** "00:00", "00:30" … "23:30". The end of day is stored as "23:59", shown "24:00". */
const GRID: string[] = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

const options = computed<TimeOption[]>(() => {
  const base: TimeOption[] =
    props.kind === 'start'
      ? GRID.map((t) => ({ value: t, label: t }))
      : [...GRID.slice(1).map((t) => ({ value: t, label: t })), { value: '23:59', label: '24:00' }];
  const current = props.modelValue;
  if (current && !base.some((o) => o.value === current)) {
    base.push({ value: current, label: current });
    base.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  }
  return base;
});

const selected = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});
</script>

<template>
  <select
    v-model="selected"
    :aria-label="label"
    class="h-10 px-3 bg-white border border-ink-200 rounded-xl font-num focus:outline-none focus:border-brand-600"
    :class="muted ? 'text-ink-400' : 'text-ink-900'"
  >
    <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
  </select>
</template>
