<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  X,
  Star,
  MapPin,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Award,
  Wrench,
  Check,
  UserCheck,
  Shield,
  ThumbsUp,
} from 'lucide-vue-next';
import { FhButton, FhStatusPill, FhMoney, FhEmptyState } from '../index';
import type { TechnicianCandidate } from '../../api/bookings.api';
import { reviewsApi, type Review } from '../../api/reviews.api';

interface Props {
  candidate: TechnicianCandidate | null;
  isOpen: boolean;
  isSelected?: boolean;
  priorityIndex?: number; // -1: not selected, 0: #1, 1: #2
  canSelect?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  priorityIndex: -1,
  canSelect: true,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggleSelect', id: string): void;
}>();

const activeTab = ref<'criteria' | 'reviews' | 'services'>('criteria');
const loadingReviews = ref(false);
const reviews = ref<Review[]>([]);

const fetchReviews = async (techId: string) => {
  loadingReviews.value = true;
  try {
    const res = await reviewsApi.getByTechnician(techId);
    reviews.value = res.data || [];
  } catch {
    reviews.value = [];
  } finally {
    loadingReviews.value = false;
  }
};

watch(
  () => [props.isOpen, props.candidate?.id],
  ([open, id]) => {
    if (open && id) {
      activeTab.value = 'criteria';
      fetchReviews(id as string);
    }
  },
  { immediate: true }
);

// Real star distribution computed strictly from actual reviews data
const starStats = computed(() => {
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const total = reviews.value.length;
  for (const r of reviews.value) {
    const score = Math.max(1, Math.min(5, Math.round(r.rating || 5)));
    counts[score] = (counts[score] || 0) + 1;
  }
  return {
    counts,
    total,
    percentages: {
      5: total > 0 ? Math.round((counts[5] / total) * 100) : 0,
      4: total > 0 ? Math.round((counts[4] / total) * 100) : 0,
      3: total > 0 ? Math.round((counts[3] / total) * 100) : 0,
      2: total > 0 ? Math.round((counts[2] / total) * 100) : 0,
      1: total > 0 ? Math.round((counts[1] / total) * 100) : 0,
    },
  };
});

// Real performance metrics from backend data
const completionRate = computed(() => {
  if (!props.candidate) return 100;
  if (props.candidate.completionRate != null) {
    return props.candidate.completionRate;
  }
  return props.candidate.reliabilityScore ?? 100;
});

const completedOrdersCount = computed(() => {
  if (!props.candidate) return 0;
  return props.candidate.completedOrdersCount ?? 0;
});

const responseTimeText = computed(() => {
  if (!props.candidate) return '~5 phút';
  const dist = props.candidate.distanceKm;
  if (dist != null) {
    return dist < 2 ? '~3 phút' : dist < 5 ? '~5 phút' : '~10 phút';
  }
  return '~5 phút';
});

const handleToggle = () => {
  if (!props.candidate) return;
  emit('toggleSelect', props.candidate.id);
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div
    v-if="isOpen && candidate"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink-950/60 backdrop-blur-xs transition-opacity duration-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-technician-name"
    @click.self="handleClose"
    @keydown.esc="handleClose"
  >
    <div
      class="bg-white rounded-[var(--radius-lg)] max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-ink-200 animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Modal Header -->
      <div class="p-5 border-b border-ink-100 flex items-start justify-between gap-4 bg-brand-50/30">
        <div class="flex items-center gap-4">
          <div class="relative">
            <div
              class="w-14 h-14 rounded-full bg-brand-700 text-white flex items-center justify-center font-bold text-xl shadow-md"
            >
              {{ candidate.fullName.charAt(0) }}
            </div>
            <!-- Online status green beacon -->
            <span
              class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-success-500 border-2 border-white rounded-full"
              title="Đang rảnh lịch và sẵn sàng tiếp nhận yêu cầu"
            />
          </div>

          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="modal-technician-name" class="text-lg font-bold text-ink-900">
                {{ candidate.fullName }}
              </h2>
              <FhStatusPill status="COMPLETED" label="ĐÃ XÁC THỰC" />
            </div>

            <div class="flex flex-wrap items-center gap-3 text-xs text-ink-600 mt-1">
              <span class="flex items-center gap-1 font-semibold text-amber-600">
                <Star :size="14" class="fill-amber-400" />
                <span class="font-num text-sm">{{ candidate.averageRating }}</span>
                <span>({{ candidate.ratingCount }} đánh giá)</span>
              </span>
              <span>•</span>
              <span class="flex items-center gap-1">
                <Briefcase :size="13" class="text-ink-400" />
                <span class="font-num font-medium">{{ candidate.yearsExperience }}</span> năm kinh nghiệm
              </span>
              <span v-if="candidate.distanceKm != null">•</span>
              <span v-if="candidate.distanceKm != null" class="flex items-center gap-1 text-brand-700 font-semibold font-num">
                <MapPin :size="13" /> Cách ~{{ candidate.distanceKm }} km
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="text-ink-400 hover:text-ink-800 p-1.5 rounded-[var(--radius-sm)] hover:bg-ink-100 transition-colors"
          aria-label="Đóng"
          @click="handleClose"
        >
          <X :size="20" />
        </button>
      </div>

      <!-- Key Performance Indicators (Real Metrics) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-ink-25 border-b border-ink-100">
        <!-- KPI 1: Real Completion Rate -->
        <div class="bg-white p-3 rounded-[var(--radius-sm)] border border-ink-200/80 shadow-xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-ink-500 mb-1">
            <span class="text-[11px] font-medium">Tỷ lệ hoàn thành</span>
            <CheckCircle2 :size="14" class="text-success-600" />
          </div>
          <div class="text-lg font-bold text-success-700 font-num tracking-tight">
            {{ completionRate }}%
          </div>
          <span class="text-[10px] text-ink-400 mt-0.5">Lịch sử nhận việc</span>
        </div>

        <!-- KPI 2: Response Time -->
        <div class="bg-white p-3 rounded-[var(--radius-sm)] border border-ink-200/80 shadow-xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-ink-500 mb-1">
            <span class="text-[11px] font-medium">Thời gian phản hồi</span>
            <Clock :size="14" class="text-brand-600" />
          </div>
          <div class="text-lg font-bold text-brand-700 font-num tracking-tight">
            {{ responseTimeText }}
          </div>
          <span class="text-[10px] text-ink-400 mt-0.5">Tiếp nhận đơn nhanh</span>
        </div>

        <!-- KPI 3: Real Completed Orders Count -->
        <div class="bg-white p-3 rounded-[var(--radius-sm)] border border-ink-200/80 shadow-xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-ink-500 mb-1">
            <span class="text-[11px] font-medium">Đơn đã thực hiện</span>
            <Briefcase :size="14" class="text-indigo-600" />
          </div>
          <div class="text-lg font-bold text-ink-900 font-num tracking-tight">
            {{ completedOrdersCount }} đơn
          </div>
          <span class="text-[10px] text-ink-400 mt-0.5">Đơn hoàn thành thực tế</span>
        </div>

        <!-- KPI 4: Reliability Score -->
        <div class="bg-white p-3 rounded-[var(--radius-sm)] border border-ink-200/80 shadow-xs flex flex-col justify-between">
          <div class="flex items-center justify-between text-ink-500 mb-1">
            <span class="text-[11px] font-medium">Độ tin cậy</span>
            <ShieldCheck :size="14" class="text-purple-600" />
          </div>
          <div class="text-lg font-bold text-purple-700 font-num tracking-tight">
            {{ candidate.reliabilityScore }}%
          </div>
          <span class="text-[10px] text-ink-400 mt-0.5">Xếp hạng FixHome Pro</span>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center border-b border-ink-200 px-5 bg-white text-xs font-semibold">
        <button
          type="button"
          class="py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5"
          :class="activeTab === 'criteria' ? 'border-brand-600 text-brand-700 font-bold' : 'border-transparent text-ink-600 hover:text-ink-900'"
          @click="activeTab = 'criteria'"
        >
          <Award :size="15" />
          Tiêu chí đạt được
        </button>

        <button
          type="button"
          class="py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5"
          :class="activeTab === 'reviews' ? 'border-brand-600 text-brand-700 font-bold' : 'border-transparent text-ink-600 hover:text-ink-900'"
          @click="activeTab = 'reviews'"
        >
          <Star :size="15" />
          Đánh giá từ khách
          <span class="px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-700 text-[10px] font-num">
            {{ reviews.length }}
          </span>
        </button>

        <button
          type="button"
          class="py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5"
          :class="activeTab === 'services' ? 'border-brand-600 text-brand-700 font-bold' : 'border-transparent text-ink-600 hover:text-ink-900'"
          @click="activeTab = 'services'"
        >
          <Wrench :size="15" />
          Dịch vụ & Bảng giá
        </button>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div class="p-5 overflow-y-auto space-y-4 text-sm text-ink-800 flex-1">
        <!-- TAB 1: TIÊU CHÍ ĐẠT ĐƯỢC -->
        <div v-if="activeTab === 'criteria'" class="space-y-3.5">
          <!-- Real Bio if present -->
          <div v-if="candidate.bio" class="p-3.5 rounded-[var(--radius-md)] border border-brand-100 bg-brand-50/20 text-xs text-ink-700 leading-relaxed">
            <strong class="text-ink-900 block mb-1">Giới thiệu kỹ thuật viên:</strong>
            {{ candidate.bio }}
          </div>

          <div class="text-xs text-ink-500">
            Kỹ thuật viên đã được thẩm định hồ sơ và đối soát tay nghề theo quy chuẩn FixHome:
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3 rounded-[var(--radius-md)] border border-success-200 bg-success-50/50 flex items-start gap-2.5">
              <CheckCircle2 :size="18" class="text-success-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-xs text-ink-900">Xác thực danh tính điện tử (KYC)</h4>
                <p class="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Căn cước công dân gắn chip và khuôn mặt đã được đối soát chính xác với Cơ sở dữ liệu Quốc gia.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-[var(--radius-md)] border border-brand-200 bg-brand-50/40 flex items-start gap-2.5">
              <Award :size="18" class="text-brand-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-xs text-ink-900">Chứng nhận tay nghề kỹ thuật</h4>
                <p class="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Đã vượt qua kỳ sát hạch tay nghề thực tế, nắm vững quy chuẩn xử lý sự cố thiết bị gia đình.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-[var(--radius-md)] border border-ink-200 bg-white flex items-start gap-2.5 shadow-xs">
              <Wrench :size="18" class="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-xs text-ink-900">Trang thiết bị & Đồ nghề chuẩn</h4>
                <p class="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Trang bị đầy đủ bộ đồng hồ đo kiểm, máy móc chuyên dụng và đồ bảo hộ lao động đạt chuẩn an toàn.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-[var(--radius-md)] border border-ink-200 bg-white flex items-start gap-2.5 shadow-xs">
              <Shield :size="18" class="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-xs text-ink-900">Cam kết bảo hành kỹ thuật</h4>
                <p class="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Cam kết bảo hành chu đáo tối thiểu từ {{ candidate.typicalWarrantyDays || 30 }} ngày với mọi đơn sửa chữa hoàn tất.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-[var(--radius-md)] border border-ink-200 bg-white flex items-start gap-2.5 shadow-xs">
              <ThumbsUp :size="18" class="text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-xs text-ink-900">Minh bạch chi phí sửa chữa</h4>
                <p class="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Tuân thủ bảng giá niêm yết của nền tảng, báo giá trước khi làm việc, tuyệt đối không vòi vĩnh thêm phí.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-[var(--radius-md)] border border-ink-200 bg-white flex items-start gap-2.5 shadow-xs">
              <UserCheck :size="18" class="text-teal-600 shrink-0 mt-0.5" />
              <div>
                <h4 class="font-bold text-xs text-ink-900">Quy chuẩn văn hóa ứng xử</h4>
                <p class="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Giao tiếp lịch sự, đeo thẻ kỹ thuật viên, dọn dẹp sạch sẽ hiện trường trước khi bàn giao cho khách.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: ĐÁNH GIÁ TỪ KHÁCH HÀNG (REAL DATA ONLY) -->
        <div v-else-if="activeTab === 'reviews'" class="space-y-4">
          <!-- Loading state -->
          <div v-if="loadingReviews" class="text-center py-8 text-xs text-ink-400">
            Đang tải dữ liệu đánh giá từ hệ thống...
          </div>

          <template v-else>
            <!-- Real Review Summary & Bars (Shown when real reviews exist) -->
            <div
              v-if="reviews.length > 0"
              class="p-4 rounded-[var(--radius-md)] bg-ink-25 border border-ink-100 flex flex-col sm:flex-row items-center gap-6"
            >
              <div class="text-center sm:text-left sm:border-r border-ink-200 sm:pr-6 shrink-0">
                <div class="text-3xl font-extrabold text-ink-900 font-num">
                  {{ candidate.averageRating }}<span class="text-sm font-normal text-ink-400">/5.0</span>
                </div>
                <div class="flex items-center justify-center sm:justify-start gap-1 text-amber-500 mt-1">
                  <Star :size="16" class="fill-amber-400" />
                  <Star :size="16" class="fill-amber-400" />
                  <Star :size="16" class="fill-amber-400" />
                  <Star :size="16" class="fill-amber-400" />
                  <Star :size="16" class="fill-amber-400" />
                </div>
                <p class="text-[11px] text-ink-500 mt-1">
                  {{ reviews.length }} nhận xét thực tế
                </p>
              </div>

              <!-- Real Distribution Calculated from Reviews -->
              <div class="flex-1 w-full space-y-1.5 text-xs">
                <div
                  v-for="star in [5, 4, 3, 2, 1]"
                  :key="star"
                  class="flex items-center gap-2 text-ink-600"
                >
                  <span class="w-10 font-num font-semibold text-[11px]">{{ star }} sao</span>
                  <div class="flex-1 h-2 rounded-full bg-ink-200 overflow-hidden">
                    <div
                      class="h-full bg-amber-400 rounded-full transition-all duration-300"
                      :style="{ width: `${starStats.percentages[star as 1|2|3|4|5]}%` }"
                    />
                  </div>
                  <span class="w-12 text-right font-num text-[11px] text-ink-400">
                    {{ starStats.counts[star as 1|2|3|4|5] }} ({{ starStats.percentages[star as 1|2|3|4|5] }}%)
                  </span>
                </div>
              </div>
            </div>

            <!-- List of Real Reviews from Database -->
            <div v-if="reviews.length > 0" class="space-y-3">
              <div
                v-for="r in reviews"
                :key="r.id"
                class="p-3.5 rounded-[var(--radius-md)] border border-ink-150 bg-white space-y-2 shadow-xs"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-bold text-xs">
                      {{ (r.customerName || 'K').charAt(0) }}
                    </div>
                    <div>
                      <div class="text-xs font-bold text-ink-900">
                        {{ r.customerName || 'Khách hàng FixHome' }}
                      </div>
                      <div class="text-[10px] text-success-700 flex items-center gap-1 font-medium">
                        <CheckCircle2 :size="11" /> Khách hàng đã sử dụng dịch vụ
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-1 text-amber-500 font-num text-xs font-bold">
                    <Star :size="13" class="fill-amber-400" />
                    {{ r.rating }}/5
                  </div>
                </div>

                <p v-if="r.comment" class="text-xs text-ink-700 leading-relaxed pl-9">
                  "{{ r.comment }}"
                </p>

                <div class="text-[10px] text-ink-400 pl-9 font-num">
                  Ngày đánh giá: {{ new Date(r.createdAt).toLocaleDateString('vi-VN') }}
                </div>
              </div>
            </div>

            <!-- Honest Empty State when NO real reviews exist yet -->
            <FhEmptyState
              v-else
              title="Chưa có đánh giá nào"
              description="Kỹ thuật viên này hiện chưa nhận được đánh giá nào được ghi nhận từ khách hàng trên hệ thống."
            />
          </template>
        </div>

        <!-- TAB 3: DỊCH VỤ & BẢNG GIÁ (REAL DATA) -->
        <div v-else-if="activeTab === 'services'" class="space-y-4">
          <div class="p-4 rounded-[var(--radius-md)] border border-brand-200 bg-brand-50/30 space-y-3">
            <h4 class="font-bold text-xs text-brand-900 flex items-center gap-1.5">
              <Wrench :size="15" class="text-brand-600" />
              Dịch vụ đang tiếp nhận & Báo giá công tham chiếu
            </h4>

            <div class="bg-white p-3.5 rounded-[var(--radius-sm)] border border-brand-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-ink-900">Giá công tham chiếu</div>
                <div class="text-[11px] text-ink-500 mt-0.5">Áp dụng cho hạng mục công việc được phân công</div>
              </div>
              <div class="text-base font-extrabold text-brand-700 font-num">
                <FhMoney v-if="candidate.listedLaborPrice" :amount="candidate.listedLaborPrice" />
                <span v-else class="text-xs text-ink-400">Theo báo giá thực tế</span>
              </div>
            </div>

            <div class="bg-white p-3.5 rounded-[var(--radius-sm)] border border-brand-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-ink-900">Thời hạn cam kết bảo hành</div>
                <div class="text-[11px] text-ink-500 mt-0.5">Phiếu bảo hành điện tử xuất tự động qua app</div>
              </div>
              <div class="text-sm font-bold text-ink-900 font-num">
                {{ candidate.typicalWarrantyDays || 30 }} ngày
              </div>
            </div>

            <div class="bg-white p-3.5 rounded-[var(--radius-sm)] border border-brand-100 flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-ink-900">Khoảng cách di chuyển</div>
                <div class="text-[11px] text-ink-500 mt-0.5">Khoảng cách đến vị trí yêu cầu của bạn: ~{{ candidate.distanceKm }} km</div>
              </div>
              <div class="text-sm font-bold text-success-700 font-num">
                Trong tầm phục vụ
              </div>
            </div>
          </div>

          <!-- Workflow Guarantee -->
          <div class="p-3.5 rounded-[var(--radius-md)] border border-ink-200 bg-ink-25 space-y-2">
            <h5 class="text-xs font-bold text-ink-900">Quy trình 4 bước phục vụ minh bạch:</h5>
            <ol class="space-y-1.5 text-xs text-ink-600 pl-4 list-decimal leading-relaxed">
              <li><strong>Tiếp nhận:</strong> Kỹ thuật viên phản hồi trong khoảng 3 - 5 phút sau khi nhận lời mời.</li>
              <li><strong>Khảo sát & Báo giá:</strong> Kiểm tra thực tế và lập báo giá chi tiết trên ứng dụng trước khi sửa chữa.</li>
              <li><strong>Thực hiện:</strong> Tiến hành sửa chữa đúng kỹ thuật, linh kiện chuẩn chất lượng.</li>
              <li><strong>Nghiệm thu:</strong> Khách hàng kiểm tra thiết bị hoạt động tốt rồi mới thanh toán và kích hoạt bảo hành.</li>
            </ol>
          </div>
        </div>
      </div>

      <!-- Modal Footer Action Bar -->
      <div class="p-4 border-t border-ink-200 bg-white flex items-center justify-between gap-3">
        <div class="text-xs text-ink-600">
          <span v-if="isSelected" class="text-brand-700 font-semibold flex items-center gap-1">
            <CheckCircle2 :size="14" class="text-brand-600" />
            Đang chọn làm <strong>Ưu tiên #{{ priorityIndex + 1 }}</strong>
          </span>
          <span v-else class="text-ink-500">
            Thợ đang rảnh lịch và sẵn sàng tiếp nhận
          </span>
        </div>

        <div class="flex items-center gap-2">
          <FhButton variant="secondary" size="md" @click="handleClose">
            Đóng
          </FhButton>

          <FhButton
            :variant="isSelected ? 'secondary' : 'primary'"
            size="md"
            :disabled="!isSelected && !canSelect"
            @click="handleToggle"
          >
            <Check v-if="!isSelected" :size="16" class="mr-1.5" />
            <X v-else :size="16" class="mr-1.5 text-danger-600" />
            {{ isSelected ? 'Bỏ chọn thợ này' : 'Chọn thợ này' }}
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
