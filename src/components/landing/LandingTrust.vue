<script setup lang="ts">
import { ArrowRight, ShieldCheck, Award, Star, History } from 'lucide-vue-next';

const trustPillars = [
  {
    icon: ShieldCheck,
    title: 'Xác minh danh tính & chứng chỉ (KYC)',
    description:
      'Hồ sơ căn cước, lý lịch và chứng chỉ kỹ thuật được đội ngũ FixHome kiểm duyệt nghiêm ngặt trước khi kích hoạt.',
  },
  {
    icon: Award,
    title: 'Đúng chuyên môn theo từng loại thiết bị',
    description:
      'Hệ thống điều phối chính xác kỹ thuật viên có kinh nghiệm chuyên sâu về hãng máy và sự cố của bạn.',
  },
  {
    icon: Star,
    title: 'Đánh giá thực tế từ khách hàng',
    description:
      'Chỉ khách hàng có đơn sửa chữa đã hoàn tất mới được đánh giá, giúp bạn an tâm về thái độ và tay nghề.',
  },
  {
    icon: History,
    title: 'Cam kết bảo hành sau sửa chữa',
    description:
      'Bảo hành công việc rõ ràng sau khi nghiệm thu. Hỗ trợ kiểm tra lại nếu vấn đề tương tự phát sinh.',
  },
];
</script>

<template>
  <section id="trust" class="landing-section bg-ink-50 border-b border-ink-100" aria-labelledby="trust-title">
    <div class="landing-container grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <!-- Content Column (Left): Eyebrow, Title, Pillars, Link -->
      <div>
        <p class="landing-eyebrow">An tâm khi mở cửa đón thợ</p>
        <h2 id="trust-title" class="trust-title">
          Đúng người thực hiện.
          <br />
          Đúng chuẩn tay nghề.
        </h2>
        <p class="landing-description mt-3">
          Tại FixHome, an toàn và sự an tâm của gia đình bạn luôn được đặt lên hàng đầu trong mỗi lượt phục vụ.
        </p>

        <ul class="mt-8 space-y-6">
          <li v-for="item in trustPillars" :key="item.title" class="flex items-start gap-4">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-ink-200/80 text-brand-600 shadow-2xs">
              <component :is="item.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
            </div>
            <div>
              <h3 class="text-base font-semibold text-ink-900">{{ item.title }}</h3>
              <p class="mt-1 text-sm leading-6 text-ink-600">{{ item.description }}</p>
            </div>
          </li>
        </ul>

        <div class="mt-8 pt-4 border-t border-ink-200/60">
          <router-link to="/for-technicians" class="landing-text-link">
            Bạn là kỹ thuật viên? Tìm hiểu cách gia nhập FixHome
            <ArrowRight :size="18" aria-hidden="true" />
          </router-link>
        </div>
      </div>

      <!-- Visual Column (Right): Image with Trust Floating Card -->
      <div class="relative">
        <figure class="overflow-hidden rounded-2xl bg-white shadow-sm border border-ink-200/80">
          <img
            :src="'/images/technician-home-640.webp'"
            :srcset="'/images/technician-home-640.webp 640w, /images/technician-home-1280.webp 1280w'"
            sizes="(min-width: 1024px) 560px, calc(100vw - 32px)"
            width="1536"
            height="1024"
            loading="lazy"
            decoding="async"
            alt="Minh họa kỹ thuật viên kiểm tra thiết bị với trang phục chỉnh tề"
            class="aspect-[4/3] w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
          />
        </figure>

        <!-- Floating Trust Badge -->
        <div
          class="relative mx-4 -mt-10 flex items-start gap-3.5 rounded-xl border border-ink-200/80 bg-white p-4.5 shadow-(--shadow-e2) sm:mx-6"
        >
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ShieldCheck :size="24" aria-hidden="true" />
          </div>
          <div>
            <p class="text-sm font-semibold text-ink-900">Kỹ thuật viên đã xác minh</p>
            <p class="mt-0.5 text-xs text-ink-600">
              Công nghệ kết nối người phù hợp. Con người mang đến sự an tâm và tay nghề chuẩn mực.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.trust-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .trust-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .trust-title {
    font-size: 34px;
  }
}
</style>
