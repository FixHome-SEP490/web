<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CreditCard,
  Globe,
  HelpCircle,
  Minus,
  Plus,
  ReceiptText,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
} from 'lucide-vue-next';
import LandingHero from '../../components/landing/LandingHero.vue';
import LandingServices from '../../components/landing/LandingServices.vue';
import LandingDiagnosis from '../../components/landing/LandingDiagnosis.vue';
import LandingTrust from '../../components/landing/LandingTrust.vue';
import LandingMobileApp from '../../components/landing/LandingMobileApp.vue';

const router = useRouter();

const questions = [
  {
    icon: Bot,
    question: 'AI có tự chẩn đoán hoặc xác nhận giá không?',
    answer:
      'Không. AI chỉ gợi ý sơ bộ. Kỹ thuật viên kiểm tra thực tế; việc cần khảo sát sẽ có báo giá để bạn duyệt trước khi sửa.',
  },
  {
    icon: ReceiptText,
    question: 'Giá sửa chữa được tính như thế nào?',
    answer:
      'Giá công tùy dịch vụ và loại máy. Với việc cần khảo sát, kỹ thuật viên kiểm tra và gửi báo giá; chi phí phát sinh cần bạn duyệt trước khi sửa.',
  },
  {
    icon: Globe,
    question: 'Tôi có cần đăng nhập để xem thông tin dịch vụ không?',
    answer:
      'Không. Bạn xem dịch vụ và quy trình tự do; cần đăng nhập khi đặt lịch để theo dõi yêu cầu.',
  },
  {
    icon: CreditCard,
    question: 'Tôi thanh toán khi nào?',
    answer:
      'Thanh toán được xử lý trong đơn sau khi công việc hoàn tất, theo phương thức hiển thị trên FixHome.',
  },
  {
    icon: ShieldCheck,
    question: 'Kỹ thuật viên được xác minh như thế nào?',
    answer:
      'Hồ sơ cá nhân và kỹ năng chuyên môn của kỹ thuật viên được xem xét trước khi nhận việc trên FixHome.',
  },
  {
    icon: ShieldPlus,
    question: 'Làm thế nào để yêu cầu bảo hành?',
    answer:
      'Bạn có thể xem điều kiện bảo hành và gửi yêu cầu trực tiếp ngay trong chi tiết đơn sửa chữa đã hoàn tất.',
  },
];

const openQuestionIndex = ref<number | null>(0);

function toggleQuestion(index: number) {
  openQuestionIndex.value = openQuestionIndex.value === index ? null : index;
}
</script>

<template>
  <div class="landing-page bg-transparent">
    <LandingHero />

    <div id="services">
      <LandingServices />
    </div>

    <LandingDiagnosis />
    <LandingTrust />
    <LandingMobileApp />

    <section
      id="questions"
      class="faq-section relative overflow-hidden py-14 sm:py-16 lg:py-20"
      aria-labelledby="questions-title"
    >
      <!-- Subtle decorative background curves scoped to FAQ -->
      <div class="faq-bg-curve faq-bg-curve--top pointer-events-none" aria-hidden="true" />
      <div class="faq-bg-curve faq-bg-curve--bottom pointer-events-none" aria-hidden="true" />

      <div
        class="landing-container relative z-10 grid grid-cols-1 items-start gap-9 lg:grid-cols-[minmax(0,0.36fr)_minmax(0,0.64fr)] lg:gap-12 xl:gap-14"
      >
        <!-- Left Column (~35%): Badge, Title, Short Description, 3-Device Showcase, Pricing CTA -->
        <div class="flex min-w-0 flex-col items-start">
          <div
            class="inline-flex items-center gap-1.5 rounded-full border border-brand-100/90 bg-[#EAF3FF] px-3.5 py-1 text-xs font-semibold text-brand-700 sm:text-[13px]"
          >
            <HelpCircle :size="15" :stroke-width="1.8" class="shrink-0 text-brand-600" aria-hidden="true" />
            <span>Câu hỏi thường gặp</span>
          </div>

          <h2 id="questions-title" class="faq-heading mt-4">
            <span class="block text-ink-900">Bạn có thắc mắc?</span>
            <span class="mt-0.5 block text-brand-600">FixHome giải đáp.</span>
          </h2>

          <p class="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-ink-600">
            Tổng hợp những câu hỏi phổ biến giúp bạn hiểu rõ hơn về dịch vụ, chi phí và quy trình sửa chữa tại nhà.
          </p>

          <div class="faq-devices-wrap mt-6 w-full max-w-[400px] sm:mt-7 lg:max-w-none">
            <img
              :src="'/images/faq-devices-showcase.webp'"
              width="944"
              height="454"
              loading="lazy"
              decoding="async"
              alt="Giao diện FixHome hiển thị đồng bộ trên MacBook, iPhone và iPad"
              class="faq-devices-image block h-auto w-full object-contain select-none"
            />
          </div>

          <router-link
            to="/pricing-policy"
            class="faq-pricing-cta group mt-6 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-sm shadow-brand-600/20 transition-all duration-150 hover:bg-brand-700 active:scale-[0.98] sm:text-[15px]"
          >
            <span>Xem chính sách giá</span>
            <ArrowRight
              :size="17"
              :stroke-width="1.8"
              class="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </router-link>
        </div>

        <!-- Right Column (~65%): Modern Accordion -->
        <div class="faq-accordion flex min-w-0 flex-col gap-3">
          <details
            v-for="(item, index) in questions"
            :key="item.question"
            :open="openQuestionIndex === index"
            class="faq-card group overflow-hidden rounded-2xl border transition-all duration-200"
            :class="[
              openQuestionIndex === index
                ? 'border-[#C5DCFA] bg-[#EAF3FF]/85 shadow-[0_6px_22px_rgba(37,99,235,0.07)]'
                : 'border-[#DCE5F0] bg-white hover:border-brand-300/80 hover:bg-[#FBFDFF] shadow-[0_1px_3px_rgba(15,23,42,0.03)]',
            ]"
          >
            <summary
              class="faq-summary flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-[18px]"
              :aria-expanded="openQuestionIndex === index"
              @click.prevent="toggleQuestion(index)"
            >
              <span class="flex min-w-0 items-center gap-3.5">
                <span
                  v-if="openQuestionIndex === index"
                  class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white text-brand-600 shadow-2xs sm:inline-flex"
                  aria-hidden="true"
                >
                  <component :is="item.icon" :size="20" :stroke-width="1.75" />
                </span>
                <span
                  class="text-[15px] font-semibold leading-snug transition-colors duration-150 sm:text-base"
                  :class="openQuestionIndex === index ? 'text-brand-600' : 'text-ink-900'"
                >
                  {{ item.question }}
                </span>
              </span>

              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 sm:h-9 sm:w-9"
                :class="
                  openQuestionIndex === index
                    ? 'bg-[#D6E8FF] text-brand-700'
                    : 'bg-[#EAF3FF] text-brand-600 group-hover:bg-[#DCEBFF]'
                "
                aria-hidden="true"
              >
                <Minus v-if="openQuestionIndex === index" :size="17" :stroke-width="2" />
                <Plus v-else :size="17" :stroke-width="2" />
              </span>
            </summary>

            <div class="faq-answer-wrap px-4 pb-4 sm:px-6 sm:pb-5">
              <p
                class="m-0 text-[14.5px] leading-relaxed text-ink-600 sm:text-[15px]"
                :class="openQuestionIndex === index ? 'sm:pl-[54px]' : ''"
              >
                {{ item.answer }}
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>

    <section class="final-cta py-12 sm:py-16 lg:py-20" aria-labelledby="final-title">
      <div class="landing-container">
        <div class="final-cta-card relative overflow-hidden rounded-3xl sm:rounded-[2.5rem] bg-[#F0F6FE] border border-blue-100/90 shadow-sm p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-8">
          <!-- Left: House illustration + Vertical Divider + Text Content -->
          <div class="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7 lg:gap-8 min-w-0">
            <!-- 3D House Illustration -->
            <div class="shrink-0 flex items-center justify-center">
              <img
                :src="'/images/landing-cta-house.png'"
                alt="FixHome"
                class="w-28 sm:w-36 lg:w-44 h-auto object-contain select-none"
                loading="lazy"
              />
            </div>

            <!-- Vertical Divider Line -->
            <div class="hidden sm:block w-px h-20 lg:h-24 bg-blue-200/70 shrink-0" aria-hidden="true" />

            <!-- Text Content -->
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-bold text-brand-600 mb-1 sm:mb-1.5 tracking-normal">
                Bắt đầu khi bạn sẵn sàng
              </p>
              <h2 id="final-title" class="final-title font-bold text-ink-900 tracking-tight leading-[1.25]">
                Nhà có việc cần sửa?<br />
                Bắt đầu cùng <span class="text-brand-600">FixHome.</span>
              </h2>
              <p class="mt-2 text-xs sm:text-sm text-ink-600 leading-normal max-w-md">
                Chọn dịch vụ và gửi yêu cầu đặt lịch tại nhà.
              </p>
            </div>
          </div>

          <!-- Right: Horizontal CTA Buttons -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 lg:ml-auto">
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 h-12 px-5 sm:px-6 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-sm sm:text-[14.5px] font-semibold shadow-md shadow-brand-600/20 transition-all whitespace-nowrap cursor-pointer"
              @click="router.push('/app/bookings/new')"
            >
              <CalendarDays :size="17" class="shrink-0" aria-hidden="true" />
              <span>Đặt lịch sửa chữa</span>
              <ArrowRight :size="15" class="shrink-0" aria-hidden="true" />
            </button>

            <a
              href="/app/bookings/ai"
              class="inline-flex items-center justify-center gap-2 h-12 px-5 sm:px-6 rounded-2xl bg-white hover:bg-slate-50 active:scale-[0.98] text-ink-900 text-sm sm:text-[14.5px] font-semibold border border-slate-200/90 shadow-sm transition-all whitespace-nowrap cursor-pointer"
              @click.prevent="router.push('/app/bookings/ai')"
            >
              <Sparkles :size="17" class="text-brand-600 shrink-0" aria-hidden="true" />
              <span>Nhờ AI gợi ý</span>
              <ArrowRight :size="15" class="text-brand-600 shrink-0" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style>
.landing-container {
  width: 100%;
  max-width: 1520px;
  margin-inline: auto;
  padding-inline: 24px;
}

.landing-section {
  padding-block: 80px;
  scroll-margin-top: 80px;
}

.landing-eyebrow {
  margin: 0 0 12px;
  color: var(--color-brand-600);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: 0.02em;
}

.landing-description {
  margin-top: 14px;
  color: var(--color-ink-600);
  font-size: 16px;
  line-height: 26px;
}

.landing-text-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  color: var(--color-brand-600);
  font-size: 15px;
  font-weight: 600;
  transition: color 0.15s ease;
}

.landing-text-link:hover {
  color: var(--color-brand-700);
  text-decoration: underline;
  text-underline-offset: 4px;
}

.landing-secondary-link {
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 24px;
  border: 1px solid var(--color-ink-200);
  border-radius: var(--radius-md);
  background: white;
  color: var(--color-ink-800);
  font-size: 15px;
  font-weight: 600;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.landing-secondary-link:hover {
  border-color: var(--color-brand-300);
  background: var(--color-ink-25);
  color: var(--color-brand-700);
}

.landing-page {
  overflow-wrap: anywhere;
}

.landing-page :is(a, button, summary):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 4px;
}

.final-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.4rem, 2.3vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.25;
}

@media (max-width: 767px) {
  .landing-container {
    padding-inline: 16px;
  }

  .landing-section {
    padding-block: 56px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-page * {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>

<style scoped>
.faq-section {
  background: linear-gradient(180deg, #f7f9fc 0%, #f1f6fd 52%, #f7f9fc 100%);
  scroll-margin-top: 80px;
}

.faq-bg-curve {
  position: absolute;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(219, 234, 254, 0.55) 0%, rgba(239, 246, 255, 0) 70%);
}

.faq-bg-curve--top {
  top: -160px;
  right: -120px;
  width: 520px;
  height: 520px;
}

.faq-bg-curve--bottom {
  bottom: -180px;
  left: -140px;
  width: 480px;
  height: 480px;
}

.faq-heading {
  margin: 0;
  font-size: clamp(1.85rem, 2.9vw, 2.55rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.16;
  text-wrap: balance;
}

.faq-devices-image {
  filter: drop-shadow(0 14px 24px rgba(15, 23, 42, 0.1));
}

.faq-summary::-webkit-details-marker {
  display: none;
}

.faq-card {
  interpolate-size: allow-keywords;
}

.faq-card::details-content {
  transition:
    block-size 240ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    content-visibility 240ms allow-discrete;
  block-size: 0;
  opacity: 0;
  overflow: hidden;
}

.faq-card[open]::details-content {
  block-size: auto;
  opacity: 1;
}

@keyframes faqReveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.faq-card[open] .faq-answer-wrap {
  animation: faqReveal 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .faq-card::details-content,
  .faq-card[open] .faq-answer-wrap {
    transition: none !important;
    animation: none !important;
  }
}
</style>
