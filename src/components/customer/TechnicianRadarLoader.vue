<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Check, MapPin } from 'lucide-vue-next';

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
  }, 450);
});

onUnmounted(() => {
  if (stepTimer) clearInterval(stepTimer);
});
</script>

<template>
  <div
    role="status"
    aria-label="Đang tải danh sách kỹ thuật viên"
    data-testid="candidates-radar-loader"
    class="rounded-3xl bg-white border border-ink-200/90 px-5 py-8 sm:px-8 sm:py-10 shadow-xs text-center space-y-6 animate-slide-up-delay-2"
  >
    <!-- Radar visual (purely decorative coverage rings around customer's booking pin) -->
    <div class="relative mx-auto flex h-44 w-44 items-center justify-center" aria-hidden="true">
      <span class="absolute inset-0 rounded-full border border-dashed border-brand-200/90" />
      <span class="absolute inset-5 rounded-full border border-brand-200/75" />
      <span class="absolute inset-11 rounded-full border border-brand-200/90 bg-brand-50/40" />

      <span class="radar-ripple absolute inset-8 rounded-full border border-brand-400/50 motion-reduce:hidden" />
      <span class="radar-sweep absolute inset-0 rounded-full motion-reduce:hidden" />

      <!-- Ambient coverage dots -->
      <span class="radar-dot radar-dot--1 absolute top-6 right-9 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-100/80" />
      <span class="radar-dot radar-dot--2 absolute bottom-8 left-6 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-100/80" />
      <span class="radar-dot radar-dot--3 absolute bottom-5 right-12 h-2 w-2 rounded-full bg-success-500 ring-4 ring-success-100/80" />

      <!-- Center customer home pin -->
      <div class="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm ring-4 ring-brand-100">
        <MapPin :size="20" :stroke-width="2" />
      </div>
    </div>

    <div class="mx-auto max-w-md space-y-1.5">
      <h2 class="text-base sm:text-lg font-semibold text-ink-900 text-balance">
        Đang dò kỹ thuật viên quanh khu vực của bạn...
      </h2>
      <p class="text-xs sm:text-sm text-ink-500 text-pretty">
        {{
          props.isVisit
            ? 'Đang tìm kỹ thuật viên đáp ứng đủ mọi thiết bị trong lượt sửa theo khung giờ bạn chọn.'
            : 'Đang kiểm tra khoảng cách, tay nghề xác thực và lịch trống theo khung giờ bạn chọn.'
        }}
      </p>
    </div>

    <!-- Compact scan progress pills -->
    <ol class="flex flex-wrap items-center justify-center gap-2 pt-1">
      <li
        v-for="(label, idx) in scanSteps"
        :key="label"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200"
        :class="
          idx < activeStep
            ? 'border-success-200 bg-success-50 text-success-700'
            : idx === activeStep
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-ink-200/80 bg-ink-50/70 text-ink-500'
        "
      >
        <Check v-if="idx < activeStep" :size="13" :stroke-width="2.5" aria-hidden="true" />
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
</template>

<style scoped>
.radar-sweep {
  background: conic-gradient(
    from 0deg,
    rgba(37, 99, 235, 0.16) 0deg,
    rgba(37, 99, 235, 0.04) 55deg,
    transparent 90deg
  );
  animation: fh-radar-spin 2.6s linear infinite;
}

.radar-ripple {
  animation: fh-radar-ripple 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.radar-dot {
  animation: fh-dot-pulse 2.2s ease-in-out infinite;
}
.radar-dot--1 {
  animation-delay: 0.2s;
}
.radar-dot--2 {
  animation-delay: 0.9s;
}
.radar-dot--3 {
  animation-delay: 1.5s;
}

@keyframes fh-radar-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fh-radar-ripple {
  0% {
    transform: scale(0.72);
    opacity: 0.65;
  }
  100% {
    transform: scale(1.48);
    opacity: 0;
  }
}

@keyframes fh-dot-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .radar-sweep,
  .radar-ripple,
  .radar-dot {
    animation: none;
  }
}
</style>
