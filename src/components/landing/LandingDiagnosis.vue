<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
const activeStage = ref(0);

const stages = [
  {
    id: 0,
    title: 'Gửi ảnh hoặc mô tả triệu chứng',
    subtitle: 'Không cần kiến thức kỹ thuật',
    desc: 'Chỉ cần chụp lại thiết bị hoặc gõ vài dòng ngắn về hiện tượng bất thường bạn quan sát được.',
  },
  {
    id: 1,
    title: 'AI nhận diện thiết bị & phân tích',
    subtitle: 'Xử lý sơ bộ tức thì',
    desc: 'Hệ thống đối chiếu cơ sở dữ liệu triệu chứng phổ biến để nhận diện loại thiết bị và bất thường.',
  },
  {
    id: 2,
    title: 'Khoanh vùng nguyên nhân có thể gặp',
    subtitle: 'Tránh suy đoán mơ hồ',
    desc: 'Gợi ý các nguyên nhân tiềm ẩn giúp bạn có thêm thông tin tham khảo trước khi trao đổi với thợ.',
  },
  {
    id: 3,
    title: 'Gợi ý dịch vụ & kỹ thuật viên',
    subtitle: 'Đúng việc, đúng chuyên môn',
    desc: 'Tự động gợi ý gói dịch vụ và kỹ thuật viên chuyên trách, kèm khoảng giá tham khảo rõ ràng.',
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
          Chỉ cần ảnh chụp thiết bị hoặc vài dòng mô tả, FixHome sẽ hỗ trợ nhận biết sơ bộ nguyên nhân
          và gợi ý dịch vụ phù hợp nhất.
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

          <!-- Floating Badge (Top Left) -->
          <div
            class="hidden sm:flex absolute -top-3 -left-3 z-20 items-center gap-2 rounded-xl border border-brand-200 bg-white/95 px-3 py-2 shadow-(--shadow-e1) backdrop-blur-md"
          >
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Sparkles :size="16" aria-hidden="true" />
            </div>
            <div>
              <span class="block text-xs font-bold text-ink-900">AI FixHome Smart</span>
              <span class="block text-[10px] text-brand-700 font-medium">Nhận diện & Gợi ý tức thì</span>
            </div>
          </div>

          <!-- Floating Badge (Bottom Right) -->
          <div
            class="hidden sm:flex absolute -bottom-3 -right-3 z-20 items-center gap-2 rounded-xl border border-ink-200/90 bg-white/95 px-3 py-2 shadow-(--shadow-e1) backdrop-blur-md"
          >
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 :size="16" aria-hidden="true" />
            </div>
            <div>
              <span class="block text-xs font-bold text-ink-900">Độ chính xác cao</span>
              <span class="block text-[10px] text-ink-500">Đa dạng thiết bị gia đình</span>
            </div>
          </div>
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
            <div class="flex items-center justify-between">
              <span
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors"
                :class="activeStage === idx ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700'"
              >
                0{{ idx + 1 }}
              </span>
              <span class="text-xs font-medium text-ink-500">{{ stage.subtitle }}</span>
            </div>

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
