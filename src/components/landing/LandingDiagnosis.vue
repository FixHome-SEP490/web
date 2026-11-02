<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ArrowRight, Sparkles } from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();

const stages = [
  {
    title: 'Mô tả sự cố',
    description: 'Mô tả dấu hiệu bạn thấy. Ảnh thiết bị không bắt buộc.',
  },
  {
    title: 'Trao đổi với trợ lý AI',
    description: 'Trợ lý có thể hỏi thêm để hiểu tình trạng thiết bị.',
  },
  {
    title: 'Nhận gợi ý ban đầu',
    description: 'AI nêu một số khả năng để bạn tham khảo, không kết luận nguyên nhân.',
  },
  {
    title: 'Tự chọn dịch vụ và tiếp tục đặt lịch',
    description: 'Bạn quyết định dịch vụ và gửi yêu cầu riêng khi sẵn sàng.',
  },
];
</script>

<template>
  <section id="ai" class="landing-section bg-white" aria-labelledby="ai-title">
    <div class="landing-container grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
      <div class="max-w-[620px]">
        <p class="landing-eyebrow">Khi chưa rõ nguyên nhân</p>
        <h2 id="ai-title" class="ai-section-title">
          Chưa rõ hỏng ở đâu?
          <span class="block text-brand-600">Để AI gợi ý bước đầu.</span>
        </h2>
        <p class="landing-description max-w-[60ch]">
          Mô tả dấu hiệu bạn thấy và trò chuyện với trợ lý AI để có thêm hướng tham khảo.
        </p>

        <div class="mt-6 border-l-2 border-brand-600 pl-4 sm:mt-7 sm:pl-5">
          <p class="text-base font-semibold leading-6 text-ink-900">AI chỉ đưa ra gợi ý ban đầu.</p>
          <p class="mt-2 text-[15px] leading-6 text-ink-600">
            Kỹ thuật viên kiểm tra thực tế. Nếu cần khảo sát, bạn duyệt báo giá trước khi sửa.
          </p>
        </div>

        <div class="mt-7">
          <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/app/bookings/ai')">
            <Sparkles :size="18" aria-hidden="true" />
            Phân tích sự cố bằng AI
            <ArrowRight :size="18" aria-hidden="true" />
          </FhButton>
        </div>
      </div>

      <ol class="ai-stages" aria-label="Các bước dùng trợ lý AI">
        <li v-for="(stage, index) in stages" :key="stage.title" class="ai-stage">
          <span class="ai-stage-number" aria-hidden="true">0{{ index + 1 }}</span>
          <div>
            <h3 class="text-base font-semibold leading-6 text-ink-900 sm:text-[17px]">{{ stage.title }}</h3>
            <p class="mt-1 text-[15px] leading-6 text-ink-600">{{ stage.description }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.ai-section-title {
  margin: 0;
  color: var(--color-ink-900);
  font-size: clamp(1.9rem, 3.2vw, 2.75rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.15;
  text-wrap: balance;
}

.ai-stages {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-ink-200);
}

.ai-stage {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  padding: 20px 0;
  border-bottom: 1px solid var(--color-ink-200);
}

.ai-stage-number {
  color: var(--color-brand-600);
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 700;
  line-height: 24px;
}

@media (min-width: 768px) {
  .ai-stage {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 20px;
    padding: 24px 0;
  }
}
</style>
