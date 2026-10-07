<script setup lang="ts">
import {
  Bell,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
} from 'lucide-vue-next';

const appFeatures = [
  {
    icon: Bell,
    title: 'Thông báo theo tiến độ đơn',
    desc: 'Nhận thông báo khi kỹ thuật viên nhận đơn, xuất phát và gửi báo giá.',
  },
  {
    icon: MapPin,
    title: 'Theo dõi lộ trình theo thời gian thực',
    desc: 'Xem vị trí di chuyển của thợ trên bản đồ, chủ động khung giờ mở cửa đón tiếp.',
  },
  {
    icon: MessageSquare,
    title: 'Nhắn tin & gửi ảnh trực tiếp',
    desc: 'Trao đổi triệu chứng thiết bị và gửi thêm hình ảnh sự cố cho kỹ thuật viên.',
  },
  {
    icon: ShieldCheck,
    title: 'Bảo hành & hóa đơn điện tử',
    desc: 'Tự động lưu trữ lịch sử sửa chữa, hóa đơn minh bạch và tra cứu bảo hành chỉ với một chạm.',
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
            Dù bạn đang làm việc tại văn phòng hay đang di chuyển, ứng dụng FixHome giúp bạn quản lý toàn bộ
            quá trình sửa chữa trong nhà chỉ với chiếc điện thoại.
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

          <!-- Floating Badge 1 (Top Left) -->
          <div
            class="hidden sm:flex absolute -top-4 -left-4 z-20 items-center gap-2.5 rounded-xl border border-ink-200/90 bg-white/95 px-3.5 py-2.5 shadow-(--shadow-e2) backdrop-blur-md"
          >
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 :size="18" aria-hidden="true" />
            </div>
            <div>
              <span class="block text-xs font-bold text-ink-900">Đồng bộ đa nền tảng</span>
              <span class="block text-[11px] text-ink-500">Web Client & Mobile App</span>
            </div>
          </div>

          <!-- Floating Badge 2 (Bottom Right) -->
          <div
            class="hidden sm:flex absolute -bottom-4 right-2 z-20 items-center gap-2.5 rounded-xl border border-brand-200 bg-white/95 px-3.5 py-2.5 shadow-(--shadow-e2) backdrop-blur-md"
          >
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Smartphone :size="18" aria-hidden="true" />
            </div>
            <div>
              <span class="block text-xs font-bold text-ink-900">Thông báo & Định vị GPS</span>
              <span class="block text-[11px] text-brand-700 font-semibold">Theo dõi thợ trực tiếp</span>
            </div>
          </div>
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
