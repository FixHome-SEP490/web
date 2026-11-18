<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Check, LocateFixed } from 'lucide-vue-next';
import RadarMapBackdrop from './RadarMapBackdrop.vue';

const props = withDefaults(defineProps<{
  isVisit?: boolean;
}>(), {
  isVisit: false,
});

const scanSteps = [
  'Định vị khu vực',
  'Lọc lịch khung giờ',
  'Xếp hạng phù hợp',
];

const activeStep = ref(0);
let stepTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    activeStep.value = scanSteps.length - 1;
    return;
  }
  stepTimer = setInterval(() => {
    if (activeStep.value < scanSteps.length - 1) {
      activeStep.value += 1;
    }
  }, 1150);
});

onUnmounted(() => {
  if (stepTimer) clearInterval(stepTimer);
});
</script>

<template>
  <section
    role="status"
    aria-label="Đang tải danh sách kỹ thuật viên"
    data-testid="candidates-radar-loader"
    class="overflow-hidden rounded-2xl border border-ink-200/85 bg-white animate-slide-up-delay-2"
  >
    <!-- Header row -->
    <div class="px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3 min-w-0">
        <span
          class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
          aria-hidden="true"
        >
          <LocateFixed :size="14" class="animate-pulse motion-reduce:animate-none" />
        </span>
        <div class="min-w-0 space-y-0.5">
          <h2 class="text-base sm:text-[17px] font-bold text-ink-900 text-balance">
            Đang dò kỹ thuật viên quanh khu vực của bạn...
          </h2>
          <p class="text-xs sm:text-sm text-ink-600 text-pretty">
            {{
              props.isVisit
                ? 'Đang tìm kỹ thuật viên đáp ứng đủ mọi thiết bị trong lượt sửa theo khung giờ bạn chọn.'
                : 'Đang kiểm tra khoảng cách, tay nghề xác thực và lịch trống theo khung giờ bạn chọn.'
            }}
          </p>
        </div>
      </div>

      <!-- Compact scan progress pills -->
      <ol class="flex flex-wrap items-center gap-1.5 shrink-0">
        <li
          v-for="(label, idx) in scanSteps"
          :key="label"
          class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200"
          :class="
            idx < activeStep
              ? 'border-success-200 bg-success-50 text-success-700'
              : idx === activeStep
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-ink-200/80 bg-ink-50/70 text-ink-500'
          "
        >
          <Check v-if="idx < activeStep" :size="12" :stroke-width="2.5" aria-hidden="true" />
          <span
            v-else
            class="h-1.5 w-1.5 rounded-full"
            :class="idx === activeStep ? 'bg-brand-600 animate-pulse motion-reduce:animate-none' : 'bg-ink-300'"
            aria-hidden="true"
          />
          <span>{{ label }}</span>
        </li>
      </ol>
    </div>

    <!-- Wide Zoomed-Out Vector Map + Soft Expanding Water-Drop Sonar Ripples -->
    <div class="relative h-80 sm:h-[26rem] w-full overflow-hidden border-t border-ink-100 bg-[#F3F8FE]" aria-hidden="true">
      <RadarMapBackdrop class="opacity-95" />

      <!-- Soft radial water-drop ripples expanding gently from center -->
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="relative flex h-72 w-72 sm:h-96 sm:w-96 items-center justify-center">
          <span class="water-ripple water-ripple--1 motion-reduce:hidden" />
          <span class="water-ripple water-ripple--2 motion-reduce:hidden" />
          <span class="water-ripple water-ripple--3 motion-reduce:hidden" />

          <!-- Subtle static fallback ring shown only under reduced motion -->
          <span class="hidden motion-reduce:block h-44 w-44 rounded-full bg-brand-500/10 ring-1 ring-brand-500/20" />

          <!-- Center customer location pin -->
          <span class="center-pin relative z-10 h-4 w-4 rounded-full bg-brand-600 border-[2.5px] border-white shadow-sm ring-8 ring-brand-500/20" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.water-ripple {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    rgba(37, 99, 235, 0.04) 35%,
    rgba(37, 99, 235, 0.16) 82%,
    rgba(37, 99, 235, 0.28) 100%
  );
  box-shadow: inset 0 0 0 1.5px rgba(37, 99, 235, 0.22);
  opacity: 0;
  will-change: transform, opacity;
  animation: fh-water-ripple 3.3s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.water-ripple--1 {
  animation-delay: 0s;
}

.water-ripple--2 {
  animation-delay: 1.1s;
}

.water-ripple--3 {
  animation-delay: 2.2s;
}

.center-pin {
  animation: fh-pin-breathe 2.2s ease-in-out infinite;
}

@keyframes fh-water-ripple {
  0% {
    transform: scale(0.14);
    opacity: 0;
  }
  12% {
    opacity: 0.85;
  }
  70% {
    opacity: 0.32;
  }
  100% {
    transform: scale(1.12);
    opacity: 0;
  }
}

@keyframes fh-pin-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.18), 0 2px 6px rgba(15, 23, 42, 0.18);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(37, 99, 235, 0.1), 0 2px 8px rgba(15, 23, 42, 0.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .water-ripple,
  .center-pin {
    animation: none;
  }
}
</style>
