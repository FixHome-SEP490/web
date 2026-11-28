<script setup lang="ts">
import { ArrowRight, ShieldCheck, ShieldPlus, Star, Users } from 'lucide-vue-next';

const trustPillars = [
  {
    icon: ShieldCheck,
    title: 'Kỹ thuật viên được xác minh',
    description: 'Hồ sơ và kỹ năng chuyên môn được xem xét trước khi nhận việc.',
  },
  {
    icon: Star,
    title: 'Đánh giá từ khách hàng',
    description: 'Chia sẻ trải nghiệm sau khi hoàn tất dịch vụ sửa chữa.',
  },
  {
    icon: ShieldPlus,
    title: 'Thông tin bảo hành rõ ràng',
    description: 'Tra cứu điều kiện và gửi yêu cầu bảo hành ngay trong đơn.',
  },
];
</script>

<template>
  <section
    id="trust"
    class="trust-section relative overflow-x-clip bg-white py-14 sm:py-16 lg:py-20"
    aria-labelledby="trust-title"
  >
    <div class="landing-container">
      <!-- Top 2-Column Grid: Image on Left, Benefits on Right -->
      <div
        class="grid grid-cols-1 items-center gap-9 md:grid-cols-12 md:gap-8 lg:gap-12 xl:gap-16"
      >
        <!-- Left Column: Official Image with Tilted Pale-Blue Backdrop -->
        <div class="md:col-span-5 lg:col-span-5 xl:col-span-5">
          <div class="trust-media-wrap relative mx-auto w-full max-w-[460px] p-2.5 sm:p-3.5 md:max-w-none">
            <div
              class="trust-media-backdrop pointer-events-none absolute inset-3 rounded-[26px] bg-[#E8F1FF]"
              aria-hidden="true"
            />
            <div
              class="trust-photo-frame relative z-10 overflow-hidden rounded-[22px] bg-slate-100 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
            >
              <img
                :src="'/images/trust-technician-consult.webp'"
                width="1024"
                height="682"
                loading="lazy"
                decoding="async"
                alt="Kỹ thuật viên FixHome tư vấn trực tiếp cho khách hàng tại nhà"
                class="trust-photo block h-full w-full object-cover select-none"
              />
            </div>
          </div>
        </div>

        <!-- Right Column: Eyebrow, Heading, Intro & 3 Vertical Benefits -->
        <div class="min-w-0 md:col-span-7 lg:col-span-7 xl:col-span-7">
          <div
            class="inline-flex items-center gap-1.5 rounded-full border border-brand-100/90 bg-[#EFF6FF] px-3.5 py-1 text-xs font-semibold text-brand-700 sm:text-[13px]"
          >
            <ShieldCheck :size="15" :stroke-width="1.8" class="shrink-0 text-brand-600" aria-hidden="true" />
            <span>Vì sao chọn FixHome?</span>
          </div>

          <h2 id="trust-title" class="trust-title mt-4">
            An tâm từ lúc đặt lịch đến khi <span class="text-brand-600">sửa xong.</span>
          </h2>

          <p class="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-ink-600 sm:text-base">
            Chủ động theo dõi thông tin và quá trình sửa chữa thiết bị ngay tại nhà.
          </p>

          <ul class="mt-6 divide-y divide-slate-200/80 sm:mt-7" aria-label="Lợi ích khi chọn FixHome">
            <li
              v-for="(item, index) in trustPillars"
              :key="item.title"
              class="flex items-start gap-4 py-4 sm:gap-4.5 sm:py-[18px]"
              :class="[index === 0 ? 'pt-0' : '', index === trustPillars.length - 1 ? 'pb-0' : '']"
            >
              <span
                class="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-100/80 bg-[#EFF6FF] text-brand-600"
                aria-hidden="true"
              >
                <component :is="item.icon" :size="20" :stroke-width="1.75" />
              </span>
              <div class="min-w-0">
                <h3 class="text-[15.5px] font-bold leading-snug text-ink-900 sm:text-[16.5px]">
                  {{ item.title }}
                </h3>
                <p class="mt-1 text-[13.5px] leading-relaxed text-ink-600 sm:text-[14.5px]">
                  {{ item.description }}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom Horizontal Technician CTA Banner -->
      <div
        class="mt-8 flex flex-col justify-between gap-4 rounded-[20px] border border-blue-100/90 bg-[#F4F8FF] px-5 py-4 sm:mt-10 sm:flex-row sm:items-center sm:gap-6 sm:px-7 sm:py-5 lg:mt-12"
      >
        <div class="flex min-w-0 items-start gap-3.5 sm:items-center sm:gap-4">
          <span
            class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-100/80 bg-[#E8F1FF] text-brand-600 sm:h-12 sm:w-12"
            aria-hidden="true"
          >
            <Users :size="22" :stroke-width="1.75" />
          </span>
          <div class="min-w-0">
            <h3 class="text-base font-bold leading-snug text-ink-900 sm:text-[17px]">
              Bạn là kỹ thuật viên?
            </h3>
            <p class="mt-0.5 text-[13.5px] leading-relaxed text-ink-600 sm:text-sm">
              Kết nối với khách hàng và phát triển công việc cùng FixHome.
            </p>
          </div>
        </div>

        <router-link
          to="/for-technicians"
          class="trust-cta-button group inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand-600 px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[var(--shadow-e1)] transition-colors duration-150 hover:bg-brand-700 active:bg-brand-800 sm:w-auto"
        >
          <span>Gia nhập FixHome</span>
          <ArrowRight
            :size="16"
            :stroke-width="1.75"
            class="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </router-link>
      </div>
    </div>
  </section>
</template>

<style scoped>
.trust-section {
  scroll-margin-top: 80px;
}

.trust-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.65rem, 2.75vw, 2.35rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.18;
  text-wrap: balance;
}

.trust-media-backdrop {
  transform: rotate(-7deg);
  transform-origin: center center;
}

.trust-photo-frame {
  aspect-ratio: 1.14 / 1;
}

.trust-photo {
  object-position: 48% 22%;
}

@media (max-width: 767px) {
  .trust-photo-frame {
    aspect-ratio: 4 / 3;
  }
}

.trust-section :is(a, button):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 3px;
}
</style>
