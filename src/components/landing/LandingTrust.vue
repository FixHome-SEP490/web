<script setup lang="ts">
import { ArrowRight, ShieldCheck, Star, History } from 'lucide-vue-next';

const trustPillars = [
  {
    icon: ShieldCheck,
    title: 'Hồ sơ và kỹ năng được xem xét',
    description: 'Thông tin chuyên môn được kiểm tra trước khi kỹ thuật viên nhận việc.',
  },
  {
    icon: Star,
    title: 'Đánh giá sau đơn hoàn tất',
    description: 'Khách hàng có thể đánh giá sau khi đơn sửa chữa hoàn tất.',
  },
  {
    icon: History,
    title: 'Bảo hành theo thông tin đơn',
    description: 'Xem điều kiện áp dụng và gửi yêu cầu ngay trong đơn.',
  },
];
</script>

<template>
  <section id="trust" class="trust-section landing-section bg-brand-700 text-white" aria-labelledby="trust-title">
    <div class="landing-container">
      <div class="max-w-[760px]">
        <p class="trust-eyebrow">An tâm khi đặt dịch vụ</p>
        <h2 id="trust-title" class="trust-title">Thông tin rõ ràng để bạn chủ động</h2>
      </div>

      <ul class="trust-grid mt-8 lg:mt-10">
        <li v-for="item in trustPillars" :key="item.title" class="trust-item">
          <component :is="item.icon" :size="24" stroke-width="1.8" class="text-white" aria-hidden="true" />
          <div>
            <h3 class="text-base font-semibold leading-6 text-white sm:text-[17px]">{{ item.title }}</h3>
            <p class="mt-2 text-[15px] leading-6 text-white/85">{{ item.description }}</p>
          </div>
        </li>
      </ul>

      <router-link to="/for-technicians" class="trust-link mt-8 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold">
        Bạn là kỹ thuật viên? Gia nhập FixHome
        <ArrowRight :size="18" aria-hidden="true" />
      </router-link>
    </div>
  </section>
</template>

<style scoped>
.trust-section {
  scroll-margin-top: 80px;
}

.trust-eyebrow {
  margin: 0 0 12px;
  color: rgb(255 255 255 / 85%);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 20px;
}

.trust-title {
  margin: 0;
  color: white;
  font-size: clamp(1.9rem, 3.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
}

.trust-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin-bottom: 0;
  padding: 0;
  list-style: none;
}

.trust-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  padding: 20px 0;
  border-top: 1px solid rgb(255 255 255 / 25%);
}

.trust-link {
  color: white;
  text-underline-offset: 4px;
}

.trust-link:hover {
  text-decoration: underline;
}

.trust-section .trust-link:focus-visible {
  outline: 2px solid white;
  outline-offset: 4px;
}

@media (min-width: 768px) {
  .trust-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 28px;
  }

  .trust-item {
    grid-template-columns: 1fr;
    gap: 18px;
    padding: 24px 0 0;
  }
}
</style>
