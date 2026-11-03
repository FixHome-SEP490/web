<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowRight, Sparkles } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
</script>

<template>
  <section id="gioi-thieu" class="hero-section bg-white" aria-labelledby="hero-title">
    <div class="landing-container grid items-center gap-9 py-10 sm:py-12 lg:min-h-[680px] lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-14">
      <div class="hero-copy max-w-[650px]">
        <p class="landing-eyebrow flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-brand-600" aria-hidden="true"></span>
          Sửa thiết bị gia dụng tại nhà
        </p>

        <h1 id="hero-title" class="hero-title">
          Nhà cần sửa.
          <span class="block text-brand-600">Có FixHome bên bạn.</span>
        </h1>

        <p class="hero-description mt-5 max-w-[62ch] text-base leading-7 text-ink-600 sm:mt-6 sm:text-[17px] sm:leading-8">
          Xem dịch vụ, thông tin giá và gửi yêu cầu sửa chữa tại nhà. Chưa rõ sự cố? AI có thể gợi ý bước đầu.
        </p>

        <div class="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
          <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/app/bookings/new')">
            Đặt lịch sửa chữa
            <ArrowRight :size="18" aria-hidden="true" />
          </FhButton>
          <a href="/app/bookings/ai" class="landing-secondary-link w-full sm:w-auto" @click.prevent="router.push('/app/bookings/ai')">
            <Sparkles :size="18" class="text-brand-600" aria-hidden="true" />
            Nhờ AI gợi ý
          </a>
        </div>
      </div>

      <figure class="hero-figure min-w-0 overflow-hidden rounded-2xl bg-ink-100 sm:rounded-3xl">
        <img
          :src="'/images/technician-home-1280.webp'"
          :srcset="'/images/technician-home-640.webp 640w, /images/technician-home-1280.webp 1280w'"
          sizes="(min-width: 1024px) 58vw, calc(100vw - 32px)"
          width="1536"
          height="1024"
          fetchpriority="high"
          alt="Minh họa kỹ thuật viên kiểm tra máy lạnh tại nhà"
          class="hero-photo w-full object-cover"
        />
      </figure>
    </div>
  </section>
</template>

<style scoped>
.hero-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(2rem, 4.4vw, 3.65rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.08;
  text-wrap: balance;
}

.hero-photo {
  height: clamp(320px, 39vw, 610px);
  object-position: 58% center;
}

@media (max-width: 639px) {
  .hero-photo {
    height: 300px;
    object-position: 59% center;
  }
}
</style>
