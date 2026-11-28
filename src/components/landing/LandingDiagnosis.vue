<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowRight, CalendarCheck, ScanSearch, ShieldCheck, Sparkles, Wrench } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();

const features = [
  {
    icon: ScanSearch,
    title: 'Nhận diện sự cố',
    description: 'Phân tích mô tả hoặc hình ảnh thiết bị.',
  },
  {
    icon: Wrench,
    title: 'Gợi ý giải pháp phù hợp',
    description: 'Đề xuất nguyên nhân có thể xảy ra, hướng xử lý và dịch vụ tham khảo.',
  },
  {
    icon: CalendarCheck,
    title: 'Đặt dịch vụ',
    description: 'Khách hàng tự lựa chọn dịch vụ và tiếp tục đặt lịch khi sẵn sàng.',
  },
];
</script>

<template>
  <section
    id="ai"
    class="ai-section relative overflow-hidden bg-gradient-to-b from-white via-[#F6FAFF] to-[#EFF6FF]/65 py-14 sm:py-16 lg:py-20"
    aria-labelledby="ai-title"
  >
    <div
      class="landing-container relative z-10 grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-x-10 md:gap-y-10 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,1.02fr)_minmax(0,0.92fr)] lg:gap-8 xl:gap-10"
    >
      <!-- Left column: Intro copy, CTA & advisory disclaimer -->
      <div class="max-w-[540px]">
        <div
          class="inline-flex items-center gap-1.5 rounded-full bg-[#DDEBFF] px-3.5 py-1 text-xs font-semibold text-brand-600 shadow-2xs sm:text-sm"
        >
          <Sparkles :size="14" :stroke-width="1.75" class="shrink-0 text-brand-600" aria-hidden="true" />
          <span>Trợ lý hỗ trợ thông minh</span>
        </div>

        <h2 id="ai-title" class="ai-section-title mt-4">
          Chưa rõ hỏng ở đâu?
          <span class="mt-1 block text-brand-600">Để FixHome gợi ý cho bạn.</span>
        </h2>

        <p class="mt-4 max-w-[46ch] text-[15px] leading-6 text-ink-600 sm:text-base sm:leading-7">
          Mô tả dấu hiệu, gửi ảnh thiết bị và nhận gợi ý về nguyên nhân, hướng xử lý và dịch vụ phù hợp.
        </p>

        <div class="mt-6 sm:mt-7">
          <FhButton
            size="lg"
            class="w-full sm:w-auto"
            @click="router.push('/app/bookings/ai')"
          >
            <Sparkles :size="18" :stroke-width="1.75" class="shrink-0" aria-hidden="true" />
            <span>Phân tích sự cố ngay</span>
            <ArrowRight :size="17" :stroke-width="1.75" class="shrink-0" aria-hidden="true" />
          </FhButton>
        </div>

        <div class="mt-6 flex items-start gap-3">
          <span
            class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-blue-100 bg-white text-brand-600 shadow-[0_2px_8px_rgba(37,99,235,0.06)]"
            aria-hidden="true"
          >
            <ShieldCheck :size="18" :stroke-width="1.75" />
          </span>
          <p class="max-w-[44ch] text-[13.5px] leading-5 text-ink-600">
            Gợi ý từ AI chỉ mang tính tham khảo, không thay thế việc kiểm tra thực tế của kỹ thuật viên.
          </p>
        </div>
      </div>

      <!-- Center column: Real FixHome AI UI mockup grounded over a soft minimalist tabletop & plant -->
      <div class="ai-stage relative mx-auto flex w-full max-w-[360px] items-end justify-center sm:max-w-[420px] lg:max-w-[460px]">
        <img
          :src="'/images/ai-showcase-backdrop.webp'"
          width="880"
          height="880"
          loading="lazy"
          decoding="async"
          alt=""
          aria-hidden="true"
          class="ai-backdrop pointer-events-none h-full w-full object-cover object-bottom select-none"
        />

        <div class="ai-phone-slot relative z-10 flex flex-col items-center">
          <div class="ai-phone-tilt w-full">
            <img
              :src="'/images/steps/step-3-ai-result.png'"
              width="512"
              height="1040"
              loading="eager"
              decoding="async"
              alt="Minh họa giao diện trợ lý AI FixHome đang phân tích thiết bị gia dụng trên điện thoại"
              class="ai-phone-mockup block h-full w-full object-contain select-none"
            />
          </div>
          <div
            class="ai-phone-shadow pointer-events-none -mt-2 h-3.5 w-[68%] rounded-full bg-ink-900/20 blur-md"
            aria-hidden="true"
          />
        </div>
      </div>

      <!-- Right column: 3 vertical feature highlights -->
      <ol
        class="ai-features grid grid-cols-1 gap-6 border-t border-ink-200/70 pt-7 md:col-span-2 md:grid-cols-3 md:gap-6 lg:col-span-1 lg:grid-cols-1 lg:gap-7 lg:border-t-0 lg:pt-0 lg:pr-4"
        aria-label="Các tính năng của trợ lý AI"
      >
        <li v-for="item in features" :key="item.title" class="flex items-start gap-4">
          <span
            class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-blue-100/90 bg-white text-brand-600 shadow-[0_4px_14px_rgba(37,99,235,0.08)]"
            aria-hidden="true"
          >
            <component :is="item.icon" :size="20" :stroke-width="1.75" />
          </span>
          <div class="min-w-0">
            <h3 class="text-base font-semibold leading-6 text-ink-900 sm:text-[17px]">
              {{ item.title }}
            </h3>
            <p class="mt-1 max-w-[34ch] text-[14.5px] leading-6 text-ink-600">
              {{ item.description }}
            </p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.ai-section {
  scroll-margin-top: 80px;
}

.ai-section-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.75rem, 2.35vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.18;
  text-wrap: balance;
}

.ai-stage {
  aspect-ratio: 460 / 435;
}

.ai-backdrop {
  position: absolute;
  inset: auto 0 0;
  height: 94%;
  -webkit-mask-image: radial-gradient(ellipse 64% 66% at 50% 56%, #000 30%, rgb(0 0 0 / 55%) 54%, transparent 72%);
  mask-image: radial-gradient(ellipse 64% 66% at 50% 56%, #000 30%, rgb(0 0 0 / 55%) 54%, transparent 72%);
}

.ai-phone-slot {
  width: 47%;
  margin-left: 16%;
  padding-bottom: 5.5%;
}

.ai-phone-tilt {
  aspect-ratio: 512 / 1040;
  transform: rotate(2.5deg);
  transform-origin: center 75%;
  filter: drop-shadow(0 18px 26px rgb(15 23 42 / 18%));
}

@media (min-width: 768px) {
  .ai-phone-tilt {
    transform: rotate(4deg);
  }
}

.ai-features {
  margin: 0;
  padding-left: 0;
  list-style: none;
}
</style>
