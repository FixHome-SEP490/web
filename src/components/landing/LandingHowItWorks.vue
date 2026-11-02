<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowRight, ClipboardList, Search, Send, ReceiptText } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();

const steps = [
  {
    icon: ClipboardList,
    title: 'Gửi yêu cầu sửa chữa',
    description: 'Chọn dịch vụ, mô tả tình trạng, địa chỉ và thời gian phù hợp.',
  },
  {
    icon: Search,
    title: 'Xem kỹ thuật viên phù hợp',
    description: 'Sau khi gửi yêu cầu, xem danh sách kỹ thuật viên phù hợp.',
  },
  {
    icon: Send,
    title: 'Chọn 1 hoặc 2 kỹ thuật viên',
    description: 'Chọn theo thứ tự ưu tiên rồi gửi lời mời. Người thứ hai là dự phòng nếu người đầu từ chối hoặc hết hạn phản hồi.',
  },
  {
    icon: ReceiptText,
    title: 'Theo dõi đơn và báo giá',
    description: 'Khi kỹ thuật viên nhận việc, theo dõi đơn. Nếu cần khảo sát, duyệt báo giá trước khi sửa.',
  },
];
</script>

<template>
  <section id="how-it-works" class="landing-section bg-ink-25/60" aria-labelledby="steps-title">
    <div class="landing-container">
      <div class="grid gap-5 sm:grid-cols-[1.1fr_0.9fr] sm:items-end sm:gap-10">
        <div class="max-w-[700px]">
          <p class="landing-eyebrow">Cách hoạt động</p>
          <h2 id="steps-title" class="steps-title">Sửa chữa đơn giản, từng bước rõ ràng</h2>
        </div>
        <p class="max-w-[58ch] text-base leading-7 text-ink-600 sm:justify-self-end">
          Sau khi tạo yêu cầu, bạn chọn và gửi lời mời tới kỹ thuật viên phù hợp. Đơn sửa chữa được tạo khi kỹ thuật viên nhận việc.
        </p>
      </div>

      <ol class="steps-grid mt-9 lg:mt-12" aria-label="Quy trình đặt lịch và sửa chữa">
        <li v-for="(step, index) in steps" :key="step.title" class="step-item">
          <div class="flex items-center gap-3">
            <span class="step-number" aria-hidden="true">0{{ index + 1 }}</span>
            <component :is="step.icon" :size="21" class="text-brand-600" aria-hidden="true" />
          </div>
          <h3 class="mt-5 text-base font-semibold leading-6 text-ink-900 sm:text-[17px]">
            {{ step.title }}
          </h3>
          <p class="mt-2 text-[15px] leading-6 text-ink-600">
            {{ step.description }}
          </p>
        </li>
      </ol>

      <div class="mt-8 lg:mt-10">
        <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/app/bookings/new')">
          Bắt đầu đặt lịch ngay
          <ArrowRight :size="18" aria-hidden="true" />
        </FhButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.steps-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.85rem, 3vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
}

.steps-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
}

.step-item {
  min-width: 0;
  padding-top: 18px;
  border-top: 1px solid var(--color-ink-300);
}

.step-number {
  color: var(--color-brand-600);
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

@media (min-width: 640px) {
  .steps-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 36px 24px;
  }
}

@media (min-width: 1280px) {
  .steps-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 32px;
  }
}
</style>
