<script setup lang="ts">
import { ref } from 'vue';
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
</script>

<template>
  <section
    id="how-it-works"
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

      <!-- 2-Column Storytelling Grid: Left Functions, Right Visual Mockup -->
      <div class="mt-12 grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <!-- LEFT COLUMN: 5 Interactive Function Steps -->
        <div class="space-y-3.5">
          <div
            v-for="(step, idx) in steps"
            :key="step.stepNum"
            class="group cursor-pointer rounded-xl border p-3.5 sm:p-4 transition-all duration-200"
            :class="[
              activeStep === idx
                ? 'border-brand-600 bg-white shadow-xs ring-1 ring-brand-200'
                : 'border-ink-200/80 bg-white/70 hover:border-brand-200 hover:bg-white'
            ]"
            @click="activeStep = idx"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span
                  class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors font-num"
                  :class="activeStep === idx ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700'"
                >
                  {{ step.stepNum }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
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
                <span class="hidden sm:inline text-[11px]">{{ step.badge }}</span>
                <ChevronRight :size="16" class="transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>

            <h3
              class="mt-2 text-base font-semibold transition-colors"
              :class="activeStep === idx ? 'text-brand-600 font-bold' : 'text-ink-900 group-hover:text-brand-600'"
            >
              {{ step.title }}
            </h3>

            <p class="mt-1 text-sm leading-relaxed text-ink-600">
              {{ step.description }}
            </p>
          </div>

          <!-- ACTION BUTTONS -->
          <div class="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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

        <!-- RIGHT COLUMN: Real Mobile Screen Switching Mockup -->
        <div class="relative flex flex-col items-center justify-center">
          <!-- Ambient glowing backdrop -->
          <div
            class="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-brand-100/40 via-blue-50/20 to-emerald-50/20 blur-2xl"
            aria-hidden="true"
          ></div>

          <!-- Floating Badge Top -->
          <div
            class="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/95 px-4 py-1.5 shadow-xs backdrop-blur-md transition-all duration-300"
          >
            <span class="flex h-2 w-2 rounded-full bg-brand-600 animate-pulse"></span>
            <span class="text-xs font-bold text-ink-900 font-num">Bước 0{{ activeStep + 1 }}/05:</span>
            <span class="text-xs font-semibold text-brand-700">{{ steps[activeStep]?.badge }}</span>
          </div>

          <!-- Phone Device Frame with Screen Image -->
          <div class="relative z-10 w-full max-w-[310px] sm:max-w-[330px] transition-transform duration-300 hover:scale-[1.01]">
            <transition name="screen-fade" mode="out-in">
              <figure :key="activeStep" class="relative">
                <img
                  :src="steps[activeStep]?.image"
                  :alt="steps[activeStep]?.title"
                  width="540"
                  height="1000"
                  loading="lazy"
                  decoding="async"
                  class="w-full h-auto object-contain drop-shadow-(--shadow-e3)"
                />
              </figure>
            </transition>
          </div>

          <!-- Interactive Screen Indicator Navigation Dots -->
          <div class="mt-4 flex items-center justify-center gap-2">
            <button
              v-for="(st, sIdx) in steps"
              :key="st.stepNum"
              type="button"
              class="h-2.5 rounded-full transition-all duration-200"
              :class="[
                activeStep === sIdx
                  ? 'w-7 bg-brand-600'
                  : 'w-2.5 bg-ink-200 hover:bg-ink-400'
              ]"
              :aria-label="`Xem màn hình bước ${sIdx + 1}: ${st.title}`"
              @click="activeStep = sIdx"
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

.screen-fade-enter-active,
.screen-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.screen-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.screen-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .screen-fade-enter-active,
  .screen-fade-leave-active {
    transition: none !important;
  }
}
</style>
