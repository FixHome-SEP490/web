<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, type Component } from 'vue';
import {
  Wrench,
  Zap,
  Bot,
  BadgePercent,
  CalendarCheck,
  MapPin,
  Receipt,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from 'lucide-vue-next';

interface FloatingBadge {
  icon: Component;
  title: string;
  subtext: string;
  tone: 'brand' | 'purple' | 'emerald' | 'amber';
}

interface StepItem {
  id: string;
  number: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  floatingBadges: FloatingBadge[];
}

const steps: StepItem[] = [
  {
    id: 'step-discover',
    number: '01',
    title: 'Khám phá dịch vụ & tạo yêu cầu',
    description:
      'Chọn dịch vụ cần sửa chữa hoặc danh mục phù hợp để nhanh chóng gửi yêu cầu trên FixHome.',
    image: '/images/mobile-showcase/step-1-home.png',
    imageAlt: 'Giao diện trang chủ FixHome Mobile - Đặt thợ và AI Soi lỗi',
    floatingBadges: [
      {
        icon: Wrench,
        title: 'Đa dạng dịch vụ sửa chữa',
        subtext: 'Điện, nước, điện lạnh, đồ gia dụng...',
        tone: 'brand',
      },
      {
        icon: Zap,
        title: 'Bắt đầu yêu cầu nhanh chóng',
        subtext: 'Đặt thợ có mặt 15p & AI Soi lỗi',
        tone: 'emerald',
      },
    ],
  },
  {
    id: 'step-ai-diagnosis',
    number: '02',
    title: 'Mô tả sự cố & nhận hỗ trợ từ AI',
    description:
      'Gửi hình ảnh, mô tả tình trạng và mức độ khẩn cấp. AI hỗ trợ phân tích, gợi ý nguyên nhân và khoảng chi phí tham khảo.',
    image: '/images/mobile-showcase/step-2-ai.png',
    imageAlt: 'Màn hình chụp ảnh, mô tả sự cố và gợi ý phân tích từ AI FixHome',
    floatingBadges: [
      {
        icon: Bot,
        title: 'AI hỗ trợ phân tích',
        subtext: 'Chuẩn đoán hình ảnh & gợi ý nguyên nhân',
        tone: 'purple',
      },
      {
        icon: BadgePercent,
        title: 'Chi phí tham khảo',
        subtext: 'Khoảng giá sơ bộ tham chiếu minh bạch',
        tone: 'amber',
      },
    ],
  },
  {
    id: 'step-schedule-match',
    number: '03',
    title: 'Chọn lịch & kết nối kỹ thuật viên',
    description:
      'Chọn thời gian mong muốn, xem danh sách kỹ thuật viên phù hợp theo khu vực và lịch làm việc, sau đó gửi lời mời.',
    image: '/images/mobile-showcase/step-3-matching.png',
    imageAlt: 'Màn hình chọn lịch hẹn và bản đồ vị trí thợ gần bạn',
    floatingBadges: [
      {
        icon: CalendarCheck,
        title: 'Lựa chọn lịch hẹn',
        subtext: 'Chủ động ngày giờ thuận tiện cho gia đình',
        tone: 'brand',
      },
      {
        icon: MapPin,
        title: 'Kết nối kỹ thuật viên',
        subtext: 'Kỹ thuật viên theo khoảng cách & đánh giá',
        tone: 'emerald',
      },
    ],
  },
  {
    id: 'step-inspection-quote',
    number: '04',
    title: 'Theo dõi báo giá & nghiệm thu',
    description:
      'Theo dõi quá trình khảo sát, xem và duyệt báo giá; xác nhận chi phí phát sinh trước khi thực hiện, đồng thời theo dõi hình ảnh nghiệm thu và thông tin bảo hành.',
    image: '/images/mobile-showcase/step-4-quotation.png',
    imageAlt: 'Màn hình kỹ thuật viên lập báo giá thực tế và biên bản nghiệm thu',
    floatingBadges: [
      {
        icon: Receipt,
        title: 'Chi phí rõ ràng',
        subtext: 'Báo giá minh bạch, khách duyệt trước khi làm',
        tone: 'brand',
      },
      {
        icon: ShieldCheck,
        title: 'Hình ảnh nghiệm thu',
        subtext: 'Ảnh hiện trạng thực tế & bảo hành điện tử',
        tone: 'emerald',
      },
    ],
  },
];

const activeStepIndex = ref(0);
const sectionRef = ref<HTMLElement | null>(null);
const isDesktopLayout = ref(false);
const isPinnedStage = ref(false);
let programmaticScrollUntil = 0;

const activeStep = computed(() => steps[activeStepIndex.value]);

function updateScrollProgress() {
  if (!isPinnedStage.value || !sectionRef.value) return;
  if (performance.now() < programmaticScrollUntil) return;

  const rect = sectionRef.value.getBoundingClientRect();
  const windowHeight = window.innerHeight || 800;
  const headerOffset = 72;
  const totalScrollable = rect.height - windowHeight;

  if (totalScrollable <= 0) return;

  // The stage sticks below the public navbar
  const currentScroll = headerOffset - rect.top;
  const progress = Math.max(0, Math.min(1, currentScroll / totalScrollable));

  let index = Math.floor(progress * steps.length);
  if (index >= steps.length) index = steps.length - 1;
  if (index < 0) index = 0;

  activeStepIndex.value = index;
}

function selectStep(index: number) {
  if (index < 0 || index >= steps.length) return;
  activeStepIndex.value = index;

  if (isPinnedStage.value && sectionRef.value) {
    const rect = sectionRef.value.getBoundingClientRect();
    const sectionTop = window.pageYOffset + rect.top;
    const windowHeight = window.innerHeight || 800;
    const headerOffset = 72;
    const totalScrollable = rect.height - windowHeight;

    if (totalScrollable > 0) {
      const targetScroll =
        sectionTop - headerOffset + ((index + 0.5) / steps.length) * totalScrollable;
      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      programmaticScrollUntil = prefersReducedMotion ? 0 : performance.now() + 750;
      window.scrollTo({ top: targetScroll, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  }
}

function nextStep() {
  if (activeStepIndex.value < steps.length - 1) {
    selectStep(activeStepIndex.value + 1);
  }
}

function prevStep() {
  if (activeStepIndex.value > 0) {
    selectStep(activeStepIndex.value - 1);
  }
}

let scrollListener: (() => void) | null = null;
let resizeListener: (() => void) | null = null;
let desktopMq: MediaQueryList | null = null;
let heightMq: MediaQueryList | null = null;
let motionMq: MediaQueryList | null = null;

function syncViewportMode() {
  if (typeof window === 'undefined') return;
  const wideEnough = window.matchMedia('(min-width: 1024px)').matches;
  const tallEnough = window.matchMedia('(min-height: 560px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  isDesktopLayout.value = wideEnough;
  isPinnedStage.value = wideEnough && tallEnough && !reducedMotion;
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncViewportMode();

    let ticking = false;
    scrollListener = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          updateScrollProgress();
          ticking = false;
        });
        ticking = true;
      }
    };

    resizeListener = () => {
      syncViewportMode();
      updateScrollProgress();
    };

    desktopMq = window.matchMedia('(min-width: 1024px)');
    heightMq = window.matchMedia('(min-height: 560px)');
    motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    desktopMq.addEventListener?.('change', resizeListener);
    heightMq.addEventListener?.('change', resizeListener);
    motionMq.addEventListener?.('change', resizeListener);

    window.addEventListener('scroll', scrollListener, { passive: true });
    window.addEventListener('resize', resizeListener, { passive: true });
    updateScrollProgress();
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    if (scrollListener) window.removeEventListener('scroll', scrollListener);
    if (resizeListener) {
      window.removeEventListener('resize', resizeListener);
      desktopMq?.removeEventListener?.('change', resizeListener);
      heightMq?.removeEventListener?.('change', resizeListener);
      motionMq?.removeEventListener?.('change', resizeListener);
    }
  }
});
</script>

<template>
  <!-- Outer Pinned Track: On Desktop (with sufficient height & motion enabled), scrolls through all 4 steps while stage remains pinned -->
  <section
    id="mobile-app"
    ref="sectionRef"
    class="mobile-app-section relative bg-transparent"
    :class="[isPinnedStage ? 'mobile-app-pinned' : 'h-auto py-12 sm:py-16 lg:py-20']"
    aria-labelledby="app-section-title"
  >
    <!-- Inner Sticky Stage: Uses min-height (never clips vertically) and overflow-x-clip -->
    <div
      class="mobile-app-stage w-full"
      :class="[
        isPinnedStage
          ? 'sticky top-[72px] min-h-[calc(100dvh-72px)] flex items-center justify-center overflow-x-clip py-3 lg:py-4'
          : 'relative overflow-x-clip',
      ]"
    >
      <div class="landing-container w-full">
        <!-- Main Showcase 2-Column Grid (Desktop): Header + Steps on Left, Phone Stage on Right -->
        <div
          class="mobile-app-grid grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 xl:gap-12 items-center"
        >
          <!-- Left Column: Header + Compact 4 Timeline Steps -->
          <div class="mobile-app-copy lg:col-span-6 xl:col-span-7 flex flex-col justify-center min-w-0">
            <!-- Section Header -->
            <div class="mobile-app-header mb-4 xl:mb-6">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold mb-2.5">
                <Sparkles class="w-3.5 h-3.5 text-brand-600 shrink-0" aria-hidden="true" />
                <span>TRẢI NGHIỆM ỨNG DỤNG FIXHOME</span>
              </div>
              <h2
                id="app-section-title"
                class="mobile-app-title font-bold text-ink-900 tracking-tight leading-[1.22]"
              >
                Tìm dịch vụ, đặt lịch và theo dõi sửa chữa – <span class="text-brand-600">tất cả trên FixHome.</span>
              </h2>
              <p class="mobile-app-subtitle mt-2 text-xs sm:text-sm text-ink-600 leading-relaxed max-w-[58ch]">
                Chủ động gửi yêu cầu, nhận hỗ trợ từ AI, kết nối kỹ thuật viên phù hợp và theo dõi toàn bộ quá trình sửa chữa ngay trên ứng dụng FixHome.
              </p>
            </div>

            <!-- Mobile & Tablet Step Selector (Tabs) - Visible below 1024px -->
            <div class="lg:hidden mb-5">
              <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
                <button
                  v-for="(step, index) in steps"
                  :key="step.id"
                  type="button"
                  class="snap-start shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200"
                  :class="[
                    activeStepIndex === index
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                      : 'bg-white/80 text-ink-600 border border-slate-200/80 hover:bg-slate-50',
                  ]"
                  @click="selectStep(index)"
                >
                  <span
                    class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold"
                    :class="activeStepIndex === index ? 'bg-white/20 text-white' : 'bg-slate-100 text-ink-500'"
                  >
                    {{ index + 1 }}
                  </span>
                  <span>{{ step.title.split('&')[0].trim() }}</span>
                </button>
              </div>
            </div>

            <!-- 4 Steps List -->
            <div class="mobile-app-steps space-y-2 xl:space-y-2.5">
              <div
                v-for="(step, index) in steps"
                :key="step.id"
                class="mobile-app-step relative rounded-2xl transition-all duration-300 cursor-pointer p-3 sm:p-3.5"
                :class="[
                  activeStepIndex === index
                    ? 'bg-white/95 border-l-4 border-l-brand-600 border-y border-r border-slate-200/80 shadow-md shadow-brand-500/5 ring-1 ring-brand-500/10'
                    : 'bg-white/40 hover:bg-white/70 border-l-4 border-l-transparent border-y border-r border-transparent hover:border-slate-200/60 opacity-75 hover:opacity-100',
                ]"
                @click="selectStep(index)"
              >
                <div class="flex items-start gap-3 sm:gap-3.5">
                  <!-- Step Number Bubble -->
                  <div
                    class="shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl font-bold text-xs sm:text-sm transition-transform duration-300"
                    :class="[
                      activeStepIndex === index
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 scale-105'
                        : 'bg-slate-100/90 border border-slate-200 text-ink-400',
                    ]"
                  >
                    {{ step.number }}
                  </div>

                  <!-- Step Content -->
                  <div class="flex-1 min-w-0 pt-0.5">
                    <h3
                      class="text-sm sm:text-[15px] font-bold tracking-tight transition-colors duration-200"
                      :class="[
                        activeStepIndex === index ? 'text-ink-900' : 'text-ink-700 hover:text-ink-900',
                      ]"
                    >
                      {{ step.title }}
                    </h3>

                    <p
                      class="mt-1 text-xs sm:text-[13px] leading-relaxed transition-colors duration-200"
                      :class="[
                        activeStepIndex === index ? 'text-ink-600 font-normal' : 'text-ink-500 line-clamp-2',
                      ]"
                    >
                      {{ step.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Unified Co-Scaling Smartphone Showcase Stage -->
          <div class="lg:col-span-6 xl:col-span-5 flex flex-col items-center justify-center my-auto min-w-0">
            <!-- Outer Phone Stage Container: anchors backdrop, phone, and floating badges proportionally -->
            <div class="phone-stage relative w-full mx-auto flex flex-col items-center justify-center">
              <!-- Phone + Backdrop Core Wrapper -->
              <div class="phone-stage-visual relative w-full flex items-center justify-center">
                <!-- Soft Decorative Backdrop Card (scales proportionally with phone stage) -->
                <div
                  class="phone-backdrop-card absolute rounded-[32px] sm:rounded-[36px] bg-gradient-to-tr from-brand-100/40 via-sky-50/50 to-blue-50/20 border border-brand-200/40 shadow-xl shadow-brand-600/10 -z-10 pointer-events-none backdrop-blur-sm"
                  aria-hidden="true"
                ></div>

                <!-- Soft Glowing Radial Orb -->
                <div
                  class="phone-glow-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/15 blur-3xl -z-20 pointer-events-none"
                  aria-hidden="true"
                ></div>

                <!-- Phone Frame Container: locked 520:1050 aspect ratio, zero layout shift on slide switch -->
                <div class="phone-frame relative">
                  <!-- 4 Step Screenshots with GPU-composited Fade & Scale Transition -->
                  <div
                    v-for="(step, index) in steps"
                    :key="step.id"
                    class="phone-slide absolute inset-0 w-full h-full"
                    :class="[
                      activeStepIndex === index
                        ? 'opacity-100 scale-100 translate-y-0 z-10'
                        : 'opacity-0 scale-[0.96] translate-y-2 pointer-events-none z-0',
                    ]"
                  >
                    <img
                      :src="step.image"
                      :alt="step.imageAlt"
                      width="520"
                      height="1050"
                      loading="eager"
                      decoding="async"
                      class="w-full h-full object-contain pointer-events-none select-none"
                      draggable="false"
                    />
                  </div>
                </div>

                <!-- Floating Card Top Right (anchored to .phone-stage-visual from sm/640px upward) -->
                <div
                  v-if="activeStep.floatingBadges[0]"
                  class="floating-badge-anchor floating-badge-anchor--top hidden sm:block pointer-events-none"
                >
                  <div
                    class="floating-card floating-card--top bg-white/95 backdrop-blur-md border border-slate-100/90 rounded-2xl px-3 py-2.5 shadow-xl shadow-slate-900/10"
                  >
                    <Transition name="badge-swap">
                      <div :key="`badge-top-${activeStep.id}`" class="flex items-center gap-2.5">
                        <div
                          class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl"
                          :class="[
                            activeStep.floatingBadges[0].tone === 'brand' && 'bg-brand-50 text-brand-600',
                            activeStep.floatingBadges[0].tone === 'purple' && 'bg-purple-50 text-purple-600',
                            activeStep.floatingBadges[0].tone === 'emerald' && 'bg-emerald-50 text-emerald-600',
                            activeStep.floatingBadges[0].tone === 'amber' && 'bg-amber-50 text-amber-600',
                          ]"
                        >
                          <component
                            :is="activeStep.floatingBadges[0].icon"
                            :size="16"
                            :stroke-width="1.8"
                          />
                        </div>
                        <div class="min-w-0">
                          <p class="text-xs font-bold text-ink-900 leading-snug">
                            {{ activeStep.floatingBadges[0].title }}
                          </p>
                          <p class="text-[11px] text-ink-500 leading-tight mt-0.5">
                            {{ activeStep.floatingBadges[0].subtext }}
                          </p>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- Floating Card Bottom Left (anchored to .phone-stage-visual from sm/640px upward) -->
                <div
                  v-if="activeStep.floatingBadges[1]"
                  class="floating-badge-anchor floating-badge-anchor--bottom hidden sm:block pointer-events-none"
                >
                  <div
                    class="floating-card floating-card--bottom bg-white/95 backdrop-blur-md border border-slate-100/90 rounded-2xl px-3 py-2.5 shadow-xl shadow-slate-900/10"
                  >
                    <Transition name="badge-swap">
                      <div :key="`badge-bottom-${activeStep.id}`" class="flex items-center gap-2.5">
                        <div
                          class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl"
                          :class="[
                            activeStep.floatingBadges[1].tone === 'brand' && 'bg-brand-50 text-brand-600',
                            activeStep.floatingBadges[1].tone === 'purple' && 'bg-purple-50 text-purple-600',
                            activeStep.floatingBadges[1].tone === 'emerald' && 'bg-emerald-50 text-emerald-600',
                            activeStep.floatingBadges[1].tone === 'amber' && 'bg-amber-50 text-amber-600',
                          ]"
                        >
                          <component
                            :is="activeStep.floatingBadges[1].icon"
                            :size="16"
                            :stroke-width="1.8"
                          />
                        </div>
                        <div class="min-w-0">
                          <p class="text-xs font-bold text-ink-900 leading-snug">
                            {{ activeStep.floatingBadges[1].title }}
                          </p>
                          <p class="text-[11px] text-ink-500 leading-tight mt-0.5">
                            {{ activeStep.floatingBadges[1].subtext }}
                          </p>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>
              </div>

              <!-- Compact Mobile Annotation Cards (< 640px): keeps both floating notes visible without covering phone screen or overflowing 320px -->
              <div class="sm:hidden grid grid-cols-1 gap-2 w-full max-w-[340px] mt-3">
                <div
                  v-for="(badge, bIdx) in activeStep.floatingBadges"
                  :key="`mobile-badge-${activeStep.id}-${bIdx}`"
                  class="floating-card-mobile flex items-center gap-2.5 bg-white/95 border border-slate-100/90 rounded-2xl px-3 py-2 shadow-sm shadow-slate-900/5"
                >
                  <div
                    class="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl"
                    :class="[
                      badge.tone === 'brand' && 'bg-brand-50 text-brand-600',
                      badge.tone === 'purple' && 'bg-purple-50 text-purple-600',
                      badge.tone === 'emerald' && 'bg-emerald-50 text-emerald-600',
                      badge.tone === 'amber' && 'bg-amber-50 text-amber-600',
                    ]"
                  >
                    <component :is="badge.icon" :size="16" :stroke-width="1.8" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-bold text-ink-900 leading-snug">{{ badge.title }}</p>
                    <p class="text-[11px] text-ink-500 leading-tight mt-0.5">{{ badge.subtext }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Mobile Controls (Prev / Next Buttons) -->
            <div class="lg:hidden flex items-center justify-between w-full max-w-[300px] mt-3 pt-1">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-ink-600 hover:text-ink-900 hover:bg-white/80 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                :disabled="activeStepIndex === 0"
                @click="prevStep"
              >
                <ChevronLeft class="w-4 h-4" />
                <span>Bước trước</span>
              </button>
              <div class="text-xs font-semibold text-ink-500">
                {{ activeStepIndex + 1 }} / {{ steps.length }}
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-brand-600 hover:text-brand-700 hover:bg-white/80 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                :disabled="activeStepIndex === steps.length - 1"
                @click="nextStep"
              >
                <span>Bước tiếp</span>
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mobile-app-section {
  scroll-margin-top: 72px;
}

.mobile-app-pinned {
  /* Capped scroll track so ultra-tall 1440p/4K screens don't get excessive vertical scroll */
  height: clamp(1900px, 310vh, 2900px);
}

.mobile-app-title {
  font-size: clamp(1.45rem, 2.35vw, 2.125rem);
}

/* Unified Phone Stage container: co-scales phone, backdrop, and floating badges inside column */
.phone-stage {
  --phone-w: clamp(185px, 52vw, 224px);
  max-width: 100%;
}

.phone-stage-visual {
  padding-block: 14px;
  min-height: calc(var(--phone-w) * 2.02 + 28px);
}

.phone-backdrop-card {
  width: min(calc(var(--phone-w) * 1.24), 100%);
  height: calc(var(--phone-w) * 2.02 + 16px);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.phone-glow-orb {
  width: calc(var(--phone-w) * 0.92);
  height: calc(var(--phone-w) * 0.92);
}

.phone-frame {
  width: var(--phone-w);
  aspect-ratio: 520 / 1050;
  flex-shrink: 0;
  contain: layout style;
  filter: drop-shadow(0 18px 30px rgba(37, 99, 235, 0.12)) drop-shadow(0 4px 10px rgba(15, 23, 42, 0.05));
}

.phone-slide {
  transition:
    opacity 420ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

/* Floating badges: anchored relative to .phone-stage-visual, guaranteed inside stage width */
.floating-badge-anchor {
  position: absolute;
  z-index: 20;
  width: clamp(186px, 40%, 236px);
}

.floating-badge-anchor--top {
  top: 7%;
  right: 0;
}

.floating-badge-anchor--bottom {
  bottom: 9%;
  left: 0;
}

@media (min-width: 640px) {
  .phone-stage {
    --phone-w: clamp(205px, 31vw, 238px);
    max-width: 480px;
  }
}

@media (min-width: 1024px) {
  .phone-stage {
    /* Bounded simultaneously by column width and available viewport height */
    --phone-w: clamp(178px, min(22vw, calc((100dvh - 150px) * 0.45)), 248px);
    max-width: 100%;
  }

  .floating-badge-anchor {
    width: clamp(182px, 44%, 236px);
  }

  .floating-badge-anchor--top {
    top: 6%;
    right: 0;
  }

  .floating-badge-anchor--bottom {
    bottom: 8%;
    left: 0;
  }
}

/* Compact vertical rhythm on shorter laptop viewports (e.g. 1366x640, 1280x600, Windows 125%-150% scaling) */
@media (min-width: 1024px) and (max-height: 760px) {
  .mobile-app-header {
    margin-bottom: 0.75rem;
  }

  .mobile-app-title {
    font-size: clamp(1.32rem, 2.05vw, 1.75rem);
  }

  .mobile-app-subtitle {
    margin-top: 0.35rem;
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .mobile-app-steps {
    gap: 0.375rem;
  }

  .mobile-app-steps > :not(:first-child) {
    margin-top: 0.375rem;
  }

  .mobile-app-step {
    padding: 0.5625rem 0.75rem;
  }

  .phone-stage-visual {
    padding-block: 8px;
    min-height: calc(var(--phone-w) * 2.02 + 16px);
  }

  .phone-backdrop-card {
    height: calc(var(--phone-w) * 2.02 + 10px);
  }
}

@media (min-width: 1024px) and (max-height: 650px) {
  .mobile-app-stage {
    padding-block: 0.35rem;
  }

  .mobile-app-header {
    margin-bottom: 0.5rem;
  }

  .mobile-app-header > div:first-child {
    margin-bottom: 0.35rem;
  }

  .mobile-app-step {
    padding: 0.45rem 0.7rem;
  }

  .mobile-app-step p {
    margin-top: 0.125rem;
    line-height: 1.35;
  }
}

/* Separate float animation layer on inner card so it never collides with anchor positioning */
@keyframes softFloat {
  0%, 100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -4px, 0);
  }
}

.floating-card {
  animation: softFloat 4s ease-in-out infinite;
  will-change: transform;
}

.floating-card--bottom {
  animation-delay: 0.8s;
}

.badge-swap-enter-active {
  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.badge-swap-leave-active {
  display: none;
}

.badge-swap-enter-from {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .phone-slide,
  .badge-swap-enter-active,
  .badge-swap-leave-active {
    transition: none !important;
  }

  .floating-card {
    animation: none !important;
    transform: none !important;
  }
}

/* Hide scrollbar for Chrome, Safari and Opera */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
/* Hide scrollbar for IE, Edge and Firefox */
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
