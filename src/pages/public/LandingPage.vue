<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  Sparkles,
  Plus,
} from 'lucide-vue-next';
import { FhButton } from '../../components';
import LandingHero from '../../components/landing/LandingHero.vue';
import LandingServices from '../../components/landing/LandingServices.vue';
import LandingHowItWorks from '../../components/landing/LandingHowItWorks.vue';
import LandingDiagnosis from '../../components/landing/LandingDiagnosis.vue';
import LandingTrust from '../../components/landing/LandingTrust.vue';
import LandingMobileApp from '../../components/landing/LandingMobileApp.vue';

const router = useRouter();
const pageRoot = ref<HTMLElement | null>(null);

const questions = [
  {
    question: 'Chưa biết thiết bị gặp lỗi gì, tôi có đặt lịch được không?',
    answer:
      'Có. Bạn có thể mô tả biểu hiện của thiết bị và gửi ảnh để AI hỗ trợ phân tích sơ bộ trong quá trình đặt lịch. Nếu AI chưa đưa ra gợi ý phù hợp, bạn vẫn có thể chủ động tự chọn dịch vụ.',
  },
  {
    question: 'Chi phí sửa chữa được xác nhận khi nào?',
    answer:
      'Bạn có thể xem giá tham khảo trong danh mục dịch vụ. Với dịch vụ cần khảo sát thực tế, kỹ thuật viên sẽ kiểm tra trực tiếp và gửi báo giá chi tiết để bạn duyệt trước khi làm. Mọi chi phí phát sinh cũng cần có sự xác nhận của bạn.',
  },
  {
    question: 'Tôi có cần đăng nhập để xem thông tin dịch vụ không?',
    answer:
      'Bạn có thể tra cứu danh mục dịch vụ và tìm hiểu quy trình mà không cần đăng nhập. Khi gửi yêu cầu đặt lịch, bạn chỉ cần đăng nhập nhanh để hệ thống lưu hồ sơ và tiện theo dõi tiến độ đơn sửa chữa.',
  },
  {
    question: 'Gợi ý của AI có thay thế việc kiểm tra trực tiếp không?',
    answer:
      'Không. AI chỉ hỗ trợ nhận biết sơ bộ và định hướng ban đầu từ hình ảnh hoặc mô tả của bạn. Nguyên nhân chính xác và phương án xử lý cuối cùng luôn được kỹ thuật viên kiểm tra và xác nhận tại nhà.',
  },
];

let observer: IntersectionObserver | null = null;

onMounted(() => {
  // Graceful scroll reveal observer for smooth natural reading flow
  const revealElements = pageRoot.value?.querySelectorAll<HTMLElement>('.story-section-reveal');
  if (revealElements && revealElements.length > 0) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px 60px 0px',
        threshold: 0.05,
      },
    );
    revealElements.forEach((el) => observer?.observe(el));
  }
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <div ref="pageRoot" class="landing-page bg-white">
    <!-- 1. HERO SECTION (White background) -->
    <LandingHero />

    <!-- 2. SERVICES SECTION (White background) -->
    <div id="services" class="story-section-reveal">
      <LandingServices />
    </div>

    <!-- 3. HOW IT WORKS (Very light neutral background bg-ink-25) -->
    <div class="story-section-reveal">
      <LandingHowItWorks />
    </div>

    <!-- 4. AI-ASSISTED PRELIMINARY ANALYSIS (White background) -->
    <div class="story-section-reveal">
      <LandingDiagnosis />
    </div>

    <!-- 5. TECHNICIAN TRUST (Warm light neutral background bg-ink-50) -->
    <div class="story-section-reveal">
      <LandingTrust />
    </div>

    <!-- 6. MOBILE APP & MULTI-DEVICE SHOWCASE -->
    <div class="story-section-reveal">
      <LandingMobileApp />
    </div>

    <!-- 7. FAQ (White background) -->
    <section id="questions" class="landing-section bg-white story-section-reveal" aria-labelledby="questions-title">
      <div class="landing-container grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <p class="landing-eyebrow">Trước khi bạn đặt lịch</p>
          <h2 id="questions-title" class="faq-title">
            Một vài điều bạn
            <br class="hidden lg:block" />
            có thể muốn biết
          </h2>
          <p class="mt-3 text-sm sm:text-base text-ink-600 leading-relaxed max-w-sm">
            Giải đáp thấu đáo những băn khoăn phổ biến về quy trình đặt thợ, báo giá và tính năng AI.
          </p>
          <router-link to="/pricing-policy" class="landing-text-link mt-6">
            Tìm hiểu chính sách giá minh bạch
            <ArrowRight :size="18" aria-hidden="true" />
          </router-link>
        </div>

        <div class="border-t border-ink-200">
          <details
            v-for="item in questions"
            :key="item.question"
            class="landing-faq group border-b border-ink-200 py-1 transition-colors duration-150"
          >
            <summary
              class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm sm:text-[15px] font-semibold text-ink-900 group-hover:text-brand-600 leading-6 transition-colors"
            >
              {{ item.question }}
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-50 group-hover:bg-brand-50 transition-colors">
                <Plus :size="18" class="text-brand-600 transition-transform duration-200" aria-hidden="true" />
              </span>
            </summary>
            <p class="pb-5 pr-6 text-sm sm:text-[15px] leading-relaxed text-ink-600">{{ item.answer }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- 7. FINAL CTA (Light FixHome blue bg-brand-50) -->
    <section class="py-16 sm:py-20 bg-brand-50/50 border-t border-brand-100/80 story-section-reveal" aria-labelledby="final-title">
      <div class="landing-container">
        <div class="rounded-2xl border border-brand-100 bg-white p-8 sm:p-12 lg:p-16 text-center shadow-xs">
          <p class="landing-eyebrow">Để ngôi nhà luôn là nơi an tâm</p>
          <h2 id="final-title" class="final-title">
            Nhà có việc cần sửa?
            <br />
            Bắt đầu cùng FixHome.
          </h2>
          <p class="mx-auto mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-ink-600">
            Mô tả sự cố, chọn lịch phù hợp. Chúng tôi giúp bạn kết nối với kỹ thuật viên đã được xác minh.
          </p>

          <div class="mt-8 flex flex-col justify-center gap-3.5 sm:flex-row sm:items-center">
            <FhButton size="lg" class="shadow-sm hover:shadow-md transition-shadow" @click="router.push('/app/bookings/new')">
              Đặt lịch sửa chữa
              <ArrowRight :size="18" aria-hidden="true" />
            </FhButton>
            <a href="#ai" class="landing-secondary-link">
              <Sparkles :size="18" class="text-brand-600" aria-hidden="true" />
              Phân tích sự cố bằng AI
            </a>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style>
/* Public landing base tokens & container */
.landing-container {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: 24px;
}

.landing-section {
  padding-block: 72px;
  scroll-margin-top: 80px;
}

@media (min-width: 1024px) {
  .landing-section {
    padding-block: 88px;
  }
}

.landing-eyebrow {
  margin-bottom: 12px;
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
  transition: all 0.2s ease;
}

.landing-secondary-link:hover {
  background: var(--color-ink-25);
  border-color: var(--color-brand-300);
  color: var(--color-brand-700);
}

.landing-page {
  overflow-wrap: anywhere;
}

.landing-page :is(a, button, summary):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 4px;
}

.landing-faq summary::-webkit-details-marker {
  display: none;
}

.landing-faq[open] summary svg {
  transform: rotate(45deg);
}

.faq-title,
.final-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .faq-title,
  .final-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .faq-title,
  .final-title {
    font-size: 36px;
  }
}

/* Subtle Natural Scroll Reveal */
.story-section-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.story-section-reveal.is-revealed {
  opacity: 1;
  transform: none;
  will-change: auto;
}

@media (max-width: 767px) {
  .landing-container {
    padding-inline: 16px;
  }
  .landing-section {
    padding-block: 52px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-page *,
  .story-section-reveal {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
