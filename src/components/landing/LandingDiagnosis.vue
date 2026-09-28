<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Sparkles,
  ArrowRight,
  Camera,
  Cpu,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  Wrench,
} from 'lucide-vue-next';
import FhButton from '../FhButton.vue';

const router = useRouter();
const activeStage = ref(0);
const diagnosisSection = ref<HTMLElement | null>(null);

const stages = [
  {
    id: 0,
    title: 'Gửi ảnh hoặc mô tả triệu chứng',
    subtitle: 'Không cần kiến thức kỹ thuật',
    desc: 'Chỉ cần chụp lại thiết bị hoặc gõ vài dòng ngắn về hiện tượng bất thường bạn quan sát được.',
  },
  {
    id: 1,
    title: 'AI nhận diện thiết bị & phân tích',
    subtitle: 'Xử lý sơ bộ tức thì',
    desc: 'Hệ thống đối chiếu cơ sở dữ liệu triệu chứng phổ biến để nhận diện loại thiết bị và bất thường.',
  },
  {
    id: 2,
    title: 'Khoanh vùng nguyên nhân có thể gặp',
    subtitle: 'Tránh suy đoán mơ hồ',
    desc: 'Gợi ý các nguyên nhân tiềm ẩn giúp bạn có thêm thông tin tham khảo trước khi trao đổi với thợ.',
  },
  {
    id: 3,
    title: 'Gợi ý dịch vụ & kỹ thuật viên',
    subtitle: 'Đúng việc, đúng chuyên môn',
    desc: 'Tự động gợi ý gói dịch vụ và kỹ thuật viên chuyên trách, kèm khoảng giá tham khảo rõ ràng.',
  },
];

let observer: IntersectionObserver | null = null;

onMounted(() => {
  // Support scroll-driven storytelling on desktop
  const checkpoints = diagnosisSection.value?.querySelectorAll<HTMLElement>('[data-ai-checkpoint]');
  if (checkpoints && checkpoints.length > 0) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-ai-checkpoint'));
            if (!isNaN(index)) {
              activeStage.value = index;
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '-20% 0px -40% 0px',
        threshold: 0.2,
      },
    );

    checkpoints.forEach((cp) => observer?.observe(cp));
  }
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <section
    id="ai"
    ref="diagnosisSection"
    class="landing-section bg-white"
    aria-labelledby="ai-title"
  >
    <div class="landing-container">
      <!-- Section Header -->
      <div class="max-w-2xl">
        <p class="landing-eyebrow">Thêm thông tin, bớt băn khoăn</p>
        <h2 id="ai-title" class="ai-section-title">
          Chưa rõ hỏng ở đâu?
          <br class="hidden sm:block" />
          Để AI hỗ trợ phân tích bước đầu.
        </h2>
        <p class="landing-description">
          Chỉ cần ảnh chụp thiết bị hoặc vài dòng mô tả, FixHome sẽ hỗ trợ nhận biết sơ bộ nguyên nhân
          và gợi ý dịch vụ phù hợp nhất.
        </p>
      </div>

      <!-- Storytelling Grid: Left Sticky Mockup, Right Story Steps -->
      <div class="mt-12 grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <!-- LEFT: Interactive Sticky AI Mock Interface -->
        <div class="lg:sticky lg:top-28">
          <div class="rounded-2xl border border-ink-200/80 bg-ink-25/50 p-4 sm:p-6 shadow-sm">
            <!-- Mock App Window -->
            <div class="rounded-xl border border-ink-200/80 bg-white p-5 sm:p-6 shadow-(--shadow-e1)">
              <!-- Mock Header -->
              <div class="flex items-center justify-between border-b border-ink-100 pb-4">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Sparkles :size="18" aria-hidden="true" />
                  </div>
                  <div>
                    <span class="block text-sm font-semibold text-ink-900">Phân tích sơ bộ bằng AI</span>
                    <span class="block text-[11px] text-ink-500">FixHome Smart Assistant</span>
                  </div>
                </div>

                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
                  :class="[
                    activeStage === 1
                      ? 'bg-amber-50 text-amber-700 animate-pulse'
                      : 'bg-brand-50 text-brand-700'
                  ]"
                >
                  {{
                    activeStage === 0
                      ? 'Bước 1/4'
                      : activeStage === 1
                      ? 'Đang xử lý...'
                      : activeStage === 2
                      ? 'Đã có kết quả'
                      : 'Đề xuất dịch vụ'
                  }}
                </span>
              </div>

              <!-- DYNAMIC STAGE CONTENT -->
              <div class="min-h-[260px] py-4 transition-all duration-300">
                <!-- Stage 0: Input/Upload state -->
                <div v-if="activeStage === 0" class="stage-pane space-y-4">
                  <div class="rounded-lg border border-dashed border-ink-300 bg-ink-25 p-4 text-center">
                    <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Camera :size="20" aria-hidden="true" />
                    </div>
                    <p class="mt-2 text-xs font-semibold text-ink-800">Ảnh thiết bị đã tải lên (1 ảnh)</p>
                    <p class="mt-0.5 text-[11px] text-ink-500">may_lanh_panasonic.jpg · 1.4 MB</p>
                  </div>

                  <div class="rounded-lg bg-ink-50/70 p-3.5 border border-ink-100">
                    <span class="text-xs font-medium text-ink-500">Mô tả của khách hàng:</span>
                    <p class="mt-1 text-sm font-medium text-ink-900">
                      “Máy lạnh chạy nhưng không mát sâu, thỉnh thoảng có tiếng rè rè và nhỏ vài giọt nước ở góc.”
                    </p>
                  </div>
                </div>

                <!-- Stage 1: Processing state -->
                <div v-else-if="activeStage === 1" class="stage-pane space-y-4">
                  <div class="flex items-center gap-3 rounded-lg bg-brand-50/70 p-4 border border-brand-100">
                    <Cpu :size="24" class="text-brand-600 animate-spin" aria-hidden="true" />
                    <div>
                      <p class="text-sm font-semibold text-brand-900">Đang đối chiếu dữ liệu kỹ thuật...</p>
                      <p class="text-xs text-brand-700">Phân tích hình ảnh dàn lạnh và biểu hiện chảy nước</p>
                    </div>
                  </div>

                  <div class="space-y-2 pt-2">
                    <div class="flex items-center justify-between text-xs text-ink-600">
                      <span>Nhận diện thiết bị</span>
                      <span class="font-medium text-ink-900">Máy lạnh treo tường Inverter</span>
                    </div>
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div class="h-full w-4/5 rounded-full bg-brand-600 transition-all duration-500"></div>
                    </div>
                    <p class="text-[11px] text-ink-500">Trích xuất dấu hiệu: nghẽn máng nước, bụi màng lọc</p>
                  </div>
                </div>

                <!-- Stage 2: Possible Causes state -->
                <div v-else-if="activeStage === 2" class="stage-pane space-y-3.5">
                  <div class="rounded-lg bg-amber-50/80 p-3 border border-amber-200/60">
                    <div class="flex items-center gap-2 text-xs font-semibold text-amber-900">
                      <AlertCircle :size="16" class="text-amber-600 shrink-0" aria-hidden="true" />
                      Nguyên nhân tiềm ẩn phổ biến (tham khảo)
                    </div>
                  </div>

                  <ul class="space-y-2.5 text-xs sm:text-[13px] text-ink-700">
                    <li class="flex items-start gap-2.5 rounded-lg border border-ink-100 bg-white p-2.5 shadow-2xs">
                      <CheckCircle2 :size="16" class="mt-0.5 text-brand-600 shrink-0" aria-hidden="true" />
                      <div>
                        <span class="font-semibold text-ink-900">Tắc nghẽn máng thoát nước ngưng</span>
                        <p class="text-xs text-ink-500">Bụi bẩn tích tụ khiến nước tràn qua máng chảy ra ngoài.</p>
                      </div>
                    </li>
                    <li class="flex items-start gap-2.5 rounded-lg border border-ink-100 bg-white p-2.5 shadow-2xs">
                      <CheckCircle2 :size="16" class="mt-0.5 text-brand-600 shrink-0" aria-hidden="true" />
                      <div>
                        <span class="font-semibold text-ink-900">Lưới lọc bám bụi dày</span>
                        <p class="text-xs text-ink-500">Cản trở lưu thông gió, làm giảm hiệu suất làm lạnh.</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <!-- Stage 3: Suggested Service state -->
                <div v-else class="stage-pane space-y-3.5">
                  <div class="rounded-xl border border-brand-200 bg-brand-50/40 p-4 shadow-2xs">
                    <div class="flex items-center justify-between">
                      <span class="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        Dịch vụ gợi ý
                      </span>
                      <span class="text-xs font-semibold text-brand-700">Từ 150.000 ₫</span>
                    </div>

                    <h4 class="mt-2.5 text-sm sm:text-base font-bold text-ink-900">
                      Vệ sinh & bảo dưỡng máy lạnh treo tường
                    </h4>
                    <p class="mt-1 text-xs text-ink-600">
                      Bao gồm thông tắc ống thoát nước, xịt rửa dàn lạnh, dàn nóng và kiểm tra gas.
                    </p>

                    <div class="mt-3 flex items-center gap-4 text-[11px] text-ink-500 border-t border-brand-100 pt-2.5">
                      <span class="flex items-center gap-1">
                        <Clock :size="13" class="text-brand-600" aria-hidden="true" />
                        45 - 60 phút
                      </span>
                      <span class="flex items-center gap-1">
                        <Wrench :size="13" class="text-brand-600" aria-hidden="true" />
                        Bảo hành 30 ngày
                      </span>
                    </div>
                  </div>

                  <div class="pt-1">
                    <FhButton block size="sm" @click="router.push('/app/bookings/new')">
                      Đặt lịch dịch vụ này ngay
                      <ArrowRight :size="14" aria-hidden="true" />
                    </FhButton>
                  </div>
                </div>
              </div>

              <!-- AI DISCLAIMER PER ISSUE 05 -->
              <div class="mt-3 flex items-start gap-2.5 rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-600 border border-ink-100">
                <Info :size="16" class="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
                <p>
                  <strong class="font-medium text-ink-800">Lưu ý:</strong>
                  Kết quả AI chỉ mang tính tham khảo. Kỹ thuật viên sẽ kiểm tra và xác nhận tình trạng thực tế.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Interactive Story Steps / Checkpoints -->
        <div class="space-y-6 lg:space-y-8">
          <div
            v-for="(stage, idx) in stages"
            :key="stage.id"
            :data-ai-checkpoint="idx"
            class="group cursor-pointer rounded-xl border p-5 transition-all duration-300"
            :class="[
              activeStage === idx
                ? 'border-brand-600 bg-brand-50/30 shadow-xs ring-1 ring-brand-200'
                : 'border-ink-200/80 bg-white hover:border-brand-200 hover:bg-ink-25/50'
            ]"
            @click="activeStage = idx"
          >
            <div class="flex items-center justify-between">
              <span
                class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors"
                :class="activeStage === idx ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700'"
              >
                0{{ idx + 1 }}
              </span>
              <span class="text-xs font-medium text-ink-500">{{ stage.subtitle }}</span>
            </div>

            <h3
              class="mt-3 text-base sm:text-[17px] font-semibold transition-colors"
              :class="activeStage === idx ? 'text-brand-600 font-bold' : 'text-ink-900 group-hover:text-brand-600'"
            >
              {{ stage.title }}
            </h3>

            <p class="mt-2 text-sm leading-6 text-ink-600">
              {{ stage.desc }}
            </p>
          </div>

          <!-- UNIFIED CTA PER ISSUE 04 -->
          <div class="pt-4">
            <FhButton size="lg" class="w-full sm:w-auto" @click="router.push('/app/bookings/new')">
              <Sparkles :size="18" aria-hidden="true" />
              Phân tích sự cố bằng AI
              <ArrowRight :size="18" aria-hidden="true" />
            </FhButton>
            <p class="mt-3 text-xs leading-5 text-ink-500">
              Đăng nhập để sử dụng AI trong quá trình đặt lịch. Bạn luôn có thể chọn dịch vụ thủ công bất kỳ lúc nào.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-section-title {
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 700;
  text-wrap: balance;
  color: var(--color-ink-900);
}

@media (min-width: 640px) {
  .ai-section-title {
    font-size: 32px;
  }
}

@media (min-width: 1024px) {
  .ai-section-title {
    font-size: 34px;
  }
}

.stage-pane {
  animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-pane {
    animation: none !important;
  }
}
</style>
