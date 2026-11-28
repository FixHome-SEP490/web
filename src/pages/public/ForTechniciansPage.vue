<script setup lang="ts">
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import {
  ArrowRight,
  Award,
  Briefcase,
  CalendarCheck,
  FileText,
  ShieldCheck,
  UserPlus,
  Wallet,
} from 'lucide-vue-next';

useSmoothScroll();

const benefits = [
  {
    icon: Wallet,
    title: 'Thu nhập xứng đáng',
    description:
      'Tỷ lệ hoa hồng hợp lý, nhận tiền công đầy đủ ngay sau khi khách hàng xác nhận hoàn tất đơn hàng.',
    tone: 'emerald' as const,
  },
  {
    icon: CalendarCheck,
    title: 'Chủ động thời gian',
    description:
      'Tự do bật/tắt chế độ “Đang nhận việc”, cài đặt lịch làm việc theo ngày trong tuần và đăng ký nghỉ phép linh hoạt.',
    tone: 'brand' as const,
  },
  {
    icon: Award,
    title: 'Đánh giá công bằng',
    description:
      'Điểm số uy tín và xếp hạng sao chỉ dựa trên đánh giá từ khách hàng thật của đơn hàng đã hoàn tất (D-09).',
    tone: 'amber' as const,
  },
];

const joinSteps = [
  { icon: UserPlus, label: 'Đăng ký tài khoản', accent: 'emerald' as const },
  { icon: FileText, label: 'Hoàn tất hồ sơ', accent: 'blue' as const },
  { icon: ShieldCheck, label: 'Quản trị viên duyệt hồ sơ', accent: 'blue' as const },
  { icon: Briefcase, label: 'Bật nhận việc và bắt đầu', accent: 'emerald' as const },
];
</script>

<template>
  <section
    class="tech-recruit-section relative overflow-x-clip py-10 sm:py-14 lg:py-16"
    aria-labelledby="tech-recruit-title"
  >
    <!-- Soft ambient backdrop highlights -->
    <div class="tech-ambient-glow tech-ambient-glow--left pointer-events-none" aria-hidden="true" />
    <div class="tech-ambient-glow tech-ambient-glow--right pointer-events-none" aria-hidden="true" />

    <div class="tech-container relative z-10 mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
      <!-- Top Showcase Grid: Intro + 3 Benefits on Left (8 cols), Technician Visual on Right (4 cols) -->
      <div class="grid grid-cols-1 items-center gap-7 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-7">
        <!-- A. Intro Header -->
        <div class="text-center lg:col-span-8 lg:row-start-1 lg:pt-2">
          <div class="inline-flex items-center justify-center gap-2.5">
            <img
              :src="'/logo.png'"
              width="44"
              height="44"
              alt="FixHome"
              class="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
            />
            <span class="text-2xl font-bold tracking-tight sm:text-[26px]">
              <span class="text-brand-600">Fix</span><span class="text-green-600">Home</span>
            </span>
          </div>

          <h1 id="tech-recruit-title" class="tech-hero-title mt-4">
            Hợp tác cùng nền tảng
            <span class="tech-brand-underline text-brand-600">FixHome</span>
          </h1>

          <p class="mx-auto mt-3.5 max-w-[54ch] text-[15px] leading-relaxed text-ink-600 sm:text-base">
            Nhận đơn hàng liên tục trong khu vực hoạt động của bạn, minh bạch thu nhập và được bảo vệ quyền lợi khi làm việc.
          </p>
        </div>

        <!-- Technician Visual: Mobile/Tablet appears right under Intro, Desktop spans right 4 cols -->
        <div class="lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:self-end">
          <div class="tech-visual-wrap relative mx-auto w-full max-w-[340px] sm:max-w-[390px] lg:max-w-none">
            <img
              :src="'/images/for-technicians-hero.webp'"
              width="554"
              height="576"
              loading="eager"
              decoding="async"
              alt="Kỹ thuật viên đối tác FixHome tự tin với đồng phục và huy hiệu FixHome"
              class="tech-visual-image block h-auto w-full rounded-3xl object-cover object-top select-none lg:rounded-none"
            />
          </div>
        </div>

        <!-- B. Three Benefits Cards -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:col-span-8 lg:row-start-2 lg:self-start">
          <article
            v-for="item in benefits"
            :key="item.title"
            class="tech-benefit-card relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-6"
          >
            <!-- Subtle colored corner accent matching each benefit -->
            <span
              class="tech-card-accent pointer-events-none"
              :class="{
                'tech-card-accent--emerald': item.tone === 'emerald',
                'tech-card-accent--brand': item.tone === 'brand',
                'tech-card-accent--amber': item.tone === 'amber',
              }"
              aria-hidden="true"
            />

            <div
              class="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-2xl border"
              :class="{
                'border-emerald-100 bg-emerald-50 text-emerald-600': item.tone === 'emerald',
                'border-brand-100 bg-brand-50 text-brand-600': item.tone === 'brand',
                'border-amber-100 bg-amber-50 text-amber-600': item.tone === 'amber',
              }"
              aria-hidden="true"
            >
              <component :is="item.icon" :size="23" :stroke-width="1.8" />
            </div>

            <h2 class="relative z-10 mt-4 text-lg font-bold leading-snug text-ink-900 sm:text-[19px]">
              {{ item.title }}
            </h2>

            <p class="relative z-10 mt-2 text-[14px] leading-relaxed text-ink-600">
              {{ item.description }}
            </p>
          </article>
        </div>
      </div>

      <!-- C. Join Process Banner (P4.3) -->
      <div
        class="tech-process-banner relative mt-8 overflow-hidden rounded-[24px] p-6 text-white shadow-[0_18px_40px_rgba(11,59,140,0.18)] sm:mt-10 sm:rounded-[28px] sm:p-8 lg:mt-8 lg:p-10"
      >
        <!-- Subtle FixHome green & light blue ambient corners -->
        <div class="tech-banner-green-glow pointer-events-none" aria-hidden="true" />
        <div class="tech-banner-blue-glow pointer-events-none" aria-hidden="true" />

        <div class="relative z-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-8">
          <!-- Left: Title, Verification Info & Register CTA -->
          <div class="lg:col-span-5">
            <div class="flex items-center gap-3">
              <span
                class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/20 text-emerald-300"
                aria-hidden="true"
              >
                <ShieldCheck :size="21" :stroke-width="1.85" />
              </span>
              <h2 class="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Quy trình gia nhập
              </h2>
            </div>

            <p class="mt-3.5 text-sm leading-relaxed text-blue-100/90 sm:text-[15px]">
              Để đảm bảo an toàn cho các hộ gia đình, kỹ thuật viên đăng ký tài khoản, hoàn tất hồ sơ, giấy tờ tùy thân và kỹ năng nhận sửa. Quản trị viên FixHome duyệt hồ sơ trước khi bạn được bật nhận việc.
            </p>

            <div class="mt-6">
              <router-link
                to="/register"
                class="tech-register-cta group inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold whitespace-nowrap text-ink-900 shadow-sm transition-all duration-150 hover:bg-brand-50 active:scale-[0.98] sm:w-auto sm:text-[15px]"
              >
                <span>Đăng ký tài khoản kỹ thuật viên</span>
                <ArrowRight
                  :size="17"
                  :stroke-width="1.85"
                  class="shrink-0 text-brand-600 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </router-link>
            </div>
          </div>

          <!-- Right: 4 Visual Connected Steps -->
          <div class="lg:col-span-7 lg:border-l lg:border-white/15 lg:pl-8">
            <ol
              class="grid grid-cols-2 gap-4 sm:flex sm:items-start sm:justify-between sm:gap-2"
              aria-label="4 bước quy trình gia nhập kỹ thuật viên FixHome"
            >
              <template v-for="(step, idx) in joinSteps" :key="step.label">
                <li class="flex flex-1 flex-col items-center text-center">
                  <div class="relative flex items-center justify-center">
                    <span
                      class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-inner backdrop-blur-xs sm:h-[60px] sm:w-[60px]"
                      aria-hidden="true"
                    >
                      <component
                        :is="step.icon"
                        :size="25"
                        :stroke-width="1.75"
                        :class="step.accent === 'emerald' ? 'text-emerald-300' : 'text-sky-200'"
                      />
                    </span>
                    <span
                      class="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[11px] font-bold text-slate-950 shadow-xs"
                      aria-hidden="true"
                    >
                      {{ idx + 1 }}
                    </span>
                  </div>
                  <p class="mt-3 max-w-[15ch] text-xs font-semibold leading-snug text-white sm:text-[13.5px]">
                    {{ step.label }}
                  </p>
                </li>

                <!-- Arrow Connector between steps on Tablet/Desktop -->
                <li
                  v-if="idx < joinSteps.length - 1"
                  class="hidden shrink-0 items-center pt-5 text-sky-200/75 sm:flex"
                  aria-hidden="true"
                >
                  <ArrowRight :size="18" :stroke-width="1.8" />
                </li>
              </template>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tech-recruit-section {
  background: linear-gradient(180deg, #eff5ff 0%, #f7faff 48%, #ffffff 100%);
}

.tech-ambient-glow {
  position: absolute;
  border-radius: 9999px;
}

.tech-ambient-glow--left {
  top: -120px;
  left: -140px;
  width: 440px;
  height: 440px;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, rgba(37, 99, 235, 0) 70%);
}

.tech-ambient-glow--right {
  top: 40px;
  right: -120px;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle, rgba(22, 163, 74, 0.07) 0%, rgba(22, 163, 74, 0) 70%);
}

.tech-hero-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.85rem, 3.4vw, 2.85rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  text-wrap: balance;
}

.tech-brand-underline {
  position: relative;
  display: inline-block;
}

.tech-brand-underline::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -4px;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(90deg, #22c55e 0%, #16a34a 70%, rgba(34, 197, 94, 0.25) 100%);
}

@media (min-width: 1024px) {
  .tech-visual-image {
    -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 13%, #000 100%),
      linear-gradient(to bottom, transparent 0%, #000 6%, #000 92%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-image: linear-gradient(to right, transparent 0%, #000 13%, #000 100%),
      linear-gradient(to bottom, transparent 0%, #000 6%, #000 92%, transparent 100%);
    mask-composite: intersect;
  }
}

.tech-card-accent {
  position: absolute;
  top: -28px;
  right: -28px;
  width: 112px;
  height: 112px;
  border-radius: 9999px;
  opacity: 0.55;
}

.tech-card-accent--emerald {
  background: radial-gradient(circle, rgba(16, 185, 129, 0.16) 0%, rgba(16, 185, 129, 0) 72%);
}

.tech-card-accent--brand {
  background: radial-gradient(circle, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0) 72%);
}

.tech-card-accent--amber {
  background: radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, rgba(245, 158, 11, 0) 72%);
}

.tech-process-banner {
  background: linear-gradient(125deg, #092d6e 0%, #0f48b2 58%, #155bd4 100%);
}

.tech-banner-green-glow {
  position: absolute;
  right: -60px;
  bottom: -90px;
  width: 320px;
  height: 240px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.42) 0%, rgba(22, 163, 74, 0) 72%);
}

.tech-banner-blue-glow {
  position: absolute;
  top: -80px;
  left: 32%;
  width: 280px;
  height: 200px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.18) 0%, rgba(96, 165, 250, 0) 70%);
}

.tech-register-cta:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .tech-benefit-card,
  .tech-register-cta,
  .tech-register-cta svg {
    transition: none !important;
  }
}
</style>
