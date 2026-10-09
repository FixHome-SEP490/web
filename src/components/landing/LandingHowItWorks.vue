<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Smartphone,
  Camera,
  Sparkles,
  CalendarDays,
  CircleCheck,
  ArrowRight,
  ShieldCheck,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
const sectionRef = ref<HTMLElement | null>(null);
const activeStep = ref(0);

const steps = [
  {
    stepNum: '01',
    icon: Smartphone,
    tag: 'Bước 1',
    title: 'Mở ứng dụng & Chọn dịch vụ',
    description: 'Duyệt danh mục sửa chữa đa dạng từ điện lạnh, điện nước đến thiết bị gia dụng với bảng giá niêm yết minh bạch.',
    image: '/images/steps/step-1-select-service.png',
    badge: 'Khám phá dịch vụ & Đặt thợ',
  },
  {
    stepNum: '02',
    icon: Camera,
    tag: 'Bước 2',
    title: 'Gửi ảnh & Nhờ AI chẩn đoán',
    description: 'Chụp ảnh sự cố trực tiếp hoặc tải ảnh có sẵn, mô tả hiện tượng bất thường và chọn mức độ khẩn cấp.',
    image: '/images/steps/step-2-ai-diagnosis.png',
    badge: 'Tải tối đa 5 ảnh sự cố',
  },
  {
    stepNum: '03',
    icon: Sparkles,
    tag: 'Bước 3',
    title: 'AI phân tích & Đưa kết quả',
    description: 'Trợ lý AI nhận diện thiết bị, khoanh vùng triệu chứng hỏng hóc và gợi ý dịch vụ phù hợp. Kết quả chỉ mang tính tham khảo.',
    image: '/images/steps/step-3-ai-result.png',
    badge: 'Gợi ý mang tính tham khảo',
  },
  {
    stepNum: '04',
    icon: CalendarDays,
    tag: 'Bước 4',
    title: 'Chọn lịch & Tìm kiếm thợ',
    description: 'Chủ động chọn khung giờ thuận tiện và theo dõi mạng lưới kỹ thuật viên xung quanh vị trí qua bản đồ radar.',
    image: '/images/steps/step-4-find-technician.png',
    badge: 'Radar thợ gần bạn (bán kính 1-2km)',
  },
  {
    stepNum: '05',
    icon: CircleCheck,
    tag: 'Bước 5',
    title: 'Duyệt báo giá & Hoàn tất',
    description: 'Thợ khảo sát thực tế, bạn duyệt báo giá trước khi làm. Sửa xong thợ chụp ảnh sau sửa, bạn thanh toán và nhận bảo hành.',
    image: '/images/steps/step-5-quote-complete.png',
    badge: 'Báo giá trước, thanh toán sau',
  },
];

let isTicking = false;

function updateActiveStepOnScroll() {
  if (!sectionRef.value) return;
  // Pinned scroll on desktop (lg and above)
  if (window.innerWidth >= 1024) {
    const rect = sectionRef.value.getBoundingClientRect();
    const totalDist = sectionRef.value.offsetHeight - window.innerHeight;
    if (totalDist > 0) {
      const scrolled = -rect.top;
      // Calculate progress from 0 to 1
      const progress = Math.max(0, Math.min(0.999, scrolled / totalDist));
      const stepIdx = Math.floor(progress * steps.length);
      const clamped = Math.max(0, Math.min(steps.length - 1, stepIdx));
      if (clamped !== activeStep.value) {
        activeStep.value = clamped;
      }
    }
  } else {
    // Normal mobile scroll tracking: pick element closest to viewport focal zone
    const stepEls = sectionRef.value.querySelectorAll<HTMLElement>('[data-step-index]');
    if (!stepEls || stepEls.length === 0) return;
    const triggerZone = window.innerHeight * 0.45;
    let bestIndex = activeStep.value;
    let minDistance = Infinity;

    stepEls.forEach((el) => {
      const idx = Number(el.getAttribute('data-step-index'));
      const rect = el.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - triggerZone);
      if (distance < minDistance) {
        minDistance = distance;
        bestIndex = idx;
      }
    });

    if (bestIndex !== activeStep.value && bestIndex >= 0 && bestIndex < steps.length) {
      activeStep.value = bestIndex;
    }
  }
}

function onScroll() {
  if (!isTicking) {
    isTicking = true;
    requestAnimationFrame(() => {
      updateActiveStepOnScroll();
      isTicking = false;
    });
  }
}

function selectStep(idx: number) {
  activeStep.value = idx;
  if (!sectionRef.value) return;

  if (window.innerWidth >= 1024) {
    const rect = sectionRef.value.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const totalDist = sectionRef.value.offsetHeight - window.innerHeight;
    if (totalDist > 0) {
      const targetScroll = sectionTop + ((idx + 0.5) / steps.length) * totalDist;
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  } else {
    const targetCard = sectionRef.value?.querySelector(`[data-step-index="${idx}"]`);
    targetCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

onMounted(() => {
  // Preload all 5 step images to ensure instant zero-latency transitions
  steps.forEach((s) => {
    const img = new Image();
    img.src = s.image;
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateActiveStepOnScroll();
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onScroll);
});
</script>

<template>
  <section
    id="how-it-works"
    ref="sectionRef"
    class="relative bg-ink-25 border-y border-ink-100 lg:h-[260vh]"
    aria-labelledby="steps-title"
  >
    <!-- Sticky Full-Frame Showcase on Desktop (Fits completely in one screen frame) -->
    <div class="lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] flex flex-col justify-center py-8 lg:py-2 overflow-hidden">
      <div class="landing-container w-full">
        <!-- Section Header -->
        <div class="max-w-2xl mb-4 lg:mb-6">
          <div class="inline-flex items-center gap-2 mb-1.5">
            <span class="h-0.5 w-6 bg-brand-600 rounded-full"></span>
            <p class="landing-eyebrow mb-0 text-brand-600 font-semibold tracking-wider">TRẢI NGHIỆM ỨNG DỤNG</p>
          </div>
          <h2 id="steps-title" class="steps-title">Sửa chữa đơn giản, từng bước rõ ràng</h2>
          <p class="landing-description mt-1 text-ink-600 text-sm sm:text-base max-w-xl">
            Từ lúc mở ứng dụng đến khi đơn hoàn tất, bạn luôn nắm quyền chủ động trong từng thao tác.
          </p>
        </div>

        <!-- 2-Column Split: Left Stepper (Compact & in-frame), Right Phone with Floating Badges -->
        <div class="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <!-- LEFT COLUMN: Compact Step List with Vertical Accent Indicator (Image 2 style) -->
          <div class="relative">
            <!-- Steps List (Fits cleanly within viewport frame) -->
            <div class="space-y-2.5 sm:space-y-3">
              <div
                v-for="(step, idx) in steps"
                :key="step.stepNum"
                :data-step-index="idx"
                class="group relative pl-4 sm:pl-5 py-1.5 sm:py-2 cursor-pointer select-none transition-all duration-200 rounded-xl"
                :class="[
                  activeStep === idx
                    ? 'bg-white/80 shadow-xs'
                    : 'hover:bg-white/50'
                ]"
                @click="selectStep(idx)"
              >
                <!-- Active accent vertical line indicator on the left (Image 2 style) -->
                <div
                  class="absolute left-0 top-1 bottom-1 w-1 sm:w-1.5 rounded-full transition-all duration-300"
                  :class="activeStep === idx ? 'bg-brand-600 opacity-100' : 'bg-transparent group-hover:bg-ink-200 opacity-40'"
                  aria-hidden="true"
                ></div>

                <!-- Step Number + Title inline -->
                <div class="flex items-baseline gap-2.5 sm:gap-3">
                  <span
                    class="font-num text-lg sm:text-xl font-black transition-colors shrink-0"
                    :class="activeStep === idx ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600'"
                  >
                    {{ step.stepNum }}
                  </span>
                  <h3
                    class="text-sm sm:text-base transition-colors leading-snug"
                    :class="activeStep === idx ? 'text-ink-900 font-extrabold' : 'text-ink-700 font-bold group-hover:text-brand-600'"
                  >
                    {{ step.title }}
                  </h3>
                  <span
                    v-if="activeStep === idx"
                    class="hidden md:inline-block ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 border border-brand-100 shrink-0"
                  >
                    {{ step.badge }}
                  </span>
                </div>

                <!-- Step Description -->
                <p
                  class="text-xs sm:text-[13px] leading-relaxed transition-all duration-200 mt-1 pl-[1.85rem] sm:pl-[2.1rem]"
                  :class="[
                    activeStep === idx
                      ? 'text-ink-600 font-normal opacity-100 max-h-20'
                      : 'text-ink-400 max-h-12 opacity-80 line-clamp-1 group-hover:opacity-100'
                  ]"
                >
                  {{ step.description }}
                </p>
              </div>
            </div>

            <!-- ACTION BUTTONS -->
            <div class="pt-4 sm:pt-5 pl-4 sm:pl-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <FhButton size="md" class="shadow-sm hover:shadow-md transition-shadow" @click="router.push('/services')">
                Bắt đầu đặt lịch ngay
                <ArrowRight :size="16" aria-hidden="true" class="ml-1" />
              </FhButton>
              <router-link
                to="/pricing-policy"
                class="landing-text-link justify-center sm:justify-start text-xs sm:text-sm py-1"
              >
                Tìm hiểu chính sách minh bạch
              </router-link>
            </div>
          </div>

          <!-- RIGHT COLUMN: Centered Phone Mockup with Snug Floating Badges (Image 2 style) -->
          <div class="relative flex flex-col items-center justify-center">
            <!-- Phone Wrapper with badges attached tightly around the phone frame -->
            <div class="relative w-full max-w-[225px] sm:max-w-[245px] lg:max-w-[255px] mx-auto select-none transition-transform duration-300 hover:scale-[1.01]">
              <!-- Floating Badge 1 (Top-Right): Verified Technicians -->
              <div
                class="hidden sm:flex absolute -top-2 -right-8 lg:-right-12 z-20 items-center gap-2 rounded-2xl bg-white/95 backdrop-blur-md px-3 py-2 shadow-lg border border-slate-100/90 select-none transition-all duration-300 hover:scale-105"
              >
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/80">
                  <ShieldCheck :size="18" />
                </div>
                <div class="text-left">
                  <p class="text-xs font-bold text-ink-900 leading-tight">100% Thợ xác minh</p>
                  <p class="text-[10px] text-ink-500 font-medium">Hồ sơ & tay nghề chuẩn</p>
                </div>
              </div>

              <!-- Floating Badge 2 (Mid-Left): Fast Diagnosis / AI -->
              <div
                class="hidden sm:flex absolute top-[36%] -left-8 lg:-left-12 z-20 items-center gap-2 rounded-2xl bg-white/95 backdrop-blur-md px-3 py-2 shadow-lg border border-slate-100/90 select-none transition-all duration-300 hover:scale-105"
              >
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-600 border border-blue-100/80">
                  <Sparkles :size="18" />
                </div>
                <div class="text-left">
                  <p class="text-xs font-bold text-ink-900 leading-tight">Gợi ý chẩn đoán bằng AI</p>
                  <p class="text-[10px] text-ink-500 font-medium">Chỉ mang tính tham khảo</p>
                </div>
              </div>

              <!-- Floating Badge 3 (Bottom-Right): Radar Nearby Tech -->
              <div
                class="hidden sm:flex absolute bottom-8 -right-6 lg:-right-8 z-20 items-center gap-2 rounded-xl bg-white/95 backdrop-blur-md px-3 py-1.5 shadow-md border border-slate-100/90 select-none"
              >
                <span class="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-[11px] font-semibold text-ink-800">Thợ sẵn sàng nhận việc</span>
              </div>

              <!-- Centered Phone Frame Showcase -->
              <div class="relative aspect-[512/1040] w-full max-h-[440px]">
                <img
                  v-for="(st, sIdx) in steps"
                  :key="st.stepNum"
                  :src="st.image"
                  :alt="st.title"
                  width="512"
                  height="1040"
                  loading="eager"
                  decoding="async"
                  class="absolute inset-0 h-full w-full object-contain drop-shadow-(--shadow-e3) transition-all duration-250 ease-out will-change-transform"
                  :class="[
                    activeStep === sIdx
                      ? 'opacity-100 scale-100 z-10'
                      : 'opacity-0 scale-[0.98] pointer-events-none z-0'
                  ]"
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.steps-title {
  font-size: 26px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .steps-title {
    font-size: 30px;
  }
}

@media (min-width: 1024px) {
  .steps-title {
    font-size: 32px;
  }
}
</style>
