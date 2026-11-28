<script setup lang="ts">
import { useRouter } from 'vue-router';
import { CalendarCheck, CalendarDays, ReceiptText, ShieldCheck, Sparkles } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();

const highlights = [
  { icon: ShieldCheck, label: 'Thợ đã xác minh' },
  { icon: ReceiptText, label: 'Chi phí minh bạch' },
  { icon: CalendarCheck, label: 'Đặt lịch thuận tiện' },
];
</script>

<template>
  <section
    id="gioi-thieu"
    class="hero-section relative w-full overflow-hidden text-white"
    aria-labelledby="hero-title"
  >
    <!-- Full-bleed background image prioritized for LCP -->
    <div class="hero-media pointer-events-none absolute inset-x-0 top-0 select-none md:inset-0" aria-hidden="true">
      <img
        :src="'/images/hero-technician-bg.webp'"
        width="1376"
        height="768"
        fetchpriority="high"
        loading="eager"
        decoding="sync"
        alt=""
        class="hero-bg-image h-full w-full object-cover"
      />
      <div class="hero-scrim-mobile absolute inset-0 md:hidden" />
      <div class="hero-scrim-desktop absolute inset-0 hidden md:block" />
    </div>

    <!-- Foreground content aligned to the landing page container -->
    <div
      class="landing-container relative z-10 flex items-center pt-[258px] pb-10 sm:pt-[294px] sm:pb-12 md:min-h-[540px] md:py-14 lg:min-h-[600px] lg:py-16 xl:min-h-[620px]"
    >
      <div class="hero-copy w-full min-w-0 md:max-w-[400px] lg:max-w-[540px] xl:max-w-[600px]">
        <p class="inline-flex items-center gap-3 text-sm font-medium text-white/95 sm:text-[15px]">
          <span
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white p-1.5 shadow-sm"
            aria-hidden="true"
          >
            <img
              :src="'/images/fixhome-logo-mark.webp'"
              alt=""
              width="24"
              height="24"
              decoding="async"
              class="h-full w-full object-contain select-none"
            />
          </span>
          <span>Sửa thiết bị gia dụng tại nhà</span>
        </p>

        <h1 id="hero-title" class="hero-title mt-5 sm:mt-6">
          <span class="block text-white">Nhà cần sửa.</span>
          <span class="hero-title-accent mt-1 block">Có FixHome bên bạn.</span>
        </h1>

        <p class="mt-4 max-w-[48ch] text-[15px] leading-6 text-white/95 sm:mt-5 sm:text-base sm:leading-7">
          Đặt lịch sửa chữa nhanh chóng, kết nối thợ đã xác minh và nhận hỗ trợ AI khi chưa rõ sự cố.
        </p>

        <div class="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
          <FhButton
            size="lg"
            class="w-full sm:w-auto"
            @click="router.push('/app/bookings/new')"
          >
            <CalendarDays :size="18" :stroke-width="1.75" class="shrink-0" aria-hidden="true" />
            <span>Đặt lịch sửa chữa</span>
          </FhButton>

          <a
            href="/app/bookings/ai"
            class="inline-flex h-[52px] w-full shrink-0 items-center justify-center gap-2.5 rounded-[var(--radius-md)] bg-white px-6 text-base font-semibold whitespace-nowrap text-brand-800 shadow-[var(--shadow-e1)] transition-colors duration-150 hover:bg-brand-50 active:bg-brand-100 sm:w-auto"
            @click.prevent="router.push('/app/bookings/ai')"
          >
            <Sparkles :size="18" :stroke-width="1.75" class="shrink-0 text-brand-600" aria-hidden="true" />
            <span>Nhờ AI gợi ý</span>
          </a>
        </div>

        <ul
          class="hero-highlights mt-7 flex flex-wrap items-center gap-x-4 gap-y-2.5 text-[13px] font-medium text-white/95 sm:mt-8 lg:flex-nowrap lg:gap-x-0 lg:text-sm"
        >
          <li
            v-for="(item, index) in highlights"
            :key="item.label"
            class="inline-flex items-center gap-1.5 whitespace-nowrap lg:gap-2"
            :class="index > 0 ? 'lg:ml-5 lg:border-l lg:border-white/25 lg:pl-5' : ''"
          >
            <component
              :is="item.icon"
              :size="17"
              :stroke-width="1.75"
              class="shrink-0 text-brand-300"
              aria-hidden="true"
            />
            <span>{{ item.label }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  --hero-navy: #022b6b;
  --hero-accent: #5ec0ff;
  background-color: var(--hero-navy);
  scroll-margin-top: 80px;
}

.hero-media {
  height: 296px;
}

.hero-bg-image {
  object-position: 78% 14%;
}

.hero-scrim-mobile {
  background: linear-gradient(
    to bottom,
    rgb(2 43 107 / 0%) 0%,
    rgb(2 43 107 / 0%) 56%,
    rgb(2 43 107 / 78%) 80%,
    var(--hero-navy) 100%
  );
}

.hero-scrim-desktop {
  background: linear-gradient(
    90deg,
    rgb(2 43 107 / 72%) 0%,
    rgb(2 43 107 / 56%) 30%,
    rgb(2 43 107 / 22%) 43%,
    rgb(2 43 107 / 0%) 52%
  );
}

.hero-title {
  margin: 0;
  font-size: clamp(1.85rem, 3.8vw, 3.35rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.08;
  text-wrap: balance;
}

.hero-title-accent {
  color: var(--hero-accent);
}

.hero-section :is(a, button):focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 3px;
  box-shadow: none;
}

@media (min-width: 640px) {
  .hero-media {
    height: 332px;
  }
}

@media (min-width: 768px) {
  .hero-media {
    height: 100%;
  }

  .hero-bg-image {
    object-position: 86% 15%;
  }

  .hero-scrim-desktop {
    background: linear-gradient(
      90deg,
      rgb(2 43 107 / 86%) 0%,
      rgb(2 43 107 / 78%) 42%,
      rgb(2 43 107 / 32%) 56%,
      rgb(2 43 107 / 0%) 66%
    );
  }
}

@media (min-width: 1024px) {
  .hero-bg-image {
    object-position: 75% 16%;
  }

  .hero-scrim-desktop {
    background: linear-gradient(
      90deg,
      rgb(2 43 107 / 45%) 0%,
      rgb(2 43 107 / 32%) 30%,
      rgb(2 43 107 / 10%) 40%,
      rgb(2 43 107 / 0%) 48%
    );
  }
}
</style>
