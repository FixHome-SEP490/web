<script setup lang="ts">
import { Bell, History, MessageSquare, Smartphone } from 'lucide-vue-next';

const appFeatures = [
  {
    icon: Bell,
    title: 'Theo dõi yêu cầu trong từng đơn',
    description: 'Xem trạng thái và thông tin liên quan đến yêu cầu.',
  },
  {
    icon: MessageSquare,
    title: 'Trao đổi với kỹ thuật viên',
    description: 'Nhắn tin và gửi ảnh trong cuộc trò chuyện.',
  },
  {
    icon: History,
    title: 'Xem lại lịch sử sửa chữa',
    description: 'Tìm lại thông tin của những đơn đã hoàn tất.',
  },
];
</script>

<template>
  <section id="mobile-app" class="landing-section bg-ink-25/60" aria-labelledby="app-section-title">
    <div class="landing-container grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
      <div class="mobile-intro max-w-[650px]">
        <div class="mobile-icon" aria-hidden="true">
          <Smartphone :size="58" :stroke-width="1.5" />
        </div>
        <p class="landing-eyebrow mt-6">Trong ứng dụng FixHome</p>
        <h2 id="app-section-title" class="app-title">Theo dõi việc sửa chữa trên điện thoại.</h2>
        <p class="landing-description max-w-[58ch]">
          Xem trạng thái yêu cầu, trao đổi với kỹ thuật viên và tìm lại thông tin trong từng đơn.
        </p>
      </div>

      <ol class="app-flow" aria-label="Việc bạn có thể làm trong ứng dụng FixHome">
        <li v-for="item in appFeatures" :key="item.title" class="app-flow-step">
          <div class="app-flow-icon" aria-hidden="true">
            <component :is="item.icon" :size="21" :stroke-width="1.8" />
          </div>
          <h3 class="text-base font-semibold leading-6 text-ink-900 sm:text-[17px]">{{ item.title }}</h3>
          <p class="text-[15px] leading-6 text-ink-600">{{ item.description }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.mobile-icon {
  display: flex;
  width: 104px;
  height: 104px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-brand-50);
  color: var(--color-brand-600);
}

.app-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.9rem, 3.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
}

.app-flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-flow-step {
  position: relative;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 4px 16px;
  align-items: start;
  min-width: 0;
}

.app-flow-step:not(:last-child)::after {
  position: absolute;
  top: 44px;
  bottom: -20px;
  left: 21px;
  width: 2px;
  background: var(--color-brand-200);
  content: '';
}

.app-flow-icon {
  position: relative;
  z-index: 1;
  grid-row: span 2;
  display: flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-brand-100);
  border-radius: 9999px;
  background: var(--color-brand-50);
  color: var(--color-brand-600);
}

@media (min-width: 1280px) {
  .app-flow {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
  }

  .app-flow-step {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .app-flow-step:not(:last-child)::after {
    top: 21px;
    right: -24px;
    bottom: auto;
    left: 52px;
    width: auto;
    height: 2px;
  }
}
</style>
