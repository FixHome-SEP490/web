<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowRight, Plus, Sparkles } from 'lucide-vue-next';
import { FhButton } from '../../components';
import LandingHero from '../../components/landing/LandingHero.vue';
import LandingServices from '../../components/landing/LandingServices.vue';
import LandingHowItWorks from '../../components/landing/LandingHowItWorks.vue';
import LandingDiagnosis from '../../components/landing/LandingDiagnosis.vue';
import LandingTrust from '../../components/landing/LandingTrust.vue';
import LandingMobileApp from '../../components/landing/LandingMobileApp.vue';

const router = useRouter();

const questions = [
  {
    question: 'AI có tự chẩn đoán hoặc xác nhận giá không?',
    answer:
      'Không. AI chỉ gợi ý sơ bộ. Kỹ thuật viên kiểm tra thực tế; việc cần khảo sát sẽ có báo giá để bạn duyệt trước khi sửa.',
  },
  {
    question: 'Giá sửa chữa được tính thế nào?',
    answer:
      'Giá công tùy dịch vụ và loại máy. Với việc cần khảo sát, kỹ thuật viên kiểm tra và gửi báo giá; chi phí phát sinh cần bạn duyệt trước khi sửa.',
  },
  {
    question: 'Tôi có cần đăng nhập để xem thông tin dịch vụ không?',
    answer:
      'Không. Bạn xem dịch vụ và quy trình tự do; cần đăng nhập khi đặt lịch để theo dõi yêu cầu.',
  },
  {
    question: 'Tôi thanh toán khi nào?',
    answer:
      'Thanh toán được xử lý trong đơn sau khi công việc hoàn tất, theo phương thức hiển thị trên FixHome.',
  },
];
</script>

<template>
  <div class="landing-page bg-white">
    <LandingHero />

    <div id="services">
      <LandingServices />
    </div>

    <LandingDiagnosis />
    <LandingHowItWorks />
    <LandingTrust />
    <LandingMobileApp />

    <section id="questions" class="landing-section bg-white" aria-labelledby="questions-title">
      <div class="landing-container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div class="max-w-[500px]">
          <p class="landing-eyebrow">Trước khi bạn đặt lịch</p>
          <h2 id="questions-title" class="faq-title">Một vài điều bạn có thể muốn biết</h2>
          <router-link to="/pricing-policy" class="landing-text-link mt-5">
            Tìm hiểu chính sách giá
            <ArrowRight :size="18" aria-hidden="true" />
          </router-link>
        </div>

        <div class="faq-list">
          <details v-for="item in questions" :key="item.question" class="landing-faq group">
            <summary class="faq-question">
              {{ item.question }}
              <span class="faq-toggle" aria-hidden="true">
                <Plus :size="18" class="text-brand-600 transition-transform duration-200" />
              </span>
            </summary>
            <p class="faq-answer">{{ item.answer }}</p>
          </details>
        </div>
      </div>
    </section>

    <section class="final-cta landing-section bg-brand-50/70" aria-labelledby="final-title">
      <div class="landing-container grid gap-7 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-10">
        <div class="max-w-[720px]">
          <p class="landing-eyebrow">Bắt đầu khi bạn sẵn sàng</p>
          <h2 id="final-title" class="final-title">Nhà có việc cần sửa? Bắt đầu cùng FixHome.</h2>
          <p class="landing-description max-w-[60ch]">
            Chọn dịch vụ và gửi yêu cầu đặt lịch tại nhà.
          </p>
        </div>

        <div class="flex flex-col gap-2 sm:items-start">
          <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/app/bookings/new')">
            Đặt lịch sửa chữa
            <ArrowRight :size="18" aria-hidden="true" />
          </FhButton>
          <a href="#ai" class="landing-secondary-link w-full sm:w-auto">
            <Sparkles :size="18" class="text-brand-600" aria-hidden="true" />
            Nhờ AI gợi ý
          </a>
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

.faq-list {
  border-top: 1px solid var(--color-ink-200);
}

.landing-faq {
  border-bottom: 1px solid var(--color-ink-200);
}

.faq-question {
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 0;
  color: var(--color-ink-900);
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  list-style: none;
}

.faq-question::-webkit-details-marker {
  display: none;
}

.faq-question:hover {
  color: var(--color-brand-700);
}

.faq-toggle {
  display: flex;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-ink-50);
}

.landing-faq[open] .faq-toggle svg {
  transform: rotate(45deg);
}

.faq-answer {
  max-width: 75ch;
  margin: 0;
  padding: 0 52px 20px 0;
  color: var(--color-ink-600);
  font-size: 15px;
  line-height: 24px;
}

.faq-title,
.final-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.9rem, 3.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
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
