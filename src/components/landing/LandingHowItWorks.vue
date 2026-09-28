<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Camera, Sparkles, CalendarDays, CircleCheck } from 'lucide-vue-next';

const sectionRef = ref<HTMLElement | null>(null);

// Smooth interpolated progress (0.0 to 1.0)
const currentProgress = ref(0);
let targetProgress = 0;
let animationFrameId = 0;
let isTicking = false;

const steps = [
  {
    icon: Camera,
    stepNum: '01',
    title: 'Mô tả sự cố & gửi ảnh',
    description: 'Chia sẻ vấn đề bạn gặp phải, đính kèm ảnh thiết bị để lưu lại hiện trạng ban đầu.',
    tag: 'Dễ dàng',
  },
  {
    icon: Sparkles,
    stepNum: '02',
    title: 'Phân tích sơ bộ bằng AI',
    description: 'Nhận gợi ý nguyên nhân tiềm ẩn và dịch vụ tham khảo, hoặc chủ động chọn loại việc cần làm.',
    tag: 'Tiết kiệm thời gian',
  },
  {
    icon: CalendarDays,
    stepNum: '03',
    title: 'Chọn lịch & Ghép nối thợ',
    description: 'Chọn khung giờ và địa chỉ phù hợp. FixHome tự động kết nối kỹ thuật viên đúng chuyên môn.',
    tag: 'Đúng chuyên môn',
  },
  {
    icon: CircleCheck,
    stepNum: '04',
    title: 'Duyệt báo giá & Hoàn tất',
    description: 'Bạn duyệt báo giá trước khi sửa chữa, theo dõi tiến độ thực tế và nghiệm thu hài lòng.',
    tag: 'Minh bạch 100%',
  },
];

// Thresholds for each segment
// Segment 0: Step 1 -> Step 2 (progress 0.05 to 0.35)
// Segment 1: Step 2 -> Step 3 (progress 0.35 to 0.65)
// Segment 2: Step 3 -> Step 4 (progress 0.65 to 0.95)
function getSegmentFill(index: number): number {
  const p = currentProgress.value;
  if (index === 0) {
    if (p <= 0.05) return 0;
    if (p >= 0.35) return 100;
    return ((p - 0.05) / 0.3) * 100;
  }
  if (index === 1) {
    if (p <= 0.35) return 0;
    if (p >= 0.65) return 100;
    return ((p - 0.35) / 0.3) * 100;
  }
  if (index === 2) {
    if (p <= 0.65) return 0;
    if (p >= 0.95) return 100;
    return ((p - 0.65) / 0.3) * 100;
  }
  return 0;
}

// Whether a step has been reached
function isStepReached(index: number): boolean {
  const p = currentProgress.value;
  if (index === 0) return true;
  if (index === 1) return p >= 0.32;
  if (index === 2) return p >= 0.62;
  return p >= 0.92;
}

// Active step index
const activeStep = computed(() => {
  const p = currentProgress.value;
  if (p < 0.32) return 0;
  if (p < 0.62) return 1;
  if (p < 0.92) return 2;
  return 3;
});

// Vertical timeline overall fill (0 to 100%)
const verticalFillPercent = computed(() => {
  const p = currentProgress.value;
  return Math.min(100, Math.max(0, p * 100));
});

// Butter-smooth lerp animation loop
function runLerpLoop() {
  const diff = targetProgress - currentProgress.value;
  if (Math.abs(diff) < 0.001) {
    currentProgress.value = targetProgress;
    isTicking = false;
    return;
  }
  // Smooth easing factor: 0.12 ensures velvety, responsive follow-through without lag
  currentProgress.value += diff * 0.12;
  animationFrameId = requestAnimationFrame(runLerpLoop);
}

function onScroll() {
  if (!sectionRef.value) return;
  const rect = sectionRef.value.getBoundingClientRect();
  const windowHeight = window.innerHeight;

  // The scroll storytelling zone:
  // Starts when section is comfortably visible in the viewport
  const startY = windowHeight * 0.75;
  // Completes when the section has scrolled through gracefully
  const endY = windowHeight * 0.15;
  const totalTravel = Math.max(380, startY - endY);

  const currentTravel = startY - rect.top;
  const raw = Math.max(0, Math.min(1, currentTravel / totalTravel));
  targetProgress = raw;

  if (!isTicking) {
    isTicking = true;
    runLerpLoop();
  }
}

// Interactive click-to-preview step
function jumpToStep(index: number) {
  const stepTargets = [0.05, 0.38, 0.68, 0.98];
  targetProgress = stepTargets[index] ?? 0;
  if (!isTicking) {
    isTicking = true;
    runLerpLoop();
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  cancelAnimationFrame(animationFrameId);
});
</script>

<template>
  <section
    id="how-it-works"
    ref="sectionRef"
    class="landing-section bg-ink-25 border-y border-ink-100"
    aria-labelledby="steps-title"
  >
    <div class="landing-container">
      <div class="max-w-2xl">
        <p class="landing-eyebrow">Hành trình sửa chữa</p>
        <h2 id="steps-title" class="steps-title">Sửa chữa đơn giản, từng bước rõ ràng</h2>
        <p class="landing-description">
          Từ lúc thiết bị gặp sự cố đến khi nghiệm thu hoàn tất, bạn luôn là người nắm quyền chủ động.
        </p>
      </div>

      <!-- DESKTOP CONNECTED TIMELINE -->
      <div class="mt-16 hidden md:block">
        <ol class="timeline-grid grid grid-cols-4 gap-6 lg:gap-8">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            class="group relative flex flex-col items-start cursor-pointer select-none"
            @click="jumpToStep(index)"
          >
            <!-- Top Row: Icon + Connected Line Segment -->
            <div class="relative w-full flex items-center">
              <!-- Step Icon Marker -->
              <div
                class="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 transition-all duration-300"
                :class="[
                  activeStep === index
                    ? 'border-brand-600 bg-brand-600 text-white shadow-lg shadow-brand-600/25 ring-4 ring-brand-100'
                    : isStepReached(index)
                    ? 'border-brand-600 bg-brand-600 text-white shadow-xs'
                    : 'border-ink-200 bg-white text-ink-400 group-hover:border-brand-300 group-hover:text-ink-600'
                ]"
              >
                <component :is="step.icon" :size="24" :stroke-width="1.8" aria-hidden="true" />
              </div>

              <!-- Connecting segment to next step (ONLY for index 0, 1, 2) -->
              <div
                v-if="index < 3"
                class="pointer-events-none absolute top-7 -translate-y-1/2 h-[3px] rounded-full bg-ink-200/90 overflow-hidden"
                :style="{
                  left: '56px',
                  right: 'calc(-1 * var(--col-gap, 24px))'
                }"
                aria-hidden="true"
              >
                <!-- Filled portion of this segment -->
                <div
                  class="h-full rounded-full bg-brand-600 will-change-transform"
                  :style="{ width: `${getSegmentFill(index)}%` }"
                ></div>
              </div>
            </div>

            <!-- Step Number & Tag -->
            <div class="mt-5 flex items-center gap-2">
              <span
                class="font-num text-xs font-bold tracking-wider transition-colors duration-200"
                :class="isStepReached(index) ? 'text-brand-600' : 'text-ink-400'"
              >
                {{ step.stepNum }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-200"
                :class="[
                  activeStep === index
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : isStepReached(index)
                    ? 'bg-ink-100 text-ink-700'
                    : 'bg-ink-100/70 text-ink-500'
                ]"
              >
                {{ step.tag }}
              </span>
            </div>

            <!-- Step Title -->
            <h3
              class="mt-2 text-base font-semibold tracking-tight transition-colors duration-200"
              :class="isStepReached(index) ? 'text-ink-900 font-bold' : 'text-ink-600 font-medium'"
            >
              {{ step.title }}
            </h3>

            <!-- Step Description -->
            <p
              class="mt-2 text-sm leading-6 transition-opacity duration-200"
              :class="isStepReached(index) ? 'text-ink-600 opacity-100' : 'text-ink-500 opacity-75'"
            >
              {{ step.description }}
            </p>
          </li>
        </ol>
      </div>

      <!-- MOBILE VERTICAL TIMELINE -->
      <div class="mt-12 block md:hidden">
        <div class="relative pl-8">
          <!-- Background vertical track line (exactly from center of top icon to center of bottom icon) -->
          <div
            class="absolute top-4 bottom-4 left-3.5 w-[3px] -translate-x-1/2 rounded-full bg-ink-200/90 overflow-hidden"
            aria-hidden="true"
          >
            <!-- Vertical progress fill -->
            <div
              class="w-full rounded-full bg-brand-600 will-change-transform"
              :style="{ height: `${verticalFillPercent}%` }"
            ></div>
          </div>

          <!-- Vertical list of steps -->
          <ol class="space-y-9">
            <li
              v-for="(step, index) in steps"
              :key="step.title"
              class="relative cursor-pointer"
              @click="jumpToStep(index)"
            >
              <!-- Marker on vertical line -->
              <div
                class="absolute -left-8 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-300"
                :class="[
                  activeStep === index
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm ring-2 ring-brand-100'
                    : isStepReached(index)
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-300 bg-white text-ink-400'
                ]"
              >
                <component :is="step.icon" :size="13" :stroke-width="2" aria-hidden="true" />
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <span
                    class="font-num text-xs font-bold"
                    :class="isStepReached(index) ? 'text-brand-600' : 'text-ink-400'"
                  >
                    {{ step.stepNum }}
                  </span>
                  <span class="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                    {{ step.tag }}
                  </span>
                </div>
                <h3
                  class="mt-1 text-base font-semibold"
                  :class="isStepReached(index) ? 'text-ink-900 font-bold' : 'text-ink-600'"
                >
                  {{ step.title }}
                </h3>
                <p class="mt-1 text-sm leading-6 text-ink-600">
                  {{ step.description }}
                </p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.steps-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .steps-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .steps-title {
    font-size: 34px;
  }
}

.timeline-grid {
  --col-gap: 24px;
}

@media (min-width: 1024px) {
  .timeline-grid {
    --col-gap: 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .timeline-grid * {
    transition: none !important;
  }
}
</style>
