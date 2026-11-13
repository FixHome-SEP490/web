<script setup lang="ts">
import { computed } from 'vue';
import { Check } from 'lucide-vue-next';

export interface JobStepperStep {
  n: number;
  label: string;
  state: 'done' | 'current' | 'todo';
}

const props = withDefaults(
  defineProps<{
    steps: JobStepperStep[];
    compact?: boolean;
  }>(),
  {
    compact: false,
  },
);

const activeStep = computed(
  () => props.steps.find((step) => step.state === 'current') ?? props.steps[props.steps.length - 1],
);
const doneCount = computed(() => props.steps.filter((step) => step.state === 'done').length);
const allDone = computed(() => props.steps.length > 0 && doneCount.value === props.steps.length);
</script>

<template>
  <div class="space-y-2" aria-hidden="true">
    <div class="flex items-center justify-between gap-2 text-xs">
      <span class="font-semibold text-brand-700">
        {{ allDone ? 'Hoàn thành công việc' : `Bước ${activeStep?.n ?? 1}/${steps.length} · ${activeStep?.label ?? ''}` }}
      </span>
      <span class="font-num font-medium text-ink-500 whitespace-nowrap">
        {{ allDone ? `${steps.length}/${steps.length}` : `${activeStep?.n ?? 1}/${steps.length}` }}
      </span>
    </div>

    <div class="flex items-center" :class="compact ? 'px-0.5' : 'px-1'">
      <template v-for="(step, idx) in steps" :key="step.n">
        <div
          class="shrink-0 rounded-full flex items-center justify-center font-num transition-[background-color,border-color,color,box-shadow] duration-200"
          :class="[
            compact ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs',
            step.state === 'done'
              ? 'bg-brand-600 text-white shadow-2xs'
              : step.state === 'current'
                ? 'bg-white border-2 border-brand-600 text-brand-700 font-bold ring-3 ring-brand-100'
                : 'bg-ink-100 border border-ink-200/80 text-ink-400 font-medium',
          ]"
        >
          <Check v-if="step.state === 'done'" :size="compact ? 11 : 13" :stroke-width="2.75" />
          <span v-else>{{ step.n }}</span>
        </div>

        <div
          v-if="idx < steps.length - 1"
          class="h-0.5 flex-1 mx-1 sm:mx-1.5 rounded-full transition-colors duration-300"
          :class="step.state === 'done' ? 'bg-brand-600' : 'bg-ink-200/90'"
        />
      </template>
    </div>

    <div
      v-if="!compact"
      class="hidden sm:grid gap-1 pt-0.5"
      :style="{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }"
    >
      <span
        v-for="(step, idx) in steps"
        :key="`label-${step.n}`"
        class="text-[11px] leading-tight truncate"
        :class="[
          idx === 0 ? 'text-left' : idx === steps.length - 1 ? 'text-right' : 'text-center',
          step.state === 'current'
            ? 'font-semibold text-brand-700'
            : step.state === 'done'
              ? 'font-medium text-ink-600'
              : 'text-ink-400',
        ]"
        :title="step.label"
      >
        {{ step.label }}
      </span>
    </div>
  </div>
</template>

