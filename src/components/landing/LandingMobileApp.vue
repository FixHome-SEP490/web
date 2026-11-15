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
const isDesktop = ref(false);

const activeStep = computed(() => steps[activeStepIndex.value]);

function updateScrollProgress() {
  if (!isDesktop.value || !sectionRef.value) return;

  const rect = sectionRef.value.getBoundingClientRect();
  const windowHeight = window.innerHeight || 800;
  const navbarHeight = 80;
  const totalScrollable = rect.height - windowHeight;

  if (totalScrollable <= 0) return;

  // The stage sticks at top: 80px (below header)
  const currentScroll = navbarHeight - rect.top;
  const progress = Math.max(0, Math.min(1, currentScroll / totalScrollable));

  let index = Math.floor(progress * steps.length);
  if (index >= steps.length) index = steps.length - 1;
  if (index < 0) index = 0;

  activeStepIndex.value = index;
}

function selectStep(index: number) {
  if (index < 0 || index >= steps.length) return;
  activeStepIndex.value = index;

  if (isDesktop.value && sectionRef.value) {
    const rect = sectionRef.value.getBoundingClientRect();
    const sectionTop = window.pageYOffset + rect.top;
    const windowHeight = window.innerHeight || 800;
    const navbarHeight = 80;
    const totalScrollable = rect.height - windowHeight;

    if (totalScrollable > 0) {
      const targetScroll = sectionTop - navbarHeight + ((index + 0.5) / steps.length) * totalScrollable;
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
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

onMounted(() => {
  if (typeof window !== 'undefined') {
    const checkDesktop = () => {
      isDesktop.value = window.matchMedia('(min-width: 1024px)').matches;
    };
    checkDesktop();

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
      checkDesktop();
      updateScrollProgress();
    };

    window.addEventListener('scroll', scrollListener, { passive: true });
    window.addEventListener('resize', resizeListener, { passive: true });
    updateScrollProgress();
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    if (scrollListener) window.removeEventListener('scroll', scrollListener);
    if (resizeListener) window.removeEventListener('resize', resizeListener);
  }
});
</script>

<template>
  <!-- Outer Pinned Track: On Desktop, height is 360vh so users scroll through all 4 steps while stage remains pinned -->
  <section
    id="mobile-app"
    ref="sectionRef"
    class="relative bg-transparent"
    :class="[isDesktop ? 'h-[360vh]' : 'h-auto py-12 sm:py-16']"
    aria-labelledby="app-section-title"
  >
    <!-- Inner Pinned Stage: On Desktop, sticky top-20 filling available viewport below header and centered -->
    <div
      class="w-full"
      :class="[
        isDesktop
          ? 'sticky top-20 h-[calc(100vh-5rem)] flex items-center justify-center overflow-hidden py-2'
          : 'relative',
      ]"
    >
      <div class="landing-container w-full">
        <!-- Main Showcase 2-Column Grid (Desktop): Header is in the Left Column, Phone is centered in the Right Column -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-14 items-center">
          
          <!-- Left Column: Header + Compact 4 Timeline Steps -->
          <div class="lg:col-span-6 xl:col-span-7 flex flex-col justify-center">
            
            <!-- Section Header (In Left Column for perfect balanced centering with Phone) -->
            <div class="mb-5 xl:mb-6">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-semibold mb-2.5">
                <Sparkles class="w-3.5 h-3.5 text-brand-600" />
                <span>TRẢI NGHIỆM ỨNG DỤNG FIXHOME</span>
              </div>
              <h2
                id="app-section-title"
                class="text-2xl sm:text-3xl lg:text-[30px] xl:text-[34px] font-bold text-ink-900 tracking-tight leading-[1.25]"
              >
                Tìm dịch vụ, đặt lịch và theo dõi sửa chữa – <span class="text-brand-600">tất cả trên FixHome.</span>
              </h2>
              <p class="mt-2 text-xs sm:text-sm lg:text-[14px] text-ink-600 leading-relaxed max-w-[58ch]">
                Chủ động gửi yêu cầu, nhận hỗ trợ từ AI, kết nối kỹ thuật viên phù hợp và theo dõi toàn bộ quá trình sửa chữa ngay trên ứng dụng FixHome.
              </p>
            </div>

            <!-- Mobile & Tablet Step Selector (Tabs) - Visible below 1024px -->
            <div class="lg:hidden mb-6">
              <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
                <button
                  v-for="(step, index) in steps"
                  :key="step.id"
                  type="button"
                  class="snap-start shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200"
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
            <div class="space-y-2 xl:space-y-2.5">
              <div
                v-for="(step, index) in steps"
                :key="step.id"
                class="relative rounded-2xl transition-all duration-300 cursor-pointer p-3 sm:p-3.5"
                :class="[
                  activeStepIndex === index
                    ? 'bg-white/95 border-l-4 border-l-brand-600 border-y border-r border-slate-200/80 shadow-md shadow-brand-500/5 ring-1 ring-brand-500/10'
                    : 'bg-white/40 hover:bg-white/70 border-l-4 border-l-transparent border-y border-r border-transparent hover:border-slate-200/60 opacity-70 hover:opacity-100',
                ]"
                @click="selectStep(index)"
              >
                <div class="flex items-start gap-3 sm:gap-3.5">
                  <!-- Step Number Bubble -->
                  <div
                    class="shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300"
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

          <!-- Right Column: Smartphone Mockup Stage (Perfect Centering) -->
          <div class="lg:col-span-6 xl:col-span-5 flex flex-col items-center justify-center my-auto">
            
            <!-- Outer Phone Stage Container -->
            <div class="relative w-full max-w-[280px] sm:max-w-[310px] xl:max-w-[340px] flex items-center justify-center py-4">
              
              <!-- Soft Decorative Backdrop Ring / Card -->
              <div
                class="absolute inset-1 sm:inset-2 rounded-[36px] bg-gradient-to-tr from-brand-100/40 via-sky-50/50 to-blue-50/20 border border-brand-200/40 shadow-xl shadow-brand-600/10 -z-10 pointer-events-none backdrop-blur-sm"
                aria-hidden="true"
              ></div>

              <!-- Soft Glowing Radial Orb -->
              <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 bg-brand-400/15 rounded-full blur-3xl -z-20 pointer-events-none"
                aria-hidden="true"
              ></div>

              <!-- Phone Frame Container -->
              <div
                class="relative w-[215px] sm:w-[235px] xl:w-[255px] h-[430px] sm:h-[470px] xl:h-[510px] drop-shadow-[0_18px_30px_rgba(37,99,235,0.12)] drop-shadow-[0_4px_10px_rgba(15,23,42,0.05)]"
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

                <!-- Floating Card Top Right: Placed with minimal overlap (~25px) on outer bezel so phone screen is 100% visible -->
                <div
                  v-if="activeStep.floatingBadges[0]"
                  :key="`badge-top-${activeStep.id}`"
                  class="floating-card hidden lg:flex absolute top-4 -right-28 xl:-right-36 z-20 bg-white/95 backdrop-blur-md border border-slate-100/90 rounded-2xl p-2.5 sm:px-3 sm:py-2.5 shadow-xl shadow-slate-900/10 items-center gap-2.5 w-[190px] xl:w-[210px] transition-all duration-300 pointer-events-none"
                >
                  <div
                    class="shrink-0 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl"
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
                    <p class="text-xs font-bold text-ink-900 truncate">
                      {{ activeStep.floatingBadges[0].title }}
                    </p>
                    <p class="text-[10px] text-ink-500 truncate mt-0.5">
                      {{ activeStep.floatingBadges[0].subtext }}
                    </p>
                  </div>
                </div>

                <!-- Floating Card Bottom Left: Placed with minimal overlap (~25px) on outer bezel so phone buttons/screen are 100% visible -->
                <div
                  v-if="activeStep.floatingBadges[1]"
                  :key="`badge-bottom-${activeStep.id}`"
                  class="floating-card hidden lg:flex absolute bottom-8 -left-28 xl:-left-36 z-20 bg-white/95 backdrop-blur-md border border-slate-100/90 rounded-2xl p-2.5 sm:px-3 sm:py-2.5 shadow-xl shadow-slate-900/10 items-center gap-2.5 w-[190px] xl:w-[210px] transition-all duration-300 pointer-events-none"
                >
                  <div
                    class="shrink-0 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl"
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
                    <p class="text-xs font-bold text-ink-900 truncate">
                      {{ activeStep.floatingBadges[1].title }}
                    </p>
                    <p class="text-[10px] text-ink-500 truncate mt-0.5">
                      {{ activeStep.floatingBadges[1].subtext }}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            <!-- Mobile Controls (Prev / Next Buttons) -->
            <div class="lg:hidden flex items-center justify-between w-full max-w-[280px] mt-2 pt-1">
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
