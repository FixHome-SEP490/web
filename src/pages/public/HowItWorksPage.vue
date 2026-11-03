<script setup lang="ts">
import type { Component } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  ClipboardList,
  ReceiptText,
  ShieldCheck,
  Users,
} from 'lucide-vue-next';
import { FhButton } from '../../components';

const router = useRouter();

type Step = {
  number: string;
  icon: Component;
  kicker: string;
  title: string;
  description: string;
  note?: string;
  details?: {
    summary: string;
    body: string;
  };
};

const steps: Step[] = [
  {
    number: '01',
    icon: ClipboardList,
    kicker: 'Gửi yêu cầu',
    title: 'Mô tả sự cố',
    description: 'Chọn dịch vụ hoặc nhờ AI gợi ý, thêm ảnh và chọn giờ hẹn.',
    note: 'AI chỉ gợi ý, không thay kỹ thuật viên kiểm tra.',
  },
  {
    number: '02',
    icon: Users,
    kicker: 'Chọn kỹ thuật viên',
    title: 'Chọn tối đa 2 thợ',
    description: 'Xem thợ phù hợp, chọn 1–2 người theo thứ tự ưu tiên.',
    note: 'Đơn tạo khi thợ nhận việc.',
  },
  {
    number: '03',
    icon: ReceiptText,
    kicker: 'Duyệt chi phí',
    title: 'Duyệt báo giá trước khi sửa',
    description: 'Thợ khảo sát, báo giá tách tiền công và linh kiện. Chi phí phát sinh cần bạn đồng ý.',
    details: {
      summary: 'Giá cố định?',
      body: 'Tiền công hiển thị từ trước; không cần báo giá khảo sát.',
    },
  },
  {
    number: '04',
    icon: ShieldCheck,
    kicker: 'Hoàn tất',
    title: 'Thanh toán và bảo hành',
    description: 'Thanh toán theo hóa đơn; bảo hành theo hạng mục trên đơn.',
    details: {
      summary: 'Bảo hành gồm gì?',
      body: 'Thời hạn và phạm vi phụ thuộc hạng mục, linh kiện và thông tin đơn hoàn tất.',
    },
  },
];

function startBooking() {
  void router.push('/app/bookings/new');
}
</script>

<template>
  <div class="how-page">
    <section class="how-hero" aria-labelledby="how-title">
      <div class="how-shell how-hero__grid">
        <div class="how-hero__copy">
          <p class="how-eyebrow">
            <span class="how-eyebrow__dot" aria-hidden="true"></span>
            Cách hoạt động
          </p>

          <h1 id="how-title" class="how-hero__title">
            Từ mô tả sự cố<br />
            <span>đến khi sửa xong.</span>
          </h1>

          <p class="how-hero__lead">
            Mô tả sự cố, chọn kỹ thuật viên và duyệt chi phí trước khi sửa.
          </p>

          <div class="how-hero__actions">
            <FhButton
              size="lg"
              class="w-full sm:w-auto"
              data-testid="how-booking-cta"
              @click="startBooking"
            >
              Đặt lịch sửa chữa
              <ArrowRight :size="18" aria-hidden="true" />
            </FhButton>
            <router-link to="/services" class="how-text-link">
              Xem dịch vụ và giá
              <ArrowRight :size="17" aria-hidden="true" />
            </router-link>
          </div>

          <dl class="how-hero__facts">
            <div>
              <dt>4 bước</dt>
              <dd>rõ ràng</dd>
            </div>
            <div>
              <dt>Tối đa 2</dt>
              <dd>kỹ thuật viên</dd>
            </div>
            <div>
              <dt>Duyệt chi phí</dt>
              <dd>trước khi sửa</dd>
            </div>
          </dl>
        </div>

        <figure class="how-hero__media">
          <div class="how-hero__image-frame">
            <img
              :src="'/images/technician-home-1280.webp'"
              :srcset="'/images/technician-home-640.webp 640w, /images/technician-home-1280.webp 1280w'"
              sizes="(min-width: 1024px) 46vw, calc(100vw - 32px)"
              width="1536"
              height="1024"
              fetchpriority="high"
              alt="Minh họa kỹ thuật viên kiểm tra máy lạnh tại nhà"
              class="how-hero__image"
            />
          </div>
        </figure>
      </div>
    </section>

    <section class="how-journey" aria-labelledby="how-journey-title">
      <div class="how-shell how-journey__inner">
        <div class="how-section-head">
          <p class="how-eyebrow">Quy trình 4 bước</p>
          <h2 id="how-journey-title">Từ yêu cầu đến hoàn tất.</h2>
        </div>

        <ol class="how-steps" aria-label="Các bước đặt lịch và sửa chữa">
          <li v-for="step in steps" :key="step.number" class="how-step">
            <span class="how-step__number" aria-hidden="true">{{ step.number }}</span>

            <div class="how-step__content">
              <div class="how-step__topline">
                <span class="how-step__kicker">{{ step.kicker }}</span>
                <component
                  :is="step.icon"
                  :size="20"
                  :stroke-width="1.8"
                  class="how-step__icon"
                  aria-hidden="true"
                />
              </div>
              <h3 class="how-step__title">{{ step.title }}</h3>
              <p class="how-step__description">{{ step.description }}</p>
            </div>

            <div class="how-step__note">
              <p v-if="step.note">{{ step.note }}</p>
              <details v-else-if="step.details" class="how-step__details">
                <summary>{{ step.details.summary }}</summary>
                <p>{{ step.details.body }}</p>
              </details>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <section class="how-cta" aria-labelledby="how-cta-title">
      <div class="how-shell how-cta__inner">
        <div class="how-cta__copy">
          <p class="how-cta__eyebrow">Sẵn sàng?</p>
          <h2 id="how-cta-title">Mô tả sự cố, phần còn lại có FixHome.</h2>
        </div>

        <div class="how-cta__actions">
          <FhButton
            variant="secondary"
            size="lg"
            class="w-full sm:w-auto"
            data-testid="how-final-booking-cta"
            @click="startBooking"
          >
            Đặt lịch sửa chữa
            <ArrowRight :size="18" aria-hidden="true" />
          </FhButton>
          <router-link to="/track" class="how-cta__link">
            Đã có đơn? Tra cứu tiến độ
          </router-link>
          <span class="how-cta__note">Đăng nhập để theo dõi đơn.</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.how-page {
  color: var(--color-ink-900);
  overflow-wrap: anywhere;
}

.how-shell {
  width: min(calc(100% - 48px), 1520px);
  margin-inline: auto;
}

.how-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  color: var(--color-brand-700);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1.4;
  text-transform: uppercase;
}

.how-eyebrow__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--color-brand-600);
}

/* Hero */
.how-hero {
  background: white;
  padding: 72px 0 88px;
}

.how-hero__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
  align-items: center;
  gap: clamp(40px, 5vw, 80px);
}

.how-hero__copy {
  min-width: 0;
  max-width: 660px;
}

.how-hero__title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(2.4rem, 4.2vw, 4.05rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1.06;
  text-wrap: balance;
}

.how-hero__title span {
  color: var(--color-brand-600);
}

.how-hero__lead {
  max-width: 56ch;
  margin: 22px 0 0;
  color: var(--color-ink-600);
  font-size: 16px;
  line-height: 1.7;
  text-wrap: pretty;
}

.how-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  margin-top: 30px;
}

.how-text-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 7px;
  color: var(--color-brand-700);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: color 160ms ease;
}

.how-text-link svg {
  transition: transform 160ms ease;
}

.how-text-link:hover {
  color: var(--color-brand-800);
  text-decoration: underline;
  text-underline-offset: 4px;
}

.how-text-link:hover svg {
  transform: translateX(3px);
}

.how-hero__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 32px;
  margin: 34px 0 0;
  padding: 20px 0 0;
  border-top: 1px solid var(--color-ink-200);
}

.how-hero__facts div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.how-hero__facts dt {
  color: var(--color-brand-700);
  font-family: var(--font-num);
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.how-hero__facts dd {
  margin: 0;
  color: var(--color-ink-600);
  font-size: 12px;
  line-height: 1.5;
}

.how-hero__media {
  min-width: 0;
  margin: 0;
}

.how-hero__image-frame {
  overflow: hidden;
  border-radius: 24px;
  background: var(--color-ink-100);
}

.how-hero__image {
  display: block;
  width: 100%;
  height: clamp(340px, 36vw, 540px);
  object-fit: cover;
  object-position: 58% center;
}

/* Journey */
.how-journey {
  padding: 88px 0;
  border-block: 1px solid var(--color-ink-200);
  background: var(--color-ink-25);
}

.how-journey__inner {
  max-width: 1360px;
}

.how-section-head h2 {
  max-width: 760px;
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(2rem, 3.2vw, 2.8rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.12;
  text-wrap: balance;
}

.how-steps {
  position: relative;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;
}

.how-steps::before {
  position: absolute;
  top: 64px;
  bottom: 64px;
  left: 32px;
  width: 1px;
  background: var(--color-ink-300);
  content: '';
}

.how-step {
  position: relative;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) minmax(260px, 320px);
  gap: 36px;
  align-items: start;
  padding: 40px 0;
  border-top: 1px solid var(--color-ink-200);
}

.how-step:last-child {
  border-bottom: 1px solid var(--color-ink-200);
}

.how-step__number {
  position: relative;
  z-index: 1;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid var(--color-brand-200);
  border-radius: 50%;
  background: var(--color-ink-25);
  color: var(--color-brand-700);
  font-family: var(--font-num);
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.how-step__content {
  min-width: 0;
  padding-top: 3px;
}

.how-step__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.how-step__kicker {
  color: var(--color-brand-700);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  line-height: 1.4;
  text-transform: uppercase;
}

.how-step__icon {
  flex: 0 0 auto;
  color: var(--color-brand-600);
}

.how-step__title {
  max-width: 24ch;
  margin: 10px 0 0;
  color: var(--color-ink-900);
  font-size: clamp(1.25rem, 1.7vw, 1.6rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.3;
  text-wrap: balance;
}

.how-step__description {
  max-width: 66ch;
  margin: 12px 0 0;
  color: var(--color-ink-600);
  font-size: 16px;
  line-height: 1.7;
  text-wrap: pretty;
}

.how-step__note {
  min-width: 0;
  margin-top: 4px;
  padding-left: 18px;
  border-left: 2px solid var(--color-brand-200);
  color: var(--color-ink-600);
  font-size: 14px;
  line-height: 1.65;
}

.how-step__note p {
  margin: 0;
  text-wrap: pretty;
}

.how-step__details summary {
  cursor: pointer;
  color: var(--color-brand-700);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.how-step__details summary:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.how-step__details p {
  margin-top: 8px;
  color: var(--color-ink-600);
  font-size: 13px;
  line-height: 1.6;
}

/* Final CTA */
.how-cta {
  padding: 64px 0;
  background: var(--color-brand-700);
  color: white;
}

.how-cta__inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 40px;
}

.how-cta__eyebrow {
  margin: 0 0 12px;
  color: rgb(255 255 255 / 82%);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1.4;
  text-transform: uppercase;
}

.how-cta h2 {
  max-width: 760px;
  margin: 0;
  color: white;
  font-size: clamp(1.9rem, 3vw, 2.7rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.12;
  text-wrap: balance;
}

.how-cta__actions {
  display: flex;
  min-width: 240px;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.how-cta__link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: rgb(255 255 255 / 90%);
  font-size: 14px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.how-cta__link:hover {
  color: white;
}

.how-cta__note {
  color: rgb(255 255 255 / 78%);
  font-size: 12px;
  line-height: 1.5;
}

/* Focus */
.how-page :is(a, button, summary):focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 4px;
}

.how-cta :is(a, button, summary):focus-visible {
  outline-color: white;
}

/* Responsive */
@media (max-width: 1199px) {
  .how-hero__grid {
    gap: 40px;
  }

  .how-step {
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 28px;
  }

  .how-step__note {
    grid-column: 2;
    margin-top: 0;
  }
}

@media (max-width: 899px) {
  .how-hero {
    padding: 52px 0 64px;
  }

  .how-hero__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
  }

  .how-hero__copy {
    max-width: 720px;
  }

  .how-hero__image {
    height: clamp(280px, 48vw, 420px);
  }

  .how-journey {
    padding: 64px 0;
  }

  .how-steps {
    margin-top: 36px;
  }

  .how-cta__inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
  }

  .how-cta__actions {
    min-width: 0;
  }
}

@media (max-width: 767px) {
  .how-shell {
    width: calc(100% - 32px);
  }

  .how-hero {
    padding: 40px 0 52px;
  }

  .how-hero__title {
    font-size: clamp(2.25rem, 9.5vw, 3.1rem);
  }

  .how-hero__lead {
    margin-top: 18px;
    font-size: 15px;
  }

  .how-hero__actions {
    margin-top: 24px;
  }

  .how-hero__facts {
    gap: 14px 24px;
    margin-top: 26px;
  }

  .how-hero__image {
    height: 280px;
  }

  .how-journey {
    padding: 52px 0;
  }

  .how-section-head h2 {
    font-size: clamp(1.8rem, 7vw, 2.2rem);
  }

  .how-steps {
    margin-top: 28px;
  }

  .how-steps::before {
    top: 48px;
    bottom: 48px;
    left: 24px;
  }

  .how-step {
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 20px;
    padding: 28px 0;
  }

  .how-step__number {
    width: 48px;
    height: 48px;
    font-size: 16px;
  }

  .how-step__content {
    padding-top: 2px;
  }

  .how-step__title {
    max-width: none;
    margin-top: 8px;
    font-size: 20px;
  }

  .how-step__description {
    margin-top: 10px;
    font-size: 15px;
    line-height: 1.65;
  }

  .how-step__note {
    grid-column: 2;
    margin-top: 4px;
    padding-left: 14px;
  }

  .how-step__note p {
    font-size: 13px;
  }

  .how-cta {
    padding: 48px 0;
  }

  .how-cta__actions {
    align-items: stretch;
  }

  .how-cta__link {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .how-hero__facts {
    gap: 12px 20px;
  }

  .how-hero__facts dt {
    font-size: 17px;
  }

  .how-hero__facts dd {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .how-page *,
  .how-page *::before,
  .how-page *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
