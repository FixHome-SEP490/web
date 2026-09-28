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
  ChevronRight,
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
    description: 'Dễ dàng duyệt danh mục dịch vụ đa dạng từ điện lạnh, điện nước đến sửa chữa thiết bị với thông tin minh bạch.',
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
    description: 'Trợ lý AI tự động nhận diện thiết bị, khoanh vùng triệu chứng hỏng hóc và ước tính khoảng chi phí sơ bộ.',
    image: '/images/steps/step-3-ai-result.png',
    badge: 'Nhận diện & Gợi ý tức thì (92%)',
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
    title: 'Duyệt báo giá & Nghiệm thu hoàn tất',
    description: 'Thợ khảo sát thực tế, bạn duyệt báo giá trước khi làm. Sau khi sửa xong, nghiệm thu hài lòng kèm bảo hành.',
    image: '/images/steps/step-5-quote-complete.png',
    badge: 'Báo giá trước, nghiệm thu sau',
  },
];

let isTicking = false;

function updateActiveStepOnScroll() {
  if (!sectionRef.value) return;
  const stepEls = sectionRef.value.querySelectorAll<HTMLElement>('[data-step-index]');
  if (!stepEls || stepEls.length === 0) return;

  // Trigger point at 42% of viewport height (ideal reading focal zone)
  const triggerZone = window.innerHeight * 0.42;
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
  const targetCard = sectionRef.value?.querySelector(`[data-step-index="${idx}"]`);
  targetCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

onMounted(() => {
  // Preload all 5 step images to ensure instant zero-latency transitions
  steps.forEach((s) => {
    const img = new Image();
    img.src = s.image;
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  updateActiveStepOnScroll();
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
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
      <!-- Section Header -->
      <div class="max-w-2xl">
        <p class="landing-eyebrow">Hành trình sửa chữa</p>
        <h2 id="steps-title" class="steps-title">Sửa chữa đơn giản, từng bước rõ ràng</h2>
        <p class="landing-description">
          Từ lúc mở ứng dụng đến khi nghiệm thu hoàn tất, bạn luôn nắm quyền chủ động trong từng thao tác.
        </p>
      </div>

      <!-- 2-Column Storytelling Grid: Left Functions, Right Pinned Phone Mockup -->
      <div class="mt-12 grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <!-- LEFT COLUMN: 5 Interactive Function Steps with Scroll Progression -->
        <div class="space-y-6 sm:space-y-8">
          <div
            v-for="(step, idx) in steps"
            :key="step.stepNum"
            :data-step-index="idx"
            class="group cursor-pointer rounded-2xl border p-5 sm:p-6 transition-all duration-300"
            :class="[
              activeStep === idx
                ? 'border-brand-600 bg-white shadow-(--shadow-e2) ring-2 ring-brand-100 scale-[1.01]'
                : 'border-ink-200/80 bg-white/70 hover:border-brand-300 hover:bg-white opacity-85 hover:opacity-100'
            ]"
            @click="selectStep(idx)"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors font-num"
                  :class="activeStep === idx ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700'"
                >
                  {{ step.stepNum }}
                </span>
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
                  :class="[
                    activeStep === idx
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'bg-ink-100 text-ink-600'
                  ]"
                >
                  {{ step.tag }}
                </span>
              </div>

              <div class="flex items-center gap-1.5 text-xs font-medium text-ink-400 group-hover:text-brand-600 transition-colors">
                <span class="hidden sm:inline text-xs font-medium">{{ step.badge }}</span>
                <ChevronRight :size="16" class="transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>

            <h3
              class="mt-3 text-base sm:text-lg font-semibold transition-colors"
              :class="activeStep === idx ? 'text-brand-600 font-bold' : 'text-ink-900 group-hover:text-brand-600'"
            >
              {{ step.title }}
            </h3>

            <p class="mt-1.5 text-sm leading-relaxed text-ink-600">
              {{ step.description }}
            </p>
          </div>

          <!-- ACTION BUTTONS -->
          <div class="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/services')">
              Bắt đầu đặt lịch ngay
              <ArrowRight :size="18" aria-hidden="true" />
            </FhButton>
            <router-link
              to="/pricing-policy"
              class="landing-text-link justify-center sm:justify-start text-sm py-2"
            >
              Tìm hiểu chính sách minh bạch
            </router-link>
          </div>
        </div>

        <!-- RIGHT COLUMN: Sticky Real Phone Mockup with 0 Background Layers -->
        <div class="lg:sticky lg:top-28 flex flex-col items-center justify-center">
          <!-- Step Badge on Top -->
          <div
            class="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-1.5 shadow-xs transition-all duration-300"
          >
            <span class="flex h-2 w-2 rounded-full bg-brand-600 animate-pulse"></span>
            <span class="text-xs font-bold text-ink-900 font-num">Bước 0{{ activeStep + 1 }}/05:</span>
            <span class="text-xs font-semibold text-brand-700">{{ steps[activeStep]?.badge }}</span>
          </div>

          <!-- Phone Device Showcase (No background layer, exact 512x1040 transparent canvas) -->
          <div class="relative w-full max-w-[340px] sm:max-w-[370px] lg:max-w-[385px] mx-auto transition-transform duration-300 hover:scale-[1.01]">
            <div class="relative aspect-[512/1040] w-full select-none">
              <img
                v-for="(st, sIdx) in steps"
                :key="st.stepNum"
                :src="st.image"
                :alt="st.title"
                width="512"
                height="1040"
                loading="eager"
                decoding="async"
                class="absolute inset-0 h-full w-full object-contain drop-shadow-(--shadow-e3) transition-all duration-300 ease-out will-change-transform"
                :class="[
                  activeStep === sIdx
                    ? 'opacity-100 scale-100 z-10'
                    : 'opacity-0 scale-[0.98] pointer-events-none z-0'
                ]"
              />
            </div>
          </div>

          <!-- Interactive Screen Indicator Navigation Dots -->
          <div class="mt-5 flex items-center justify-center gap-2">
            <button
              v-for="(st, sIdx) in steps"
              :key="st.stepNum"
              type="button"
              class="h-2.5 rounded-full transition-all duration-300"
              :class="[
                activeStep === sIdx
                  ? 'w-8 bg-brand-600 shadow-xs'
                  : 'w-2.5 bg-ink-300 hover:bg-ink-500'
              ]"
              :aria-label="`Xem màn hình bước ${sIdx + 1}: ${st.title}`"
              @click="selectStep(sIdx)"
            ></button>
          </div>
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
</style>
