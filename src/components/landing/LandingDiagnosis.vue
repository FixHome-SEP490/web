<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Sparkles,
  ArrowRight,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
const activeStage = ref(0);

const stages = [
  {
    id: 0,
    title: 'Gửi ảnh hoặc mô tả triệu chứng',
    desc: 'Chụp thiết bị hoặc viết vài dòng về hiện tượng bạn thấy.',
  },
  {
    id: 1,
    title: 'AI nhận diện thiết bị & phân tích',
    desc: 'AI nhận ra loại thiết bị và dấu hiệu bất thường.',
  },
  {
    id: 2,
    title: 'Khoanh vùng nguyên nhân có thể gặp',
    desc: 'Gợi ý vài nguyên nhân để bạn tham khảo trước khi gặp thợ.',
  },
  {
    id: 3,
    title: 'Gợi ý dịch vụ phù hợp',
    desc: 'Bạn vẫn đổi được dịch vụ trước khi đặt thợ.',
  },
];
</script>

<template>
  <section
    id="ai"
    class="landing-section bg-white border-b border-ink-100"
    aria-labelledby="ai-title"
  >
    <div class="landing-container">
      <!-- Section Header -->
      <div class="max-w-2xl">
        <p class="landing-eyebrow">Thêm thông tin, bớt băn khoăn</p>
        <h2 id="ai-title" class="ai-section-title">
          Chưa rõ hỏng ở đâu?
          <br class="hidden sm:block" />
          Để AI hỗ trợ phân tích bước đầu.
        </h2>
        <p class="landing-description">
          Gửi ảnh hoặc vài dòng mô tả. Kết quả chỉ để tham khảo.
        </p>
      </div>

      <!-- Balanced 2-Column Grid: Left Image, Right Story Steps -->
      <div class="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <!-- LEFT: Real AI Diagnosis Infographic Image from User -->
        <div class="relative flex items-center justify-center">
          <!-- Ambient glowing backdrop -->
          <div
            class="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-brand-100/40 via-sky-50/20 to-emerald-50/20 blur-2xl"
            aria-hidden="true"
          ></div>

          <!-- Main Visual Image -->
          <figure class="relative z-10 w-full overflow-hidden rounded-2xl lg:rounded-3xl border border-ink-200/80 bg-white shadow-(--shadow-e2) transition-all duration-300 hover:shadow-(--shadow-e3)">
            <img
              :src="'/images/fixhome-ai-diagnosis.jpg'"
              alt="Quy trình phân tích sự cố bằng AI của FixHome: Gửi ảnh thiết bị, hệ thống nhận diện và gợi ý dịch vụ phù hợp"
              width="768"
              height="1024"
              loading="lazy"
              decoding="async"
              class="w-full h-auto object-cover"
            />
          </figure>
        </div>

        <!-- RIGHT: Interactive Story Steps / Checkpoints -->
        <div class="space-y-4 lg:space-y-5">
          <div
            v-for="(stage, idx) in stages"
            :key="stage.id"
            class="group cursor-pointer rounded-xl border p-4 sm:p-5 transition-all duration-300"
            :class="[
              activeStage === idx
                ? 'border-brand-600 bg-brand-50/40 shadow-xs ring-1 ring-brand-200'
                : 'border-ink-200/80 bg-white hover:border-brand-200 hover:bg-ink-25/50'
            ]"
            @click="activeStage = idx"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors"
              :class="activeStage === idx ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700'"
            >
              0{{ idx + 1 }}
            </span>

            <h3
              class="mt-2.5 text-base sm:text-[17px] font-semibold transition-colors"
              :class="activeStage === idx ? 'text-brand-600 font-bold' : 'text-ink-900 group-hover:text-brand-600'"
            >
              {{ stage.title }}
            </h3>

            <p class="mt-1.5 text-sm leading-6 text-ink-600">
              {{ stage.desc }}
            </p>
          </div>

          <!-- UNIFIED CTA PER ISSUE 04 -->
          <div class="pt-2">
            <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/app/bookings/ai')">
              <Sparkles :size="18" aria-hidden="true" />
              Phân tích sự cố bằng AI
              <ArrowRight :size="18" aria-hidden="true" />
            </FhButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-section-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .ai-section-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .ai-section-title {
    font-size: 34px;
  }
}
</style>
