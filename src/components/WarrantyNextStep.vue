<script setup lang="ts">
import type { NextStep } from '../utils/warranty-claim';

defineProps<{ step: NextStep }>();

const toneClasses = {
  warning: 'border-warning-200 bg-warning-50 text-warning-800',
  info: 'border-info-50 bg-info-50 text-info-600',
  repair: 'border-brand-100 bg-brand-50 text-brand-700',
  success: 'border-success-200 bg-success-50 text-success-800',
  neutral: 'border-ink-200 bg-ink-50 text-ink-700',
} as const;
</script>

<template>
  <section class="rounded-xl border px-3.5 py-2.5" :class="[toneClasses[step.tone], step.urgent && 'ring-1 ring-warning-200']" aria-label="Bước tiếp theo" data-testid="warranty-next-step">
    <p class="text-xs font-semibold uppercase tracking-wide opacity-80">Bước tiếp theo</p>
    <p class="mt-0.5 text-base font-semibold">{{ step.title }}</p>
    <p v-if="step.text" class="mt-0.5 text-sm text-pretty">{{ step.text }}</p>
  </section>
</template>
