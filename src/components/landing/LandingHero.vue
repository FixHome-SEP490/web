<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowRight, Check, Sparkles, ShieldCheck, CalendarCheck, ReceiptText } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
</script>

<template>
  <section class="bg-white border-b border-ink-100/80" aria-labelledby="hero-title">
    <div
      class="landing-container grid items-center gap-10 pt-10 pb-16 lg:min-h-[620px] lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-14"
    >
      <div class="hero-left-col max-w-xl">
        <p class="landing-eyebrow hero-eyebrow-anim flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-brand-600" aria-hidden="true"></span>
          Chăm sóc ngôi nhà, theo cách thông minh hơn
        </p>

        <h1 id="hero-title" class="hero-title hero-title-anim">
          Nhà cần sửa.
          <br />
          <span class="text-brand-600">Có FixHome bên bạn.</span>
        </h1>

        <p class="hero-description hero-desc-anim mt-6 text-base sm:text-lg leading-relaxed text-ink-600">
          Kết nối với kỹ thuật viên đã được xác minh để sửa chữa tại nhà. Có AI hỗ trợ phân tích sự cố sơ bộ,
          có báo giá minh bạch trước khi bắt đầu.
        </p>

        <div class="hero-cta-anim mt-8 flex flex-col gap-3.5 sm:flex-row sm:items-center">
          <FhButton size="lg" class="shadow-sm hover:shadow-md transition-shadow" @click="router.push('/app/bookings/new')">
            Đặt lịch sửa chữa
            <ArrowRight :size="18" aria-hidden="true" />
          </FhButton>
          <a href="#ai" class="landing-secondary-link">
            <Sparkles :size="18" class="text-brand-600" aria-hidden="true" />
            Phân tích sự cố bằng AI
          </a>
        </div>

        <p class="hero-cta-anim mt-4 text-xs leading-5 text-ink-500">
          Chưa rõ lỗi thiết bị? Bắt đầu từ mô tả triệu chứng hoặc hình ảnh.
        </p>

        <div
          class="hero-cta-anim mt-8 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-ink-200/80 pt-6 text-xs sm:text-[13px] font-medium text-ink-700"
        >
          <span class="flex items-center gap-2">
            <Check :size="16" class="text-brand-600 shrink-0" aria-hidden="true" />
            Kỹ thuật viên xác minh KYC
          </span>
          <span class="flex items-center gap-2">
            <Check :size="16" class="text-brand-600 shrink-0" aria-hidden="true" />
            Khách hàng duyệt báo giá
          </span>
        </div>
      </div>

      <div class="hero-visual relative min-w-0 pb-6 lg:pl-2">
        <figure class="hero-image-anim overflow-hidden rounded-2xl bg-ink-100 shadow-sm border border-ink-200/60">
          <img
            :src="'/images/technician-home-1280.webp'"
            :srcset="'/images/technician-home-640.webp 640w, /images/technician-home-1280.webp 1280w'"
            sizes="(min-width: 1024px) 620px, calc(100vw - 32px)"
            width="1536"
            height="1024"
            fetchpriority="high"
            alt="Minh họa kỹ thuật viên mặc đồng phục xanh kiểm tra máy lạnh tại nhà"
            class="hero-photo w-full object-cover transition-transform duration-700 ease-out hover:scale-[1.02]"
          />
        </figure>

        <div
          class="hero-card-anim relative mx-4 -mt-14 rounded-xl border border-ink-200/80 bg-white/95 p-4.5 shadow-(--shadow-e2) backdrop-blur-sm sm:mx-6 lg:-ml-6 lg:mr-12"
        >
          <div class="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5">
            <span class="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Sparkles :size="17" class="text-brand-600" aria-hidden="true" />
              AI hỗ trợ phân tích sự cố
            </span>
            <span class="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700">
              Minh họa sơ bộ
            </span>
          </div>
          <p class="mt-2.5 text-sm font-medium text-ink-800">“Máy lạnh chạy nhưng không mát, có tiếng kêu rè rè”</p>
          <p class="mt-1.5 text-xs leading-5 text-ink-600">
            Gợi ý nguyên nhân sơ bộ giúp kỹ thuật viên nắm rõ vấn đề và chuẩn bị linh kiện trước khi đến.
          </p>
        </div>
      </div>
    </div>

    <!-- Value propositions rhythm bar -->
    <div class="border-t border-ink-200/80 bg-ink-25/60 py-6">
      <div class="landing-container grid gap-5 sm:grid-cols-3 sm:gap-8">
        <div class="flex items-center gap-3.5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ShieldCheck :size="22" aria-hidden="true" />
          </div>
          <div>
            <span class="block text-sm font-semibold text-ink-900">Kỹ thuật viên xác minh</span>
            <span class="block text-xs text-ink-600">Được kiểm duyệt danh tính & kỹ năng</span>
          </div>
        </div>
        <div class="flex items-center gap-3.5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ReceiptText :size="22" aria-hidden="true" />
          </div>
          <div>
            <span class="block text-sm font-semibold text-ink-900">Chi phí minh bạch</span>
            <span class="block text-xs text-ink-600">Báo giá rõ ràng, duyệt trước khi làm</span>
          </div>
        </div>
        <div class="flex items-center gap-3.5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <CalendarCheck :size="22" aria-hidden="true" />
          </div>
          <div>
            <span class="block text-sm font-semibold text-ink-900">Chủ động thời gian</span>
            <span class="block text-xs text-ink-600">Đặt lịch linh hoạt theo khung giờ của bạn</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-title {
  font-size: 36px;
  line-height: 1.15;
  letter-spacing: -0.03em;
  font-weight: 700;
  text-wrap: balance;
}

@media (min-width: 640px) {
  .hero-title {
    font-size: 44px;
  }
}

@media (min-width: 1024px) {
  .hero-title {
    font-size: 52px;
    line-height: 1.12;
  }
}

.hero-photo {
  height: 380px;
  object-position: 58% center;
}

@media (max-width: 1023px) {
  .hero-photo {
    height: 380px;
    object-position: center 35%;
  }
}

@media (max-width: 639px) {
  .hero-photo {
    height: 300px;
    object-position: 57% center;
  }
}

/* Hero entrance sequence */
@keyframes heroFadeUp {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes heroScaleIn {
  from {
    opacity: 0;
    transform: scale(1.03);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes heroCardReveal {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-eyebrow-anim {
  animation: heroFadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 0ms;
}

.hero-title-anim {
  animation: heroFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 150ms;
}

.hero-desc-anim {
  animation: heroFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 300ms;
}

.hero-cta-anim {
  animation: heroFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 450ms;
}

.hero-image-anim {
  animation: heroScaleIn 0.75s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 450ms;
}

.hero-card-anim {
  animation: heroCardReveal 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: 650ms;
}

@media (prefers-reduced-motion: reduce) {
  .hero-eyebrow-anim,
  .hero-title-anim,
  .hero-desc-anim,
  .hero-cta-anim,
  .hero-image-anim,
  .hero-card-anim {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
