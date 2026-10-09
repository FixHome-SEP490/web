<script setup lang="ts">
import {
  Bell,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Smartphone,
} from 'lucide-vue-next';

const appFeatures = [
  {
    icon: Bell,
    title: 'Thông báo theo tiến độ đơn',
    desc: 'Biết khi thợ nhận đơn, xuất phát và gửi báo giá.',
  },
  {
    icon: MapPin,
    title: 'Theo dõi lộ trình theo thời gian thực',
    desc: 'Xem thợ đang ở đâu để chủ động đón.',
  },
  {
    icon: MessageSquare,
    title: 'Nhắn tin & gửi ảnh trực tiếp',
    desc: 'Trao đổi và gửi ảnh cho kỹ thuật viên.',
  },
  {
    icon: ShieldCheck,
    title: 'Bảo hành & hóa đơn điện tử',
    desc: 'Lưu lịch sử sửa chữa, hoá đơn và bảo hành.',
  },
];
</script>

<template>
  <section
    id="mobile-app"
    class="landing-section bg-gradient-to-b from-white via-ink-25/50 to-white border-b border-ink-100 overflow-hidden"
    aria-labelledby="app-section-title"
  >
    <div class="landing-container">
      <div class="grid items-center gap-12 lg:grid-cols-[1.05fr_1.15fr] lg:gap-16">
        <!-- LEFT COLUMN: Content & Features -->
        <div class="max-w-xl">
          <div class="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700 border border-brand-200/60 mb-4">
            <Smartphone :size="15" class="text-brand-600" aria-hidden="true" />
            <span>Trải nghiệm di động mọi lúc, mọi nơi</span>
          </div>

          <h2 id="app-section-title" class="app-title">
            Chăm sóc ngôi nhà trong tầm tay.
            <br />
            <span class="text-brand-600">Tiện lợi hơn trên ứng dụng FixHome.</span>
          </h2>

          <p class="landing-description mt-3">
            Theo dõi đơn, nhắn tin với thợ và xem bảo hành ngay trên điện thoại.
          </p>

          <!-- 4 Features List -->
          <div class="mt-8 grid gap-5 sm:grid-cols-2">
            <div
              v-for="item in appFeatures"
              :key="item.title"
              class="flex items-start gap-3 rounded-xl border border-ink-200/70 bg-white p-3.5 shadow-2xs transition-shadow hover:shadow-xs"
            >
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <component :is="item.icon" :size="18" aria-hidden="true" />
              </div>
              <div>
                <h3 class="text-sm font-semibold text-ink-900 leading-snug">{{ item.title }}</h3>
                <p class="mt-1 text-xs text-ink-600 leading-relaxed">{{ item.desc }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: High-resolution Devices Mockup (Web Laptop + Mobile Phone) -->
        <div class="relative flex items-center justify-center">
          <!-- Ambient glowing backdrop -->
          <div
            class="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-brand-100/40 via-brand-50/20 to-emerald-50/30 blur-2xl"
            aria-hidden="true"
          ></div>

          <!-- Main Devices Image -->
          <figure class="relative z-10 w-full transition-transform duration-500 hover:scale-[1.01]">
            <img
              :src="'/images/fixhome-devices-mockup.png'"
              alt="Giao diện FixHome hiển thị đồng bộ trên màn hình Laptop và điện thoại iPhone"
              width="1024"
              height="768"
              loading="lazy"
              decoding="async"
              class="w-full h-auto object-contain drop-shadow-(--shadow-e3)"
            />
          </figure>

        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.app-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .app-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .app-title {
    font-size: 34px;
  }
}
</style>
