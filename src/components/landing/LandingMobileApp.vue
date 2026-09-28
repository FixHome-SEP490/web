<script setup lang="ts">
import { ref } from 'vue';
import {
  Bell,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Download,
  QrCode,
  Smartphone,
  Star,
  CheckCircle2,
  X,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const showQrModal = ref(false);

const appFeatures = [
  {
    icon: Bell,
    title: 'Thông báo cập nhật tức thời',
    desc: 'Nhận thông báo ngay khi kỹ thuật viên nhận đơn, xuất phát và gửi bảng báo giá chi tiết.',
  },
  {
    icon: MapPin,
    title: 'Theo dõi lộ trình theo thời gian thực',
    desc: 'Xem vị trí di chuyển của thợ trên bản đồ, chủ động khung giờ mở cửa đón tiếp.',
  },
  {
    icon: MessageSquare,
    title: 'Nhắn tin & gửi ảnh trực tiếp',
    desc: 'Dễ dàng trao đổi triệu chứng thiết bị, gửi thêm hình ảnh hoặc video cận cảnh sự cố.',
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
        <!-- LEFT COLUMN: Content, Features & Download CTAs -->
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

          <!-- Download Action Buttons -->
          <div class="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <FhButton size="lg" class="shadow-sm hover:shadow-md transition-shadow flex items-center justify-center gap-2.5" @click="showQrModal = true">
              <Download :size="18" aria-hidden="true" />
              <span>Tải ứng dụng ngay</span>
            </FhButton>

            <!-- Store Badges -->
            <div class="flex items-center gap-3">
              <!-- App Store Button -->
              <button
                type="button"
                class="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-ink-900 hover:bg-black text-white transition-colors shadow-xs"
                @click="showQrModal = true"
                aria-label="Tải về trên App Store"
              >
                <!-- Apple SVG -->
                <svg class="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.56.64-.97 1.7-0.85 2.72.99.08 1.97-.47 2.58-1.22z"/>
                </svg>
                <div class="text-left leading-tight">
                  <span class="block text-[10px] text-ink-300 font-medium uppercase tracking-wider">Tải trên</span>
                  <span class="block text-xs font-bold">App Store</span>
                </div>
              </button>

              <!-- Google Play Button -->
              <button
                type="button"
                class="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-ink-900 hover:bg-black text-white transition-colors shadow-xs"
                @click="showQrModal = true"
                aria-label="Tải về trên Google Play"
              >
                <!-- Play Store SVG -->
                <svg class="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186c-.328-.276-.52-.693-.52-1.186V3c0-.493.192-.91.519-1.186zm11.233 11.234l2.128 2.128-11.8 6.772 9.672-8.9zm0-2.096l-9.672-8.9 11.8 6.772-2.128 2.128zm1.096 1.048l2.951-1.694c.828-.475.828-1.25 0-1.725L15.938 8.6l-1.42 1.42 1.42 1.42v-.444z"/>
                </svg>
                <div class="text-left leading-tight">
                  <span class="block text-[10px] text-ink-300 font-medium uppercase tracking-wider">Tải trên</span>
                  <span class="block text-xs font-bold">Google Play</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Rating & Trust Note -->
          <div class="mt-6 flex items-center gap-4 text-xs text-ink-600">
            <div class="flex items-center gap-1 text-amber-500 font-bold">
              <Star :size="15" class="fill-current" />
              <Star :size="15" class="fill-current" />
              <Star :size="15" class="fill-current" />
              <Star :size="15" class="fill-current" />
              <Star :size="15" class="fill-current" />
              <span class="text-ink-800 ml-1 font-num text-sm">4.9/5</span>
            </div>
            <span class="text-ink-300">|</span>
            <span>Hơn 10.000+ lượt tải và tin dùng</span>
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

    <!-- QR CODE DOWNLOAD MODAL -->
    <div
      v-if="showQrModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-xs"
      @click.self="showQrModal = false"
    >
      <div class="relative w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-6 shadow-(--shadow-e3) text-center">
        <button
          type="button"
          class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-ink-50 text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors"
          @click="showQrModal = false"
          aria-label="Đóng modal"
        >
          <X :size="18" />
        </button>

        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-3">
          <QrCode :size="28" />
        </div>

        <h3 class="text-lg font-bold text-ink-900">Tải ứng dụng FixHome</h3>
        <p class="mt-1 text-xs text-ink-600">
          Quét mã QR bằng camera điện thoại để tải ứng dụng trực tiếp cho hệ điều hành iOS hoặc Android.
        </p>

        <!-- Simulated Authentic QR code container -->
        <div class="my-5 mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border-2 border-brand-100 bg-brand-50/40 p-3 shadow-inner">
          <div class="relative flex h-full w-full items-center justify-center rounded-xl bg-white p-2 shadow-xs border border-ink-100">
            <!-- SVG QR Code pattern -->
            <svg class="h-full w-full" viewBox="0 0 100 100" fill="none">
              <!-- Corner markers -->
              <rect x="5" y="5" width="25" height="25" rx="4" stroke="#2563EB" stroke-width="4"/>
              <rect x="11" y="11" width="13" height="13" rx="2" fill="#2563EB"/>
              
              <rect x="70" y="5" width="25" height="25" rx="4" stroke="#2563EB" stroke-width="4"/>
              <rect x="76" y="11" width="13" height="13" rx="2" fill="#2563EB"/>
              
              <rect x="5" y="70" width="25" height="25" rx="4" stroke="#2563EB" stroke-width="4"/>
              <rect x="11" y="76" width="13" height="13" rx="2" fill="#2563EB"/>

              <!-- Grid pattern dots -->
              <rect x="36" y="8" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="48" y="8" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="40" y="20" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="52" y="20" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              
              <rect x="8" y="40" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="20" y="40" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="14" y="52" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              
              <rect x="36" y="36" width="28" height="28" rx="6" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
              <!-- Center Logo initial -->
              <path d="M45 43h10v3h-7v3h6v3h-6v5h-3v-14z" fill="#2563EB"/>

              <rect x="72" y="40" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="84" y="40" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="78" y="52" width="6" height="6" rx="1.5" fill="#1E40AF"/>

              <rect x="38" y="72" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="50" y="72" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="62" y="72" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="78" y="78" width="14" height="14" rx="3" fill="#2563EB"/>
              <rect x="44" y="84" width="6" height="6" rx="1.5" fill="#1E40AF"/>
              <rect x="56" y="84" width="6" height="6" rx="1.5" fill="#1E40AF"/>
            </svg>
          </div>
        </div>

        <div class="flex items-center justify-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 py-2 px-3 rounded-lg border border-brand-100">
          <Smartphone :size="16" />
          <span>Hỗ trợ iOS 15+ & Android 10+</span>
        </div>

        <div class="mt-4">
          <FhButton variant="secondary" block size="sm" @click="showQrModal = false">
            Đóng
          </FhButton>
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
