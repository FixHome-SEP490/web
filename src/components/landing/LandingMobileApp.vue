<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
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
  icon: any;
  title: string;
  subtext: string;
  tone: 'brand' | 'purple' | 'emerald' | 'amber';
  position: 'top-right' | 'bottom-left';
}

interface StepItem {
  id: string;
  number: string;
  title: string;
  badge: string;
  description: string;
  image: string;
  imageAlt: string;
  floatingBadges: FloatingBadge[];
}

const steps: StepItem[] = [
  {
    id: 'step-discover',
    number: '01',
    title: 'Khám phá dịch vụ & bắt đầu yêu cầu',
    badge: 'Trang chủ ứng dụng',
    description:
      'Chọn dịch vụ cần sửa chữa hoặc bắt đầu nhanh với tính năng Đặt thợ và AI Soi lỗi ngay trên trang chủ.',
    image: '/images/mobile-showcase/step-1-home.png',
    imageAlt: 'Giao diện trang chủ FixHome Mobile - Đặt thợ và AI Soi lỗi',
    floatingBadges: [
      {
        icon: Wrench,
        title: 'Đa dạng dịch vụ sửa chữa',
        subtext: 'Điện, nước, điện lạnh, đồ gia dụng...',
        tone: 'brand',
        position: 'top-right',
      },
      {
        icon: Zap,
        title: 'Bắt đầu yêu cầu nhanh chóng',
        subtext: 'Đặt thợ có mặt 15p & AI Soi lỗi',
        tone: 'emerald',
        position: 'bottom-left',
      },
    ],
  },
  {
    id: 'step-ai-diagnosis',
    number: '02',
    title: 'Mô tả sự cố & nhận hỗ trợ từ AI',
    badge: 'AI Soi lỗi trợ lý',
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
        position: 'top-right',
      },
      {
        icon: BadgePercent,
        title: 'Chi phí tham khảo',
        subtext: 'Khoảng giá sơ bộ tham chiếu minh bạch',
        tone: 'amber',
        position: 'bottom-left',
      },
    ],
  },
  {
    id: 'step-schedule-match',
    number: '03',
    title: 'Chọn lịch & kết nối thợ phù hợp',
    badge: 'Ghép thợ theo khu vực',
    description:
      'Chọn ngày giờ mong muốn, xem danh sách thợ phù hợp theo khu vực và lịch làm việc, sau đó chọn thợ muốn gửi lời mời.',
    image: '/images/mobile-showcase/step-3-matching.png',
    imageAlt: 'Màn hình chọn lịch hẹn và bản đồ vị trí thợ gần bạn',
    floatingBadges: [
      {
        icon: CalendarCheck,
        title: 'Lựa chọn lịch hẹn',
        subtext: 'Chủ động ngày giờ thuận tiện cho gia đình',
        tone: 'brand',
        position: 'top-right',
      },
      {
        icon: MapPin,
        title: 'Kết nối thợ phù hợp',
        subtext: 'Thợ xác minh theo khoảng cách & đánh giá',
        tone: 'emerald',
        position: 'bottom-left',
      },
    ],
  },
  {
    id: 'step-inspection-quote',
    number: '04',
    title: 'Báo giá minh bạch & nghiệm thu',
    badge: 'Khảo sát & Nghiệm thu',
    description:
      'Theo dõi quá trình khảo sát, xem và duyệt báo giá khi cần; xác nhận chi phí phát sinh trước khi thực hiện, theo dõi hình ảnh nghiệm thu và thông tin bảo hành.',
    image: '/images/mobile-showcase/step-4-quotation.png',
    imageAlt: 'Màn hình kỹ thuật viên lập báo giá thực tế và biên bản nghiệm thu',
    floatingBadges: [
      {
        icon: Receipt,
        title: 'Chi phí rõ ràng',
        subtext: 'Báo giá minh bạch, khách duyệt trước khi làm',
        tone: 'brand',
        position: 'top-right',
      },
      {
        icon: ShieldCheck,
        title: 'Hình ảnh nghiệm thu',
        subtext: 'Ảnh hiện trạng thực tế & bảo hành điện tử',
        tone: 'emerald',
        position: 'bottom-left',
      },
    ],
  },
];

const activeStepIndex = ref(0);
const stepRefs = ref<HTMLElement[]>([]);

const activeStep = computed(() => steps[activeStepIndex.value]);

function selectStep(index: number, shouldScroll = false) {
  if (index < 0 || index >= steps.length) return;
  activeStepIndex.value = index;

  if (shouldScroll && stepRefs.value[index]) {
    const el = stepRefs.value[index];
    const yOffset = -140;
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

function nextStep() {
  if (activeStepIndex.value < steps.length - 1) {
    selectStep(activeStepIndex.value + 1, false);
  }
}

function prevStep() {
  if (activeStepIndex.value > 0) {
    selectStep(activeStepIndex.value - 1, false);
  }
}

let observer: IntersectionObserver | null = null;

onMounted(() => {
  // Only observe scroll-based step changes on larger desktop screens
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const indexStr = entry.target.getAttribute('data-step-index');
              if (indexStr !== null) {
                const idx = parseInt(indexStr, 10);
                if (!isNaN(idx) && idx >= 0 && idx < steps.length) {
                  activeStepIndex.value = idx;
                }
              }
            }
          });
        },
        {
          rootMargin: '-30% 0px -40% 0px',
          threshold: 0.2,
        }
      );

      stepRefs.value.forEach((el) => {
        if (el) observer?.observe(el);
      });
    }
  }
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});
</script>

<template>
  <section
    id="mobile-app"
    class="landing-section relative bg-transparent overflow-hidden"
    aria-labelledby="app-section-title"
  >
    <div class="landing-container">
      <!-- Section Header -->
      <div class="max-w-[760px] mb-12 lg:mb-20">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs sm:text-sm font-semibold mb-4">
          <Sparkles class="w-4 h-4 text-brand-600" />
          <span>TRẢI NGHIỆM ỨNG DỤNG FIXHOME</span>
        </div>
        <h2
          id="app-section-title"
          class="text-3xl sm:text-4xl lg:text-[42px] font-bold text-ink-900 tracking-tight leading-[1.2]"
        >
          Từ tìm dịch vụ đến hoàn tất sửa chữa – <span class="text-brand-600">tất cả trên điện thoại.</span>
        </h2>
        <p class="mt-4 text-base sm:text-lg text-ink-600 leading-relaxed max-w-[66ch]">
          Chủ động mô tả sự cố, nhận hỗ trợ từ AI, kết nối thợ phù hợp và theo dõi toàn bộ quá trình sửa chữa ngay trên ứng dụng FixHome.
        </p>
      </div>

      <!-- Mobile & Tablet Step Selector (Tabs) - Visible below 1024px -->
      <div class="lg:hidden mb-8">
        <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
          <button
            v-for="(step, index) in steps"
            :key="step.id"
            type="button"
            class="snap-start shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            :class="[
              activeStepIndex === index
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                : 'bg-white/80 text-ink-600 border border-slate-200/80 hover:bg-slate-50',
            ]"
            @click="selectStep(index)"
          >
            <span
              class="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
              :class="activeStepIndex === index ? 'bg-white/20 text-white' : 'bg-slate-100 text-ink-500'"
            >
              {{ index + 1 }}
            </span>
            <span>{{ step.title.split('&')[0].trim() }}</span>
          </button>
        </div>
      </div>

      <!-- Main Showcase Layout: 2 Columns on Desktop -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 items-start">
        
        <!-- Left Column: Interactive Timeline (Steps) -->
        <div class="lg:col-span-6 xl:col-span-6 relative">
          <!-- Desktop Vertical Progress Line -->
          <div
            class="hidden lg:block absolute left-[27px] top-6 bottom-16 w-[3px] bg-slate-200/70 rounded-full"
            aria-hidden="true"
          >
            <!-- Highlight bar that fills down based on active step -->
            <div
              class="w-full bg-brand-600 rounded-full transition-all duration-500 ease-out"
              :style="{
                height: `${(activeStepIndex / (steps.length - 1)) * 100}%`,
              }"
            ></div>
          </div>

          <!-- Step Items List -->
          <div class="space-y-4 lg:space-y-6">
            <div
              v-for="(step, index) in steps"
              :key="step.id"
              :ref="(el) => { if (el) stepRefs[index] = el as HTMLElement; }"
              :data-step-index="index"
              class="relative rounded-2xl transition-all duration-300 cursor-pointer lg:min-h-[170px]"
              :class="[
                activeStepIndex === index
                  ? 'bg-white/90 border border-brand-200/80 shadow-lg shadow-brand-500/5 p-5 sm:p-6 ring-1 ring-brand-500/10'
                  : 'bg-white/40 hover:bg-white/70 border border-transparent hover:border-slate-200/60 p-5 sm:p-6 opacity-80 hover:opacity-100',
              ]"
              @click="selectStep(index, true)"
            >
              <div class="flex items-start gap-4 sm:gap-5">
                <!-- Step Number Bubble -->
                <div
                  class="shrink-0 flex items-center justify-center w-12 h-12 rounded-2xl font-bold text-base sm:text-lg transition-all duration-300 z-10"
                  :class="[
                    activeStepIndex === index
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25 scale-105'
                      : 'bg-white border border-slate-200 text-ink-500',
                  ]"
                >
                  {{ step.number }}
                </div>

                <!-- Step Text Info -->
                <div class="flex-1 min-w-0 pt-0.5">
                  <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
                      :class="[
                        activeStepIndex === index
                          ? 'bg-brand-50 text-brand-700 border border-brand-200/60'
                          : 'bg-slate-100 text-ink-500',
                      ]"
                    >
                      {{ step.badge }}
                    </span>
                  </div>

                  <h3
                    class="text-base sm:text-lg lg:text-xl font-bold tracking-tight transition-colors duration-200"
                    :class="[
                      activeStepIndex === index ? 'text-ink-900' : 'text-ink-700 hover:text-ink-900',
                    ]"
                  >
                    {{ step.title }}
                  </h3>

                  <p
                    class="mt-2 text-sm sm:text-[15px] leading-relaxed transition-colors duration-200"
                    :class="[
                      activeStepIndex === index ? 'text-ink-600 font-normal' : 'text-ink-500 line-clamp-2 lg:line-clamp-none',
                    ]"
                  >
                    {{ step.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Sticky Smartphone Mockup Showcase -->
        <div class="lg:col-span-6 xl:col-span-6 flex flex-col items-center justify-center lg:sticky lg:top-28 xl:top-32 lg:self-start">
          
          <!-- Outer Phone Stage Container -->
          <div class="relative w-full max-w-[360px] sm:max-w-[400px] xl:max-w-[440px] flex items-center justify-center py-6 sm:py-8">
            
            <!-- Soft Decorative Backdrop Ring / Card -->
            <div
              class="absolute inset-4 sm:inset-6 rounded-[44px] bg-gradient-to-tr from-brand-100/40 via-sky-50/50 to-blue-50/20 border border-brand-200/40 shadow-2xl shadow-brand-600/10 -z-10 pointer-events-none backdrop-blur-sm"
              aria-hidden="true"
            ></div>

            <!-- Soft Glowing Radial Orbs -->
            <div
              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-brand-400/15 rounded-full blur-3xl -z-20 pointer-events-none"
              aria-hidden="true"
            ></div>

            <!-- Floating Card Top Right -->
            <div
              v-if="activeStep.floatingBadges[0]"
              :key="`badge-top-${activeStep.id}`"
              class="floating-card absolute -top-1 sm:-top-2 right-0 sm:-right-4 xl:-right-6 z-20 bg-white/95 backdrop-blur-md border border-slate-100/90 rounded-2xl p-3 sm:px-4 sm:py-3 shadow-xl shadow-slate-900/8 flex items-center gap-3 max-w-[210px] sm:max-w-[260px] transition-all duration-300"
            >
              <div
                class="shrink-0 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl"
                :class="[
                  activeStep.floatingBadges[0].tone === 'brand' && 'bg-brand-50 text-brand-600',
                  activeStep.floatingBadges[0].tone === 'purple' && 'bg-purple-50 text-purple-600',
                  activeStep.floatingBadges[0].tone === 'emerald' && 'bg-emerald-50 text-emerald-600',
                  activeStep.floatingBadges[0].tone === 'amber' && 'bg-amber-50 text-amber-600',
                ]"
              >
                <component
                  :is="activeStep.floatingBadges[0].icon"
                  :size="20"
                  :stroke-width="1.8"
                />
              </div>
              <div class="min-w-0">
                <p class="text-xs sm:text-sm font-bold text-ink-900 truncate">
                  {{ activeStep.floatingBadges[0].title }}
                </p>
                <p class="text-[11px] sm:text-xs text-ink-500 truncate mt-0.5">
                  {{ activeStep.floatingBadges[0].subtext }}
                </p>
              </div>
            </div>

            <!-- Floating Card Bottom Left -->
            <div
              v-if="activeStep.floatingBadges[1]"
              :key="`badge-bottom-${activeStep.id}`"
              class="floating-card absolute -bottom-1 sm:-bottom-2 left-0 sm:-left-4 xl:-left-6 z-20 bg-white/95 backdrop-blur-md border border-slate-100/90 rounded-2xl p-3 sm:px-4 sm:py-3 shadow-xl shadow-slate-900/8 flex items-center gap-3 max-w-[210px] sm:max-w-[260px] transition-all duration-300"
            >
              <div
                class="shrink-0 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl"
                :class="[
                  activeStep.floatingBadges[1].tone === 'brand' && 'bg-brand-50 text-brand-600',
                  activeStep.floatingBadges[1].tone === 'purple' && 'bg-purple-50 text-purple-600',
                  activeStep.floatingBadges[1].tone === 'emerald' && 'bg-emerald-50 text-emerald-600',
                  activeStep.floatingBadges[1].tone === 'amber' && 'bg-amber-50 text-amber-600',
                ]"
              >
                <component
                  :is="activeStep.floatingBadges[1].icon"
                  :size="20"
                  :stroke-width="1.8"
                />
              </div>
              <div class="min-w-0">
                <p class="text-xs sm:text-sm font-bold text-ink-900 truncate">
                  {{ activeStep.floatingBadges[1].title }}
                </p>
                <p class="text-[11px] sm:text-xs text-ink-500 truncate mt-0.5">
                  {{ activeStep.floatingBadges[1].subtext }}
                </p>
              </div>
            </div>

            <!-- Phone Frame Container -->
            <div
              class="relative w-[270px] sm:w-[295px] xl:w-[315px] h-[550px] sm:h-[600px] xl:h-[640px] drop-shadow-[0_22px_36px_rgba(37,99,235,0.14)] drop-shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
            >
              <!-- 4 Step Screenshots with Smooth Fade & Scale Transition -->
              <div
                v-for="(step, index) in steps"
                :key="step.id"
                class="absolute inset-0 w-full h-full transition-all duration-500 ease-out"
                :class="[
                  activeStepIndex === index
                    ? 'opacity-100 scale-100 translate-y-0 z-10'
                    : 'opacity-0 scale-[0.96] translate-y-2 pointer-events-none z-0',
                ]"
              >
                <img
                  :src="step.image"
                  :alt="step.imageAlt"
                  class="w-full h-full object-contain pointer-events-none select-none"
                  loading="lazy"
                  draggable="false"
                />
              </div>
            </div>
          </div>

          <!-- Mobile Controls (Prev / Next Buttons) -->
          <div class="lg:hidden flex items-center justify-between w-full max-w-[320px] mt-4 pt-2">
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
  </section>
</template>

<style scoped>
/* Keyframe animation for subtle floating effect */
@keyframes softFloat {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.floating-card {
  animation: softFloat 4s ease-in-out infinite;
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
