<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Camera,
  Sparkles,
  CalendarDays,
  CircleCheck,
  ArrowRight,
  ShieldCheck,
  Smartphone,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
const activeStep = ref(0);

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
          Từ lúc thiết bị gặp sự cố đến khi nghiệm thu hoàn tất, bạn luôn là người nắm quyền chủ động.
        </p>
      </div>

      <!-- Balanced 2-Column Grid: Left Visual Mockup, Right Story Steps -->
      <div class="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <!-- LEFT: Visual App Journey Showcase -->
        <div class="relative flex items-center justify-center">
          <!-- Ambient glowing backdrop -->
          <div
            class="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-brand-100/40 via-blue-50/20 to-emerald-50/20 blur-2xl"
            aria-hidden="true"
          ></div>

          <!-- Phone Device Graphic -->
          <figure class="relative z-10 w-full max-w-[320px] sm:max-w-[340px] mx-auto transition-transform duration-300 hover:scale-[1.01]">
            <img
              :src="'/UI mobile.png'"
              alt="Giao diện ứng dụng FixHome hướng dẫn các bước đặt lịch sửa chữa dễ dàng"
              width="540"
              height="1000"
              loading="lazy"
              decoding="async"
              class="w-full h-auto object-contain drop-shadow-(--shadow-e3)"
            />
          </figure>

          <!-- Floating Badge (Top Left) -->
          <div
            class="hidden sm:flex absolute -top-2 left-2 sm:-left-2 z-20 items-center gap-2 rounded-xl border border-brand-200 bg-white/95 px-3 py-2 shadow-(--shadow-e1) backdrop-blur-md"
          >
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Smartphone :size="16" aria-hidden="true" />
            </div>
            <div>
              <span class="block text-xs font-bold text-ink-900">Thao tác thuận tiện</span>
              <span class="block text-[10px] text-brand-700 font-medium">Đặt lịch chỉ mất 1 phút</span>
            </div>
          </div>

          <!-- Floating Badge (Bottom Right) -->
          <div
            class="hidden sm:flex absolute -bottom-2 right-2 sm:-right-2 z-20 items-center gap-2 rounded-xl border border-ink-200/90 bg-white/95 px-3 py-2 shadow-(--shadow-e1) backdrop-blur-md"
          >
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck :size="16" aria-hidden="true" />
            </div>
            <div>
              <span class="block text-xs font-bold text-ink-900">Bảo đảm minh bạch</span>
              <span class="block text-[10px] text-ink-500">Báo giá trước, nghiệm thu sau</span>
            </div>
          </div>
        </div>

        <!-- RIGHT: Interactive Steps List -->
        <div class="space-y-4 lg:space-y-5">
          <div
            v-for="(step, idx) in steps"
            :key="step.stepNum"
            class="group cursor-pointer rounded-xl border p-4 sm:p-5 transition-all duration-300"
            :class="[
              activeStep === idx
                ? 'border-brand-600 bg-brand-50/40 shadow-xs ring-1 ring-brand-200'
                : 'border-ink-200/80 bg-white hover:border-brand-200 hover:bg-ink-50/50'
            ]"
            @click="activeStep = idx"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors font-num"
                  :class="activeStep === idx ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700'"
                >
                  {{ step.stepNum }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
                  :class="[
                    activeStep === idx
                      ? 'bg-brand-100/70 text-brand-800 font-semibold'
                      : 'bg-ink-100 text-ink-600'
                  ]"
                >
                  {{ step.tag }}
                </span>
              </div>

              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-50 text-ink-400 group-hover:text-brand-600 transition-colors">
                <component :is="step.icon" :size="16" aria-hidden="true" />
              </div>
            </div>

            <h3
              class="mt-2.5 text-base sm:text-[17px] font-semibold transition-colors"
              :class="activeStep === idx ? 'text-brand-600 font-bold' : 'text-ink-900 group-hover:text-brand-600'"
            >
              {{ step.title }}
            </h3>

            <p class="mt-1.5 text-sm leading-6 text-ink-600">
              {{ step.description }}
            </p>
          </div>

          <!-- ACTION BUTTONS -->
          <div class="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
